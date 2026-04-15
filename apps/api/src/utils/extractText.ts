import * as pdfParseModule from "pdf-parse";
import mammoth from "mammoth";

const pdfParse = (pdfParseModule as any).default ?? pdfParseModule;

export async function extractText(
  buffer: Buffer,
  fileType: "pdf" | "docx" | "txt" | "md",
): Promise<string> {
  let text: string;

  if (fileType === "pdf") {
    const result = await pdfParse(buffer);
    text = result.text;
  } else if (fileType === "docx") {
    const result = await mammoth.extractRawText({ buffer });
    text = result.value;
  } else {
    text = buffer.toString("utf-8");
  }

  if (!text.trim()) {
    throw new Error("Document appears to be empty or unreadable");
  }

  return text;
}
