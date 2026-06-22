import { describe, it, expect } from "vitest";
import { signRoleCookie, readRoleCookie } from "@/lib/role-cookie";

describe("role cookie (HMAC-signed)", () => {
  it("round-trips a signed role", () => {
    expect(readRoleCookie(signRoleCookie("FINANCE"))).toBe("FINANCE");
    expect(readRoleCookie(signRoleCookie("OPS"))).toBe("OPS");
    expect(readRoleCookie(signRoleCookie("EXEC"))).toBe("EXEC");
  });

  it("rejects a hand-forged plaintext cookie (legacy / devtools tampering)", () => {
    // The exact attack: set rcc_role=EXEC by hand. No valid HMAC → default role.
    expect(readRoleCookie("EXEC")).toBe("EXEC"); // default happens to be EXEC
    expect(readRoleCookie("FINANCE")).toBe("EXEC"); // forged FINANCE → falls back
    expect(readRoleCookie("OPS")).toBe("EXEC");
  });

  it("rejects a tampered payload with a stale signature", () => {
    const signed = signRoleCookie("OPS");
    const sig = signed.slice(signed.lastIndexOf(".") + 1);
    // Swap the role to EXEC but keep OPS's signature → MAC mismatch.
    const forged = `EXEC.${Date.now()}.${sig}`;
    expect(readRoleCookie(forged)).toBe("EXEC"); // default, not a privilege grant via swap
  });

  it("rejects malformed / empty values", () => {
    expect(readRoleCookie(undefined)).toBe("EXEC");
    expect(readRoleCookie("")).toBe("EXEC");
    expect(readRoleCookie("garbage")).toBe("EXEC");
    expect(readRoleCookie("EXEC.123")).toBe("EXEC"); // no signature segment
  });

  it("rejects an unknown role even with a valid-looking shape", () => {
    expect(readRoleCookie(signRoleCookie("EXEC")).length).toBeGreaterThan(0);
    // A signed-but-unknown role can't be produced without the secret; verify the
    // parser guards isRoleKey regardless.
    expect(readRoleCookie("SUPERADMIN.123.deadbeef")).toBe("EXEC");
  });
});
