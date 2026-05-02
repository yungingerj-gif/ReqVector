import { useAnalysisStore } from "../store/useAnalysisStore";

export function ReportsPage() {
  const analysisResult = useAnalysisStore((s) => s.analysisResult);
  const exportDocx = useAnalysisStore((s) => s.exportDocx);
  const loading = useAnalysisStore((s) => s.loading);
  const error = useAnalysisStore((s) => s.error);

  return (
    <div className="lv-page">
      <section className="lv-panel">
        <h2 className="lv-h2">Reports</h2>
        <p className="lv-muted">Structured report export is available for the current analysis result.</p>
        <button
          type="button"
          className="primary"
          disabled={!analysisResult || loading}
          onClick={() => void exportDocx()}
        >
          Download Word report (.docx)
        </button>
        {!analysisResult && <p className="lv-muted">Run an analysis first.</p>}
        {error && <p className="error">{error}</p>}
      </section>
    </div>
  );
}
