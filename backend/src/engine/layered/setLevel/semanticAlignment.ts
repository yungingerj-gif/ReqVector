import { jaccard, tokenSet } from "../contradiction/textUtils";
import { extractRequirementSemantics, type RequirementSemantics } from "../contradiction/semantics";
import type { CanonicalRequirement } from "../types";

/**
 * Obligation-centric similarity beyond raw word overlap: compares extracted
 * function signatures (type, actor, action, object, conditions) and object phrases.
 */
export function buildSemanticsMap(reqs: CanonicalRequirement[]): Map<string, RequirementSemantics> {
  const m = new Map<string, RequirementSemantics>();
  for (const r of reqs) {
    m.set(r.id, extractRequirementSemantics(r));
  }
  return m;
}

/** True when both sides have enough structured signature tokens to apply a semantic floor. */
export function semanticsStrongEnoughToGate(sa: RequirementSemantics, sb: RequirementSemantics): boolean {
  const na = tokenSet(sa.function_signature).size;
  const nb = tokenSet(sb.function_signature).size;
  return na >= 2 && nb >= 2;
}

/**
 * 0–1 score: higher means the two requirements likely describe the same obligation family
 * (not merely shared generic vocabulary).
 */
export function obligationSemanticAlignment(sa: RequirementSemantics, sb: RequirementSemantics): number {
  const sigA = tokenSet(sa.function_signature);
  const sigB = tokenSet(sb.function_signature);
  let sigJ = 0;
  if (sigA.size === 0 && sigB.size === 0) {
    sigJ = 0;
  } else {
    sigJ = jaccard(sigA, sigB);
  }

  let objJ = 0;
  if (sa.object && sb.object) {
    objJ = jaccard(tokenSet(sa.object), tokenSet(sb.object));
  }

  if (objJ > 0) {
    return Math.max(sigJ, objJ);
  }
  return sigJ;
}
