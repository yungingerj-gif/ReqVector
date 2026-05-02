import type {
  RequirementFinding,
  RequirementType,
} from "../models/requirements";

/** Minimal ripple simulation result shape used for typing. */
interface RippleSimulationResult {
  performanceDegradationRipple: number;
  costGrowthRipple: number;
  verificationExpansionRipple: number;
  safetyClassificationEscalationRipple: number;
  rippleImpactScore: number;
}

/** Match requirement-like IDs in text: REQ-001, SR_002, SYS-1, etc. */
const REF_ID_PATTERN =
  /\b(REQ[-_\s]?\d{1,6}|SR[-_\s]?\d{1,6}|[A-Z]{2,6}[-_\s]?\d{1,6})\b/gi;

/** Normalize to canonical form for matching (uppercase, spaces → dash). */
function normalizeId(raw: string): string {
  return raw.replace(/\s+/g, "-").replace(/_/g, "-").toUpperCase().trim();
}

/**
 * Extract requirement IDs referenced in text (e.g. "derived from REQ-001", "verifies REQ-002").
 * Returns unique normalized IDs that appear in the text (excluding selfId).
 */
export function extractReferencedIds(text: string, selfId: string): string[] {
  const seen = new Set<string>();
  const selfNorm = normalizeId(selfId);
  for (const m of text.matchAll(REF_ID_PATTERN)) {
    const id = normalizeId(m[1]!);
    if (id !== selfNorm) seen.add(id);
  }
  return [...seen];
}

/**
 * Build map: for each requirement id R, list of requirement ids D such that D references R (i.e. R is upstream of D).
 * So downstream(R) = dependents that reference R.
 */
export function buildDownstreamMap(
  findings: RequirementFinding[]
): Map<string, RequirementFinding[]> {
  const idToFinding = new Map<string, RequirementFinding>();
  for (const f of findings) idToFinding.set(normalizeId(f.id), f);

  const downstreamOf = new Map<string, RequirementFinding[]>();
  for (const d of findings) {
    const refs = extractReferencedIds(d.text, d.id);
    for (const refId of refs) {
      const upstreamNorm = refId;
      if (!idToFinding.has(upstreamNorm)) continue;
      const list = downstreamOf.get(upstreamNorm) ?? [];
      if (!list.some((x) => normalizeId(x.id) === normalizeId(d.id)))
        list.push(d);
      downstreamOf.set(upstreamNorm, list);
    }
  }
  return downstreamOf;
}

/** Scale 0–2 per ripple dimension; combined delta magnitude for one downstream node (0–10). */
const RIPPLE_SCALE = 2.5;

type RippleType = keyof Pick<
  RippleSimulationResult,
  | "performanceDegradationRipple"
  | "costGrowthRipple"
  | "verificationExpansionRipple"
  | "safetyClassificationEscalationRipple"
>;

/**
 * Heuristic: when source (the requirement being added/modified) has type S and downstream node D has type T,
 * how much does each ripple dimension increase? Returns 0–2 per dimension; we sum and cap for delta magnitude.
 */
function getRippleWeights(
  sourceType: RequirementType | undefined,
  downstreamType: RequirementType | undefined
): Record<RippleType, number> {
  const p =
    sourceType === "performance" || downstreamType === "performance" ? 1.2 : 0.3;
  const c = 0.8; // cost grows with any new/changed requirement (verification, design)
  const v =
    sourceType === "verification" ||
    downstreamType === "verification" ||
    sourceType === "performance" ||
    sourceType === "safety"
      ? 1.2
      : 0.4;
  const s =
    sourceType === "safety" || downstreamType === "safety" ? 1.5 : 0.2;
  return {
    performanceDegradationRipple: p,
    costGrowthRipple: c,
    verificationExpansionRipple: v,
    safetyClassificationEscalationRipple: s,
  };
}

/**
 * Compute delta magnitude for one downstream node (0–10) from source and downstream findings.
 */
function computeDeltaMagnitude(
  source: RequirementFinding,
  downstream: RequirementFinding
): number {
  const w = getRippleWeights(source.requirementType, downstream.requirementType);
  const sum =
    w.performanceDegradationRipple +
    w.costGrowthRipple +
    w.verificationExpansionRipple +
    w.safetyClassificationEscalationRipple;
  return Math.min(10, Math.round(sum * RIPPLE_SCALE * 10) / 10);
}

/**
 * Run Ripple Risk Simulation for one requirement: simulate performance, cost, verification, safety ripples
 * and compute RippleImpactScore = Σ downstream node delta magnitudes.
 */
export function runRippleSimulationForRequirement(
  source: RequirementFinding,
  allFindings: RequirementFinding[],
  downstreamMap: Map<string, RequirementFinding[]>
): never {
  const sourceIdNorm = normalizeId(source.id);
  const downstreamNodes = downstreamMap.get(sourceIdNorm) ?? [];

  // Ripple simulation is disabled; this function should not be called.
  throw new Error("runRippleSimulationForRequirement is deprecated and should not be used.");
}

/**
 * Run ripple simulation for all requirements and attach results to each finding.
 * Mutates each finding by setting rippleSimulation.
 */
export function runRippleSimulationForAll(
  findings: RequirementFinding[]
): never {
  // Ripple simulation is disabled; this function should not be called.
  throw new Error("runRippleSimulationForAll is deprecated and should not be used.");
}
