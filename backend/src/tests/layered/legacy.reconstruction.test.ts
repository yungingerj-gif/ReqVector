import { describe, expect, it } from "vitest";
import { reconstructLegacyHeuristic } from "../../engine/layered/legacyReconstruction";
import type { CanonicalRequirement } from "../../engine/layered/types";

describe("legacy reconstruction — no invented thresholds", () => {
  it("does not inject numeric timing when source has no digits", () => {
    const req: CanonicalRequirement = {
      id: "LEG-1",
      source_text: "Respond quickly without any stated deadline.",
      normalized_text: "Respond quickly without any stated deadline.",
      explicit_id: false,
      type: "Performance",
    };
    const leg = reconstructLegacyHeuristic(req, []);
    expect(leg.system_level_rewrite ?? "").not.toMatch(/\d+\s*(ms|s|sec)/i);
    expect(leg.system_level_rewrite ?? "").toMatch(/not specified|placeholder|unresolved/i);
    expect(leg.reconstruction_rationale ?? "").toMatch(/numeric|invented/i);
  });
});
