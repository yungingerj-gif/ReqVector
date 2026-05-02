import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import { formatDomainConstraintsForPrompt, loadDomainConstraintLibrary } from "./domainConstraintLibrary";

/**
 * One topic card: spec layout, domain jargon, or sample text the model should respect.
 * Optional excerpt — guidance-only rows are allowed when notes/guidance are set.
 */
export interface AiTrainingExample {
  id: string;
  /** Short label, e.g. "DOORS IDs", "SIL wording", "Same-intent pairs" */
  layout_label: string;
  /** Free-form: structure, tables, vocabulary, or how to read IDs */
  layout_notes: string;
  /** Representative lines (de-identified); omit if using guidance-only */
  excerpt: string;
  /** Task-specific hints for any layered LLM pass */
  guidance_for_llm?: string;
  enabled: boolean;
}

export interface AiTrainingPack {
  updated_at: string;
  /**
   * Prepended to **every** layered LLM system prompt (attribute analysis, legacy augment,
   * same-intent, intra-doc adjudication, parent–child adjudication). Prompt steering only — not fine-tuning.
   */
  global_llm_instructions?: string;
  examples: AiTrainingExample[];
}

const MAX_EXCERPT_PER_EXAMPLE = 6000;
const MAX_TOTAL_PROMPT_CHARS = 14000;

export function trainingPackPath(): string {
  return path.join(process.cwd(), "data", "ai-training-pack.json");
}

export function defaultTrainingPack(): AiTrainingPack {
  return {
    updated_at: new Date().toISOString(),
    examples: [],
  };
}

export function loadAiTrainingPack(): AiTrainingPack {
  const p = trainingPackPath();
  try {
    if (!fs.existsSync(p)) return defaultTrainingPack();
    const raw = fs.readFileSync(p, "utf8");
    const parsed = JSON.parse(raw) as AiTrainingPack;
    if (!parsed || !Array.isArray(parsed.examples)) return defaultTrainingPack();
    const global_llm_instructions =
      typeof parsed.global_llm_instructions === "string" && parsed.global_llm_instructions.trim().length > 0
        ? parsed.global_llm_instructions.slice(0, 8000)
        : undefined;
    const base: AiTrainingPack = {
      updated_at: typeof parsed.updated_at === "string" ? parsed.updated_at : new Date().toISOString(),
      examples: parsed.examples
        .filter((e) => e && typeof e === "object")
        .map((e) => {
          const exRow: AiTrainingExample = {
            id: typeof e.id === "string" && e.id.length > 0 ? e.id : randomUUID(),
            layout_label: String((e as AiTrainingExample).layout_label ?? "Topic").slice(0, 200),
            layout_notes: typeof e.layout_notes === "string" ? e.layout_notes.slice(0, 8000) : "",
            excerpt: typeof e.excerpt === "string" ? e.excerpt.slice(0, MAX_EXCERPT_PER_EXAMPLE) : "",
            enabled: Boolean((e as AiTrainingExample).enabled),
          };
          const g = (e as AiTrainingExample).guidance_for_llm;
          if (typeof g === "string" && g.length > 0) {
            exRow.guidance_for_llm = g.slice(0, 4000);
          }
          return exRow;
        }),
    };
    if (global_llm_instructions != null) {
      base.global_llm_instructions = global_llm_instructions;
    }
    return base;
  } catch {
    return defaultTrainingPack();
  }
}

export function saveAiTrainingPack(pack: AiTrainingPack): void {
  const p = trainingPackPath();
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const out: AiTrainingPack = {
    updated_at: new Date().toISOString(),
    examples: pack.examples.map((e) => {
      const row: AiTrainingExample = {
        id: e.id?.length ? e.id : randomUUID(),
        layout_label: e.layout_label.slice(0, 200),
        layout_notes: e.layout_notes.slice(0, 8000),
        excerpt: e.excerpt.slice(0, MAX_EXCERPT_PER_EXAMPLE),
        enabled: Boolean(e.enabled),
      };
      if (e.guidance_for_llm != null && e.guidance_for_llm.length > 0) {
        row.guidance_for_llm = e.guidance_for_llm.slice(0, 4000);
      } else {
        delete row.guidance_for_llm;
      }
      return row;
    }),
  };
  const gi = pack.global_llm_instructions?.trim();
  if (gi) {
    out.global_llm_instructions = gi.slice(0, 8000);
  }
  fs.writeFileSync(p, JSON.stringify(out, null, 2), "utf8");
  writeSteeringTrainingJsonl(out);
}

/** Enabled examples that contribute to prompts and to auto-generated fine-tuning JSONL. */
export function eligibleSteeringExamples(pack: AiTrainingPack): AiTrainingExample[] {
  return pack.examples.filter((e) => {
    if (!e.enabled) return false;
    const hasBody =
      e.excerpt.trim().length > 0 ||
      e.layout_notes.trim().length > 0 ||
      (e.guidance_for_llm?.trim().length ?? 0) > 0;
    return hasBody && e.layout_label.trim().length > 0;
  });
}

const STEERING_SFT_SYSTEM =
  "You internalize organizational steering for requirements analysis. Reply with a single JSON object only (no markdown fences).";

function linesToRuleStrings(...blocks: string[]): string[] {
  const rules: string[] = [];
  for (const block of blocks) {
    for (const line of block.split(/\r?\n/)) {
      const t = line.trim();
      if (t.length > 0) rules.push(t);
    }
  }
  return [...new Set(rules)];
}

function steeringTopicAssistantPayload(ex: AiTrainingExample): string {
  const rules = linesToRuleStrings(ex.layout_notes, ex.guidance_for_llm ?? "").slice(0, 40);
  const topic = ex.layout_label.trim();
  const payload = {
    topic,
    interpretation_rules:
      rules.length > 0 ? rules : [`Apply organizational defaults for "${topic}".`],
    sample_vocab_note: ex.excerpt.trim()
      ? "Treat the sample excerpt as vocabulary/structure only; it is not a requirement to verify."
      : null,
  };
  return JSON.stringify(payload);
}

function steeringGlobalAssistantPayload(global: string): string {
  const rules = linesToRuleStrings(global).slice(0, 40);
  return JSON.stringify({
    scope: "global",
    interpretation_rules: rules.length > 0 ? rules : ["(no global steering lines parsed)"],
  });
}

export type SteeringFineTuneRecord = {
  id: string;
  domain: string;
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  metadata: { task: "other"; source: string; gold_label?: { synthetic_steering_digest: boolean } };
};

/**
 * Turn in-app steering into chat rows suitable for external SFT (OpenAI-style JSONL).
 * Gold assistants are derived deterministically from your text — review/redact before training.
 */
export function buildSteeringFineTuneRecords(pack: AiTrainingPack): SteeringFineTuneRecord[] {
  const records: SteeringFineTuneRecord[] = [];
  const meta = {
    task: "other" as const,
    source: "reqvector-steering-auto",
    gold_label: { synthetic_steering_digest: true },
  };

  const global = pack.global_llm_instructions?.trim() ?? "";
  if (global.length > 0) {
    records.push({
      id: "steering-global",
      domain: "organization_global",
      messages: [
        { role: "system", content: STEERING_SFT_SYSTEM },
        {
          role: "user",
          content: [
            "The following GLOBAL instructions apply to every layered LLM pass in our toolchain:",
            "",
            global,
            "",
            'Respond with JSON: {"scope":"global","interpretation_rules":["string",...]} — one rule string per distinct obligation or theme.',
          ].join("\n"),
        },
        { role: "assistant", content: steeringGlobalAssistantPayload(global) },
      ],
      metadata: meta,
    });
  }

  const topics = eligibleSteeringExamples(pack);
  for (let i = 0; i < topics.length; i++) {
    const ex = topics[i]!;
    const safeId = ex.id.replace(/[^\w-]+/g, "-").slice(0, 80) || `topic-${i}`;
    const userParts = [
      `Topic label: ${ex.layout_label.trim()}`,
      "",
      "Context / structure / vocabulary:",
      ex.layout_notes.trim() || "(none)",
      "",
      "Judgment guidance for LLM passes:",
      ex.guidance_for_llm?.trim() || "(none)",
      "",
      "Sample document excerpt (optional — vocabulary only):",
      ex.excerpt.trim() ? ex.excerpt.trim() : "(none)",
      "",
      'Respond with JSON: {"topic":"string","interpretation_rules":["string",...],"sample_vocab_note":string|null}.',
    ];
    records.push({
      id: `steering-topic-${i}-${safeId}`,
      domain: ex.layout_label.trim().slice(0, 120),
      messages: [
        { role: "system", content: STEERING_SFT_SYSTEM },
        { role: "user", content: userParts.join("\n") },
        { role: "assistant", content: steeringTopicAssistantPayload(ex) },
      ],
      metadata: meta,
    });
  }

  return records;
}

export function steeringTrainingJsonlPath(): string {
  return path.join(process.cwd(), "data", "ai-training-steering.jsonl");
}

export function steeringTrainingJsonlFromPack(pack: AiTrainingPack): string {
  const lines = buildSteeringFineTuneRecords(pack).map((row) => JSON.stringify(row));
  return lines.join("\n") + (lines.length > 0 ? "\n" : "");
}

export function writeSteeringTrainingJsonl(pack: AiTrainingPack): void {
  const p = steeringTrainingJsonlPath();
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, steeringTrainingJsonlFromPack(pack), "utf8");
}

/**
 * Prefix injected ahead of every layered LLM system prompt (`wrapAiClientWithOrganizationContext`).
 * Covers every AI touchpoint: attribute analysis, legacy augment, same-intent, intra + hierarchy adjudication.
 * Not model fine-tuning — in-context steering only.
 */
export function formatTrainingPackForPrompt(pack: AiTrainingPack): string {
  const global = pack.global_llm_instructions?.trim() ?? "";

  const enabledExamples = eligibleSteeringExamples(pack);

  if (!global && enabledExamples.length === 0) return "";

  const blocks: string[] = [
    "ORGANIZATION / PROJECT CONTEXT — applies to ALL layered LLM steps below (requirement review, legacy rewrite hints, same-intent pairs, contradiction review).",
    "Do not treat this block as requirements to analyze; use it only for interpretation and judgment.",
    "",
  ];

  let total = blocks.join("\n").length;

  if (global) {
    const g = `### Global instructions (always apply)\n${global}`;
    blocks.push(g);
    blocks.push("");
    total += g.length + 2;
  }

  if (enabledExamples.length > 0) {
    const topicTitle = "### Topic examples (additional steering)";
    blocks.push(topicTitle);
    blocks.push("");
    total += topicTitle.length + 2;

    for (let i = 0; i < enabledExamples.length; i++) {
      const ex = enabledExamples[i]!;
      const excerptPart = ex.excerpt.trim()
        ? ["Sample text:", "```", ex.excerpt.trim(), "```"].join("\n")
        : "(No sample excerpt — guidance/notes only.)";

      const piece = [
        `#### ${i + 1}. ${ex.layout_label}`,
        ex.layout_notes.trim() ? `Context / structure / vocabulary:\n${ex.layout_notes.trim()}` : "",
        ex.guidance_for_llm?.trim() ? `How to judge or phrase results:\n${ex.guidance_for_llm.trim()}` : "",
        excerptPart,
      ]
        .filter(Boolean)
        .join("\n\n");

      if (total + piece.length + 2 > MAX_TOTAL_PROMPT_CHARS) {
        blocks.push(
          "[Additional topic examples omitted to stay within size limits; shorten global instructions or examples.]"
        );
        break;
      }
      blocks.push(piece);
      blocks.push("");
      total += piece.length + 2;
    }
  }

  return blocks.join("\n").trim();
}

/** Loaded from disk and formatted for layered LLM injection (same as analyze routes use). */
export function getAiOrganizationContextForEngine(): string {
  const steering = formatTrainingPackForPrompt(loadAiTrainingPack());
  const domain = formatDomainConstraintsForPrompt(loadDomainConstraintLibrary());
  if (!steering && !domain) return "";
  if (!steering) return domain;
  if (!domain) return steering;
  return `${steering}\n\n---\n\n${domain}`;
}
