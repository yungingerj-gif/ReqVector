import { useAnalysisStore } from "../store/useAnalysisStore";
import { TrainingPipelineStatusSelect } from "./TrainingPipelineStatusSelect";

export function TrainingPipelineFeedbackList() {
  const feedbackRunId = useAnalysisStore((s) => s.feedbackRunId);
  const suggestionFeedbackByKey = useAnalysisStore((s) => s.suggestionFeedbackByKey);
  const updateSuggestionFeedbackPipelineStatus = useAnalysisStore((s) => s.updateSuggestionFeedbackPipelineStatus);

  if (!feedbackRunId) return null;

  const entries = Object.values(suggestionFeedbackByKey)
    .filter((e) => e.run_id === feedbackRunId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  if (entries.length === 0) return null;

  return (
    <section className="lv-panel lv-training-pipeline-panel">
      <h2 className="lv-h2">Training data pipeline status</h2>
      <p className="lv-muted">
        Track each captured suggestion row through review and deployment. Status is included in{" "}
        <strong>Download AI feedback log</strong>. Advance stages when your process completes each gate.
      </p>
      <ul className="lv-training-pipeline-list">
        {entries.map((e) => (
          <li key={e.key} className="lv-training-pipeline-row">
            <div className="lv-training-pipeline-row-main">
              <code className="lv-training-pipeline-req">{e.requirement_id}</code>
              <span className="lv-training-pipeline-src">{e.source_key}</span>
              <span className={`lv-training-pipeline-verdict lv-verdict-${e.verdict}`}>{e.verdict}</span>
            </div>
            <div className="lv-training-pipeline-row-status">
              <label className="lv-training-pipeline-field">
                <span className="lv-sr-only">Pipeline status</span>
                <TrainingPipelineStatusSelect
                  value={e.training_pipeline_status}
                  onChange={(s) => updateSuggestionFeedbackPipelineStatus(e.key, s)}
                />
              </label>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
