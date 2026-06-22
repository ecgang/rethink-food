/**
 * Tests for the Morning Briefing (feature ③).
 *
 * Covers the deterministic boundary: the fallback briefing, the validation that
 * keeps the model from inventing or re-ranking exceptions (filterToKnown), and
 * the missing-info detector. The LLM narration itself is not unit-tested — its
 * fidelity is enforced structurally by filterToKnown + the engine-owned severity.
 */
import { describe, it, expect } from "vitest";
import { fallbackBriefing, filterToKnown } from "@/lib/ai/briefing";
import { detectMissingIntakeInfo } from "@/lib/ai/missing-info";
import type { ExceptionItem } from "@/lib/exceptions";

const ITEMS: ExceptionItem[] = [
  {
    reasonCode: "CONTRACT_BILLING_OVERDUE", severity: "CRITICAL", entityType: "Contract",
    entityId: "ct1", title: "Billing overdue", detail: "Invoice 5 days late.", recommendedAction: "Generate invoice.",
  },
  {
    reasonCode: "PRODUCED_NOT_DELIVERED", severity: "HIGH", entityType: "Meal",
    entityId: "m1", title: "Stuck in production", detail: "Produced 30h ago.", recommendedAction: "Dispatch delivery.",
  },
  {
    reasonCode: "KITCHEN_UNDER_CAPACITY", severity: "LOW", entityType: "Kitchen",
    entityId: "k1", title: "Underutilized", detail: "At 40% capacity.", recommendedAction: "Reallocate volume.",
  },
];

describe("fallbackBriefing", () => {
  it("summarizes counts by severity and sorts prioritized most-severe first", () => {
    const b = fallbackBriefing(ITEMS, "2026-06-22T09:00:00.000Z");
    expect(b.summary).toContain("3 open exceptions");
    expect(b.summary).toContain("1 critical");
    expect(b.summary).toContain("1 high");
    expect(b.summary).toContain("1 low");
    expect(b.prioritized.map((p) => p.severity)).toEqual(["CRITICAL", "HIGH", "LOW"]);
    expect(b.prioritized[0].why).toBe("Invoice 5 days late."); // uses engine detail
    expect(b.modelUsed).toBe("deterministic-fallback");
  });

  it("reports a calm message when there are no exceptions", () => {
    const b = fallbackBriefing([], "2026-06-22T09:00:00.000Z");
    expect(b.summary).toContain("Nothing needs attention");
    expect(b.prioritized).toHaveLength(0);
  });
});

describe("filterToKnown (anti-hallucination guard)", () => {
  it("drops items whose (reasonCode, entityId) pair is not a real exception", () => {
    const modelOutput = [
      { reasonCode: "CONTRACT_BILLING_OVERDUE", entityId: "ct1", why: "late", suggestedAction: "bill" },
      { reasonCode: "FABRICATED_CODE", entityId: "zzz", why: "made up", suggestedAction: "nope" },
      { reasonCode: "PRODUCED_NOT_DELIVERED", entityId: "WRONG_ID", why: "x", suggestedAction: "y" },
    ];
    const out = filterToKnown(modelOutput, ITEMS);
    expect(out).toHaveLength(1);
    expect(out[0].entityId).toBe("ct1");
  });

  it("takes severity and entityType from the engine, never from the model", () => {
    const modelOutput = [
      // model tries to downgrade a CRITICAL to LOW and lie about the type — ignored
      { reasonCode: "CONTRACT_BILLING_OVERDUE", entityId: "ct1", why: "late", suggestedAction: "bill", severity: "LOW", entityType: "Meal" },
    ];
    const out = filterToKnown(modelOutput, ITEMS);
    expect(out[0].severity).toBe("CRITICAL");
    expect(out[0].entityType).toBe("Contract");
  });

  it("falls back to the engine's detail/action when the model omits them", () => {
    const out = filterToKnown([{ reasonCode: "PRODUCED_NOT_DELIVERED", entityId: "m1" }], ITEMS);
    expect(out[0].why).toBe("Produced 30h ago.");
    expect(out[0].suggestedAction).toBe("Dispatch delivery.");
  });
});

describe("detectMissingIntakeInfo", () => {
  const now = new Date("2026-06-22T00:00:00Z");

  it("flags absent and low-confidence required fields", () => {
    const items = detectMissingIntakeInfo([
      {
        id: "i1",
        extractedFields: { cbo: "Hope Pantry", quantity: null, deliveryDate: "2026-07-01" },
        confidenceFlags: { cbo: "high", deliveryDate: "low" },
        createdAt: now,
      },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].cboName).toBe("Hope Pantry");
    // quantity is null → missing; deliveryDate present but low-confidence → missing; cbo high → ok
    expect(items[0].missingFields).toEqual(expect.arrayContaining(["quantity", "delivery date"]));
    expect(items[0].missingFields).not.toContain("CBO name");
  });

  it("emits nothing for a complete, high-confidence request", () => {
    const items = detectMissingIntakeInfo([
      {
        id: "i2",
        extractedFields: { cbo: "Hope Pantry", quantity: 200, deliveryDate: "2026-07-01" },
        confidenceFlags: { cbo: "high", quantity: "high", deliveryDate: "high" },
        createdAt: now,
      },
    ]);
    expect(items).toHaveLength(0);
  });

  it("tolerates malformed JSON columns without throwing", () => {
    const items = detectMissingIntakeInfo([
      { id: "i3", extractedFields: null, confidenceFlags: "garbage", createdAt: now },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].missingFields).toHaveLength(3); // all required fields absent
  });
});
