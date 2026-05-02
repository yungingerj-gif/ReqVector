# ReqVector Web Application — User Guide

**Document type:** End-user / operator instructions  
**Product:** ReqVector layered requirements workbench  
**Version:** 1.0  
**Date:** 2026-04-07  

---

## 1. Purpose and audience

This guide explains how to operate the **ReqVector** web application: starting the app, importing specifications, running analyses, interpreting results, exporting reports, and configuring optional AI steering and domain constraints. It is written for **analysts**, **requirements engineers**, and **internal operators** who run the tool on a workstation or shared server.

---

## 2. What you need before you start

| Prerequisite | Notes |
|--------------|-------|
| **Modern web browser** | Current Chrome, Edge, or Firefox recommended. |
| **Backend API running** | Node.js server on port **4000** by default (`backend`). |
| **Frontend dev server** | Vite dev server proxies `/api` to the backend (default frontend URL is typically **http://localhost:5173**). |
| **Network** | Browser must reach the machine hosting the API (same host in dev). |
| **OpenAI (optional)** | Layered LLM features (attribute analysis, same-intent check, contradiction adjudication, embeddings if enabled in engine config) require **`OPENAI_API_KEY`** on the **server**. Without it, deterministic rules still run; LLM-dependent findings may be absent. |

---

## 3. Starting the application

### 3.1 Development setup (typical)

1. **Terminal A — backend:** From the `backend` folder, install dependencies once (`npm install`), build if needed (`npm run build`), then start with `npm run dev` or `npm start` per your team’s procedure. Confirm the API listens on **port 4000** (or note your custom `PORT`).
2. **Terminal B — frontend:** From the `frontend` folder, run `npm install` once, then `npm run dev`. Open the URL printed in the terminal (often **http://localhost:5173**).
3. The frontend sends API calls to **`/api`**, which Vite proxies to **http://localhost:4000** during development.

### 3.2 Production-style deployment

Your organization may serve the built frontend as static files and the backend behind a reverse proxy. In that case use the URL your administrator provides; the UI behavior is the same as long as **`/api`** reaches the ReqVector backend.

---

## 4. Screen layout

### 4.1 Left sidebar (navigation)

| Link | Purpose |
|------|---------|
| **Dashboard** | Summary metrics and set-level findings for the current analysis. |
| **Requirement Review** | Upload/paste, run analysis, table + detail, exports for revised source and AI feedback. |
| **Legacy Reconstruction** | View legacy reconstruction output after a run that produced it. |
| **Traceability Matrix** | Placeholder for a future release. |
| **Config Profiles** | View server engine configuration and apply **browser-only** overrides (stored in local storage). |
| **AI training** | Edit organization steering text saved on the server; download optional steering JSONL. |
| **Domain constraints** | Edit quantity/unit/synonym library appended to AI context. |
| **Reports** | Download the **analysis Word report** (.docx). |
| **Classic analyze (legacy UI)** | Opens the separate classic analyzer at **`/classic`** (different layout). |

### 4.2 Top header (all main pages)

| Control | Purpose |
|---------|---------|
| **Import spec** | Chooses a single file (`.txt`, `.csv`, `.pdf`, `.docx`, `.xlsx`, `.xls`) and runs ingest + analysis workflow from the header. |
| **New analysis** | Clears the current analysis state and navigates to **Requirement Review** to start fresh. |
| **Profile** | Quick selector: **`default_active_spec`** or **`legacy_spec`**. Aligns with the profile dropdown on the review upload panel. |

---

## 5. Running an analysis (Requirement Review)

Open **Requirement Review** from the sidebar. Work through the **Upload or paste requirements** panel from top to bottom.

### 5.1 Single document vs parent / child

| Mode | What to do |
|------|------------|
| **Single document (default)** | Either drag-and-drop a file onto the drop zone, click **Upload file**, or paste text into **Paste requirements**. At least one of file content or non-empty paste is required before **Run analysis**. |
| **Parent / child comparison** | Toggle **Parent / child comparison: on**. Upload **Child specification** (analyzed in detail) and **Parent specification** (higher-level reference). Both files must be selected before **Run analysis**. |

**Supported file types for upload:** PDF, DOCX, XLSX, CSV, TXT (and `.xls` where accepted).

### 5.2 Mode and profile

| Field | Options | Meaning |
|-------|---------|---------|
| **Mode** | **Active Spec Mode** | Standard layered analysis for active specifications. |
| **Mode** | **Legacy Reconstruction Mode** | Enables legacy-oriented engine behavior; use with **Legacy Reconstruction** page to inspect outputs. |
| **Profile** | **default_active_spec** | Default rule bundle for active specs. |
| **Profile** | **legacy_spec** | Profile tuned for legacy reconstruction scenarios. |

You can change **Profile** in the header or on this panel; keep them consistent with your intent.

### 5.3 Optional: LLM same-intent check

Enable **LLM same-intent check** to ask the model which requirement pairs express the same obligation. This adds **`same_intent_llm`** class findings when the server has a working LLM configuration. If **`OPENAI_API_KEY`** is not set on the server, enabling the checkbox has **no effect**.

### 5.4 Execute

Click **Run analysis**. The button shows **Running…** while the request is in progress. Errors from the API appear below the button.

---

## 6. After analysis: Requirement Review

### 6.1 Filters

Use **Table filters** to narrow visible requirements (severity, profile, search text, etc.). Filters affect the table and dashboard statistics that honor the same filter logic.

### 6.2 Requirements table and detail

- Select a row in **Requirements table** to open **Requirement detail**: findings, scores, suggested rewrites, and feedback controls.
- Use suggestion feedback (**Accept**, **Reject**, **Edit**) where offered; optional pipeline status helps categorize entries for export.

### 6.3 Set-level findings

Cross-requirement issues appear in **Set-level findings** sections on Review and Dashboard.

### 6.4 Download revised source document

This export is **not** the same as the Reports Word document.

| Behavior | Detail |
|----------|--------|
| **Purpose** | Applies **accepted** rewrites by replacing each requirement’s **`source_text`** in the uploaded body. |
| **TXT / CSV / XLSX** | Format preserved where possible. Legacy **`.xls`** may be saved as **`.xlsx`**. |
| **DOCX** | Regenerated from extracted text; layout may differ from the original. |
| **PDF** | Revised content is emitted as **`.txt`**. |
| **Paste-only runs** | Treated as **`requirements.txt`** for naming purposes. |

Click **Download revised source** after accepting changes. With no accepted changes, you may still download; content is unchanged.

### 6.5 Download AI feedback log

After logging suggestion feedback, **Download AI feedback log** saves an **NDJSON** file (`.jsonl`) suitable for downstream tooling. The button shows the count of entries for the current feedback run.

---

## 7. Dashboard

Open **Dashboard** for:

- **Overview** cards: filtered requirement count, average overall score, count of **high** severity findings, and indication of **legacy vs active** for the **current run**.
- **Semantic embedding** banner when the last run used the embedding layer (model name, cluster count, neighbor seeds)—subject to server configuration.
- **Set-level findings** list for the current result.

Apply **Table filters** here the same way as on Review; overview stats respect filtered rows where indicated.

---

## 8. Legacy Reconstruction page

1. Run an analysis with **Legacy Reconstruction Mode** (and typically **`legacy_spec`** profile) from Requirement Review.
2. Open **Legacy Reconstruction** to see per-requirement legacy payloads when the engine produced them.
3. If the page says there is no legacy output, confirm mode/profile and that the engine enabled legacy blocks for that run.

---

## 9. Config Profiles

**Config Profiles** loads **`layered-engine.json`** settings from the server (rule blocks, scoring weights, dictionaries).

| Capability | Detail |
|------------|--------|
| **View** | Inspect which blocks are on/off and edit scoring weights or dictionary lists in the UI draft. |
| **Save to this browser** | Overrides are stored in **local storage** only—they **do not** change the server file. Another browser or cleared storage resets overrides. |
| **Reset** | Use the panel’s reset control to discard local overrides and revert to server defaults. |

Use this page for experiments; production-wide changes belong in **`backend/config/layered-engine.json`** on the server with your change-management process.

---

## 10. AI training and steering

Open **AI training**.

| Area | Instruction |
|------|-------------|
| **Global instructions** | Text prepended to **every** layered LLM system prompt (terminology, safety, how to judge overlap vs contradiction). |
| **Topic examples** | Optional labeled excerpts with guidance for the model. |
| **Save** | Persists to **`backend/data/ai-training-pack.json`** on the server and regenerates **`ai-training-steering.jsonl`** for optional external fine-tuning. |
| **Download JSONL** | Retrieves the steering JSONL file; **review and redact** before sending to any external provider. |

Steering **does not** train model weights by itself; it shapes runtime prompts. Full playbook (if present in your repo): **`docs/llm-training-manual.md`**.

---

## 11. Domain constraints

Open **Domain constraints** to maintain quantity/unit/synonym rows and a short library summary. **Save** writes **`backend/data/domain-constraints.json`** on the server. Enabled rows are formatted into LLM context **after** steering text on layered AI calls.

---

## 12. Reports

Open **Reports** and click **Download Word report (.docx)** to export a structured report for the **current analysis result**. You must run an analysis first; this document is separate from **Download revised source** on Requirement Review.

---

## 13. Classic analyzer

**Classic analyze (legacy UI)** opens **`/classic`**, a separate single-page analyzer. Use it only when your workflow still depends on that interface; the layered workbench is the primary product surface described in this guide.

---

## 14. Troubleshooting

| Symptom | What to check |
|---------|----------------|
| **Network error / failed fetch** | Backend running? Correct URL? Firewall/proxy blocking **`/api`**? |
| **LLM features never appear** | **`OPENAI_API_KEY`** set on **server**? Model and quota OK? Engine config enables AI blocks? |
| **Same-intent checkbox does nothing** | Same as LLM; server must accept chat completions. |
| **Upload rejected or empty text** | File type supported? Corrupt file? Try TXT paste to isolate ingest issues. |
| **Config changes not visible to others** | Config Profiles overrides are **local** only—edit server JSON for shared behavior. |
| **Stale results after New analysis** | Confirm you clicked **New analysis** or cleared state; re-run **Run analysis** after changing files. |

---

## 15. Quick reference — main exports

| Export | Location | Format |
|--------|----------|--------|
| Analysis report | **Reports** | `.docx` |
| Revised source | **Requirement Review** | Original family (see §6.4) |
| AI suggestion feedback | **Requirement Review** | `.jsonl` (NDJSON) |
| Steering JSONL | **AI training** | `.jsonl` download |

---

## 16. Document history

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-04-07 | Initial product-ready user guide for layered web UI. |
