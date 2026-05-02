import { createFinding } from "../deterministic/newFinding";
import type { AiClient } from "../ai/aiClient";
import type { EngineConfig } from "../config";
import type { CanonicalRequirement, StructuredFinding } from "../types";
import { BLOCK_ID, collectSameIntentAiCandidatePairs, pairKey } from "./crossConsistency";

const L5 = "L5_SetLevel";

type IntentVerdict = {
  id_a: string;
  id_b: string;
  /** True when both requirements express the same obligation / outcome (redundant specs, not merely shared words). */
  same_intent: boolean;
  confidence: number;
  rationale: string;
};

/**
 * LLM adjudication: which candidate pairs state the same intent (batched JSON).
 * Requires OPENAI_API_KEY and `set_level_cross.ai_same_intent_enabled` in config.
 */
export async function runCrossSameIntentAi(
  reqs: CanonicalRequirement[],
  config: EngineConfig,
  client: AiClient
): Promise<StructuredFinding[]> {
  if (!config.set_level_cross.ai_same_intent_enabled) return [];
  const maxPairs = Math.max(0, Math.floor(config.set_level_cross.ai_same_intent_max_pairs));
  if (maxPairs <= 0) return [];

  const candidates = collectSameIntentAiCandidatePairs(reqs, config).slice(0, maxPairs);
  if (candidates.length === 0) return [];

  const system = `You compare pairs of requirements from one specification and decide whether they express the SAME INTENT.
Same intent means: the same obligation, outcome, or capability is being stated (possibly with different wording). Different scope, different artifact, or merely shared boilerplate is NOT same intent.

Output ONLY valid JSON:
{"verdicts":[{"id_a":"string","id_b":"string","same_intent":true|false,"confidence":0-1,"rationale":"one short sentence"}]}

Rules:
- Be conservative: same_intent true only when a reader would reasonably merge or deduplicate them as one requirement.
- Shared generic words (system, shall, data) without aligned obligation → same_intent false.
- If unsure, same_intent false or true with confidence under 0.55 (low confidence will be filtered out).
- Return one verdict per input pair; ids must match exactly.`;

  const user = JSON.stringify({
    pairs: candidates.map((c) => ({
      id_a: c.a.id,
      id_b: c.b.id,
      text_a: c.a.normalized_text,
      text_b: c.b.normalized_text,
      content_jaccard_hint: Number(c.content_jaccard.toFixed(3)),
    })),
  });

  const parsed = await client.completeJson<{ verdicts: IntentVerdict[] }>({ system, user });
  if (!parsed?.verdicts || !Array.isArray(parsed.verdicts)) return [];

  const allowedPairs = new Set(candidates.map((c) => pairKey(c.a.id, c.b.id)));

  const minConf = 0.55;
  const out: StructuredFinding[] = [];
  for (const v of parsed.verdicts) {
    if (!v.id_a || !v.id_b) continue;
    if (!allowedPairs.has(pairKey(v.id_a, v.id_b))) continue;
    if (!v.same_intent) continue;
    const conf = Math.min(1, Math.max(0, v.confidence ?? 0));
    if (conf < minConf) continue;
    out.push(
      createFinding({
        requirement_id: v.id_a,
        block_id: BLOCK_ID,
        attribute: "CrossRequirement",
        severity: "medium",
        confidence: conf,
        issue_type: "same_intent_llm",
        explanation: `[LLM same intent, conf≈${conf.toFixed(2)}] ${v.rationale ?? "These requirements appear to state the same obligation or outcome."}`,
        related_requirement_ids: [v.id_b],
        layer: L5,
      })
    );
  }
  return out;
}
