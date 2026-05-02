import type { RequirementSemantics } from "./semantics";

/**
 * Intra-doc pairs are only comparable when both statements can be tied to the same actor.
 * - Both actors extracted → must match (case-insensitive).
 * - Neither extracted → allow (many specs omit repeated “The subsystem …”).
 * - Only one extracted → exclude (avoid pairing obligations tied to different actors).
 */
export function sameActorForIntraContradictionPair(a: RequirementSemantics, b: RequirementSemantics): boolean {
  const aa = a.actor?.trim();
  const ab = b.actor?.trim();
  if (!aa && !ab) return true;
  if (!aa || !ab) return false;
  return aa.toLowerCase() === ab.toLowerCase();
}

/**
 * True when each side has at least one parsed threshold with the same non-empty unit and a finite numeric value.
 */
export function hasSharedNumericalThresholdUnit(a: RequirementSemantics, b: RequirementSemantics): boolean {
  for (const ta of a.thresholds) {
    if (!ta.unit || Number.isNaN(ta.numericValue)) continue;
    for (const tb of b.thresholds) {
      if (tb.unit === ta.unit && !Number.isNaN(tb.numericValue)) return true;
    }
  }
  return false;
}
