import { describe, expect, it } from "vitest";
import {
  buildNeighborPairKeys,
  clusterRequirementsByEmbedding,
  cosineSimilarity,
  l2Normalize,
  pairKeySorted,
} from "../../engine/layered/embedding/semanticLayer";

describe("semantic embedding layer helpers", () => {
  it("pairKeySorted is stable", () => {
    expect(pairKeySorted("b", "a")).toBe("a::b");
    expect(pairKeySorted("a", "b")).toBe("a::b");
  });

  it("cosineSimilarity on normalized vectors matches dot", () => {
    const a = l2Normalize([1, 0, 1]);
    const b = l2Normalize([1, 0, 0]);
    expect(cosineSimilarity(a, b)).toBeGreaterThan(0.7);
  });

  it("buildNeighborPairKeys keeps top-K symmetric neighbors", () => {
    const ids = ["r1", "r2", "r3"];
    const v1 = l2Normalize([1, 0, 0]);
    const v2 = l2Normalize([0.9, 0.1, 0]);
    const v3 = l2Normalize([0, 1, 0]);
    const vectors = new Map<string, number[]>([
      ["r1", v1],
      ["r2", v2],
      ["r3", v3],
    ]);
    const keys = buildNeighborPairKeys(ids, vectors, 2, 0.5);
    expect(keys.has(pairKeySorted("r1", "r2"))).toBe(true);
  });

  it("clusterRequirementsByEmbedding merges highly similar rows", () => {
    const ids = ["a", "b", "c"];
    const va = l2Normalize([1, 0]);
    const vb = l2Normalize([0.99, 0.01]);
    const vc = l2Normalize([0, 1]);
    const vectors = new Map<string, number[]>([
      ["a", va],
      ["b", vb],
      ["c", vc],
    ]);
    const clusters = clusterRequirementsByEmbedding(ids, vectors, 0.95);
    expect(clusters.get("a")).toBe(clusters.get("b"));
    expect(clusters.get("c")).not.toBe(clusters.get("a"));
  });
});
