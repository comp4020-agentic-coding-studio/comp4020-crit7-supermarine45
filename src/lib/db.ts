import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { and, desc, eq, gte, inArray, like, lte, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { seed } from "../../scripts/seed";
import {
  type NearbyPlace,
  type Preferences,
  type Residence,
  type ResidenceGalleryImage,
  type Review,
  type ShuttleStop,
  nearbyPlaces,
  preferences,
  residenceFeatures,
  residenceGalleryImages,
  residenceRooms,
  residences,
  reviews,
  roomInterest,
  shortlist,
  shuttleStops,
  users,
} from "./schema";

// One SQLite file is the app's whole persistent state. In production
// fly.toml points DATABASE_PATH at the machine's volume (/data), which is
// how state survives a reload and a redeploy; locally it defaults to an
// untracked file in .data/.
const path = process.env.DATABASE_PATH ?? "./.data/app.db";
mkdirSync(dirname(path), { recursive: true });

const client = new Database(path);
client.pragma("journal_mode = WAL");
// residence_features / nearby_places / shortlist declare ON DELETE CASCADE;
// SQLite only enforces that when this pragma is set on the connection.
client.pragma("foreign_keys = ON");

export const db = drizzle(client);

// Migrations run at boot, on whatever machine holds the volume — the
// recommended shape for SQLite on Fly, where there's no separate machine to
// run them from. The flow: edit src/lib/schema.ts, `pnpm db:generate`,
// commit the migration it writes to drizzle/.
migrate(db, { migrationsFolder: "./drizzle" });

// Residence content (seed/*.json) is hand-curated reference data, not a
// schema change — it's upserted here on every boot rather than versioned as
// a migration. Cheap (a few hundred rows) and idempotent, which matters
// because fly.toml stops the machine when idle: this runs on every cold
// start, including in spec/global-setup.ts's fresh test database.
seed(db);

export type { NearbyPlace, Preferences, Residence, ResidenceGalleryImage, Review, ShuttleStop };

export interface RoomType {
  id: number;
  name: string;
  weeklyTariff: number | null;
  contractTerm: string | null;
  inclusions: string[];
  otherFees: string[];
}

export type ResidentType = "undergrad" | "postgrad" | "both";
export type CateringType = "self_catered" | "catered" | "flexi_catered";

export interface ResidenceFilters {
  type?: ResidentType;
  catering?: CateringType;
  min?: number;
  max?: number;
  q?: string;
}

export function searchResidences(filters: ResidenceFilters): Residence[] {
  const conditions = [];
  if (filters.type === "undergrad") conditions.push(eq(residences.residentUndergrad, true));
  if (filters.type === "postgrad") conditions.push(eq(residences.residentPostgrad, true));
  if (filters.type === "both") {
    conditions.push(eq(residences.residentUndergrad, true));
    conditions.push(eq(residences.residentPostgrad, true));
  }
  if (filters.catering) conditions.push(eq(residences.cateringType, filters.catering));
  if (filters.min !== undefined) conditions.push(gte(residences.weeklyRateFrom, filters.min));
  if (filters.max !== undefined) conditions.push(lte(residences.weeklyRateFrom, filters.max));
  if (filters.q) {
    const pattern = `%${filters.q}%`;
    conditions.push(or(like(residences.name, pattern), like(residences.blurb, pattern)));
  }

  const query = db.select().from(residences);
  return conditions.length > 0 ? query.where(and(...conditions)).all() : query.all();
}

export function listAllResidences(): Residence[] {
  return db.select().from(residences).orderBy(residences.name).all();
}

export function getResidenceBySlug(slug: string): Residence | undefined {
  return db.select().from(residences).where(eq(residences.slug, slug)).get();
}

export function listFeatures(residenceId: number): string[] {
  return db
    .select({ feature: residenceFeatures.feature })
    .from(residenceFeatures)
    .where(eq(residenceFeatures.residenceId, residenceId))
    .all()
    .map((row) => row.feature);
}

export function listGalleryImages(residenceId: number): ResidenceGalleryImage[] {
  return db
    .select()
    .from(residenceGalleryImages)
    .where(eq(residenceGalleryImages.residenceId, residenceId))
    .orderBy(residenceGalleryImages.sequence)
    .all();
}

export function listRoomTypes(residenceId: number): RoomType[] {
  return db
    .select()
    .from(residenceRooms)
    .where(eq(residenceRooms.residenceId, residenceId))
    .orderBy(residenceRooms.sequence)
    .all()
    .map((row) => ({
      id: row.id,
      name: row.name,
      weeklyTariff: row.weeklyTariff,
      contractTerm: row.contractTerm,
      inclusions: JSON.parse(row.inclusions) as string[],
      otherFees: JSON.parse(row.otherFees) as string[],
    }));
}

export function listNearbyPlaces(residenceId: number): NearbyPlace[] {
  return db
    .select()
    .from(nearbyPlaces)
    .where(eq(nearbyPlaces.residenceId, residenceId))
    .orderBy(nearbyPlaces.distanceMeters)
    .all();
}

export function listShuttleStops(): ShuttleStop[] {
  return db.select().from(shuttleStops).orderBy(shuttleStops.sequence).all();
}

// Per-user now (see src/lib/auth.ts) — last session's shared, no-login
// shortlist is gone, along with whatever anonymous rows it held.
export function getShortlistIds(userId: number): Set<number> {
  const rows = db.select({ residenceId: shortlist.residenceId }).from(shortlist).where(eq(shortlist.userId, userId)).all();
  return new Set(rows.map((row) => row.residenceId));
}

export function listShortlistedResidences(userId: number): Residence[] {
  const ids = [...getShortlistIds(userId)];
  if (ids.length === 0) return [];
  return db.select().from(residences).where(inArray(residences.id, ids)).orderBy(residences.name).all();
}

export function addToShortlist(userId: number, residenceId: number): void {
  db.insert(shortlist).values({ userId, residenceId }).onConflictDoNothing().run();
}

export function removeFromShortlist(userId: number, residenceId: number): void {
  db.delete(shortlist).where(and(eq(shortlist.userId, userId), eq(shortlist.residenceId, residenceId))).run();
}

export type CateringPreference = CateringType | "no_preference";
export type ResidentPreference = ResidentType | "no_preference";
export type SocialPreference = "quiet" | "balanced" | "social";

export interface PreferencesInput {
  budgetMin: number | null;
  budgetMax: number | null;
  catering: CateringPreference;
  residentType: ResidentPreference;
  social: SocialPreference;
}

export function getPreferences(userId: number): Preferences | undefined {
  return db.select().from(preferences).where(eq(preferences.userId, userId)).get();
}

export function savePreferences(userId: number, prefs: PreferencesInput): void {
  db.insert(preferences)
    .values({ userId, ...prefs })
    .onConflictDoUpdate({
      target: preferences.userId,
      set: { ...prefs, updatedAt: sql`(datetime('now'))` },
    })
    .run();
}

export interface ReviewWithAuthor {
  id: number;
  rating: number;
  body: string;
  createdAt: string;
  username: string;
}

export function listReviews(residenceId: number): ReviewWithAuthor[] {
  return db
    .select({ id: reviews.id, rating: reviews.rating, body: reviews.body, createdAt: reviews.createdAt, username: users.username })
    .from(reviews)
    .innerJoin(users, eq(reviews.userId, users.id))
    .where(eq(reviews.residenceId, residenceId))
    .orderBy(desc(reviews.createdAt))
    .all();
}

export function getReviewStats(residenceId: number): { average: number | null; count: number } {
  const rows = db.select({ rating: reviews.rating }).from(reviews).where(eq(reviews.residenceId, residenceId)).all();
  if (rows.length === 0) return { average: null, count: 0 };
  const average = rows.reduce((sum, row) => sum + row.rating, 0) / rows.length;
  return { average, count: rows.length };
}

export function getMyReview(residenceId: number, userId: number): Review | undefined {
  return db.select().from(reviews).where(and(eq(reviews.residenceId, residenceId), eq(reviews.userId, userId))).get();
}

export function upsertReview(userId: number, residenceId: number, rating: number, body: string): void {
  db.insert(reviews)
    .values({ userId, residenceId, rating, body })
    .onConflictDoUpdate({
      target: [reviews.residenceId, reviews.userId],
      set: { rating, body },
    })
    .run();
}

export function addRoomInterest(userId: number, roomId: number): void {
  db.insert(roomInterest).values({ userId, roomId }).onConflictDoNothing().run();
}

export function removeRoomInterest(userId: number, roomId: number): void {
  db.delete(roomInterest).where(and(eq(roomInterest.userId, userId), eq(roomInterest.roomId, roomId))).run();
}

export function getInterestedRoomIds(userId: number, residenceId: number): Set<number> {
  const rows = db
    .select({ roomId: roomInterest.roomId })
    .from(roomInterest)
    .innerJoin(residenceRooms, eq(roomInterest.roomId, residenceRooms.id))
    .where(and(eq(roomInterest.userId, userId), eq(residenceRooms.residenceId, residenceId)))
    .all();
  return new Set(rows.map((row) => row.roomId));
}

export function getRoomInterestCounts(residenceId: number): Map<number, number> {
  const rows = db
    .select({ roomId: roomInterest.roomId, count: sql<number>`count(*)`.as("count") })
    .from(roomInterest)
    .innerJoin(residenceRooms, eq(roomInterest.roomId, residenceRooms.id))
    .where(eq(residenceRooms.residenceId, residenceId))
    .groupBy(roomInterest.roomId)
    .all();
  return new Map(rows.map((row) => [row.roomId, row.count]));
}
