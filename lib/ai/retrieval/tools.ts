// Retrieval tools for "Ask the Operating Layer" (feature ④).
//
// This is the ONLY module under lib/ai/* allowed to import lib/db. Every tool
// queries Prisma through an EXPLICIT `select:` whitelist and projects rows to a
// `Citation` — the synthesis layer never sees a raw Prisma model. PII fields
// (Cbo.contactEmail, IntakeRequest.rawInput/extractedFields) are never selected
// and never projected, so a fact can only appear in an answer if it already
// appears on an existing detail page.
//
// We deliberately use bounded structured queries, NOT embeddings: at this data
// scale (tens of partners/contracts) exact-match Prisma queries are faster, keep
// ID/name precision, and give every fact a traceable record id for free.

import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { formatUsdCompact } from "@/lib/money";

/** A single retrieved record, projected to display-safe fields only. */
export interface Citation {
  type: "cbo" | "restaurant" | "funder" | "contract" | "program";
  id: string;
  label: string;
  /** Link to the existing detail page for this record, when one exists. */
  href?: string;
  /** Whitelisted, display-safe fields. Never contains PII. */
  fields: Record<string, string | number | boolean>;
}

/** A retrieval tool: an Anthropic tool definition plus a bounded Prisma-backed runner. */
export interface RetrievalTool {
  name: string;
  description: string;
  inputSchema: Anthropic.Tool.InputSchema;
  run(input: Record<string, unknown>): Promise<Citation[]>;
}

const RESULT_LIMIT = 8;

function hrefFor(type: Citation["type"], id: string): string | undefined {
  switch (type) {
    case "cbo": return `/partners/cbo/${id}`;
    case "restaurant": return `/partners/restaurant/${id}`;
    case "funder": return `/funders/${id}`;
    case "contract": return `/contracts/${id}`;
    case "program": return undefined; // no standalone program detail page
  }
}

// ---------------------------------------------------------------------------
// Pure projectors — the whitelist boundary. Each takes a plain row and returns
// a Citation containing ONLY display-safe fields. Unit-tested without a DB.
// ---------------------------------------------------------------------------

interface MarketRef { borough: string; neighborhood: string }

export function projectCbo(row: { id: string; name: string; market?: MarketRef | null }): Citation {
  return {
    type: "cbo",
    id: row.id,
    label: row.name,
    href: hrefFor("cbo", row.id),
    fields: {
      kind: "Community-based organization",
      ...(row.market ? { borough: row.market.borough, neighborhood: row.market.neighborhood } : {}),
    },
  };
}

export function projectRestaurant(row: {
  id: string; name: string; certified: boolean; minorityOwned: boolean;
  weeklyCapacity: number; market?: MarketRef | null;
}): Citation {
  return {
    type: "restaurant",
    id: row.id,
    label: row.name,
    href: hrefFor("restaurant", row.id),
    fields: {
      kind: "Restaurant partner",
      certified: row.certified,
      minorityOwned: row.minorityOwned,
      weeklyCapacity: row.weeklyCapacity,
      ...(row.market ? { borough: row.market.borough } : {}),
    },
  };
}

export function projectFunder(row: {
  id: string; name: string; kind: string; contractCount: number; totalBudgetCents: number;
}): Citation {
  return {
    type: "funder",
    id: row.id,
    label: row.name,
    href: hrefFor("funder", row.id),
    fields: {
      kind: row.kind,
      contracts: row.contractCount,
      totalBudget: formatUsdCompact(row.totalBudgetCents),
    },
  };
}

export function projectContract(row: {
  id: string; name: string; budgetCents: bigint; startDate: Date; endDate: Date;
  billingDeadline: Date | null; funder?: { name: string } | null; program?: { name: string } | null;
}): Citation {
  return {
    type: "contract",
    id: row.id,
    label: row.name,
    href: hrefFor("contract", row.id),
    fields: {
      ...(row.funder ? { funder: row.funder.name } : {}),
      ...(row.program ? { program: row.program.name } : {}),
      budget: formatUsdCompact(Number(row.budgetCents)),
      startDate: row.startDate.toISOString().slice(0, 10),
      endDate: row.endDate.toISOString().slice(0, 10),
      ...(row.billingDeadline
        ? { billingDeadline: row.billingDeadline.toISOString().slice(0, 10) }
        : {}),
    },
  };
}

function asQuery(input: Record<string, unknown>, key = "query"): string {
  const v = input[key];
  return typeof v === "string" ? v.trim().slice(0, 120) : "";
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const searchPartners: RetrievalTool = {
  name: "search_partners",
  description:
    "Find community-based organizations (CBOs) and restaurant partners by name or neighborhood. " +
    "Returns matching partner records. Use this to locate a partner before asking about its activity.",
  inputSchema: {
    type: "object",
    properties: { query: { type: "string", description: "Name or neighborhood to search for." } },
    required: ["query"],
  },
  async run(input) {
    const query = asQuery(input);
    if (!query) return [];
    const [cbos, restaurants] = await Promise.all([
      prisma.cbo.findMany({
        where: {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { market: { is: { neighborhood: { contains: query, mode: "insensitive" } } } },
            { market: { is: { borough: { contains: query, mode: "insensitive" } } } },
          ],
        },
        // Whitelist: id + name + market only. contactEmail/address intentionally omitted.
        select: { id: true, name: true, market: { select: { borough: true, neighborhood: true } } },
        take: RESULT_LIMIT,
      }),
      prisma.restaurantPartner.findMany({
        where: {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { market: { is: { borough: { contains: query, mode: "insensitive" } } } },
          ],
        },
        select: {
          id: true, name: true, certified: true, minorityOwned: true, weeklyCapacity: true,
          market: { select: { borough: true, neighborhood: true } },
        },
        take: RESULT_LIMIT,
      }),
    ]);
    return [...cbos.map(projectCbo), ...restaurants.map(projectRestaurant)];
  },
};

const getContracts: RetrievalTool = {
  name: "get_contracts",
  description:
    "Look up funding contracts, optionally filtered by funder name or program name. " +
    "Returns contract budgets, start/end dates, and billing deadlines.",
  inputSchema: {
    type: "object",
    properties: {
      funder: { type: "string", description: "Funder name to filter by (optional)." },
      program: { type: "string", description: "Program name to filter by (optional)." },
    },
  },
  async run(input) {
    const funder = asQuery(input, "funder");
    const program = asQuery(input, "program");
    const where: Record<string, unknown> = {};
    if (funder) where.funder = { is: { name: { contains: funder, mode: "insensitive" } } };
    if (program) where.program = { is: { name: { contains: program, mode: "insensitive" } } };
    const contracts = await prisma.contract.findMany({
      where,
      select: {
        id: true, name: true, budgetCents: true, startDate: true, endDate: true,
        billingDeadline: true,
        funder: { select: { name: true } },
        program: { select: { name: true } },
      },
      take: RESULT_LIMIT,
      orderBy: { startDate: "desc" },
    });
    return contracts.map(projectContract);
  },
};

const listFunders: RetrievalTool = {
  name: "list_funders",
  description:
    "List all funders with their type, number of contracts, and total committed budget. " +
    "Use for roster / overview questions about who funds Rethink.",
  inputSchema: { type: "object", properties: {} },
  async run() {
    const funders = await prisma.funder.findMany({
      select: { id: true, name: true, kind: true, contracts: { select: { budgetCents: true } } },
    });
    return funders.map((f) =>
      projectFunder({
        id: f.id,
        name: f.name,
        kind: f.kind,
        contractCount: f.contracts.length,
        totalBudgetCents: f.contracts.reduce((sum, c) => sum + Number(c.budgetCents), 0),
      }),
    );
  },
};

const partnerActivity: RetrievalTool = {
  name: "partner_activity",
  description:
    "For a named community-based organization, return its meal activity: total meals scheduled and " +
    "realized (delivered or verified). Use for 'how many meals has X received' style questions.",
  inputSchema: {
    type: "object",
    properties: { partner: { type: "string", description: "CBO name." } },
    required: ["partner"],
  },
  async run(input) {
    const partner = asQuery(input, "partner");
    if (!partner) return [];
    const cbo = await prisma.cbo.findFirst({
      where: { name: { contains: partner, mode: "insensitive" } },
      select: { id: true, name: true, market: { select: { borough: true, neighborhood: true } } },
    });
    if (!cbo) return [];
    const [total, realized] = await Promise.all([
      prisma.meal.count({ where: { cboId: cbo.id } }),
      prisma.meal.count({ where: { cboId: cbo.id, status: { in: ["DELIVERED", "VERIFIED"] } } }),
    ]);
    const citation = projectCbo(cbo);
    citation.fields = { ...citation.fields, totalMeals: total, realizedMeals: realized };
    return [citation];
  },
};

export const RETRIEVAL_TOOLS: RetrievalTool[] = [
  searchPartners,
  getContracts,
  listFunders,
  partnerActivity,
];

/** Dedupe citations by type+id, preserving first-seen order. */
export function dedupeCitations(citations: Citation[]): Citation[] {
  const seen = new Set<string>();
  const out: Citation[] = [];
  for (const c of citations) {
    const key = `${c.type}:${c.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/** Plain-text rendering of a citation list, fed back to the model as a tool result. */
export function citationsToToolResult(citations: Citation[]): string {
  if (citations.length === 0) return "No matching records found.";
  return citations
    .map((c) => {
      const detail = Object.entries(c.fields)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
      return `[${c.type}:${c.id}] ${c.label} — ${detail}`;
    })
    .join("\n");
}
