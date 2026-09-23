import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { and, desc, eq, gte, inArray, like, lte, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { seed } from "../../scripts/seed";
import { parseContractWeeks } from "./cost";
import { haversineMeters } from "./geo";
import {
  type NearbyPlace,
  type Preferences,
  type Residence,
  type ResidenceGalleryImage,
  type ResidentRequest,
  type Review,
  type ShuttleStop,
  contracts,
  nearbyPlaces,
  preferences,
  residenceFeatures,
  residenceGalleryImages,
  residenceRooms,
  residences,
  residentRequests,
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

export type { NearbyPlace, Preferences, Residence, ResidenceGalleryImage, ResidentRequest, Review, ShuttleStop };

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
export type SortOption = "name" | "price_asc" | "price_desc" | "rating_desc" | "distance_asc";

export interface ResidenceStats {
  avgRating: number | null;
  reviewCount: number;
  nearestStopName: string | null;
  nearestStopMeters: number | null;
}

export type ResidenceWithStats = Residence & ResidenceStats;

export interface ResidenceFilters {
  type?: ResidentType;
  catering?: CateringType;
  min?: number;
  max?: number;
  q?: string;
  minRating?: number;
  maxDistance?: number;
  sort?: SortOption;
}

// One grouped query for every residence's rating, rather than the N+1 you'd
// get calling getReviewStats() per residence (fine for a single detail page,
// not for a 19-residence search/listing page).
function getAllReviewStats(): Map<number, { average: number | null; count: number }> {
  const rows = db
    .select({
      residenceId: reviews.residenceId,
      average: sql<number>`avg(${reviews.rating})`,
      count: sql<number>`count(*)`,
    })
    .from(reviews)
    .groupBy(reviews.residenceId)
    .all();
  return new Map(rows.map((row) => [row.residenceId, { average: row.average, count: row.count }]));
}

function nearestShuttleStop(
  lat: number | null,
  lon: number | null,
  stops: ShuttleStop[],
): { name: string | null; meters: number | null } {
  if (lat == null || lon == null || stops.length === 0) return { name: null, meters: null };
  const nearest = stops
    .map((s) => ({ stop: s, distance: haversineMeters(lat, lon, s.latitude, s.longitude) }))
    .sort((a, b) => a.distance - b.distance)[0];
  return { name: nearest.stop.name, meters: Math.round(nearest.distance) };
}

// Attaches average rating and nearest-shuttle-stop distance to a list of
// residences, so cards can show them and search can sort/filter by them —
// without re-deriving them per residence.
export function withResidenceStats(list: Residence[]): ResidenceWithStats[] {
  const stats = getAllReviewStats();
  const stops = listShuttleStops();
  return list.map((r) => {
    const stat = stats.get(r.id);
    const nearest = nearestShuttleStop(r.latitude, r.longitude, stops);
    return {
      ...r,
      avgRating: stat?.average ?? null,
      reviewCount: stat?.count ?? 0,
      nearestStopName: nearest.name,
      nearestStopMeters: nearest.meters,
    };
  });
}

export function searchResidences(filters: ResidenceFilters): ResidenceWithStats[] {
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
  const base = conditions.length > 0 ? query.where(and(...conditions)).all() : query.all();

  let results = withResidenceStats(base);

  if (filters.minRating !== undefined) {
    const minRating = filters.minRating;
    results = results.filter((r) => r.avgRating !== null && r.avgRating >= minRating);
  }
  if (filters.maxDistance !== undefined) {
    const maxDistance = filters.maxDistance;
    results = results.filter((r) => r.nearestStopMeters !== null && r.nearestStopMeters <= maxDistance);
  }

  const sort = filters.sort ?? "name";
  return [...results].sort((a, b) => {
    switch (sort) {
      case "price_asc":
        return (a.weeklyRateFrom ?? Infinity) - (b.weeklyRateFrom ?? Infinity);
      case "price_desc":
        return (b.weeklyRateFrom ?? -Infinity) - (a.weeklyRateFrom ?? -Infinity);
      case "rating_desc":
        return (b.avgRating ?? -1) - (a.avgRating ?? -1);
      case "distance_asc":
        return (a.nearestStopMeters ?? Infinity) - (b.nearestStopMeters ?? Infinity);
      default:
        return a.name.localeCompare(b.name);
    }
  });
}

export interface RoomFilters {
  type?: ResidentType;
  catering?: CateringType;
  min?: number;
  max?: number;
  q?: string;
  minRating?: number;
  maxDistance?: number;
  sort?: SortOption;
}

export interface RoomSearchResult {
  roomId: number;
  roomName: string;
  weeklyTariff: number | null;
  contractTerm: string | null;
  sequence: number;
  residenceId: number;
  residenceSlug: string;
  residenceName: string;
  residentUndergrad: boolean;
  residentPostgrad: boolean;
  cateringType: CateringType;
  address: string | null;
  applyUrl: string | null;
  applyNote: string | null;
  imageUrl: string | null;
  inclusions: string[];
  otherFees: string[];
  avgRating: number | null;
  reviewCount: number;
  nearestStopName: string | null;
  nearestStopMeters: number | null;
}

const roomSelection = {
  roomId: residenceRooms.id,
  roomName: residenceRooms.name,
  weeklyTariff: residenceRooms.weeklyTariff,
  contractTerm: residenceRooms.contractTerm,
  inclusions: residenceRooms.inclusions,
  otherFees: residenceRooms.otherFees,
  sequence: residenceRooms.sequence,
  residenceId: residences.id,
  residenceSlug: residences.slug,
  residenceName: residences.name,
  residentUndergrad: residences.residentUndergrad,
  residentPostgrad: residences.residentPostgrad,
  cateringType: residences.cateringType,
  address: residences.address,
  applyUrl: residences.applyUrl,
  applyNote: residences.applyNote,
  imageUrl: residences.imageUrl,
  latitude: residences.latitude,
  longitude: residences.longitude,
};

function toRoomSearchResult(
  row: {
    roomId: number;
    roomName: string;
    weeklyTariff: number | null;
    contractTerm: string | null;
    inclusions: string;
    otherFees: string;
    sequence: number;
    residenceId: number;
    residenceSlug: string;
    residenceName: string;
    residentUndergrad: boolean;
    residentPostgrad: boolean;
    cateringType: CateringType;
    address: string | null;
    applyUrl: string | null;
    applyNote: string | null;
    imageUrl: string | null;
    latitude: number | null;
    longitude: number | null;
  },
  stats: Map<number, { average: number | null; count: number }>,
  stops: ShuttleStop[],
): RoomSearchResult {
  const stat = stats.get(row.residenceId);
  const nearest = nearestShuttleStop(row.latitude, row.longitude, stops);
  return {
    roomId: row.roomId,
    roomName: row.roomName,
    weeklyTariff: row.weeklyTariff,
    contractTerm: row.contractTerm,
    sequence: row.sequence,
    residenceId: row.residenceId,
    residenceSlug: row.residenceSlug,
    residenceName: row.residenceName,
    residentUndergrad: row.residentUndergrad,
    residentPostgrad: row.residentPostgrad,
    cateringType: row.cateringType,
    address: row.address,
    applyUrl: row.applyUrl,
    applyNote: row.applyNote,
    imageUrl: row.imageUrl,
    inclusions: JSON.parse(row.inclusions) as string[],
    otherFees: JSON.parse(row.otherFees) as string[],
    avgRating: stat?.average ?? null,
    reviewCount: stat?.count ?? 0,
    nearestStopName: nearest.name,
    nearestStopMeters: nearest.meters,
  };
}

// Room-grained search: one row per room, joined to its residence, so results
// read "room X in accommodation Y" instead of a whole hall summarised by its
// cheapest rate. Filters/sort mirror searchResidences (same field names, so
// search.astro's <form> and every quick-start preset link keep working
// unchanged) — price now filters/sorts by the room's own weeklyTariff
// instead of the residence's weeklyRateFrom.
export function searchRooms(filters: RoomFilters): RoomSearchResult[] {
  const conditions = [];
  if (filters.type === "undergrad") conditions.push(eq(residences.residentUndergrad, true));
  if (filters.type === "postgrad") conditions.push(eq(residences.residentPostgrad, true));
  if (filters.type === "both") {
    conditions.push(eq(residences.residentUndergrad, true));
    conditions.push(eq(residences.residentPostgrad, true));
  }
  if (filters.catering) conditions.push(eq(residences.cateringType, filters.catering));
  if (filters.min !== undefined) conditions.push(gte(residenceRooms.weeklyTariff, filters.min));
  if (filters.max !== undefined) conditions.push(lte(residenceRooms.weeklyTariff, filters.max));
  if (filters.q) {
    const pattern = `%${filters.q}%`;
    conditions.push(or(like(residences.name, pattern), like(residences.blurb, pattern)));
  }

  const query = db
    .select(roomSelection)
    .from(residenceRooms)
    .innerJoin(residences, eq(residenceRooms.residenceId, residences.id));
  const rows = conditions.length > 0 ? query.where(and(...conditions)).all() : query.all();

  const stats = getAllReviewStats();
  const stops = listShuttleStops();
  let results = rows.map((row) => toRoomSearchResult(row, stats, stops));

  if (filters.minRating !== undefined) {
    const minRating = filters.minRating;
    results = results.filter((r) => r.avgRating !== null && r.avgRating >= minRating);
  }
  if (filters.maxDistance !== undefined) {
    const maxDistance = filters.maxDistance;
    results = results.filter((r) => r.nearestStopMeters !== null && r.nearestStopMeters <= maxDistance);
  }

  const sort = filters.sort ?? "name";
  // Room tariffs (and residence ratings/distances) can tie — five rooms
  // share the seed data's top price alone — so every branch falls back to a
  // stable secondary order (residence name, then the room's own display
  // sequence) rather than leaving tied rows in an arbitrary order.
  const tieBreak = (a: RoomSearchResult, b: RoomSearchResult) =>
    a.residenceName.localeCompare(b.residenceName) || a.sequence - b.sequence;

  return [...results].sort((a, b) => {
    switch (sort) {
      case "price_asc":
        return (a.weeklyTariff ?? Infinity) - (b.weeklyTariff ?? Infinity) || tieBreak(a, b);
      case "price_desc":
        return (b.weeklyTariff ?? -Infinity) - (a.weeklyTariff ?? -Infinity) || tieBreak(a, b);
      case "rating_desc":
        return (b.avgRating ?? -1) - (a.avgRating ?? -1) || tieBreak(a, b);
      case "distance_asc":
        return (a.nearestStopMeters ?? Infinity) - (b.nearestStopMeters ?? Infinity) || tieBreak(a, b);
      default:
        return tieBreak(a, b);
    }
  });
}

// Looks up specific rooms by id for /compare/ — one batched query (same
// shape as getShortlistIds/listShortlistedResidences) rather than one query
// per selected room, reordered to match the order ids were given in so a
// shared/bookmarked ?rooms=... URL renders its columns in a stable order.
// An id with no matching room (stale or hand-edited URL) is silently
// dropped rather than erroring.
export function getRoomsByIds(ids: number[]): RoomSearchResult[] {
  if (ids.length === 0) return [];
  const rows = db
    .select(roomSelection)
    .from(residenceRooms)
    .innerJoin(residences, eq(residenceRooms.residenceId, residences.id))
    .where(inArray(residenceRooms.id, ids))
    .all();

  const stats = getAllReviewStats();
  const stops = listShuttleStops();
  const byId = new Map(rows.map((row) => [row.roomId, toRoomSearchResult(row, stats, stops)]));
  return ids.map((id) => byId.get(id)).filter((r): r is RoomSearchResult => r !== undefined);
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
  socialVibe: SocialPreference | null;
  createdAt: string;
  username: string;
}

export function listReviews(residenceId: number): ReviewWithAuthor[] {
  return db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      body: reviews.body,
      socialVibe: reviews.socialVibe,
      createdAt: reviews.createdAt,
      username: users.username,
    })
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

export function upsertReview(
  userId: number,
  residenceId: number,
  rating: number,
  body: string,
  socialVibe: SocialPreference | null = null,
): void {
  db.insert(reviews)
    .values({ userId, residenceId, rating, body, socialVibe })
    .onConflictDoUpdate({
      target: [reviews.residenceId, reviews.userId],
      set: { rating, body, socialVibe },
    })
    .run();
}

export interface ResidenceSocialVibeSample {
  vibe: SocialPreference;
  count: number;
}

// A residence's most common reviewer-reported "social vibe" answer, with how
// many reviewers gave it — a real, crowd-sourced signal src/lib/match.ts
// prefers over its catering-based estimate. socialVibe is optional on a
// review, so a residence with no answers yet is simply absent from the map.
export function getResidenceSocialVibes(): Map<number, ResidenceSocialVibeSample> {
  const rows = db
    .select({
      residenceId: reviews.residenceId,
      socialVibe: reviews.socialVibe,
      count: sql<number>`count(*)`,
    })
    .from(reviews)
    .where(sql`${reviews.socialVibe} is not null`)
    .groupBy(reviews.residenceId, reviews.socialVibe)
    .all();

  const best = new Map<number, ResidenceSocialVibeSample>();
  for (const row of rows) {
    if (!row.socialVibe) continue;
    const current = best.get(row.residenceId);
    if (!current || row.count > current.count) {
      best.set(row.residenceId, { vibe: row.socialVibe as SocialPreference, count: row.count });
    }
  }
  return best;
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

// --- Mock contracts & resident requests ("My accommodation") ---
//
// A mock contract for the prototype's benefit only — see schema.ts. At most
// one active contract per user is enforced here (setMyAccommodation), one
// layer above the table itself, the same way upsertReview enforces "one
// review per user per residence" above its own unique() constraint.

export interface ActiveContract {
  id: number;
  roomId: number;
  roomName: string;
  residenceId: number;
  residenceName: string;
  residenceSlug: string;
  weeklyTariff: number | null;
  contractTerm: string | null;
  startDate: string;
  endDate: string | null;
  status: "active" | "cancelled";
  cancelledAt: string | null;
  cancellationSignature: string | null;
}

const contractSelection = {
  id: contracts.id,
  roomId: contracts.roomId,
  roomName: residenceRooms.name,
  residenceId: residences.id,
  residenceName: residences.name,
  residenceSlug: residences.slug,
  weeklyTariff: residenceRooms.weeklyTariff,
  contractTerm: residenceRooms.contractTerm,
  startDate: contracts.startDate,
  endDate: contracts.endDate,
  status: contracts.status,
  cancelledAt: contracts.cancelledAt,
  cancellationSignature: contracts.cancellationSignature,
};

function contractQuery() {
  return db
    .select(contractSelection)
    .from(contracts)
    .innerJoin(residenceRooms, eq(contracts.roomId, residenceRooms.id))
    .innerJoin(residences, eq(residenceRooms.residenceId, residences.id));
}

export function getActiveContract(userId: number): ActiveContract | undefined {
  return contractQuery().where(and(eq(contracts.userId, userId), eq(contracts.status, "active"))).get();
}

export function listContractHistory(userId: number): ActiveContract[] {
  return contractQuery()
    .where(and(eq(contracts.userId, userId), eq(contracts.status, "cancelled")))
    .orderBy(desc(contracts.id))
    .all();
}

// Scoped to the owning user, regardless of status — this is what backs the
// full contract document view (both the still-active document and the
// cancelled receipt read through the same page).
export function getContractById(userId: number, contractId: number): ActiveContract | undefined {
  return contractQuery().where(and(eq(contracts.id, contractId), eq(contracts.userId, userId))).get();
}

// Cancels any existing active contract for this user, then starts a new
// one — a user can only ever have one active mock contract at a time.
export function setMyAccommodation(userId: number, roomId: number): void {
  const room = db.select().from(residenceRooms).where(eq(residenceRooms.id, roomId)).get();
  if (!room) return;

  const now = new Date();
  const startDate = now.toISOString().slice(0, 10);
  const weeks = parseContractWeeks(room.contractTerm);
  const endDate =
    weeks != null ? new Date(now.getTime() + weeks * 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) : null;

  db.update(contracts)
    .set({ status: "cancelled", cancelledAt: sql`(datetime('now'))` })
    .where(and(eq(contracts.userId, userId), eq(contracts.status, "active")))
    .run();
  db.insert(contracts).values({ userId, roomId, startDate, endDate }).run();
}

// `signature` is the typed name from the cancellation notice's "sign" step
// (src/pages/contract/[id]/cancel.astro) — required so cancelling is a
// deliberate, reviewed action rather than a bare button press.
export function cancelMyContract(userId: number, signature: string): void {
  db.update(contracts)
    .set({ status: "cancelled", cancelledAt: sql`(datetime('now'))`, cancellationSignature: signature })
    .where(and(eq(contracts.userId, userId), eq(contracts.status, "active")))
    .run();
}

export type ResidentRequestKind = "maintenance" | "ra_message";

export function addResidentRequest(
  contractId: number,
  kind: ResidentRequestKind,
  category: string | null,
  message: string,
): void {
  db.insert(residentRequests).values({ contractId, kind, category, message }).run();
}

export function listResidentRequests(contractId: number, kind: ResidentRequestKind): ResidentRequest[] {
  return db
    .select()
    .from(residentRequests)
    .where(and(eq(residentRequests.contractId, contractId), eq(residentRequests.kind, kind)))
    .orderBy(desc(residentRequests.id))
    .all();
}

// Scoped by joining back to contracts.userId, so one user can't withdraw
// another's request by guessing its id — same guard style as
// removeFromShortlist's and(eq(userId), eq(residenceId)).
export function withdrawResidentRequest(userId: number, requestId: number): void {
  const owned = db
    .select({ id: residentRequests.id })
    .from(residentRequests)
    .innerJoin(contracts, eq(residentRequests.contractId, contracts.id))
    .where(and(eq(residentRequests.id, requestId), eq(contracts.userId, userId)))
    .get();
  if (!owned) return;
  db.update(residentRequests).set({ status: "withdrawn" }).where(eq(residentRequests.id, requestId)).run();
}
