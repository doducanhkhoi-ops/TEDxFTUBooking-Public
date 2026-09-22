# TEDxFTU 2026 Seat Booking System

## Overview

A full-stack seat booking web application for the TEDxFTU 2026 event. Features a dark-themed interface with live seat availability updates, mandatory email+ticket-type gate, real-time WebSocket sync, and a secured admin panel. All data is fully persistent in Replit Database with race condition protection.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript using Vite for development and build tooling
- **UI Components**: Radix UI primitives with shadcn/ui component library
- **Styling**: Tailwind CSS with CSS variables, enforced dark mode only
- **State Management**: TanStack Query for server state with real-time WebSocket updates
- **Routing**: Wouter for lightweight client-side routing

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Database**: Replit KV Database (`@replit/database` v3) as the sole persistent store
- **Real-time Updates**: WebSocket server (`ws`) for live seat booking sync
- **API**: REST endpoints with Zod validation

### Data Storage — Replit KV Database

All data survives server restarts and scales across sessions. Key structure:

| Key | Value |
|-----|-------|
| `event:data` | Full event object (name, datetime, location, contact, floorConfigs) |
| `seat:{floor}:{row}:{pos}` | `{ status, bookedBy, bookedByEmail, bookedAt, createdAt, updatedAt }` |
| `user:{email}` | `{ ticketType, ticketLocked, selectedSeat, updatedAt }` |
| `lock:seat:{floor}:{row}:{pos}` | Temporary lock `{ at: timestamp }` during booking (10s TTL) |

**Seat cache.** `ReplitStorage` keeps an in-memory `Map<string, Seat>` mirror of the seat keys. The cache is initialized once per process: all `seat:` keys are fetched from Replit DB **in parallel** via `Promise.all`, with an in-flight promise (`cacheInitPromise`) so concurrent first requests share a single scan instead of fanning out N full DB scans. The server bootstrap (`server/index.ts`) calls `storage.warmCache(eventId)` immediately after `server.listen` so the first user request pays no cold-start penalty (warmup ~1.8s for ~80 seats vs. ~88s when fetched sequentially).

### Seat ID Format
Deterministic: `seat-{floor}-{row}-{pos}` (e.g. `seat-1-A-3`)
Derived from the DB key, so IDs are always consistent across restarts.

### Booking Algorithm (Race Condition Safe)
1. Check if user already has a seat (server-side via user record) → 409 if so (booking is final/immutable)
2. Re-read seat to verify it's still `available` → 409 with `"Seat already booked, please select another seat."` if not
3. Acquire lock key with timestamp
4. Re-check inside `bookSeat` (defense in depth)
5. Write seat as `booked`
6. Write user's `selectedSeat` (so finality is enforced going forward)
7. Release lock (always in `finally`)

### Booking Finality (Immutability Rule)
- Once a user books a seat, the booking is **permanent from the user side**.
- All user-side cancel/unselect UI was removed. The home page shows a green "Booking Confirmed — Final" lock badge instead of a cancel button.
- Trying to book again returns 409 `"Your booking is final and cannot be changed."`.
- Only an authenticated admin can cancel or reassign a seat (via `POST /api/seats/:id/cancel` or `PATCH /api/seats/:id`).
- Admin cancel/PATCH automatically clears the prior holder's `user.selectedSeat` so they can re-book.
- `POST /api/seats/reset` clears `selectedSeat` on every `user:` record to keep finality coherent.

### Authentication & RBAC (Backend is the source of truth)
- **Public** (no auth): email gate, `/api/login`, `/api/seats`, `/api/event` (read), `/api/seats/book`.
- **Admin** (Bearer token only):
  - `POST /api/admin/login` exchanges the admin passcode for a 64-char hex token (in-memory `Set`).
  - All admin-protected routes use the `requireAdmin` middleware which checks `Authorization: Bearer <token>`.
  - Protected: `PATCH /api/event`, `POST/PATCH/DELETE /api/event/floors[/...]`, `PATCH /api/seats/:id`, `POST /api/seats/:id/cancel`, `POST /api/seats/reset`, `GET /api/export`.
  - **No passcode-in-body / passcode-in-query fallback** — Bearer is the only accepted credential.
- **Frontend**: `queryClient.buildHeaders()` auto-injects `Authorization: Bearer <sessionStorage.adminToken>` on every request. Export uses `fetch + blob` (not `window.open`) so the token stays in headers.
- **Admin passcode**: loaded from `process.env.ADMIN_PASSCODE` with fallback `'TedxFtu262405'`. Rotate via Replit Secrets and restart to invalidate all in-memory tokens.
- **Logout**: `POST /api/admin/logout` removes the token server-side.

### Admin Seat Editing (Click-to-Edit)
- When an admin clicks any seat on the chart, `home.tsx` opens `SeatEditModal` instead of the user `NameModal`.
- Form lets the admin set status (available/booked/disabled), bookedBy, bookedByEmail.
- Submits via `PATCH /api/seats/:id` with the Bearer token.
- Floor/row/position are immutable (part of the seat ID).

### Booking Modal Inactivity Timeout
- `NameModal` enforces a 30s inactivity window (`INACTIVITY_TIMEOUT_MS = 30000`).
- Resets on any `mousemove`, `keydown`, `touchstart`, or `focus` inside the modal.
- A countdown badge is visible; ≤10s remaining shows a red pulse warning.
- On expiry the modal auto-closes without submitting (no booking is made).

### Ticket Tier Lock
- First time a user enters → ticketType saved permanently to both localStorage and Replit DB
- On return: DB is authoritative source, overwrites localStorage
- Server rejects changes to an already-locked ticket type

### Per-Floor Layout
Each floor has its own config in `event.floorConfigs`:
- `{ floor, numRows, seatsPerRow, aislePositions, tierZones: { Premium, VIP, Standard } }`
- `tierZones` format: `"0"` = block all, `"1"` = allow all, `"A1:H10"` = rectangle
- Updating one floor only regenerates that floor's seats

### Admin Panel State (client-side)
- `aisleRawInputs: Record<number, string>` — separate from parsed positions to allow typing commas freely
- `localSeatOverrides` — staged seat changes before pushing to server

## Key Files

- `server/storage.ts` — ReplitStorage class, all DB read/write logic
- `server/routes.ts` — API endpoints, booking validation, RBAC middleware (`requireAdmin`), admin login/logout/me
- `client/src/lib/queryClient.ts` — auto-injects `Authorization: Bearer <adminToken>` on every request
- `client/src/components/email-gate.tsx` — Email + ticket type gate with server sync
- `client/src/pages/home.tsx` — Main seat chart page, booking flow, admin seat-edit routing
- `client/src/components/seat-chart.tsx` — Interactive multi-floor seat selection
- `client/src/components/name-modal.tsx` — Booking modal with 30s inactivity timeout
- `client/src/components/seat-edit-modal.tsx` — Admin-only seat edit form (click-to-edit)
- `client/src/components/admin-panel.tsx` — Admin dashboard (passcode → Bearer token exchange)

## Admin Passcode
Default: `TedxFtu262405` — override via `ADMIN_PASSCODE` env secret to rotate.
