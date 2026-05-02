import { createFinding } from "../deterministic/newFinding";
import type { AiClient } from "../ai/aiClient";
import type { StructuredFinding } from "../types";
import type { HierarchyPair } from "./hierarchyMatch";
import { BLOCK_HIERARCHY } from "./blockIds";

const L6 = "L6_Contradiction";

type HVerdict = {
  parent_id: string;
  child_id: string;
  relationship:
    | "consistent_refinement"
    | "possible_contradiction"
    | "clear_contradiction"
    | "relaxed_parent_constraint"
    | "tightened_child_constraint"
    | "missing_allocation"
    | "orphan_context"
    | "under_specified_vs_parent"
    | "over_constraining_conflict";
  category: string;
  severity: "low" | "medium" | "high";
  confidence: number;
  explanation: string;
  evidence_span?: string;
};

export async function runHierarchyAiReview(
  pairs: HierarchyPair[],
  client: AiClient,
  maxPairs: number
): Promise<StructuredFinding[]> {
  if (pairs.length === 0 || maxPairs <= 0) return [];
  const slice = pairs.slice(0, maxPairs);
  const system = `You analyze parent vs child requirements (different specification levels).
Output ONLY JSON:
{"verdicts":[{"parent_id":"string","child_id":"string","relationship":"consistent_refinement"|"possible_contradiction"|"clear_contradiction"|"relaxed_parent_constraint"|"tightened_child_constraint"|"missing_allocation"|"orphan_context"|"under_specified_vs_parent"|"over_constraining_conflict","category":"string","severity":"low"|"medium"|"high","confidence":0-1,"explanation":"string","evidence_span":"short excerpts"}]}

Rules:
- consistent_refinement when child properly narrows parent without conflict.
- relaxed_parent_constraint when child weakens a parent obligation/threshold.
- Do not invent numbers; cite only text present.
- If relationship is consistent_refinement with high confidence, you may omit that pair from verdicts to reduce noise (return empty assessments for clean cases).`;

  const user = JSON.stringify({
    pairs: slice.map((p) => ({
      parent_id: p.parent.id,
      child_id: p.child.id,
      parent_text: p.parent.normalized_text,
      child_text: p.child.normalized_text,
      match_via: p.via,
    })),
  });

  const parsed = await client.completeJson<{ verdicts: HVerdict[] }>({ system, user });
  if (!parsed?.verdicts || !Array.isArray(parsed.verdicts)) return [];

  const out: StructuredFinding[] = [];
  for (const v of parsed.verdicts) {
    if (!v.parent_id || !v.child_id || !v.relationship) continue;
    if (v.relationship === "consistent_refinement") continue;
    const conf = Math.min(1, Math.max(0, v.confidence ?? 0.65));
    out.push(
      createFinding({
        requirement_id: v.child_id,
        block_id: BLOCK_HIERARCHY,
        attribute: "ConsistentCorrect",
        severity: v.severity ?? "medium",
        confidence: conf,
        issue_type: `hierarchy.ai.${v.relationship}`,
        explanation: v.explanation ?? v.relationship,
        ...(v.evidence_span ? { evidence_span: v.evidence_span } : {}),
        related_requirement_ids: [v.parent_id],
        layer: L6,
      })
    );
  }
  return out;
}
