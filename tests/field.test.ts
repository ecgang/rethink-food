import { describe, it, expect } from "vitest";
import {
  fieldStageFor,
  toFieldItem,
  buildFieldQueue,
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
    producedAt: hoursAgo(2),
    deliveredAt: null,
    deliveryPhotoUrl: null,
    ...over,
  };
}

describe("fieldStageFor", () => {
  it("maps a status to its next field action", () => {
    expect(fieldStageFor("PRODUCED")).toBe("deliver");
    expect(fieldStageFor("DELIVERED")).toBe("verify");
  });
  it("returns null when there is nothing to do", () => {
    expect(fieldStageFor("PLANNED")).toBeNull();
    expect(fieldStageFor("VERIFIED")).toBeNull();
  });
});

describe("toFieldItem", () => {
  it("drops meals with no actionable step", () => {
    expect(toFieldItem(meal({ status: "VERIFIED" }), NOW)).toBeNull();
    expect(toFieldItem(meal({ status: "PLANNED" }), NOW)).toBeNull();
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
  it("orders overdue first, then oldest within each group", () => {
    const meals: FieldMeal[] = [
      meal({ id: "fresh", producedAt: hoursAgo(1) }),
      meal({ id: "overdue-old", producedAt: hoursAgo(60) }),
      meal({ id: "overdue-recent", producedAt: hoursAgo(30) }),
      meal({ id: "done", status: "VERIFIED" }), // filtered out
    ];
    const q = buildFieldQueue(meals, NOW);
    expect(q.map((i) => i.id)).toEqual(["overdue-old", "overdue-recent", "fresh"]);
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
