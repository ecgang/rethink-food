import { describe, expect, it } from "vitest";
import {
  isOpen,
  openCount,
  sortIncidents,
  isActionable,
  type IncidentItem,
} from "@/lib/incidents";

function makeItem(
  overrides: Partial<IncidentItem> & { id: string },
): IncidentItem {
  return {
    kind: "OTHER",
    severity: "LOW",
    status: "OPEN",
    title: "Test incident",
    reportedAt: new Date("2024-01-01T12:00:00Z"),
    ...overrides,
  };
}

describe("isOpen", () => {
  it("returns true for OPEN", () => {
    expect(isOpen("OPEN")).toBe(true);
  });
  it("returns true for ACKNOWLEDGED", () => {
    expect(isOpen("ACKNOWLEDGED")).toBe(true);
  });
  it("returns false for RESOLVED", () => {
    expect(isOpen("RESOLVED")).toBe(false);
  });
});

describe("openCount", () => {
  it("counts only OPEN and ACKNOWLEDGED items", () => {
    const items: IncidentItem[] = [
      makeItem({ id: "1", status: "OPEN" }),
      makeItem({ id: "2", status: "ACKNOWLEDGED" }),
      makeItem({ id: "3", status: "RESOLVED" }),
    ];
    expect(openCount(items)).toBe(2);
  });

  it("returns 0 when all are resolved", () => {
    const items = [
      makeItem({ id: "1", status: "RESOLVED" }),
      makeItem({ id: "2", status: "RESOLVED" }),
    ];
    expect(openCount(items)).toBe(0);
  });

  it("returns 0 for empty array", () => {
    expect(openCount([])).toBe(0);
  });
});

describe("sortIncidents", () => {
  it("puts open incidents before resolved", () => {
    const items = [
      makeItem({ id: "resolved", status: "RESOLVED", severity: "CRITICAL" }),
      makeItem({ id: "open", status: "OPEN", severity: "LOW" }),
    ];
    const sorted = sortIncidents(items);
    expect(sorted[0].id).toBe("open");
    expect(sorted[1].id).toBe("resolved");
  });

  it("sorts by severity descending within open", () => {
    const items = [
      makeItem({ id: "low", status: "OPEN", severity: "LOW" }),
      makeItem({ id: "critical", status: "OPEN", severity: "CRITICAL" }),
      makeItem({ id: "medium", status: "OPEN", severity: "MEDIUM" }),
      makeItem({ id: "high", status: "OPEN", severity: "HIGH" }),
    ];
    const sorted = sortIncidents(items);
    expect(sorted.map((i) => i.id)).toEqual(["critical", "high", "medium", "low"]);
  });

  it("sorts newest first within same severity and status", () => {
    const items = [
      makeItem({ id: "older", status: "OPEN", severity: "HIGH", reportedAt: new Date("2024-01-01T10:00:00Z") }),
      makeItem({ id: "newer", status: "OPEN", severity: "HIGH", reportedAt: new Date("2024-01-01T14:00:00Z") }),
    ];
    const sorted = sortIncidents(items);
    expect(sorted[0].id).toBe("newer");
    expect(sorted[1].id).toBe("older");
  });

  it("does not mutate the input array", () => {
    const items = [
      makeItem({ id: "b", severity: "LOW" }),
      makeItem({ id: "a", severity: "CRITICAL" }),
    ];
    const original = [...items];
    sortIncidents(items);
    expect(items[0].id).toBe(original[0].id);
    expect(items[1].id).toBe(original[1].id);
  });

  it("puts ACKNOWLEDGED before RESOLVED", () => {
    const items = [
      makeItem({ id: "resolved", status: "RESOLVED" }),
      makeItem({ id: "acked", status: "ACKNOWLEDGED" }),
    ];
    const sorted = sortIncidents(items);
    expect(sorted[0].id).toBe("acked");
  });
});

describe("isActionable", () => {
  it("returns true for open HIGH", () => {
    expect(isActionable("HIGH", "OPEN")).toBe(true);
  });
  it("returns true for open CRITICAL", () => {
    expect(isActionable("CRITICAL", "OPEN")).toBe(true);
  });
  it("returns true for acknowledged CRITICAL", () => {
    expect(isActionable("CRITICAL", "ACKNOWLEDGED")).toBe(true);
  });
  it("returns false for resolved CRITICAL", () => {
    expect(isActionable("CRITICAL", "RESOLVED")).toBe(false);
  });
  it("returns false for open MEDIUM", () => {
    expect(isActionable("MEDIUM", "OPEN")).toBe(false);
  });
  it("returns false for open LOW", () => {
    expect(isActionable("LOW", "OPEN")).toBe(false);
  });
});
