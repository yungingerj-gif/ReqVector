import { useCallback, useEffect, useState } from "react";
import type { AiTrainingExampleDto, AiTrainingPackDto } from "../api/layeredApi";
import * as layeredApi from "../api/layeredApi";

function newExample(): AiTrainingExampleDto {
  return {
    id: crypto.randomUUID(),
    layout_label: "Topic",
    layout_notes: "",
    excerpt: "",
    guidance_for_llm: "",
    enabled: true,
  };
}

export function AiTrainingPage() {
  const [pack, setPack] = useState<AiTrainingPackDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = await layeredApi.getAiTrainingPack();
      setPack({
        ...p,
        global_llm_instructions: p.global_llm_instructions ?? "",
        examples: p.examples?.length ? p.examples : [newExample()],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!pack) return;
    setSaving(true);
    setSaveMsg(null);
    setError(null);
    try {
      const saved = await layeredApi.saveAiTrainingPack({
        global_llm_instructions: pack.global_llm_instructions?.trim() ?? "",
        examples: pack.examples,
      });
      setPack(saved);
      setSaveMsg(
        "Saved on the server (backend/data/ai-training-pack.json). Steering JSONL was regenerated (backend/data/ai-training-steering.jsonl). Layered LLM runs use the pack as prompt context."
      );
      setTimeout(() => setSaveMsg(null), 8000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const downloadSteeringJsonl = async () => {
    setError(null);
    try {
      const blob = await layeredApi.fetchSteeringTrainingJsonl();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "ai-training-steering.jsonl";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (loading || !pack) {
    return (
      <div className="lv-page">
        <p className="lv-muted">{loading ? "Loading AI training pack…" : error ?? "Empty."}</p>
        {error && (
          <button type="button" className="secondary-btn" onClick={() => void load()}>
            Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="lv-page lv-ai-training-page">
      <h1 className="lv-h1">AI training & steering</h1>
      <p className="lv-muted">
        This steers <strong>every layered LLM call</strong> (requirement attribute review, legacy augment, same-intent
        pairs, intra-doc and parent–child adjudication). Text is prepended to each system prompt — it does{" "}
        <strong>not</strong> train model weights by itself. On every <strong>Save</strong>, the same steering is also{" "}
        <strong>turned into JSONL training rows</strong> (chat + synthetic assistant digest) for optional external
        fine-tuning — review and redact before uploading to any provider. Full playbook:{" "}
        <code className="lv-doc-name">docs/llm-training-manual.md</code>.
      </p>

      {error && <p className="error">{error}</p>}

      <section className="lv-panel lv-ai-training-global">
        <h2 className="lv-h2">Global instructions (always apply)</h2>
        <label className="lv-field">
          Domain rules, terminology, safety posture, how to judge overlap vs contradiction, units — anything all AI
          passes should respect.
          <textarea
            className="lv-textarea"
            rows={10}
            value={pack.global_llm_instructions ?? ""}
            onChange={(e) => setPack({ ...pack, global_llm_instructions: e.target.value })}
            spellCheck
          />
        </label>
      </section>

      <section className="lv-panel">
        <div className="lv-ai-training-examples-head">
          <h2 className="lv-h2">Topic examples (optional)</h2>
          <button
            type="button"
            className="secondary-btn"
            onClick={() => setPack({ ...pack, examples: [...pack.examples, newExample()] })}
          >
            Add topic
          </button>
        </div>
        <p className="lv-muted">
          Each card can carry layout notes, sample lines, or guidance-only text. Disabled cards are ignored at runtime.
        </p>

        <div className="lv-ai-training-cards">
          {pack.examples.map((ex, idx) => (
            <div key={ex.id} className="lv-ai-training-card">
              <div className="lv-ai-training-card-toolbar">
                <label className="lv-toggle">
                  <input
                    type="checkbox"
                    checked={ex.enabled}
                    onChange={(e) => {
                      const examples = [...pack.examples];
                      examples[idx] = { ...ex, enabled: e.target.checked };
                      setPack({ ...pack, examples });
                    }}
                  />
                  <span>Enabled</span>
                </label>
                <button
                  type="button"
                  className="secondary-btn lv-ai-training-remove"
                  onClick={() =>
                    setPack({
                      ...pack,
                      examples: pack.examples.filter((_, i) => i !== idx),
                    })
                  }
                >
                  Remove
                </button>
              </div>
              <label className="lv-field">
                Topic label
                <input
                  type="text"
                  value={ex.layout_label}
                  onChange={(e) => {
                    const examples = [...pack.examples];
                    examples[idx] = { ...ex, layout_label: e.target.value };
                    setPack({ ...pack, examples });
                  }}
                />
              </label>
              <label className="lv-field">
                Context / structure / vocabulary
                <textarea
                  className="lv-textarea"
                  rows={3}
                  value={ex.layout_notes}
                  onChange={(e) => {
                    const examples = [...pack.examples];
                    examples[idx] = { ...ex, layout_notes: e.target.value };
                    setPack({ ...pack, examples });
                  }}
                />
              </label>
              <label className="lv-field">
                Guidance for LLM (any pass)
                <textarea
                  className="lv-textarea"
                  rows={3}
                  value={ex.guidance_for_llm ?? ""}
                  onChange={(e) => {
                    const examples = [...pack.examples];
                    examples[idx] = { ...ex, guidance_for_llm: e.target.value };
                    setPack({ ...pack, examples });
                  }}
                />
              </label>
              <label className="lv-field">
                Sample excerpt (optional — de-identify proprietary text)
                <textarea
                  className="lv-textarea"
                  rows={5}
                  value={ex.excerpt}
                  onChange={(e) => {
                    const examples = [...pack.examples];
                    examples[idx] = { ...ex, excerpt: e.target.value };
                    setPack({ ...pack, examples });
                  }}
                />
              </label>
            </div>
          ))}
        </div>
      </section>

      <div className="lv-ai-training-actions">
        <button type="button" className="primary" disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save to server"}
        </button>
        <button type="button" className="secondary-btn" onClick={() => void load()} disabled={saving}>
          Reload from server
        </button>
        <button type="button" className="secondary-btn" onClick={() => void downloadSteeringJsonl()}>
          Download steering JSONL (auto-generated)
        </button>
      </div>
      {saveMsg && <p className="lv-save-msg">{saveMsg}</p>}
      <p className="lv-muted lv-ai-training-meta">Last saved: {pack.updated_at}</p>
    </div>
  );
}
