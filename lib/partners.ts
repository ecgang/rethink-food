import { cache } from "react";
import { prisma } from "@/lib/db";
import { isRealized, DAY_MS as DAY, WEEK_MS } from "@/lib/definitions";

// ---------------------------------------------------------------------------
// Slug helpers
// ---------------------------------------------------------------------------

/**
 * Converts a borough + neighborhood pair into a URL-safe kebab-case slug.
 * Lowercase, spaces/punctuation → single hyphens, leading/trailing trimmed.
 */
export function marketSlug(borough: string, neighborhood: string): string {
  const toKebab = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  return `${toKebab(borough)}--${toKebab(neighborhood)}`;
}

/**
 * Lossy reverse: splits on the double-hyphen separator inserted by marketSlug.
 * Only useful for display; do NOT use to reconstruct exact DB values. Use
 * getMarketBySlug (which scans + matches) for DB lookups.
 */
export function parseMarketSlug(slug: string): { borough: string; neighborhood: string } {
  const idx = slug.indexOf("--");
  if (idx === -1) return { borough: slug, neighborhood: "" };
  return { borough: slug.slice(0, idx), neighborhood: slug.slice(idx + 2) };
}

// ---------------------------------------------------------------------------
// Market lookup helpers
// ---------------------------------------------------------------------------

/**
 * Returns the market whose computed slug matches the given slug, or null.
 * Scans all markets and matches by slug so punctuation/spaces in names are
 * handled correctly — never relies on parsing the slug back to exact strings.
 */
export async function getMarketBySlug(
  slug: string,
): Promise<{ id: string; borough: string; neighborhood: string; lat: number; lng: number; weeklyDemand: number } | null> {
  const markets = await prisma.market.findMany({
    select: { id: true, borough: true, neighborhood: true, lat: true, lng: true, weeklyDemand: true },
  });
  return markets.find((m) => marketSlug(m.borough, m.neighborhood) === slug) ?? null;
}

// ---------------------------------------------------------------------------
// Partner explorer
// ---------------------------------------------------------------------------

export interface PartnerExplorerFilters {
  type?: "kitchen" | "restaurant" | "cbo";
  q?: string;
  market?: string; // slug — matched against marketSlug(borough, neighborhood)
  certified?: boolean;
}

export interface PartnerRow {
  id: string;
  type: "kitchen" | "restaurant" | "cbo";
  name: string;
  marketLabel: string;
  marketSlug: string;
  weeklyCapacity: number | null;
  certified: boolean | null;
  minorityOwned: boolean | null;
  mealCount: number;
}

export interface PartnerExplorerResult {
  rows: PartnerRow[];
  total: number;
  capped: boolean;
}

const PARTNER_LIMIT = 200;

/**
 * Unified partner roster across kitchens, restaurants, and CBOs.
 * Optionally filtered by type, name search, market slug, and certified status.
 */
export async function getPartnersExplorer(
  f: PartnerExplorerFilters = {},
): Promise<PartnerExplorerResult> {
  // Resolve market id from slug if a market filter is provided
  let marketId: string | undefined;
  if (f.market) {
    const m = await getMarketBySlug(f.market);
    marketId = m?.id;
    // If slug supplied but no market found, return empty — no cross-filter leak
    if (!marketId) return { rows: [], total: 0, capped: false };
  }

  const nameContains = f.q ? { contains: f.q, mode: "insensitive" as const } : undefined;

  const [kitchens, restaurants, cbos] = await Promise.all([
    f.type === "restaurant" || f.type === "cbo"
      ? Promise.resolve([])
      : prisma.kitchen.findMany({
          where: {
            ...(nameContains ? { name: nameContains } : {}),
            ...(marketId ? { marketId } : {}),
          },
          select: {
            id: true,
            name: true,
            weeklyCapacity: true,
            market: { select: { borough: true, neighborhood: true } },
            _count: { select: { meals: true } },
          },
        }),

    f.type === "kitchen" || f.type === "cbo"
      ? Promise.resolve([])
      : prisma.restaurantPartner.findMany({
          where: {
            ...(nameContains ? { name: nameContains } : {}),
            ...(marketId ? { marketId } : {}),
            ...(f.certified !== undefined ? { certified: f.certified } : {}),
          },
          select: {
            id: true,
            name: true,
            weeklyCapacity: true,
            certified: true,
            minorityOwned: true,
            market: { select: { borough: true, neighborhood: true } },
            _count: { select: { meals: true } },
          },
        }),

    f.type === "kitchen" || f.type === "restaurant"
      ? Promise.resolve([])
      : prisma.cbo.findMany({
          where: {
            ...(nameContains ? { name: nameContains } : {}),
            ...(marketId ? { marketId } : {}),
          },
          select: {
            id: true,
            name: true,
            market: { select: { borough: true, neighborhood: true } },
            _count: { select: { meals: true } },
          },
        }),
  ]);

  // When filtering certified=true on type=cbo or type=kitchen, result is already
  // empty from Promise.resolve([]) above. If type is undefined and certified is
  // set, kitchens/cbos have no certified field — they simply pass through (the
  // certified filter only applies to restaurants, matching the schema).
  const allRows: PartnerRow[] = [
    ...kitchens.map((k) => ({
      id: k.id,
      type: "kitchen" as const,
      name: k.name,
      marketLabel: `${k.market.neighborhood}, ${k.market.borough}`,
      marketSlug: marketSlug(k.market.borough, k.market.neighborhood),
      weeklyCapacity: k.weeklyCapacity,
      certified: null,
      minorityOwned: null,
      mealCount: k._count.meals,
    })),
    ...restaurants.map((r) => ({
      id: r.id,
      type: "restaurant" as const,
      name: r.name,
      marketLabel: `${r.market.neighborhood}, ${r.market.borough}`,
      marketSlug: marketSlug(r.market.borough, r.market.neighborhood),
      weeklyCapacity: r.weeklyCapacity,
      certified: r.certified,
      minorityOwned: r.minorityOwned,
      mealCount: r._count.meals,
    })),
    ...cbos.map((c) => ({
      id: c.id,
      type: "cbo" as const,
      name: c.name,
      marketLabel: `${c.market.neighborhood}, ${c.market.borough}`,
      marketSlug: marketSlug(c.market.borough, c.market.neighborhood),
      weeklyCapacity: null,
      certified: null,
      minorityOwned: null,
      mealCount: c._count.meals,
    })),
  ];

  const total = allRows.length;
  const capped = total > PARTNER_LIMIT;
  return { rows: allRows.slice(0, PARTNER_LIMIT), total, capped };
}

// ---------------------------------------------------------------------------
// Restaurant detail
// ---------------------------------------------------------------------------

export interface RestaurantDetailMeal {
  id: string;
  status: string;
  mealDate: Date;
  cboName: string;
}

export interface RestaurantDetail {
  id: string;
  name: string;
  address: string | null;
  certified: boolean;
  minorityOwned: boolean;
  weeklyCapacity: number;
  marketLabel: string;
  marketSlug: string;
  mealCount: number;
  deliveredCount: number;
  recentMeals: RestaurantDetailMeal[];
}

export async function getRestaurantDetail(id: string): Promise<RestaurantDetail | null> {
  const r = await prisma.restaurantPartner.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      address: true,
      certified: true,
      minorityOwned: true,
      weeklyCapacity: true,
      market: { select: { borough: true, neighborhood: true } },
      meals: {
        orderBy: { mealDate: "desc" },
        take: 20,
        select: {
          id: true,
          status: true,
          mealDate: true,
          cbo: { select: { name: true } },
        },
      },
      _count: { select: { meals: true } },
    },
  });
  if (!r) return null;

  const deliveredCount = r.meals.filter((m) => isRealized(m.status)).length;

  return {
    id: r.id,
    name: r.name,
    address: r.address,
    certified: r.certified,
    minorityOwned: r.minorityOwned,
    weeklyCapacity: r.weeklyCapacity,
    marketLabel: `${r.market.neighborhood}, ${r.market.borough}`,
    marketSlug: marketSlug(r.market.borough, r.market.neighborhood),
    mealCount: r._count.meals,
    deliveredCount,
    recentMeals: r.meals.map((m) => ({
      id: m.id,
      status: m.status,
      mealDate: m.mealDate,
      cboName: m.cbo.name,
    })),
  };
}

// ---------------------------------------------------------------------------
// CBO detail
// ---------------------------------------------------------------------------

export interface CboDetailMeal {
  id: string;
  status: string;
  mealDate: Date;
  producerName: string | null;
}

export interface CboDetail {
  id: string;
  name: string;
  address: string | null;
  contactEmail: string | null;
  marketLabel: string;
  marketSlug: string;
  mealCount: number;
  deliveredCount: number;
  recentMeals: CboDetailMeal[];
}

export async function getCboDetail(id: string): Promise<CboDetail | null> {
  const c = await prisma.cbo.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      address: true,
      contactEmail: true,
      market: { select: { borough: true, neighborhood: true } },
      meals: {
        orderBy: { mealDate: "desc" },
        take: 20,
        select: {
          id: true,
          status: true,
          mealDate: true,
          kitchen: { select: { name: true } },
          restaurantPartner: { select: { name: true } },
        },
      },
      _count: { select: { meals: true } },
    },
  });
  if (!c) return null;

  const deliveredCount = c.meals.filter((m) => isRealized(m.status)).length;

  return {
    id: c.id,
    name: c.name,
    address: c.address,
    contactEmail: c.contactEmail,
    marketLabel: `${c.market.neighborhood}, ${c.market.borough}`,
    marketSlug: marketSlug(c.market.borough, c.market.neighborhood),
    mealCount: c._count.meals,
    deliveredCount,
    recentMeals: c.meals.map((m) => ({
      id: m.id,
      status: m.status,
      mealDate: m.mealDate,
      producerName: m.kitchen?.name ?? m.restaurantPartner?.name ?? null,
    })),
  };
}

// ---------------------------------------------------------------------------
// Market detail
// ---------------------------------------------------------------------------

export interface MarketDetailKitchen {
  id: string;
  name: string;
  weeklyCapacity: number;
}

export interface MarketDetailRestaurant {
  id: string;
  name: string;
  weeklyCapacity: number;
  certified: boolean;
  minorityOwned: boolean;
}

export interface MarketDetailCbo {
  id: string;
  name: string;
  address: string | null;
  contactEmail: string | null;
}

export interface MarketDetailMeal {
  id: string;
  status: string;
  mealDate: Date;
  producerName: string | null;
  cboName: string;
}

export interface MarketDetail {
  id: string;
  slug: string;
  borough: string;
  neighborhood: string;
  marketLabel: string;
  weeklyDemand: number;
  weeklyCapacity: number;
  fulfilledLast7: number;
  unmet: number;
  scheduledThisWeek: number;
  kitchens: MarketDetailKitchen[];
  restaurants: MarketDetailRestaurant[];
  cbos: MarketDetailCbo[];
  recentMeals: MarketDetailMeal[];
}

export const getMarketDetail = cache(
  async (slug: string, now: Date = new Date()): Promise<MarketDetail | null> => {
    // Scan to find the market whose computed slug matches
    const markets = await prisma.market.findMany({
      select: { id: true, borough: true, neighborhood: true },
    });
    const match = markets.find((m) => marketSlug(m.borough, m.neighborhood) === slug);
    if (!match) return null;

    const weekAgo = new Date(now.getTime() - WEEK_MS);
    const weekAhead = new Date(now.getTime() + WEEK_MS);

    const m = await prisma.market.findUnique({
      where: { id: match.id },
      select: {
        id: true,
        borough: true,
        neighborhood: true,
        weeklyDemand: true,
        kitchens: {
          select: { id: true, name: true, weeklyCapacity: true },
        },
        restaurants: {
          select: {
            id: true,
            name: true,
            weeklyCapacity: true,
            certified: true,
            minorityOwned: true,
          },
        },
        cbos: {
          select: { id: true, name: true, address: true, contactEmail: true },
        },
        meals: {
          select: {
            id: true,
            status: true,
            mealDate: true,
            deliveredAt: true,
            kitchen: { select: { name: true } },
            restaurantPartner: { select: { name: true } },
            cbo: { select: { name: true } },
          },
        },
      },
    });
    if (!m) return null;

    const weeklyCapacity =
      m.kitchens.reduce((s, k) => s + k.weeklyCapacity, 0) +
      m.restaurants.reduce((s, r) => s + r.weeklyCapacity, 0);

    const fulfilledLast7 = m.meals.filter(
      (meal) => meal.deliveredAt !== null && meal.deliveredAt >= weekAgo,
    ).length;

    const unmet = Math.max(0, m.weeklyDemand - fulfilledLast7);

    const scheduledThisWeek = m.meals.filter(
      (meal) =>
        meal.status === "PLANNED" &&
        meal.mealDate >= now &&
        meal.mealDate <= weekAhead,
    ).length;

    const recentMeals: MarketDetailMeal[] = m.meals
      .sort((a, b) => b.mealDate.getTime() - a.mealDate.getTime())
      .slice(0, 20)
      .map((meal) => ({
        id: meal.id,
        status: meal.status,
        mealDate: meal.mealDate,
        producerName: meal.kitchen?.name ?? meal.restaurantPartner?.name ?? null,
        cboName: meal.cbo.name,
      }));

    return {
      id: m.id,
      slug,
      borough: m.borough,
      neighborhood: m.neighborhood,
      marketLabel: `${m.neighborhood}, ${m.borough}`,
      weeklyDemand: m.weeklyDemand,
      weeklyCapacity,
      fulfilledLast7,
      unmet,
      scheduledThisWeek,
      kitchens: m.kitchens,
      restaurants: m.restaurants,
      cbos: m.cbos,
      recentMeals,
    };
  },
);

// ---------------------------------------------------------------------------
// Eligible producers (spare capacity)
// ---------------------------------------------------------------------------

export interface EligibleProducer {
  id: string;
  type: "kitchen" | "restaurant";
  name: string;
  weeklyCapacity: number;
  committed: number;
  spare: number;
}

/**
 * Returns kitchens and restaurants in the given market that have spare capacity:
 *   spare = weeklyCapacity − count(PLANNED upcoming meals for that producer)
 * Only producers with spare > 0 are returned.
 */
export async function eligibleProducers(
  marketId: string,
  now: Date = new Date(),
): Promise<EligibleProducer[]> {
  const weekAhead = new Date(now.getTime() + WEEK_MS);

  const [kitchens, restaurants] = await Promise.all([
    prisma.kitchen.findMany({
      where: { marketId },
      select: {
        id: true,
        name: true,
        weeklyCapacity: true,
        meals: {
          where: {
            status: "PLANNED",
            mealDate: { gte: now, lte: weekAhead },
          },
          select: { id: true },
        },
      },
    }),
    prisma.restaurantPartner.findMany({
      where: { marketId },
      select: {
        id: true,
        name: true,
        weeklyCapacity: true,
        meals: {
          where: {
            status: "PLANNED",
            mealDate: { gte: now, lte: weekAhead },
          },
          select: { id: true },
        },
      },
    }),
  ]);

  const results: EligibleProducer[] = [];

  for (const k of kitchens) {
    const committed = k.meals.length;
    const spare = k.weeklyCapacity - committed;
    if (spare > 0) {
      results.push({ id: k.id, type: "kitchen", name: k.name, weeklyCapacity: k.weeklyCapacity, committed, spare });
    }
  }

  for (const r of restaurants) {
    const committed = r.meals.length;
    const spare = r.weeklyCapacity - committed;
    if (spare > 0) {
      results.push({ id: r.id, type: "restaurant", name: r.name, weeklyCapacity: r.weeklyCapacity, committed, spare });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Match form options (for Wave 2 — the match action populates dropdowns from this)
// ---------------------------------------------------------------------------

export interface MatchOptionsCbo {
  id: string;
  name: string;
}

export interface MatchOptionsContract {
  id: string;
  name: string;
  programId: string;
}

export interface MatchOptions {
  cbos: MatchOptionsCbo[];
  contracts: MatchOptionsContract[];
}

/**
 * Returns the CBOs and selectable Contracts for a given market so the Match
 * form (Wave 2) can populate its dropdowns without an extra DB round-trip.
 */
export async function getMatchOptions(marketId: string): Promise<MatchOptions> {
  const [cbos, contracts] = await Promise.all([
    prisma.cbo.findMany({
      where: { marketId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.contract.findMany({
      where: { endDate: { gte: new Date() } },
      select: { id: true, name: true, programId: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return { cbos, contracts };
}
