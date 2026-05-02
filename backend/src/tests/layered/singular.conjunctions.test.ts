import { describe, expect, it } from "vitest";
import { countStandaloneConjunctions, runSingular } from "../../engine/layered/deterministic/singular";
import { loadEngineConfig } from "../../engine/layered/config";
import type { CanonicalRequirement } from "../../engine/layered/types";

describe("singular — whole-word conjunctions", () => {
  it("does not count 'or' inside unauthorized", () => {
    expect(countStandaloneConjunctions("Unauthorized access shall be denied.")).toBe(0);
  });

  it("does not count 'or' inside information", () => {
    expect(countStandaloneConjunctions("The information shall be encrypted at rest.")).toBe(0);
  });

  it("counts standalone and/or", () => {
    expect(countStandaloneConjunctions("The system shall log errors and shall notify the operator.")).toBe(1);
    expect(countStandaloneConjunctions("Use TLS or IPsec for transport security.")).toBe(1);
  });

  it("runSingular does not emit conjunction_heavy for information-only text", () => {
    const config = loadEngineConfig();
    const req: CanonicalRequirement = {
      id: "R1",
      source_text: "The information shall be available.",
      normalized_text: "The information shall be available.",
      explicit_id: true,
      type: "General",
    };
    const findings = runSingular(req, { config, allRequirements: [req] });
    const conjHeavy = findings.filter((f) => f.issue_type === "conjunction_heavy");
    expect(conjHeavy.length).toBe(0);
  });
});
