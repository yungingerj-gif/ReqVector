import type { AiAttributeAssessment, CanonicalRequirement, StructuredFinding } from "../types";
import type { AiClient } from "./aiClient";
import { createFinding } from "../deterministic/newFinding";

const L2 = "L2_AI";
export const BLOCK_ID = "ai.attribute_analysis";

function summaryDeterministic(findings: StructuredFinding[]): string {
  return findings
    .map((f) => `${f.attribute}/${f.issue_type}: ${f.explanation.slice(0, 120)}`)
    .join("\n");
}

/**
 * AI pass: structured assessments only; translated to findings. Deterministic findings are never removed.
 */
export async function runAiAttributeAnalysis(
  req: CanonicalRequirement,
  deterministicForReq: StructuredFinding[],
  client: AiClient
): Promise<StructuredFinding[]> {
  const system = `You are a requirements quality analyst. Output ONLY valid JSON with this shape:
{"assessments":[{"attribute":"Unambiguous"|"Complete"|"Verifiable"|"Singular"|"ConsistentCorrect","severity":"low"|"medium"|"high","confidence":0.0-1.0,"explanation":"string","evidence_span":"optional","suggested_rewrite":"optional","missing_fields":["optional"]}]}

Rules:
- Add assessments ONLY for subtle gaps not already covered by the deterministic summary.
- Do not invent numeric thresholds or units that are not implied by the source text.
- If nothing material to add, return {"assessments":[]}.
- confidence must reflect uncertainty; stay conservative.`;

  const user = JSON.stringify({
    requirement: req,
    deterministic_summary: summaryDeterministic(deterministicForReq),
  });

  const parsed = await client.completeJson<{ assessments: AiAttributeAssessment[] }>({
    system,
    user,
  });

  if (!parsed?.assessments || !Array.isArray(parsed.assessments)) {
    return [];
  }

  const out: StructuredFinding[] = [];
  for (const a of parsed.assessments) {
    if (!a.attribute || !a.severity || typeof a.confidence !== "number") continue;
    out.push(
      createFinding({
        requirement_id: req.id,
        block_id: BLOCK_ID,
        attribute: a.attribute,
        severity: a.severity,
        confidence: Math.min(1, Math.max(0, a.confidence)),
        issue_type: "ai_attribute_review",
        explanation: a.explanation ?? "",
        layer: L2,
        ...(a.evidence_span ? { evidence_span: a.evidence_span } : {}),
        ...(a.suggested_rewrite ? { suggested_rewrite: a.suggested_rewrite } : {}),
        ...(a.missing_fields && a.missing_fields.length > 0 ? { missing_fields: a.missing_fields } : {}),
      })
    );
  }
  return out;
}
