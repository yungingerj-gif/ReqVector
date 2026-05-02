import { useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import { apiUrl } from "../apiBase";
import { ConstraintSpace3D } from "./ConstraintSpace3D";

type IncoseDimension =
  | "correct"
  | "unambiguous"
  | "complete"
  | "consistent"
  | "feasible"
  | "verifiable"
  | "singular"
  | "traceable";

type DimensionStatus = "pass" | "warn" | "fail";

type QualityCategoryResult = {
  status: "pass" | "warn" | "fail";
  issues: string[];
};

type RequirementType =
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

type TypeCriteriaResult = { met: string[]; missing: string[] };

/** Requirement level (V-model layers). */
type RequirementLevel = "stakeholder" | "system" | "subsystem" | "component" | "implementation";

type RequirementFinding = {
  id: string;
  text: string;
  status: "good" | "needs_attention" | "poor";
  dimensions: Record<IncoseDimension, DimensionStatus>;
  issues: string[];
  suggestion?: string;
  linguistic?: QualityCategoryResult;
  measurability?: QualityCategoryResult;
  embedded?: QualityCategoryResult;
  requirementType?: RequirementType;
  typeCriteria?: TypeCriteriaResult;
  level?: RequirementLevel;
  rippleSimulation?: { rippleImpactScore: number };
};

type DesignConsistencyAndCompleteness = {
  conflictCount: number;
  typeCoverage: Record<RequirementType, number>;
  traceabilityGaps: number;
  requirementsWithConsistencyWarn: number;
  highRippleImpactCount?: number;
  maxRippleImpactScore?: number;
};

type RequirementGraphEdgeType =
  | "depends-on"
  | "constrains"
  | "verifies"
  | "conflicts-with"
  | "derived-from"
  | "regulated-by";

type RequirementGraphNode = {
  id: string;
  type: RequirementType;
  text?: string;
};

type RequirementGraphEdge = {
  sourceId: string;
  targetId: string;
  edgeType: RequirementGraphEdgeType;
  weight: number;
};

type RequirementGraph = {
  nodes: RequirementGraphNode[];
  edges: RequirementGraphEdge[];
  nodePropagationWeights: Record<string, number>;
};
type StructuralIntelligenceLayer = {
  // Reserved for future structural intelligence outputs.
};

type InvariantType =
  | "max_bound"
  | "min_bound"
  | "stopping_distance"
  | "timeout"
  | "sensor_dependency"
  | "authority_gating"
  | "safety_guard";

type RequirementInvariant = {
  id: string;
  invariantType: InvariantType;
  expression: string;
  sourceRequirementIds: string[];
  notes?: string;
};

type GapRiskSeverity = "low" | "medium" | "high";

type ViolationScenario = {
  id: string;
  invariantId: string;
  description: string;
  hasDefinedBehavior: boolean;
  supportingRequirementIds: string[];
  riskTags: string[];
};

type GapRiskFinding = {
  id: string;
  severity: GapRiskSeverity;
  message: string;
  invariantId?: string;
  scenarioId?: string;
  relatedRequirementIds: string[];
  tags: string[];
};

type GapRiskAnalysis = {
  invariants: RequirementInvariant[];
  scenarios: ViolationScenario[];
  findings: GapRiskFinding[];
};

type DCTEDeltaKind =
  | "function_without_measurable_bound"
  | "performance_bound_without_triggering_condition"
  | "condition_without_defined_behavior"
  | "derived_function_missing_upstream_justification";

type ConstraintDeltaVector = {
  id: string;
  kind: DCTEDeltaKind;
  requirementId: string;
  from: string;
  to: string;
  magnitude: number;
  riskScore: number;
  severity: "low" | "med" | "high";
  expectationRuleId?: string;
  message: string;
  evidenceSpans?: { fromSpans?: { start: number; end: number }[]; toSpans?: { start: number; end: number }[] };
  suggestedDomain: "functional" | "performance" | "condition";
};

type ConstraintLink = {
  id: string;
  requirementId: string;
  fromDomain: string;
  toDomain: string;
  linkType: "binds" | "constrains" | "triggers";
  strength: number;
};

type CompletionProposal = {
  requirementId: string;
  deltaId: string;
  missingDomains: string[];
  suggestedText: string;
  placeholders: string[];
  rationale: string;
};

type ConstraintSpacePoint = {
  requirementId: string;
  x: number;
  y: number;
  z: number;
  requirementType?: string;
  subsystem?: string;
};

type DCTEResult = {
  structuredConstraints: unknown[];
  constraintTuples: unknown[];
  functionalLayer: { requirementId: string; functionSummary: string; hasPerformanceBound: boolean; hasCondition: boolean }[];
  performanceLayer: { requirementId: string; boundSummary: string; hasCondition: boolean; hasFunction: boolean }[];
  conditionLayer: { requirementId: string; conditionSummary: string; hasDefinedBehavior: boolean; hasBound: boolean }[];
  deltas: ConstraintDeltaVector[];
  constraintSpacePoints: ConstraintSpacePoint[];
  constraintLinks?: ConstraintLink[];
  completionProposals?: CompletionProposal[];
};

function buildCriteriaNote(
  criterion: string,
  r: RequirementFinding,
  kind: "met" | "missing"
): string {
  const typePrefix = r.requirementType ? `${r.requirementType} – ` : "";
  let note = `${typePrefix}${criterion}`;

  if (kind === "missing") {
    // If measurability is weak and the criterion mentions measurement-related words, call that out.
    const measStatus = r.measurability?.status;
    if (
      measStatus &&
      measStatus !== "pass" &&
      /measure|numeric|unit|tolerance|limit|bounds?/i.test(criterion)
    ) {
      note += " (this aligns with measurability issues already flagged).";
    }

    // If traceability is weak and the criterion mentions trace/parent/source, link it.
    const traceStatus = r.dimensions.traceable;
    if (
      traceStatus !== "pass" &&
      /trace|parent requirement|stakeholder|source|hazard|threat/i.test(criterion)
    ) {
      note += " (traceability is currently weak for this requirement).";
    }
  }

  return note;
}

type IdConsistencyWarning = {
  prefix: string;
  expectedNext: number;
  foundIds: string[];
  message: string;
};

type RequirementManagementTool = "generic" | "doors" | "polarion" | "jama";

type AnalysisResponse = {
  level: RequirementLevel;
  requirementManagementTool?: RequirementManagementTool;
  explicitRequirementMappings?: { id: string; text: string; level?: RequirementLevel }[];
  requirements: RequirementFinding[];
  conflicts: { requirementIds: string[]; description: string }[];
  summary: { total: number; good: number; needsAttention: number; poor: number };
  designConsistencyAndCompleteness?: DesignConsistencyAndCompleteness;
  requirementGraph?: RequirementGraph;
  idConsistencyWarnings?: IdConsistencyWarning[];
  structuralIntelligence?: StructuralIntelligenceLayer;
  gapRiskAnalysis?: GapRiskAnalysis;
  dcte?: DCTEResult;
};

const TOOL_LABELS: Record<RequirementManagementTool, string> = {
  generic: "Generic",
  doors: "DOORS (IBM)",
  polarion: "Polarion (Siemens)",
  jama: "Jama",
};

const LEVEL_LABELS: Record<RequirementLevel, string> = {
  stakeholder: "Stakeholder requirements",
  system: "System requirements",
  subsystem: "Subsystem requirements",
  component: "Component requirements",
  implementation: "Implementation requirements",
};

const dimensions: IncoseDimension[] = [
  "correct",
  "unambiguous",
  "complete",
  "consistent",
  "feasible",
  "verifiable",
  "singular",
  "traceable",
];

function badgeClass(status: DimensionStatus) {
  if (status === "pass") return "badge pass";
  if (status === "fail") return "badge fail";
  return "badge warn";
}

export function RequirementsTool() {
  const [context, setContext] = useState("");
  const [rawText, setRawText] = useState(
    [
      "REQ-001: The system shall respond fast to operator inputs.",
      "REQ-002: Maximum latency shall be 50 ms.",
      "REQ-003: Maximum latency shall be 20 ms.",
    ].join("\n")
  );
  const [strictIncose, setStrictIncose] = useState(true);
  const [level, setLevel] = useState<RequirementLevel>("system");
  const [requirementManagementTool, setRequirementManagementTool] = useState<RequirementManagementTool>("generic");
  const [specFile, setSpecFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);

  const stats = useMemo(() => {
    if (!analysis) return null;
    return analysis.summary;
  }, [analysis]);

  const handleAnalyze = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/requirements/analyze"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: context.trim() ? context.trim() : undefined,
          rawText,
          options: { strictIncose, level, requirementManagementTool },
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Request failed");
      }
      const data: AnalysisResponse = await res.json();
      setAnalysis(data);
    } catch (e: any) {
      setError(e?.message ?? "Unexpected error");
      setAnalysis(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnalyzeSpecification = async () => {
    if (!specFile) {
      setError("Select a PDF or Word file first.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("specification", specFile);
      formData.append("options", JSON.stringify({ strictIncose, level, requirementManagementTool }));
      const res = await fetch(apiUrl("/api/requirements/analyze-specification"), {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Request failed");
      }
      const data: AnalysisResponse = await res.json();
      setAnalysis(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unexpected error");
      setAnalysis(null);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="panel">
      <div className="req-grid">
        <div className="field-group">
          <h3>Context (optional)</h3>
          <label>
            System / project context
            <textarea
              className="textarea"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Example: Excavator boom control ECU. Battery-powered. Outdoor operation -20°C to 50°C."
              rows={5}
            />
          </label>
          <label className="inline">
            Requirement level
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value as RequirementLevel)}
              className="level-select"
            >
              {(Object.keys(LEVEL_LABELS) as RequirementLevel[]).map((l) => (
                <option key={l} value={l}>{LEVEL_LABELS[l]}</option>
              ))}
            </select>
          </label>
          <label className="inline">
            Document source
            <select
              value={requirementManagementTool}
              onChange={(e) => setRequirementManagementTool(e.target.value as RequirementManagementTool)}
              className="level-select"
            >
              {(Object.keys(TOOL_LABELS) as RequirementManagementTool[]).map((t) => (
                <option key={t} value={t}>{TOOL_LABELS[t]}</option>
              ))}
            </select>
          </label>
          <label className="inline">
            <input
              type="checkbox"
              checked={strictIncose}
              onChange={(e) => setStrictIncose(e.target.checked)}
            />
            Strict INCOSE mode (flags “should/may/could”, prefers “shall”)
          </label>
          <button className="primary" onClick={handleAnalyze} disabled={isLoading}>
            {isLoading ? "Analyzing…" : "Analyze"}
          </button>
          <div className="field-group" style={{ marginTop: "1rem" }}>
            <h3>Or upload specification (PDF or Word)</h3>
            <p className="help">
              Upload a PDF or Word (.docx) specification to analyze requirement quality and design consistency &amp; completeness.
            </p>
            <label>
              <input
                type="file"
                accept=".pdf,application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => setSpecFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <button
              type="button"
              className="primary"
              onClick={handleAnalyzeSpecification}
              disabled={isLoading || !specFile}
            >
              {isLoading ? "Analyzing…" : "Analyze specification"}
            </button>
          </div>
          {error && <p className="error">{error}</p>}
          {stats && (
            <div className="summary">
              <div>
                <strong>Total</strong>
                <div>{stats.total}</div>
              </div>
              <div>
                <strong>Good</strong>
                <div>{stats.good}</div>
              </div>
              <div>
                <strong>Needs attention</strong>
                <div>{stats.needsAttention}</div>
              </div>
              <div>
                <strong>Poor</strong>
                <div>{stats.poor}</div>
              </div>
            </div>
          )}
        </div>

        <div className="field-group">
          <h3>Requirements</h3>
          <label>
            Paste requirements (one per line, or prefixed with an ID like “REQ-001:”)
            <textarea
              className="textarea"
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              rows={16}
            />
          </label>
        </div>
      </div>

      {analysis && (
        <div className="results">
          <h3>
            {LEVEL_LABELS[analysis.level] ?? "Findings"}
            {analysis.requirementManagementTool && analysis.requirementManagementTool !== "generic" && (
              <span className="req-tool-badge"> · {TOOL_LABELS[analysis.requirementManagementTool]}</span>
            )}
          </h3>

          {analysis.conflicts.length > 0 && (
            <div className="conflicts">
              <h4>Potential conflicts</h4>
              <ul>
                {analysis.conflicts.map((c, idx) => (
                  <li key={idx}>
                    <strong>{c.requirementIds.join(", ")}</strong>: {c.description}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {analysis.idConsistencyWarnings && analysis.idConsistencyWarnings.length > 0 && (
            <div className="conflicts id-consistency">
              <h4>ID sequence inconsistency</h4>
              <ul>
                {analysis.idConsistencyWarnings.map((w, idx) => (
                  <li key={idx}>
                    <strong>{w.prefix}</strong>: {w.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {analysis.designConsistencyAndCompleteness && (
            <div className="design-summary">
              <h4>Design consistency &amp; completeness</h4>
              <ul>
                <li>
                  <strong>Conflicts:</strong> {analysis.designConsistencyAndCompleteness.conflictCount} potential numeric inconsistency group(s)
                </li>
                <li>
                  <strong>Requirements with consistency warning:</strong> {analysis.designConsistencyAndCompleteness.requirementsWithConsistencyWarn}
                </li>
                <li>
                  <strong>Traceability gaps:</strong> {analysis.designConsistencyAndCompleteness.traceabilityGaps} requirement(s) without explicit ID
                </li>
                <li>
                  <strong>Type coverage:</strong>{" "}
                  {Object.entries(analysis.designConsistencyAndCompleteness.typeCoverage)
                    .filter(([, count]) => count > 0)
                    .map(([type, count]) => `${type} (${count})`)
                    .join(", ") || "—"}
                </li>
              </ul>
            </div>
          )}

          {analysis.gapRiskAnalysis && analysis.gapRiskAnalysis.findings.length > 0 && (
            <div className="design-summary gap-risk-summary">
              <h4>Gap &amp; risk analysis (invariant simulation)</h4>
              <ul>
                {analysis.gapRiskAnalysis.findings.slice(0, 8).map((g) => (
                  <li key={g.id}>
                    <strong className={`gap-badge ${g.severity}`}>{g.severity}</strong> {g.message}
                  </li>
                ))}
                {analysis.gapRiskAnalysis.findings.length > 8 && (
                  <li>+{analysis.gapRiskAnalysis.findings.length - 8} more potential gaps…</li>
                )}
              </ul>
            </div>
          )}

          {analysis.dcte && (analysis.dcte.constraintSpacePoints?.length > 0 || analysis.dcte.deltas.length > 0 || (analysis.dcte.constraintLinks?.length ?? 0) > 0 || (analysis.dcte.completionProposals?.length ?? 0) > 0 || analysis.dcte.functionalLayer.length > 0) && (
            <details className="req-graph-section dcte-section" open>
              <summary>Interactive 3D Constraint Space (DCTE)</summary>
              <div className="req-graph-content">
                <p className="req-graph-summary">
                  X = Functional completeness, Y = Performance completeness, Z = Condition completeness. Perfect requirements cluster near (1,1,1). Sparse regions highlight imbalance and risk pockets.
                </p>
                {analysis.dcte.constraintSpacePoints && analysis.dcte.constraintSpacePoints.length > 0 && (
                  <ConstraintSpace3D points={analysis.dcte.constraintSpacePoints} />
                )}
                {analysis.dcte.deltas.length > 0 && (
                  <>
                    <h5>Constraint delta vectors (directional, scored)</h5>
                    <ul className="dcte-deltas">
                      {analysis.dcte.deltas.map((d) => (
                        <li key={d.id}>
                          <span className={`dcte-tag dcte-${d.suggestedDomain}`}>{d.suggestedDomain}</span>
                          {" "}
                          {d.from != null && d.to != null && (
                            <span className="dcte-vector">{" "}{d.from}→{d.to}</span>
                          )}
                          {" "}
                          <span className="dcte-req">{d.requirementId}</span>
                          {d.riskScore != null && <span className="dcte-risk"> risk {d.riskScore}</span>}
                          {d.severity && <span className={`dcte-severity dcte-severity-${d.severity}`}> {d.severity}</span>}
                          : {d.message}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {analysis.dcte.constraintLinks && analysis.dcte.constraintLinks.length > 0 && (
                  <>
                    <h5>Constraint links (triangulation edges)</h5>
                    <ul className="dcte-links">
                      {analysis.dcte.constraintLinks.map((link) => (
                        <li key={link.id}>
                          <span className="dcte-req">{link.requirementId}</span>{" "}
                          <span className="dcte-link-edge">{link.fromDomain} —{link.linkType}→ {link.toDomain}</span>
                          {" "}(strength {link.strength.toFixed(2)})
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {analysis.dcte.completionProposals && analysis.dcte.completionProposals.length > 0 && (
                  <>
                    <h5>Completion proposals</h5>
                    <ul className="dcte-proposals">
                      {analysis.dcte.completionProposals.map((p) => (
                        <li key={p.deltaId}>
                          <span className="dcte-req">{p.requirementId}</span> ({p.rationale})
                          <div className="dcte-proposal-text">{p.suggestedText}</div>
                          {p.placeholders.length > 0 && <span className="dcte-placeholders">Placeholders: {p.placeholders.join(", ")}</span>}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </details>
          )}

          {analysis.explicitRequirementMappings && analysis.explicitRequirementMappings.length > 0 && (
            <details className="req-graph-section">
              <summary>Explicit IDs and requirement statements</summary>
              <div className="req-graph-content">
                <p className="req-graph-summary">
                  Parsed IDs from the specification (excluding auto-generated IDs) and their associated requirement statements.
                </p>
                <ul className="dcte-deltas">
                  {analysis.explicitRequirementMappings.map((m) => (
                    <li key={m.id}>
                      <span className="dcte-req">{m.id}</span>: {m.text}
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          )}

          {analysis.requirementGraph && (
            <details className="req-graph-section">
              <summary>Multi-layer requirement graph (typed nodes + edges, constraint propagation)</summary>
              <div className="req-graph-content">
                <p className="req-graph-summary">
                  {analysis.requirementGraph.nodes.length} nodes, {analysis.requirementGraph.edges.length} edges. Propagation weight = sum of incoming edge weights.
                </p>
                <div className="req-graph-grid">
                  <div className="req-graph-block">
                    <h5>Nodes by type</h5>
                    {Object.entries(
                      analysis.requirementGraph.nodes.reduce<Record<string, RequirementGraphNode[]>>((acc, n) => {
                        const t = n.type;
                        if (!acc[t]) acc[t] = [];
                        acc[t].push(n);
                        return acc;
                      }, {})
                    ).map(([type, list]) => (
                      <div key={type} className="req-graph-nodes">
                        <strong>{type}</strong>
                        <ul>
                          {list.map((n) => (
                            <li key={n.id}>
                              <span className="req-graph-node-id">{n.id}</span>
                              <span className="req-graph-prop">prop: {(analysis.requirementGraph!.nodePropagationWeights[n.id] ?? 0).toFixed(2)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                  <div className="req-graph-block">
                    <h5>Edges by type</h5>
                    {Object.entries(
                      analysis.requirementGraph.edges.reduce<Record<string, RequirementGraphEdge[]>>((acc, e) => {
                        const t = e.edgeType;
                        if (!acc[t]) acc[t] = [];
                        acc[t].push(e);
                        return acc;
                      }, {})
                    ).map(([edgeType, list]) => (
                      <div key={edgeType} className="req-graph-edges">
                        <strong>{edgeType}</strong>
                        <ul>
                          {list.slice(0, 20).map((e, idx) => (
                            <li key={idx}>
                              {e.sourceId} → {e.targetId} <span className="req-graph-weight">(w: {e.weight.toFixed(2)})</span>
                            </li>
                          ))}
                          {list.length > 20 && <li className="req-graph-more">+{list.length - 20} more</li>}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </details>
          )}

          <div className="req-cards">
            {analysis.requirements.map((r) => (
              <article key={r.id} className={`req-card ${r.status}`}>
                <div className="req-card-header">
                  <div className="req-id">{r.id}</div>
                  <div className="req-header-right">
                    {(r.level ?? analysis.level) && (
                      <span className="req-level-badge">{r.level ?? analysis.level}</span>
                    )}
                    {r.requirementType && (
                      <span className="req-type-badge">{r.requirementType}</span>
                    )}
                    <div className={`req-status ${r.status}`}>
                      {r.status.replace("_", " ")}
                    </div>
                  </div>
                </div>
                <div className="req-text">{r.text}</div>
                {r.requirementType && r.typeCriteria && (
                  <div className="type-criteria">
                    <div className="type-criteria-section">
                      <span className="type-criteria-label">Criteria met:</span>
                      <ul>
                        {r.typeCriteria.met.slice(0, 5).map((c, i) => (
                          <li key={i} className="criteria-met">
                            {buildCriteriaNote(c, r, "met")}
                          </li>
                        ))}
                        {r.typeCriteria.met.length > 5 && (
                          <li className="criteria-more">+{r.typeCriteria.met.length - 5} more</li>
                        )}
                      </ul>
                    </div>
                    {r.typeCriteria.missing.length > 0 && (
                      <div className="type-criteria-section">
                        <span className="type-criteria-label">Criteria to consider:</span>
                        <ul>
                          {r.typeCriteria.missing.slice(0, 5).map((c, i) => (
                            <li key={i} className="criteria-missing">
                              {buildCriteriaNote(c, r, "missing")}
                            </li>
                          ))}
                          {r.typeCriteria.missing.length > 5 && (
                            <li className="criteria-more">+{r.typeCriteria.missing.length - 5} more</li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
                <div className="badges">
                  {dimensions.map((d) => (
                    <span key={d} className={badgeClass(r.dimensions[d])}>
                      {d}
                    </span>
                  ))}
                </div>
                {r.issues.length > 0 && (
                  <ul className="issues">
                    {r.issues.map((i, idx) => (
                      <li key={idx}>{i}</li>
                    ))}
                  </ul>
                )}
                {r.suggestion && (
                  <div className="suggestion">
                    <div className="suggestion-label">Suggested rewrite:</div>
                    <div className="suggestion-text">{r.suggestion}</div>
                  </div>
                )}
                {/* Stage 1 – Quality categories */}
                {(r.linguistic || r.measurability || r.embedded) && (
                  <div className="stage1-categories">
                    {r.linguistic && (
                      <div className="stage1-cat">
                        <span className={`badge ${badgeClass(r.linguistic.status as DimensionStatus)}`}>Linguistic</span>
                        {r.linguistic.issues.length > 0 && (
                          <ul className="issues">
                            {r.linguistic.issues.map((i, idx) => (
                              <li key={idx}>{i}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                    {r.measurability && (
                      <div className="stage1-cat">
                        <span className={`badge ${badgeClass(r.measurability.status as DimensionStatus)}`}>Measurability</span>
                        {r.measurability.issues.length > 0 && (
                          <ul className="issues">
                            {r.measurability.issues.map((i, idx) => (
                              <li key={idx}>{i}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                    {r.embedded && (
                      <div className="stage1-cat">
                        <span className={`badge ${badgeClass(r.embedded.status as DimensionStatus)}`}>Embedded</span>
                        {r.embedded.issues.length > 0 && (
                          <ul className="issues">
                            {r.embedded.issues.map((i, idx) => (
                              <li key={idx}>{i}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>

          <div className="export-actions">
            <button
              type="button"
              className="primary"
              onClick={() => exportPdfAudit(analysis)}
            >
              Export PDF audit
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function exportPdfAudit(data: AnalysisResponse) {
  const doc = new jsPDF({ format: "a4", unit: "mm" });
  const margin = 18;
  const pageW = 210; // A4 width in mm
  let y = margin;
  const wrapW = pageW - 2 * margin;

  function addText(str: string, opts?: { font?: string; size?: number }) {
    const font = opts?.font ?? "helvetica";
    const size = opts?.size ?? 10;
    doc.setFont(font, "normal");
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(str, wrapW);
    doc.text(lines, margin, y);
    y += lines.length * (size * 0.35 + 1);
  }

  function addSpace(mm: number) {
    y += mm;
  }

  doc.setFontSize(16);
  doc.text("ReqVector – Audit Report", margin, y);
  y += 10;
  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toISOString().slice(0, 19).replace("T", " ")}`, margin, y);
  y += 4;
  const levelLabel = LEVEL_LABELS[data.level] ?? data.level;
  doc.text(`Level: ${levelLabel}`, margin, y);
  y += 8;

  addText("Summary: " + [
    `Total ${data.summary.total}`,
    `Good ${data.summary.good}`,
    `Needs attention ${data.summary.needsAttention}`,
    `Poor ${data.summary.poor}`,
  ].join(" | "));
  addSpace(6);

  const design = data.designConsistencyAndCompleteness;
  if (design && (design.highRippleImpactCount != null || design.maxRippleImpactScore != null)) {
    addText("Ripple (predictive): " + [
      design.highRippleImpactCount != null ? `High-impact (≥5): ${design.highRippleImpactCount}` : "",
      design.maxRippleImpactScore != null ? `Max score: ${design.maxRippleImpactScore.toFixed(1)}` : "",
    ].filter(Boolean).join(" | "));
    addSpace(4);
  }

  const graph = data.requirementGraph;
  if (graph) {
    addText(`Multi-layer graph: ${graph.nodes.length} nodes, ${graph.edges.length} edges (typed; constraint propagation weights).`);
    addSpace(4);
  }

  if (data.idConsistencyWarnings && data.idConsistencyWarnings.length > 0) {
    addText("ID sequence inconsistency:", { size: 11 });
    addSpace(2);
    data.idConsistencyWarnings.forEach((w) => {
      addText(`${w.prefix}: ${w.message}`);
    });
    addSpace(6);
  }

  if (data.conflicts.length > 0) {
    addText("Potential conflicts:", { size: 11 });
    addSpace(2);
    data.conflicts.forEach((c) => {
      addText(`${c.requirementIds.join(", ")}: ${c.description}`);
    });
    addSpace(6);
  }

  if (design) {
    addText("Design consistency & completeness:", { size: 11 });
    addSpace(2);
    addText(`Conflicts: ${design.conflictCount} | Consistency warnings: ${design.requirementsWithConsistencyWarn} | Traceability gaps: ${design.traceabilityGaps}`);
    addText("Type coverage: " + Object.entries(design.typeCoverage).filter(([, n]) => n > 0).map(([t, n]) => `${t} (${n})`).join(", ") || "—");
    addSpace(6);
  }

  data.requirements.forEach((r) => {
    if (y > 260) {
      doc.addPage();
      y = margin;
    }
    addText(`REQ ${r.id} [${r.status}]${r.requirementType ? ` Type: ${r.requirementType}` : ""}${r.rippleSimulation != null ? ` Ripple: ${r.rippleSimulation.rippleImpactScore.toFixed(1)}` : ""}`, { size: 11 });
    addSpace(2);
    addText(r.text);
    addSpace(2);
    if (r.typeCriteria && (r.typeCriteria.met.length > 0 || r.typeCriteria.missing.length > 0)) {
      addText("Type criteria met: " + r.typeCriteria.met.slice(0, 3).join("; "));
      if (r.typeCriteria.missing.length > 0) {
        addText("Type criteria to consider: " + r.typeCriteria.missing.slice(0, 3).join("; "));
      }
      addSpace(2);
    }
    const dims = Object.entries(r.dimensions)
      .filter(([, v]) => v !== "pass")
      .map(([k, v]) => `${k}: ${v}`)
      .join("; ");
    if (dims) addText("Dimensions: " + dims);
    if (r.linguistic?.issues?.length) {
      addText("Linguistic: " + r.linguistic.issues.join(" "));
    }
    if (r.measurability?.issues?.length) {
      addText("Measurability: " + r.measurability.issues.join(" "));
    }
    if (r.embedded?.issues?.length) {
      addText("Embedded: " + r.embedded.issues.join(" "));
    }
    if (r.suggestion) {
      addText("Suggested: " + r.suggestion);
    }
    addSpace(8);
  });

  doc.save("requirements-audit.pdf");
}

