import { Document, Packer, Paragraph, TextRun } from "docx";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import * as XLSX from "xlsx";

export type SourceReplacement = { from: string; to: string };

/** Longest-first so shorter phrases inside longer requirements do not corrupt replacements. */
export function applyReplacementsToText(content: string, replacements: SourceReplacement[]): string {
  const reps = replacements
    .filter((r) => r.from.length > 0 && r.from !== r.to)
    .sort((a, b) => b.from.length - a.from.length);
  let out = content;
  for (const { from, to } of reps) {
    out = out.split(from).join(to);
  }
  return out;
}

function extFromName(name: string): string {
  const m = name.match(/\.([^.]+)$/);
  return (m?.[1] ?? "").toLowerCase();
}

function safeBasename(name: string): string {
  const base = name.replace(/^.*[/\\]/, "").replace(/[^a-zA-Z0-9._\s-]+/g, "_").trim().slice(0, 180);
  return base || "document";
}

function patchXlsxLikeBuffer(buffer: Buffer, replacements: SourceReplacement[]): Buffer {
  const wb = XLSX.read(buffer, { type: "buffer" });
  for (const sheetName of wb.SheetNames) {
    const sh = wb.Sheets[sheetName];
    if (!sh) continue;
    const data = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sh, {
      header: 1,
      defval: "",
      raw: false,
    }) as unknown as (string | number | boolean | null)[][];
    for (const row of data) {
      if (!Array.isArray(row)) continue;
      for (let i = 0; i < row.length; i++) {
        const cell = row[i];
        if (cell == null) continue;
        const s = String(cell);
        row[i] = applyReplacementsToText(s, replacements);
      }
    }
    wb.Sheets[sheetName] = XLSX.utils.aoa_to_sheet(data);
  }
  const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return Buffer.isBuffer(out) ? out : Buffer.from(out);
}

async function revisedDocx(buffer: Buffer, replacements: SourceReplacement[], baseName: string) {
  const result = await mammoth.extractRawText({ buffer });
  const text = result.value ?? "";
  const revised = applyReplacementsToText(text, replacements);
  const lines = revised.split(/\r?\n/);
  const paras = lines.map(
    (line) => new Paragraph({ children: [new TextRun({ text: line.slice(0, 2000) })] })
  );
  const doc = new Document({ sections: [{ children: paras }] });
  const buf = await Packer.toBuffer(doc);
  return {
    buffer: Buffer.from(buf),
    outName: `revised-${baseName}.docx`,
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
}

export async function buildRevisedSourceExport(input: {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  replacements: SourceReplacement[];
}): Promise<{ buffer: Buffer; outName: string; contentType: string }> {
  const { buffer, originalname, mimetype, replacements } = input;
  const name = safeBasename(originalname);
  const e = extFromName(name);

  const isTextLike =
    e === "txt" ||
    e === "csv" ||
    mimetype === "text/plain" ||
    mimetype === "text/csv" ||
    mimetype === "application/csv";

  if (isTextLike) {
    const text = buffer.toString("utf8");
    const revised = applyReplacementsToText(text, replacements);
    const ct =
      e === "csv" || mimetype === "text/csv" || mimetype === "application/csv"
        ? "text/csv; charset=utf-8"
        : "text/plain; charset=utf-8";
    return {
      buffer: Buffer.from(revised, "utf8"),
      outName: `revised-${name}`,
      contentType: ct,
    };
  }

  const isSheet =
    e === "xlsx" ||
    e === "xls" ||
    mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimetype === "application/vnd.ms-excel";

  if (isSheet) {
    const outBuf = patchXlsxLikeBuffer(buffer, replacements);
    const base = name.replace(/\.(xlsx|xls)$/i, "") || name;
    return {
      buffer: outBuf,
      outName: `revised-${base}.xlsx`,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
  }

  const isDocx =
    e === "docx" ||
    mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  if (isDocx) {
    const base = name.replace(/\.docx$/i, "") || name;
    return revisedDocx(buffer, replacements, base);
  }

  if (e === "pdf" || mimetype === "application/pdf") {
    const parser = new PDFParse({ data: buffer });
    const textResult = await parser.getText();
    const text = textResult?.text ?? "";
    await parser.destroy();
    const revised = applyReplacementsToText(text, replacements);
    const base = name.replace(/\.pdf$/i, "") || name;
    return {
      buffer: Buffer.from(revised, "utf8"),
      outName: `revised-${base}.txt`,
      contentType: "text/plain; charset=utf-8",
    };
  }

  throw new Error(`Unsupported file type for revised source export: ${mimetype} (${name})`);
}
