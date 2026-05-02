import type {
  DesignConsistencyAndCompleteness,
  IdConsistencyWarning,
  DimensionStatus,
  IncoseDimension,
  QualityCategoryResult,
  RequirementFinding,
  RequirementType,
  RequirementsAnalyzeOptions,
  RequirementsAnalyzeResponse,
  RequirementsConflict,
  StructuralIntelligenceLayer,
  RequirementGraph,
  GapRiskAnalysis,
  RequirementInvariant,
  ViolationScenario,
  GapRiskFinding,
  RequirementManagementTool,
} from "../models/requirements";
import { buildRequirementGraph } from "./requirementGraphService";
import { classifyRequirementType } from "./requirementTypeDesignator";
import { computeDCTE } from "./deltaConstraintTriangulationService";

type ParsedReq = {
  id: string;
  text: string;
  hasExplicitId: boolean;
};

const ambiguousTerms = [
  "fast",
  "quick",
  "slow",
  "user-friendly",
  "easy",
  "intuitive",
  "as soon as possible",
  "timely",
  "sufficient",
  "adequate",
  "appropriate",
  "robust",
  "reliable",
  "minimize",
  "maximize",
  "optimize",
  "normal",
  "etc",
];

const weakModalTerms = ["should", "may", "could", "might"];

const unitRegex =
  /\b\d+(?:\.\d+)?\s*(ms|s|sec|secs|seconds|min|mins|h|hz|khz|mhz|%|percent|v|a|ma|w|kw|mw|n|kn|lbf|pa|kpa|mpa|bar|psi|c|°c|mm|cm|m|in|ft|kg|g|lb|nm|rpm)\b/i;

// Default explicit requirement ID pattern at the start of a line, e.g. "FR-3:", "REQ-001.", "SR 10) text".
const DEFAULT_REQ_ID_REGEX =
  /^\s*([A-Z]{2,10}[-_ ]?\d{1,6}|REQ[-_ ]?\d{1,6}|SR[-_ ]?\d{1,6})\s*(?:[:.)-]\s*)?(.*)$/i;

/** Tool-specific requirement ID patterns for document analysis. */
export function getRequirementIdRegex(tool: RequirementManagementTool | undefined): RegExp {
  if (!tool || tool === "generic") return DEFAULT_REQ_ID_REGEX;

  if (tool === "doors") {
    // DOORS-style: must start with letters; allow multiple segments; must contain digits; not pure numbers.
    // Examples: SRS_REQ_001, REQ-001, DOORS_1234, SRS-REQ-12-3
    return /^\s*([A-Z][A-Z0-9]*(?:[-_][A-Z0-9]+)*[-_]\d{1,6}(?:[-_]\d{1,6})*)\s*(?:[:.)-]\s*)?(.*)$/i;
  }

  if (tool === "polarion") {
    // Polarion typical: KEY-123 (usually dash required).
    return /^\s*([A-Z][A-Z0-9]{1,19}-\d{1,8})\s*(?:[:.)-]\s*)?(.*)$/i;
  }

  if (tool === "jama") {
    // Jama: can be KEY-123, or numeric item ids, or hierarchical "1.2.3"
    return /^\s*([A-Z][A-Z0-9]{1,19}-\d{1,8}|\d+|\d+(?:\.\d+)*)\s*(?:[:.)-]\s*)?(.*)$/i;
  }

  return DEFAULT_REQ_ID_REGEX;
}

/** Line looks like the start of a new requirement. Permissive to support DOORS (1.1.2), Polarion/Jama (KEY-123), and generic (FR-3). */
const requirementStartRegex =
  /^\s*(?:[A-Z]{2,10}[-_ ]?\d{1,6}|REQ[-_ ]?\d{1,6}|SR[-_ ]?\d{1,6}|\d+(?:\.\d+)*|[A-Z][A-Z0-9]{1,19}[-_]?\d{1,8})\s*(?:[:.)-]\s+|\s+)\S|^\s*\d+(?:\.\d+)*[.)]\s+\S|^\s*The\s+\w+\s+shall\b|^\s*(?:System|Controller|Software|Hardware|Operator|User|Vehicle|ECU|Module)\s+shall\b/i;

function normalizeWhitespace(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

function computeStructuralIntelligence(
  findings: RequirementFinding[],
  _graph: RequirementGraph | undefined
): StructuralIntelligenceLayer {
  // Currently no structural intelligence metrics enabled; reserved for future use.
  return {};
}

function synthesizeInvariants(findings: RequirementFinding[]): RequirementInvariant[] {
  const invariants: RequirementInvariant[] = [];
  let counter = 1;

  for (const f of findings) {
    const t = f.text;
    const lower = t.toLowerCase();

    // Max bound invariants (speed, rate, pressure, etc.)
    if (/\b(max(?:imum)?|shall not exceed|no more than)\b/i.test(t) && /\d/.test(t)) {
      invariants.push({
        id: `INV-${counter++}`,
        invariantType: "max_bound",
        expression: t,
        sourceRequirementIds: [f.id],
        notes: "Maximum bound inferred from requirement text.",
      });
    }

    // Stopping distance constraints
    if (/\bstopping distance\b|\bstop within\b/i.test(t)) {
      invariants.push({
        id: `INV-${counter++}`,
        invariantType: "stopping_distance",
        expression: t,
        sourceRequirementIds: [f.id],
        notes: "Stopping distance constraint inferred.",
      });
    }

    // Timeout guarantees / latency bounds
    if (/\btimeout\b|\bwithin\s+\d+(?:\.\d+)?\s*(ms|s|seconds)\b/i.test(t)) {
      invariants.push({
        id: `INV-${counter++}`,
        invariantType: "timeout",
        expression: t,
        sourceRequirementIds: [f.id],
        notes: "Timeout / timing guarantee inferred.",
      });
    }

    // Sensor availability dependencies (GNSS, GPS, radar, camera, etc.)
    if (/\bgnss\b|\bgps\b|\bradar\b|\blidar\b|\bcamera\b|\bsensor\b/i.test(t)) {
      invariants.push({
        id: `INV-${counter++}`,
        invariantType: "sensor_dependency",
        expression: t,
        sourceRequirementIds: [f.id],
        notes: "Sensor availability / dependency inferred.",
      });
    }

    // Authority gating logic (manual/auto, operator vs system)
    if (
      /\bmanual\b|\bautomatic\b|\bauto\b|\boverride\b|\bauthority\b|\boperator\b/i.test(
        t
      )
    ) {
      invariants.push({
        id: `INV-${counter++}`,
        invariantType: "authority_gating",
        expression: t,
        sourceRequirementIds: [f.id],
        notes: "Authority / mode gating logic inferred.",
      });
    }

    // Safety guard constraints (safe state, fail-safe, hazard mitigation)
    if (/\bsafe state\b|\bfail[- ]?safe\b|\bhazard\b|\bmitigat/i.test(t)) {
      invariants.push({
        id: `INV-${counter++}`,
        invariantType: "safety_guard",
        expression: t,
        sourceRequirementIds: [f.id],
        notes: "Safety guard / mitigation invariant inferred.",
      });
    }
  }

  return invariants;
}

function simulateViolations(
  invariants: RequirementInvariant[],
  findings: RequirementFinding[]
): { scenarios: ViolationScenario[]; findings: GapRiskFinding[] } {
  const scenarios: ViolationScenario[] = [];
  const riskFindings: GapRiskFinding[] = [];
  let scenCounter = 1;
  let gapCounter = 1;

  const texts = findings.map((f) => ({ id: f.id, text: f.text.toLowerCase() }));

  const hasMitigationFor = (keywords: string[]): string[] => {
    const ids: string[] = [];
    for (const { id, text } of texts) {
      const matchesAll = keywords.every((k) => text.includes(k));
      const hasFallback =
        /\bfallback\b|\bdegrad|\bsafe state\b|\bfail[- ]?safe\b|\bshutdown\b|\balert\b|\balarm\b|\bgraceful\b/.test(
          text
        );
      if (matchesAll && hasFallback) ids.push(id);
    }
    return Array.from(new Set(ids));
  };

  for (const inv of invariants) {
    const baseId = inv.id;
    if (inv.invariantType === "max_bound") {
      const scenId = `SCEN-${scenCounter++}`;
      const supporting = hasMitigationFor(["speed", "exceed"]);
      const hasDefined = supporting.length > 0;
      scenarios.push({
        id: scenId,
        invariantId: baseId,
        description: "Value exceeds declared maximum bound (e.g., speed or rate spike).",
        hasDefinedBehavior: hasDefined,
        supportingRequirementIds: supporting,
        riskTags: hasDefined ? [] : ["unbounded_invariant", "unsafe_state"],
      });
      if (!hasDefined) {
        riskFindings.push({
          id: `GAP-${gapCounter++}`,
          severity: "high",
          message:
            "Maximum bound invariant appears unprotected: no explicit behavior defined when the bound is violated.",
          invariantId: baseId,
          scenarioId: scenId,
          relatedRequirementIds: inv.sourceRequirementIds,
          tags: ["unbounded_invariant", "unsafe_state_reachable"],
        });
      }
    } else if (inv.invariantType === "timeout") {
      const scenId = `SCEN-${scenCounter++}`;
      const supporting = hasMitigationFor(["timeout"]);
      const hasDefined = supporting.length > 0;
      scenarios.push({
        id: scenId,
        invariantId: baseId,
        description: "Operation exceeds the specified timeout / response window.",
        hasDefinedBehavior: hasDefined,
        supportingRequirementIds: supporting,
        riskTags: hasDefined ? [] : ["no_timeout_response"],
      });
      if (!hasDefined) {
        riskFindings.push({
          id: `GAP-${gapCounter++}`,
          severity: "medium",
          message:
            "Timeout invariant has no clear response behavior when the timeout is exceeded.",
          invariantId: baseId,
          scenarioId: scenId,
          relatedRequirementIds: inv.sourceRequirementIds,
          tags: ["timeout_response_undefined"],
        });
      }
    } else if (inv.invariantType === "sensor_dependency") {
      const scenId = `SCEN-${scenCounter++}`;
      const supporting = hasMitigationFor(["loss", "sensor"]);
      const hasDefined = supporting.length > 0;
      scenarios.push({
        id: scenId,
        invariantId: baseId,
        description:
          "Sensor (e.g., GNSS, radar, camera) becomes unavailable, degraded, or inconsistent.",
        hasDefinedBehavior: hasDefined,
        supportingRequirementIds: supporting,
        riskTags: hasDefined ? [] : ["no_degradation", "unsafe_state"],
      });
      if (!hasDefined) {
        riskFindings.push({
          id: `GAP-${gapCounter++}`,
          severity: "high",
          message:
            "Sensor dependency invariant has no explicit degradation or fallback strategy when the sensor is lost or degraded.",
          invariantId: baseId,
          scenarioId: scenId,
          relatedRequirementIds: inv.sourceRequirementIds,
          tags: ["no_degradation_strategy_defined"],
        });
      }
    } else if (inv.invariantType === "authority_gating") {
      const scenId = `SCEN-${scenCounter++}`;
      const supporting = hasMitigationFor(["transition"]);
      const hasDefined = supporting.length > 0;
      scenarios.push({
        id: scenId,
        invariantId: baseId,
        description:
          "Ambiguous transition between operator and system authority (e.g., manual ↔ auto).",
        hasDefinedBehavior: hasDefined,
        supportingRequirementIds: supporting,
        riskTags: hasDefined ? [] : ["unspecified_authority_transition"],
      });
      if (!hasDefined) {
        riskFindings.push({
          id: `GAP-${gapCounter++}`,
          severity: "medium",
          message:
            "Authority gating logic is present but no explicit authority transition behavior is defined.",
          invariantId: baseId,
          scenarioId: scenId,
          relatedRequirementIds: inv.sourceRequirementIds,
          tags: ["authority_transition_unspecified"],
        });
      }
    } else if (inv.invariantType === "stopping_distance" || inv.invariantType === "safety_guard") {
      const scenId = `SCEN-${scenCounter++}`;
      const supporting = hasMitigationFor(["safe state"]);
      const hasDefined = supporting.length > 0;
      scenarios.push({
        id: scenId,
        invariantId: baseId,
        description:
          "Vehicle cannot meet stopping distance / safety guard constraint under worst-case conditions.",
        hasDefinedBehavior: hasDefined,
        supportingRequirementIds: supporting,
        riskTags: hasDefined ? [] : ["unsafe_state"],
      });
      if (!hasDefined) {
        riskFindings.push({
          id: `GAP-${gapCounter++}`,
          severity: "high",
          message:
            "Safety-related invariant has no clearly defined safe state or mitigation when the constraint is violated.",
          invariantId: baseId,
          scenarioId: scenId,
          relatedRequirementIds: inv.sourceRequirementIds,
          tags: ["unsafe_state_reachable", "no_safe_state_defined"],
        });
      }
    }
  }

  return { scenarios, findings: riskFindings };
}

function computeGapRiskAnalysis(findings: RequirementFinding[]): GapRiskAnalysis {
  const invariants = synthesizeInvariants(findings);
  const { scenarios, findings: gaps } = simulateViolations(invariants, findings);
  return {
    invariants,
    scenarios,
    findings: gaps,
  };
}

/**
 * Segment raw text into requirement blocks. Uses tool-specific ID detection when tool is set.
 */
function segmentIntoRequirementBlocks(
  rawText: string,
  tool?: RequirementManagementTool
): string[] {
  const idRegex = getRequirementIdRegex(tool ?? "generic");
  const lines = rawText.split(/\r?\n/).map((l) => l.trim());
  const blocks: string[] = [];
  let current: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.length === 0) {
      if (current.length > 0) {
        blocks.push(current.join(" "));
        current = [];
      }
      continue;
    }
    const hasShall = /\bshall\b/i.test(line);
    const currentText = current.length > 0 ? current.join(" ") : "";
    const currentHasShall = /\bshall\b/i.test(currentText);
    const prevLooksLikeIdHeader =
      current.length > 0 && idRegex.test(currentText) && !currentHasShall;

    if (prevLooksLikeIdHeader && (hasShall || requirementStartRegex.test(line))) {
      current.push(line);
      continue;
    }

    const isRequirementStart =
      requirementStartRegex.test(line) ||
      (hasShall && current.length > 0 && !currentHasShall);
    if (isRequirementStart && current.length > 0) {
      blocks.push(current.join(" "));
      current = [line];
    } else if (isRequirementStart) {
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) blocks.push(current.join(" "));

  return splitBlocksOnInlineRequirementIds(blocks, tool);
}

/**
 * Match requirement-like IDs in the middle of a block so we can split merged paragraphs.
 * IMPORTANT: Do not treat bare integers (e.g. "50" in "within 50 ms") as IDs — that used to
 * tear numeric thresholds off the requirement text. Hierarchical refs still match via dotted forms.
 */
const INLINE_REQUIREMENT_ID_REGEX =
  /\b(FR|REQ|SR|PR|[A-Z]{2,6})[-_]?\d{1,6}\b|\b\d+\.\d+(?:\.\d+)*\b|\b[A-Z][A-Z0-9]{1,19}[-_]?\d{1,8}\b/gi;

/**
 * Split blocks that contain a requirement ID in the middle.
 */
function splitBlocksOnInlineRequirementIds(
  blocks: string[],
  _tool?: RequirementManagementTool
): string[] {
  const result: string[] = [];
  for (const block of blocks) {
    const trimmed = normalizeWhitespace(block);
    let lastEnd = 0;
    let found = false;
    INLINE_REQUIREMENT_ID_REGEX.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = INLINE_REQUIREMENT_ID_REGEX.exec(trimmed)) !== null) {
      const pos = m.index;
      // Only split when the ID is not at the very start; if it's at index 0
      // the block already begins with an ID and should be handled as-is.
      if (pos === 0) continue;
      const before = trimmed.slice(lastEnd, pos).trim();
      if (before.length > 0) result.push(before);
      lastEnd = pos;
      found = true;
    }
    if (found && lastEnd < trimmed.length) result.push(trimmed.slice(lastEnd).trim());
    if (!found) result.push(trimmed);
  }
  return result.length > 0 ? result : blocks;
}

/** Common spec section headers – not requirements. Block is skipped if it starts with one of these. */
const SECTION_HEADER_STARTS = [
  /^\s*title\b/i,
  /^\s*purpose\s+and\s+scope\b/i,
  /^\s*purpose\b/i,
  /^\s*scope\b/i,
  /^\s*definitions\s+and\s+acronyms\b/i,
  /^\s*definitions\b/i,
  /^\s*acronyms\b/i,
  /^\s*abbreviations\s+and\s+acronyms\b/i,
  /^\s*abbreviations\b/i,
  /^\s*system\s+overview\b/i,
  /^\s*operational\s+design\s+domain\b/i,
  /^\s*odd\b/i,
  /^\s*references?\b/i,
  /^\s*document\s+control\b/i,
  /^\s*introduction\b/i,
  /^\s*overview\b/i,
  /^\s*applicability\b/i,
];

/** Multi-word phrases that indicate a section header near start of block (catches misspellings like "Opertaional Design Domain"). Checked only in first 80 chars. Single words omitted to avoid skipping requirements that start with "Overview" etc. */
const SECTION_HEADER_PHRASES = [
  "design domain",
  "system overview",
  "definitions and acronyms",
  "abbreviations and acronyms",
  "purpose and scope",
  "document control",
];

const SECTION_HEADER_PHRASE_LOOKUP_LEN = 80;

/**
 * Never treat a block as a section header if it contains requirement language
 * (shall/must); otherwise we drop requirements that were merged with a section
 * title (e.g. "6. Operational Design Domain ... The system shall ...").
 */
function isSectionHeader(trimmed: string): boolean {
  if (/\bshall\b|\bmust\b/i.test(trimmed)) return false;
  const t = trimmed.slice(0, 120);
  const withoutNumber = t.replace(/^\s*\d+(?:\.\d+)*[.)]\s*/, "").toLowerCase();
  const startOnly = withoutNumber.slice(0, SECTION_HEADER_PHRASE_LOOKUP_LEN);
  for (const p of SECTION_HEADER_STARTS) {
    if (p.test(t) || p.test(withoutNumber)) return true;
  }
  for (const phrase of SECTION_HEADER_PHRASES) {
    if (startOnly.includes(phrase)) return true;
  }
  if (startOnly.includes("operat") && startOnly.includes("domain")) return true;
  const d = startOnly.indexOf("design");
  if (d >= 0 && startOnly.indexOf("domain", d) >= 0) return true;
  return false;
}

/** Max length for a block to be treated as a section header by length alone (no shall/must). Catches misspelled titles. */
const SHORT_SECTION_THRESHOLD = 55;

/** Only blocks that have explicit requirement ID or contain shall/must (and are not section headers). */
function looksLikeRequirement(
  trimmed: string,
  tool?: RequirementManagementTool
): boolean {
  if (trimmed.length === 0) return false;
  const idRegex = getRequirementIdRegex(tool ?? "generic");
  const explicitId = idRegex.test(trimmed);
  const words = trimmed.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  // Never treat 1–2 word blocks as requirements unless they start with an explicit ID.
  if (!explicitId && wordCount <= 2) return false;

  const hasRequirementLanguage = explicitId || /\bshall\b|\bmust\b/i.test(trimmed);

  // Short blocks without requirement language are never requirements (handles titles, units, single words like "Hz", "limits", "stop", "ODD").
  if (trimmed.length <= SHORT_SECTION_THRESHOLD && !hasRequirementLanguage) return false;
  const first50 = trimmed.slice(0, 50).toLowerCase();
  if (!hasRequirementLanguage && first50.indexOf("design") >= 0 && first50.indexOf("domain", first50.indexOf("design")) >= 0) return false;
  if (isSectionHeader(trimmed)) return false;
  if (hasRequirementLanguage) return true;
  return false;
}

/** Exported for layered platform: parse raw spec text into requirement lines before canonical normalization. */
export function parseRequirements(rawText: string, options?: RequirementsAnalyzeOptions): ParsedReq[] {
  const tool = options?.requirementManagementTool ?? "generic";

  // DOORS: Many exports are table-like with columns (Requirement ID, Text, ... Verification Method).
  // In that case each non-header row is a single requirement with ID and text on the same line.
  if (tool === "doors") {
    const doorsParsed = parseDoorsRequirements(rawText);
    // If DOORS-specific parsing failed to find any requirements (e.g. header not recognized),
    // fall back to the generic pipeline so the user still gets results.
    if (doorsParsed.length > 0) return doorsParsed;
  }

  const idRegex = getRequirementIdRegex(tool);
  const blocks = segmentIntoRequirementBlocks(rawText, tool);
  const parsed: ParsedReq[] = [];
  let auto = 1;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!;
    let trimmed = normalizeWhitespace(block);
    if (trimmed.length === 0) continue;

    // DOORS: treat pure object IDs (e.g. "REQ_1234") as headers if they have no shall/must and
    // no additional text; the following block with shall/must carries the actual requirement.
    if (
      tool === "doors" &&
      /^\s*[A-Z][A-Z0-9_]{1,14}[-_]\d{1,6}\s*[:.)-]*$/i.test(trimmed) &&
      !/\b(shall|must)\b/i.test(trimmed) &&
      i + 1 < blocks.length
    ) {
      const nextTrimmed = normalizeWhitespace(blocks[i + 1] ?? "");
      if (nextTrimmed.length > 0 && looksLikeRequirement(nextTrimmed, tool)) {
        const headerMatch = trimmed.match(getRequirementIdRegex(tool));
        const id = normalizeIdFromMatch(headerMatch?.[1], tool);
        parsed.push({
          id,
          text: nextTrimmed,
          hasExplicitId: true,
        });
        i += 1;
        continue;
      }
      // Header line without usable next requirement; skip.
      continue;
    }

    const idHeaderMatch = trimmed.match(idRegex);
    const hasShallOrMust = /\b(shall|must)\b/i.test(trimmed);
    const idHeaderText = idHeaderMatch?.[2]?.trim() ?? "";
    const isIdHeaderOnly = !!idHeaderMatch && !hasShallOrMust && idHeaderText.length === 0;

    if (isIdHeaderOnly && i + 1 < blocks.length) {
      const nextTrimmed = normalizeWhitespace(blocks[i + 1] ?? "");
      if (nextTrimmed.length > 0 && !idRegex.test(nextTrimmed) && looksLikeRequirement(nextTrimmed, tool)) {
        const id = normalizeIdFromMatch(idHeaderMatch![1], tool);
        parsed.push({
          id,
          text: nextTrimmed,
          hasExplicitId: true,
        });
        i += 1;
        continue;
      }
    }

    if (!looksLikeRequirement(trimmed, tool)) continue;

    const m = trimmed.match(idRegex);
    if (m) {
      const id = normalizeIdFromMatch(m[1], tool);
      const text = normalizeWhitespace(m[2] ?? "");
      parsed.push({
        id: id.length > 0 ? id : `REQ-AUTO-${String(auto).padStart(3, "0")}`,
        text: text.length > 0 ? text : trimmed,
        hasExplicitId: true,
      });
    } else {
      const id = `REQ-AUTO-${String(auto).padStart(3, "0")}`;
      auto += 1;
      parsed.push({ id, text: trimmed, hasExplicitId: false });
    }
  }

  return parsed;
}

// --- DOORS table parser: reliably associates Requirement ID ↔ full Requirement Statement.
// - Works with tab-delimited DOORS exports AND fixed-width / space-aligned exports.
// - Does NOT hard-code specific column titles (uses keyword-family detection).
// - Learns column boundaries from the header (character offsets for fixed-width), so internal
//   double-spaces in the statement (e.g. "± 5 cm") do NOT truncate text.
// - Supports continuation rows (blank ID but statement continues).

type ColKind = "id" | "statement" | "title" | "verification" | "other";

type HeaderCol = {
  kind: ColKind;
  start: number;
  label: string;
};

function classifyHeaderLabel(label: string): ColKind {
  const l = label.toLowerCase();
  if (/\b(req(uire)?ment)?\s*id\b/.test(l) || /\bidentifier\b/.test(l) || /\bobject\s*id\b/.test(l) || l === "id") return "id";
  if (/\b(requirement\s*)?statement\b/.test(l) || /\b(text|description|content)\b/.test(l)) return "statement";
  if (/\b(title|name)\b/.test(l)) return "title";
  if (/\b(verif(y|ication)|test|method|verification\s*method)\b/.test(l)) return "verification";
  return "other";
}

function parseDoorsHeaderColumns(headerLine: string): { delimiter: "tab" | "fixed"; cols: HeaderCol[] } | null {
  const line = headerLine ?? "";
  if (!line.trim()) return null;

  if (line.includes("\t")) {
    const parts = line.split("\t");
    const cols: HeaderCol[] = [];
    let cursor = 0;
    for (const part of parts) {
      const idx = line.indexOf(part, cursor);
      const start = idx >= 0 ? idx : cursor;
      cursor = start + part.length + 1;
      const label = normalizeWhitespace(part);
      if (!label) continue;
      cols.push({ kind: classifyHeaderLabel(label), start, label });
    }
    if (!cols.some((c) => c.kind === "id") || !cols.some((c) => c.kind === "statement")) return null;
    return { delimiter: "tab", cols };
  }

  const cols: HeaderCol[] = [];
  const re = /\s{2,}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const end = m.index;
    const seg = line.slice(last, end);
    const label = normalizeWhitespace(seg);
    if (label) cols.push({ kind: classifyHeaderLabel(label), start: last, label });
    last = end + m[0].length;
  }
  const tail = normalizeWhitespace(line.slice(last));
  if (tail) cols.push({ kind: classifyHeaderLabel(tail), start: last, label: tail });

  if (!cols.some((c) => c.kind === "id") || !cols.some((c) => c.kind === "statement")) return null;
  return { delimiter: "fixed", cols };
}

function sliceFixedCell(line: string, start: number, end?: number): string {
  const raw = line.slice(start, end ?? line.length);
  return normalizeWhitespace(raw);
}

function findDoorsHeaderIndex(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    const candidate = lines[i] ?? "";
    if (parseDoorsHeaderColumns(candidate)) return i;
  }
  return -1;
}

function kindsFromTabHeader(headerLine: string): ColKind[] {
  return headerLine
    .split("\t")
    .map((p) => normalizeWhitespace(p))
    .map((p) => classifyHeaderLabel(p));
}

function parseDoorsRequirements(rawText: string): ParsedReq[] {
  const lines = rawText.split(/\r?\n/);
  const parsed: ParsedReq[] = [];

  const headerIndex = findDoorsHeaderIndex(lines);
  if (headerIndex === -1) return [];

  const headerLine = lines[headerIndex] ?? "";
  const header = parseDoorsHeaderColumns(headerLine);
  if (!header) return [];

  const idHeaderCol = header.cols.find((c) => c.kind === "id");
  const stmtHeaderCol = header.cols.find((c) => c.kind === "statement");
  const titleHeaderCol = header.cols.find((c) => c.kind === "title");
  const verifHeaderCol = header.cols.find((c) => c.kind === "verification");

  if (!idHeaderCol || !stmtHeaderCol) return [];

  const sortedByStart = [...header.cols].sort((a, b) => a.start - b.start);
  const nextStart = (start: number): number | undefined => {
    const idx = sortedByStart.findIndex((c) => c.start === start);
    if (idx >= 0 && idx + 1 < sortedByStart.length) return sortedByStart[idx + 1]!.start;
    return undefined;
  };

  const idStart = idHeaderCol.start;
  const idEndFixed = nextStart(idStart);
  const stmtStart = stmtHeaderCol.start;
  const stmtEndFixed = verifHeaderCol && verifHeaderCol.start > stmtStart ? verifHeaderCol.start : undefined;
  const titleStart = titleHeaderCol?.start;
  const titleEndFixed = titleStart !== undefined ? nextStart(titleStart) : undefined;

  let tabIdIndex = -1;
  let tabStmtIndex = -1;
  let tabTitleIndex = -1;

  if (header.delimiter === "tab") {
    const parts = headerLine.split("\t").map((p) => normalizeWhitespace(p));
    const kinds = parts.map((p) => classifyHeaderLabel(p));
    tabIdIndex = kinds.findIndex((k) => k === "id");
    tabStmtIndex = kinds.findIndex((k) => k === "statement");
    tabTitleIndex = kinds.findIndex((k) => k === "title");
    if (tabIdIndex === -1 || tabStmtIndex === -1) return [];
  }

  const rows = lines.slice(headerIndex + 1);
  let lastReq: (ParsedReq & { idRaw?: string; title?: string }) | null = null;

  for (const rawLine of rows) {
    if (!rawLine || !rawLine.trim()) continue;

    let idCell = "";
    let titleCell = "";
    let stmtCell = "";

    const isTabbedRow = rawLine.includes("\t");

    if (isTabbedRow && header.delimiter === "tab") {
      const cols = rawLine.split("\t").map((c) => normalizeWhitespace(c));

      idCell = cols[tabIdIndex] ?? "";
      titleCell = tabTitleIndex >= 0 ? (cols[tabTitleIndex] ?? "") : "";

      let end = cols.length;
      const verifTabIndex = kindsFromTabHeader(headerLine).findIndex((k) => k === "verification");
      if (verifTabIndex >= 0 && verifTabIndex > tabStmtIndex) end = Math.min(end, verifTabIndex);

      stmtCell =
        cols.length <= tabStmtIndex
          ? ""
          : normalizeWhitespace(cols.slice(tabStmtIndex, end).join(" "));
    } else {
      idCell = sliceFixedCell(rawLine, idStart, idEndFixed);
      if (titleStart !== undefined) titleCell = sliceFixedCell(rawLine, titleStart, titleEndFixed);
      stmtCell = sliceFixedCell(rawLine, stmtStart, stmtEndFixed);

      if (!stmtCell && rawLine.length < stmtStart) {
        stmtCell = normalizeWhitespace(rawLine);
      }
    }

    if (!idCell && !stmtCell && !titleCell) continue;

    if (!idCell && lastReq && stmtCell) {
      lastReq.text = normalizeWhitespace(`${lastReq.text} ${stmtCell}`);
      continue;
    }

    if (!idCell || !stmtCell) continue;

    if (!/\b(shall|must)\b/i.test(stmtCell)) continue;

    const idNorm = normalizeIdFromMatch(idCell, "doors");
    if (!idNorm) continue;

    const req: ParsedReq & { idRaw?: string; title?: string } = {
      id: idNorm,
      text: stmtCell,
      hasExplicitId: true,
      idRaw: idCell,
      ...(titleCell ? { title: titleCell } : {}),
    };

    parsed.push(req);
    lastReq = req;
  }

  return parsed;
}

function normalizeIdFromMatch(capture: string | undefined, tool: RequirementManagementTool): string {
  const raw = normalizeWhitespace(capture ?? "").replace(/\s+/g, "-");
  if (tool === "doors" && /^\d+(?:\.\d+)*$/.test(raw)) return raw; // keep hierarchical number as-is
  return raw.toUpperCase();
}

function initDimensions(): Record<IncoseDimension, DimensionStatus> {
  return {
    correct: "warn",
    unambiguous: "pass",
    complete: "warn",
    consistent: "pass",
    feasible: "warn",
    verifiable: "warn",
    singular: "pass",
    traceable: "pass",
  };
}

function addIssue(f: RequirementFinding, msg: string) {
  f.issues.push(msg);
}

function toCategoryResult(issues: string[]): QualityCategoryResult {
  const status =
    issues.some((i) => i.startsWith("Fail:") || i.toLowerCase().includes("must "))
      ? "fail"
      : issues.length > 0
        ? "warn"
        : "pass";
  return { status, issues };
}

/** Stage 1 – Linguistic quality checks */
function runLinguisticChecks(text: string): QualityCategoryResult {
  const issues: string[] = [];
  const lower = text.toLowerCase();

  // Passive voice: "shall be <past participle>" or "is/are <past participle>"
  if (/\bshall\s+be\s+\w+ed\b/i.test(text) || /\b(is|are|was|were)\s+\w+ed\b/i.test(text)) {
    issues.push("Passive voice detected; prefer active voice for clarity (e.g. 'The system shall display' not 'shall be displayed').");
  }

  // Vague pronouns
  if (/\b(it|they|this|that)\s+(shall|must|will|should|may)\b/i.test(text)) {
    issues.push("Unclear reference: avoid 'it'/'they'/'this'/'that' with requirement verbs; specify the subject.");
  }
  if (/\b(it|they)\s+(is|are|was|were)\s+/i.test(text)) {
    issues.push("Unclear reference: replace 'it'/'they' with the explicit subject.");
  }

  // Long sentence (roughly > 25 words)
  const wordCount = text.split(/\s+/).length;
  if (wordCount > 25) {
    issues.push(`Long requirement (${wordCount} words); consider splitting for clarity and testability.`);
  }

  // Negative formulation without exception
  if (/\bshall\s+not\b/i.test(text) && !/\b(except|unless|when)\b/i.test(text)) {
    issues.push("Negative requirement ('shall not'); ensure exception cases are stated if needed.");
  }

  return toCategoryResult(issues);
}

/** Stage 1 – Measurability validation (numeric/unit not required for functional requirements) */
function runMeasurabilityValidation(
  text: string,
  _finding: RequirementFinding,
  requirementType?: RequirementType
): QualityCategoryResult {
  const issues: string[] = [];
  const hasNumber = /\d+(?:\.\d+)?/.test(text);
  const hasUnit = unitRegex.test(text);
  const hasShallOrMust = /\b(shall|must)\b/i.test(text);
  const isFunctional = requirementType === "functional";

  if (!hasShallOrMust) {
    issues.push("Measurability: requirement does not use 'shall' or 'must'; add measurable obligation.");
  }
  if (!isFunctional && hasShallOrMust && !hasNumber && !hasUnit) {
    issues.push("Measurability: no numeric value or unit found; add a measurable threshold (e.g. time, %, range).");
  }
  if (hasNumber && !hasUnit) {
    const withUnit = text.match(/\d+(?:\.\d+)?\s*(?![a-z])/i);
    if (withUnit) {
      issues.push("Measurability: numeric value should include a unit (e.g. ms, bar, %, mm) for testability.");
    }
  }
  if (!isFunctional && hasUnit && !text.match(/\b(tolerance|±|range|min|max|maximum|minimum)\b/i)) {
    issues.push("Measurability: consider stating tolerance or acceptable range for the measured value.");
  }

  return toCategoryResult(issues);
}

/** Stage 1 – Embedded-specific rule enforcement */
function runEmbeddedRules(text: string): QualityCategoryResult {
  const issues: string[] = [];
  const lower = text.toLowerCase();

  // Real-time / timing: should have numeric constraint
  const timingKeywords = ["latency", "deadline", "response time", "jitter", "period", "cycle time", "real-time", "realtime"];
  const hasTiming = timingKeywords.some((k) => lower.includes(k));
  if (hasTiming && !/\d+(?:\.\d+)?\s*(ms|s|µs|us|ns|hz|khz)\b/i.test(text)) {
    issues.push("Embedded: timing-related requirement should specify a numeric value and unit (e.g. ms, Hz).");
  }

  // Resource: memory/CPU often need limits
  const resourceKeywords = ["memory", "ram", "cpu", "storage", "buffer"];
  const hasResource = resourceKeywords.some((k) => lower.includes(k));
  if (hasResource && !/\d+(?:\.\d+)?\s*(kb|mb|gb|%|mips|mhz)\b/i.test(text)) {
    issues.push("Embedded: resource requirement should specify a limit (e.g. KB, MB, %, MHz).");
  }

  // Safety: fail-safe, SIL, ASIL – recommend explicit level or behavior
  if (/\b(fail-safe|failsafe|safety|sil|asil|malfunction)\b/i.test(text)) {
    if (!/\b(sil\s*\d|asil\s*[a-d]|shall\s+detect|shall\s+enter|safe\s+state)\b/i.test(text)) {
      issues.push("Embedded: safety-related requirement should specify detection/response or integrity level (e.g. SIL, ASIL).");
    }
  }

  // Determinism / ordering
  if (/\b(deterministic|determinism|order|sequence)\b/i.test(text) && !/\b(shall|must)\b/i.test(text)) {
    issues.push("Embedded: determinism/ordering should be stated as a verifiable 'shall' or 'must'.");
  }

  return toCategoryResult(issues);
}

function containsWord(haystack: string, needle: string) {
  const re = new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\b`, "i");
  return re.test(haystack);
}

function generateSuggestion(
  text: string,
  finding: RequirementFinding,
  options: RequirementsAnalyzeOptions
): string {
  let suggestion = text;
  const lower = suggestion.toLowerCase();

  // Track what we've changed to avoid double-processing
  const changes: string[] = [];

  // 0. Handle multi-word and hyphenated ambiguous terms first (before word variations)
  if (lower.includes("user-friendly")) {
    suggestion = suggestion.replace(/user-friendly/gi, "[specify measurable usability criteria]");
    changes.push('Replaced "user-friendly" with measurable criteria');
  }
  if (lower.includes("as soon as possible")) {
    suggestion = suggestion.replace(/as soon as possible/gi, "within [specify time limit]");
    changes.push('Replaced "as soon as possible" with specific time limit');
  }

  // 1. Replace ambiguous terms with concrete suggestions
  // Handle word variations (quick/quickly, fast/faster, etc.)
  const wordVariations: Record<string, string[]> = {
    "quick": ["quick", "quickly", "quicker", "quickest"],
    "fast": ["fast", "faster", "fastest", "fastly"],
    "slow": ["slow", "slowly", "slower", "slowest"],
  };

  for (const term of ambiguousTerms) {
    const lowerTerm = term.toLowerCase();
    const variations = wordVariations[lowerTerm] || [lowerTerm];
    
    // Check if any variation exists in the text
    const foundVariation = variations.find((v) => {
      const re = new RegExp(`\\b${v.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}`, "i");
      return re.test(suggestion);
    });

    if (foundVariation) {
      const re = new RegExp(`\\b${foundVariation.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\w*\\b`, "gi");
      if (term === "fast" || term === "quick") {
        suggestion = suggestion.replace(re, "within [specify time, e.g., 50 ms]");
        changes.push(`Replaced "${foundVariation}" with measurable time threshold`);
      } else if (term === "slow") {
        suggestion = suggestion.replace(re, "exceeding [specify time, e.g., 100 ms]");
        changes.push(`Replaced "${foundVariation}" with measurable time threshold`);
      }
    } else if (lower.includes(term)) {
      // Handle hyphenated terms without word boundaries
      let re: RegExp;
      if (term.includes("-")) {
        re = new RegExp(term.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&"), "gi");
      } else {
        re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\b`, "gi");
      }
      if (term === "user-friendly" || term === "easy" || term === "intuitive") {
        suggestion = suggestion.replace(re, "[specify measurable usability criteria]");
        changes.push(`Replaced "${term}" with measurable criteria`);
      } else if (term === "as soon as possible" || term === "timely") {
        suggestion = suggestion.replace(re, "within [specify time limit]");
        changes.push(`Replaced "${term}" with specific time limit`);
      } else if (term === "sufficient" || term === "adequate") {
        suggestion = suggestion.replace(re, "[specify minimum value/quantity]");
        changes.push(`Replaced "${term}" with specific minimum`);
      } else if (term === "appropriate") {
        suggestion = suggestion.replace(re, "[specify criteria or range]");
        changes.push(`Replaced "${term}" with specific criteria`);
      } else if (term === "robust" || term === "reliable") {
        suggestion = suggestion.replace(re, "[specify reliability metric, e.g., 99.9% uptime]");
        changes.push(`Replaced "${term}" with reliability metric`);
      } else if (term === "minimize") {
        suggestion = suggestion.replace(re, "shall minimize to [specify target value]");
        changes.push(`Replaced "${term}" with specific minimization target`);
      } else if (term === "maximize") {
        suggestion = suggestion.replace(re, "shall maximize to [specify target value]");
        changes.push(`Replaced "${term}" with specific maximization target`);
      } else if (term === "optimize") {
        suggestion = suggestion.replace(re, "shall optimize [specify parameter] to [specify target]");
        changes.push(`Replaced "${term}" with specific optimization criteria`);
      } else if (term === "normal") {
        suggestion = suggestion.replace(re, "[specify normal operating conditions/range]");
        changes.push(`Replaced "${term}" with specific conditions`);
      } else if (term === "etc") {
        suggestion = suggestion.replace(re, "[list all items explicitly]");
        changes.push(`Replaced "${term}" with explicit list`);
      }
    }
  }

  // 2. Replace weak modals with "shall" (strict mode) - do this BEFORE checking for missing "shall"
  if (options.strictIncose ?? false) {
    for (const weak of weakModalTerms) {
      if (containsWord(suggestion.toLowerCase(), weak)) {
        const re = new RegExp(`\\b${weak}\\b`, "gi");
        suggestion = suggestion.replace(re, "shall");
        changes.push(`Replaced "${weak}" with "shall"`);
      }
    }
  }

  // 3. Ensure "shall" is present if missing (strict mode) - check AFTER replacing weak modals
  const hasShallAfterReplace = containsWord(suggestion.toLowerCase(), "shall");
  const hasMust = containsWord(suggestion.toLowerCase(), "must");
  if (!hasShallAfterReplace && !hasMust && (options.strictIncose ?? false)) {
    // Try to insert "shall" after common subjects
    const subjectMatch = suggestion.match(/^(the\s+(?:system|controller|software|hardware|operator|user))/i);
    if (subjectMatch) {
      suggestion = suggestion.replace(/^(the\s+\w+)/i, (match) => `${match} shall`);
      changes.push('Added "shall" after subject');
    } else if (!suggestion.toLowerCase().startsWith("the ")) {
      // If no clear subject, prepend "The system shall"
      suggestion = `The system shall ${suggestion.charAt(0).toLowerCase() + suggestion.slice(1)}`;
      changes.push('Added "The system shall" prefix');
    }
  }

  // 4. Add actor if missing
  const hasActor =
    suggestion.toLowerCase().includes("system") ||
    suggestion.toLowerCase().includes("operator") ||
    suggestion.toLowerCase().includes("user") ||
    suggestion.toLowerCase().includes("controller") ||
    suggestion.toLowerCase().includes("software") ||
    suggestion.toLowerCase().includes("hardware");
  
  if (!hasActor && finding.dimensions.complete === "warn") {
    if (!suggestion.toLowerCase().startsWith("the ")) {
      suggestion = `The system ${suggestion.charAt(0).toLowerCase() + suggestion.slice(1)}`;
      changes.push('Added "The system" as actor');
    }
  }

  // 5. Add numeric threshold if missing for verifiability
  const hasUnitNumber = unitRegex.test(suggestion);
  const lowerSuggestion = suggestion.toLowerCase();
  if (!hasUnitNumber && (finding.dimensions.verifiable === "warn" || finding.dimensions.verifiable === "fail")) {
    // Try to detect what kind of requirement it is and suggest appropriate units
    if (
      lowerSuggestion.includes("time") ||
      lowerSuggestion.includes("latency") ||
      lowerSuggestion.includes("delay") ||
      lowerSuggestion.includes("respond") ||
      lowerSuggestion.includes("response")
    ) {
      // Check if we already have a placeholder from ambiguous term replacement
      if (!lowerSuggestion.includes("[specify time")) {
        suggestion = suggestion.replace(/(\.|$)/, " within [specify time, e.g., 50 ms]$1");
        changes.push("Added time threshold placeholder");
      }
    } else if (lowerSuggestion.includes("pressure") || lowerSuggestion.includes("force")) {
      suggestion = suggestion.replace(/(\.|$)/, " at [specify value, e.g., 200 bar]$1");
      changes.push("Added pressure/force value placeholder");
    } else if (lowerSuggestion.includes("speed") || lowerSuggestion.includes("velocity")) {
      suggestion = suggestion.replace(/(\.|$)/, " of [specify value, e.g., 100 mm/s]$1");
      changes.push("Added speed value placeholder");
    } else if (lowerSuggestion.includes("temperature")) {
      suggestion = suggestion.replace(/(\.|$)/, " of [specify range, e.g., -20°C to 50°C]$1");
      changes.push("Added temperature range placeholder");
    } else if (lowerSuggestion.includes("availability") || lowerSuggestion.includes("uptime")) {
      suggestion = suggestion.replace(/(\.|$)/, " of [specify percentage, e.g., 99.9%]$1");
      changes.push("Added availability percentage placeholder");
    } else if (!lowerSuggestion.includes("[specify")) {
      // Only add generic placeholder if we haven't already added a specific one
      suggestion = suggestion.replace(/(\.|$)/, " [specify measurable criteria with units]$1");
      changes.push("Added generic measurable criteria placeholder");
    }
  }

  // 6. Fix feasibility issues (percentages > 100%)
  const percentMatches = [...suggestion.matchAll(/(\d+(?:\.\d+)?)\s*%/g)];
  for (const match of percentMatches) {
    const value = Number(match[1]);
    if (value > 100) {
      suggestion = suggestion.replace(match[0], "100%");
      changes.push(`Fixed percentage value from ${match[0]} to 100%`);
    }
  }

  // 7. Clean up multiple "shall" if singular issue detected
  if (finding.dimensions.singular === "warn") {
    const shallCount = (suggestion.match(/\bshall\b/gi) ?? []).length;
    if (shallCount >= 2) {
      // Note: This is a complex case - we'd ideally split, but for now just note it
      changes.push("Consider splitting into separate requirements");
    }
  }

  // If no changes were made but there are issues, provide a generic improvement note
  if (changes.length === 0 && finding.issues.length > 0) {
    return `${suggestion} [Review and add specific measurable criteria]`;
  }

  return suggestion;
}


function analyzeSingle(
  r: ParsedReq,
  options: RequirementsAnalyzeOptions
): RequirementFinding {
  const text = r.text;
  const lower = text.toLowerCase();

  const finding: RequirementFinding = {
    id: r.id,
    text,
    status: "needs_attention",
    dimensions: initDimensions(),
    issues: [],
  };

  // Traceable
  if (!r.hasExplicitId) {
    finding.dimensions.traceable = "warn";
    addIssue(finding, "Missing explicit requirement ID (generated one automatically).");
  } else {
    finding.dimensions.traceable = "pass";
  }

  // Unambiguous
  const hits: string[] = [];
  for (const term of ambiguousTerms) {
    if (lower.includes(term)) hits.push(term);
  }
  if (hits.length > 0) {
    finding.dimensions.unambiguous = "fail";
    addIssue(
      finding,
      `Ambiguous term(s): ${hits.map((h) => `"${h}"`).join(", ")}. Replace with measurable criteria.`
    );
  }

  // Complete (lightweight structure checks)
  const hasShall = containsWord(lower, "shall");
  const hasActor =
    lower.includes("system") ||
    lower.includes("operator") ||
    lower.includes("user") ||
    lower.includes("controller") ||
    lower.includes("software") ||
    lower.includes("hardware");

  if (!hasShall && (options.strictIncose ?? false)) {
    finding.dimensions.complete = "warn";
    addIssue(finding, 'Consider using "shall" to express a verifiable requirement.');
  }

  if (!hasActor) {
    finding.dimensions.complete = "warn";
    addIssue(finding, "Missing clear subject/actor (e.g., system/controller/user).");
  }

  // Requirement type designator (run early so we can relax numeric/unit checks for functional)
  const { type: requirementType, criteria: typeCriteria } = classifyRequirementType(text);
  finding.requirementType = requirementType;
  finding.typeCriteria = typeCriteria;

  // Verifiable (functional requirements do not require numeric values for pass)
  const hasUnitNumber = unitRegex.test(text);
  const looksLikeRequirement =
    hasShall ||
    /(must|will|shall not|must not|does not|do not)/i.test(text);

  if (!looksLikeRequirement) {
    finding.dimensions.verifiable = "fail";
    addIssue(
      finding,
      "Not written as a requirement statement (missing 'shall/must' style phrasing)."
    );
  } else if (hasUnitNumber || requirementType === "functional") {
    finding.dimensions.verifiable = "pass";
  } else {
    finding.dimensions.verifiable = "warn";
    addIssue(
      finding,
      "May be hard to verify (no numeric threshold/unit detected)."
    );
  }

  // Singular
  const hasAndOr = /\band\/or\b/i.test(text);
  const hasMultipleShall = (text.match(/\bshall\b/gi) ?? []).length >= 2;
  const hasJoiners = /\b(and|or)\b/i.test(text) && /,/.test(text);
  if (hasAndOr || hasMultipleShall || hasJoiners) {
    finding.dimensions.singular = "warn";
    addIssue(
      finding,
      "May contain multiple requirements in one statement; consider splitting."
    );
  }

  // Correct/Feasible (heuristic)
  // Flag obviously impossible numeric values
  const percentMatches = [...text.matchAll(/(\d+(?:\.\d+)?)\s*%/g)];
  const percentTooHigh = percentMatches.some((m) => Number(m[1]) > 100);
  if (percentTooHigh) {
    finding.dimensions.feasible = "fail";
    addIssue(finding, "Feasibility issue: percentage value > 100%.");
  }

  // Weak modals (strict mode)
  if (options.strictIncose ?? false) {
    const weakHits = weakModalTerms.filter((t) => containsWord(lower, t));
    if (weakHits.length > 0) {
      finding.dimensions.unambiguous =
        finding.dimensions.unambiguous === "fail" ? "fail" : "warn";
      addIssue(
        finding,
        `Weak modal(s): ${weakHits.map((h) => `"${h}"`).join(", ")}. Consider "shall" for testable requirements.`
      );
    }
  }

  // Default "correct" is typically domain-reviewed; keep as warn unless there are no issues.
  if (finding.issues.length === 0) {
    finding.dimensions.correct = "pass";
    finding.dimensions.complete = "pass";
    finding.dimensions.feasible = "pass";
  } else {
    // If we didn't flag feasibility explicitly, keep it warn.
    finding.dimensions.correct = "warn";
    if (finding.dimensions.feasible !== "fail") finding.dimensions.feasible = "warn";
  }

  // Determine overall status
  const dimValues = Object.values(finding.dimensions);
  const failCount = dimValues.filter((v) => v === "fail").length;
  const warnCount = dimValues.filter((v) => v === "warn").length;
  finding.status = failCount > 0 ? "poor" : warnCount > 2 ? "needs_attention" : "good";

  // Requirement level: currently all analysis is system; program/software reserved for future
  finding.level = options.level ?? "system";

  // Stage 1 – Requirement quality checker categories (type already set above)
  finding.linguistic = runLinguisticChecks(text);
  finding.measurability = runMeasurabilityValidation(text, finding, finding.requirementType);
  finding.embedded = runEmbeddedRules(text);

  // Generate suggested rewrite if there are issues
  if (finding.issues.length > 0) {
    finding.suggestion = generateSuggestion(text, finding, options);
  }

  return finding;
}

type ExtractedNumeric = {
  requirementId: string;
  key: string;
  value: number;
  unit: string;
};

function extractNumericClaims(findings: RequirementFinding[]): ExtractedNumeric[] {
  // Very lightweight: look for patterns like "max pressure 200 bar" or "maximum latency 50 ms"
  const claims: ExtractedNumeric[] = [];
  const pattern =
    /\b(maximum|max|min|minimum)\s+([a-z][a-z0-9 _-]{2,40}?)\s+(\d+(?:\.\d+)?)\s*(ms|s|hz|%|v|a|w|kw|n|kn|pa|kpa|mpa|bar|psi|mm|m|in|kg|lb)\b/gi;

  for (const f of findings) {
    const text = f.text;
    for (const m of text.matchAll(pattern)) {
      const qualifier = String(m[1]).toLowerCase();
      const subject = normalizeWhitespace(String(m[2]).toLowerCase());
      const key = `${qualifier} ${subject}`;
      claims.push({
        requirementId: f.id,
        key,
        value: Number(m[3]),
        unit: String(m[4]).toLowerCase(),
      });
    }
  }

  return claims;
}

function detectConflicts(findings: RequirementFinding[]): RequirementsConflict[] {
  const claims = extractNumericClaims(findings);
  const byKeyUnit = new Map<string, ExtractedNumeric[]>();
  for (const c of claims) {
    const k = `${c.key}__${c.unit}`;
    const arr = byKeyUnit.get(k) ?? [];
    arr.push(c);
    byKeyUnit.set(k, arr);
  }

  const conflicts: RequirementsConflict[] = [];
  for (const [k, arr] of byKeyUnit.entries()) {
    if (arr.length < 2) continue;
    const uniqueValues = new Map<number, ExtractedNumeric[]>();
    for (const c of arr) {
      const bucket = uniqueValues.get(c.value) ?? [];
      bucket.push(c);
      uniqueValues.set(c.value, bucket);
    }
    if (uniqueValues.size <= 1) continue;

    const sample = arr[0]!;
    const ids = Array.from(new Set(arr.map((a) => a.requirementId)));
    conflicts.push({
      requirementIds: ids,
      description: `Potential inconsistency: "${sample.key}" has multiple values in ${sample.unit}.`,
    });

    // Mark the affected requirements as inconsistent
    for (const f of findings) {
      if (!ids.includes(f.id)) continue;
      f.dimensions.consistent = "warn";
      f.status = f.status === "good" ? "needs_attention" : f.status;
      f.issues.push(
        `Potential conflict with other requirement(s) on "${sample.key}" (${sample.unit}).`
      );
    }
  }

  return conflicts;
}

/** Match IDs like PR-1, REQ-2, SR-10, SYS-001 (prefix + number). Skip REQ-AUTO-xxx. */
const ID_PREFIX_NUMBER_REGEX = /^([A-Z]{2,6})[-_]?(\d{1,6})$/i;

/**
 * Detect ID sequence gaps: e.g. PR-1, PR-2, PR-32 suggests expected PR-3 through PR-31.
 */
function computeIdConsistencyWarnings(findings: RequirementFinding[]): IdConsistencyWarning[] {
  const warnings: IdConsistencyWarning[] = [];
  const byPrefix = new Map<string, { num: number; id: string }[]>();

  for (const f of findings) {
    if (/AUTO/i.test(f.id)) continue;
    const m = f.id.match(ID_PREFIX_NUMBER_REGEX);
    if (!m) continue;
    const prefix = m[1]!.toUpperCase();
    const num = parseInt(m[2]!, 10);
    if (Number.isNaN(num)) continue;
    const list = byPrefix.get(prefix) ?? [];
    list.push({ num, id: f.id });
    byPrefix.set(prefix, list);
  }

  for (const [prefix, list] of byPrefix.entries()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => a.num - b.num);
    const numbers = sorted.map((x) => x.num);
    const ids = sorted.map((x) => x.id);
    const min = numbers[0]!;
    const max = numbers[numbers.length - 1]!;
    const expected = new Set(numbers);
    const missing: number[] = [];
    for (let n = min; n <= max; n++) {
      if (!expected.has(n)) missing.push(n);
    }
    if (missing.length === 0) continue;
    const expectedNext = missing[0]!;
    warnings.push({
      prefix,
      expectedNext,
      foundIds: ids,
      message: `ID sequence gap for ${prefix}: found ${ids.join(", ")}; expected ${prefix}-${expectedNext}${missing.length > 1 ? ` through ${prefix}-${missing[missing.length - 1]}` : ""}.`,
    });
  }

  return warnings;
}

const ALL_REQUIREMENT_TYPES: RequirementType[] = [
  "functional",
  "performance",
  "interface",
  "constraint",
  "safety",
  "derived",
  "cybersecurity",
  "verification",
  "environmental",
  "regulatory",
];

/**
 * Design-gap style summary: consistency (conflicts, consistent dimension) and
 * completeness (type coverage, traceability gaps). Used when analyzing a full
 * specification (e.g. PDF upload).
 */
export function computeDesignConsistencyAndCompleteness(
  findings: RequirementFinding[],
  conflicts: RequirementsConflict[]
): DesignConsistencyAndCompleteness {
  const typeCoverage = Object.fromEntries(
    ALL_REQUIREMENT_TYPES.map((t) => [t, 0])
  ) as Record<RequirementType, number>;
  for (const f of findings) {
    if (f.requirementType) typeCoverage[f.requirementType] += 1;
  }
  const traceabilityGaps = findings.filter(
    (f) => f.dimensions.traceable === "warn"
  ).length;
  const requirementsWithConsistencyWarn = findings.filter(
    (f) => f.dimensions.consistent === "warn"
  ).length;

  const rippleScores = findings
    .map((f) => f.rippleSimulation?.rippleImpactScore ?? 0)
    .filter((s) => s >= 0);
  const maxRippleImpactScore =
    rippleScores.length > 0 ? Math.max(...rippleScores) : undefined;
  const highRippleImpactCount = rippleScores.filter((s) => s >= 5).length;

  return {
    conflictCount: conflicts.length,
    typeCoverage,
    traceabilityGaps,
    requirementsWithConsistencyWarn,
    highRippleImpactCount,
    ...(maxRippleImpactScore !== undefined ? { maxRippleImpactScore } : {}),
  };
}

export function analyzeRequirements(
  rawText: string,
  options: RequirementsAnalyzeOptions = {}
): RequirementsAnalyzeResponse {
  const level = options.level ?? "system";

  const parsed = parseRequirements(rawText, options);
  const findings = parsed.map((r) => analyzeSingle(r, options));
  const conflicts = detectConflicts(findings);
  const idConsistencyWarnings = computeIdConsistencyWarnings(findings);
  for (const w of idConsistencyWarnings) {
    for (const f of findings) {
      if (w.foundIds.includes(f.id)) {
        f.issues.push(`ID inconsistent with document sequence: ${w.message}`);
        f.dimensions.traceable = f.dimensions.traceable === "fail" ? "fail" : "warn";
      }
    }
  }

  const summary = {
    total: findings.length,
    good: findings.filter((f) => f.status === "good").length,
    needsAttention: findings.filter((f) => f.status === "needs_attention").length,
    poor: findings.filter((f) => f.status === "poor").length,
  };

  const designConsistencyAndCompleteness = computeDesignConsistencyAndCompleteness(
    findings,
    conflicts
  );
  const requirementGraph = buildRequirementGraph(findings, conflicts);
  const structuralIntelligence: StructuralIntelligenceLayer = computeStructuralIntelligence(
    findings,
    requirementGraph
  );
  const gapRiskAnalysis = computeGapRiskAnalysis(findings);
  const dcte = computeDCTE(findings);

  // Only skip known auto-generated IDs like REQ-AUTO-001
  const isAutoGeneratedId = (id: string) => /^REQ[-_ ]?AUTO[-_ ]?\d+/i.test(id);

  // Explicit ID → statement mappings
  const explicitRequirementMappings = parsed
    .filter((p) => p.hasExplicitId && p.id && !isAutoGeneratedId(p.id))
    .map((p) => ({
      id: p.id,                        // normalized ID
      idRaw: (p as any).idRaw,         // optional raw ID if parser provided it
      statement: p.text,               // clean statement text
      level,
      tool: options.requirementManagementTool ?? "generic",
    }));

  // Convenience map: id → statement
  const explicitRequirementMap: Record<string, string> = {};
  for (const m of explicitRequirementMappings) {
    if (!explicitRequirementMap[m.id]) explicitRequirementMap[m.id] = m.statement;
  }

  return {
    level,
    ...(options.requirementManagementTool !== undefined
      ? { requirementManagementTool: options.requirementManagementTool }
      : {}),
    requirements: findings,
    conflicts,
    summary,
    designConsistencyAndCompleteness,
    requirementGraph,
    idConsistencyWarnings,
    structuralIntelligence,
    gapRiskAnalysis,
    dcte,
    explicitRequirementMappings,
    explicitRequirementMap,
  };
}

/** Level-specific entry points: same analysis pipeline with level tag. */

export function analyzeStakeholderRequirements(
  rawText: string,
  options: Omit<RequirementsAnalyzeOptions, "level"> = {}
): RequirementsAnalyzeResponse {
  return analyzeRequirements(rawText, { ...options, level: "stakeholder" });
}

export function analyzeSystemRequirements(
  rawText: string,
  options: Omit<RequirementsAnalyzeOptions, "level"> = {}
): RequirementsAnalyzeResponse {
  return analyzeRequirements(rawText, { ...options, level: "system" });
}

export function analyzeSubsystemRequirements(
  rawText: string,
  options: Omit<RequirementsAnalyzeOptions, "level"> = {}
): RequirementsAnalyzeResponse {
  return analyzeRequirements(rawText, { ...options, level: "subsystem" });
}

export function analyzeComponentRequirements(
  rawText: string,
  options: Omit<RequirementsAnalyzeOptions, "level"> = {}
): RequirementsAnalyzeResponse {
  return analyzeRequirements(rawText, { ...options, level: "component" });
}

export function analyzeImplementationRequirements(
  rawText: string,
  options: Omit<RequirementsAnalyzeOptions, "level"> = {}
): RequirementsAnalyzeResponse {
  return analyzeRequirements(rawText, { ...options, level: "implementation" });
}

