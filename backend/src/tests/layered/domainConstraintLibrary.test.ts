import { describe, expect, it } from "vitest";
import { formatDomainConstraintsForPrompt, type DomainConstraintLibrary } from "../../engine/layered/domainConstraintLibrary";

describe("domain constraint library", () => {
  it("formats enabled rows for LLM", () => {
    const lib: DomainConstraintLibrary = {
      updated_at: "",
      summary: "Test scope.",
      constraints: [
        {
          id: "1",
          label: "Torque",
          category: "mechanical",
          canonical_unit: "N·m",
          alternate_units: ["Nm"],
          synonyms: ["shaft torque"],
          notes_for_llm: "Check SI.",
          enabled: true,
        },
        {
          id: "2",
          label: "Disabled",
          canonical_unit: "V",
          enabled: false,
        },
      ],
    };
    const s = formatDomainConstraintsForPrompt(lib);
    expect(s).toContain("DOMAIN CONSTRAINT LIBRARY");
    expect(s).toContain("Torque");
    expect(s).toContain("N·m");
    expect(s).not.toContain("Disabled");
  });
});
