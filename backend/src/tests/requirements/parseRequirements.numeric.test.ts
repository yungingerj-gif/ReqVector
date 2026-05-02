import { describe, expect, it } from "vitest";
import { parseRequirements } from "../../services/requirementsAnalyzeService";

describe("parseRequirements — numeric text preserved", () => {
  it("keeps bare integers inside shall text (no inline split on 50)", () => {
    const raw = "FR-1: The system shall respond within 50 ms under load.";
    const p = parseRequirements(raw, {});
    expect(p.length).toBe(1);
    expect(p[0]!.text).toContain("50");
    expect(p[0]!.text).toContain("ms");
  });

  it("still splits on a second explicit FR id mid paragraph", () => {
    const raw = "FR-1: First shall apply. FR-2: Second shall apply.";
    const p = parseRequirements(raw, {});
    expect(p.length).toBeGreaterThanOrEqual(2);
    expect(p.some((x) => x.id.toUpperCase().includes("FR-1"))).toBe(true);
    expect(p.some((x) => x.id.toUpperCase().includes("FR-2"))).toBe(true);
    expect(p.map((x) => x.text).join(" ")).toMatch(/Second shall apply/i);
  });
});
