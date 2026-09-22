// Upserts hand-curated residence content (seed/*.json) into already-migrated
// tables. This is NOT a drizzle-kit migration: the shape of the tables comes
// from src/lib/schema.ts + `pnpm db:generate`, but the rows themselves are
// reference data that changes without ever touching the schema. Called once
// at boot from src/lib/db.ts, right after migrations run. Safe to call
// repeatedly — every write here is an upsert or a delete-then-reinsert.
import { eq } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/better-sqlite3";
import nearbyPlacesData from "../seed/nearby-places.json";
import residencesData from "../seed/residences.json";
import shuttleStopsData from "../seed/shuttle-stops.json";
import {
  nearbyPlaces,
  residenceFeatures,
  residenceGalleryImages,
  residenceRooms,
  residences,
  shuttleStops,
} from "../src/lib/schema";

type CateringType = "self_catered" | "catered" | "flexi_catered";
type PlaceCategory = "bus_stop" | "tram_stop" | "supermarket" | "cafe" | "bicycle_parking";

interface ResidenceSeed {
  slug: string;
  name: string;
  anuUrl: string;
  applyUrl: string | null;
  applyNote: string | null;
  residentUndergrad: boolean;
  residentPostgrad: boolean;
  cateringType: CateringType;
  weeklyRateFrom: number | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  capacity: number | null;
  capacityNote: string | null;
  blurb: string;
  accessibilityNote: string | null;
  feeNote: string | null;
  imageUrl: string | null;
  features: string[];
  gallery: { url: string; alt: string }[];
  rooms: { name: string; weeklyTariff: number | null; contractTerm: string | null; inclusions: string[]; otherFees: string[] }[];
}

interface NearbyPlaceSeed {
  residenceSlug: string;
  category: PlaceCategory;
  name: string | null;
  latitude: number;
  longitude: number;
  distanceMeters: number;
  sourceId: string | null;
}

interface ShuttleStopSeed {
  name: string;
  sequence: number;
  latitude: number;
  longitude: number;
  note: string | null;
}

export function seed(db: ReturnType<typeof drizzle>): void {
  const bySlug = new Map<string, number>();

  for (const r of residencesData as ResidenceSeed[]) {
    const { features, gallery, rooms, ...residence } = r;
    const row = db
      .insert(residences)
      .values(residence)
      .onConflictDoUpdate({ target: residences.slug, set: residence })
      .returning({ id: residences.id })
      .get();
    bySlug.set(r.slug, row.id);

    db.delete(residenceFeatures).where(eq(residenceFeatures.residenceId, row.id)).run();
    for (const feature of features) {
      db.insert(residenceFeatures).values({ residenceId: row.id, feature }).run();
    }

    db.delete(residenceGalleryImages).where(eq(residenceGalleryImages.residenceId, row.id)).run();
    gallery.forEach((image, sequence) => {
      db.insert(residenceGalleryImages)
        .values({ residenceId: row.id, url: image.url, alt: image.alt, sequence })
        .run();
    });

    db.delete(residenceRooms).where(eq(residenceRooms.residenceId, row.id)).run();
    rooms.forEach((room, sequence) => {
      db.insert(residenceRooms)
        .values({
          residenceId: row.id,
          name: room.name,
          weeklyTariff: room.weeklyTariff,
          contractTerm: room.contractTerm,
          inclusions: JSON.stringify(room.inclusions),
          otherFees: JSON.stringify(room.otherFees),
          sequence,
        })
        .run();
    });

    db.delete(nearbyPlaces).where(eq(nearbyPlaces.residenceId, row.id)).run();
  }

  for (const p of nearbyPlacesData as NearbyPlaceSeed[]) {
    const residenceId = bySlug.get(p.residenceSlug);
    if (residenceId === undefined) continue;
    db.insert(nearbyPlaces)
      .values({
        residenceId,
        category: p.category,
        name: p.name,
        latitude: p.latitude,
        longitude: p.longitude,
        distanceMeters: p.distanceMeters,
        sourceId: p.sourceId,
      })
      .run();
  }

  for (const s of shuttleStopsData as ShuttleStopSeed[]) {
    db.insert(shuttleStops).values(s).onConflictDoUpdate({ target: shuttleStops.name, set: s }).run();
  }
}
