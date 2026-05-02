import { AnalysisFiltersBar } from "../components/AnalysisFiltersBar";
import { RequirementDetail } from "../components/RequirementDetail";
import { RequirementsTable } from "../components/RequirementsTable";
import { SetLevelFindings } from "../components/SetLevelFindings";
import { TrainingPipelineFeedbackList } from "../components/TrainingPipelineFeedbackList";
import { UploadPanel } from "../components/UploadPanel";
import { useAnalysisStore } from "../store/useAnalysisStore";

export function ReviewPage() {
  const analysisResult = useAnalysisStore((s) => s.analysisResult);
  const loading = useAnalysisStore((s) => s.loading);
  const error = useAnalysisStore((s) => s.error);
  const acceptedRewrites = useAnalysisStore((s) => s.acceptedRewrites);
  const lastSourceFile = useAnalysisStore((s) => s.lastSourceFile);
  const exportRevisedSourceDocument = useAnalysisStore((s) => s.exportRevisedSourceDocument);
  const feedbackCount = useAnalysisStore((s) => {
    if (!s.feedbackRunId) return 0;
    return Object.values(s.suggestionFeedbackByKey).filter((e) => e.run_id === s.feedbackRunId).length;
  });
  const exportSuggestionFeedbackNdjson = useAnalysisStore((s) => s.exportSuggestionFeedbackNdjson);
  const acceptedCount = Object.keys(acceptedRewrites).length;

  const downloadFeedbackLog = () => {
    const ndjson = exportSuggestionFeedbackNdjson();
    if (!ndjson.trim()) return;
    const blob = new Blob([ndjson], { type: "application/x-ndjson;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ai-suggestion-feedback-${new Date().toISOString().slice(0, 10)}.jsonl`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="lv-page">
      <UploadPanel />
      <section className="lv-panel lv-review-export">
        <h2 className="lv-h2">Download revised source document</h2>
        <p className="lv-muted">
          Separate from the <strong>analysis report</strong> on the Reports page. This applies accepted rewrites by
          replacing each requirement&apos;s <code>source_text</code> in the file body. <strong>TXT/CSV/XLSX</strong> keep
          the same format (Excel <code>.xls</code> is saved as <code>.xlsx</code>). <strong>DOCX</strong> is regenerated
          from extracted text (layout may differ). <strong>PDF</strong> exports revised extracted text as{" "}
          <code>.txt</code>. Paste-only runs send your textarea as <code>requirements.txt</code>.
        </p>
        <p className="lv-muted">
          Source:{" "}
          <code>{lastSourceFile ? lastSourceFile.name : "pasted requirements (as .txt)"}</code>
          {acceptedCount > 0
            ? ` · ${acceptedCount} accepted change${acceptedCount === 1 ? "" : "s"}`
            : " · no accepted changes yet (file still downloads; content unchanged)"}
          {feedbackCount > 0
            ? ` · ${feedbackCount} AI suggestion feedback entr${feedbackCount === 1 ? "y" : "ies"} logged`
            : ""}
        </p>
        <div className="lv-review-export-actions">
          <button
            type="button"
            className="primary"
            disabled={!analysisResult || loading}
            onClick={() => void exportRevisedSourceDocument()}
          >
            Download revised source
          </button>
          <button
            type="button"
            className="secondary-btn"
            disabled={!analysisResult || loading || feedbackCount === 0}
            onClick={downloadFeedbackLog}
          >
            Download AI feedback log ({feedbackCount})
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </section>
      <TrainingPipelineFeedbackList />
      <AnalysisFiltersBar title="Table filters" />
      <div className="lv-review-grid">
        <RequirementsTable />
        <RequirementDetail />
      </div>
      <SetLevelFindings />
    </div>
  );
}
