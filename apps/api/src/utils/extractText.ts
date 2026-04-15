import PDFParser from "pdf2json";
import mammoth from "mammoth";

function parsePdf(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const parser = new PDFParser();
    parser.on("pdfParser_dataReady", (data: any) => {
      const text = data.Pages
        .flatMap((page: any) => page.Texts)
        .map((t: any) => decodeURIComponent(t.R.map((r: any) => r.T).join("")))
        .join(" ");
      resolve(text);
    });
    parser.on("pdfParser_dataError", (err: any) => reject(err));
    parser.parseBuffer(buffer);
  });
}

export async function extractText(
  buffer: Buffer,
  fileType: "pdf" | "docx" | "txt" | "md",
): Promise<string> {
  let text: string;

  if (fileType === "pdf") {
    text = await parsePdf(buffer);
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
