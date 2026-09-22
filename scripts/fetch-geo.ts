// One-off data-prep script — NOT run at boot. Geocodes every residence
// address and ANU Civic Loop shuttle stop via OpenStreetMap Nominatim, then
// pulls nearby bus/tram stops, supermarkets and cafes for each residence via
// Overpass. Writes straight into seed/*.json, which scripts/seed.ts then
// upserts into the database at every boot.
//
// Run manually with `node scripts/fetch-geo.ts` after editing residence
// addresses. Rate-limited to respect Nominatim's "max 1 req/s, identify your
// app" usage policy: https://operations.osmfoundation.org/policies/nominatim/
import { readFileSync, writeFileSync } from "node:fs";

const USER_AGENT = "comp4020-crit7-residence-explorer/1.0 (student educational project, one-off batch geocoding)";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
// overpass-api.de itself is frequently 504-busy under load, and
// overpass.osm.ch turned out to mirror Switzerland only (silently returns 0
// elements for anywhere else) — lz4.overpass-api.de is the official
// load-balanced frontend and answered reliably in testing.
const OVERPASS_URLS = [
  "https://lz4.overpass-api.de/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function geocode(query: string): Promise<{ lat: number; lon: number } | null> {
  const url = `${NOMINATIM_URL}?format=json&limit=1&countrycodes=au&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Nominatim ${res.status} for "${query}"`);
  const rows = (await res.json()) as { lat: string; lon: string }[];
  if (rows.length === 0) return null;
  return { lat: Number(rows[0].lat), lon: Number(rows[0].lon) };
}

interface ResidenceRow {
  slug: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  [key: string]: unknown;
}

async function geocodeResidences(): Promise<ResidenceRow[]> {
  const residences: ResidenceRow[] = JSON.parse(readFileSync("./seed/residences.json", "utf8"));
  for (const r of residences) {
    if (!r.address) {
      console.warn(`skip geocode (no address): ${r.slug}`);
      continue;
    }
    // ANU building codes like "X001 Childers Street" aren't real street
    // numbers and confuse Nominatim's address parser — drop them.
    const query = r.address.replace(/^X\d+\s+/, "");
    const hit = await geocode(`${query}, Australia`);
    if (!hit) {
      console.warn(`no geocode result for ${r.slug}: ${r.address}`);
    } else {
      r.latitude = hit.lat;
      r.longitude = hit.lon;
      console.log(`geocoded ${r.slug}: ${hit.lat}, ${hit.lon}`);
    }
    await sleep(1100);
  }
  writeFileSync("./seed/residences.json", `${JSON.stringify(residences, null, 2)}\n`);
  return residences;
}

interface ShuttleStopDef {
  name: string;
  note: string | null;
  reuseSlug?: string;
  geocodeQuery?: string;
}

const SHUTTLE_STOPS: ShuttleStopDef[] = [
  { name: "ANU Rimmer Street", note: "Last loop of the day departs 7:18pm.", geocodeQuery: "Rimmer Street, Canberra ACT" },
  { name: "City West Alinga Street", note: null, geocodeQuery: "Alinga Street, Canberra ACT" },
  {
    name: "Marcus Clarke Street after Farrell Place",
    note: null,
    geocodeQuery: "Marcus Clarke Street, Canberra ACT",
  },
  {
    name: "Liversidge Street after Ellery Crescent",
    note: null,
    geocodeQuery: "Liversidge Street, Acton ACT",
  },
  { name: "Garran Road after Liversidge Street", note: null, geocodeQuery: "Garran Road, Acton ACT" },
  { name: "Garran Road at Graduate House", note: null, reuseSlug: "graduate-house" },
  { name: "Ward Street (via Yukeembruk)", note: null, reuseSlug: "yukeembruk" },
  { name: "Dickson Road (via Wamburun)", note: null, reuseSlug: "wamburun-hall" },
  { name: "Daley Road at Burton & Garran Hall", note: null, reuseSlug: "burton-garran-hall" },
  { name: "Daley Road at Bruce Hall", note: null, reuseSlug: "bruce-hall-main-wing" },
  { name: "Daley Road at Fulton Muir", note: null, geocodeQuery: "Daley Road, Acton ACT" },
  {
    name: "Canberra Centre (Ainslie Avenue)",
    note: "Evening-only: served at 6:48pm on weeknights, not on the regular daytime loop.",
    geocodeQuery: "Ainslie Avenue, Canberra ACT",
  },
];

async function geocodeShuttleStops(residences: ResidenceRow[]): Promise<void> {
  const bySlug = new Map(residences.map((r) => [r.slug, r]));
  const stops: { name: string; sequence: number; latitude: number; longitude: number; note: string | null }[] = [];

  for (let i = 0; i < SHUTTLE_STOPS.length; i++) {
    const def = SHUTTLE_STOPS[i];
    let coords: { lat: number; lon: number } | null = null;

    if (def.reuseSlug) {
      const r = bySlug.get(def.reuseSlug);
      if (r?.latitude != null && r.longitude != null) {
        coords = { lat: r.latitude, lon: r.longitude };
      } else {
        console.warn(`reuseSlug ${def.reuseSlug} has no coords yet, falling back to geocoding`);
      }
    }

    if (!coords && def.geocodeQuery) {
      coords = await geocode(`${def.geocodeQuery}, Australia`);
      await sleep(1100);
    }

    if (!coords) {
      console.warn(`no coords for shuttle stop: ${def.name}`);
      continue;
    }

    stops.push({ name: def.name, sequence: i + 1, latitude: coords.lat, longitude: coords.lon, note: def.note });
    console.log(`shuttle stop ${def.name}: ${coords.lat}, ${coords.lon}`);
  }

  writeFileSync("./seed/shuttle-stops.json", `${JSON.stringify(stops, null, 2)}\n`);
}

interface OverpassElement {
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

function categoryFor(
  tags: Record<string, string> | undefined,
): "bus_stop" | "tram_stop" | "supermarket" | "cafe" | "bicycle_parking" | null {
  if (!tags) return null;
  if (tags.highway === "bus_stop") return "bus_stop";
  if (tags.railway === "tram_stop") return "tram_stop";
  if (tags.shop === "supermarket") return "supermarket";
  if (tags.amenity === "cafe") return "cafe";
  if (tags.amenity === "bicycle_parking") return "bicycle_parking";
  return null;
}

async function fetchWithTimeout(url: string, body: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "User-Agent": USER_AGENT, "Content-Type": "text/plain" },
      body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

// One query over the whole campus bounding box, instead of one per
// residence — the public Overpass mirrors rate-limit aggressively per
// caller, so 19 sequential queries kept tripping 429s and hangs. Nearest
// per-residence matches are computed locally afterwards.
async function overpassBbox(south: number, west: number, north: number, east: number): Promise<OverpassElement[]> {
  const query = `
    [out:json][timeout:60];
    (
      node(${south},${west},${north},${east})[highway=bus_stop];
      node(${south},${west},${north},${east})[railway=tram_stop];
      node(${south},${west},${north},${east})[shop=supermarket];
      node(${south},${west},${north},${east})[amenity=cafe];
      node(${south},${west},${north},${east})[amenity=bicycle_parking];
    );
    out body;
  `;
  let lastError: unknown;
  for (const url of OVERPASS_URLS) {
    try {
      console.log(`querying ${url}...`);
      const res = await fetchWithTimeout(url, query, 30000);
      if (!res.ok) {
        lastError = new Error(`${url} responded ${res.status}`);
        console.warn(String(lastError));
        continue;
      }
      const json = (await res.json()) as { elements: OverpassElement[] };
      return json.elements;
    } catch (err) {
      lastError = err;
      console.warn(`${url} failed: ${(err as Error).message}`);
    }
  }
  throw new Error(`Overpass exhausted all mirrors: ${(lastError as Error)?.message}`);
}

async function fetchNearbyPlaces(residences: ResidenceRow[]): Promise<void> {
  const located = residences.filter(
    (r): r is ResidenceRow & { latitude: number; longitude: number } => r.latitude != null && r.longitude != null,
  );
  if (located.length === 0) {
    console.warn("no residences have coordinates — skipping nearby-places fetch");
    writeFileSync("./seed/nearby-places.json", "[]\n");
    return;
  }

  const pad = 0.012; // ~1.3km at this latitude, enough to cover every radius below
  const south = Math.min(...located.map((r) => r.latitude)) - pad;
  const north = Math.max(...located.map((r) => r.latitude)) + pad;
  const west = Math.min(...located.map((r) => r.longitude)) - pad;
  const east = Math.max(...located.map((r) => r.longitude)) + pad;

  const elements = await overpassBbox(south, west, north, east);
  console.log(`overpass returned ${elements.length} elements in the bounding box`);

  const RADIUS_BY_CATEGORY: Record<string, number> = {
    bus_stop: 900,
    tram_stop: 1500,
    supermarket: 1000,
    cafe: 800,
    bicycle_parking: 400,
  };

  const results: {
    residenceSlug: string;
    category: string;
    name: string | null;
    latitude: number;
    longitude: number;
    distanceMeters: number;
    sourceId: string;
  }[] = [];

  for (const r of located) {
    const byCategory = new Map<string, { el: OverpassElement; distance: number }[]>();
    for (const el of elements) {
      const category = categoryFor(el.tags);
      if (!category) continue;
      const distance = Math.round(haversineMeters(r.latitude, r.longitude, el.lat, el.lon));
      if (distance > RADIUS_BY_CATEGORY[category]) continue;
      const list = byCategory.get(category) ?? [];
      list.push({ el, distance });
      byCategory.set(category, list);
    }
    for (const [category, list] of byCategory) {
      list.sort((a, b) => a.distance - b.distance);
      for (const { el, distance } of list.slice(0, 2)) {
        results.push({
          residenceSlug: r.slug,
          category,
          name: el.tags?.name ?? null,
          latitude: el.lat,
          longitude: el.lon,
          distanceMeters: distance,
          sourceId: `node/${el.id}`,
        });
      }
    }
    console.log(`nearby places for ${r.slug}: ${[...byCategory.entries()].map(([c, l]) => `${c}=${l.length}`).join(", ")}`);
    await sleep(4000);
  }

  writeFileSync("./seed/nearby-places.json", `${JSON.stringify(results, null, 2)}\n`);
}

async function main() {
  const nearbyOnly = process.argv.includes("--nearby-only");
  let residences: ResidenceRow[];
  if (nearbyOnly) {
    residences = JSON.parse(readFileSync("./seed/residences.json", "utf8"));
  } else {
    console.log("Geocoding residences...");
    residences = await geocodeResidences();
    console.log("Geocoding shuttle stops...");
    await geocodeShuttleStops(residences);
  }
  console.log("Fetching nearby places via Overpass...");
  await fetchNearbyPlaces(residences);
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
