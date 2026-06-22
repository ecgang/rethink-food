"use server";

import { updateTag } from "next/cache";
import { BRIEFING_CACHE_TAG } from "@/lib/briefing-board";

/**
 * Manually regenerate today's briefing — expires the 24h cache so the next
 * render re-runs the model against current exceptions. Uses updateTag (not
 * revalidateTag) so the operator sees the fresh briefing immediately on this
 * action's re-render, rather than stale-while-revalidate content. No capability
 * gate: the briefing is read-only org context and the cost is one model call.
 */
export async function regenerateBriefingAction(): Promise<void> {
  updateTag(BRIEFING_CACHE_TAG);
}
