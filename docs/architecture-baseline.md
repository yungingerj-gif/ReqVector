# ReqVector — Baseline Architecture & Design

**Document type:** Product architecture baseline  
**Repository root:** `CursorTest` (ReqVector layered requirements + classic API)  
**Baseline date:** 2026-04-07  
**Regenerate Word output:** `npm --workspace backend run docx:architecture-baseline`

---

## 1. Executive summary

ReqVector is a requirements analysis product with two user experiences: a **layered workbench** (React SPA with Express API) and a **classic** single-page analyzer. The layered path normalizes free text into canonical requirements, runs **deterministic** and **optional LLM** rule blocks, **set-level** cross checks, **intra-document** and **parent–child** contradiction analysis, optional **semantic embeddings** for clustering and candidate pre-filtering, then **scores** results and exports Word or revised source files. Organization **steering**, **domain constraint libraries**, and **reviewer feedback** support governance and future training pipelines.

---

## 2. High-level architecture

### 2.1 Logical tiers

| Tier | Responsibility |
|------|----------------|
| **Presentation** | React Router UI (`frontend/`): dashboards, review table, AI training, domain constraints, reports; Zustand store for analysis state and feedback. |
| **API** | Express on Node (`backend/src/index.ts`): JSON endpoints under `/api`; layered routes in `layeredPlatform.ts`; classic tier routes for legacy analyzer. |
| **Analysis engine** | TypeScript layered pipeline (`backend/src/engine/layered/`): normalization → per-requirement rules → optional AI → set-level → contradiction → scoring → structured result. |
| **External services** | OpenAI (chat JSON + embeddings when configured); optional `ai-service` gateway for chat only. |
| **Persistence (local)** | JSON files under `backend/data/` for steering pack, domain constraints, auto-generated steering JSONL (gitignored where proprietary). |

### 2.2 Layered engine flow (conceptual)

1. **Ingress:** `HTTP POST /api/layered/analyze` (JSON) or multipart upload → extracted text.
2. **Routing:** `layeredPlatform.ts` validates payload and invokes `runLayeredEngine`.
3. **Orchestration (`engine.ts`):** normalize → deterministic passes → optional AI attributes → optional legacy reconstruction → set-level cross checks → optional embeddings → intra + hierarchy contradiction → scoring → `LayeredAnalysisResult`.
4. **Egress:** JSON to client; separate routes produce analysis DOCX and revised source exports.

### 2.3 Repository layout (abbreviated)

| Path | Role |
|------|------|
| `frontend/` | Vite + React UI; proxies `/api` to backend in dev. |
| `backend/src/engine/layered/` | Core layered analysis implementation. |
| `backend/src/routes/layeredPlatform.ts` | Layered HTTP API surface. |
| `backend/config/layered-engine.json` | Tunables: blocks, profiles, contradiction, embeddings, dictionaries. |
| `backend/data/` | Runtime JSON for steering / domain constraints (examples in repo; live files often gitignored). |
| `ai-service/` | Optional chat gateway (not used for embeddings today). |

---

## 3. End-to-end data flow

### 3.1 Typical analyze request (JSON)

1. **Client** sends `POST /api/layered/analyze` with `rawText`, `profile`, `mode`, optional `parent_raw_text`, `trace_links`, `same_intent_llm`.
2. **Server** loads `EngineConfig` from `layered-engine.json`, resolves profile, optionally merges same-intent LLM flag.
3. **Organization context** for LLM calls is built from `ai-training-pack.json` + `domain-constraints.json` (`getAiOrganizationContextForEngine`).
4. **engine.ts** parses text into `CanonicalRequirement[]`, runs enabled blocks in order, aggregates `StructuredFinding[]` into set-level and per-requirement buckets, computes scores, returns `LayeredAnalysisResult`.
5. **Client** renders table, detail pane, set-level findings; stores feedback and accepted rewrites in Zustand.

### 3.2 Upload flow

Multipart requests hit `POST /api/layered/analyze-upload`; **ingest** extracts text (PDF/DOCX/XLSX/CSV/TXT), then the same engine path runs with extracted text and filenames for meta.

### 3.3 Exports

- **Analysis DOCX:** `POST /api/layered/export/analysis-docx` — builds report from result payload.
- **Revised source:** client sends blob + replacement pairs from accepted rewrites; server applies patches via `revisedSourceExport`.

---

## 4. Definitions

| Term | Definition |
|------|------------|
| **Canonical requirement** | Structured row (`CanonicalRequirement`) with id, normalized text, type, optional actor/action/object, thresholds. |
| **Profile** | Named slice of enabled **rule blocks** and scoring overrides (`EngineProfile` in config). |
| **Rule block** | Toggleable engine stage (e.g. `deterministic.unambiguous`, `contradiction.intra_document`). |
| **Structured finding** | Single issue: severity, attribute, explanation, optional evidence and suggested rewrite. |
| **Set-level finding** | Cross-requirement finding (overlap, terminology, same-intent, contradiction outputs merged into set list). |
| **Steering pack** | Organization text prepended to **every** layered LLM system prompt (not weight training). |
| **Domain constraint library** | Quantity/unit/synonym definitions appended to organization LLM context. |
| **Semantic embedding layer** | Optional OpenAI embeddings: vectors per requirement, functional clusters, neighbor-based contradiction pre-filter. |
| **Suggestion feedback** | UI-captured accept/reject/edit on AI suggestions with pipeline status for training export (NDJSON). |
| **AiClient** | Abstraction for JSON-mode chat completions (`completeJson`). |

---

## 5. Major components (detailed sections)

Each subsection corresponds to a major architectural function. Paths are relative to the repository root unless noted.

### 5.1 Express application bootstrap

#### File location
`backend/src/index.ts`

#### Intent and use
Starts the HTTP server, registers CORS and JSON body parsing, mounts classic requirement tier routes and **`layeredPlatform`** under `/api`, and returns a structured 404 for unknown API paths.

#### Inputs
- Environment: `PORT` (default 4000).
- Incoming HTTP requests.

#### Outputs
- JSON responses; global error handler returns 500 JSON on uncaught errors.

#### Improvements needed
- OpenAPI/Swagger spec generation from routes for product-ready API docs.
- Structured request logging and correlation IDs for support.

---

### 5.2 Layered HTTP API

#### File location
`backend/src/routes/layeredPlatform.ts`

#### Intent and use
Single router for layered engine: health, config, analyze (JSON + upload), export DOCX, revised source, AI training pack, steering JSONL download, domain constraints CRUD, trace/upload validation via **multer** and **zod** schemas.

#### Inputs
- JSON bodies and multipart form fields per route.
- Engine config via `loadEngineConfig()`; organization LLM context via `getAiOrganizationContextForEngine()`.

#### Outputs
- `LayeredAnalysisResult` JSON; binary DOCX/Blob routes; NDJSON attachment for steering export.

#### Improvements needed
- Authenticated upload size limits and virus scanning policy for enterprise deployments.
- Rate limiting and API keys for multi-tenant SaaS.

---

### 5.3 Layered engine orchestration

#### File location
`backend/src/engine/layered/engine.ts`

#### Intent and use
**Central orchestrator:** resolves profile, wraps `AiClient` with organization context, normalizes requirements, runs deterministic passes, optional AI attributes, legacy reconstruction, set-level cross checks, optional same-intent LLM, builds optional **semantic embedding context**, runs intra + hierarchy contradiction passes, merges findings into scoring input, builds `requirementsOut` with optional `semantic` metadata per row.

#### Inputs
- `EngineRunOptions` (text, profile, mode, parse options, parent text, trace links, optional org context string).
- `EngineConfig`, optional injected `AiClient`.

#### Outputs
- `Promise<LayeredAnalysisResult>` with meta (including `semantic_embedding` telemetry when applicable).

#### Improvements needed
- Explicit pipeline timings per stage in meta for performance regression tests.
- Plugin hook interface for third-party blocks without editing core orchestrator.

---

### 5.4 Engine configuration loader

#### File location
`backend/src/engine/layered/config.ts`

#### Intent and use
Loads **`backend/config/layered-engine.json`**, parses penalties, weights, rule registry, dictionaries, **contradiction** (including embedding flags), **set_level_cross**, and **profiles**. Exposes `resolveProfile`, `isBlockEnabled`, `effectiveScoringWeights`, and `withSameIntentLlmEnabled` for request-level overrides.

#### Inputs
- Optional custom file path; default bundled JSON path relative to compiled `dist`.

#### Outputs
- `EngineConfig`, `EngineProfile`, `ContradictionConfig`, etc.

#### Improvements needed
- Hot reload or admin API to update config without redeploy (with audit trail).
- JSON schema validation at startup with clearer error messages.

---

### 5.5 Public engine types

#### File location
`backend/src/engine/layered/types.ts`

#### Intent and use
Contracts shared across engine and API: requirements, findings, scores, meta (`LayeredAnalysisMeta`, `SemanticEmbeddingMeta`, contradiction counts), `EngineRunOptions`, trace links.

#### Inputs
- N/A (type definitions).

#### Outputs
- TypeScript types consumed by engine, routes, and frontend mirrors.

#### Improvements needed
- Published npm-type package or OpenAPI-derived types to guarantee FE/BE drift detection in CI.

---

### 5.6 Requirement normalization

#### File location
`backend/src/engine/layered/normalizeCanonical.ts`

#### Intent and use
Transforms raw specification text into **`CanonicalRequirement[]`** using parse options (level, tool profile, strictness). Feeds all downstream blocks.

#### Inputs
- Raw string, `EngineConfig`, parse options from requirements model.

#### Outputs
- Array of canonical requirements; parent normalization helper for hierarchy mode.

#### Improvements needed
- Stronger ID stability across re-runs for diffing baselines.
- Pluggable parsers per supplier tool (DOORS, Polarion) beyond generic paths.

---

### 5.7 Deterministic rule passes

#### File locations
`backend/src/engine/layered/deterministic/index.ts` (aggregates), `unambiguous.ts`, `complete.ts`, `verifiable.ts`, `singular.ts`, `consistentCorrect.ts`, `ruleContext.ts`, `newFinding.ts`

#### Intent and use
Per-requirement, non-LLM checks (banned/vague terms, structure heuristics, singular/conjunction logic, cross-requirement consistency hints via context). Each exports a **run\*** function producing `StructuredFinding[]`.

#### Inputs
- `CanonicalRequirement`, `DeterministicContext` (`config`, `allRequirements`).

#### Outputs
- Findings appended per requirement in `engine.ts`.

#### Improvements needed
- Centralized rule catalog document mapped 1:1 to block IDs for regulatory audiences.
- Measurement of rule precision/recall on labeled corpora.

---

### 5.8 AI client and attribute scoring

#### File locations
`backend/src/engine/layered/ai/aiClient.ts`, `backend/src/engine/layered/ai/attributeScoring.ts`

#### Intent and use
**aiClient:** `OpenAiJsonClient`, `RemoteAiClient`, `NullAiClient`, plus **`wrapAiClientWithOrganizationContext`** to prefix steering. **attributeScoring:** LLM pass over attribute dimensions for a single requirement.

#### Inputs
- Env: `OPENAI_API_KEY`, `OPENAI_MODEL`, `AI_SERVICE_URL`, `AI_SERVICE_SECRET`.
- Prompt payloads (`system`, `user`) for JSON-mode chat.

#### Outputs
- Parsed JSON or null; findings merged into per-requirement lists.

#### Improvements needed
- Unified retry/backoff and token accounting.
- Embeddings via same gateway option as chat for customers blocking direct OpenAI egress.

---

### 5.9 Legacy reconstruction

#### File location
`backend/src/engine/layered/legacyReconstruction.ts`

#### Intent and use
In **legacy** profile/mode, heuristic reconstruction of requirement intent and optional **AI augment** for rewrite suggestions stored on `PerRequirementResult.legacy`.

#### Inputs
- Requirement row, existing deterministic findings; `AiClient` when augment enabled.

#### Outputs
- `LegacyReconstructionResult` attached per requirement.

#### Improvements needed
- Separate evaluation harness for rewrite quality vs human edits.

---

### 5.10 Set-level cross-requirement analysis

#### File locations
`backend/src/engine/layered/setLevel/crossConsistency.ts`, `crossIntentAi.ts`, `semanticAlignment.ts`

#### Intent and use
**crossConsistency:** lexical/near-duplicate/overlap and related cross-requirement findings without LLM (subject to thresholds). **crossIntentAi:** optional batched LLM for same-intent pairs when config + API allow. **semanticAlignment:** supporting similarity helpers.

#### Inputs
- Full requirement array; `EngineConfig`; `AiClient` for AI path.

#### Outputs
- `StructuredFinding[]` appended to set-level list in `engine.ts`.

#### Improvements needed
- Combine embedding similarity with lexical floors for same-intent candidate generation (partially overlapping with contradiction embedding layer).

---

### 5.11 Intra-document contradiction

#### File locations
`backend/src/engine/layered/contradiction/runIntraDocument.ts`, `pairCandidates.ts`, `semantics.ts`, `intraPairGuards.ts`, `intraDeterministic.ts`, `intraAi.ts`, `textUtils.ts`, `blockIds.ts`

#### Intent and use
Extracts lightweight **semantics** per requirement, generates **candidate pairs** (optionally restricted by embedding neighbor set), runs **deterministic** numeric/behavior checks, optionally **LLM adjudication** batched over top pairs.

#### Inputs
- Requirements, `ContradictionConfig`, `AiClient`, optional `SemanticEmbeddingContext`.

#### Outputs
- Findings + `pairsExamined` count for meta.

#### Improvements needed
- Calibration study: embedding pre-filter vs recall on labeled contradiction sets.
- Explainability field linking each finding to candidate generator reasons.

---

### 5.12 Parent–child (hierarchy) contradiction

#### File locations
`backend/src/engine/layered/contradiction/runParentChild.ts`, `hierarchyMatch.ts`, `hierarchyDeterministic.ts`, `hierarchyAi.ts`

#### Intent and use
Matches parent requirements to children via **trace links** or **similarity** (optionally embedding-boosted), runs deterministic checks, orphan/missing coverage findings, optional hierarchy LLM review.

#### Inputs
- Parent and child requirement arrays, trace links, config, `AiClient`, optional embedding vectors map.

#### Outputs
- Findings; `pairsExamined`.

#### Improvements needed
- Weighted fusion of embedding vs lexical tunable per customer in config UI.
- Explicit trace validation errors when IDs missing from parsed sets.

---

### 5.13 Semantic embedding layer

#### File locations
`backend/src/engine/layered/embedding/openaiEmbeddings.ts`, `backend/src/engine/layered/embedding/semanticLayer.ts`

#### Intent and use
Batch calls OpenAI **embeddings** API; L2-normalized cosine similarity; **top-K neighbor pair** universe for intra contradiction pre-filter; **union-find clustering** for functional cluster IDs on analysis meta and rows.

#### Inputs
- Child + parent requirement texts; `ContradictionConfig.embedding_*`; `OPENAI_API_KEY`.

#### Outputs
- `SemanticEmbeddingContext` or null; meta `semantic_embedding` diagnostics.

#### Improvements needed
- Local/on-prem embedding models to avoid data egress.
- Incremental embedding cache keyed by content hash for large specs.

---

### 5.14 Scoring

#### File location
`backend/src/engine/layered/scoring.ts`

#### Intent and use
Rolls per-requirement scores from findings using configured penalties and weights (including profile overrides).

#### Inputs
- Requirements, per-req findings map, set-level findings, config, profile.

#### Outputs
- `Map<requirement_id, RequirementScores>`.

#### Improvements needed
- Transparent score breakdown export per dimension for auditors.

---

### 5.15 Word report and revised source export

#### File locations
`backend/src/engine/layered/wordReport.ts`, `backend/src/engine/layered/revisedSourceExport.ts`

#### Intent and use
**wordReport:** builds DOCX from `LayeredAnalysisResult`. **revisedSourceExport:** applies accepted rewrite replacements to uploaded/pasted source blob formats.

#### Inputs
- Analysis result or binary source + replacement list.

#### Outputs
- DOCX buffer; revised file blob + download name.

#### Improvements needed
- DOCX fidelity when preserving customer templates (currently regenerated content).

---

### 5.16 AI steering pack and organization context

#### File location
`backend/src/engine/layered/aiTrainingPack.ts`

#### Intent and use
Loads/saves **`backend/data/ai-training-pack.json`**; formats global + topic steering for LLM injection; **`getAiOrganizationContextForEngine`** concatenates steering + domain library; auto-writes steering fine-tune JSONL scaffold on save.

#### Inputs
- Pack JSON from disk or POST body.

#### Outputs
- Prompt prefix string; optional JSONL file on disk.

#### Improvements needed
- Versioning and signed approvals workflow before steering hits production servers.

---

### 5.17 Domain constraint library

#### File location
`backend/src/engine/layered/domainConstraintLibrary.ts`

#### Intent and use
Loads/saves **`backend/data/domain-constraints.json`**; formats quantity/unit/synonym block for LLM context appended after steering.

#### Inputs
- Library JSON.

#### Outputs
- Prompt fragment; REST CRUD via `layeredPlatform.ts`.

#### Improvements needed
- Validation rules (unit ontology) and import from SysML/physical modeling tools.

---

### 5.18 Text ingest for uploads

#### File location
`backend/src/ingest/ingest.ts` (referenced from layered routes)

#### Intent and use
Extracts plain text from uploaded binary types for layered analyze-upload.

#### Inputs
- Buffer + MIME/filename.

#### Outputs
- Extracted string for parser.

#### Improvements needed
- Table-aware extraction for Excel (preserve row/column semantics where IDs live).

---

### 5.19 Frontend application shell and routing

#### File locations
`frontend/src/App.tsx`, `frontend/src/components/AppLayout.tsx`

#### Intent and use
React Router layout with sidebar navigation (dashboard, review, legacy, config, AI training, domain constraints, reports); quick actions for upload and new analysis.

#### Inputs
- User navigation and file picks.

#### Outputs
- Routed pages; triggers store actions.

#### Improvements needed
- Role-based visibility for training/governance pages.

---

### 5.20 Analysis state and API client

#### File locations
`frontend/src/store/useAnalysisStore.ts`, `frontend/src/api/layeredApi.ts`

#### Intent and use
**Zustand** holds analysis result, filters, upload state, parent/child files, **accepted rewrites**, **suggestion feedback** with training pipeline statuses, **feedback run ID**. **layeredApi** wraps fetch to layered endpoints including steering/domain JSONL helpers.

#### Inputs
- User actions; API JSON.

#### Outputs
- UI state; downloadable feedback NDJSON.

#### Improvements needed
- Persist feedback to server or encrypted backup (currently session-oriented).

---

### 5.21 Review UI and feedback capture

#### File locations
`frontend/src/pages/Review.tsx`, `frontend/src/components/RequirementDetail.tsx`, `frontend/src/components/RewritePanel.tsx`, `frontend/src/components/SuggestionFeedbackBar.tsx`, `frontend/src/components/TrainingPipelineFeedbackList.tsx`, `frontend/src/types/suggestionFeedback.ts`

#### Intent and use
Requirement table with optional **semantic cluster** column; detail pane with findings and rewrite suggestions; **Accept / Reject / Edit** feedback; pipeline status select; export feedback log.

#### Inputs
- Analysis result from store.

#### Outputs
- Local NDJSON export; UI status updates.

#### Improvements needed
- Server-side persistence and RBAC on feedback exports.

---

### 5.22 Dashboard and configuration UI

#### File locations
`frontend/src/pages/Dashboard.tsx`, `frontend/src/components/DashboardOverview.tsx`, `frontend/src/pages/Config.tsx`, `frontend/src/components/ConfigPanel.tsx`

#### Intent and use
Filtered overview stats; semantic embedding banner when enabled; local-only overrides for rule toggles and dictionaries (merged client-side with server config display).

#### Inputs
- Store analysis + engine config fetch.

#### Outputs
- Read/edited draft config (localStorage).

#### Improvements needed
- Server-side profile editing API to replace local-only overrides.

---

### 5.23 Governance pages (AI training & domain constraints)

#### File locations
`frontend/src/pages/AiTraining.tsx`, `frontend/src/pages/DomainConstraints.tsx`

#### Intent and use
Edit steering pack and domain constraint library via REST; download auto-generated steering JSONL.

#### Inputs
- GET/POST API responses.

#### Outputs
- Saved JSON on server under `backend/data/`.

#### Improvements needed
- Draft/publish workflow and diff view vs previous version.

---

## 6. Cross-cutting improvement themes

| Theme | Description |
|-------|-------------|
| **Observability** | Structured logs, metrics per engine stage, trace IDs. |
| **Security** | AuthN/Z on APIs, secret rotation, upload scanning. |
| **Multi-tenant** | Isolate `data/` packs per tenant; config namespaces. |
| **ML ops** | First-class embedding + feedback dataset pipelines; model registry for deployed IDs. |
| **Testing** | Contract tests FE/BE; golden files for parser; contradiction benchmark suite. |

---

## 7. Document history

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-04-07 | Baseline snapshot: layered engine, embeddings, steering, domain library, feedback statuses. |
