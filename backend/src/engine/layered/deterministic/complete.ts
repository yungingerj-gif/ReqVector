import type { CanonicalRequirement, StructuredFinding } from "../types";
import { createFinding } from "./newFinding";
import type { DeterministicContext } from "./ruleContext";

export const BLOCK_ID = "deterministic.complete";

function hasObligation(text: string): boolean {
  return /\b(shall|must)\b/i.test(text);
}

/** Actor cue words; (?!-) avoids counting hyphenated adjectives (e.g. system-level, user-defined) as the responsible entity. */
const ACTOR_CUE_RE =
  /\b(system|software|hardware|controller|operator|user|vehicle|module|subsystem|interface|component)\b(?!-)/i;

/** Text before the first normative verb — avoids treating words in trailing phrases (e.g. "reverse vehicle operation") as the obligation subject. */
function subjectSpanBeforeFirstObligation(text: string): string {
  const m = text.match(/^([\s\S]*?)\b(shall|must)\b/i);
  const prefix = m?.[1] ?? text;
  return prefix.trim();
}

function hasActorish(text: string, actor?: string): boolean {
  if (actor && actor.length > 0) return true;
  const subjectSpan = subjectSpanBeforeFirstObligation(text);
  return ACTOR_CUE_RE.test(subjectSpan);
}

export function runComplete(req: CanonicalRequirement, ctx: DeterministicContext): StructuredFinding[] {
  const findings: StructuredFinding[] = [];
  const text = req.normalized_text;
  const minLen = ctx.config.thresholds.min_text_length_for_complete ?? 8;

  if (text.length < minLen) {
    findings.push(
      createFinding({
        requirement_id: req.id,
        block_id: BLOCK_ID,
        attribute: "Complete",
        severity: "medium",
        confidence: 0.88,
        issue_type: "insufficient_detail",
        explanation: "Requirement text is too short to contain a complete obligation and context.",
        evidence_span: text,
        missing_fields: ["detail", "context"],
      })
    );
  }

  if (!hasObligation(text)) {
    findings.push(
      createFinding({
        requirement_id: req.id,
        block_id: BLOCK_ID,
        attribute: "Complete",
        severity: "high",
        confidence: 0.9,
        issue_type: "missing_obligation_verb",
        explanation: "No explicit normative obligation (shall/must) was detected.",
        evidence_span: text.slice(0, 200),
        missing_fields: ["obligation"],
        suggested_rewrite: `The system shall ${text.charAt(0).toLowerCase()}${text.slice(1)}`,
      })
    );
  }

  if (!hasActorish(text, req.actor)) {
    findings.push(
      createFinding({
        requirement_id: req.id,
        block_id: BLOCK_ID,
        attribute: "Complete",
        severity: "medium",
        confidence: 0.4,
        issue_type: "missing_actor",
        explanation: "Responsible entity (actor) is not clearly stated.",
        missing_fields: ["actor"],
        suggested_rewrite: `The system shall ${text.replace(/^(?:the\s+)?/i, "")}`,
      })
    );
  }

  if (
    req.type === "Performance" &&
    (!req.thresholds || req.thresholds.length === 0) &&
    !/\d/.test(text)
  ) {
    findings.push(
      createFinding({
        requirement_id: req.id,
        block_id: BLOCK_ID,
        attribute: "Complete",
        severity: "high",
        confidence: 0.86,
        issue_type: "performance_without_metric",
        explanation:
          "Performance-type requirement has no measurable value or extracted threshold in the text.",
        missing_fields: ["measurable_threshold", "unit"],
      })
    );
  }

  if (
    req.type === "Interface" &&
    !/\b(interface|bus|protocol|api|signal|connector|port|message|packet|can|ethernet|uart)\b/i.test(
      text
    )
  ) {
    findings.push(
      createFinding({
        requirement_id: req.id,
        block_id: BLOCK_ID,
        attribute: "Complete",
        severity: "medium",
        confidence: 0.75,
        issue_type: "interface_missing_context",
        explanation:
          "Interface-type requirement should name interfacing entities and the logical/physical medium.",
        missing_fields: ["interface_entity", "medium_or_protocol"],
      })
    );
  }

  if (hasObligation(text) && (!req.action || req.action.length < 3)) {
    findings.push(
      createFinding({
        requirement_id: req.id,
        block_id: BLOCK_ID,
        attribute: "Complete",
        severity: "low",
        confidence: 0.7,
        issue_type: "incomplete_action_structure",
        explanation: "The action following the obligation verb is unclear or too generic.",
        missing_fields: ["action"],
      })
    );
  }

  return findings;
}
