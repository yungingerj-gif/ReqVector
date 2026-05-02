import { useMemo, useState } from "react";
import type { LegacyReconstructionResult, StructuredFinding } from "../types/layeredTypes";
import { useAnalysisStore } from "../store/useAnalysisStore";
import { SuggestionFeedbackBar } from "./SuggestionFeedbackBar";

type Props = {
  requirementId: string;
  findings: StructuredFinding[];
  legacy?: LegacyReconstructionResult;
};

export function RewritePanel({ requirementId, findings, legacy }: Props) {
  const [copied, setCopied] = useState(false);
  const acceptedText = useAnalysisStore((s) => s.acceptedRewrites[requirementId]);
  const clearAcceptedRewrite = useAnalysisStore((s) => s.clearAcceptedRewrite);

  const primary = useMemo(() => {
    const fromFinding = findings.find((f) => f.suggested_rewrite?.trim());
    if (fromFinding?.suggested_rewrite) return fromFinding.suggested_rewrite;
    if (legacy?.minimal_cleanup_rewrite?.trim()) return legacy.minimal_cleanup_rewrite;
    if (legacy?.formal_rewrite?.trim()) return legacy.formal_rewrite;
    if (legacy?.system_level_rewrite?.trim()) return legacy.system_level_rewrite;
    return "";
  }, [findings, legacy]);

  const copy = async (text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  if (!primary && !legacy?.minimal_cleanup_rewrite && !legacy?.formal_rewrite) {
    return (
      <div className="lv-subpanel">
        <h3 className="lv-h3">AI rewrite</h3>
        <p className="lv-muted">No suggested rewrite in findings or legacy blocks for this requirement.</p>
      </div>
    );
  }

  const hasPrimary = Boolean(primary.trim());

  const primaryMatchesFinding = findings.some((f) => f.suggested_rewrite?.trim() === primary.trim());
  const primaryMatchesLegacyAlt =
    legacy?.minimal_cleanup_rewrite?.trim() === primary.trim() ||
    legacy?.formal_rewrite?.trim() === primary.trim();
  const skipPrimaryFeedbackBar = primaryMatchesFinding || primaryMatchesLegacyAlt;

  return (
    <div className="lv-subpanel">
      <h3 className="lv-h3">AI rewrite</h3>
      <p className="lv-muted">
        Use feedback buttons to log reviewer decisions for training exports. Accepted text is applied when you use{" "}
        <strong>Download revised source</strong> on Requirement Review (rebuilds your upload / pasted text, not the
        analysis report).
      </p>
      {acceptedText != null && acceptedText !== "" && (
        <div className="lv-accepted-banner">
          <strong>Accepted for export</strong>
          <p className="lv-accepted-snippet">{acceptedText.length > 200 ? `${acceptedText.slice(0, 200)}…` : acceptedText}</p>
          <button type="button" className="secondary-btn small" onClick={() => clearAcceptedRewrite(requirementId)}>
            Clear acceptance
          </button>
        </div>
      )}
      {hasPrimary && (
        <div className="lv-rewrite-primary">
          <div className="lv-rewrite-label">Primary suggestion</div>
          <blockquote className="lv-rewrite-quote">{primary}</blockquote>
          {!skipPrimaryFeedbackBar && (
            <SuggestionFeedbackBar
              requirementId={requirementId}
              sourceKey="rewrite-primary"
              originalSuggestion={primary}
            />
          )}
          {skipPrimaryFeedbackBar && (
            <p className="lv-muted lv-rewrite-feedback-hint">
              Log <strong>Accept</strong> / <strong>Reject</strong> / <strong>Edit</strong> on the matching finding or
              legacy block above/below so feedback stays tied to that source.
            </p>
          )}
          <div className="lv-rewrite-actions">
            <button type="button" className="secondary-btn" onClick={() => void copy(primary)}>
              Copy rewrite
            </button>
            {copied && <span className="lv-copied">Copied</span>}
          </div>
        </div>
      )}
      {(legacy?.minimal_cleanup_rewrite || legacy?.formal_rewrite) && (
        <div className="lv-rewrite-alt">
          {legacy.minimal_cleanup_rewrite && (
            <div className="lv-rewrite-alt-block">
              <strong>Minimal cleanup</strong>
              <blockquote className="lv-rewrite-quote">{legacy.minimal_cleanup_rewrite}</blockquote>
              <SuggestionFeedbackBar
                requirementId={requirementId}
                sourceKey="rewrite-legacy-minimal"
                originalSuggestion={legacy.minimal_cleanup_rewrite}
                compact
              />
              <div className="lv-rewrite-alt-actions">
                <button
                  type="button"
                  className="secondary-btn small"
                  onClick={() => void copy(legacy.minimal_cleanup_rewrite!)}
                >
                  Copy
                </button>
              </div>
            </div>
          )}
          {legacy.formal_rewrite && (
            <div className="lv-rewrite-alt-block">
              <strong>Formal rewrite</strong>
              <blockquote className="lv-rewrite-quote">{legacy.formal_rewrite}</blockquote>
              <SuggestionFeedbackBar
                requirementId={requirementId}
                sourceKey="rewrite-legacy-formal"
                originalSuggestion={legacy.formal_rewrite}
                compact
              />
              <div className="lv-rewrite-alt-actions">
                <button type="button" className="secondary-btn small" onClick={() => void copy(legacy.formal_rewrite!)}>
                  Copy
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
