import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export type TierZones = {
  Premium: string;
  VIP: string;
  Standard: string;
};

export type FloorConfig = {
  floor: number;
  numRows: number;
  seatsPerRow: number;
  aislePositions: number[];
  tierZones: TierZones;
};

const DEFAULT_TIER_ZONES: TierZones = { Premium: "1", VIP: "1", Standard: "1" };

export const events = pgTable("events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().default("TEDxFTU 2026"),
  datetime: text("datetime").notNull().default("March 15, 2026 - 2:00 PM"),
  location: text("location").notNull().default("FTU Main Auditorium"),
  contactEmail: text("contact_email").notNull().default("info@tedxftu.com"),
  contactPhone: text("contact_phone").notNull().default("+84 123 456 789"),
  contactFacebook: text("contact_facebook").notNull().default("facebook.com/tedxftu"),
  numFloors: integer("num_floors").notNull().default(2),
  floorConfigs: jsonb("floor_configs").$type<FloorConfig[]>().notNull().default(sql`'[{"floor":1,"numRows":5,"seatsPerRow":8,"aislePositions":[3,6],"tierZones":{"Premium":"1","VIP":"1","Standard":"1"}},{"floor":2,"numRows":5,"seatsPerRow":8,"aislePositions":[3,6],"tierZones":{"Premium":"1","VIP":"1","Standard":"1"}}]'::jsonb`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const seats = pgTable("seats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull().references(() => events.id),
  seatNumber: text("seat_number").notNull(),
  row: text("row").notNull(),
  position: integer("position").notNull(),
  floor: integer("floor").notNull().default(1),
  status: text("status").notNull().default("available"),
  bookedBy: text("booked_by"),
  bookedByEmail: text("booked_by_email"),
  bookedAt: timestamp("booked_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const insertEventSchema = createInsertSchema(events).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertSeatSchema = createInsertSchema(seats, {
  bookedAt: z.string().datetime().optional().nullable().transform(v => v ? new Date(v) : null),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const updateEventSchema = insertEventSchema.partial();

export const updateSeatSchema = insertSeatSchema.partial();

export const bookSeatSchema = z.object({
  seatId: z.string(),
  bookedBy: z.string().min(1).max(80),
  bookedByEmail: z.string().email(),
});

export const floorConfigSchema = z.object({
  numRows: z.number().int().min(1).max(26),
  seatsPerRow: z.number().int().min(1).max(50),
  aislePositions: z.array(z.number()),
  tierZones: z.object({
    Premium: z.string(),
    VIP: z.string(),
    Standard: z.string(),
  }).default(DEFAULT_TIER_ZONES),
});

export type Event = typeof events.$inferSelect;
export type Seat = typeof seats.$inferSelect;
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type InsertSeat = z.infer<typeof insertSeatSchema>;
export type UpdateEvent = z.infer<typeof updateEventSchema>;
export type UpdateSeat = z.infer<typeof updateSeatSchema>;
export type BookSeat = z.infer<typeof bookSeatSchema>;

export const users = pgTable("users", {
  email: text("email").primaryKey(),
  ticketType: text("ticket_type"),
  ticketLocked: boolean("ticket_locked").default(false),
  fullName: text("full_name"),
  selectedSeat: jsonb("selected_seat").$type<{
    floor: number;
    row: string;
    pos: number;
    seatId: string;
  } | null>(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type User = typeof users.$inferSelect;
export const insertUserSchema = createInsertSchema(users);
export type InsertUser = z.infer<typeof insertUserSchema>;