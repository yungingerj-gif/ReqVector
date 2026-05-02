import type { ContradictionConfig } from "../config";
import type { CanonicalRequirement, TraceLinkInput } from "../types";
import { cosineSimilarity, l2Normalize } from "../embedding/semanticLayer";
import { jaccard, tokenSet } from "./textUtils";

export type HierarchyPair = {
  parent: CanonicalRequirement;
  child: CanonicalRequirement;
  via: "trace" | "similarity";
};

export type HierarchyEmbeddingBoost = {
  vectors: Map<string, number[]>;
  hierarchyMinCosine: number;
};

export function buildHierarchyPairs(
  parentReqs: CanonicalRequirement[],
  childReqs: CanonicalRequirement[],
  traceLinks: TraceLinkInput[] | undefined,
  cfg: ContradictionConfig,
  embeddingBoost?: HierarchyEmbeddingBoost | null
): HierarchyPair[] {
  const pmap = new Map(parentReqs.map((r) => [r.id, r]));
  const cmap = new Map(childReqs.map((r) => [r.id, r]));

  if (traceLinks && traceLinks.length > 0) {
    const out: HierarchyPair[] = [];
    for (const l of traceLinks) {
      const p = pmap.get(l.parent_requirement_id);
      const c = cmap.get(l.child_requirement_id);
      if (p && c) out.push({ parent: p, child: c, via: "trace" });
    }
    return out.slice(0, cfg.hierarchy_pair_budget * 3);
  }

  const out: HierarchyPair[] = [];
  const floor = cfg.hierarchy_similarity_floor;
  const useEmbed =
    Boolean(embeddingBoost?.vectors.size) && cfg.embedding_hierarchy_match && cfg.embedding_enabled;

  for (const c of childReqs) {
    let best: CanonicalRequirement | null = null;
    let bestScore = 0;
    const tc = tokenSet(c.normalized_text);
    const vc = useEmbed ? embeddingBoost!.vectors.get(c.id) : undefined;
    const nc = vc ? l2Normalize(vc) : null;

    for (const p of parentReqs) {
      const tp = tokenSet(p.normalized_text);
      const lexical = jaccard(tc, tp);
      let cos = 0;
      if (useEmbed && nc) {
        const vp = embeddingBoost!.vectors.get(p.id);
        if (vp) cos = cosineSimilarity(nc, l2Normalize(vp));
      }

      const passesLexical = lexical >= floor;
      const passesCos =
        useEmbed && cos >= embeddingBoost!.hierarchyMinCosine;
      if (!passesLexical && !passesCos) continue;

      let score: number;
      if (useEmbed && nc && embeddingBoost!.vectors.has(p.id)) {
        score = 0.46 * cos + 0.54 * lexical + (p.type === c.type ? 0.12 : 0);
      } else {
        score = lexical + (p.type === c.type ? 0.12 : 0);
      }

      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    if (best) out.push({ parent: best, child: c, via: "similarity" });
  }

  out.sort((a, b) => {
    const ja = jaccard(tokenSet(a.parent.normalized_text), tokenSet(a.child.normalized_text));
    const jb = jaccard(tokenSet(b.parent.normalized_text), tokenSet(b.child.normalized_text));
    return jb - ja;
  });
  return out.slice(0, cfg.hierarchy_pair_budget * 2);
}
