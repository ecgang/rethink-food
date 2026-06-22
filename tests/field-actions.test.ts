import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock is hoisted above all imports, so factory bodies must not reference
// outer `const` variables. Use inline vi.fn() and retrieve refs via imports.

// Stub server-only boundary so the import doesn't throw in Node.
vi.mock("server-only", () => ({}));
// Stub Next.js cache invalidation — no filesystem side-effects in tests.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// Stub Vercel Blob — tests must never make real network calls.
vi.mock("@vercel/blob", () => ({ put: vi.fn() }));
// Prisma mock: only `meal.updateMany` is called by the field actions.
vi.mock("@/lib/db", () => ({ prisma: { meal: { updateMany: vi.fn() } } }));

// `@/lib/current-role` is also mocked. The role value is mutated per-test via
// the `role` box, which the factory closure captures at call time (async fn).
import * as currentRole from "@/lib/current-role";
vi.mock("@/lib/current-role", () => ({
  getCurrentRole: vi.fn(),
  getOperatorIdentity: vi.fn(),
}));

import { markVerified, markDelivered } from "@/app/actions/field";
import { prisma } from "@/lib/db";
import * as blob from "@vercel/blob";

// Typed references to the mocked fns.
const updateMany = prisma.meal.updateMany as ReturnType<typeof vi.fn>;
const mockPut = blob.put as ReturnType<typeof vi.fn>;
const mockGetCurrentRole = currentRole.getCurrentRole as ReturnType<typeof vi.fn>;
const mockGetOperatorIdentity = currentRole.getOperatorIdentity as ReturnType<typeof vi.fn>;

beforeEach(() => {
  updateMany.mockReset();
  mockPut.mockReset();
  mockGetCurrentRole.mockResolvedValue("OPS");
  mockGetOperatorIdentity.mockResolvedValue("Dana Ortiz · Operations");
});

// ---------------------------------------------------------------------------
// markVerified guards
// ---------------------------------------------------------------------------

describe("markVerified", () => {
  describe("role guard", () => {
    it("rejects FINANCE role (no operate:field permission)", async () => {
      mockGetCurrentRole.mockResolvedValue("FINANCE");
      const res = await markVerified("meal_1");
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toMatch(/role/i);
      expect(updateMany).not.toHaveBeenCalled();
    });

    it("permits OPS role to proceed to DB check", async () => {
      mockGetCurrentRole.mockResolvedValue("OPS");
      updateMany.mockResolvedValue({ count: 1 });
      const res = await markVerified("meal_1");
      expect(updateMany).toHaveBeenCalled();
      expect(res.ok).toBe(true);
    });

    it("permits EXEC role to proceed to DB check", async () => {
      mockGetCurrentRole.mockResolvedValue("EXEC");
      updateMany.mockResolvedValue({ count: 1 });
      const res = await markVerified("meal_1");
      expect(updateMany).toHaveBeenCalled();
      expect(res.ok).toBe(true);
    });
  });

  describe("transition guard", () => {
    it("returns ok:false when no DELIVERED meal matches (count 0)", async () => {
      updateMany.mockResolvedValue({ count: 0 });
      const res = await markVerified("meal_1");
      expect(res.ok).toBe(false);
    });

    it("returns ok:true when a DELIVERED meal is successfully verified", async () => {
      updateMany.mockResolvedValue({ count: 1 });
      const res = await markVerified("meal_1");
      expect(res.ok).toBe(true);
    });

    it("passes the mealId and DELIVERED status filter to updateMany", async () => {
      updateMany.mockResolvedValue({ count: 1 });
      await markVerified("meal_abc");
      expect(updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: "meal_abc", status: "DELIVERED" }),
        }),
      );
    });
  });

  describe("input validation", () => {
    it("returns ok:false for an empty mealId without touching the DB", async () => {
      const res = await markVerified("");
      expect(res.ok).toBe(false);
      expect(updateMany).not.toHaveBeenCalled();
    });
  });

  describe("blob guard", () => {
    it("never calls put() — markVerified has no photo upload", async () => {
      updateMany.mockResolvedValue({ count: 1 });
      await markVerified("meal_1");
      expect(mockPut).not.toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// markDelivered guards (FormData-based)
// ---------------------------------------------------------------------------

describe("markDelivered", () => {
  function makeFormData(mealId: string, photo?: File): FormData {
    const fd = new FormData();
    fd.set("mealId", mealId);
    if (photo) fd.set("photo", photo);
    return fd;
  }

  describe("role guard", () => {
    it("rejects FINANCE role without touching the DB", async () => {
      mockGetCurrentRole.mockResolvedValue("FINANCE");
      const fd = makeFormData("meal_1");
      const res = await markDelivered(fd);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toMatch(/role/i);
      expect(updateMany).not.toHaveBeenCalled();
    });
  });

  describe("photo validation", () => {
    it("rejects a non-image file with an informative error", async () => {
      updateMany.mockResolvedValue({ count: 1 });
      // A tiny text file masquerading as a photo upload.
      const pdf = new File(["fake pdf content"], "doc.pdf", { type: "application/pdf" });
      const fd = makeFormData("meal_1", pdf);
      const res = await markDelivered(fd);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toMatch(/image/i);
      expect(mockPut).not.toHaveBeenCalled();
      expect(updateMany).not.toHaveBeenCalled();
    });

    it("rejects a file exceeding 2 MB", async () => {
      updateMany.mockResolvedValue({ count: 1 });
      // 2 MB + 1 byte — over the limit.
      const bigData = new Uint8Array(2_000_001).fill(0xff);
      const bigFile = new File([bigData], "photo.jpg", { type: "image/jpeg" });
      const fd = makeFormData("meal_1", bigFile);
      const res = await markDelivered(fd);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toMatch(/2 MB|2MB/i);
      expect(mockPut).not.toHaveBeenCalled();
      expect(updateMany).not.toHaveBeenCalled();
    });

    it("proceeds without upload when no BLOB_READ_WRITE_TOKEN is set", async () => {
      delete process.env.BLOB_READ_WRITE_TOKEN;
      updateMany.mockResolvedValue({ count: 1 });
      const smallPhoto = new File([new Uint8Array(1000)], "photo.jpg", {
        type: "image/jpeg",
      });
      const fd = makeFormData("meal_1", smallPhoto);
      const res = await markDelivered(fd);
      expect(mockPut).not.toHaveBeenCalled();
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.photoUrl).toBeNull();
    });

    it("uploads via put() and returns the blob URL when token is present", async () => {
      process.env.BLOB_READ_WRITE_TOKEN = "test-token";
      const blobUrl = "https://cdn.example.com/deliveries/meal_1.jpg";
      mockPut.mockResolvedValue({ url: blobUrl });
      updateMany.mockResolvedValue({ count: 1 });
      const smallPhoto = new File([new Uint8Array(1000)], "photo.jpg", {
        type: "image/jpeg",
      });
      const fd = makeFormData("meal_1", smallPhoto);
      const res = await markDelivered(fd);
      expect(mockPut).toHaveBeenCalled();
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.photoUrl).toBe(blobUrl);
      delete process.env.BLOB_READ_WRITE_TOKEN;
    });
  });

  describe("transition guard", () => {
    it("returns ok:false when no PRODUCED meal matches (count 0)", async () => {
      updateMany.mockResolvedValue({ count: 0 });
      const fd = makeFormData("meal_1");
      const res = await markDelivered(fd);
      expect(res.ok).toBe(false);
    });

    it("returns ok:true when a PRODUCED meal is successfully delivered", async () => {
      updateMany.mockResolvedValue({ count: 1 });
      const fd = makeFormData("meal_1");
      const res = await markDelivered(fd);
      expect(res.ok).toBe(true);
    });

    it("passes the mealId and PRODUCED status filter to updateMany", async () => {
      updateMany.mockResolvedValue({ count: 1 });
      const fd = makeFormData("meal_xyz");
      await markDelivered(fd);
      expect(updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: "meal_xyz", status: "PRODUCED" }),
        }),
      );
    });
  });

  describe("input validation", () => {
    it("returns ok:false for a missing mealId without touching the DB", async () => {
      const fd = new FormData(); // no mealId
      const res = await markDelivered(fd);
      expect(res.ok).toBe(false);
      expect(updateMany).not.toHaveBeenCalled();
    });
  });
});
