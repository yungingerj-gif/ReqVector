/**
 * Generates docs/architecture-baseline.docx from docs/architecture-baseline.md.
 * Run: npm --workspace backend run docx:architecture-baseline
 */
const fs = require("fs");
const path = require("path");
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
} = require("docx");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const MD_PATH = path.join(REPO_ROOT, "docs", "architecture-baseline.md");
const OUT_PATH = path.join(REPO_ROOT, "docs", "architecture-baseline.docx");

function stripMdBold(s) {
  return s.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1");
}

function parseInlineRuns(text) {
  const t = stripMdBold(text);
  return [new TextRun({ text: t, size: 22 })];
}

function parseTable(lines, startIdx) {
  const rows = [];
  let i = startIdx;
  while (i < lines.length && lines[i].trim().startsWith("|")) {
    const raw = lines[i].trim();
    if (/^\|[\s\-:|]+\|$/.test(raw)) {
      i++;
      continue;
    }
    const cells = raw
      .split("|")
      .map((c) => stripMdBold(c.trim()))
      .filter((c, idx, arr) => !(idx === 0 && c === "") && !(idx === arr.length - 1 && c === ""));
    rows.push(cells);
    i++;
  }
  if (rows.length === 0) return { table: null, nextIdx: startIdx };
  const docxRows = rows.map(
    (cells) =>
      new TableRow({
        children: cells.map(
          (c) =>
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: c.slice(0, 500), size: 20 })] })],
            })
        ),
      })
  );
  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: docxRows,
  });
  return { table, nextIdx: i };
}

function mdToDocxParagraphs(md) {
  const lines = md.split(/\r?\n/);
  const children = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      let j = i + 1;
      while (j < lines.length && lines[j].trim() !== "```") j++;
      i = j < lines.length ? j : lines.length - 1;
      continue;
    }

    if (trimmed === "" || trimmed === "---") continue;

    if (trimmed.startsWith("# ") && !trimmed.startsWith("## ")) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.TITLE,
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: trimmed.slice(2).trim(), bold: true, size: 36 })],
        })
      );
      continue;
    }

    if (trimmed.startsWith("## ")) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: trimmed.slice(3).trim(), bold: true, size: 28 })],
        })
      );
      continue;
    }

    if (trimmed.startsWith("### ")) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun({ text: trimmed.slice(4).trim(), bold: true, size: 24 })],
        })
      );
      continue;
    }

    if (trimmed.startsWith("#### ")) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun({ text: trimmed.slice(5).trim(), bold: true, size: 22 })],
        })
      );
      continue;
    }

    if (trimmed.startsWith("|")) {
      const { table, nextIdx } = parseTable(lines, i);
      if (table) {
        children.push(table);
        children.push(new Paragraph({ text: "" }));
        i = nextIdx - 1;
      }
      continue;
    }

    if (trimmed.startsWith("- [ ]")) {
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          children: parseInlineRuns(trimmed.replace(/^- \[ \]\s*/, "")),
        })
      );
      continue;
    }

    if (trimmed.startsWith("- ")) {
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          children: parseInlineRuns(trimmed.slice(2)),
        })
      );
      continue;
    }

    if (/^\d+\.\s/.test(trimmed)) {
      children.push(
        new Paragraph({
          numbering: { reference: "manual-num", level: 0 },
          children: parseInlineRuns(trimmed.replace(/^\d+\.\s*/, "")),
        })
      );
      continue;
    }

    children.push(new Paragraph({ children: parseInlineRuns(trimmed) }));
  }

  return children;
}

async function main() {
  if (!fs.existsSync(MD_PATH)) {
    console.error("Missing:", MD_PATH);
    process.exit(1);
  }
  const md = fs.readFileSync(MD_PATH, "utf8");
  const sectionChildren = mdToDocxParagraphs(md);

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: "manual-num",
          levels: [
            {
              level: 0,
              format: "decimal",
              text: "%1.",
              alignment: "start",
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text:
                  "Generated from architecture-baseline.md — regenerate via npm --workspace backend run docx:architecture-baseline",
                italics: true,
                size: 18,
              }),
            ],
          }),
          new Paragraph({ text: "" }),
          ...sectionChildren,
        ],
      },
    ],
  });

  const buf = await Packer.toBuffer(doc);
  try {
    fs.writeFileSync(OUT_PATH, buf);
    console.log("Wrote", OUT_PATH);
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "EBUSY") {
      const alt = OUT_PATH.replace(/\.docx$/i, ".new.docx");
      fs.writeFileSync(alt, buf);
      console.log("Primary file locked (close Word). Wrote", alt);
    } else {
      throw e;
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
