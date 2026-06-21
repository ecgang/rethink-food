/**
 * Seed the Rethink Command Center from REAL NYC open-data snapshots (committed
 * under data/, produced by `npm run ingest`):
 *   - data/neighborhoods.json  → Markets (real NTA names + centroids)
 *   - data/restaurants.json    → RestaurantPartners (real DOHMH establishments)
 *   - data/cbos.json           → real community-based food orgs
 *   - data/food-insecurity.json→ drives Market.weeklyDemand (lib/demand.ts)
 *
 * Meals, members, costs, and the lifecycle are synthetic but generated against
 * the real geography, with a deterministic RNG and intentionally planted
 * anomalies that drive the exception engine. Social Care Networks are assigned by
 * borough to match the real NY 1115 waiver coverage (PHS / SOMOS / SIPPS).
 *
 * Run: npm run db:seed   (reset + reseed: npm run db:reset)
 */
import { PrismaClient, Prisma, type ScnPartner } from "@prisma/client";
import { readFileSync } from "node:fs";
import path from "node:path";
import { weeklyDemandFor } from "../lib/demand";

const prisma = new PrismaClient();

// --- deterministic RNG (mulberry32) -----------------------------------------
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20260621);
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const between = (lo: number, hi: number) => Math.round(lo + rand() * (hi - lo));

const NOW = new Date();
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const addMs = (base: Date, ms: number) => new Date(base.getTime() + ms);

const dataFile = <T>(name: string): T =>
  JSON.parse(readFileSync(path.join(process.cwd(), "data", name), "utf8")) as T;

// PHS → Manhattan/Brooklyn/Queens · SOMOS → Bronx · SIPPS → Staten Island
function scnForBorough(borough: string): ScnPartner {
  if (borough === "Bronx") return "SOMOS";
  if (borough === "Staten Island") return "SIPPS";
  return "PHS";
}

interface NeighborhoodRow {
  borough: string;
  neighborhood: string;
  lat: number;
  lng: number;
}
interface RestaurantRow {
  name: string;
  borough: string;
  address: string;
  lat: number;
  lng: number;
  certified: boolean;
}
interface CboRow {
  name: string;
  borough: string;
  address: string;
  lat: number;
  lng: number;
}

// deterministic ~80% true (impact report: ~80% minority/women-owned partners)
const synthMinorityOwned = (name: string) => {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 10 < 8;
};

async function main() {
  console.log("Clearing existing data…");
  await prisma.mealCostLineItem.deleteMany();
  await prisma.meal.deleteMany();
  await prisma.intakeRequest.deleteMany();
  await prisma.exception.deleteMany();
  await prisma.member.deleteMany();
  await prisma.contract.deleteMany();
  await prisma.program.deleteMany();
  await prisma.funder.deleteMany();
  await prisma.cbo.deleteMany();
  await prisma.restaurantPartner.deleteMany();
  await prisma.kitchen.deleteMany();
  await prisma.market.deleteMany();

  // --- Markets (real NYC neighborhoods) ------------------------------------
  const hoods = dataFile<NeighborhoodRow[]>("neighborhoods.json");
  const markets: Awaited<ReturnType<typeof prisma.market.create>>[] = [];
  for (const h of hoods) {
    markets.push(
      await prisma.market.create({
        data: {
          borough: h.borough,
          neighborhood: h.neighborhood,
          lat: h.lat,
          lng: h.lng,
          weeklyDemand: weeklyDemandFor(h.borough, h.neighborhood),
        },
      }),
    );
  }
  const marketByHood = Object.fromEntries(markets.map((m) => [m.neighborhood, m]));
  const marketsInBorough = (b: string) => markets.filter((m) => m.borough === b);
  const nearestMarket = (lat: number, lng: number, borough?: string) => {
    const pool = borough ? marketsInBorough(borough) : markets;
    const list = pool.length ? pool : markets;
    return list.reduce((best, m) =>
      (m.lat - lat) ** 2 + (m.lng - lng) ** 2 <
      (best.lat - lat) ** 2 + (best.lng - lng) ** 2
        ? m
        : best,
    );
  };

  // --- Funders -------------------------------------------------------------
  const medicaid = await prisma.funder.create({
    data: { name: "NY State 1115 Medicaid Waiver", kind: "Government / Healthcare" },
  });
  const cityHra = await prisma.funder.create({
    data: { name: "NYC HRA Emergency Food", kind: "Government" },
  });
  const robinHood = await prisma.funder.create({
    data: { name: "Robin Hood Foundation", kind: "Philanthropy" },
  });

  // --- Programs ------------------------------------------------------------
  const mtm = await prisma.program.create({
    data: { name: "Medically Tailored Meals", type: "MTM", reimbursementRateCents: 950 },
  });
  const restaurantResponse = await prisma.program.create({
    data: { name: "Restaurant Response", type: "RESTAURANT_RESPONSE", reimbursementRateCents: 650 },
  });
  const emergency = await prisma.program.create({
    data: { name: "Emergency Relief", type: "EMERGENCY_RELIEF", reimbursementRateCents: 600 },
  });

  // --- Contracts (one MTM contract per real NYC Social Care Network) --------
  const mtmBudgets: Record<ScnPartner, number> = {
    PHS: 4_200_000_00,
    SOMOS: 3_100_000_00,
    SIPPS: 1_400_000_00,
  };
  // billing deadlines drive "act on today": one overdue, one due soon, one future
  const mtmDeadlines: Record<ScnPartner, number> = {
    SOMOS: -1 * DAY, // overdue → CRITICAL
    PHS: 2 * DAY, // due soon → HIGH
    SIPPS: 18 * DAY,
  };
  const mtmContract: Record<ScnPartner, Awaited<ReturnType<typeof prisma.contract.create>>> =
    {} as never;
  for (const scn of ["PHS", "SOMOS", "SIPPS"] as ScnPartner[]) {
    mtmContract[scn] = await prisma.contract.create({
      data: {
        name: `MTM — ${scn} Social Care Network`,
        funderId: medicaid.id,
        programId: mtm.id,
        scnPartner: scn,
        budgetCents: BigInt(mtmBudgets[scn]),
        startDate: addMs(NOW, -120 * DAY),
        endDate: addMs(NOW, 245 * DAY),
        billingDeadline: addMs(NOW, mtmDeadlines[scn]),
      },
    });
  }
  const cRestaurant = await prisma.contract.create({
    data: {
      name: "Restaurant Response Grant 2026",
      funderId: robinHood.id,
      programId: restaurantResponse.id,
      budgetCents: BigInt(1_500_000_00),
      startDate: addMs(NOW, -90 * DAY),
      endDate: addMs(NOW, 180 * DAY),
      billingDeadline: addMs(NOW, 40 * DAY),
    },
  });
  const cEmergency = await prisma.contract.create({
    data: {
      name: "HRA Emergency Food FY26",
      funderId: cityHra.id,
      programId: emergency.id,
      budgetCents: BigInt(900_000_00),
      startDate: addMs(NOW, -90 * DAY),
      endDate: addMs(NOW, 120 * DAY),
      billingDeadline: addMs(NOW, 25 * DAY),
    },
  });

  // --- Kitchens (Brooklyn runs over food budget) ---------------------------
  const manhattanMarket = marketsInBorough("Manhattan")[0] ?? markets[0];
  const brooklynMarket = marketsInBorough("Brooklyn")[0] ?? markets[0];
  const kGv = await prisma.kitchen.create({
    data: {
      name: "Sustainable Community Kitchen — Greenwich Village",
      marketId: manhattanMarket.id,
      weeklyCapacity: 18000,
    },
  });
  const kBk = await prisma.kitchen.create({
    data: { name: "SCK — Brooklyn Navy Yard", marketId: brooklynMarket.id, weeklyCapacity: 9000 },
  });
  const OVER_BUDGET_KITCHEN_ID = kBk.id;

  // --- Restaurant partners (real DOHMH establishments) ----------------------
  const restaurantRows = dataFile<RestaurantRow[]>("restaurants.json");
  const restaurants: Awaited<ReturnType<typeof prisma.restaurantPartner.create>>[] = [];
  for (const r of restaurantRows) {
    const market = nearestMarket(r.lat, r.lng, r.borough);
    restaurants.push(
      await prisma.restaurantPartner.create({
        data: {
          name: r.name,
          address: r.address,
          certified: r.certified,
          marketId: market.id,
          weeklyCapacity: between(300, 700),
          minorityOwned: synthMinorityOwned(r.name),
        },
      }),
    );
  }

  // --- CBOs (real orgs) ----------------------------------------------------
  const cboRows = dataFile<{ cbos: CboRow[] }>("cbos.json").cbos;
  const cbos: Awaited<ReturnType<typeof prisma.cbo.create>>[] = [];
  for (const c of cboRows) {
    const market = nearestMarket(c.lat, c.lng, c.borough);
    cbos.push(
      await prisma.cbo.create({
        data: {
          name: c.name,
          address: c.address,
          marketId: market.id,
          contactEmail: `programs@${c.name.toLowerCase().replace(/[^a-z]+/g, "").slice(0, 16)}.org`,
        },
      }),
    );
  }
  const cbosByMarket = (marketId: string) => cbos.filter((c) => c.marketId === marketId);

  // --- Members (MTM beneficiaries; SCN by borough) -------------------------
  const members: Awaited<ReturnType<typeof prisma.member.create>>[] = [];
  const MEMBER_COUNT = 60;
  for (let i = 0; i < MEMBER_COUNT; i++) {
    const market = pick(markets);
    const referralDate = addMs(NOW, -between(30, 150) * DAY);
    const withdrawn = rand() < 0.15;
    members.push(
      await prisma.member.create({
        data: {
          externalRef: `MBR-${(1000 + i).toString()}`,
          marketId: market.id,
          scnPartner: scnForBorough(market.borough),
          referralDate,
          enrollmentDate: addMs(referralDate, between(3, 14) * DAY),
          status: withdrawn ? "WITHDRAWN" : "ACTIVE",
          withdrawnAt: withdrawn ? addMs(referralDate, between(40, 90) * DAY) : null,
          prescribedMealsPerWeek: pick([5, 7, 7, 10, 14]),
        },
      }),
    );
  }

  // --- Meals + cost line items ---------------------------------------------
  console.log("Generating meals…");
  const mealRows: Prisma.MealCreateManyInput[] = [];
  const lineRows: Prisma.MealCostLineItemCreateManyInput[] = [];
  let mealSeq = 0;
  let stuckProduced = 0;
  let unverified = 0;
  const WEEKS = 6;

  function emitMeal(args: {
    programId: string;
    contractId: string;
    marketId: string;
    producerType: "KITCHEN" | "RESTAURANT";
    kitchenId?: string;
    restaurantPartnerId?: string;
    cboId: string;
    memberId?: string;
    mealDate: Date;
  }) {
    const id = `meal_${(mealSeq++).toString().padStart(6, "0")}`;
    const ageDays = (NOW.getTime() - args.mealDate.getTime()) / DAY;

    let status: "PLANNED" | "PRODUCED" | "DELIVERED" | "VERIFIED";
    let producedAt: Date | null = null;
    let deliveredAt: Date | null = null;
    let verifiedAt: Date | null = null;
    const plannedAt = addMs(args.mealDate, -2 * DAY);

    if (ageDays < 0) {
      status = "PLANNED";
    } else if (ageDays < 1) {
      producedAt = addMs(args.mealDate, -6 * HOUR);
      if (stuckProduced < 10 && rand() < 0.25) {
        producedAt = addMs(NOW, -between(26, 60) * HOUR);
        status = "PRODUCED";
        stuckProduced++;
      } else {
        deliveredAt = addMs(args.mealDate, 3 * HOUR);
        status = "DELIVERED";
      }
    } else if (ageDays < 3) {
      producedAt = addMs(args.mealDate, -6 * HOUR);
      deliveredAt = addMs(args.mealDate, 3 * HOUR);
      if (unverified < 12 && rand() < 0.2) {
        deliveredAt = addMs(NOW, -between(50, 80) * HOUR);
        status = "DELIVERED";
        unverified++;
      } else {
        verifiedAt = addMs(deliveredAt, between(6, 20) * HOUR);
        status = "VERIFIED";
      }
    } else {
      producedAt = addMs(args.mealDate, -6 * HOUR);
      deliveredAt = addMs(args.mealDate, 3 * HOUR);
      verifiedAt = addMs(deliveredAt, between(6, 24) * HOUR);
      status = "VERIFIED";
    }

    mealRows.push({
      id,
      programId: args.programId,
      contractId: args.contractId,
      marketId: args.marketId,
      producerType: args.producerType,
      kitchenId: args.kitchenId ?? null,
      restaurantPartnerId: args.restaurantPartnerId ?? null,
      cboId: args.cboId,
      memberId: args.memberId ?? null,
      status,
      mealDate: args.mealDate,
      plannedAt,
      producedAt,
      deliveredAt,
      verifiedAt,
    });

    const overBudget = args.kitchenId === OVER_BUDGET_KITCHEN_ID;
    let food: number, labor: number, transport: number, overhead: number;
    if (args.programId === mtm.id) {
      food = overBudget ? between(490, 560) : between(360, 420);
      labor = between(180, 240);
      transport = between(70, 110);
      overhead = between(30, 60);
    } else if (args.programId === restaurantResponse.id) {
      food = between(300, 380);
      labor = between(200, 260);
      transport = between(60, 100);
      overhead = between(40, 70);
    } else {
      food = between(280, 340);
      labor = between(150, 200);
      transport = between(60, 90);
      overhead = between(30, 50);
    }
    for (const [type, amountCents] of [
      ["FOOD", food], ["LABOR", labor], ["TRANSPORT", transport], ["OVERHEAD", overhead],
    ] as const) {
      lineRows.push({ mealId: id, type, amountCents });
    }
  }

  // MTM meals: active members, prescribed cadence, over WEEKS, via their SCN contract.
  for (const member of members) {
    if (member.status === "WITHDRAWN") continue;
    const scn = scnForBorough(
      markets.find((m) => m.id === member.marketId)!.borough,
    );
    const contract = mtmContract[scn];
    const localCbos = cbosByMarket(member.marketId);
    const cbo = localCbos.length ? pick(localCbos) : pick(cbos);
    for (let w = 0; w < WEEKS; w++) {
      for (let d = 0; d < member.prescribedMealsPerWeek; d++) {
        const dayOffset = w * 7 + Math.floor((d / member.prescribedMealsPerWeek) * 7);
        const mealDate = addMs(NOW, (-dayOffset + 1) * DAY);
        const kitchen = rand() < 0.65 ? kGv : kBk;
        emitMeal({
          programId: mtm.id,
          contractId: contract.id,
          marketId: member.marketId,
          producerType: "KITCHEN",
          kitchenId: kitchen.id,
          cboId: cbo.id,
          memberId: member.id,
          mealDate,
        });
      }
    }
  }

  // Restaurant Response: weekly batches per real restaurant → a nearby CBO.
  // (Kept modest so the dashboard stays snappy with 39 partners over 6 weeks.)
  for (const r of restaurants) {
    for (let w = 0; w < WEEKS; w++) {
      const batch = between(12, 26);
      const local = cbosByMarket(r.marketId);
      const cbo = pick(local.length ? local : cbos);
      for (let i = 0; i < batch; i++) {
        const dayOffset = w * 7 + between(0, 6);
        const mealDate = addMs(NOW, (-dayOffset + 1) * DAY);
        emitMeal({
          programId: restaurantResponse.id,
          contractId: cRestaurant.id,
          marketId: r.marketId,
          producerType: "RESTAURANT",
          restaurantPartnerId: r.id,
          cboId: cbo.id,
          mealDate,
        });
      }
    }
  }

  // Emergency relief: smaller, kitchen-produced, recent.
  for (let w = 0; w < 3; w++) {
    const batch = between(120, 200);
    for (let i = 0; i < batch; i++) {
      const market = pick(markets);
      const local = cbosByMarket(market.id);
      const cbo = pick(local.length ? local : cbos);
      const dayOffset = w * 7 + between(0, 6);
      const mealDate = addMs(NOW, (-dayOffset + 1) * DAY);
      emitMeal({
        programId: emergency.id,
        contractId: cEmergency.id,
        marketId: market.id,
        producerType: "KITCHEN",
        kitchenId: kGv.id,
        cboId: cbo.id,
        mealDate,
      });
    }
  }

  console.log(`Inserting ${mealRows.length} meals and ${lineRows.length} cost line items…`);
  for (let i = 0; i < mealRows.length; i += 1000) {
    await prisma.meal.createMany({ data: mealRows.slice(i, i + 1000) });
  }
  for (let i = 0; i < lineRows.length; i += 2000) {
    await prisma.mealCostLineItem.createMany({ data: lineRows.slice(i, i + 2000) });
  }

  // --- A seeded intake-request audit row (history) -------------------------
  await prisma.intakeRequest.create({
    data: {
      rawInput:
        "Hi Rethink team — La Jornada in Corona needs 250 halal meals delivered every Wednesday starting next week. A few clients are diabetic so lower-sodium where possible. Thanks! — Maria",
      extractedFields: {
        cbo: "La Jornada",
        quantity: 250,
        deliveryDate: addMs(NOW, 5 * DAY).toISOString().slice(0, 10),
        recurrence: "WEEKLY",
        dietaryConstraints: ["halal", "low-sodium"],
        location: "Corona, Queens",
      },
      confidenceFlags: { quantity: "high", deliveryDate: "medium", dietaryConstraints: "high" },
      modelUsed: "claude-haiku-4-5",
      status: "APPROVED",
      approvedBy: "Eric Gang",
      approvedAt: addMs(NOW, -2 * DAY),
      cboId: cbos.find((c) => c.name.includes("La Jornada"))?.id ?? null,
    },
  });

  console.log("Seed complete:", {
    markets: markets.length,
    restaurants: restaurants.length,
    cbos: cbos.length,
    members: members.length,
    meals: mealRows.length,
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
