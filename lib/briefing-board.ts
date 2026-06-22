// Orchestrator for the home-page "Today's Briefing" (feature ③).
//
// This is the DB-touching layer that keeps lib/ai/* pure: it fetches the live
// exceptions + pending intakes, then calls the pure generators. Cached for 24h
// (the briefing is a daily snapshot, not a live view, and we don't want to call
// the model on every page load). Tagged "briefing" so the manual regenerate
// action can bust it on demand. There is intentionally no rate limiting yet
// (documented production TODO); the 24h TTL is the cost guard for the MVP.

import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { getActOnToday } from "@/lib/queries";
import { generateBriefing, type Briefing } from "@/lib/ai/briefing";
import { detectMissingIntakeInfo, type MissingInfoItem } from "@/lib/ai/missing-info";

export const BRIEFING_CACHE_TAG = "briefing";

export interface BriefingBoard {
  briefing: Briefing;
  missingInfo: MissingInfoItem[];
}

async function buildBriefingBoard(): Promise<BriefingBoard> {
  const [exceptions, pending] = await Promise.all([
    getActOnToday(),
    prisma.intakeRequest.findMany({
      where: { status: "PENDING" },
      select: { id: true, extractedFields: true, confidenceFlags: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
  ]);
  const [briefing, missingInfo] = [
    await generateBriefing(exceptions),
    detectMissingIntakeInfo(pending),
  ];
  return { briefing, missingInfo };
}

/** 24h-cached briefing board. Bust with revalidateTag(BRIEFING_CACHE_TAG). */
export const getBriefingBoard = unstable_cache(buildBriefingBoard, ["briefing-board"], {
  revalidate: 86_400,
  tags: [BRIEFING_CACHE_TAG],
});
