import { describe, expect, it } from "vitest";
import { loadEngineConfig } from "../../engine/layered/config";
import { runComplete } from "../../engine/layered/deterministic/complete";
import { normalizeToCanonicalRequirements } from "../../engine/layered/normalizeCanonical";

describe("deterministic.complete missing_actor heuristics", () => {
  it("flags when vehicle only appears after shall (e.g. reverse vehicle operation)", () => {
    const config = loadEngineConfig();
    const text = "The shall maintain path tracking during reverse vehicle operation.";
    const [req] = normalizeToCanonicalRequirements(text, config, {});
    const findings = runComplete(req, { config, allRequirements: [req] });
    expect(findings.some((f) => f.issue_type === "missing_actor")).toBe(true);
  });

  it("does not flag when vehicle is in the subject span before shall", () => {
    const config = loadEngineConfig();
    const text = "The vehicle shall maintain path tracking during reverse operation.";
    const [req] = normalizeToCanonicalRequirements(text, config, {});
    const findings = runComplete(req, { config, allRequirements: [req] });
    expect(findings.some((f) => f.issue_type === "missing_actor")).toBe(false);
  });
});
