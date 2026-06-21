/**
 * Seed realistic, believable demo data for the Rethink Command Center.
 *
 * Design goals:
 *  - Real NYC neighborhoods, plausible program/funder/partner names.
 *  - A credible unit-economics story: MTM healthy, surplus thin, ONE kitchen underwater.
 *  - Intentional operational anomalies that trip the exception engine:
 *      * meals produced but not delivered (>24h)
 *      * meals delivered but unverified (>48h)
 *      * a kitchen running ~30% over food budget
 *      * a contract billing deadline due in 2 days and another overdue
 *  - Deterministic (seeded RNG) so the demo looks the same every run.
 *
 * Run: npm run db:seed   (resets then reseeds: npm run db:reset)
 */
import { PrismaClient, Prisma } from "@prisma/client";

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

// ----------------------------------------------------------------------------
async function main() {
  console.log("Clearing existing data…");
  // delete in FK-dependency order
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
  const marketsSpec = [
    { borough: "Bronx", neighborhood: "Mott Haven", lat: 40.809, lng: -73.9229, weeklyDemand: 1800 },
    { borough: "Bronx", neighborhood: "Fordham", lat: 40.8610, lng: -73.8990, weeklyDemand: 1500 },
    { borough: "Brooklyn", neighborhood: "Brownsville", lat: 40.6628, lng: -73.9097, weeklyDemand: 1600 },
    { borough: "Brooklyn", neighborhood: "Bedford-Stuyvesant", lat: 40.6872, lng: -73.9418, weeklyDemand: 1400 },
    { borough: "Brooklyn", neighborhood: "Sunset Park", lat: 40.6453, lng: -74.0119, weeklyDemand: 1100 },
    { borough: "Queens", neighborhood: "Corona", lat: 40.7449, lng: -73.8648, weeklyDemand: 1700 },
    { borough: "Queens", neighborhood: "Jamaica", lat: 40.702, lng: -73.789, weeklyDemand: 1300 },
    { borough: "Manhattan", neighborhood: "East Harlem", lat: 40.7957, lng: -73.9389, weeklyDemand: 1200 },
    { borough: "Manhattan", neighborhood: "Washington Heights", lat: 40.8417, lng: -73.9394, weeklyDemand: 1000 },
  ];
  const markets: Awaited<ReturnType<typeof prisma.market.create>>[] = [];
  for (const m of marketsSpec) {
    markets.push(await prisma.market.create({ data: m }));
  }
  const marketByHood = Object.fromEntries(markets.map((m) => [m.neighborhood, m]));

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

  // --- Programs (reimbursement = revenue per delivered meal) ----------------
  const mtm = await prisma.program.create({
    data: { name: "Medically Tailored Meals", type: "MTM", reimbursementRateCents: 950 },
  });
  const restaurantResponse = await prisma.program.create({
    data: { name: "Restaurant Response", type: "RESTAURANT_RESPONSE", reimbursementRateCents: 650 },
  });
  const emergency = await prisma.program.create({
    data: { name: "Emergency Relief", type: "EMERGENCY_RELIEF", reimbursementRateCents: 600 },
  });

  // --- Contracts (billing deadlines drive "act on today") -------------------
  const cMtmPhs = await prisma.contract.create({
    data: {
      name: "MTM — Public Health Solutions SCN",
      funderId: medicaid.id, programId: mtm.id, scnPartner: "PHS",
      budgetCents: BigInt(4_200_000_00),
      startDate: addMs(NOW, -120 * DAY), endDate: addMs(NOW, 245 * DAY),
      billingDeadline: addMs(NOW, 2 * DAY), // DUE SOON -> exception
    },
  });
  const cMtmHeali = await prisma.contract.create({
    data: {
      name: "MTM — HEALI SCN",
      funderId: medicaid.id, programId: mtm.id, scnPartner: "HEALI",
      budgetCents: BigInt(2_800_000_00),
      startDate: addMs(NOW, -120 * DAY), endDate: addMs(NOW, 245 * DAY),
      billingDeadline: addMs(NOW, 17 * DAY),
    },
  });
  const cMtmSomos = await prisma.contract.create({
    data: {
      name: "MTM — SOMOS Community Care SCN",
      funderId: medicaid.id, programId: mtm.id, scnPartner: "SOMOS",
      budgetCents: BigInt(3_100_000_00),
      startDate: addMs(NOW, -120 * DAY), endDate: addMs(NOW, 245 * DAY),
      billingDeadline: addMs(NOW, -1 * DAY), // OVERDUE -> critical exception
    },
  });
  const cRestaurant = await prisma.contract.create({
    data: {
      name: "Restaurant Response Grant 2026",
      funderId: robinHood.id, programId: restaurantResponse.id,
      budgetCents: BigInt(1_500_000_00),
      startDate: addMs(NOW, -90 * DAY), endDate: addMs(NOW, 180 * DAY),
      billingDeadline: addMs(NOW, 40 * DAY),
    },
  });
  const cEmergency = await prisma.contract.create({
    data: {
      name: "HRA Emergency Food FY26",
      funderId: cityHra.id, programId: emergency.id,
      budgetCents: BigInt(900_000_00),
      startDate: addMs(NOW, -90 * DAY), endDate: addMs(NOW, 120 * DAY),
      billingDeadline: addMs(NOW, 25 * DAY),
    },
  });
  const mtmContracts = [
    { contract: cMtmPhs, scn: "PHS" as const },
    { contract: cMtmHeali, scn: "HEALI" as const },
    { contract: cMtmSomos, scn: "SOMOS" as const },
  ];

  // --- Kitchens (one runs over food budget) --------------------------------
  const kGv = await prisma.kitchen.create({
    data: { name: "Sustainable Community Kitchen — Greenwich Village", marketId: marketByHood["East Harlem"].id, weeklyCapacity: 16000 },
  });
  const kBk = await prisma.kitchen.create({
    data: { name: "SCK — Brooklyn Navy Yard", marketId: marketByHood["Bedford-Stuyvesant"].id, weeklyCapacity: 9000 },
  });
  // kBk will be intentionally over food budget (see cost generation below)
  const OVER_BUDGET_KITCHEN_ID = kBk.id;
  const kitchens = [kGv, kBk];

  // --- Restaurant partners --------------------------------------------------
  const restaurantNames = [
    ["Sol de Quito", "Corona", true],
    ["Casa Adela", "East Harlem", true],
    ["Teranga Bites", "Bedford-Stuyvesant", true],
    ["Sugar Hill Kitchen", "Washington Heights", true],
    ["Brownsville BBQ Co.", "Brownsville", true],
    ["Jamaica Jerk House", "Jamaica", true],
    ["Sunset Dumpling Bar", "Sunset Park", true],
    ["Fordham Pizzeria", "Fordham", false],
  ] as const;
  const restaurants: Awaited<ReturnType<typeof prisma.restaurantPartner.create>>[] = [];
  for (const [name, hood, minority] of restaurantNames) {
    restaurants.push(
      await prisma.restaurantPartner.create({
        data: { name, marketId: marketByHood[hood].id, weeklyCapacity: between(300, 700), minorityOwned: minority },
      }),
    );
  }

  // --- CBOs -----------------------------------------------------------------
  const cboNames = [
    ["Part of the Solution (POTS)", "Fordham"],
    ["BronxWorks", "Mott Haven"],
    ["Bed-Stuy Campaign Against Hunger", "Bedford-Stuyvesant"],
    ["Brownsville Community Justice Center", "Brownsville"],
    ["La Jornada", "Corona"],
    ["Queens Together", "Jamaica"],
    ["Union Settlement", "East Harlem"],
    ["Northern Manhattan Improvement Corp.", "Washington Heights"],
    ["Sunset Park Health Council", "Sunset Park"],
  ] as const;
  const cbos: Awaited<ReturnType<typeof prisma.cbo.create>>[] = [];
  for (const [name, hood] of cboNames) {
    cbos.push(
      await prisma.cbo.create({
        data: {
          name,
          marketId: marketByHood[hood].id,
          contactEmail: `programs@${name.toLowerCase().replace(/[^a-z]+/g, "").slice(0, 14)}.org`,
        },
      }),
    );
  }
  const cbosByMarket = (marketId: string) => cbos.filter((c) => c.marketId === marketId);

  // --- Members (MTM beneficiaries) -----------------------------------------
  const members: Awaited<ReturnType<typeof prisma.member.create>>[] = [];
  const MEMBER_COUNT = 60;
  for (let i = 0; i < MEMBER_COUNT; i++) {
    const market = pick(markets);
    const scn = pick(["PHS", "HEALI", "SOMOS"] as const);
    const referralDate = addMs(NOW, -between(30, 150) * DAY);
    const withdrawn = rand() < 0.15; // ~15% churn -> retention story
    members.push(
      await prisma.member.create({
        data: {
          externalRef: `MBR-${(1000 + i).toString()}`,
          marketId: market.id,
          scnPartner: scn,
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

  // counters to inject a bounded number of anomalies
  let stuckProduced = 0; // target ~10
  let unverified = 0; // target ~12

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
    reimbursementCents: number;
  }) {
    const id = `meal_${(mealSeq++).toString().padStart(6, "0")}`;
    const ageDays = (NOW.getTime() - args.mealDate.getTime()) / DAY;

    // Decide lifecycle from recency, with bounded anomalies.
    let status: "PLANNED" | "PRODUCED" | "DELIVERED" | "VERIFIED";
    let producedAt: Date | null = null;
    let deliveredAt: Date | null = null;
    let verifiedAt: Date | null = null;
    const plannedAt = addMs(args.mealDate, -2 * DAY);

    if (ageDays < 0) {
      status = "PLANNED";
    } else if (ageDays < 1) {
      // recent: mostly produced; inject a few stuck-produced anomalies
      producedAt = addMs(args.mealDate, -6 * HOUR);
      if (stuckProduced < 10 && rand() < 0.25) {
        // force "produced but not delivered" >24h by backdating producedAt
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
        // delivered but unverified >48h
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

    // cost line items — vary by program; inflate FOOD for the over-budget kitchen
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

  // MTM meals: each active member, prescribed meals/week, over WEEKS weeks.
  for (const member of members) {
    if (member.status === "WITHDRAWN") continue;
    const scnContract = mtmContracts.find((c) => c.scn === member.scnPartner)!.contract;
    const memberCbos = cbosByMarket(member.marketId);
    const cbo = memberCbos.length ? pick(memberCbos) : pick(cbos);
    for (let w = 0; w < WEEKS; w++) {
      const mealsThisWeek = member.prescribedMealsPerWeek;
      for (let d = 0; d < mealsThisWeek; d++) {
        // spread across the week; week 0 = most recent
        const dayOffset = w * 7 + Math.floor((d / mealsThisWeek) * 7);
        const mealDate = addMs(NOW, (-dayOffset + 1) * DAY); // +1 so some land in future -> PLANNED
        const kitchen = rand() < 0.65 ? kGv : kBk;
        emitMeal({
          programId: mtm.id,
          contractId: scnContract.id,
          marketId: member.marketId,
          producerType: "KITCHEN",
          kitchenId: kitchen.id,
          cboId: cbo.id,
          memberId: member.id,
          mealDate,
          reimbursementCents: mtm.reimbursementRateCents,
        });
      }
    }
  }

  // Restaurant Response: weekly batches per restaurant -> a nearby CBO.
  for (const r of restaurants) {
    for (let w = 0; w < WEEKS; w++) {
      const batch = between(40, 90);
      const cbo = pick(cbosByMarket(r.marketId).length ? cbosByMarket(r.marketId) : cbos);
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
          reimbursementCents: restaurantResponse.reimbursementRateCents,
        });
      }
    }
  }

  // Emergency relief: smaller, kitchen-produced, recent weeks.
  for (let w = 0; w < 3; w++) {
    const batch = between(120, 200);
    for (let i = 0; i < batch; i++) {
      const market = pick(markets);
      const cbo = pick(cbosByMarket(market.id).length ? cbosByMarket(market.id) : cbos);
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
        reimbursementCents: emergency.reimbursementRateCents,
      });
    }
  }

  console.log(`Inserting ${mealRows.length} meals and ${lineRows.length} cost line items…`);
  // chunked inserts to stay within parameter limits
  for (let i = 0; i < mealRows.length; i += 1000) {
    await prisma.meal.createMany({ data: mealRows.slice(i, i + 1000) });
  }
  for (let i = 0; i < lineRows.length; i += 2000) {
    await prisma.mealCostLineItem.createMany({ data: lineRows.slice(i, i + 2000) });
  }

  // --- A couple of seeded intake-request audit rows (history) ---------------
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

  const counts = {
    markets: markets.length,
    members: members.length,
    meals: mealRows.length,
    lineItems: lineRows.length,
    contracts: 5,
  };
  console.log("Seed complete:", counts);
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
