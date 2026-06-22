import { describe, it, expect } from "vitest";
import { capIntakeInput, MAX_INTAKE_CHARS } from "@/lib/intake";

describe("capIntakeInput", () => {
  it("trims surrounding whitespace", () => {
    expect(capIntakeInput("  hello  ")).toBe("hello");
  });
  it("truncates to the cap", () => {
    const long = "x".repeat(MAX_INTAKE_CHARS + 500);
    expect(capIntakeInput(long).length).toBe(MAX_INTAKE_CHARS);
  });
  it("leaves short input unchanged", () => {
    expect(capIntakeInput("a halal meal request").length).toBeLessThan(MAX_INTAKE_CHARS);
  });
});
