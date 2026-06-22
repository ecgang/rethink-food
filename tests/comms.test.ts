/**
 * Tests for the comms agent generators (⑤) and the folded-in ② narrator.
 *
 * We delete ANTHROPIC_API_KEY so getAnthropic() returns null and every generator
 * takes its deterministic fallback path — making these assertions stable in CI.
 * The model path is not unit-tested (non-deterministic); its grounding is enforced
 * by the prompts + the human approve/discard step.
 */
import { describe, it, expect, beforeAll } from "vitest";
import {
  draftIntakeClarification,
  draftDeliveryNudge,
  draftReconciliationFlag,
  draftReportNarrative,
} from "@/lib/ai/comms";
import type { WeeklyReportPayload } from "@/lib/reports";

beforeAll(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

describe("comms generators (deterministic fallback)", () => {
  it("intake clarification addresses the CBO and asks for the missing fields", async () => {
    const d = await draftIntakeClarification({
      cboName: "Hope Pantry",
      missingFields: ["quantity", "delivery date"],
    });
    expect(d.modelUsed).toBe("template-fallback");
    expect(d.body).toContain("Hope Pantry");
    expect(d.body).toContain("quantity");
    expect(d.body).toContain("delivery date");
  });

  it("delivery nudge subject reflects the issue type", async () => {
    const undelivered = await draftDeliveryNudge({
      mealLabel: "Meal abc123", cboName: "Hope", issue: "undelivered", hours: 30,
    });
    expect(undelivered.subject).toContain("Delivery pending");
    const unverified = await draftDeliveryNudge({
      mealLabel: "Meal abc123", cboName: "Hope", issue: "unverified", hours: 60,
    });
    expect(unverified.subject).toContain("Verification needed");
  });

  it("reconciliation flag names the contract, funder, and reason", async () => {
    const d = await draftReconciliationFlag({
      contractName: "MTM 2026", funderName: "PHS", reason: "Billing overdue by 5 days",
    });
    expect(d.body).toContain("MTM 2026");
    expect(d.body).toContain("PHS");
    expect(d.body).toContain("Billing overdue by 5 days");
  });

  it("report narrative uses only the provided totals", async () => {
    const payload: WeeklyReportPayload = {
      periodStart: "2026-06-15T00:00:00.000Z",
      periodEnd: "2026-06-22T00:00:00.000Z",
      totals: { mealsServed: 1247, dollarsDeliveredCents: 5_000_000, contributionMarginCents: 800_000 },
      funders: [
        { id: "f1", name: "Public Health Solutions", kind: "Healthcare", mealsServed: 1000, dollarsDeliveredCents: 4_000_000, contractCount: 2 },
      ],
    };
    const d = await draftReportNarrative(payload, "board");
    expect(d.subject).toContain("Board summary");
    expect(d.body).toContain("1,247"); // exact meals-served figure, formatted
    expect(d.body).toContain("Public Health Solutions");
  });
});
