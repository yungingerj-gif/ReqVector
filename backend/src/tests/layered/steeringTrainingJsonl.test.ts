import { describe, expect, it } from "vitest";
import {
  buildSteeringFineTuneRecords,
  steeringTrainingJsonlFromPack,
  type AiTrainingPack,
} from "../../engine/layered/aiTrainingPack";

describe("steering → fine-tune JSONL", () => {
  it("emits global + topic rows with assistant JSON", () => {
    const pack: AiTrainingPack = {
      updated_at: "2026-01-01T00:00:00.000Z",
      global_llm_instructions: "Prefer ISO units.\nNever invent trace IDs.",
      examples: [
        {
          id: "ex1",
          layout_label: "SIL",
          layout_notes: "SIL levels are normative.",
          excerpt: "The system shall meet SIL-2.",
          guidance_for_llm: "Do not downgrade SIL mentions.",
          enabled: true,
        },
      ],
    };
    const rows = buildSteeringFineTuneRecords(pack);
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe("steering-global");
    expect(rows[0].messages).toHaveLength(3);
    expect(rows[0].messages[2].role).toBe("assistant");
    expect(JSON.parse(rows[0].messages[2].content)).toMatchObject({ scope: "global" });

    expect(rows[1].id).toMatch(/^steering-topic-/);
    const asst = JSON.parse(rows[1].messages[2].content);
    expect(asst.topic).toBe("SIL");
    expect(Array.isArray(asst.interpretation_rules)).toBe(true);

    const ndjson = steeringTrainingJsonlFromPack(pack);
    expect(ndjson.split("\n").filter(Boolean)).toHaveLength(2);
  });

  it("skips disabled or empty topics", () => {
    const pack: AiTrainingPack = {
      updated_at: "",
      examples: [
        {
          id: "a",
          layout_label: "X",
          layout_notes: "",
          excerpt: "",
          enabled: true,
        },
        {
          id: "b",
          layout_label: "Y",
          layout_notes: "ok",
          excerpt: "",
          enabled: false,
        },
      ],
    };
    expect(buildSteeringFineTuneRecords(pack)).toHaveLength(0);
  });
});
