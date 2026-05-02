import { describe, expect, it } from "vitest";
import { loadEngineConfig } from "../../engine/layered/config";
import { runSetLevelCrossRequirement } from "../../engine/layered/setLevel/crossConsistency";
import type { CanonicalRequirement } from "../../engine/layered/types";

function req(id: string, text: string): CanonicalRequirement {
  return {
    id,
    source_text: text,
    normalized_text: text.toLowerCase(),
    explicit_id: true,
    type: "Functional",
  };
}

describe("set-level cross requirement overlap (anti–false-positive)", () => {
  it("does not flag possible_overlap when only normative boilerplate overlaps", () => {
    const config = loadEngineConfig();
    const reqs: CanonicalRequirement[] = [
      req(
        "REQ-001",
        "The system shall provide login authentication for end users in the web portal."
      ),
      req(
        "REQ-002",
        "The system shall export telemetry events for monitoring and diagnostics purposes."
      ),
    ];
    const findings = runSetLevelCrossRequirement(reqs, config);
    const overlaps = findings.filter((f) => f.issue_type === "possible_overlap");
    expect(overlaps).toHaveLength(0);
  });

  it("still flags possible_overlap when substantive terms overlap strongly", () => {
    const config = loadEngineConfig();
    const reqs: CanonicalRequirement[] = [
      req(
        "REQ-A",
        "The system shall authenticate users validate sessions using oauth tokens and enforce security policies."
      ),
      req(
        "REQ-B",
        "The system shall authenticate users validate sessions using ldap tokens and enforce security policies."
      ),
    ];
    const findings = runSetLevelCrossRequirement(reqs, config);
    const overlaps = findings.filter((f) => f.issue_type === "possible_overlap");
    expect(overlaps.length).toBeGreaterThanOrEqual(1);
    expect(overlaps.some((f) => f.related_requirement_ids?.includes("REQ-B"))).toBe(true);
  });

  it("keeps at most one soft cross-issue per requirement pair (no overlap + drift double-hit)", () => {
    const config = loadEngineConfig();
    const reqs: CanonicalRequirement[] = [
      req(
        "R1",
        "The system shall let the client upload audit logs to the central repository for retention."
      ),
      req(
        "R2",
        "The system shall let the user upload audit logs to the central repository for retention."
      ),
    ];
    const findings = runSetLevelCrossRequirement(reqs, config);
    const pairSoft = findings.filter(
      (f) =>
        f.attribute === "CrossRequirement" &&
        f.related_requirement_ids?.length === 1 &&
        ["possible_overlap", "terminology_drift", "near_duplicate"].includes(f.issue_type)
    );
    const keys = pairSoft.map((f) =>
      [f.requirement_id, f.related_requirement_ids![0]!].sort().join("|")
    );
    expect(new Set(keys).size).toBe(keys.length);
    expect(pairSoft.some((f) => f.issue_type === "terminology_drift")).toBe(true);
  });
});
