/**
 * Evaluation harness for the intake parser.
 *
 * Runs against the deterministic parser so it needs no API key and is
 * deterministic in CI. The same fixtures double as a regression guard: when
 * the live model is wired up, these expected fields define the bar it must clear.
 */
import { describe, it, expect } from "vitest";
import { deterministicParse } from "@/lib/intake";

interface EvalCase {
  name: string;
  input: string;
  expect: {
    quantity?: number | null;
    recurrence?: string | null;
    dietaryIncludes?: string[];
    cboIncludes?: string;
    lowConfidenceFields?: string[];
  };
}

const CASES: EvalCase[] = [
  {
    name: "recurring halal request",
    input:
      "Hi Rethink team — La Jornada in Corona needs 250 halal meals delivered every Wednesday starting next week. A few clients are diabetic so lower-sodium where possible.",
    expect: {
      quantity: 250,
      recurrence: "WEEKLY",
      dietaryIncludes: ["halal", "diabetic", "lower-sodium"],
      cboIncludes: "La Jornada",
    },
  },
  {
    name: "one-time emergency",
    input:
      "URGENT: shelter on 161st had a pipe burst. Can you get us 120 meals tomorrow? No dietary restrictions.",
    expect: {
      quantity: 120,
      recurrence: "ONE_TIME",
    },
  },
  {
    name: "vague request flags low confidence",
    input:
      "hey just checking if you can help us out with some meals for our seniors program in brooklyn sometime soon, lmk",
    expect: {
      quantity: null,
      lowConfidenceFields: ["quantity", "deliveryDate"],
    },
  },
];

describe("intake parser eval", () => {
  let passed = 0;
  let total = 0;

  for (const c of CASES) {
    it(c.name, () => {
      const r = deterministicParse(c.input);

      if ("quantity" in c.expect) {
        total++;
        expect(r.fields.quantity).toBe(c.expect.quantity);
        passed++;
      }
      if (c.expect.recurrence !== undefined) {
        total++;
        expect(r.fields.recurrence).toBe(c.expect.recurrence);
        passed++;
      }
      for (const d of c.expect.dietaryIncludes ?? []) {
        total++;
        expect(r.fields.dietaryConstraints).toContain(d);
        passed++;
      }
      if (c.expect.cboIncludes) {
        total++;
        expect(r.fields.cbo ?? "").toContain(c.expect.cboIncludes);
        passed++;
      }
      for (const f of c.expect.lowConfidenceFields ?? []) {
        total++;
        expect(r.confidence[f as keyof typeof r.confidence]).toBe("low");
        passed++;
      }
    });
  }

  it("reports overall field-level accuracy", () => {
    // every assertion above contributes; this makes the eval score explicit
    expect(total).toBeGreaterThan(0);
    expect(passed / total).toBeGreaterThanOrEqual(0.9);
  });
});
