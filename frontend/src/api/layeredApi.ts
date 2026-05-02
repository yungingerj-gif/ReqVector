import { apiUrl } from "../apiBase";
import type { LayeredAnalysisResult } from "../types/layeredTypes";

export async function analyzeLayered(body: {
  rawText: string;
  profile: string;
  mode: "active" | "legacy";
  sourceDocument?: string;
  options?: Record<string, unknown>;
  parent_raw_text?: string;
  parent_source_document?: string;
  trace_links?: Array<{ parent_requirement_id: string; child_requirement_id: string }>;
  /** Enables server LLM pass for same-intent cross-requirement pairs (requires API key on server). */
  same_intent_llm?: boolean;
}): Promise<LayeredAnalysisResult> {
  const res = await fetch(apiUrl("/api/layered/analyze"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.text()) || res.statusText);
  return res.json() as Promise<LayeredAnalysisResult>;
}

export async function analyzeLayeredUpload(fd: FormData): Promise<LayeredAnalysisResult> {
  const res = await fetch(apiUrl("/api/layered/analyze-upload"), {
    method: "POST",
    body: fd,
  });
  if (!res.ok) throw new Error((await res.text()) || res.statusText);
  return res.json() as Promise<LayeredAnalysisResult>;
}

export async function exportLayeredDocx(result: LayeredAnalysisResult): Promise<Blob> {
  const res = await fetch(apiUrl("/api/layered/export/analysis-docx"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ result }),
  });
  if (!res.ok) throw new Error((await res.text()) || res.statusText);
  return res.blob();
}

export async function getLayeredEngineConfig(): Promise<Record<string, unknown>> {
  const res = await fetch(apiUrl("/api/layered/config"));
  if (!res.ok) throw new Error((await res.text()) || res.statusText);
  return res.json() as Promise<Record<string, unknown>>;
}

/** Layered LLM prompt steering pack (server file `backend/data/ai-training-pack.json`). */
export interface AiTrainingPackDto {
  updated_at: string;
  global_llm_instructions?: string;
  examples: AiTrainingExampleDto[];
}

export interface AiTrainingExampleDto {
  id: string;
  layout_label: string;
  layout_notes: string;
  excerpt: string;
  guidance_for_llm?: string;
  enabled: boolean;
}

export async function getAiTrainingPack(): Promise<AiTrainingPackDto> {
  const res = await fetch(apiUrl("/api/layered/ai-training-pack"));
  if (!res.ok) throw new Error((await res.text()) || res.statusText);
  return res.json() as Promise<AiTrainingPackDto>;
}

export async function saveAiTrainingPack(body: {
  global_llm_instructions?: string;
  examples: AiTrainingExampleDto[];
}): Promise<AiTrainingPackDto> {
  const res = await fetch(apiUrl("/api/layered/ai-training-pack"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.text()) || res.statusText);
  return res.json() as Promise<AiTrainingPackDto>;
}

/** JSONL derived from the steering pack (auto-written on save to `backend/data/ai-training-steering.jsonl`). */
export async function fetchSteeringTrainingJsonl(): Promise<Blob> {
  const res = await fetch(apiUrl("/api/layered/ai-training-steering.jsonl"));
  if (!res.ok) throw new Error((await res.text()) || res.statusText);
  return res.blob();
}

/** Quantities / units library (`backend/data/domain-constraints.json`). */
export interface DomainConstraintDto {
  id: string;
  label: string;
  category?: string;
  canonical_unit: string;
  alternate_units?: string[];
  synonyms?: string[];
  notes_for_llm?: string;
  enabled: boolean;
}

export interface DomainConstraintLibraryDto {
  updated_at: string;
  summary?: string;
  constraints: DomainConstraintDto[];
}

export async function getDomainConstraintLibrary(): Promise<DomainConstraintLibraryDto> {
  const res = await fetch(apiUrl("/api/layered/domain-constraints"));
  if (!res.ok) throw new Error((await res.text()) || res.statusText);
  return res.json() as Promise<DomainConstraintLibraryDto>;
}

export async function saveDomainConstraintLibrary(body: {
  summary?: string;
  constraints: DomainConstraintDto[];
}): Promise<DomainConstraintLibraryDto> {
  const res = await fetch(apiUrl("/api/layered/domain-constraints"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.text()) || res.statusText);
  return res.json() as Promise<DomainConstraintLibraryDto>;
}

export type SourceReplacement = { from: string; to: string };

function filenameFromContentDisposition(cd: string | null): string | null {
  if (!cd) return null;
  const star = /filename\*=(?:UTF-8'')?([^;\n]+)/i.exec(cd);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^["']|["']$/g, ""));
    } catch {
      return star[1].trim().replace(/^["']|["']$/g, "");
    }
  }
  const simple = /filename="([^"]+)"/i.exec(cd);
  if (simple) return simple[1];
  return null;
}

/** Rebuild the uploaded source (or pasted text as .txt) with accepted requirement text replacements. */
export async function exportRevisedSource(
  file: File | Blob,
  filenameForUpload: string,
  replacements: SourceReplacement[]
): Promise<{ blob: Blob; downloadName: string }> {
  const fd = new FormData();
  if (file instanceof File) {
    fd.append("file", file, file.name);
  } else {
    fd.append("file", file, filenameForUpload);
  }
  fd.append("patch", JSON.stringify({ replacements }));
  const res = await fetch(apiUrl("/api/layered/export/revised-source"), {
    method: "POST",
    body: fd,
  });
  if (!res.ok) throw new Error((await res.text()) || res.statusText);
  const blob = await res.blob();
  const downloadName =
    filenameFromContentDisposition(res.headers.get("Content-Disposition")) ?? "revised-document";
  return { blob, downloadName };
}
