import fi from "@/data/food-insecurity.json";

// Translate county food-insecurity rates (Map the Meal Gap) into a believable
// per-neighborhood weekly meal demand. Transparent and cited: demand scales with
// the borough's food-insecurity rate, with a small deterministic per-neighborhood
// jitter so neighborhoods in the same borough differ. Tunable in one place.
const POP_PROXY = 50_000; // ~avg NTA population
const DEMAND_FACTOR = 0.15; // share of food-insecure residents we model as weekly demand

type CountyRates = Record<string, { foodInsecurityRate: number; costPerMealCents: number }>;
const counties = fi.counties as CountyRates;

export function weeklyDemandFor(borough: string, neighborhood: string): number {
  const rate = counties[borough]?.foodInsecurityRate ?? 0.12;
  let h = 0;
  for (const c of neighborhood) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const jitter = 0.85 + (h % 30) / 100; // 0.85–1.14, deterministic
  return Math.round(rate * POP_PROXY * DEMAND_FACTOR * jitter);
}

export const foodInsecurity = fi;
