import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { loadEngineConfig, runLayeredEngine } from "../../engine/layered/engine";

describe("layered engine smoke", () => {
  it("runs active mode on fixture text", async () => {
    const raw = readFileSync(
      join(process.cwd(), "src", "tests", "layered", "fixtures", "sampleRequirements.txt"),
      "utf-8"
    );
    const config = loadEngineConfig();
    const result = await runLayeredEngine(
      {
        rawText: raw,
        source_document: "sampleRequirements.txt",
        profile: "default_active_spec",
        mode: "active",
      },
      config
    );
    expect(result.meta.requirement_count).toBeGreaterThan(5);
    expect(result.requirements.length).toBe(result.meta.requirement_count);
    expect(result.requirements[0]?.scores.overall).toBeGreaterThanOrEqual(0);
    expect(result.requirements[0]?.scores.overall).toBeLessThanOrEqual(100);
    expect(Array.isArray(result.set_level_findings)).toBe(true);
    expect(result.requirements.every((r) => r.findings.length >= 0)).toBe(true);
  });

  it("runs legacy mode and attaches legacy objects", async () => {
    const raw =
      "FR-1: The system should be user friendly and quickly provide results.";
    const config = loadEngineConfig();
    const result = await runLayeredEngine(
      {
        rawText: raw,
        source_document: "inline",
        profile: "legacy_spec",
        mode: "legacy",
      },
      config
    );
    expect(result.requirements.length).toBeGreaterThanOrEqual(1);
    const first = result.requirements[0];
    expect(first?.legacy).toBeDefined();
    expect(first?.legacy?.minimal_cleanup_rewrite).toBeDefined();
    expect(first?.legacy?.system_level_rewrite).toBeDefined();
  });
});
