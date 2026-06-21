/**
 * Ingest Rethink Food's REAL partner network — the "A Network of Change" directory
 * published on rethinkfood.org (restaurant partners + community-based orgs, with
 * public addresses). NYC entries only (the demo's markets are NYC NTAs).
 *
 * Addresses are geocoded to lat/lng via the free US Census Geocoder (no key); on a
 * miss we fall back to the partner's borough centroid (from data/neighborhoods.json).
 * Output: data/restaurants.json + data/cbos.json (committed). Re-run: `npm run ingest`.
 *
 * Associations are Rethink's own published partners; coordinates are derived.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type Kind = "restaurant" | "cbo";
interface Partner {
  name: string;
  kind: Kind;
  borough: string;
  address: string; // full one-line address for geocoding
  certified?: boolean; // "Rethink Certified"
}

// — Restaurant partners (NYC) —
const RESTAURANTS: Partner[] = [
  { name: "8 Bit Bites — Bed-Stuy", kind: "restaurant", borough: "Brooklyn", address: "967 Bedford Avenue, Brooklyn, NY 11205" },
  { name: "8 Bit Bites — Bushwick", kind: "restaurant", borough: "Brooklyn", address: "881 Lexington Avenue, Brooklyn, NY 11221" },
  { name: "8 Bit Bites — Chelsea", kind: "restaurant", borough: "Manhattan", address: "197 7th Avenue, New York, NY 10011" },
  { name: "8 Bit Bites — Court Street", kind: "restaurant", borough: "Brooklyn", address: "113 Court Street, Brooklyn, NY 11201" },
  { name: "8 Bit Bites — East Village", kind: "restaurant", borough: "Manhattan", address: "77 2nd Avenue, New York, NY 10003" },
  { name: "Atomic Wings", kind: "restaurant", borough: "Queens", address: "159-23 Hillside Avenue, Jamaica, NY 11432" },
  { name: "Bahar Masala", kind: "restaurant", borough: "Brooklyn", address: "984 Coney Island Avenue, Brooklyn, NY 11230", certified: true },
  { name: "Benny's Cuban Cafe", kind: "restaurant", borough: "Queens", address: "71-28 Fresh Pond Road, Ridgewood, NY 11385" },
  { name: "Brain Food", kind: "restaurant", borough: "Brooklyn", address: "111 Court Street, Brooklyn, NY 11201", certified: true },
  { name: "Chefscape", kind: "restaurant", borough: "Manhattan", address: "10 Desbrosses Street, New York, NY 10013" },
  { name: "Collective Fare", kind: "restaurant", borough: "Brooklyn", address: "345A Nostrand Avenue, Brooklyn, NY 11216" },
  { name: "Curry House", kind: "restaurant", borough: "Manhattan", address: "9 Pell Street, New York, NY 10013" },
  { name: "Eleven Madison Park", kind: "restaurant", borough: "Manhattan", address: "11 Madison Avenue, New York, NY 10010" },
  { name: "Estrella Latina", kind: "restaurant", borough: "Queens", address: "39-07 104th Street, Corona, NY 11368" },
  { name: "Fiddler's Glatt", kind: "restaurant", borough: "Manhattan", address: "500 Grand Street, New York, NY 10002" },
  { name: "Flavors Corner", kind: "restaurant", borough: "Queens", address: "10-18 41st Avenue, Long Island City, NY 11101" },
  { name: "Fraiche", kind: "restaurant", borough: "Brooklyn", address: "56 Marcy Avenue, Brooklyn, NY 11211" },
  { name: "Good Eats Bistro", kind: "restaurant", borough: "Queens", address: "100-15 Ditmars Boulevard, East Elmhurst, NY 11369" },
  { name: "Havana Cafe", kind: "restaurant", borough: "Bronx", address: "3151 East Tremont Avenue, Bronx, NY 10461" },
  { name: "Katie O's", kind: "restaurant", borough: "Brooklyn", address: "452 East New York Avenue, Brooklyn, NY 11225" },
  { name: "Lebanese Eatery", kind: "restaurant", borough: "Staten Island", address: "1686 Forest Avenue, Staten Island, NY 10302" },
  { name: "Lore", kind: "restaurant", borough: "Brooklyn", address: "441 7th Avenue, Brooklyn, NY 11215" },
  { name: "Manna's Soul Food & Salad Bar", kind: "restaurant", borough: "Manhattan", address: "320 Saint Nicholas Avenue, New York, NY 10027", certified: true },
  { name: "Marina Del Rey", kind: "restaurant", borough: "Bronx", address: "1 Marina Drive, Bronx, NY 10465" },
  { name: "Marlow Bistro", kind: "restaurant", borough: "Manhattan", address: "1018 Amsterdam Avenue, New York, NY 10025", certified: true },
  { name: "New Wing Wong", kind: "restaurant", borough: "Manhattan", address: "42 Bowery, New York, NY 10013" },
  { name: "Radish", kind: "restaurant", borough: "Brooklyn", address: "58 Dobbin Street, Brooklyn, NY 11222" },
  { name: "Ras Plant Based", kind: "restaurant", borough: "Brooklyn", address: "739 Franklin Avenue, Brooklyn, NY 11238" },
  { name: "Rob's Kitchen", kind: "restaurant", borough: "Bronx", address: "172 Lafayette Avenue, Bronx, NY 10473", certified: true },
  { name: "Sophie's Cuban — Flushing Ave", kind: "restaurant", borough: "Brooklyn", address: "630 Flushing Avenue, Brooklyn, NY 11206", certified: true },
  { name: "Sophie's Cuban Cuisine — Flatiron", kind: "restaurant", borough: "Manhattan", address: "664 6th Avenue, New York, NY 10010" },
  { name: "Sophie's Cuban Cuisine — Hell's Kitchen", kind: "restaurant", borough: "Manhattan", address: "947 8th Avenue, New York, NY 10019" },
  { name: "Sophie's Cuban Cuisine — Midtown East", kind: "restaurant", borough: "Manhattan", address: "369 Lexington Avenue, New York, NY 10017" },
  { name: "Sophie's Cuban Cuisine — Union Square", kind: "restaurant", borough: "Manhattan", address: "28 East 12th Street, New York, NY 10003" },
  { name: "Zaab Zaab Talay", kind: "restaurant", borough: "Brooklyn", address: "208 Grand Street, Brooklyn, NY 11211", certified: true },
];

// — Community-based organizations (NYC) —
const CBOS: Partner[] = [
  { name: "A House on Beekman", kind: "cbo", borough: "Bronx", address: "452 East 149th Street, Bronx, NY 10455" },
  { name: "Agape Food Rescue", kind: "cbo", borough: "Brooklyn", address: "276 Chestnut Street, Brooklyn, NY 11208" },
  { name: "Alliance for Positive Change", kind: "cbo", borough: "Manhattan", address: "64 West 35th Street, New York, NY 10001" },
  { name: "Alliance for Positive Change — Keith Haring Harlem Center", kind: "cbo", borough: "Manhattan", address: "315 East 104th Street, New York, NY 10029" },
  { name: "Andromeda Community Initiative", kind: "cbo", borough: "Queens", address: "49-12 31st Place, Long Island City, NY 11101" },
  { name: "Apex for Youth", kind: "cbo", borough: "Manhattan", address: "195 Chrystie Street, New York, NY 10002" },
  { name: "Apex for Youth — Sunset Park High School", kind: "cbo", borough: "Brooklyn", address: "153 35th Street, Brooklyn, NY 11232" },
  { name: "APNA Brooklyn Community Center", kind: "cbo", borough: "Brooklyn", address: "2033 Bath Avenue, Brooklyn, NY 11214" },
  { name: "Bronx Community College", kind: "cbo", borough: "Bronx", address: "2155 University Avenue, Bronx, NY 10453" },
  { name: "Bushwick-Hylan Cornerstone Community Center", kind: "cbo", borough: "Brooklyn", address: "50 Humboldt Street, Brooklyn, NY 11206" },
  { name: "CHiPS", kind: "cbo", borough: "Brooklyn", address: "200 4th Avenue, Brooklyn, NY 11217" },
  { name: "Chung Pak Community Fridge", kind: "cbo", borough: "Manhattan", address: "96 Baxter Street, New York, NY 10013" },
  { name: "Citymeals on Wheels", kind: "cbo", borough: "Manhattan", address: "355 Lexington Avenue, New York, NY 10017" },
  { name: "Code For Life", kind: "cbo", borough: "Bronx", address: "256 East 138th Street, Bronx, NY 10451" },
  { name: "Collective Food Works", kind: "cbo", borough: "Brooklyn", address: "345A Nostrand Avenue, Brooklyn, NY 11216" },
  { name: "Community Counseling & Mediation — Georgia's Place", kind: "cbo", borough: "Brooklyn", address: "691 Prospect Place, Brooklyn, NY 11216" },
  { name: "Congregation Sons of Israel", kind: "cbo", borough: "Bronx", address: "2521 Cruger Avenue, Bronx, NY 10467" },
  { name: "Covenant House New York", kind: "cbo", borough: "Manhattan", address: "460 West 41st Street, New York, NY 10018" },
  { name: "Crossroads Community Services", kind: "cbo", borough: "Manhattan", address: "108 East 51st Street, New York, NY 10022" },
  { name: "Faith United Methodist Church", kind: "cbo", borough: "Staten Island", address: "221 Heberton Avenue, Staten Island, NY 10302" },
  { name: "First Spanish United Methodist Church", kind: "cbo", borough: "Manhattan", address: "163 East 111th Street, New York, NY 10029" },
  { name: "Garden of Hope", kind: "cbo", borough: "Queens", address: "135-20 35th Avenue, Flushing, NY 11354" },
  { name: "Graffiti 2 Community Ministries", kind: "cbo", borough: "Bronx", address: "606 East 141st Street, Bronx, NY 10454" },
  { name: "Hebrew Institute of Riverdale", kind: "cbo", borough: "Bronx", address: "3700 Henry Hudson Parkway, Bronx, NY 10463" },
  { name: "Henry Street Settlement", kind: "cbo", borough: "Manhattan", address: "301 Henry Street, New York, NY 10002" },
  { name: "ICNA Relief USA", kind: "cbo", borough: "Queens", address: "87-91 144th Street, Jamaica, NY 11435" },
  { name: "Kingsbridge Center of Israel Kosher Food Pantry", kind: "cbo", borough: "Bronx", address: "5905 Riverdale Avenue, Bronx, NY 10471" },
  { name: "LaGuardia CARES", kind: "cbo", borough: "Queens", address: "31-10 Thomson Avenue, Long Island City, NY 11101" },
  { name: "Los Sures Social Services", kind: "cbo", borough: "Brooklyn", address: "145 South 3rd Street, Brooklyn, NY 11211" },
  { name: "Mary Mitchell Family & Youth Center", kind: "cbo", borough: "Bronx", address: "2007 Mapes Avenue, Bronx, NY 10460" },
  { name: "Masjid Rahmatillah", kind: "cbo", borough: "Staten Island", address: "141 Park Hill Avenue, Staten Island, NY 10304" },
  { name: "NeON Nutrition Kitchen — Brooklyn", kind: "cbo", borough: "Brooklyn", address: "345 Adams Street, Brooklyn, NY 11201" },
  { name: "NeON Nutrition Kitchen — Staten Island", kind: "cbo", borough: "Staten Island", address: "340 Bay Street, Staten Island, NY 10301" },
  { name: "New Life NYC", kind: "cbo", borough: "Manhattan", address: "145 Ludlow Street, New York, NY 10002" },
  { name: "North Brooklyn Angels", kind: "cbo", borough: "Brooklyn", address: "1 Havemeyer Street, Brooklyn, NY 11211" },
  { name: "One Love Community Fridge", kind: "cbo", borough: "Brooklyn", address: "432 Myrtle Avenue, Brooklyn, NY 11205" },
  { name: "Plaza Del Sol Family Health Center", kind: "cbo", borough: "Queens", address: "37-16 108th Street, Corona, NY 11368" },
  { name: "Queens Community House — Pomonok", kind: "cbo", borough: "Queens", address: "67-09 Kissena Boulevard, Flushing, NY 11367" },
  { name: "RAP4Bronx — BronxWorks Betances Community Center", kind: "cbo", borough: "Bronx", address: "547 East 146th Street, Bronx, NY 10455" },
  { name: "RAP4Bronx — BronxWorks Melrose Community Center", kind: "cbo", borough: "Bronx", address: "286 East 156th Street, Bronx, NY 10451" },
  { name: "RAP4Bronx — Love Gospel Assembly", kind: "cbo", borough: "Bronx", address: "2323 Grand Concourse, Bronx, NY 10468" },
  { name: "Ravenswood Community Center", kind: "cbo", borough: "Queens", address: "35-40 21st Street, Long Island City, NY 11106" },
  { name: "REACH Family & Education Center", kind: "cbo", borough: "Brooklyn", address: "98 5th Avenue, Brooklyn, NY 11217" },
  { name: "Redemption Church Red Hook", kind: "cbo", borough: "Brooklyn", address: "27 Huntington Street, Brooklyn, NY 11231" },
  { name: "Ronald McDonald House New York", kind: "cbo", borough: "Manhattan", address: "405 East 73rd Street, New York, NY 10021" },
  { name: "Salem United Methodist Church", kind: "cbo", borough: "Manhattan", address: "2190 Adam Clayton Powell Jr Boulevard, New York, NY 10027" },
  { name: "St. John's Bread & Life", kind: "cbo", borough: "Brooklyn", address: "795 Lexington Avenue, Brooklyn, NY 11221" },
  { name: "St. Mark's United Methodist Church", kind: "cbo", borough: "Brooklyn", address: "2017 Beverley Road, Brooklyn, NY 11226" },
  { name: "The Bowery Mission", kind: "cbo", borough: "Manhattan", address: "227 Bowery, New York, NY 10002" },
  { name: "The Open Door — East Harlem", kind: "cbo", borough: "Manhattan", address: "2017 1st Avenue, New York, NY 10029" },
  { name: "Union Pool Food Pantry", kind: "cbo", borough: "Brooklyn", address: "484 Union Avenue, Brooklyn, NY 11211" },
  { name: "United Jewish Council of the East Side", kind: "cbo", borough: "Manhattan", address: "1517 Willett Street, New York, NY 10002" },
];

interface Neighborhood {
  borough: string;
  lat: number;
  lng: number;
}

const CENSUS =
  "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";

async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  const url = `${CENSUS}?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current&format=json`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      result?: { addressMatches?: { coordinates?: { x: number; y: number } }[] };
    };
    const c = data.result?.addressMatches?.[0]?.coordinates;
    return c ? { lat: c.y, lng: c.x } : null;
  } catch {
    return null;
  }
}

async function main() {
  const hoods: Neighborhood[] = JSON.parse(
    await readFile(path.join(process.cwd(), "data", "neighborhoods.json"), "utf8"),
  );
  // borough fallback centroid = average of that borough's neighborhood centroids
  const boroughCentroid = (borough: string) => {
    const inB = hoods.filter((h) => h.borough === borough);
    const list = inB.length ? inB : hoods;
    return {
      lat: list.reduce((s, h) => s + h.lat, 0) / list.length,
      lng: list.reduce((s, h) => s + h.lng, 0) / list.length,
    };
  };

  const all = [...RESTAURANTS, ...CBOS];
  let geocoded = 0;
  let fell = 0;
  const resolved = [];
  for (const p of all) {
    const g = (await geocode(p.address)) ?? null;
    const coord = g ?? boroughCentroid(p.borough);
    if (g) geocoded++;
    else fell++;
    resolved.push({ ...p, lat: Number(coord.lat.toFixed(5)), lng: Number(coord.lng.toFixed(5)) });
  }
  console.log(`Geocoded ${geocoded}/${all.length} via Census; ${fell} fell back to borough centroid.`);

  const restaurants = resolved
    .filter((p) => p.kind === "restaurant")
    .map((p) => ({
      name: p.name,
      borough: p.borough,
      address: p.address,
      lat: p.lat,
      lng: p.lng,
      certified: !!p.certified,
    }));
  const cbos = resolved
    .filter((p) => p.kind === "cbo")
    .map((p) => ({ name: p.name, borough: p.borough, address: p.address, lat: p.lat, lng: p.lng }));

  await writeFile(
    path.join(process.cwd(), "data", "restaurants.json"),
    JSON.stringify(restaurants, null, 2) + "\n",
  );
  await writeFile(
    path.join(process.cwd(), "data", "cbos.json"),
    JSON.stringify({ _source: "Rethink Food partner directory (rethinkfood.org). Coordinates geocoded via US Census.", cbos }, null, 2) + "\n",
  );
  console.log(`Wrote ${restaurants.length} restaurant partners and ${cbos.length} CBOs.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
