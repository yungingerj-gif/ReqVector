import type { CanonicalRequirement, ThresholdSpec } from "../types";

/** Polarity / modality cues for cross-requirement comparison. */
export type PolarityModality =
  | "required"
  | "allowed"
  | "prohibited"
  | "absolute"
  | "negative"
  | "weak_obligation"
  | "unknown";

export interface ParsedThreshold {
  numericValue: number;
  unit?: string;
  comparator?: string;
  raw: string;
}

/**
 * Reusable semantic representation for pairwise comparison (intra-doc and hierarchy).
 */
export interface RequirementSemantics {
  requirement_id: string;
  actor?: string;
  action?: string;
  object?: string;
  conditions: string[];
  thresholds: ParsedThreshold[];
  polarities: PolarityModality[];
  /** Short free-text cue for matching (action + object heuristics). */
  function_signature: string;
}

function parseThresholdSpec(t: ThresholdSpec, fallbackText: string): ParsedThreshold | null {
  const n = Number.parseFloat(String(t.value).replace(/,/g, ""));
  if (Number.isNaN(n)) return null;
  const pt: ParsedThreshold = {
    numericValue: n,
    raw: `${t.comparator ?? ""} ${t.value} ${t.unit ?? ""}`.trim() || fallbackText.slice(0, 80),
  };
  if (t.unit) pt.unit = t.unit.toLowerCase();
  if (t.comparator) pt.comparator = t.comparator.toLowerCase();
  return pt;
}

function inferPolarities(text: string): PolarityModality[] {
  const t = text.toLowerCase();
  const out: PolarityModality[] = [];
  const negObl = /\bshall\s+not\b|\bmust\s+not\b|\bprohibited\b|\bnever\s+shall\b|\bno\s+longer\b/.test(t);
  if (negObl) {
    out.push("prohibited", "negative");
  }
  if (!negObl && /\bshall\b|\bmust\b/.test(t)) {
    out.push("required");
  }
  if (/\bshould\b|\bmay\b|\bmight\b|\bcould\b/.test(t)) {
    out.push("weak_obligation", "allowed");
  }
  if (/\bonly\b|\bexclusively\b|\balways\b|\bnever\b/.test(t)) {
    out.push("absolute");
  }
  if (out.length === 0) out.push("unknown");
  return [...new Set(out)];
}

function guessObject(text: string, action?: string): string | undefined {
  const afterShall = text.match(/\b(?:shall|must|should|may)\s+(.{3,120}?)(?:\.|;|$)/i);
  const chunk = afterShall?.[1]?.trim() ?? text.slice(0, 120);
  if (action && chunk.toLowerCase().startsWith(action.toLowerCase().slice(0, 8))) {
    return chunk.slice(action.length).trim().slice(0, 200) || undefined;
  }
  return chunk.slice(0, 200) || undefined;
}

function functionSignature(
  req: CanonicalRequirement,
  partial: { actor?: string; action?: string; object?: string; conditions: string[] }
): string {
  const parts = [
    req.type,
    partial.actor ?? "",
    (partial.action ?? "").slice(0, 80),
    (partial.object ?? "").slice(0, 80),
    ...partial.conditions.map((c) => c.slice(0, 40)),
  ];
  return parts.join("|").toLowerCase().replace(/\s+/g, " ");
}

export function extractRequirementSemantics(req: CanonicalRequirement): RequirementSemantics {
  const text = req.normalized_text;
  const thresholds: ParsedThreshold[] = [];
  if (req.thresholds) {
    for (const th of req.thresholds) {
      const p = parseThresholdSpec(th, text);
      if (p) thresholds.push(p);
    }
  }
  const polarities = inferPolarities(text);
  const object = guessObject(text, req.action);
  const sem: RequirementSemantics = {
    requirement_id: req.id,
    conditions: req.conditions ?? [],
    thresholds,
    polarities,
    function_signature: "",
  };
  if (req.actor !== undefined) sem.actor = req.actor;
  if (req.action !== undefined) sem.action = req.action;
  if (object !== undefined) sem.object = object;
  const sigPartial: { actor?: string; action?: string; object?: string; conditions: string[] } = {
    conditions: sem.conditions,
  };
  if (sem.actor !== undefined) sigPartial.actor = sem.actor;
  if (sem.action !== undefined) sigPartial.action = sem.action;
  if (sem.object !== undefined) sigPartial.object = sem.object;
  sem.function_signature = functionSignature(req, sigPartial);
  return sem;
}
