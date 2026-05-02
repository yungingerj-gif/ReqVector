import { describe, expect, it } from "vitest";
import type { AiClient } from "../../engine/layered/ai/aiClient";
import { loadEngineConfig } from "../../engine/layered/config";
import { runCrossSameIntentAi } from "../../engine/layered/setLevel/crossIntentAi";
import type { CanonicalRequirement } from "../../engine/layered/types";

function req(id: string, text: string): CanonicalRequirement {
  return {
    id,
    source_text: text,
    normalized_text: text.toLowerCase(),
    explicit_id: true,
    type: "Functional",
  };
}

function mockClient(payload: unknown): AiClient {
  return {
    async completeJson<T>(): Promise<T | null> {
      return payload as T;
    },
  };
}

describe("runCrossSameIntentAi", () => {
  it("returns no findings when disabled", async () => {
    const config = loadEngineConfig();
    config.set_level_cross.ai_same_intent_enabled = false;
    const reqs = [req("A", "The widget shall glow blue."), req("B", "The widget shall glow blue.")];
    const out = await runCrossSameIntentAi(reqs, config, mockClient({ verdicts: [] }));
    expect(out).toHaveLength(0);
  });

  it("emits same_intent_llm when model affirms with sufficient confidence", async () => {
    const config = loadEngineConfig();
    config.set_level_cross.ai_same_intent_enabled = true;
    config.set_level_cross.ai_same_intent_max_pairs = 10;
    const reqs = [
      req("REQ-A", "The display unit shall show fault codes within fifty milliseconds."),
      req("REQ-B", "The display unit shall show fault codes within 50 ms."),
    ];
    const client = mockClient({
      verdicts: [
        {
          id_a: "REQ-A",
          id_b: "REQ-B",
          same_intent: true,
          confidence: 0.88,
          rationale: "Same display fault-code timing obligation; only numeric formatting differs.",
        },
      ],
    });
    const out = await runCrossSameIntentAi(reqs, config, client);
    expect(out.length).toBeGreaterThanOrEqual(1);
    expect(out[0]?.issue_type).toBe("same_intent_llm");
    expect(out[0]?.related_requirement_ids).toEqual(["REQ-B"]);
  });

  it("drops low-confidence same_intent", async () => {
    const config = loadEngineConfig();
    config.set_level_cross.ai_same_intent_enabled = true;
    const reqs = [
      req(
        "X",
        "The module shall log errors to the local diagnostic file when faults occur during operation."
      ),
      req(
        "Y",
        "The module shall log errors to the local diagnostic file when warnings occur during operation."
      ),
    ];
    const client = mockClient({
      verdicts: [
        {
          id_a: "X",
          id_b: "Y",
          same_intent: true,
          confidence: 0.2,
          rationale: "Unclear.",
        },
      ],
    });
    const out = await runCrossSameIntentAi(reqs, config, client);
    expect(out.filter((f) => f.issue_type === "same_intent_llm")).toHaveLength(0);
  });
});
