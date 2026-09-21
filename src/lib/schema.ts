import { sql } from "drizzle-orm";
import { int, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
    enum: ["bus_stop", "tram_stop", "supermarket", "cafe"],
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

export const shortlist = sqliteTable("shortlist", {
  residenceId: int("residence_id")
    .primaryKey()
    .references(() => residences.id, { onDelete: "cascade" }),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});
