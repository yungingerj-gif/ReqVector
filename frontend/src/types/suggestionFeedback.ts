export type SuggestionFeedbackVerdict = "accepted" | "rejected" | "edited";

/** Lifecycle for rows included in training / fine-tune exports */
export const TRAINING_PIPELINE_STATUSES = [
  "human_reviewed",
  "approved_for_training",
  "exported_to_finetune",
  "model_deployed",
] as const;

export type TrainingPipelineStatus = (typeof TRAINING_PIPELINE_STATUSES)[number];

export const TRAINING_PIPELINE_LABELS: Record<TrainingPipelineStatus, string> = {
  human_reviewed: "Human reviewed",
  approved_for_training: "Approved for training",
  exported_to_finetune: "Exported to fine-tune",
  model_deployed: "Model deployed",
};

export function isTrainingPipelineStatus(s: string): s is TrainingPipelineStatus {
  return (TRAINING_PIPELINE_STATUSES as readonly string[]).includes(s);
}

export const DEFAULT_TRAINING_PIPELINE_STATUS: TrainingPipelineStatus = "human_reviewed";

export interface SuggestionFeedbackEntry {
  key: string;
  run_id: string;
  requirement_id: string;
  source_key: string;
  verdict: SuggestionFeedbackVerdict;
  original_suggestion: string;
  /** Text committed for export when accepted or edited */
  final_text?: string;
  created_at: string;
  /** Where this row sits in the ML ops workflow (included in training export NDJSON). */
  training_pipeline_status: TrainingPipelineStatus;
}

export function suggestionFeedbackCompositeKey(
  runId: string,
  requirementId: string,
  sourceKey: string
): string {
  return `${runId}::${requirementId}::${sourceKey}`;
}
