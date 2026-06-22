// Funder impact aggregation layer.
//
// getFundersRoster — headline metrics per funder, sorted by meals served desc.
// getFunderImpact  — full impact breakdown for a single funder.
//
// "Realized" = status ∈ {DELIVERED, VERIFIED} — isRealized() imported from lib/definitions.ts.
// Revenue per realized meal = program.reimbursementRateCents.
// Margin uses mealEcon/rollupMargin from lib/margin.ts (no re-derivation here).

import { prisma } from "@/lib/db";
import { mealEcon, rollupMargin, type CostType } from "@/lib/margin";
import { isRealized } from "@/lib/definitions";

// ---------------------------------------------------------------------------
// Roster
// ---------------------------------------------------------------------------

export interface FunderRosterRow {
  id: string;
  name: string;
  kind: string;
  mealsServed: number;
  dollarsDeliveredCents: number;
  contractCount: number;
}

/** All funders with headline metrics, sorted by mealsServed desc. */
export async function getFundersRoster(): Promise<FunderRosterRow[]> {
  const funders = await prisma.funder.findMany({
    select: {
      id: true,
      name: true,
      kind: true,
      contracts: {
        select: {
          id: true,
          meals: {
            where: { status: { in: ["DELIVERED", "VERIFIED"] } },
            select: {
              program: { select: { reimbursementRateCents: true } },
            },
          },
        },
      },
    },
  });

  const rows: FunderRosterRow[] = funders.map((f) => {
    let mealsServed = 0;
    let dollarsDeliveredCents = 0;
    for (const contract of f.contracts) {
      mealsServed += contract.meals.length;
      for (const meal of contract.meals) {
        dollarsDeliveredCents += meal.program.reimbursementRateCents;
      }
    }
    return {
      id: f.id,
      name: f.name,
      kind: f.kind,
      mealsServed,
      dollarsDeliveredCents,
      contractCount: f.contracts.length,
    };
  });

  return rows.sort((a, b) => b.mealsServed - a.mealsServed);
}

// ---------------------------------------------------------------------------
// Impact detail
// ---------------------------------------------------------------------------

export interface FunderContractLine {
  contractId: string;
  contractName: string;
  programName: string;
  mealsServed: number;
  dollarsDeliveredCents: number;
  budgetCents: number;
}

export interface FunderImpact {
  id: string;
  name: string;
  kind: string;
  mealsServed: number;
  dollarsDeliveredCents: number;
  contributionMarginCents: number;
  peopleServed: number;
  neighborhoodsReached: number;
  cboNetwork: number;
  certifiedRestaurants: number;
  budgetCents: number;
  budgetUtilizationPct: number;
  contracts: FunderContractLine[];
}

/** Full impact report for a single funder. Returns null if funder not found. */
export async function getFunderImpact(
  funderId: string,
): Promise<FunderImpact | null> {
  const funder = await prisma.funder.findUnique({
    where: { id: funderId },
    select: {
      id: true,
      name: true,
      kind: true,
      contracts: {
        select: {
          id: true,
          name: true,
          budgetCents: true,
          program: { select: { name: true, reimbursementRateCents: true } },
          meals: {
            select: {
              status: true,
              memberId: true,
              marketId: true,
              cboId: true,
              restaurantPartnerId: true,
              restaurantPartner: { select: { certified: true } },
              costLineItems: { select: { type: true, amountCents: true } },
              program: { select: { reimbursementRateCents: true } },
            },
          },
        },
      },
    },
  });

  if (!funder) return null;

  // Aggregate across all contracts
  const members = new Set<string>();
  const markets = new Set<string>();
  const cbos = new Set<string>();
  const certifiedRps = new Set<string>();

  let budgetCents = 0;

  // Collect all realized meals across all contracts for rollupMargin
  const allRealizedMealInputs: Parameters<typeof mealEcon>[0][] = [];

  const contracts: FunderContractLine[] = funder.contracts.map((c) => {
    budgetCents += Number(c.budgetCents);

    const realizedMeals = c.meals.filter((m) => isRealized(m.status));

    let contractDollars = 0;
    for (const m of realizedMeals) {
      const rate = m.program.reimbursementRateCents;
      contractDollars += rate;

      // Distinct counts
      if (m.memberId) members.add(m.memberId);
      markets.add(m.marketId);
      cbos.add(m.cboId);
      if (
        m.restaurantPartnerId &&
        m.restaurantPartner &&
        m.restaurantPartner.certified
      ) {
        certifiedRps.add(m.restaurantPartnerId);
      }

      // Feed rollup
      allRealizedMealInputs.push({
        reimbursementCents: rate,
        costLineItems: m.costLineItems.map((li) => ({
          type: li.type as CostType,
          amountCents: li.amountCents,
        })),
      });
    }

    return {
      contractId: c.id,
      contractName: c.name,
      programName: c.program.name,
      mealsServed: realizedMeals.length,
      dollarsDeliveredCents: contractDollars,
      budgetCents: Number(c.budgetCents),
    };
  });

  const rollup = rollupMargin(allRealizedMealInputs);

  const dollarsDeliveredCents = rollup.revenueCents;
  const contributionMarginCents = rollup.marginCents;

  const budgetUtilizationPct =
    budgetCents === 0 ? 0 : dollarsDeliveredCents / budgetCents;

  return {
    id: funder.id,
    name: funder.name,
    kind: funder.kind,
    mealsServed: rollup.mealCount,
    dollarsDeliveredCents,
    contributionMarginCents,
    peopleServed: members.size,
    neighborhoodsReached: markets.size,
    cboNetwork: cbos.size,
    certifiedRestaurants: certifiedRps.size,
    budgetCents,
    budgetUtilizationPct,
    contracts,
  };
}
