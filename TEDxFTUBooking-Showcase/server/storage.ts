import { 
  type Event, 
  type Seat, 
  type InsertEvent, 
  type InsertSeat,
  type UpdateEvent,
  type UpdateSeat,
  type BookSeat,
  type FloorConfig,
  type User,
  events,
  seats,
  users
} from "@shared/schema";
import { db } from "./db";
import { eq, and } from "drizzle-orm";

// Deterministic seat ID derived from floor/row/position
function makeSeatId(floor: number, row: string, pos: number): string {
  return `seat-${floor}-${row}-${pos}`;
}

export interface IStorage {
  getEvent(): Promise<Event | undefined>;
  createEvent(event: InsertEvent): Promise<Event>;
  updateEvent(updates: UpdateEvent): Promise<Event>;
  getSeats(eventId: string): Promise<Seat[]>;
  getSeat(id: string): Promise<Seat | undefined>;
  createSeat(seat: InsertSeat): Promise<Seat>;
  updateSeat(id: string, updates: UpdateSeat): Promise<Seat>;
  bookSeat(booking: BookSeat): Promise<Seat>;
  cancelSeat(seatId: string): Promise<Seat>;
  resetAllSeats(eventId: string): Promise<void>;
  generateSeats(eventId: string, floorConfigs: FloorConfig[]): Promise<Seat[]>;
  generateSeatsForFloor(eventId: string, floor: number, numRows: number, seatsPerRow: number): Promise<Seat[]>;
  removeFloor(eventId: string, floor: number): Promise<void>;
  warmCache(eventId: string): Promise<void>;
  
  getUser(email: string): Promise<User | undefined>;
  createUser(email: string): Promise<User>;
  updateUser(email: string, updates: Partial<User>): Promise<User>;
  getAllUsers(): Promise<User[]>;
}

class DatabaseStorage implements IStorage {
  async warmCache(eventId: string): Promise<void> {
    // No-op for Postgres as we rely on the database for queries.
  }

  async getEvent(): Promise<Event | undefined> {
    const res = await db.select().from(events).limit(1);
    return res[0];
  }

  async createEvent(insertEvent: InsertEvent): Promise<Event> {
    const defaultFloorConfigs: FloorConfig[] = [
      { floor: 1, numRows: 5, seatsPerRow: 8, aislePositions: [3, 6], tierZones: { Premium: "1", VIP: "1", Standard: "1" } },
      { floor: 2, numRows: 5, seatsPerRow: 8, aislePositions: [3, 6], tierZones: { Premium: "1", VIP: "1", Standard: "1" } },
    ];
    
    const event = {
      id: 'tedxftu2026',
      name: insertEvent.name || "TEDxFTU 2026",
      datetime: insertEvent.datetime || "March 15, 2026 - 2:00 PM",
      location: insertEvent.location || "FTU Main Auditorium",
      contactEmail: insertEvent.contactEmail || "info@tedxftu.com",
      contactPhone: insertEvent.contactPhone || "+84 123 456 789",
      contactFacebook: insertEvent.contactFacebook || "facebook.com/tedxftu",
      numFloors: insertEvent.numFloors || 2,
      floorConfigs: (insertEvent.floorConfigs as FloorConfig[]) || defaultFloorConfigs,
    };
    
    const [created] = await db.insert(events).values(event).returning();
    return created;
  }

  async updateEvent(updates: UpdateEvent): Promise<Event> {
    const current = await this.getEvent();
    if (!current) throw new Error("No event found to update");
    
    const [updated] = await db.update(events)
      .set({ ...(updates as any), updatedAt: new Date() })
      .where(eq(events.id, current.id))
      .returning();
    return updated;
  }

  async getSeats(eventId: string): Promise<Seat[]> {
    return await db.select().from(seats).where(eq(seats.eventId, eventId));
  }

  async getSeat(id: string): Promise<Seat | undefined> {
    const res = await db.select().from(seats).where(eq(seats.id, id));
    return res[0];
  }

  async createSeat(insertSeat: InsertSeat): Promise<Seat> {
    const [created] = await db.insert(seats).values({
      id: makeSeatId(insertSeat.floor || 1, insertSeat.row, insertSeat.position),
      eventId: insertSeat.eventId,
      seatNumber: insertSeat.seatNumber,
      row: insertSeat.row,
      position: insertSeat.position,
      floor: insertSeat.floor,
      status: insertSeat.status || 'available',
      bookedBy: insertSeat.bookedBy,
      bookedByEmail: insertSeat.bookedByEmail,
      bookedAt: insertSeat.bookedAt,
    }).returning();
    return created;
  }

  async updateSeat(id: string, updates: UpdateSeat): Promise<Seat> {
    const [updated] = await db.update(seats)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(seats.id, id))
      .returning();
    if (!updated) throw new Error("Seat not found");
    return updated;
  }

  async bookSeat(booking: BookSeat): Promise<Seat> {
    // Find the seat and update it atomically if it's available
    const [updated] = await db.update(seats)
      .set({
        status: 'booked',
        bookedBy: booking.bookedBy,
        bookedByEmail: booking.bookedByEmail,
        bookedAt: new Date(),
        updatedAt: new Date()
      })
      .where(and(eq(seats.id, booking.seatId), eq(seats.status, 'available')))
      .returning();
      
    if (!updated) {
      throw new Error("Seat not available or not found");
    }
    
    return updated;
  }

  async cancelSeat(seatId: string): Promise<Seat> {
    const [updated] = await db.update(seats)
      .set({
        status: 'available',
        bookedBy: null,
        bookedByEmail: null,
        bookedAt: null,
        updatedAt: new Date()
      })
      .where(eq(seats.id, seatId))
      .returning();
      
    if (!updated) throw new Error("Seat not found");
    return updated;
  }

  async resetAllSeats(eventId: string): Promise<void> {
    await db.update(seats)
      .set({
        status: 'available',
        bookedBy: null,
        bookedByEmail: null,
        bookedAt: null,
        updatedAt: new Date()
      })
      .where(eq(seats.eventId, eventId));
  }

  async generateSeats(eventId: string, floorConfigs: FloorConfig[]): Promise<Seat[]> {
    await db.delete(seats).where(eq(seats.eventId, eventId));
    
    const newSeats = [];
    for (const fc of floorConfigs) {
      const rowLabels = Array.from({ length: fc.numRows }, (_, i) => String.fromCharCode(65 + i));
      for (const rowLabel of rowLabels) {
        for (let pos = 1; pos <= fc.seatsPerRow; pos++) {
          newSeats.push({
            id: makeSeatId(fc.floor, rowLabel, pos),
            eventId,
            seatNumber: String(pos),
            row: rowLabel,
            position: pos,
            floor: fc.floor,
            status: 'available',
          });
        }
      }
    }
    
    if (newSeats.length > 0) {
      return await db.insert(seats).values(newSeats).returning();
    }
    return [];
  }

  async generateSeatsForFloor(eventId: string, floor: number, numRows: number, seatsPerRow: number): Promise<Seat[]> {
    await db.delete(seats).where(and(eq(seats.eventId, eventId), eq(seats.floor, floor)));
    
    const newSeats = [];
    const rowLabels = Array.from({ length: numRows }, (_, i) => String.fromCharCode(65 + i));
    for (const rowLabel of rowLabels) {
      for (let pos = 1; pos <= seatsPerRow; pos++) {
        newSeats.push({
          id: makeSeatId(floor, rowLabel, pos),
          eventId,
          seatNumber: String(pos),
          row: rowLabel,
          position: pos,
          floor,
          status: 'available',
        });
      }
    }
    
    if (newSeats.length > 0) {
      return await db.insert(seats).values(newSeats).returning();
    }
    return [];
  }

  async removeFloor(eventId: string, floor: number): Promise<void> {
    await db.delete(seats).where(and(eq(seats.eventId, eventId), eq(seats.floor, floor)));
  }

  async getUser(email: string): Promise<User | undefined> {
    const normalized = email.toLowerCase().trim();
    const res = await db.select().from(users).where(eq(users.email, normalized));
    return res[0];
  }

  async createUser(email: string): Promise<User> {
    const normalized = email.toLowerCase().trim();
    const [created] = await db.insert(users).values({
      email: normalized,
      ticketType: null,
      ticketLocked: false,
      fullName: null,
      selectedSeat: null,
    }).returning();
    return created;
  }

  async updateUser(email: string, updates: Partial<User>): Promise<User> {
    const normalized = email.toLowerCase().trim();
    const [updated] = await db.update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.email, normalized))
      .returning();
    if (!updated) throw new Error("User not found");
    return updated;
  }
  
  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users);
  }
}

export const storage = new DatabaseStorage();
