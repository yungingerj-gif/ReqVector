import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";

/**
 * Domain quantities / units the org cares about (speed, torque, current, …).
 * Injected into layered LLM organization context for consistent interpretation.
 */
export interface DomainConstraintEntry {
  id: string;
  /** Human label e.g. "Shaft speed", "Bus current" */
  label: string;
  /** Optional grouping e.g. mechanical, electrical, thermal */
  category?: string;
  /** Preferred unit in specs for this quantity e.g. rad/s, N·m, A */
  canonical_unit: string;
  alternate_units?: string[];
  /** Phrases that refer to this quantity in prose */
  synonyms?: string[];
  notes_for_llm?: string;
  enabled: boolean;
}

export interface DomainConstraintLibrary {
  updated_at: string;
  /** Short preamble for the LLM block */
  summary?: string;
  constraints: DomainConstraintEntry[];
}

const MAX_SUMMARY = 2000;
const MAX_LABEL = 200;
const MAX_CANONICAL_UNIT = 80;
const MAX_SYNONYM = 80;
const MAX_ALTERNATE = 40;
const MAX_NOTES = 2000;
const MAX_PROMPT_CHARS = 7000;

export function domainConstraintsPath(): string {
  return path.join(process.cwd(), "data", "domain-constraints.json");
}

export function defaultDomainConstraintLibrary(): DomainConstraintLibrary {
  return {
    updated_at: new Date().toISOString(),
    constraints: [],
  };
}

export function loadDomainConstraintLibrary(): DomainConstraintLibrary {
  const p = domainConstraintsPath();
  try {
    if (!fs.existsSync(p)) return defaultDomainConstraintLibrary();
    const raw = fs.readFileSync(p, "utf8");
    const parsed = JSON.parse(raw) as DomainConstraintLibrary;
    if (!parsed || !Array.isArray(parsed.constraints)) return defaultDomainConstraintLibrary();
    const summary =
      typeof parsed.summary === "string" && parsed.summary.trim().length > 0
        ? parsed.summary.trim().slice(0, MAX_SUMMARY)
        : undefined;
    const base: DomainConstraintLibrary = {
      updated_at: typeof parsed.updated_at === "string" ? parsed.updated_at : new Date().toISOString(),
      constraints: parsed.constraints
        .filter((c) => c && typeof c === "object")
        .map((c) => {
          const row: DomainConstraintEntry = {
            id: typeof c.id === "string" && c.id.length > 0 ? c.id : randomUUID(),
            label: String((c as DomainConstraintEntry).label ?? "Quantity").slice(0, MAX_LABEL),
            canonical_unit: String((c as DomainConstraintEntry).canonical_unit ?? "").slice(0, MAX_CANONICAL_UNIT),
            enabled: Boolean((c as DomainConstraintEntry).enabled),
          };
          const cat = (c as DomainConstraintEntry).category?.trim();
          if (cat) row.category = cat.slice(0, 120);
          const alt = (c as DomainConstraintEntry).alternate_units;
          if (Array.isArray(alt)) {
            row.alternate_units = alt.map((u) => String(u).trim()).filter(Boolean).slice(0, 20).map((u) => u.slice(0, MAX_ALTERNATE));
          }
          const syn = (c as DomainConstraintEntry).synonyms;
          if (Array.isArray(syn)) {
            row.synonyms = syn.map((s) => String(s).trim()).filter(Boolean).slice(0, 40).map((s) => s.slice(0, MAX_SYNONYM));
          }
          const n = (c as DomainConstraintEntry).notes_for_llm?.trim();
          if (n) row.notes_for_llm = n.slice(0, MAX_NOTES);
          return row;
        }),
    };
    if (summary != null) base.summary = summary;
    return base;
  } catch {
    return defaultDomainConstraintLibrary();
  }
}

export function saveDomainConstraintLibrary(lib: DomainConstraintLibrary): void {
  const p = domainConstraintsPath();
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const out: DomainConstraintLibrary = {
    updated_at: new Date().toISOString(),
    constraints: lib.constraints.map((c) => {
      const row: DomainConstraintEntry = {
        id: c.id?.length ? c.id : randomUUID(),
        label: c.label.slice(0, MAX_LABEL),
        canonical_unit: c.canonical_unit.slice(0, MAX_CANONICAL_UNIT),
        enabled: Boolean(c.enabled),
      };
      const cat = c.category?.trim();
      if (cat) row.category = cat.slice(0, 120);
      if (c.alternate_units?.length) {
        row.alternate_units = c.alternate_units.map((u) => u.slice(0, MAX_ALTERNATE));
      }
      if (c.synonyms?.length) {
        row.synonyms = c.synonyms.map((s) => s.slice(0, MAX_SYNONYM));
      }
      const n = c.notes_for_llm?.trim();
      if (n) row.notes_for_llm = n.slice(0, MAX_NOTES);
      return row;
    }),
  };
  const s = lib.summary?.trim();
  if (s) out.summary = s.slice(0, MAX_SUMMARY);
  fs.writeFileSync(p, JSON.stringify(out, null, 2), "utf8");
}

export function formatDomainConstraintsForPrompt(lib: DomainConstraintLibrary): string {
  const summary = lib.summary?.trim() ?? "";
  const enabled = lib.constraints.filter((c) => {
    if (!c.enabled) return false;
    return c.label.trim().length > 0 && c.canonical_unit.trim().length > 0;
  });
  if (!summary && enabled.length === 0) return "";

  const blocks: string[] = [
    "DOMAIN CONSTRAINT LIBRARY — quantities and preferred units (interpretation only; not extra requirements).",
    "When requirements mention these concepts, prefer the canonical unit and treat synonyms as the same quantity unless the spec explicitly distinguishes them.",
    "",
  ];
  let total = blocks.join("\n").length;

  if (summary) {
    const line = `### Scope\n${summary}`;
    blocks.push(line);
    blocks.push("");
    total += line.length + 2;
  }

  if (enabled.length > 0) {
    blocks.push("### Quantities");
    blocks.push("");
    total += "### Quantities\n\n".length;

    for (let i = 0; i < enabled.length; i++) {
      const c = enabled[i]!;
      const alt =
        c.alternate_units?.filter(Boolean).length ? `Also seen as: ${c.alternate_units!.join(", ")}.` : "";
      const syn = c.synonyms?.filter(Boolean).length ? `Synonyms / phrases: ${c.synonyms!.join("; ")}.` : "";
      const notes = c.notes_for_llm?.trim() ? `Notes: ${c.notes_for_llm.trim()}` : "";
      const cat = c.category?.trim() ? `[${c.category.trim()}] ` : "";
      const piece = [
        `#### ${i + 1}. ${cat}${c.label.trim()}`,
        `Canonical unit: ${c.canonical_unit.trim()}`,
        alt,
        syn,
        notes,
      ]
        .filter(Boolean)
        .join("\n");

      if (total + piece.length + 2 > MAX_PROMPT_CHARS) {
        blocks.push("[Additional domain constraints omitted — shorten the library in Domain constraints.]");
        break;
      }
      blocks.push(piece);
      blocks.push("");
      total += piece.length + 2;
    }
  }

  return blocks.join("\n").trim();
}
