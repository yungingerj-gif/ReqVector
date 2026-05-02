# Clone and run (GitHub-ready bundle)

This tree intentionally **excludes** `node_modules/`, `dist/`, and generated `.docx` files so the repo stays small. Restore dependencies locally:

```bash
npm install
npm run build
```

## Development

Terminal 1 — API (port 4000):

```bash
npm run dev:backend
```

Terminal 2 — UI (Vite; proxies `/api` to the backend):

```bash
npm run dev:frontend
```

Open the URL Vite prints (often `http://localhost:5173`).

## Layered LLM features (optional)

Set on the machine running the backend:

- `OPENAI_API_KEY` — enables layered AI passes when configured in `backend/config/layered-engine.json`.
- Optionally `OPENAI_MODEL`, or `AI_SERVICE_URL` / `AI_SERVICE_SECRET` for the optional `ai-service` gateway.

## Runtime data

Copy examples into place if needed:

- `backend/data/ai-training-pack.example.json` → `backend/data/ai-training-pack.json`
- `backend/data/domain-constraints.example.json` → `backend/data/domain-constraints.json`

(Regenerated steering JSONL may appear under `backend/data/` after saves from the UI.)

## Regenerate Word manuals from Markdown

```bash
npm --workspace backend run docx:web-tool-user-guide
npm --workspace backend run docx:architecture-baseline
npm --workspace backend run docx:llm-training-manual
```

If Git push or `npm install` is flaky under OneDrive, copy this folder to a non-synced path (for example `C:\dev\ReqVector`) and run Git and npm there.

