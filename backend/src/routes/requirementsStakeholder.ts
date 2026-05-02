/**
 * Stakeholder Requirements – route layer.
 */
import express from "express";
import { z } from "zod";
import { validateBody } from "../middleware/validate";
import { analyzeStakeholderRequirements } from "../services/requirementsAnalyzeService";

const router = express.Router();

const schema = z.object({
  context: z.string().optional(),
  rawText: z.string().min(1),
  options: z.object({ strictIncose: z.boolean().optional() }).optional(),
});

router.post("/requirements/analyze-stakeholder", validateBody(schema), (req, res) => {
  const body = req.body as { rawText: string; options?: { strictIncose?: boolean } };
  const result = analyzeStakeholderRequirements(body.rawText, { strictIncose: body.options?.strictIncose });
  res.json(result);
});

export default router;
