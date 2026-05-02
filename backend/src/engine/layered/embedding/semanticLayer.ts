import type { CanonicalRequirement } from "../types";
import type { ContradictionConfig } from "../config";
import { embedTextsOpenAI } from "./openaiEmbeddings";

export type SemanticEmbeddingContext = {
  model: string;
  dimensions: number;
  vectors: Map<string, number[]>;
  /** Undirected candidate pairs for intra-doc contradiction (canonical key aid::bid sorted). */
  neighborPairKeys: Set<string>;
  clusterByRequirementId: Map<string, number>;
};

export function pairKeySorted(idA: string, idB: string): string {
  return idA < idB ? `${idA}::${idB}` : `${idB}::${idA}`;
}

export function l2Normalize(vec: number[]): number[] {
  let s = 0;
  for (const x of vec) s += x * x;
  const n = Math.sqrt(s) || 1;
  return vec.map((x) => x / n);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i]! * b[i]!;
  return dot;
}

/** Top-K neighbors per requirement by cosine similarity (symmetric union). */
export function buildNeighborPairKeys(
  ids: string[],
  vectors: Map<string, number[]>,
  topK: number,
  minCosine: number
): Set<string> {
  const keys = new Set<string>();
  const normed = new Map<string, number[]>();
  for (const id of ids) {
    const v = vectors.get(id);
    if (v) normed.set(id, l2Normalize(v));
  }
  for (const id of ids) {
    const vi = normed.get(id);
    if (!vi) continue;
    const scored: { id: string; cos: number }[] = [];
    for (const other of ids) {
      if (other === id) continue;
      const vj = normed.get(other);
      if (!vj) continue;
      const cos = cosineSimilarity(vi, vj);
      if (cos >= minCosine) scored.push({ id: other, cos });
    }
    scored.sort((x, y) => y.cos - x.cos);
    for (const row of scored.slice(0, topK)) {
      keys.add(pairKeySorted(id, row.id));
    }
  }
  return keys;
}

class UnionFind {
  private readonly p: number[];
  constructor(n: number) {
    this.p = Array.from({ length: n }, (_, i) => i);
  }
  find(i: number): number {
    if (this.p[i] !== i) this.p[i] = this.find(this.p[i]!);
    return this.p[i]!;
  }
  union(i: number, j: number): void {
    const pi = this.find(i);
    const pj = this.find(j);
    if (pi !== pj) this.p[pi] = pj;
  }
}

/** Functional-ish clusters via union when cosine >= threshold. */
export function clusterRequirementsByEmbedding(
  ids: string[],
  vectors: Map<string, number[]>,
  mergeThreshold: number
): Map<string, number> {
  const present = ids.filter((id) => vectors.has(id));
  const n = present.length;
  const uf = new UnionFind(n);
  const normed = present.map((id) => l2Normalize(vectors.get(id)!));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (cosineSimilarity(normed[i]!, normed[j]!) >= mergeThreshold) {
        uf.union(i, j);
      }
    }
  }
  const rootToCluster = new Map<number, number>();
  let next = 0;
  const out = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const r = uf.find(i);
    let cid = rootToCluster.get(r);
    if (cid === undefined) {
      cid = next;
      next += 1;
      rootToCluster.set(r, cid);
    }
    out.set(present[i]!, cid);
  }
  return out;
}

/**
 * Embed child + parent requirements; build neighbor pair keys (child-child only) and clusters over full set.
 */
export async function buildSemanticEmbeddingContext(
  childReqs: CanonicalRequirement[],
  parentReqs: CanonicalRequirement[],
  cfg: ContradictionConfig
): Promise<SemanticEmbeddingContext | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || apiKey.length < 8) return null;

  const all: CanonicalRequirement[] = [...childReqs, ...parentReqs];
  if (all.length === 0) return null;

  const texts = all.map((r) => r.normalized_text || r.source_text);
  const embedded = await embedTextsOpenAI(apiKey, cfg.embedding_model, texts);
  if (!embedded || embedded.length !== all.length) return null;

  const vectors = new Map<string, number[]>();
  for (let i = 0; i < all.length; i++) {
    vectors.set(all[i]!.id, embedded[i]!);
  }

  const childIds = childReqs.map((r) => r.id);
  const neighborPairKeys = buildNeighborPairKeys(
    childIds,
    vectors,
    cfg.embedding_neighbor_top_k,
    cfg.embedding_neighbor_min_cosine
  );

  const clusterIds = [...new Set(all.map((r) => r.id))];
  const clusterByRequirementId = clusterRequirementsByEmbedding(
    clusterIds,
    vectors,
    cfg.embedding_cluster_min_cosine
  );

  const dim = embedded[0]?.length ?? 0;
  return {
    model: cfg.embedding_model,
    dimensions: dim,
    vectors,
    neighborPairKeys,
    clusterByRequirementId,
  };
}
