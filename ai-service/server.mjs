/**
 * Minimal AI gateway for the layered requirements backend.
 * Main app calls AI_SERVICE_URL with the same contract as OpenAiJsonClient expects after parse.
 *
 * Env: OPENAI_API_KEY (required), OPENAI_MODEL (optional), PORT (default 8787),
 *      AI_SERVICE_SECRET (optional; if set, require Authorization: Bearer <secret>)
 */
import express from "express";

const PORT = Number(process.env.PORT) || 8787;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const SERVICE_SECRET = process.env.AI_SERVICE_SECRET?.trim();

if (!OPENAI_KEY || OPENAI_KEY.length < 8) {
  console.error("Set OPENAI_API_KEY to run the AI gateway.");
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: "4mb" }));

function authOk(req) {
  if (!SERVICE_SECRET) return true;
  const h = req.headers.authorization;
  return h === `Bearer ${SERVICE_SECRET}`;
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "requirements-ai-gateway" });
});

app.post("/v1/complete-json", async (req, res) => {
  if (!authOk(req)) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const system = typeof req.body?.system === "string" ? req.body.system : "";
  const user = typeof req.body?.user === "string" ? req.body.user : "";
  if (!system && !user) {
    res.status(400).json({ error: "expected { system, user } strings" });
    return;
  }

  try {
    const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      console.error("OpenAI error", upstream.status, errText.slice(0, 500));
      res.status(502).json({ error: "upstream_error", status: upstream.status });
      return;
    }

    const data = await upstream.json();
    const raw = data?.choices?.[0]?.message?.content;
    if (!raw || typeof raw !== "string") {
      res.status(502).json({ error: "empty_model_output" });
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      res.status(502).json({ error: "model_output_not_json" });
      return;
    }
    res.json(parsed);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "internal" });
  }
});

app.listen(PORT, () => {
  console.log(`AI gateway http://127.0.0.1:${PORT}  (POST /v1/complete-json)`);
  if (SERVICE_SECRET) console.log("Auth: Bearer AI_SERVICE_SECRET required");
});
