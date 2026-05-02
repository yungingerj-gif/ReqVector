import type { RequirementFinding, RequirementType } from "../models/requirements";
import type {
  StructuredConstraint,
  ConstraintTuple,
  DCTEFunctionalNode,
  DCTEPerformanceNode,
  DCTEConditionNode,
  ConstraintDeltaVector,
  ConstraintLink,
  CompletionProposal,
  DCTEResult,
  ConstraintSpacePoint,
  Span,
  ConstraintDomain,
} from "../models/requirements";

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Helper: run regex (use non-global for first match) and return match with span. */
function matchWithSpan(text: string, regex: RegExp, captureGroup = 0): { text: string; span: Span } | null {
  const re = new RegExp(regex.source, regex.flags.replace("g", ""));
  const m = re.exec(text);
  if (!m || !m[0]) return null;
  const idx = captureGroup > 0 && m[captureGroup] ? m[0].indexOf(m[captureGroup]) : 0;
  const len = (captureGroup > 0 && m[captureGroup] ? m[captureGroup].length : m[0].length);
  const start = m.index + idx;
  return {
    text: (captureGroup > 0 && m[captureGroup] ? m[captureGroup] : m[0]).trim(),
    span: { start, end: start + len },
  };
}

/**
 * Heuristic extraction of structured components with optional evidence spans.
 */
export function extractStructuredConstraint(
  requirementId: string,
  text: string
): StructuredConstraint {
  const t = normalize(text);

  let actor: string | null = null;
  let actorSpan: Span | null = null;
  const actorMatch = matchWithSpan(text, /\b(the\s+)?(system|operator|user|controller|software|hardware|vehicle|ecu|module)\b/i);
  if (actorMatch) {
    actor = actorMatch.text;
    actorSpan = actorMatch.span;
  }

  let action: string | null = null;
  let actionSpan: Span | null = null;
  const shallMatch = matchWithSpan(text, /\bshall\s+(\w+)(?:\s+(\w+))?(?:\s+(\w+))?/i);
  if (shallMatch) {
    const parts = shallMatch.text.replace(/\bshall\s+/i, "").split(/\s+/).filter(w => !/the|and|or|when|if|within|to|be/i.test(w));
    action = parts.slice(0, 2).join(" ") || null;
    actionSpan = shallMatch.span;
  }

  let object: string | null = null;
  let objectSpan: Span | null = null;
  const objMatch = matchWithSpan(text, /\bshall\s+\w+\s+(?:the\s+)?(\w+(?:\s+\w+){0,2})(?:\s+to\s+|\s+that\s+|\s+within\s+|\s*[,.]|$)/i, 1);
  if (objMatch && objMatch.text && !/shall|when|if|within/i.test(objMatch.text))
    object = normalize(objMatch.text), objectSpan = objMatch.span;

  let condition: string | null = null;
  let conditionSpan: Span | null = null;
  const whenMatch = matchWithSpan(text, /(?:when|if|under|during|where)\s+[^.;]+?(?=\s*[.;]|\s+the\s+system|\s+shall|$)/i);
  if (whenMatch) condition = whenMatch.text, conditionSpan = whenMatch.span;
  if (!condition && /\b(operating|normal|degraded|manual|automatic)\s+(\w+\s+)?(condition|mode|state)/i.test(t)) {
    const modeMatch = matchWithSpan(text, /(?:operating|normal|degraded|manual|automatic)[^.;]*/i);
    if (modeMatch) condition = modeMatch.text, conditionSpan = modeMatch.span;
  }

  let constraint: string | null = null;
  let constraintSpan: Span | null = null;
  const numUnit = matchWithSpan(text, /(?:max(?:imum)?|min(?:imum)?|within|not\s+exceed|≤|≥|<=|>=|±)?\s*(\d+(?:\.\d+)?)\s*(ms|s|sec|mm|m|km\/h|kmh|%|hz|mb|bar|psi|°c|c)\b/i);
  if (numUnit) constraint = numUnit.text, constraintSpan = numUnit.span;
  if (!constraint && /\d+(?:\.\d+)?\s*(ms|s|mm|%|hz)/i.test(t)) {
    const simple = matchWithSpan(text, /\d+(?:\.\d+)?\s*(?:ms|s|mm|%|hz|mb|bar)\b/i);
    if (simple) constraint = simple.text, constraintSpan = simple.span;
  }

  let mode: string | null = null;
  let modeSpan: Span | null = null;
  const modeMatch = matchWithSpan(text, /\b(manual|automatic|degraded)\s+mode\b/i);
  if (modeMatch) mode = modeMatch.text, modeSpan = modeMatch.span;

  let timeBound: string | null = null;
  let timeBoundSpan: Span | null = null;
  const within = matchWithSpan(text, /\bwithin\s+\d+(?:\.\d+)?\s*(ms|s|seconds?|milliseconds?)\b/i);
  if (within) timeBound = within.text, timeBoundSpan = within.span;
  if (!timeBound && /\btimeout\b|\blatency\b|\bresponse\s+time\b/i.test(t)) {
    const tb = matchWithSpan(text, /(?:timeout|latency|response\s+time)[^.;]*\d*[^.;]*/i);
    if (tb) timeBound = tb.text, timeBoundSpan = tb.span;
  }

  return {
    requirementId,
    actor,
    action,
    object,
    condition,
    constraint,
    mode,
    timeBound,
    actorSpan: actorSpan ?? null,
    actionSpan: actionSpan ?? null,
    objectSpan: objectSpan ?? null,
    conditionSpan: conditionSpan ?? null,
    constraintSpan: constraintSpan ?? null,
    modeSpan: modeSpan ?? null,
    timeBoundSpan: timeBoundSpan ?? null,
  };
}

/** Function completeness: +0.4 shall, +0.3 action, +0.3 object. */
function functionCompleteness(c: StructuredConstraint): number {
  let s = 0;
  if (/\bshall\b/i.test(c.actor ?? "") || (c.action != null)) s += 0.4;
  if (c.action != null && c.action.length > 0) s += 0.3;
  if (c.object != null && c.object.length > 0) s += 0.3;
  return Math.min(1, s);
}

/** Performance completeness: +0.5 numeric bound, +0.3 unit, +0.2 tolerance/range. */
function performanceCompleteness(c: StructuredConstraint): number {
  const perf = c.constraint ?? c.timeBound ?? null;
  if (!perf) return 0;
  let s = 0;
  if (/\d+(?:\.\d+)?/.test(perf)) s += 0.5;
  if (/(ms|s|sec|mm|m|km\/h|%|hz|bar|psi)\b/i.test(perf)) s += 0.3;
  if (/\b(within|±|max|min|range|tolerance)\b/i.test(perf)) s += 0.2;
  return Math.min(1, s);
}

/** Condition completeness: +0.5 condition exists, +0.3 measurable var, +0.2 range/bounds. */
function conditionCompleteness(c: StructuredConstraint): number {
  const cond = c.condition ?? c.mode ?? null;
  if (!cond) return 0;
  let s = 0.5;
  if (/(temp|speed|°c|celsius|km\/h|pressure|humidity|wet|dry)\b/i.test(cond)) s += 0.3;
  if (/\d+|range|between|above|below|under\b/i.test(cond)) s += 0.2;
  return Math.min(1, s);
}

/** Confidence: rule-based. numbers+units 0.95, qualitative 0.4, condition 0.8, action no object 0.5. */
function functionConfidence(c: StructuredConstraint): number {
  if (!c.action) return 0.4;
  if (c.object) return 0.9;
  return 0.5;
}
function performanceConfidence(c: StructuredConstraint): number {
  const p = c.constraint ?? c.timeBound;
  if (!p) return 0;
  if (/\d+(?:\.\d+)?\s*(ms|s|mm|%|hz|bar)\b/i.test(p)) return 0.95;
  if (/fast|quick|slow|high|low\b/i.test(p)) return 0.4;
  return 0.7;
}
function conditionConfidence(c: StructuredConstraint): number {
  if (c.condition ?? c.mode) return 0.8;
  return 0;
}

function buildConstraintTuples(
  constraints: StructuredConstraint[],
  findings: RequirementFinding[]
): ConstraintTuple[] {
  const idToText = new Map(findings.map((f) => [f.id, f.text]));
  return constraints.map((c) => {
    const funcParts = [c.actor, c.action, c.object].filter(Boolean);
    const functionSummary = funcParts.length > 0 ? funcParts.join(" ") : (idToText.get(c.requirementId)?.slice(0, 80) ?? c.requirementId);
    const performanceBound = c.constraint ?? c.timeBound ?? null;
    const condition = c.condition ?? c.mode ?? null;

    const functionCompletenessVal = functionCompleteness(c);
    const performanceCompletenessVal = performanceCompleteness(c);
    const conditionCompletenessVal = conditionCompleteness(c);

    const evidenceSpans = {
      functionSpans: [c.actorSpan, c.actionSpan, c.objectSpan].filter((s): s is Span => s != null),
      performanceSpans: [c.constraintSpan, c.timeBoundSpan].filter((s): s is Span => s != null),
      conditionSpans: [c.conditionSpan, c.modeSpan].filter((s): s is Span => s != null),
    };

    const hasEvidence =
      evidenceSpans.functionSpans.length > 0 ||
      evidenceSpans.performanceSpans.length > 0 ||
      evidenceSpans.conditionSpans.length > 0;

    const base: ConstraintTuple = {
      requirementId: c.requirementId,
      function: functionSummary,
      performanceBound,
      condition,
      functionCompleteness: functionCompletenessVal,
      performanceCompleteness: performanceCompletenessVal,
      conditionCompleteness: conditionCompletenessVal,
      functionConfidence: functionConfidence(c),
      performanceConfidence: performanceConfidence(c),
      conditionConfidence: conditionConfidence(c),
    };
    if (hasEvidence) {
      base.evidenceSpans = evidenceSpans;
    }
    return base;
  });
}

function buildLayers(
  tuples: ConstraintTuple[],
  _constraints: StructuredConstraint[]
): {
  functionalLayer: DCTEFunctionalNode[];
  performanceLayer: DCTEPerformanceNode[];
  conditionLayer: DCTEConditionNode[];
} {
  const functionalLayer: DCTEFunctionalNode[] = tuples.map((t) => ({
    requirementId: t.requirementId,
    functionSummary: t.function,
    hasPerformanceBound: t.performanceBound != null && t.performanceBound.length > 0,
    hasCondition: t.condition != null && t.condition.length > 0,
  }));

  const performanceLayer: DCTEPerformanceNode[] = tuples
    .filter((t) => t.performanceBound != null && t.performanceBound.length > 0)
    .map((t) => ({
      requirementId: t.requirementId,
      boundSummary: t.performanceBound!,
      hasCondition: t.condition != null && t.condition.length > 0,
      hasFunction: t.function.length > 0,
    }));

  const conditionLayer: DCTEConditionNode[] = tuples
    .filter((t) => t.condition != null && t.condition.length > 0)
    .map((t) => ({
      requirementId: t.requirementId,
      conditionSummary: t.condition!,
      hasDefinedBehavior: t.function.length > 0,
      hasBound: t.performanceBound != null && t.performanceBound.length > 0,
    }));

  return { functionalLayer, performanceLayer, conditionLayer };
}

function deltaEvidenceSpans(
  fromSpans: Span[] | undefined,
  toSpans: Span[] | undefined
): ConstraintDeltaVector["evidenceSpans"] {
  const out: NonNullable<ConstraintDeltaVector["evidenceSpans"]> = {};
  if (fromSpans && fromSpans.length > 0) out.fromSpans = fromSpans;
  if (toSpans && toSpans.length > 0) out.toSpans = toSpans;
  return Object.keys(out).length > 0 ? out : undefined;
}

function severityFromRiskScore(riskScore: number): "low" | "med" | "high" {
  if (riskScore >= 50) return "high";
  if (riskScore >= 20) return "med";
  return "low";
}

/** Expectation weight: functional req expects F→P and F→C; performance expects P→F, P→C; etc. */
function expectationWeight(
  from: ConstraintDomain,
  to: ConstraintDomain,
  requirementType?: RequirementType
): number {
  if (requirementType === "functional") {
    if ((from === "function" && to === "performance") || (from === "function" && to === "condition")) return 1.0;
  }
  if (requirementType === "performance") {
    if ((from === "performance" && to === "function") || (from === "performance" && to === "condition")) return 1.0;
  }
  return 0.8;
}

function runDeltaAnalysis(
  layers: {
    functionalLayer: DCTEFunctionalNode[];
    performanceLayer: DCTEPerformanceNode[];
    conditionLayer: DCTEConditionNode[];
  },
  tuples: ConstraintTuple[],
  findings: RequirementFinding[]
): ConstraintDeltaVector[] {
  const deltas: ConstraintDeltaVector[] = [];
  let idGen = 1;
  const idToType = new Map<string, RequirementType>();
  findings.forEach((f) => { if (f.requirementType) idToType.set(f.id, f.requirementType); });
  const tupleByReq = new Map(tuples.map((t) => [t.requirementId, t]));

  for (const node of layers.functionalLayer) {
    const t = tupleByReq.get(node.requirementId);
    if (!t || node.hasPerformanceBound) continue;
    const F = t.functionCompleteness;
    const P = t.performanceCompleteness;
    const magnitude = Math.max(0, F - P);
    if (magnitude < 0.01) continue;
    const confWeight = Math.max(0.4, Math.min(1, (t.functionConfidence + t.performanceConfidence) / 2));
    const expWeight = expectationWeight("function", "performance", idToType.get(node.requirementId));
    const riskScore = Math.round(100 * magnitude * expWeight * confWeight);
    const ev1 = t.evidenceSpans
      ? deltaEvidenceSpans(t.evidenceSpans.functionSpans, t.evidenceSpans.performanceSpans)
      : undefined;
    deltas.push({
      id: `DCTE-${idGen++}`,
      kind: "function_without_measurable_bound",
      requirementId: node.requirementId,
      from: "function",
      to: "performance",
      magnitude,
      riskScore,
      severity: severityFromRiskScore(riskScore),
      expectationRuleId: "F→P_expected",
      message: `Functional intent "${node.functionSummary.slice(0, 60)}…" has no measurable performance bound.`,
      ...(ev1 ? { evidenceSpans: ev1 } : {}),
      suggestedDomain: "performance",
    });
  }

  for (const node of layers.performanceLayer) {
    if (node.hasCondition) continue;
    const t = tupleByReq.get(node.requirementId);
    if (!t) continue;
    const P = t.performanceCompleteness;
    const C = t.conditionCompleteness;
    const magnitude = Math.max(0, P - C);
    if (magnitude < 0.01) continue;
    const confWeight = Math.max(0.4, Math.min(1, (t.performanceConfidence + t.conditionConfidence) / 2));
    const expWeight = expectationWeight("performance", "condition", idToType.get(node.requirementId));
    const riskScore = Math.round(100 * magnitude * expWeight * confWeight);
    const ev2 = t.evidenceSpans
      ? deltaEvidenceSpans(t.evidenceSpans.performanceSpans, t.evidenceSpans.conditionSpans)
      : undefined;
    deltas.push({
      id: `DCTE-${idGen++}`,
      kind: "performance_bound_without_triggering_condition",
      requirementId: node.requirementId,
      from: "performance",
      to: "condition",
      magnitude,
      riskScore,
      severity: severityFromRiskScore(riskScore),
      expectationRuleId: "P→C_expected",
      message: `Performance bound "${node.boundSummary.slice(0, 40)}…" has no triggering condition (when/where it applies).`,
      ...(ev2 ? { evidenceSpans: ev2 } : {}),
      suggestedDomain: "condition",
    });
  }

  for (const node of layers.conditionLayer) {
    if (node.hasDefinedBehavior && node.hasBound) continue;
    if (!node.hasDefinedBehavior) {
      const t = tupleByReq.get(node.requirementId);
      if (!t) continue;
      const C = t.conditionCompleteness;
      const F = t.functionCompleteness;
      const magnitude = Math.max(0, C - F);
      if (magnitude < 0.01) continue;
      const confWeight = Math.max(0.4, Math.min(1, (t.conditionConfidence + t.functionConfidence) / 2));
      const expWeight = expectationWeight("condition", "function", idToType.get(node.requirementId));
      const riskScore = Math.round(100 * magnitude * expWeight * confWeight);
      const ev3 = t.evidenceSpans
        ? deltaEvidenceSpans(t.evidenceSpans.conditionSpans, t.evidenceSpans.functionSpans)
        : undefined;
      deltas.push({
        id: `DCTE-${idGen++}`,
        kind: "condition_without_defined_behavior",
        requirementId: node.requirementId,
        from: "condition",
        to: "function",
        magnitude,
        riskScore,
        severity: severityFromRiskScore(riskScore),
        expectationRuleId: "C→F_expected",
        message: `Condition "${node.conditionSummary.slice(0, 50)}…" has no clearly defined behavior or bound.`,
        ...(ev3 ? { evidenceSpans: ev3 } : {}),
        suggestedDomain: "functional",
      });
    }
  }

  const derived = findings.filter((f) => f.requirementType === "derived");
  const explicitRefs = (text: string): boolean =>
    /\b(derived\s+from|per\s+)(REQ-|SR-|FR-|PR-|IR-)[\w-]*\d+/i.test(text) ||
    /\bsee\s+[\d.]+\b/i.test(text) ||
    /REQ-|SR-|FR-|PR-\d+/i.test(text);
  const inferredParent = inferParentForDerived(derived, findings);
  for (const f of derived) {
    if (explicitRefs(f.text)) continue;
    const parent = inferredParent.get(f.id);
    if (parent != null && parent.confidence >= 0.6) continue;
    deltas.push({
      id: `DCTE-${idGen++}`,
      kind: "derived_function_missing_upstream_justification",
      requirementId: f.id,
      from: "function",
      to: "function",
      magnitude: 0.7,
      riskScore: 55,
      severity: "high",
      expectationRuleId: "derived_justification_expected",
      message: `Derived requirement has no explicit upstream justification or high-confidence inferred parent.`,
      suggestedDomain: "functional",
    });
  }

  return deltas;
}

/** Inferred parent for derived req: similarity by shared object/action/metric/condition. */
function inferParentForDerived(
  derived: RequirementFinding[],
  all: RequirementFinding[]
): Map<string, { requirementId: string; confidence: number }> {
  const result = new Map<string, { requirementId: string; confidence: number }>();
  const nonDerived = all.filter((f) => f.requirementType !== "derived");
  const tokenize = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter(Boolean);
  for (const d of derived) {
    const dTokens = new Set(tokenize(d.text));
    let best: { requirementId: string; confidence: number } | null = null;
    for (const p of nonDerived) {
      const pTokens = new Set(tokenize(p.text));
      const overlap = [...dTokens].filter((t) => pTokens.has(t)).length;
      const jaccard = dTokens.size + pTokens.size - overlap > 0
        ? overlap / (dTokens.size + pTokens.size - overlap)
        : 0;
      const hasObject = /\b(system|shall|within|when|speed|latency|pressure|mode)\b/i.test(d.text) && /\b(system|shall|within|when|speed|latency|pressure|mode)\b/i.test(p.text);
      const confidence = jaccard * 0.6 + (hasObject ? 0.25 : 0);
      if (confidence >= 0.3 && (!best || confidence > best.confidence)) best = { requirementId: p.id, confidence };
    }
    if (best) result.set(d.id, best);
  }
  return result;
}

function buildConstraintLinks(tuples: ConstraintTuple[]): ConstraintLink[] {
  const links: ConstraintLink[] = [];
  let idGen = 1;
  for (const t of tuples) {
    if (t.function.length > 0 && t.performanceBound) {
      links.push({
        id: `LINK-${idGen++}`,
        requirementId: t.requirementId,
        fromDomain: "function",
        toDomain: "performance",
        linkType: "constrains",
        strength: Math.min(1, t.performanceCompleteness + 0.3),
      });
    }
    if (t.condition && t.function.length > 0) {
      links.push({
        id: `LINK-${idGen++}`,
        requirementId: t.requirementId,
        fromDomain: "condition",
        toDomain: "function",
        linkType: "triggers",
        strength: Math.min(1, t.conditionCompleteness + 0.3),
      });
    }
    if (t.condition && t.performanceBound) {
      links.push({
        id: `LINK-${idGen++}`,
        requirementId: t.requirementId,
        fromDomain: "condition",
        toDomain: "performance",
        linkType: "binds",
        strength: Math.min(1, (t.conditionCompleteness + t.performanceCompleteness) / 2),
      });
    }
  }
  return links;
}

function buildCompletionProposals(deltas: ConstraintDeltaVector[], tuples: ConstraintTuple[]): CompletionProposal[] {
  const tupleByReq = new Map(tuples.map((t) => [t.requirementId, t]));
  const proposals: CompletionProposal[] = [];
  for (const d of deltas) {
    const t = tupleByReq.get(d.requirementId);
    const action = t?.function?.split(/\s+/).slice(-2).join(" ") ?? "ACTION";
    const object = t?.function?.split(/\s+/).slice(0, -2).join(" ") || "OBJECT";
    if (d.from === "function" && d.to === "performance") {
      proposals.push({
        requirementId: d.requirementId,
        deltaId: d.id,
        missingDomains: ["performance"],
        suggestedText: `The system shall ${action} ${object} within <TIME_MS> ms.`,
        placeholders: ["<TIME_MS>"],
        rationale: "Add measurable performance bound (F→P).",
      });
    } else if (d.from === "performance" && d.to === "condition") {
      proposals.push({
        requirementId: d.requirementId,
        deltaId: d.id,
        missingDomains: ["condition"],
        suggestedText: `The system shall <ACTION> <OBJECT> when <CONDITION>.`,
        placeholders: ["<ACTION>", "<OBJECT>", "<CONDITION>"],
        rationale: "Add triggering condition for performance bound (P→C).",
      });
    } else if (d.from === "condition" && d.to === "function") {
      proposals.push({
        requirementId: d.requirementId,
        deltaId: d.id,
        missingDomains: ["function"],
        suggestedText: `When <CONDITION>, the system shall ${action} ${object}.`,
        placeholders: ["<CONDITION>"],
        rationale: "Add defined behavior for condition (C→F).",
      });
    }
  }
  return proposals;
}

/** Subsystem: prefer requirementType, then ID prefix. */
function inferSubsystem(id: string, requirementType?: RequirementType): string {
  if (requirementType) return requirementType;
  const upper = id.toUpperCase();
  if (/^FR[-_\s]?\d/i.test(upper)) return "functional";
  if (/^PR[-_\s]?\d/i.test(upper)) return "performance";
  if (/^SR[-_\s]?\d/i.test(upper)) return "safety";
  if (/^IR[-_\s]?\d/i.test(upper)) return "interface";
  if (/^REQ[-_\s]?\d/i.test(upper)) return "requirement";
  return "other";
}

function buildConstraintSpacePoints(
  tuples: ConstraintTuple[],
  findings: RequirementFinding[]
): ConstraintSpacePoint[] {
  const idToType = new Map<string, RequirementType>();
  for (const f of findings) {
    if (f.requirementType) idToType.set(f.id, f.requirementType);
  }
  return tuples.map((t) => {
    const rt = idToType.get(t.requirementId);
    const pt: ConstraintSpacePoint = {
      requirementId: t.requirementId,
      x: t.functionCompleteness,
      y: t.performanceCompleteness,
      z: t.conditionCompleteness,
      subsystem: inferSubsystem(t.requirementId, rt),
    };
    if (rt !== undefined) {
      pt.requirementType = rt;
    }
    return pt;
  });
}

export function computeDCTE(findings: RequirementFinding[]): DCTEResult {
  const structuredConstraints: StructuredConstraint[] = findings.map((f) =>
    extractStructuredConstraint(f.id, f.text)
  );

  const constraintTuples = buildConstraintTuples(structuredConstraints, findings);
  const layers = buildLayers(constraintTuples, structuredConstraints);
  const deltas = runDeltaAnalysis(layers, constraintTuples, findings);
  const constraintSpacePoints = buildConstraintSpacePoints(constraintTuples, findings);
  const constraintLinks = buildConstraintLinks(constraintTuples);
  const completionProposals = buildCompletionProposals(deltas, constraintTuples);

  return {
    structuredConstraints,
    constraintTuples,
    functionalLayer: layers.functionalLayer,
    performanceLayer: layers.performanceLayer,
    conditionLayer: layers.conditionLayer,
    deltas,
    constraintSpacePoints,
    constraintLinks,
    completionProposals,
  };
}
