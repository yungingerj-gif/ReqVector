import { useAnalysisStore } from "../store/useAnalysisStore";
import { LegacyPanel } from "../components/LegacyPanel";

export function LegacyPage() {
  const analysisResult = useAnalysisStore((s) => s.analysisResult);
  const mode = useAnalysisStore((s) => s.mode);

  if (!analysisResult) {
    return (
      <div className="lv-page">
        <section className="lv-panel">
          <h2 className="lv-h2">Legacy reconstruction</h2>
          <p className="lv-muted">Run an analysis in Legacy Reconstruction Mode from Requirement Review first.</p>
        </section>
      </div>
    );
  }

  const withLegacy = analysisResult.requirements.filter((r) => r.legacy);

  return (
    <div className="lv-page">
      <section className="lv-panel">
        <h2 className="lv-h2">Legacy reconstruction</h2>
        <p className="lv-muted">
          Current run mode: <code>{analysisResult.meta.mode}</code>. Legacy blocks appear when the engine produced them
          (typically in legacy profile/mode).
        </p>
        {mode !== "legacy" && (
          <p className="lv-muted">Tip: switch header profile to <code>legacy_spec</code> and mode to legacy for richer output.</p>
        )}
      </section>
      {withLegacy.length === 0 ? (
        <section className="lv-panel">
          <p className="lv-muted">No legacy reconstruction payloads on this run.</p>
        </section>
      ) : (
        withLegacy.map((row) => (
          <section key={row.requirement.id} className="lv-panel">
            <h3 className="lv-h3">
              <code>{row.requirement.id}</code>
            </h3>
            <p className="lv-muted">
              {row.requirement.normalized_text.length > 200
                ? `${row.requirement.normalized_text.slice(0, 200)}…`
                : row.requirement.normalized_text}
            </p>
            <LegacyPanel legacy={row.legacy!} visible />
          </section>
        ))
      )}
    </div>
  );
}
