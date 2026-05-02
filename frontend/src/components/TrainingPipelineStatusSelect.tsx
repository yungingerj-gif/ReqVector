import {
  TRAINING_PIPELINE_LABELS,
  TRAINING_PIPELINE_STATUSES,
  type TrainingPipelineStatus,
} from "../types/suggestionFeedback";

type Props = {
  value: TrainingPipelineStatus;
  onChange: (status: TrainingPipelineStatus) => void;
  disabled?: boolean;
  id?: string;
};

export function TrainingPipelineStatusSelect({ value, onChange, disabled, id }: Props) {
  return (
    <select
      id={id}
      className="lv-training-pipeline-select"
      value={value}
      disabled={disabled}
      aria-label="Training pipeline status"
      onChange={(e) => onChange(e.target.value as TrainingPipelineStatus)}
    >
      {TRAINING_PIPELINE_STATUSES.map((s) => (
        <option key={s} value={s}>
          {TRAINING_PIPELINE_LABELS[s]}
        </option>
      ))}
    </select>
  );
}
