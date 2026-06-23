import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock is hoisted above all imports, so factory bodies must not reference
// outer `const` variables. Use inline vi.fn() and retrieve refs via imports.

// Stub server-only boundary so the import doesn't throw in Node.
vi.mock("server-only", () => ({}));
// Stub Next.js cache invalidation — no filesystem side-effects in tests.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// Prisma mock: only `safetyCheck.create` is called by submitSafetyCheck.
vi.mock("@/lib/db", () => ({ prisma: { safetyCheck: { create: vi.fn() } } }));

// `@/lib/current-role` is mocked so role can be mutated per-test.
import * as currentRole from "@/lib/current-role";
vi.mock("@/lib/current-role", () => ({
  getCurrentRole: vi.fn(),
  getOperatorIdentity: vi.fn(),
}));

import { submitSafetyCheck } from "@/app/actions/safety";
import { prisma } from "@/lib/db";
import { CHECKLISTS } from "@/lib/safety";

// Typed references to the mocked fns.
const mockCreate = prisma.safetyCheck.create as ReturnType<typeof vi.fn>;
const mockGetCurrentRole = currentRole.getCurrentRole as ReturnType<typeof vi.fn>;
const mockGetOperatorIdentity = currentRole.getOperatorIdentity as ReturnType<typeof vi.fn>;

// Helper: build a FormData with the required safety-check fields.
function makeFormData(overrides: {
  kind?: string;
  responses?: string;
  temperatureF?: string;
  kitchenId?: string;
  mealDate?: string;
} = {}): FormData {
  const fd = new FormData();
  fd.set("kind", overrides.kind ?? "FOOD_SAFETY");
  fd.set("responses", overrides.responses ?? allOkFoodSafetyResponses());
  if (overrides.temperatureF !== undefined) fd.set("temperatureF", overrides.temperatureF);
  if (overrides.kitchenId !== undefined) fd.set("kitchenId", overrides.kitchenId);
  if (overrides.mealDate !== undefined) fd.set("mealDate", overrides.mealDate);
  return fd;
}

// Build a responses JSON string where every FOOD_SAFETY item is ok: true.
function allOkFoodSafetyResponses(): string {
  return JSON.stringify(
    CHECKLISTS.FOOD_SAFETY.map((item) => ({ itemId: item.id, ok: true })),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: OPS role with a known operator identity.
  mockGetCurrentRole.mockResolvedValue("OPS");
  mockGetOperatorIdentity.mockResolvedValue("operator@example.com");
  mockCreate.mockResolvedValue({ id: "sc_1" });
});

describe("submitSafetyCheck", () => {
  describe("role guard", () => {
    it("should reject FINANCE role and not call create", async () => {
      mockGetCurrentRole.mockResolvedValue("FINANCE");

      const result = await submitSafetyCheck(makeFormData());

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/role/i);
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe("valid submission", () => {
    it("should call create once and return {ok:true, passed:true} for all-ok FOOD_SAFETY check", async () => {
      const result = await submitSafetyCheck(makeFormData());

      expect(result).toEqual({ ok: true, passed: true });
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });
  });

  describe("kind validation", () => {
    it("should reject an invalid kind and not call create", async () => {
      const result = await submitSafetyCheck(makeFormData({ kind: "INVALID_KIND" }));

      expect(result.ok).toBe(false);
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe("responses validation", () => {
    it("should reject non-string responses and not call create", async () => {
      // FormData.get returns null when key is absent — simulates missing field.
      const fd = new FormData();
      fd.set("kind", "FOOD_SAFETY");
      // No "responses" key → get("responses") returns null.

      const result = await submitSafetyCheck(fd);

      expect(result.ok).toBe(false);
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("should reject malformed JSON in responses and not call create", async () => {
      const result = await submitSafetyCheck(makeFormData({ responses: "not-json{{{" }));

      expect(result.ok).toBe(false);
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe("unknown itemId guard", () => {
    it("should reject a response with an itemId not in the checklist for that kind", async () => {
      const responses = JSON.stringify([
        ...CHECKLISTS.FOOD_SAFETY.map((i) => ({ itemId: i.id, ok: true })),
        { itemId: "nonexistent-item-xyz", ok: true },
      ]);

      const result = await submitSafetyCheck(makeFormData({ responses }));

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("Unknown checklist item.");
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe("failed check persistence", () => {
    it("should call create with passed:false and return {ok:true, passed:false} when a required item is not ok", async () => {
      // Mark the first required FOOD_SAFETY item as failing.
      const responses = CHECKLISTS.FOOD_SAFETY.map((item, idx) => ({
        itemId: item.id,
        ok: idx !== 0, // first required item fails
      }));

      const result = await submitSafetyCheck(
        makeFormData({ responses: JSON.stringify(responses) }),
      );

      expect(result).toEqual({ ok: true, passed: false });
      expect(mockCreate).toHaveBeenCalledTimes(1);
      const callArg = mockCreate.mock.calls[0][0] as { data: { passed: boolean } };
      expect(callArg.data.passed).toBe(false);
    });
  });

  describe("temperature validation", () => {
    it("should return {ok:true, passed:false} when temperatureF exceeds the cold-holding limit", async () => {
      // 50°F exceeds the 41°F FDA limit — all items ok but temp fails the check.
      const result = await submitSafetyCheck(makeFormData({ temperatureF: "50" }));

      expect(result).toEqual({ ok: true, passed: false });
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it("should reject a non-numeric temperatureF string and not call create", async () => {
      const result = await submitSafetyCheck(makeFormData({ temperatureF: "abc" }));

      expect(result.ok).toBe(false);
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe("kitchenId validation", () => {
    it("should reject a kitchenId longer than 64 characters and not call create", async () => {
      const tooLong = "k".repeat(65);

      const result = await submitSafetyCheck(makeFormData({ kitchenId: tooLong }));

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("Invalid kitchen reference.");
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe("FK violation handling", () => {
    it("should catch a create rejection and return {ok:false} without throwing", async () => {
      mockCreate.mockRejectedValue(new Error("FK constraint violation"));

      const result = await submitSafetyCheck(makeFormData());

      expect(result.ok).toBe(false);
      // Verify it doesn't propagate — no unhandled rejection.
    });
  });
});
