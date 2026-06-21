/**
 * Ingest real NYC neighborhood geography from NYC Open Data.
 * Source: 2020 Neighborhood Tabulation Areas (NTAs), Socrata dataset 9nt8-h7nd.
 *   https://data.cityofnewyork.us/City-Government/2020-Neighborhood-Tabulation-Areas-NTAs-/9nt8-h7nd
 *
 * We pick a curated set of high-need NTAs across all five boroughs and compute a
 * centroid for each (average of polygon vertices — adequate for map placement).
 * Output is committed to data/neighborhoods.json so seeding is deterministic and
 * offline-safe. Re-run with `npm run ingest`.
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const ENDPOINT = "https://data.cityofnewyork.us/resource/9nt8-h7nd.json";

// Curated target neighborhoods, borough-qualified so a name can't match the
// wrong borough (e.g. "Jamaica" must be Queens, not Brooklyn's Jamaica Bay).
// Spans all boroughs, aligned to the Social Care Network coverage we model.
const TARGETS: { name: string; borough: string }[] = [
  { name: "Mott Haven", borough: "Bronx" }, // SOMOS
  { name: "Fordham", borough: "Bronx" },
  { name: "Belmont", borough: "Bronx" },
  { name: "Brownsville", borough: "Brooklyn" }, // PHS
  { name: "Bedford", borough: "Brooklyn" },
  { name: "Sunset Park", borough: "Brooklyn" },
  { name: "Corona", borough: "Queens" }, // PHS
  { name: "Jamaica", borough: "Queens" },
  { name: "Elmhurst", borough: "Queens" },
  { name: "East Harlem", borough: "Manhattan" }, // PHS
  { name: "Washington Heights", borough: "Manhattan" },
  { name: "Stapleton", borough: "Staten Island" }, // SIPPS
  { name: "Port Richmond", borough: "Staten Island" },
];

interface NtaRow {
  ntaname?: string;
  boroname?: string;
  nta2020?: string;
  the_geom?: { type: string; coordinates: unknown };
}

interface Neighborhood {
  borough: string;
  neighborhood: string;
  ntacode: string;
  lat: number;
  lng: number;
}

function centroid(geom: NtaRow["the_geom"]): { lat: number; lng: number } | null {
  if (!geom) return null;
  let sx = 0;
  let sy = 0;
  let n = 0;
  // recurse to the innermost [lng, lat] pairs
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      if (typeof node[0] === "number" && typeof node[1] === "number") {
        sx += node[0] as number;
        sy += node[1] as number;
        n += 1;
      } else {
        for (const child of node) walk(child);
      }
    }
  };
  walk(geom.coordinates);
  if (n === 0) return null;
  return { lng: sx / n, lat: sy / n };
}

async function main() {
  const url = `${ENDPOINT}?$select=ntaname,boroname,nta2020,the_geom&$limit=2000`;
  console.log("Fetching NTA 2020 from NYC Open Data…");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Socrata ${res.status}`);
  const rows = (await res.json()) as NtaRow[];
  console.log(`  received ${rows.length} NTAs`);

  const out: Neighborhood[] = [];
  const usedBoroughs = new Set<string>();
  for (const target of TARGETS) {
    const match = rows.find(
      (r) =>
        r.ntaname?.toLowerCase().includes(target.name.toLowerCase()) &&
        r.boroname === target.borough &&
        r.the_geom,
    );
    if (!match) {
      console.warn(`  ! no NTA matched "${target.name}" in ${target.borough}`);
      continue;
    }
    const c = centroid(match.the_geom);
    if (!c) continue;
    if (out.some((o) => o.neighborhood === match.ntaname)) continue; // dedupe
    out.push({
      borough: match.boroname ?? "",
      neighborhood: match.ntaname ?? target.name,
      ntacode: match.nta2020 ?? "",
      lat: Number(c.lat.toFixed(5)),
      lng: Number(c.lng.toFixed(5)),
    });
    usedBoroughs.add(match.boroname ?? "");
  }

  const dir = path.join(process.cwd(), "data");
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, "neighborhoods.json"),
    JSON.stringify(out, null, 2) + "\n",
  );
  console.log(
    `Wrote data/neighborhoods.json — ${out.length} neighborhoods across ${usedBoroughs.size} boroughs`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
