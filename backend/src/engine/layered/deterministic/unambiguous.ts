import type { CanonicalRequirement, StructuredFinding } from "../types";
import { createFinding } from "./newFinding";
import type { DeterministicContext } from "./ruleContext";

export const BLOCK_ID = "deterministic.unambiguous";

function containsPhrase(haystack: string, needle: string): boolean {
  const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(esc, "i").test(haystack);
}

function containsWholeWord(haystack: string, word: string): boolean {
  const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
  return re.test(haystack);
}

export function runUnambiguous(
  req: CanonicalRequirement,
  ctx: DeterministicContext
): StructuredFinding[] {
  const findings: StructuredFinding[] = [];
  const text = req.normalized_text;
  const lower = text.toLowerCase();

  const vagueHits: string[] = [];
  for (const term of ctx.config.dictionaries.vague_terms) {
    if (term.includes(" ")) {
      if (containsPhrase(text, term)) vagueHits.push(term);
    } else if (containsWholeWord(lower, term)) {
      vagueHits.push(term);
    }
  }

  for (const term of ctx.config.dictionaries.banned_terms) {
    if (term.length > 0 && containsPhrase(text, term)) {
      vagueHits.push(`banned:${term}`);
    }
  }

  if (vagueHits.length > 0) {
    findings.push(
      createFinding({
        requirement_id: req.id,
        block_id: BLOCK_ID,
        attribute: "Unambiguous",
        severity: "high",
        confidence: 0.92,
        issue_type: "vague_or_subjective_language",
        explanation:
          "The requirement uses vague, subjective, or non-measurable wording. Replace with objective, testable criteria.",
        evidence_span: vagueHits.slice(0, 15).join("; "),
        suggested_rewrite: `The system shall [define measurable behavior] for: ${req.normalized_text.slice(0, 120)}…`,
      })
    );
  }

  const weakHits = ctx.config.dictionaries.weak_modals.filter((w) => containsWholeWord(lower, w));
  if (weakHits.length > 0) {
    findings.push(
      createFinding({
        requirement_id: req.id,
        block_id: BLOCK_ID,
        attribute: "Unambiguous",
        severity: "medium",
        confidence: 0.85,
        issue_type: "weak_modal",
        explanation:
          "Weak modals (should/may/could) reduce binding clarity. Use 'shall' or 'must' for mandatory behavior.",
        evidence_span: weakHits.join(", "),
        suggested_rewrite: req.normalized_text.replace(/\b(should|may|could|might)\b/gi, "shall"),
      })
    );
  }

  return findings;
}
