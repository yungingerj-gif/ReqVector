import type {
  RequirementFinding,
  RequirementGraph,
  RequirementGraphEdge,
  RequirementGraphEdgeType,
  RequirementGraphNode,
  RequirementsConflict,
} from "../models/requirements";
import { extractReferencedIds } from "./rippleRiskSimulationService";

/** Normalize ID for graph lookup (same as ripple service). */
function normalizeId(raw: string): string {
  return raw.replace(/\s+/g, "-").replace(/_/g, "-").toUpperCase().trim();
}

/** Constraint propagation weight by edge type (0–1). Stronger constraints carry higher weight. */
const EDGE_TYPE_WEIGHTS: Record<RequirementGraphEdgeType, number> = {
  "conflicts-with": 1.0,
  constrains: 0.8,
  verifies: 0.7,
  "derived-from": 0.6,
  "regulated-by": 0.6,
  "depends-on": 0.5,
};

/**
 * Infer edge type when requirement D references requirement R (D → R).
 * D is the "source" of the edge (dependent), R is the "target" (dependency).
 */
function inferEdgeType(
  sourceFinding: RequirementFinding,
  _targetFinding: RequirementFinding
): RequirementGraphEdgeType {
  const t = sourceFinding.requirementType;
  if (t === "verification") return "verifies";
  if (t === "derived") return "derived-from";
  if (t === "regulatory") return "regulated-by";
  if (t === "constraint") return "constrains";
  return "depends-on";
}

/**
 * Build the multi-layer requirement graph: typed nodes (by requirement type) and
 * typed edges (depends-on, constrains, verifies, conflicts-with, derived-from, regulated-by)
 * with constraint propagation weighting.
 */
export function buildRequirementGraph(
  findings: RequirementFinding[],
  conflicts: RequirementsConflict[]
): RequirementGraph {
  const idToFinding = new Map<string, RequirementFinding>();
  for (const f of findings) idToFinding.set(normalizeId(f.id), f);

  const nodes: RequirementGraphNode[] = findings.map((f) => ({
    id: f.id,
    type: f.requirementType ?? "functional",
    text: f.text.slice(0, 120) + (f.text.length > 120 ? "…" : ""),
  }));

  const edgeKey = (a: string, b: string, type: RequirementGraphEdgeType) =>
    `${normalizeId(a)}→${normalizeId(b)}:${type}`;
  const seenEdges = new Set<string>();
  const edges: RequirementGraphEdge[] = [];

  // Edges from traceability references: D references R → edge D --[type]--> R (D depends on R)
  for (const source of findings) {
    const refs = extractReferencedIds(source.text, source.id);
    for (const refId of refs) {
      const targetFinding = idToFinding.get(refId);
      if (!targetFinding) continue;
      const type = inferEdgeType(source, targetFinding);
      const key = edgeKey(source.id, targetFinding.id, type);
      if (seenEdges.has(key)) continue;
      seenEdges.add(key);
      edges.push({
        sourceId: source.id,
        targetId: targetFinding.id,
        edgeType: type,
        weight: EDGE_TYPE_WEIGHTS[type],
      });
    }
  }

  // Edges from conflicts: symmetric conflicts-with
  for (const c of conflicts) {
    const ids = [...c.requirementIds];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i]!;
        const b = ids[j]!;
        const key = edgeKey(a, b, "conflicts-with");
        if (seenEdges.has(key)) continue;
        seenEdges.add(key);
        const w = EDGE_TYPE_WEIGHTS["conflicts-with"];
        edges.push({ sourceId: a, targetId: b, edgeType: "conflicts-with", weight: w });
        edges.push({ sourceId: b, targetId: a, edgeType: "conflicts-with", weight: w });
      }
    }
  }

  // Constraint propagation: per-node score = sum of incoming edge weights
  const nodePropagationWeights: Record<string, number> = {};
  for (const n of nodes) nodePropagationWeights[n.id] = 0;
  for (const e of edges) {
    const targetNorm = normalizeId(e.targetId);
    const id = findings.find((f) => normalizeId(f.id) === targetNorm)?.id ?? e.targetId;
    nodePropagationWeights[id] = (nodePropagationWeights[id] ?? 0) + e.weight;
  }

  return {
    nodes,
    edges,
    nodePropagationWeights,
  };
}
