import type { CanonicalRequirement, StructuredFinding } from "../types";
import { createFinding } from "./newFinding";
import type { DeterministicContext } from "./ruleContext";

export const BLOCK_ID = "deterministic.singular";

/**
 * Count standalone "and" / "or" tokens (whole-word only).
 * Does not match "or" inside "unauthorized" or "information".
 */
export function countStandaloneConjunctions(text: string): number {
  const re = /\b(?:and|or)\b/gi;
  return (text.match(re) ?? []).length;
}

export function runSingular(req: CanonicalRequirement, ctx: DeterministicContext): StructuredFinding[] {
  const findings: StructuredFinding[] = [];
  const text = req.normalized_text;
  const shallCount = (text.match(/\bshall\b/gi) ?? []).length;
  const mustCount = (text.match(/\bmust\b/gi) ?? []).length;
  const obligations = shallCount + mustCount;
  const maxWords = ctx.config.thresholds.max_words_for_singular_warn ?? 60;
  const words = text.split(/\s+/).filter(Boolean).length;

  const conj =
    ctx.config.singular_conjunction_patterns.count_and_or_as_compound !== false
      ? countStandaloneConjunctions(text)
      : 0;

  if (obligations >= 2) {
    findings.push(
      createFinding({
        requirement_id: req.id,
        block_id: BLOCK_ID,
        attribute: "Singular",
        severity: "medium",
        confidence: 0.8,
        issue_type: "multiple_obligations",
        explanation: "Multiple shall/must clauses suggest more than one requirement in a single statement.",
        evidence_span: `shall=${shallCount}, must=${mustCount}`,
        suggested_rewrite: "Split into separate requirements with distinct IDs.",
      })
    );
  }

  if (/\band\/or\b/i.test(text)) {
    findings.push(
      createFinding({
        requirement_id: req.id,
        block_id: BLOCK_ID,
        attribute: "Singular",
        severity: "medium",
        confidence: 0.78,
        issue_type: "combinatorial_phrasing",
        explanation: "‘And/or’ style phrasing often bundles alternatives that should be decomposed.",
      })
    );
  }

  if (conj >= 2 && obligations >= 1) {
    findings.push(
      createFinding({
        requirement_id: req.id,
        block_id: BLOCK_ID,
        attribute: "Singular",
        severity: "low",
        confidence: 0.72,
        issue_type: "conjunction_heavy",
        explanation:
          "Multiple standalone ‘and’/‘or’ conjunctions with obligations may indicate a compound requirement.",
        evidence_span: `conjunction_count=${conj}`,
      })
    );
  }

  if (words > maxWords) {
    findings.push(
      createFinding({
        requirement_id: req.id,
        block_id: BLOCK_ID,
        attribute: "Singular",
        severity: "low",
        confidence: 0.68,
        issue_type: "overlong_clause",
        explanation: "Very long requirements are harder to verify atomically; consider decomposition.",
        evidence_span: `word_count=${words}`,
      })
    );
  }

  return findings;
}
