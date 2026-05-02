import type { EngineConfig, EngineProfile } from "./config";
import { effectiveScoringWeights } from "./config";
import type { CanonicalRequirement, FindingSeverity, RequirementScores, StructuredFinding } from "./types";

const ATTR_KEYS = [
  "unambiguous",
  "complete",
  "verifiable",
  "singular",
  "consistent_correct",
] as const;

type ScoreKey = (typeof ATTR_KEYS)[number];

function findingAttributeToKey(attr: string): ScoreKey | null {
  switch (attr) {
    case "Unambiguous":
      return "unambiguous";
    case "Complete":
      return "complete";
    case "Verifiable":
      return "verifiable";
    case "Singular":
      return "singular";
    case "ConsistentCorrect":
      return "consistent_correct";
    default:
      return null;
  }
}

function penaltyFor(sev: FindingSeverity, config: EngineConfig): number {
  const p = config.scoring_penalties[sev];
  return p ?? 10;
}

function appliesToRequirement(f: StructuredFinding, reqId: string): boolean {
  if (f.requirement_id === reqId) return true;
  return f.related_requirement_ids?.includes(reqId) ?? false;
}

/**
 * L3 — scoring separate from rule execution. Start at 100, subtract configurable penalties.
 */
export function scoreRequirements(
  requirements: CanonicalRequirement[],
  perReqFindings: Map<string, StructuredFinding[]>,
  setLevelFindings: StructuredFinding[],
  config: EngineConfig,
  profile: EngineProfile
): Map<string, RequirementScores> {
  const weights = effectiveScoringWeights(config, profile);
  const out = new Map<string, RequirementScores>();

  for (const req of requirements) {
    const scores: Record<ScoreKey, number> = {
      unambiguous: 100,
      complete: 100,
      verifiable: 100,
      singular: 100,
      consistent_correct: 100,
    };

    const allForReq: StructuredFinding[] = [
      ...(perReqFindings.get(req.id) ?? []),
      ...setLevelFindings.filter((f) => appliesToRequirement(f, req.id)),
    ];

    for (const f of allForReq) {
      const key = findingAttributeToKey(f.attribute);
      if (!key) continue;
      const pen = penaltyFor(f.severity, config);
      scores[key] = Math.max(0, scores[key] - pen);
    }

    let num = 0;
    let den = 0;
    for (const k of ATTR_KEYS) {
      const w = weights[k] ?? 1;
      if (w <= 0) continue;
      num += scores[k] * w;
      den += w;
    }
    const overall = den > 0 ? Math.round(num / den) : 100;

    out.set(req.id, {
      unambiguous: scores.unambiguous,
      complete: scores.complete,
      verifiable: scores.verifiable,
      singular: scores.singular,
      consistent_correct: scores.consistent_correct,
      overall,
    });
  }

  return out;
}
