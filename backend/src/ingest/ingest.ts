import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import * as XLSX from "xlsx";

const TEXT_MIMES = new Set(["text/plain", "text/csv", "application/csv"]);

function isSpreadsheetName(name: string): boolean {
  return /\.xlsx$/i.test(name) || /\.xls$/i.test(name);
}

export async function extractTextForLayered(input: {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}): Promise<{ text: string; source_document: string }> {
  const source_document = input.originalname || "upload";
  const mime = input.mimetype;

  if (TEXT_MIMES.has(mime)) {
    return { text: input.buffer.toString("utf-8"), source_document };
  }

  if (
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime === "application/vnd.ms-excel" ||
    isSpreadsheetName(source_document)
  ) {
    const wb = XLSX.read(input.buffer, { type: "buffer" });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) {
      return { text: "", source_document };
    }
    const sheet = wb.Sheets[sheetName];
    if (!sheet) {
      return { text: "", source_document };
    }
    const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
      header: 1,
      defval: "",
      raw: false,
    });
    const lines = rows
      .map((row) =>
        Array.isArray(row)
          ? row.map((c) => (c === null || c === undefined ? "" : String(c))).join("\t")
          : String(row)
      )
      .join("\n");
    return { text: lines, source_document };
  }

  if (mime === "application/pdf") {
    const parser = new PDFParse({ data: input.buffer });
    const textResult = await parser.getText();
    const text = textResult?.text ?? "";
    await parser.destroy();
    return { text, source_document };
  }

  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    /\.docx$/i.test(source_document)
  ) {
    const result = await mammoth.extractRawText({ buffer: input.buffer });
    return { text: result.value ?? "", source_document };
  }

  throw new Error(
    `Unsupported file type for layered ingest: ${mime}. Use text, CSV, .xlsx, .docx, or PDF.`
  );
}
