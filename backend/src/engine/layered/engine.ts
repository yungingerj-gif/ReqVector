import { createAiClientFromEnv, wrapAiClientWithOrganizationContext, type AiClient } from "./ai/aiClient";
import { runAiAttributeAnalysis } from "./ai/attributeScoring";
import {
  isBlockEnabled,
  loadEngineConfig,
  resolveProfile,
  type EngineConfig,
} from "./config";
import {
  runComplete,
  runConsistentCorrect,
  runSingular,
  runUnambiguous,
  runVerifiable,
} from "./deterministic";
import type { DeterministicContext } from "./deterministic/ruleContext";
import { augmentLegacyWithAi, reconstructLegacyHeuristic } from "./legacyReconstruction";
import {
  normalizeParentRequirementsForHierarchy,
  normalizeToCanonicalRequirements,
} from "./normalizeCanonical";
import { scoreRequirements } from "./scoring";
import { runIntraDocumentContradictions } from "./contradiction/runIntraDocument";
import { runParentChildContradictions } from "./contradiction/runParentChild";
import { dedupeSoftCrossPairs, runSetLevelCrossRequirement } from "./setLevel/crossConsistency";
import { runCrossSameIntentAi } from "./setLevel/crossIntentAi";
import { buildSemanticEmbeddingContext, type SemanticEmbeddingContext } from "./embedding/semanticLayer";
import type {
  CanonicalRequirement,
  EngineRunOptions,
  LayeredAnalysisResult,
  LegacyReconstructionResult,
  PerRequirementResult,
  SemanticEmbeddingMeta,
  StructuredFinding,
} from "./types";

const DETERMINISTIC: Array<{
  blockId: string;
  run: (req: CanonicalRequirement, ctx: DeterministicContext) => StructuredFinding[];
}> = [
  { blockId: "deterministic.unambiguous", run: runUnambiguous },
  { blockId: "deterministic.complete", run: runComplete },
  { blockId: "deterministic.verifiable", run: runVerifiable },
  { blockId: "deterministic.singular", run: runSingular },
  { blockId: "deterministic.consistent_correct", run: runConsistentCorrect },
];

export async function runLayeredEngine(
  options: EngineRunOptions,
  config: EngineConfig,
  aiClient?: AiClient
): Promise<LayeredAnalysisResult> {
  const profile = resolveProfile(config, options.profile);
  const baseClient = aiClient ?? createAiClientFromEnv();
  const client = wrapAiClientWithOrganizationContext(baseClient, options.ai_organization_context);

  const requirements = normalizeToCanonicalRequirements(
    options.rawText,
    config,
    options.parseOptions
  );

  const ctx: DeterministicContext = { config, allRequirements: requirements };
  const perReq = new Map<string, StructuredFinding[]>();
  for (const r of requirements) {
    perReq.set(r.id, []);
  }

  for (const r of requirements) {
    const bucket = perReq.get(r.id)!;
    for (const { blockId, run } of DETERMINISTIC) {
      if (!isBlockEnabled(config, profile, blockId)) continue;
      bucket.push(...run(r, ctx));
    }
  }

  const aiAttributeOn =
    profile.ai_attribute_analysis && isBlockEnabled(config, profile, "ai.attribute_analysis");

  if (aiAttributeOn) {
    for (const r of requirements) {
      const bucket = perReq.get(r.id)!;
      const extra = await runAiAttributeAnalysis(r, [...bucket], client);
      bucket.push(...extra);
    }
  }

  const legacyBlockOn = isBlockEnabled(config, profile, "legacy.reconstruction");
  const runLegacy = options.mode === "legacy" && legacyBlockOn;
  const legacyById = new Map<string, LegacyReconstructionResult>();

  if (runLegacy) {
    for (const r of requirements) {
      let leg = reconstructLegacyHeuristic(r, perReq.get(r.id) ?? []);
      if (profile.ai_legacy_augment) {
        leg = await augmentLegacyWithAi(leg, r, client);
      }
      legacyById.set(r.id, leg);
    }
  }

  let setLevel: StructuredFinding[] = [];
  if (isBlockEnabled(config, profile, "setLevel.cross_requirement")) {
    setLevel = runSetLevelCrossRequirement(requirements, config);
    if (config.set_level_cross.ai_same_intent_enabled) {
      const intentFindings = await runCrossSameIntentAi(requirements, config, client);
      setLevel = dedupeSoftCrossPairs([...setLevel, ...intentFindings]);
    }
  }

  const intraOn = isBlockEnabled(config, profile, "contradiction.intra_document");
  const parentText = options.parent_raw_text?.trim() ?? "";
  const parentReqs =
    parentText.length > 0
      ? normalizeParentRequirementsForHierarchy(parentText, config, options.parseOptions)
      : [];
  const parentSourceLabel =
    options.parent_source_document?.trim() ||
    (parentReqs.length > 0 ? "Parent specification" : undefined);
  const hierarchyOn =
    parentReqs.length > 0 && isBlockEnabled(config, profile, "contradiction.parent_child");

  let semanticCtx: SemanticEmbeddingContext | null = null;
  let semanticEmbeddingMeta: SemanticEmbeddingMeta | undefined;

  if (config.contradiction.embedding_enabled) {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!intraOn && !hierarchyOn) {
      semanticEmbeddingMeta = {
        enabled: false,
        skipped_reason: "contradiction_passes_disabled",
      };
    } else if (!apiKey || apiKey.length < 8) {
      semanticEmbeddingMeta = {
        enabled: false,
        skipped_reason: "OPENAI_API_KEY not set",
      };
    } else {
      semanticCtx = await buildSemanticEmbeddingContext(requirements, parentReqs, config.contradiction);
      if (semanticCtx) {
        semanticEmbeddingMeta = {
          enabled: true,
          model: semanticCtx.model,
          dimensions: semanticCtx.dimensions,
          cluster_count: new Set(semanticCtx.clusterByRequirementId.values()).size,
          neighbor_pair_count: semanticCtx.neighborPairKeys.size,
          intra_prefilter_applied: intraOn && semanticCtx.neighborPairKeys.size > 0,
          hierarchy_embedding_boost:
            hierarchyOn &&
            parentReqs.length > 0 &&
            config.contradiction.embedding_hierarchy_match,
        };
      } else {
        semanticEmbeddingMeta = {
          enabled: false,
          skipped_reason: "embedding_request_failed",
        };
      }
    }
  }

  let intraPairsExamined = 0;
  let hierarchyPairsExamined = 0;
  const contradictionFindings: StructuredFinding[] = [];

  if (intraOn) {
    const intra = await runIntraDocumentContradictions(requirements, config, profile, client, semanticCtx);
    contradictionFindings.push(...intra.findings);
    intraPairsExamined = intra.pairsExamined;
  }

  if (hierarchyOn) {
    const hier = await runParentChildContradictions(
      parentReqs,
      requirements,
      options.trace_links,
      config,
      profile,
      client,
      semanticCtx
    );
    contradictionFindings.push(...hier.findings);
    hierarchyPairsExamined = hier.pairsExamined;
  }

  setLevel = [...setLevel, ...contradictionFindings];

  const scoreMap = scoreRequirements(requirements, perReq, setLevel, config, profile);

  const requirementsOut = requirements.map((r) => {
    const row: PerRequirementResult = {
      requirement: r,
      findings: perReq.get(r.id) ?? [],
      scores: scoreMap.get(r.id)!,
    };
    const leg = legacyById.get(r.id);
    if (leg !== undefined) {
      row.legacy = leg;
    }
    if (semanticCtx) {
      const cid = semanticCtx.clusterByRequirementId.get(r.id);
      if (cid !== undefined) {
        row.semantic = { cluster_id: cid, embedding_model: semanticCtx.model };
      }
    }
    return row;
  });

  return {
    meta: {
      profile: profile.id,
      mode: options.mode,
      analyzed_at: new Date().toISOString(),
      requirement_count: requirements.length,
      source_document: options.source_document,
      ...(parentSourceLabel ? { parent_source_document: parentSourceLabel } : {}),
      ai_enabled: aiAttributeOn,
      organization_id: config.organization_id,
      contradiction: {
        intra_enabled: intraOn,
        hierarchy_enabled: hierarchyOn,
        intra_pairs_examined: intraPairsExamined,
        hierarchy_pairs_examined: hierarchyPairsExamined,
        ...(parentReqs.length > 0 ? { parent_requirement_count: parentReqs.length } : {}),
      },
      ...(semanticEmbeddingMeta ? { semantic_embedding: semanticEmbeddingMeta } : {}),
    },
    requirements: requirementsOut,
    set_level_findings: setLevel,
    ...(parentReqs.length > 0 ? { parent_requirements: parentReqs } : {}),
  };
}

export { loadEngineConfig };
