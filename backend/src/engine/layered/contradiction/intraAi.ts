import { createFinding } from "../deterministic/newFinding";
import type { AiClient } from "../ai/aiClient";
import type { StructuredFinding } from "../types";
import type { CandidatePair } from "./pairCandidates";
import { BLOCK_INTRA } from "./blockIds";

const L6 = "L6_Contradiction";

type Verdict = {
  id_a: string;
  id_b: string;
  classification:
    | "consistent"
    | "possible_contradiction"
    | "clear_contradiction"
    | "valid_refinement"
    | "possible_overlap_duplicate";
  category:
    | "numeric_conflict"
    | "behavioral_conflict"
    | "condition_conflict"
    | "terminology_conflict"
    | "overlap_no_contradiction"
    | "duplicate_intent"
    | "none";
  severity: "low" | "medium" | "high";
  confidence: number;
  explanation: string;
  evidence_span?: string;
};

function severityFor(v: Verdict): "low" | "medium" | "high" {
  // Reserve "high" for explicit quantitative clashes; cap other clear_contradiction / overlap outcomes.
  if (v.classification === "clear_contradiction" && v.category === "numeric_conflict") return "high";
  if (v.classification === "clear_contradiction") return "medium";
  if (v.classification === "possible_contradiction") return "medium";
  if (v.classification === "possible_overlap_duplicate" && v.category === "duplicate_intent") return "medium";
  return v.severity ?? "low";
}

/**
 * AI adjudication for intra-document candidate pairs (batched JSON).
 */
export async function runIntraAiAdjudication(
  pairs: CandidatePair[],
  client: AiClient,
  maxPairs: number
): Promise<StructuredFinding[]> {
  if (pairs.length === 0 || maxPairs <= 0) return [];
  const slice = pairs.slice(0, maxPairs);
  const system = `You adjudicate pairs of requirements from the same specification.
Output ONLY valid JSON:
{"verdicts":[{"id_a":"string","id_b":"string","classification":"consistent"|"possible_contradiction"|"clear_contradiction"|"valid_refinement"|"possible_overlap_duplicate","category":"numeric_conflict"|"behavioral_conflict"|"condition_conflict"|"terminology_conflict"|"overlap_no_contradiction"|"duplicate_intent"|"none","severity":"low"|"medium"|"high","confidence":0-1,"explanation":"string","evidence_span":"short excerpts from both"}]}

Rules:
- Be conservative: use clear_contradiction only when the texts clearly clash.
- duplicate_intent / overlap_no_contradiction when similar intent without conflict.
- valid_refinement when one tightens or clarifies the other without conflict.
- If unsure, classification consistent or possible_contradiction with low confidence.
- Do not invent numeric thresholds not present in the texts.`;

  const user = JSON.stringify({
    pairs: slice.map((p) => ({
      id_a: p.a.id,
      id_b: p.b.id,
      text_a: p.a.normalized_text,
      text_b: p.b.normalized_text,
      candidate_reasons: p.reasons,
    })),
  });

  const parsed = await client.completeJson<{ verdicts: Verdict[] }>({ system, user });
  if (!parsed?.verdicts || !Array.isArray(parsed.verdicts)) return [];

  const out: StructuredFinding[] = [];
  for (const v of parsed.verdicts) {
    if (!v.id_a || !v.id_b || !v.classification) continue;
    if (v.classification === "consistent" && (v.confidence ?? 0) < 0.5) continue;
    const conf = Math.min(1, Math.max(0, v.confidence ?? 0.65));
    const sev = severityFor(v);
    const issue = `intra.ai.${v.category !== "none" ? v.category : v.classification}`;
    out.push(
      createFinding({
        requirement_id: v.id_a,
        block_id: BLOCK_INTRA,
        attribute: "ConsistentCorrect",
        severity: sev,
        confidence: conf,
        issue_type: issue,
        explanation: `[${v.classification}] ${v.explanation ?? ""}`.trim(),
        ...(v.evidence_span ? { evidence_span: v.evidence_span } : {}),
        related_requirement_ids: [v.id_b],
        layer: L6,
      })
    );
  }
  return out;
}
