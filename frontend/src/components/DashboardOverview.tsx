import { useMemo } from "react";
import { filterVisibleRequirements } from "../store/analysisUtils";
import { useAnalysisStore } from "../store/useAnalysisStore";
import { AnalysisFiltersBar } from "./AnalysisFiltersBar";

export function DashboardOverview() {
  const analysisResult = useAnalysisStore((s) => s.analysisResult);
  const filters = useAnalysisStore((s) => s.filters);

  const rows = useMemo(
    () => filterVisibleRequirements(analysisResult, filters),
    [analysisResult, filters]
  );

  const stats = useMemo(() => {
    if (!analysisResult || rows.length === 0) {
      return {
        count: 0,
        avgOverall: 0,
        highFindings: 0,
        legacyShare: 0,
        activeShare: 0,
      };
    }
    const sum = rows.reduce((acc, r) => acc + r.scores.overall, 0);
    const allFindings = rows.flatMap((r) => r.findings);
    const highFindings = allFindings.filter((f) => f.severity === "high").length;
    const legacy = analysisResult.meta.mode === "legacy" ? 1 : 0;
    const active = analysisResult.meta.mode === "active" ? 1 : 0;
    return {
      count: rows.length,
      avgOverall: Math.round((sum / rows.length) * 10) / 10,
      highFindings,
      legacyShare: legacy,
      activeShare: active,
    };
  }, [analysisResult, rows]);

  return (
    <section className="lv-panel">
      <h2 className="lv-h2">Overview</h2>
      <p className="lv-muted">
        Filters apply to the current analysis. Profile filter hides rows when it does not match the run&apos;s profile.
      </p>

      <AnalysisFiltersBar />

      <div className="lv-stat-grid">
        <div className="lv-stat-card">
          <span className="lv-stat-value">{stats.count}</span>
          <span className="lv-stat-label">Requirements (filtered)</span>
        </div>
        <div className="lv-stat-card">
          <span className="lv-stat-value">{stats.avgOverall || "—"}</span>
          <span className="lv-stat-label">Avg overall score</span>
        </div>
        <div className="lv-stat-card high">
          <span className="lv-stat-value">{stats.highFindings}</span>
          <span className="lv-stat-label">High severity findings</span>
        </div>
        <div className="lv-stat-card wide">
          <span className="lv-stat-label">Legacy vs active (current run)</span>
          <div className="lv-ratio-bar">
            {analysisResult?.meta.mode === "legacy" ? (
              <div className="lv-ratio legacy" style={{ width: "100%" }}>
                Legacy reconstruction mode
              </div>
            ) : (
              <div className="lv-ratio active" style={{ width: "100%" }}>
                Active spec mode
              </div>
            )}
          </div>
        </div>
      </div>
      {analysisResult?.meta.semantic_embedding?.enabled ? (
        <p className="lv-muted lv-semantic-run-banner">
          Semantic embedding layer: <strong>{analysisResult.meta.semantic_embedding.model}</strong> ·{" "}
          {analysisResult.meta.semantic_embedding.cluster_count ?? "—"} functional clusters ·{" "}
          {analysisResult.meta.semantic_embedding.neighbor_pair_count ?? "—"} neighbor seeds for intra contradiction
          pre-filter
          {analysisResult.meta.semantic_embedding.hierarchy_embedding_boost ? " · hierarchy match boosted" : ""}.
        </p>
      ) : analysisResult?.meta.semantic_embedding &&
        analysisResult.meta.semantic_embedding.enabled === false &&
        analysisResult.meta.semantic_embedding.skipped_reason ? (
        <p className="lv-muted lv-semantic-run-banner">
          Semantic embeddings skipped: {analysisResult.meta.semantic_embedding.skipped_reason}
        </p>
      ) : null}
    </section>
  );
}
