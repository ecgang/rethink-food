import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// vi.mock is hoisted above all imports, so factory bodies must not reference
// outer `const` variables. Use inline vi.fn() and retrieve refs via imports.

// Stub server-only boundary so the import doesn't throw in Node.
vi.mock("server-only", () => ({}));
// Stub Next.js cache invalidation — no filesystem side-effects in tests.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// Stub Vercel Blob — tests must never make real network calls.
vi.mock("@vercel/blob", () => ({ put: vi.fn() }));
// Prisma mock: reportIncident uses incident.create; resolveIncident uses incident.updateMany.
vi.mock("@/lib/db", () => ({
  prisma: { incident: { create: vi.fn(), updateMany: vi.fn() } },
}));

// `@/lib/current-role` is mocked so role can be mutated per-test.
import * as currentRole from "@/lib/current-role";
vi.mock("@/lib/current-role", () => ({
  getCurrentRole: vi.fn(),
  getOperatorIdentity: vi.fn(),
}));

import { reportIncident, resolveIncident } from "@/app/actions/incidents";
import { prisma } from "@/lib/db";
import * as blob from "@vercel/blob";

// Typed references to the mocked fns.
const mockCreate = prisma.incident.create as ReturnType<typeof vi.fn>;
const mockUpdateMany = prisma.incident.updateMany as ReturnType<typeof vi.fn>;
const mockPut = blob.put as ReturnType<typeof vi.fn>;
const mockGetCurrentRole = currentRole.getCurrentRole as ReturnType<typeof vi.fn>;
const mockGetOperatorIdentity = currentRole.getOperatorIdentity as ReturnType<typeof vi.fn>;

// Helpers: build FormData for each action.
function makeReportFormData(overrides: {
  kind?: string;
  severity?: string;
  title?: string;
  description?: string;
  kitchenId?: string;
  mealId?: string;
  photo?: File;
} = {}): FormData {
  const fd = new FormData();
  fd.set("kind", overrides.kind ?? "FOOD_SAFETY");
  fd.set("severity", overrides.severity ?? "MEDIUM");
  fd.set("title", overrides.title ?? "Test incident title");
  fd.set("description", overrides.description ?? "A description of the incident.");
  if (overrides.kitchenId !== undefined) fd.set("kitchenId", overrides.kitchenId);
  if (overrides.mealId !== undefined) fd.set("mealId", overrides.mealId);
  if (overrides.photo !== undefined) fd.set("photo", overrides.photo);
  return fd;
}

function makeResolveFormData(overrides: {
  incidentId?: string;
  resolutionNote?: string;
} = {}): FormData {
  const fd = new FormData();
  if (overrides.incidentId !== undefined) fd.set("incidentId", overrides.incidentId);
  if (overrides.resolutionNote !== undefined) fd.set("resolutionNote", overrides.resolutionNote);
  return fd;
}

// Build a small valid image File (1-byte PNG-ish, well under 2 MB).
function makeImageFile(type = "image/jpeg", sizeBytes = 100): File {
  const buf = new Uint8Array(sizeBytes);
  return new File([buf], "photo.jpg", { type });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: OPS role with a known operator identity.
  mockGetCurrentRole.mockResolvedValue("OPS");
  mockGetOperatorIdentity.mockResolvedValue("operator@example.com");
  mockCreate.mockResolvedValue({ id: "inc_1" });
  mockUpdateMany.mockResolvedValue({ count: 1 });
  // Ensure BLOB token is set by default; individual tests may delete it.
  process.env.BLOB_READ_WRITE_TOKEN = "test-token";
});

afterEach(() => {
  // Restore token so other test suites aren't affected.
  process.env.BLOB_READ_WRITE_TOKEN = "test-token";
});

describe("reportIncident", () => {
  describe("role guard", () => {
    it("should reject FINANCE role and not call create", async () => {
      mockGetCurrentRole.mockResolvedValue("FINANCE");

      const result = await reportIncident(makeReportFormData());

      expect(result.ok).toBe(false);
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe("valid submission", () => {
    it("should call create and return {ok:true, id} for OPS with valid fields", async () => {
      const result = await reportIncident(makeReportFormData());

      expect(result).toEqual({ ok: true, id: "inc_1" });
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });
  });

  describe("kind validation", () => {
    it("should reject an invalid kind and not call create", async () => {
      const result = await reportIncident(makeReportFormData({ kind: "INVALID_KIND" }));

      expect(result.ok).toBe(false);
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe("severity validation", () => {
    it("should reject an invalid severity and not call create", async () => {
      const result = await reportIncident(makeReportFormData({ severity: "EXTREME" }));

      expect(result.ok).toBe(false);
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe("title validation", () => {
    it("should reject an empty title and not call create", async () => {
      const result = await reportIncident(makeReportFormData({ title: "" }));

      expect(result.ok).toBe(false);
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe("description validation", () => {
    it("should reject an empty description and not call create", async () => {
      const result = await reportIncident(makeReportFormData({ description: "" }));

      expect(result.ok).toBe(false);
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe("photo validation", () => {
    it("should reject a non-image file and not call create", async () => {
      const pdf = new File([new Uint8Array(100)], "doc.pdf", { type: "application/pdf" });

      const result = await reportIncident(makeReportFormData({ photo: pdf }));

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/image/i);
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("should reject a photo larger than 2 MB and not call create", async () => {
      // 2_000_001 bytes exceeds the 2 MB limit.
      const bigPhoto = makeImageFile("image/jpeg", 2_000_001);

      const result = await reportIncident(makeReportFormData({ photo: bigPhoto }));

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/2\s*MB|2MB/i);
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("should proceed without calling put when BLOB_READ_WRITE_TOKEN is absent", async () => {
      delete process.env.BLOB_READ_WRITE_TOKEN;
      const photo = makeImageFile("image/jpeg", 100);

      const result = await reportIncident(makeReportFormData({ photo }));

      expect(result).toEqual({ ok: true, id: "inc_1" });
      expect(mockPut).not.toHaveBeenCalled();
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });
  });

  describe("kitchenId validation", () => {
    it("should reject a kitchenId longer than 64 characters via optionalId guard", async () => {
      const tooLong = "k".repeat(65);

      const result = await reportIncident(makeReportFormData({ kitchenId: tooLong }));

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("Invalid kitchen reference.");
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe("FK violation handling", () => {
    it("should catch a create rejection and return {ok:false} without throwing", async () => {
      mockCreate.mockRejectedValue(new Error("FK constraint violation"));

      const result = await reportIncident(makeReportFormData());

      expect(result.ok).toBe(false);
    });
  });
});

describe("resolveIncident", () => {
  describe("role guard", () => {
    it("should reject FINANCE role and not call updateMany", async () => {
      mockGetCurrentRole.mockResolvedValue("FINANCE");

      const result = await resolveIncident(makeResolveFormData({ incidentId: "inc_1" }));

      expect(result.ok).toBe(false);
      expect(mockUpdateMany).not.toHaveBeenCalled();
    });
  });

  describe("incidentId validation", () => {
    it("should reject a missing incidentId and not call updateMany", async () => {
      // No incidentId set in FormData.
      const fd = new FormData();

      const result = await resolveIncident(fd);

      expect(result.ok).toBe(false);
      expect(mockUpdateMany).not.toHaveBeenCalled();
    });

    it("should reject an empty incidentId and not call updateMany", async () => {
      const result = await resolveIncident(makeResolveFormData({ incidentId: "" }));

      expect(result.ok).toBe(false);
      expect(mockUpdateMany).not.toHaveBeenCalled();
    });
  });

  describe("count:0 → not open", () => {
    it("should return {ok:false} with 'isn't open' message when updateMany matches nothing", async () => {
      mockUpdateMany.mockResolvedValue({ count: 0 });

      const result = await resolveIncident(makeResolveFormData({ incidentId: "inc_999" }));

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/isn't open/i);
    });
  });

  describe("successful resolution", () => {
    it("should return {ok:true, id} and filter by OPEN/ACKNOWLEDGED status when updateMany matches", async () => {
      mockUpdateMany.mockResolvedValue({ count: 1 });

      const result = await resolveIncident(makeResolveFormData({ incidentId: "inc_1" }));

      expect(result).toEqual({ ok: true, id: "inc_1" });

      // Assert the where filter targets open and acknowledged incidents.
      const callArg = mockUpdateMany.mock.calls[0][0] as {
        where: { id: string; status: { in: string[] } };
      };
      expect(callArg.where.status).toEqual({ in: ["OPEN", "ACKNOWLEDGED"] });
    });
  });
});
