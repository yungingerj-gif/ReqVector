import type { LegacyReconstructionResult } from "../types/layeredTypes";

type Props = {
  legacy: LegacyReconstructionResult;
  visible: boolean;
};

export function LegacyPanel({ legacy, visible }: Props) {
  if (!visible) return null;

  return (
    <div className="lv-subpanel lv-legacy-panel">
      <h3 className="lv-h3">Legacy reconstruction</h3>
      {legacy.likely_intent && (
        <p>
          <strong>Likely intent</strong> {legacy.likely_intent}
        </p>
      )}
      {legacy.inferred_missing_fields && legacy.inferred_missing_fields.length > 0 && (
        <p>
          <strong>Missing fields</strong> {legacy.inferred_missing_fields.join(", ")}
        </p>
      )}
      {legacy.reconstructed_requirement && (
        <p>
          <strong>Reconstructed requirement</strong> {legacy.reconstructed_requirement}
        </p>
      )}
      {legacy.reconstruction_confidence != null && (
        <p>
          <strong>Confidence</strong> {legacy.reconstruction_confidence}
        </p>
      )}
      {legacy.reconstruction_rationale && (
        <p>
          <strong>Rationale</strong> {legacy.reconstruction_rationale}
        </p>
      )}
    </div>
  );
}
