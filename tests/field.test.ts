import { describe, it, expect } from "vitest";
import {
  fieldStageFor,
  toFieldItem,
  buildFieldQueue,
  productionSummary,
  verificationRate,
  DELIVER_OVERDUE_HOURS,
  VERIFY_OVERDUE_HOURS,
  type FieldMeal,
} from "@/lib/field";

const NOW = new Date("2026-06-21T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600 * 1000);

function meal(over: Partial<FieldMeal> = {}): FieldMeal {
  return {
    id: "m1",
    status: "PRODUCED",
    programName: "MTM",
    cboName: "Part of the Solution",
    marketLabel: "Mott Haven, Bronx",
    kitchenName: "Bronx Community Kitchen",
    mealDate: NOW,
    plannedAt: hoursAgo(6),
    producedAt: hoursAgo(2),
    deliveredAt: null,
    deliveryPhotoUrl: null,
    ...over,
  };
}

describe("fieldStageFor", () => {
  it("maps a status to its next field action", () => {
    expect(fieldStageFor("PLANNED")).toBe("produce");
    expect(fieldStageFor("PRODUCED")).toBe("deliver");
    expect(fieldStageFor("DELIVERED")).toBe("verify");
  });
  it("returns null when there is nothing to do", () => {
    expect(fieldStageFor("VERIFIED")).toBeNull();
  });
});

describe("toFieldItem", () => {
  it("drops meals with no actionable step", () => {
    expect(toFieldItem(meal({ status: "VERIFIED" }), NOW)).toBeNull();
  });

  it("measures produce age from plannedAt and flags overdue once the meal date arrives", () => {
    // due tomorrow → not overdue; due today/earlier → overdue
    const future = toFieldItem(
      meal({ status: "PLANNED", plannedAt: hoursAgo(3), mealDate: new Date(NOW.getTime() + 24 * 3600 * 1000) }),
      NOW,
    );
    expect(future?.stage).toBe("produce");
    expect(future?.overdue).toBe(false);
    expect(Math.round(future!.ageHours)).toBe(3);

    const due = toFieldItem(meal({ status: "PLANNED", mealDate: hoursAgo(1) }), NOW);
    expect(due?.stage).toBe("produce");
    expect(due?.overdue).toBe(true);
  });

  it("measures deliver age from producedAt and flags overdue at the threshold", () => {
    const fresh = toFieldItem(meal({ producedAt: hoursAgo(5) }), NOW);
    expect(fresh?.stage).toBe("deliver");
    expect(fresh?.overdue).toBe(false);
    expect(Math.round(fresh!.ageHours)).toBe(5);

    const late = toFieldItem(meal({ producedAt: hoursAgo(DELIVER_OVERDUE_HOURS) }), NOW);
    expect(late?.overdue).toBe(true);
  });

  it("measures verify age from deliveredAt and flags overdue at the threshold", () => {
    const fresh = toFieldItem(
      meal({ status: "DELIVERED", producedAt: hoursAgo(50), deliveredAt: hoursAgo(10) }),
      NOW,
    );
    expect(fresh?.stage).toBe("verify");
    expect(fresh?.overdue).toBe(false);

    const late = toFieldItem(
      meal({ status: "DELIVERED", deliveredAt: hoursAgo(VERIFY_OVERDUE_HOURS) }),
      NOW,
    );
    expect(late?.overdue).toBe(true);
  });
});

describe("buildFieldQueue", () => {
  it("orders overdue first, then oldest within the deliver backlog", () => {
    const meals: FieldMeal[] = [
      meal({ id: "fresh", producedAt: hoursAgo(1) }),
      meal({ id: "overdue-old", producedAt: hoursAgo(60) }),
      meal({ id: "overdue-recent", producedAt: hoursAgo(30) }),
      meal({ id: "done", status: "VERIFIED" }), // filtered out
    ];
    const q = buildFieldQueue(meals, NOW);
    expect(q.map((i) => i.id)).toEqual(["overdue-old", "overdue-recent", "fresh"]);
  });

  it("surfaces the most recently delivered first in the non-overdue verify queue", () => {
    const meals: FieldMeal[] = [
      meal({ id: "verify-old", status: "DELIVERED", deliveredAt: hoursAgo(20) }),
      meal({ id: "verify-fresh", status: "DELIVERED", deliveredAt: hoursAgo(1) }),
    ];
    const q = buildFieldQueue(meals, NOW);
    // a meal you just delivered is ready to verify at the top, not buried
    expect(q.map((i) => i.id)).toEqual(["verify-fresh", "verify-old"]);
  });
});

describe("productionSummary", () => {
  it("counts the queue by stage and tallies overdue", () => {
    const meals: FieldMeal[] = [
      meal({ id: "p1", status: "PLANNED", mealDate: hoursAgo(1) }), // produce, overdue
      meal({ id: "p2", status: "PLANNED", mealDate: new Date(NOW.getTime() + 24 * 3600 * 1000) }), // produce
      meal({ id: "d1", status: "PRODUCED", producedAt: hoursAgo(1) }), // deliver
      meal({ id: "v1", status: "DELIVERED", deliveredAt: hoursAgo(1) }), // verify
      meal({ id: "done", status: "VERIFIED" }), // filtered out
    ];
    const s = productionSummary(buildFieldQueue(meals, NOW));
    expect(s).toEqual({ produce: 2, deliver: 1, verify: 1, overdue: 1, total: 4 });
  });
});

describe("verificationRate", () => {
  it("is verified / (delivered + verified), ignoring earlier stages", () => {
    expect(verificationRate(["VERIFIED", "VERIFIED", "DELIVERED", "PRODUCED", "PLANNED"]))
      .toBeCloseTo(2 / 3);
  });
  it("is 0 when nothing has been delivered yet", () => {
    expect(verificationRate(["PLANNED", "PRODUCED"])).toBe(0);
  });
});
