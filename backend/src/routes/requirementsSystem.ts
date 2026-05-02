/**
 * System Requirements – route layer.
 * Allocates current analyze + specification upload to system-level; also exposes generic analyze with level in options.
 */
import express from "express";
import multer from "multer";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import { z } from "zod";
import { validateBody } from "../middleware/validate";
import type {
  RequirementsAnalyzeOptions,
  RequirementsAnalyzeRequest,
} from "../models/requirements";
import {
  analyzeRequirements,
  analyzeSystemRequirements,
} from "../services/requirementsAnalyzeService";

const router = express.Router();

const ALLOWED_SPEC_MIMES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
] as const;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_SPEC_MIMES.includes(file.mimetype as typeof ALLOWED_SPEC_MIMES[number])) {
      cb(new Error("Only PDF and Word (.docx) files are allowed"));
      return;
    }
    cb(null, true);
  },
});

const LEVELS = ["stakeholder", "system", "subsystem", "component", "implementation"] as const;

const TOOLS = ["generic", "doors", "polarion", "jama"] as const;

const analyzeSchema = z.object({
  context: z.string().optional(),
  rawText: z.string().min(1),
  options: z.object({
    strictIncose: z.boolean().optional(),
    level: z.enum(LEVELS).optional(),
    requirementManagementTool: z.enum(TOOLS).optional(),
  }).optional(),
});

router.post("/requirements/analyze", validateBody(analyzeSchema), (req, res) => {
  const body = req.body as RequirementsAnalyzeRequest;
  const result = analyzeRequirements(body.rawText, body.options ?? {});
  res.json(result);
});

router.post("/requirements/analyze-system", validateBody(analyzeSchema), (req, res) => {
  const body = req.body as { rawText: string; options?: { strictIncose?: boolean } };
  const result = analyzeSystemRequirements(body.rawText, { strictIncose: body.options?.strictIncose });
  res.json(result);
});

async function extractTextFromSpecification(file: { buffer: Buffer; mimetype: string }): Promise<string> {
  const mime = file.mimetype;
  if (mime === "application/pdf") {
    const parser = new PDFParse({ data: file.buffer });
    const textResult = await parser.getText();
    const text = textResult?.text ?? "";
    await parser.destroy();
    return text;
  }
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return result.value ?? "";
  }
  throw new Error("Unsupported file type");
}

router.post("/requirements/analyze-specification", upload.single("specification"), async (req, res) => {
  try {
    if (!req.file?.buffer) {
      res.status(400).json({ message: "Missing file: upload a PDF or Word (.docx) as 'specification'." });
      return;
    }
    const text = (await extractTextFromSpecification(req.file)).trim();
    if (!text) {
      res.status(400).json({ message: "No text could be extracted from the file." });
      return;
    }
    const options: RequirementsAnalyzeOptions = { level: "system" };
    if (req.body?.options && typeof req.body.options === "string") {
      try {
        const parsed = JSON.parse(req.body.options) as RequirementsAnalyzeOptions;
        if (typeof parsed.strictIncose === "boolean") options.strictIncose = parsed.strictIncose;
        if (parsed.level) options.level = parsed.level;
        if (parsed.requirementManagementTool) options.requirementManagementTool = parsed.requirementManagementTool;
      } catch {
        // ignore
      }
    }
    const result = analyzeRequirements(text, options);
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to process specification file.";
    res.status(500).json({ message });
  }
});

export default router;
