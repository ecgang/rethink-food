/**
 * Ingest real NYC restaurant names + locations from NYC Open Data.
 * Source: DOHMH Restaurant Inspection Results, Socrata dataset 43nn-pn8j.
 *   https://data.cityofnewyork.us/Health/DOHMH-New-York-City-Restaurant-Inspection-Results/43nn-pn8j
 *
 * Real establishments are assigned to the nearest ingested neighborhood centroid
 * (data/neighborhoods.json) and a few distinct ones are kept per neighborhood to
 * stand in as Rethink Certified restaurant partners. `minorityOwned` is NOT in the
 * source — it's a deterministic synthetic flag (~80%, matching the impact report),
 * and the README notes that partner associations are illustrative.
 * Output: data/restaurants.json (committed). Re-run with `npm run ingest`.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ENDPOINT = "https://data.cityofnewyork.us/resource/43nn-pn8j.json";
const PER_NEIGHBORHOOD = 3;

// cuisines that aren't full-meal producers — excluded from partner candidates
const EXCLUDE_CUISINE = new Set([
  "Coffee/Tea", "Donuts", "Bakery Products/Desserts", "Frozen Desserts",
  "Juice, Smoothies, Fruit Salads", "Bottled Beverages", "Hotdogs",
  "Nuts/Confectionary", "Bagels/Pretzels", "Sandwiches", "Not Listed/Not Applicable",
]);

interface Neighborhood {
  borough: string;
  neighborhood: string;
  lat: number;
  lng: number;
}
interface RestRow {
  camis?: string;
  dba?: string;
  boro?: string;
  cuisine_description?: string;
  latitude?: string;
  longitude?: string;
}
interface RestaurantPartner {
  name: string;
  borough: string;
  cuisine: string;
  lat: number;
  lng: number;
  neighborhood: string;
  minorityOwned: boolean;
}

const titleCase = (s: string) =>
  s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).trim();

// deterministic ~80% true from the name
const synthMinorityOwned = (name: string) => {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 10 < 8;
};

const dist2 = (a: Neighborhood, lat: number, lng: number) =>
  (a.lat - lat) ** 2 + (a.lng - lng) ** 2;

async function main() {
  const hoods: Neighborhood[] = JSON.parse(
    await readFile(path.join(process.cwd(), "data", "neighborhoods.json"), "utf8"),
  );
  const boroughs = [...new Set(hoods.map((h) => h.borough))];

  const picked: RestaurantPartner[] = [];
  const seenNames = new Set<string>();

  for (const boro of boroughs) {
    const where = encodeURIComponent(`boro='${boro}' AND latitude IS NOT NULL`);
    const url = `${ENDPOINT}?$select=camis,dba,boro,cuisine_description,latitude,longitude&$where=${where}&$limit=3000`;
    console.log(`Fetching DOHMH restaurants for ${boro}…`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Socrata ${res.status} for ${boro}`);
    const rows = (await res.json()) as RestRow[];

    const hoodsInBoro = hoods.filter((h) => h.borough === boro);
    const perHood: Record<string, RestaurantPartner[]> = {};
    for (const h of hoodsInBoro) perHood[h.neighborhood] = [];

    // assign each real establishment to its nearest neighborhood centroid
    for (const r of rows) {
      if (!r.dba || !r.latitude || !r.longitude) continue;
      const cuisine = r.cuisine_description ?? "";
      if (EXCLUDE_CUISINE.has(cuisine)) continue;
      const lat = Number(r.latitude);
      const lng = Number(r.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const name = titleCase(r.dba);
      if (name.length < 3 || seenNames.has(name)) continue;

      let nearest = hoodsInBoro[0];
      let best = Infinity;
      for (const h of hoodsInBoro) {
        const d = dist2(h, lat, lng);
        if (d < best) {
          best = d;
          nearest = h;
        }
      }
      // ~1.2km cap so we don't attach far-flung restaurants
      if (best > 0.013 ** 2 * 1.2 || !nearest) continue;
      if (perHood[nearest.neighborhood].length >= PER_NEIGHBORHOOD) continue;

      seenNames.add(name);
      perHood[nearest.neighborhood].push({
        name,
        borough: boro,
        cuisine: cuisine || "American",
        lat: Number(lat.toFixed(5)),
        lng: Number(lng.toFixed(5)),
        neighborhood: nearest.neighborhood,
        minorityOwned: synthMinorityOwned(name),
      });
    }
    for (const h of hoodsInBoro) picked.push(...perHood[h.neighborhood]);
  }

  await writeFile(
    path.join(process.cwd(), "data", "restaurants.json"),
    JSON.stringify(picked, null, 2) + "\n",
  );
  console.log(`Wrote data/restaurants.json — ${picked.length} real restaurants`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
