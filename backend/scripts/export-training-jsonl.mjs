#!/usr/bin/env node
/**
 * Stub: build JSONL training lines from an offline export of requirement pairs + labels.
 *
 * Input file (JSON array): [ { "id_a", "id_b", "text_a", "text_b", "same_intent": boolean, "rationale": string } ]
 * Output: stdout JSONL matching ai-service/training/dataset-record.schema.json shape.
 *
 * Usage: node scripts/export-training-jsonl.mjs path/to/pairs.json > out.jsonl
 *
 * Do not commit customer text. Anonymize before writing pairs.json.
 */

import { readFileSync } from "fs";

const path = process.argv[2];
if (!path) {
  console.error("Usage: node export-training-jsonl.mjs <pairs.json>");
  process.exit(1);
}

const raw = JSON.parse(readFileSync(path, "utf-8"));
if (!Array.isArray(raw)) {
  console.error("Expected a JSON array");
  process.exit(1);
}

const system =
  'You compare two requirements. Respond with JSON only: {"same_intent":boolean,"confidence":number,"rationale":string}';

let i = 0;
for (const row of raw) {
  if (!row || typeof row !== "object") continue;
  const ta = String(row.text_a ?? "");
  const tb = String(row.text_b ?? "");
  const gold = Boolean(row.same_intent);
  const rationale = String(row.rationale ?? "");
  const user = `REQ-A: ${ta}\nREQ-B: ${tb}`;
  const assistant = JSON.stringify({
    same_intent: gold,
    confidence: 1,
    rationale: rationale || (gold ? "labeled same intent" : "labeled different intent"),
  });
  const record = {
    id: String(row.id ?? `row-${i++}`),
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
      { role: "assistant", content: assistant },
    ],
    metadata: { task: "same_intent", gold_label: { same_intent: gold } },
  };
  process.stdout.write(`${JSON.stringify(record)}\n`);
}
