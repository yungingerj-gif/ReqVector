# ReqVector — repository architecture

This document describes how the **CursorTest / ReqVector** monorepo is structured and how pieces connect at runtime. For product behavior and API examples, see `README.md`.

## Requirements analysis and AI engines

The backend has **two** requirement-analysis implementations:

- **Classic** — `services/requirementsAnalyzeService.ts`: deterministic rules, conflicts, graph, ripple; **no LLM**.
- **Layered** — `engine/layered/engine.ts`: normalize → deterministic blocks → optional **AI** passes → set-level and contradiction passes → scoring.

All layered LLM calls use the **`AiClient`** abstraction (`engine/layered/ai/aiClient.ts`): in-process OpenAI JSON mode, **or** remote **`ai-service/`**, **or** a null client when neither is configured.

**Full detail:** layered pipeline and components are summarized in [`docs/architecture-baseline.md`](docs/architecture-baseline.md); classic vs layered routing is summarized in `README.md` (**Product surfaces**).

## Monorepo layout

| Directory | Role |
|-----------|------|
| **`frontend/`** | React (Vite) SPA: dashboard, layered review, reports, config, and related UI. |
| **`backend/`** | Express HTTP API: classic requirement analysis, layered engine, PDF/DOCX ingest. |
| **`ai-service/`** | **Optional** Node gateway for LLM calls so provider keys and model traffic can stay off the main API. |
| **`docs/`** | Supplementary design notes (e.g. layered engine specs). |

The root **`package.json`** defines npm **workspaces** (`backend`, `frontend`) and scripts such as `dev:backend`, `dev:frontend`, `build`, and `start`.

## Local development topology

1. **Frontend** — Vite dev server (default **http://localhost:5173**).
2. **Backend** — Express listens on **`PORT` or 4000** (`backend/src/index.ts`).
3. **Proxy** — `frontend/vite.config.ts` proxies **`/api`** → **`http://localhost:4000`**, so the browser uses same-origin `/api/...` and the backend handles routing.

```text
Browser (localhost:5173)
    → Vite proxies /api
        → Express (localhost:4000)
            → optional: AI_SERVICE_URL → ai-service (e.g. :8787)
            → else: in-process OpenAI client (env key on backend host)
```

## Backend (`backend/src`)

### Entry and HTTP surface

- **`index.ts`** — Express app: CORS, `express.json()`, route mounts, global error handler, `listen`.
- **Route modules** (each mounted under **`/api`**):
  - **`routes/requirementsSystem.ts`** plus **stakeholder / subsystem / component / implementation** — “classic” ReqVector: analyze pasted text, specification uploads (PDF/DOCX), level-scoped entry points. Handlers delegate to **`services/requirementsAnalyzeService.ts`** (parsing, INCOSE-style dimensions, conflict detection, requirement graph, ripple simulation, etc.).
  - **`routes/layeredPlatform.ts`** — Layered pipeline: health, analyze (JSON + multipart upload), exports, read-only config. Orchestrates **`engine/layered/`**.

### Layered engine (`backend/src/engine/layered/`)

High-level flow:

1. **Normalize** input (and optional parent text) into **canonical requirements**.
2. **Per-requirement** deterministic rule blocks (and optional **AI** augmentations per profile).
3. **Legacy** reconstruction when the selected profile/mode enables it.
4. **Set-level** findings: cross-requirement checks, optional LLM same-intent, **intra-document** and **parent–child** contradiction passes when enabled in config/profile.
5. **Scoring** combines per-requirement findings and set-level output into scores for the API/UI.

Engine behavior is driven by **loaded engine config** and **profiles** (see `backend` config loading and `docs/` where applicable).

## Frontend (`frontend/src`)

- **`main.tsx`** bootstraps React and global styles.
- **`App.tsx`** — **React Router**: most routes use **`AppLayout`** (`/dashboard`, `/review`, `/legacy`, `/config`, **`/ai-training`** layered LLM steering pack, `/reports`, …). **`/classic`** mounts **`RequirementsTool`** in a minimal wrapper for the original single-tool UX.
- **API** — Typically `fetch("/api/...")` via modules under **`api/`** (e.g. layered analyze). **Zustand** stores (e.g. **`store/useAnalysisStore.ts`**) hold analysis results and UI state.

## Optional AI gateway (`ai-service/`)

When **`AI_SERVICE_URL`** is set on the backend (and optionally **`AI_SERVICE_SECRET`** matches the gateway), **layered** AI features can use a **remote** client that POSTs to **`ai-service`** (`POST /v1/complete-json`) instead of calling the provider from the Express process. If unset, the layered engine may use an in-process OpenAI client with **`OPENAI_API_KEY`** on the same host as Express. The **classic** analyzer does not use this path.

See **`ai-service/README.md`** for run instructions and security notes.

## Builds and production notes

- **`npm run build`** — Builds backend then frontend (workspace scripts).
- **`npm start`** — Runs the **built** backend workspace (production-style); the SPA is normally served separately or by static hosting, with **`VITE_API_URL`** pointing at the API origin if it differs from the static site (see `README.md`).

## Related documentation

- **`README.md`** — Product overview, classic API shapes, local run commands.
- **`docs/architecture-baseline.md`** — Layered pipeline and major components (classic vs layered is also summarized in `README.md` **Product surfaces**).
- **`docs/llm-training-manual.md`** — LLM fine-tuning datasets (JSONL), governance, and wiring a trained model via env vars / `ai-service`.
- **`docs/`** — Other design notes (e.g. layered L6 contradiction spec) where present.
