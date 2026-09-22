import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { randomBytes } from "crypto";
import { storage } from "./storage";
import { insertEventSchema, updateEventSchema, bookSeatSchema, updateSeatSchema, floorConfigSchema } from "@shared/schema";
import type { FloorConfig } from "@shared/schema";
import { z } from "zod";

// Admin passcode is loaded from env with a fallback to the original value so
// existing deployments keep working. To rotate, set ADMIN_PASSCODE in Replit
// Secrets and restart - all in-memory tokens will also be invalidated.
const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE || 'admin_fallback_secret';

// In-memory admin session tokens (issued on /api/admin/login)
const adminTokens = new Set<string>();

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization || req.headers.Authorization as string | undefined;
  if (!header || typeof header !== 'string') return null;
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function isAdminAuthorized(req: Request): boolean {
  // Bearer token issued by /api/admin/login is the only accepted credential
  const token = extractBearerToken(req);
  return !!(token && adminTokens.has(token));
}

// Express middleware: blocks request if not authenticated as admin
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!isAdminAuthorized(req)) {
    return res.status(401).json({ error: 'Admin authorization required' });
  }
  next();
}

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // Lightweight ETag for /api/seats — incremented on every seat mutation so
  // unchanged polls can return 304 instead of serialising 80+ seat objects.
  let seatsEtag = `"${Date.now()}"`;
  function bumpSeatsEtag() { seatsEtag = `"${Date.now()}"`; }

  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  function broadcast(data: any) {
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(data));
      }
    });
  }

  wss.on('connection', (ws) => {
    console.log('New WebSocket connection');
    ws.on('close', () => {
      console.log('WebSocket connection closed');
    });
  });

  // Initialize default event - safe to call multiple times (no-op if already exists)
  app.get('/api/initialize', async (req, res) => {
    try {
      let event = await storage.getEvent();
      if (!event) {
        event = await storage.createEvent({});
        await storage.generateSeats(event.id, event.floorConfigs as FloorConfig[]);
      } else {
        // If event exists but no seats yet (e.g. first deploy with new storage), generate them
        const seats = await storage.getSeats(event.id);
        if (seats.length === 0) {
          await storage.generateSeats(event.id, event.floorConfigs as FloorConfig[]);
        }
      }
      res.json({ success: true, event });
    } catch (error) {
      console.error('Initialize error:', error);
      res.status(500).json({ error: 'Failed to initialize event' });
    }
  });

  // Get event details
  app.get('/api/event', async (req, res) => {
    try {
      const event = await storage.getEvent();
      if (!event) return res.status(404).json({ error: 'Event not found' });
      res.json(event);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get event' });
    }
  });

  // Admin login - issues a session token (Bearer) used by frontend for all admin requests
  app.post('/api/admin/login', async (req, res) => {
    try {
      const { passcode } = req.body || {};
      if (passcode !== ADMIN_PASSCODE) {
        return res.status(401).json({ error: 'Invalid admin passcode' });
      }
      const token = randomBytes(32).toString('hex');
      adminTokens.add(token);
      res.json({ token, role: 'admin' });
    } catch (error) {
      res.status(500).json({ error: 'Login failed' });
    }
  });

  // Admin logout - revokes the bearer token
  app.post('/api/admin/logout', async (req, res) => {
    const token = extractBearerToken(req);
    if (token) adminTokens.delete(token);
    res.json({ success: true });
  });

  // Verify admin session (used by frontend on load to confirm token still valid)
  app.get('/api/admin/me', async (req, res) => {
    if (!isAdminAuthorized(req)) {
      return res.status(401).json({ role: 'user' });
    }
    res.json({ role: 'admin' });
  });

  // Update event details (non-layout fields)
  app.patch('/api/event', requireAdmin, async (req, res) => {
    try {
      const { passcode, ...updates } = req.body;
      const validatedUpdates = updateEventSchema.parse(updates);
      const event = await storage.updateEvent(validatedUpdates);
      broadcast({ type: 'EVENT_UPDATED', event });
      res.json(event);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update event' });
    }
  });

  // Update a single floor's config (rows + seatsPerRow) - regenerates only that floor
  app.patch('/api/event/floors/:floor', requireAdmin, async (req, res) => {
    try {
      const { passcode, ...body } = req.body;
      const floorNum = parseInt(req.params.floor);
      if (isNaN(floorNum) || floorNum < 1) {
        return res.status(400).json({ error: 'Invalid floor number' });
      }
      const { numRows, seatsPerRow, aislePositions, tierZones } = floorConfigSchema.parse(body);
      const event = await storage.getEvent();
      if (!event) return res.status(404).json({ error: 'Event not found' });

      // Update floorConfigs
      const configs: FloorConfig[] = (event.floorConfigs as FloorConfig[]) || [];
      const existing = configs.find(c => c.floor === floorNum);
      const newConfig: FloorConfig = { floor: floorNum, numRows, seatsPerRow, aislePositions, tierZones };
      let updatedConfigs: FloorConfig[];
      if (existing) {
        updatedConfigs = configs.map(c => c.floor === floorNum ? newConfig : c);
      } else {
        updatedConfigs = [...configs, newConfig].sort((a, b) => a.floor - b.floor);
      }
      const numFloors = updatedConfigs.length;
      const updatedEvent = await storage.updateEvent({ floorConfigs: updatedConfigs, numFloors });

      // Regenerate only this floor
      const newSeats = await storage.generateSeatsForFloor(event.id, floorNum, numRows, seatsPerRow);
      const allSeats = await storage.getSeats(event.id);
      
      bumpSeatsEtag();
      broadcast({ type: 'EVENT_UPDATED', event: updatedEvent });
      broadcast({ type: 'SEATS_RESET', seats: allSeats });
      res.json({ event: updatedEvent, seats: allSeats });
    } catch (error) {
      console.error('Update floor error:', error);
      res.status(500).json({ error: 'Failed to update floor config' });
    }
  });

  // Add a new floor
  app.post('/api/event/floors', requireAdmin, async (req, res) => {
    try {
      const { numRows = 5, seatsPerRow = 8, aislePositions = [3, 6] } = req.body;
      const event = await storage.getEvent();
      if (!event) return res.status(404).json({ error: 'Event not found' });

      const configs: FloorConfig[] = (event.floorConfigs as FloorConfig[]) || [];
      const nextFloor = configs.length > 0 ? Math.max(...configs.map(c => c.floor)) + 1 : 1;
      const newConfig: FloorConfig = {
        floor: nextFloor,
        numRows,
        seatsPerRow,
        aislePositions,
        tierZones: { Premium: "1", VIP: "1", Standard: "1" },
      };
      const updatedConfigs = [...configs, newConfig];
      const updatedEvent = await storage.updateEvent({ floorConfigs: updatedConfigs, numFloors: updatedConfigs.length });

      await storage.generateSeatsForFloor(event.id, nextFloor, numRows, seatsPerRow);
      const seats = await storage.getSeats(event.id);

      bumpSeatsEtag();
      broadcast({ type: 'EVENT_UPDATED', event: updatedEvent });
      broadcast({ type: 'SEATS_RESET', seats });
      res.json({ event: updatedEvent, seats });
    } catch (error) {
      res.status(500).json({ error: 'Failed to add floor' });
    }
  });

  // Remove the last floor
  app.delete('/api/event/floors/:floor', requireAdmin, async (req, res) => {
    try {
      const floorNum = parseInt(req.params.floor);
      const event = await storage.getEvent();
      if (!event) return res.status(404).json({ error: 'Event not found' });

      const configs: FloorConfig[] = (event.floorConfigs as FloorConfig[]) || [];
      if (configs.length <= 1) {
        return res.status(400).json({ error: 'Cannot remove the last floor' });
      }
      const updatedConfigs = configs.filter(c => c.floor !== floorNum);
      const updatedEvent = await storage.updateEvent({ floorConfigs: updatedConfigs, numFloors: updatedConfigs.length });

      await storage.removeFloor(event.id, floorNum);
      const seats = await storage.getSeats(event.id);

      bumpSeatsEtag();
      broadcast({ type: 'EVENT_UPDATED', event: updatedEvent });
      broadcast({ type: 'SEATS_RESET', seats });
      res.json({ event: updatedEvent, seats });
    } catch (error) {
      res.status(500).json({ error: 'Failed to remove floor' });
    }
  });

  // Get all seats - use cache from storage
  app.get('/api/seats', async (req, res) => {
    try {
      // ETag-based 304: skip sending 80+ objects when nothing changed
      res.setHeader('ETag', seatsEtag);
      res.setHeader('Cache-Control', 'no-cache');
      if (req.headers['if-none-match'] === seatsEtag) {
        return res.status(304).end();
      }
      const event = await storage.getEvent();
      if (!event) return res.status(404).json({ error: 'Event not found' });
      const seats = await storage.getSeats(event.id);
      res.json(seats);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get seats' });
    }
  });

  // Login endpoint - source of truth for user data
  app.post('/api/login', async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ error: 'Email is required' });
      
      const normalizedEmail = email.toLowerCase().trim();
      let user = await storage.getUser(normalizedEmail);
      
      if (!user) {
        user = await storage.createUser(normalizedEmail);
      }
      
      res.json(user);
    } catch (error) {
      res.status(500).json({ error: 'Login failed' });
    }
  });

  // Get user-data endpoint
  app.get('/api/user-data', async (req, res) => {
    try {
      const email = (req.query.email as string)?.toLowerCase().trim();
      if (!email) return res.status(400).json({ error: 'Email is required' });
      
      const user = await storage.getUser(email);
      if (!user) return res.status(404).json({ error: 'User not found' });
      
      res.json(user);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch user data' });
    }
  });

  // Save a user's ticket type (called once when user first enters)
  app.post('/api/users/:email/ticket-type', async (req, res) => {
    try {
      const email = decodeURIComponent(req.params.email);
      const { ticketType } = req.body;
      if (!ticketType || !['Premium', 'VIP', 'Standard'].includes(ticketType)) {
        return res.status(400).json({ error: 'Invalid ticket type' });
      }
      const existing = await storage.getUser(email);
      if (!existing) {
        return res.status(404).json({ error: 'User not found' });
      }
      // Only set if not already locked
      if (existing.ticketLocked) {
        return res.json({ ticketType: existing.ticketType, ticketLocked: true });
      }
      const updated = await storage.updateUser(email, { ticketType, ticketLocked: true });
      res.json({ ticketType: updated.ticketType, ticketLocked: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to save ticket type' });
    }
  });

  // Book a seat - with server-side double-booking prevention + immutability
  app.post('/api/seats/book', async (req, res) => {
    try {
      const booking = bookSeatSchema.parse(req.body);

      // Server-side check: user must not already have an ACTIVE booked seat.
      // We cross-check the user record against the actual seat status so stale
      // records (e.g. seat cancelled by admin but user record not cleared) do not
      // permanently block the email from booking again.
      const userRecord = await storage.getUser(booking.bookedByEmail);
      if (userRecord?.selectedSeat) {
        const claimedSeat = await storage.getSeat(userRecord.selectedSeat.seatId);
        const isStillBooked = claimedSeat?.status === 'booked' && claimedSeat?.bookedByEmail === booking.bookedByEmail;
        if (isStillBooked) {
          return res.status(409).json({ error: 'You already have a booked seat. Please choose another seat.' });
        }
        // Stale record - seat no longer booked by this email. Clear it so the user can book.
        await storage.updateUser(booking.bookedByEmail, { selectedSeat: null });
      }

      // Race-condition revalidation: confirm seat is still available before locking
      const existingSeat = await storage.getSeat(booking.seatId);
      if (!existingSeat) {
        return res.status(404).json({ error: 'Seat not found' });
      }
      if (existingSeat.status !== 'available') {
        return res.status(409).json({ error: 'Seat already booked, please select another seat.' });
      }

      let seat;
      try {
        seat = await storage.bookSeat(booking);
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('not available') || msg.includes('being processed')) {
          return res.status(409).json({ error: 'You already have a booked seat. Please choose another seat.' });
        }
        throw err;
      }

      // Persist booking on the user record so finality is enforced going forward
      const existingUser = await storage.getUser(booking.bookedByEmail);
      if (existingUser) {
        await storage.updateUser(booking.bookedByEmail, {
          fullName: booking.bookedBy,
          selectedSeat: { floor: seat.floor, row: seat.row, pos: seat.position, seatId: seat.id },
        });
      }

      bumpSeatsEtag();
      broadcast({ type: 'SEAT_BOOKED', seat });
      res.json(seat);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to book seat' });
    }
  });

  // Cancel seat booking - admin only (user-side cancel is disabled by product rule)
  app.post('/api/seats/:id/cancel', requireAdmin, async (req, res) => {
    try {
      const previousSeat = await storage.getSeat(req.params.id);
      const seat = await storage.cancelSeat(req.params.id);

      // Clear the prior holder's user record so they can book again
      const prevEmail = previousSeat?.bookedByEmail;
      if (prevEmail) {
        const prevUser = await storage.getUser(prevEmail);
        if (prevUser?.selectedSeat?.seatId === req.params.id) {
          await storage.updateUser(prevEmail, { selectedSeat: null });
        }
      }

      bumpSeatsEtag();
      broadcast({ type: 'SEAT_CANCELLED', seat });
      res.json(seat);
    } catch (error) {
      res.status(500).json({ error: 'Failed to cancel seat' });
    }
  });

  // Update seat (admin only) - also clears the previous holder's user record if booker changes/removes
  app.patch('/api/seats/:id', requireAdmin, async (req, res) => {
    try {
      const { passcode, ...updates } = req.body;
      const validatedUpdates = updateSeatSchema.parse(updates);

      // Sync previous booker's user record if the seat is being released or reassigned
      const previousSeat = await storage.getSeat(req.params.id);
      const seat = await storage.updateSeat(req.params.id, validatedUpdates);

      const prevEmail = previousSeat?.bookedByEmail;
      const newEmail = seat.bookedByEmail;
      if (prevEmail && prevEmail !== newEmail) {
        const prevUser = await storage.getUser(prevEmail);
        if (prevUser?.selectedSeat?.seatId === req.params.id) {
          await storage.updateUser(prevEmail, { selectedSeat: null });
        }
      }
      if (newEmail && seat.status === 'booked') {
        let newUser = await storage.getUser(newEmail);
        if (!newUser) newUser = await storage.createUser(newEmail);
        
        await storage.updateUser(newEmail, {
          fullName: seat.bookedBy,
          selectedSeat: { floor: seat.floor, row: seat.row, pos: seat.position, seatId: seat.id },
        });
      }

      bumpSeatsEtag();
      broadcast({ type: 'SEAT_UPDATED', seat });
      res.json(seat);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update seat' });
    }
  });

  // Reset all seats (admin only) - also clear every user's selectedSeat so finality
  // checks on /api/seats/book stay coherent with the now-empty seat state.
  app.post('/api/seats/reset', requireAdmin, async (req, res) => {
    try {
      const event = await storage.getEvent();
      if (!event) return res.status(404).json({ error: 'Event not found' });
      await storage.resetAllSeats(event.id);
      const seats = await storage.getSeats(event.id);

      // Clear selectedSeat on every user record so they can book again
      try {
        const allUsers = await storage.getAllUsers();
        await Promise.all(allUsers.map(async (user) => {
          if (user.selectedSeat) {
            await storage.updateUser(user.email, { selectedSeat: null });
          }
        }));
      } catch (e) {
        console.warn('Failed to clear user selectedSeat on reset:', e);
      }

      bumpSeatsEtag();
      broadcast({ type: 'SEATS_RESET', seats });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to reset seats' });
    }
  });

  // Export booking data (admin only)
  app.get('/api/export', requireAdmin, async (req, res) => {
    try {
      const event = await storage.getEvent();
      if (!event) return res.status(404).json({ error: 'Event not found' });
      const seats = await storage.getSeats(event.id);
      const bookedSeats = seats.filter(seat => seat.status === 'booked');
      const userTicketTypes = await Promise.all(
        bookedSeats.map(async seat => {
          if (!seat.bookedByEmail) return '';
          const userRecord = await storage.getUser(seat.bookedByEmail);
          return userRecord?.ticketType ?? '';
        })
      );
      const csvHeader = 'Floor,Seat,Booked By,Email,Ticket Type,Booked At\n';
      const csvRows = bookedSeats.map((seat, i) =>
        `${seat.floor ?? 1},"${seat.row}${seat.seatNumber}","${seat.bookedBy}","${seat.bookedByEmail || ''}","${userTicketTypes[i]}",${seat.bookedAt?.toISOString() || ''}`
      ).join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="TedxFtu262405-bookings-${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csvHeader + csvRows);
    } catch (error) {
      res.status(500).json({ error: 'Failed to export data' });
    }
  });

  return httpServer;
}
