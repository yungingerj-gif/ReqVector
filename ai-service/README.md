# Requirements AI gateway (separate server)

Runs **outside** the main Express API so provider keys and model traffic stay isolated.

## Run

```bash
cd ai-service
npm install
set OPENAI_API_KEY=...   # Windows PowerShell: $env:OPENAI_API_KEY="..."
set PORT=8787            # optional
node server.mjs
```

Optional shared secret (recommended if exposed beyond localhost):

```bash
set AI_SERVICE_SECRET=long-random-string
```

Point the main backend at this service:

```bash
set AI_SERVICE_URL=http://127.0.0.1:8787
set AI_SERVICE_SECRET=long-random-string   # must match gateway if set
```

If `AI_SERVICE_URL` is set, the backend uses **RemoteAiClient** and does **not** need `OPENAI_API_KEY` locally.

## API

- `GET /health`
- `POST /v1/complete-json` — body `{ "system": string, "user": string }` — response is the **parsed JSON object** the model returned (same shape the in-process OpenAI client produced).

## Training on real specifications

Training/fine-tuning is **not** performed by this repo automatically. Use `training/dataset-record.schema.json` as the shape for curated, **de-identified** examples (JSONL). See `training/example-line.jsonl`.

Before using customer specs: legal review, consent, retention policy, and removal of names, account IDs, and export-controlled details.

**Instruction manual:** [`docs/llm-training-manual.md`](../docs/llm-training-manual.md) (dataset governance, JSONL, wiring `OPENAI_MODEL` / `ai-service`).

Next steps outside this gateway: export JSONL → OpenAI fine-tuning API, or LoRA/QLoRA on your own GPU stack (Unsloth, Axolotl, etc.) with a held-out eval set.
