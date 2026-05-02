export type IncoseDimension =
  | "correct"
  | "unambiguous"
  | "complete"
  | "consistent"
  | "feasible"
  | "verifiable"
  | "singular"
  | "traceable";

export type DimensionStatus = "pass" | "warn" | "fail";

/** Stage 1: per-category quality result */
export interface QualityCategoryResult {
  status: "pass" | "warn" | "fail";
  issues: string[];
}

/**
 * Requirement level / scope (V-model layers).
 * - stakeholder: stakeholder / user needs.
 * - system: system-level requirements (current default).
 * - subsystem: subsystem-level requirements.
 * - component: component-level requirements.
 * - implementation: implementation / low-level requirements.
 */
export type RequirementLevel =
  | "stakeholder"
  | "system"
  | "subsystem"
  | "component"
  | "implementation";

/** Requirement type designator */
export type RequirementType =
  | "functional"
  | "performance"
  | "interface"
  | "constraint"
  | "safety"
  | "derived"
  | "cybersecurity"
  | "verification"
  | "environmental"
  | "regulatory";

/** Type-specific criteria: met vs missing (by criterion label) */
export interface TypeCriteriaResult {
  met: string[];
  missing: string[];
}

/** Requirement management tool / import source for document analysis. */
export type RequirementManagementTool = "generic" | "doors" | "polarion" | "jama";

export interface RequirementsAnalyzeOptions {
  strictIncose?: boolean | undefined;
  level?: RequirementLevel | undefined;
  /** Source tool for document analysis: DOORS, Polarion, Jama, or generic (default). */
  requirementManagementTool?: RequirementManagementTool | undefined;
}

export interface RequirementsAnalyzeRequest {
  context?: string | undefined;
  rawText: string;
  options?: RequirementsAnalyzeOptions | undefined;
}

export interface RequirementFinding {
  id: string;
  text: string;
  status: "good" | "needs_attention" | "poor";
  dimensions: Record<IncoseDimension, DimensionStatus>;
  issues: string[];
  suggestion?: string | undefined;
  /** Stage 1 – Linguistic quality checks */
  linguistic?: QualityCategoryResult | undefined;
  /** Stage 1 – Measurability validation */
  measurability?: QualityCategoryResult | undefined;
  /** Stage 1 – Embedded-specific rule enforcement */
  embedded?: QualityCategoryResult | undefined;
  /** Requirement type designator (inferred) */
  requirementType?: RequirementType | undefined;
  /** Criteria for the designated type: met vs missing */
  typeCriteria?: TypeCriteriaResult | undefined;
  /** Requirement level (system / program / software). All analysis is currently characterized as system. */
  level?: RequirementLevel | undefined;
  /** Optional ripple simulation result (if ripple risk simulation is enabled). */
  rippleSimulation?: {
    rippleImpactScore: number;
  };
}

export interface RequirementsConflict {
  requirementIds: string[];
  description: string;
}

/** Design consistency & completeness summary (e.g. from full-spec PDF analysis) */
export interface DesignConsistencyAndCompleteness {
  /** Number of conflicting requirement pairs/groups (numeric inconsistencies). */
  conflictCount: number;
  /** Requirement type coverage: count per type. */
  typeCoverage: Record<RequirementType, number>;
  /** Number of requirements missing an explicit ID (traceability gap). */
  traceabilityGaps: number;
  /** Total requirements with dimension consistent = warn (in conflict set). */
  requirementsWithConsistencyWarn: number;
  /** Optional: count of requirements with high ripple impact score (>= 5). */
  highRippleImpactCount?: number;
  /** Optional: maximum ripple impact score observed across requirements. */
  maxRippleImpactScore?: number;
}

/**
 * Multi-layer requirement graph: heterogeneous nodes and typed edges with
 * constraint propagation weighting (typed constraint graph, not just NLP tagging).
 */
export type RequirementGraphEdgeType =
  | "depends-on"
  | "constrains"
  | "verifies"
  | "conflicts-with"
  | "derived-from"
  | "regulated-by";

export interface RequirementGraphNode {
  /** Requirement ID (node id). */
  id: string;
  /** Node type = requirement type (functional, performance, interface, etc.). */
  type: RequirementType;
  /** Optional short text for display. */
  text?: string;
}

export interface RequirementGraphEdge {
  sourceId: string;
  targetId: string;
  edgeType: RequirementGraphEdgeType;
  /** Constraint propagation weight (0–1). Used for propagation scoring. */
  weight: number;
}

export interface RequirementGraph {
  nodes: RequirementGraphNode[];
  edges: RequirementGraphEdge[];
  /** Per-node constraint propagation score = sum of incoming edge weights (heterogeneous propagation). */
  nodePropagationWeights: Record<string, number>;
}

/** Stage 2 – Structural intelligence: requirement invariants & gap/risk analysis. */

export type InvariantType =
  | "max_bound"
  | "min_bound"
  | "stopping_distance"
  | "timeout"
  | "sensor_dependency"
  | "authority_gating"
  | "safety_guard";

export interface RequirementInvariant {
  id: string;
  invariantType: InvariantType;
  /** Human-readable expression, e.g. "speed <= 20 km/h" or "GNSS must be available". */
  expression: string;
  /** IDs of requirements this invariant was synthesized from. */
  sourceRequirementIds: string[];
  notes?: string;
}

export type GapRiskSeverity = "low" | "medium" | "high";

export interface ViolationScenario {
  id: string;
  invariantId: string;
  /** Description of the adversarial/violation condition. */
  description: string;
  /** Whether we found any requirement that appears to define behavior for this violation. */
  hasDefinedBehavior: boolean;
  /** IDs of requirements that appear to handle this scenario (if any). */
  supportingRequirementIds: string[];
  /** Tags like "unbounded_invariant", "no_degradation", "unsafe_state". */
  riskTags: string[];
}

export interface GapRiskFinding {
  id: string;
  severity: GapRiskSeverity;
  message: string;
  /** Invariant this finding is tied to (if applicable). */
  invariantId?: string;
  /** Scenario this finding is tied to (if applicable). */
  scenarioId?: string;
  relatedRequirementIds: string[];
  tags: string[];
}

export interface GapRiskAnalysis {
  invariants: RequirementInvariant[];
  scenarios: ViolationScenario[];
  findings: GapRiskFinding[];
}

/** Text span (start/end indices in requirement text). */
export interface Span {
  start: number;
  end: number;
}

/** Delta-Constraint Triangulation Engine (DCTE): structured constraint per requirement. */
export interface StructuredConstraint {
  requirementId: string;
  actor: string | null;
  action: string | null;
  object: string | null;
  condition: string | null;
  constraint: string | null;
  mode: string | null;
  timeBound: string | null;
  /** Evidence spans in original text (optional). */
  actorSpan?: Span | null;
  actionSpan?: Span | null;
  objectSpan?: Span | null;
  conditionSpan?: Span | null;
  constraintSpan?: Span | null;
  modeSpan?: Span | null;
  timeBoundSpan?: Span | null;
}

/** Domain for triangulation (function | performance | condition | modeTime). */
export type ConstraintDomain = "function" | "performance" | "condition" | "modeTime";

/** Constraint tuple with deterministic completeness and confidence (0..1). */
export interface ConstraintTuple {
  requirementId: string;
  function: string;
  performanceBound: string | null;
  condition: string | null;
  /** Deterministic function completeness 0..1. */
  functionCompleteness: number;
  /** Deterministic performance completeness 0..1. */
  performanceCompleteness: number;
  /** Deterministic condition completeness 0..1. */
  conditionCompleteness: number;
  /** Extraction confidence per domain 0..1. */
  functionConfidence: number;
  performanceConfidence: number;
  conditionConfidence: number;
  /** Evidence spans for 3D/delta display. */
  evidenceSpans?: {
    functionSpans?: Span[];
    performanceSpans?: Span[];
    conditionSpans?: Span[];
  };
}

/** DCTE: one of three linked layers. */
export interface DCTEFunctionalNode {
  requirementId: string;
  functionSummary: string;
  hasPerformanceBound: boolean;
  hasCondition: boolean;
}

export interface DCTEPerformanceNode {
  requirementId: string;
  boundSummary: string;
  hasCondition: boolean;
  hasFunction: boolean;
}

export interface DCTEConditionNode {
  requirementId: string;
  conditionSummary: string;
  hasDefinedBehavior: boolean;
  hasBound: boolean;
}

/** DCTE: constraint delta vector – directional, scored. */
export type DCTEDeltaKind =
  | "function_without_measurable_bound"
  | "performance_bound_without_triggering_condition"
  | "condition_without_defined_behavior"
  | "derived_function_missing_upstream_justification";

export interface ConstraintDeltaVector {
  id: string;
  kind: DCTEDeltaKind;
  requirementId: string;
  /** Directional: from domain → to domain. */
  from: ConstraintDomain;
  to: ConstraintDomain;
  /** 0..1, computed from completeness gap (e.g. max(0, F - P)). */
  magnitude: number;
  /** 0..100, magnitude × expectationWeight × confidenceWeight. */
  riskScore: number;
  severity: "low" | "med" | "high";
  /** Rule that expected this link (e.g. "F→P_expected"). */
  expectationRuleId?: string;
  message: string;
  evidenceSpans?: { fromSpans?: Span[]; toSpans?: Span[] };
  /** Legacy: suggested domain to strengthen (= to). */
  suggestedDomain: "functional" | "performance" | "condition";
}

/** Link edge between two domains (triangulation core). */
export interface ConstraintLink {
  id: string;
  requirementId: string;
  fromDomain: "function" | "performance" | "condition";
  toDomain: "function" | "performance" | "condition";
  linkType: "binds" | "constrains" | "triggers";
  /** 0..1. */
  strength: number;
}

/** Template-based completion proposal for a delta. */
export interface CompletionProposal {
  requirementId: string;
  deltaId: string;
  missingDomains: ConstraintDomain[];
  suggestedText: string;
  placeholders: string[];
  rationale: string;
}

/** One point in the 3D constraint space (X=functional, Y=performance, Z=condition completeness). */
export interface ConstraintSpacePoint {
  requirementId: string;
  /** Functional completeness (0–1). */
  x: number;
  /** Performance completeness (0–1). */
  y: number;
  /** Condition completeness (0–1). */
  z: number;
  requirementType?: RequirementType;
  /** Inferred subsystem from ID prefix (e.g. FR→functional, PR→performance). */
  subsystem?: string;
}

export interface DCTEResult {
  structuredConstraints: StructuredConstraint[];
  constraintTuples: ConstraintTuple[];
  functionalLayer: DCTEFunctionalNode[];
  performanceLayer: DCTEPerformanceNode[];
  conditionLayer: DCTEConditionNode[];
  deltas: ConstraintDeltaVector[];
  constraintSpacePoints: ConstraintSpacePoint[];
  /** Link edges (function↔performance, function↔condition, condition↔performance). */
  constraintLinks: ConstraintLink[];
  /** Template-based completion proposals per delta. */
  completionProposals: CompletionProposal[];
}

/** Stage 2 – Structural intelligence layer (extensible for future bullets). */
export interface StructuralIntelligenceLayer {
  // Placeholder for future structural analysis; currently unused.
}

/** Warnings when requirement IDs suggest inconsistent numbering (e.g. PR-1, PR-2, PR-32 → expected PR-3). */
export type IdConsistencyWarning = {
  prefix: string;
  expectedNext: number;
  foundIds: string[];
  message: string;
};

export interface ExplicitRequirementMapping {
  /** Normalized requirement ID (e.g. FR-3, AG-001). */
  id: string;
  /** Raw ID as it appeared in the source (if available). */
  idRaw?: string;
  /** Clean requirement statement text. */
  statement: string;
  level?: RequirementLevel;
  tool?: RequirementManagementTool;
}

export interface RequirementsAnalyzeResponse {
  level: RequirementLevel;
  /** Document analysis source (DOORS, Polarion, Jama, or generic). */
  requirementManagementTool?: RequirementManagementTool;
  requirements: RequirementFinding[];
  conflicts: RequirementsConflict[];
  summary: {
    total: number;
    good: number;
    needsAttention: number;
    poor: number;
  };
  /** Present when analyzing a full specification (e.g. PDF upload) for design consistency and completeness. */
  designConsistencyAndCompleteness?: DesignConsistencyAndCompleteness;
  /** Multi-layer typed requirement graph (nodes by type, edges by type, constraint propagation weights). */
  requirementGraph?: RequirementGraph;
  /** ID sequence inconsistencies (e.g. PR-1, PR-2, PR-32 → expected PR-3 through PR-31). */
  idConsistencyWarnings?: IdConsistencyWarning[];
  /** Stage 2 – structural intelligence summary (state/mode coverage, etc.). */
  structuralIntelligence?: StructuralIntelligenceLayer;
  /** Stage 2 – requirement invariant synthesis & gap/risk analysis. */
  gapRiskAnalysis?: GapRiskAnalysis;
  /** Delta-Constraint Triangulation Engine (DCTE) result. */
  dcte?: DCTEResult;
  /** Explicit IDs parsed from the specification and their associated statements (no auto-generated IDs). */
  explicitRequirementMappings?: ExplicitRequirementMapping[];
  /** Convenience lookup: id → statement (only explicit IDs). */
  explicitRequirementMap?: Record<string, string>;
}

