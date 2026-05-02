import type { RequirementType } from "../../models/requirements";
import { parseRequirements } from "../../services/requirementsAnalyzeService";
import { classifyRequirementType } from "../../services/requirementTypeDesignator";
import type { RequirementsAnalyzeOptions } from "../../models/requirements";
import type {
  CanonicalRequirement,
  CanonicalRequirementType,
  ThresholdSpec,
} from "./types";
import type { EngineConfig } from "./config";

const UNIT_REGEX =
  /\b(\d+(?:\.\d+)?)\s*(ms|s|sec|secs|seconds|min|mins|h|hz|khz|mhz|%|percent|v|a|ma|w|kw|mw|n|kn|lbf|pa|kpa|mpa|bar|psi|c|°c|mm|cm|m|in|ft|kg|g|lb|nm|rpm)\b/gi;

const THRESHOLD_PATTERN =
  /\b(at\s+least|at\s+most|no\s+more\s+than|no\s+less\s+than|less\s+than|greater\s+than|<=|>=|<|>|within|between|±|max|min|maximum|minimum)\s*(\d+(?:\.\d+)?)\s*(ms|s|sec|seconds|min|%|mm|cm|m|bar|psi|hz)?/gi;

function mapToCanonicalType(rt: RequirementType): CanonicalRequirementType {
  switch (rt) {
    case "functional":
      return "Functional";
    case "performance":
      return "Performance";
    case "interface":
      return "Interface";
    case "constraint":
    case "safety":
    case "regulatory":
      return "Constraint";
    case "derived":
    case "cybersecurity":
    case "verification":
    case "environmental":
      return "General";
    default:
      return "Unknown";
  }
}

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function guessActor(text: string): string | undefined {
  // Longer tokens first; require word boundary before obligation — not "The system-level shall" → system.
  const m = text.match(
    /^(?:the\s+)?(subsystem|system|software|hardware|controller|operator|user|vehicle|ecu|module)(?=\s|[.,;:!?]|$)/i
  );
  return m?.[1] ? m[1] : undefined;
}

function guessAction(text: string): string | undefined {
  const shall = text.match(/\b(?:shall|must)\b\s+(.+?)(?:\.|$)/i);
  if (shall?.[1]) return shall[1].trim().slice(0, 300);
  const weak = text.match(/\b(?:should|may)\b\s+(.+?)(?:\.|$)/i);
  if (weak?.[1]) return weak[1].trim().slice(0, 300);
  return undefined;
}

function extractThresholds(text: string): ThresholdSpec[] {
  const out: ThresholdSpec[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(UNIT_REGEX)) {
    const key = `${m[1]}-${m[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const spec: ThresholdSpec = { value: String(m[1]) };
    if (m[2]) spec.unit = String(m[2]).toLowerCase();
    out.push(spec);
  }
  THRESHOLD_PATTERN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = THRESHOLD_PATTERN.exec(text)) !== null) {
    const comp = m[1] ? String(m[1]).toLowerCase() : undefined;
    const val = m[2];
    const unit = m[3] ? String(m[3]).toLowerCase() : undefined;
    const key = `${comp}-${val}-${unit ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const spec2: ThresholdSpec = { value: String(val) };
    if (unit) spec2.unit = unit;
    if (comp) spec2.comparator = comp;
    out.push(spec2);
  }
  return out;
}

function extractConditions(text: string): string[] {
  const out: string[] = [];
  const when = text.match(/\bwhen\b[^.]+/gi);
  const ifClause = text.match(/\bif\b[^.]+/gi);
  const unless = text.match(/\bunless\b[^.]+/gi);
  for (const x of [...(when ?? []), ...(ifClause ?? []), ...(unless ?? [])]) {
    const t = normalizeWhitespace(x);
    if (t.length > 3) out.push(t);
  }
  return out.length > 0 ? out : [];
}

/**
 * L0 — segmentation + canonical requirement objects. Downstream code must not use raw text.
 */
export function normalizeToCanonicalRequirements(
  rawText: string,
  _config: EngineConfig,
  parseOptions?: RequirementsAnalyzeOptions
): CanonicalRequirement[] {
  const lines = parseRequirements(rawText, parseOptions ?? {});
  return lines.map((p) => {
    const source_text = p.text;
    const normalized_text = normalizeWhitespace(source_text);
    const { type: rt } = classifyRequirementType(source_text);
    const type = mapToCanonicalType(rt);
    const actor = guessActor(normalized_text);
    const action = guessAction(normalized_text);
    const thresholds = extractThresholds(normalized_text);
    const conditions = extractConditions(normalized_text);
    const tags: string[] = [];
    if (!p.hasExplicitId) tags.push("generated_id");
    tags.push(`heuristic_type:${rt}`);

    const req: CanonicalRequirement = {
      id: p.id,
      source_text,
      normalized_text,
      explicit_id: p.hasExplicitId,
      type,
    };
    if (actor !== undefined) req.actor = actor;
    if (action !== undefined) req.action = action;
    if (conditions.length > 0) req.conditions = conditions;
    if (thresholds.length > 0) req.thresholds = thresholds;
    if (tags.length > 0) req.tags = tags;
    return req;
  });
}

/**
 * Normalizes parent specification text for hierarchy analysis. If the generic parser finds no
 * requirement-shaped blocks (e.g. parent doc uses only weak modals), returns one synthetic
 * requirement wrapping the full text so parent–child checks still run.
 */
export function normalizeParentRequirementsForHierarchy(
  rawText: string,
  config: EngineConfig,
  parseOptions?: RequirementsAnalyzeOptions
): CanonicalRequirement[] {
  const reqs = normalizeToCanonicalRequirements(rawText, config, parseOptions);
  if (reqs.length > 0) return reqs;
  const t = normalizeWhitespace(rawText);
  if (!t) return [];
  const syn: CanonicalRequirement = {
    id: "PARENT-DOCUMENT-1",
    source_text: t,
    normalized_text: t,
    explicit_id: false,
    type: "General",
    tags: ["synthetic_parent_document_fallback"],
  };
  return [syn];
}
