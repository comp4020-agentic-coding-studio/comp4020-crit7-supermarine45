import { sql } from "drizzle-orm";
import { int, primaryKey, real, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

// The schema is the ground truth for the database. To change it: edit here,
// run `pnpm db:generate` to turn the diff into a migration under drizzle/,
// and commit both — the migration applies automatically when the server
// boots (see src/lib/db.ts), locally and deployed. Never edit the database
// by hand: state on the deployed volume outlives every deploy, and the
// migration trail is what keeps old state and new code compatible.
//
// Residence content itself (names, rates, features, coordinates) is NOT a
// migration — it's hand-curated reference data in seed/*.json, upserted at
// boot by scripts/seed.ts (see src/lib/db.ts). Only the shape of the tables
// below goes through drizzle-kit.

export const residences = sqliteTable("residences", {
  id: int().primaryKey({ autoIncrement: true }),
  slug: text().notNull().unique(),
  name: text().notNull(),
  anuUrl: text("anu_url").notNull(),
  applyUrl: text("apply_url"),
  // Set only for a residence with no StarRez application link at all (e.g.
  // University House) — a short, factual "how to actually apply" pointer,
  // rendered instead of the "Apply now" button rather than leaving a blank.
  applyNote: text("apply_note"),
  residentUndergrad: int("resident_undergrad", { mode: "boolean" }).notNull().default(false),
  residentPostgrad: int("resident_postgrad", { mode: "boolean" }).notNull().default(false),
  cateringType: text("catering_type", {
    enum: ["self_catered", "catered", "flexi_catered"],
  }).notNull(),
  weeklyRateFrom: int("weekly_rate_from"),
  address: text(),
  latitude: real(),
  longitude: real(),
  capacity: int(),
  capacityNote: text("capacity_note"),
  blurb: text().notNull(),
  accessibilityNote: text("accessibility_note"),
  feeNote: text("fee_note"),
  imageUrl: text("image_url"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export type Residence = typeof residences.$inferSelect;

export const residenceFeatures = sqliteTable(
  "residence_features",
  {
    residenceId: int("residence_id")
      .notNull()
      .references(() => residences.id, { onDelete: "cascade" }),
    feature: text().notNull(),
  },
  (t) => [primaryKey({ columns: [t.residenceId, t.feature] })],
);

export const residenceGalleryImages = sqliteTable("residence_gallery_images", {
  id: int().primaryKey({ autoIncrement: true }),
  residenceId: int("residence_id")
    .notNull()
    .references(() => residences.id, { onDelete: "cascade" }),
  url: text().notNull(),
  alt: text().notNull(),
  sequence: int().notNull(),
});

export type ResidenceGalleryImage = typeof residenceGalleryImages.$inferSelect;

export const residenceRooms = sqliteTable("residence_rooms", {
  id: int().primaryKey({ autoIncrement: true }),
  residenceId: int("residence_id")
    .notNull()
    .references(() => residences.id, { onDelete: "cascade" }),
  name: text().notNull(),
  weeklyTariff: real("weekly_tariff"),
  contractTerm: text("contract_term"),
  // Both stored as JSON-encoded string arrays: short, unfiltered lists of
  // fact lines transcribed verbatim from each room type's ANU tariff table,
  // not data this app ever queries or filters by field.
  inclusions: text().notNull(),
  otherFees: text("other_fees").notNull(),
  sequence: int().notNull(),
});

export type ResidenceRoom = typeof residenceRooms.$inferSelect;

export const nearbyPlaces = sqliteTable("nearby_places", {
  id: int().primaryKey({ autoIncrement: true }),
  residenceId: int("residence_id")
    .notNull()
    .references(() => residences.id, { onDelete: "cascade" }),
  category: text({
    enum: ["bus_stop", "tram_stop", "supermarket", "cafe", "bicycle_parking"],
  }).notNull(),
  name: text(),
  latitude: real().notNull(),
  longitude: real().notNull(),
  distanceMeters: int("distance_meters").notNull(),
  sourceId: text("source_id"),
});

export type NearbyPlace = typeof nearbyPlaces.$inferSelect;

export const shuttleStops = sqliteTable("shuttle_stops", {
  id: int().primaryKey({ autoIncrement: true }),
  name: text().notNull().unique(),
  sequence: int().notNull(),
  latitude: real().notNull(),
  longitude: real().notNull(),
  note: text(),
});

export type ShuttleStop = typeof shuttleStops.$inferSelect;

// Accounts are native to this app — a plain username/password login of our
// own, scoped to this prototype only. See README.md for why: the brief asks
// us to model relationships between people and places, which needs a real
// user to attach a shortlist, a review, a preference set or a room-interest
// flag to. This is NOT, and must never become, any kind of StarRez
// integration or lookalike.
export const users = sqliteTable("users", {
  id: int().primaryKey({ autoIncrement: true }),
  username: text().notNull().unique(),
  // "<scrypt salt hex>:<scrypt hash hex>" — see src/lib/auth.ts.
  passwordHash: text("password_hash").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export type User = typeof users.$inferSelect;

export const sessions = sqliteTable("sessions", {
  id: text().primaryKey(),
  userId: int("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const shortlist = sqliteTable(
  "shortlist",
  {
    userId: int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    residenceId: int("residence_id")
      .notNull()
      .references(() => residences.id, { onDelete: "cascade" }),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [primaryKey({ columns: [t.userId, t.residenceId] })],
);

// One saved questionnaire answer set per user, upserted on every save. The
// "social" answer here is real — it's what a residence's social vibe is
// compared *against* that has no ANU-published equivalent; src/lib/match.ts
// documents that estimate and how reviews.socialVibe now strengthens it.
export const preferences = sqliteTable("preferences", {
  userId: int("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  budgetMin: int("budget_min"),
  budgetMax: int("budget_max"),
  catering: text({
    enum: ["self_catered", "catered", "flexi_catered", "no_preference"],
  }).notNull(),
  residentType: text("resident_type", {
    enum: ["undergrad", "postgrad", "both", "no_preference"],
  }).notNull(),
  social: text({ enum: ["quiet", "balanced", "social"] }).notNull(),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export type Preferences = typeof preferences.$inferSelect;

// One review per user per residence — resubmitting edits it rather than
// adding a second row. socialVibe is optional: it's how a residence's actual
// social atmosphere gets a real, crowd-sourced answer instead of only the
// catering-based estimate in src/lib/match.ts — see README.md.
export const reviews = sqliteTable(
  "reviews",
  {
    id: int().primaryKey({ autoIncrement: true }),
    residenceId: int("residence_id")
      .notNull()
      .references(() => residences.id, { onDelete: "cascade" }),
    userId: int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rating: int().notNull(),
    body: text().notNull(),
    socialVibe: text("social_vibe", { enum: ["quiet", "balanced", "social"] }),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [unique().on(t.residenceId, t.userId)],
);

export type Review = typeof reviews.$inferSelect;

// A non-binding "I'm interested in this room type" flag — deliberately not a
// reservation or hold. See README.md for why this app doesn't model a real
// booking flow.
export const roomInterest = sqliteTable(
  "room_interest",
  {
    userId: int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roomId: int("room_id")
      .notNull()
      .references(() => residenceRooms.id, { onDelete: "cascade" }),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roomId] })],
);
