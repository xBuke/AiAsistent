export function chunkText(text: string): string[] {
  const normalizedText = text.replace(/\r\n/g, "\n");

  const paragraphs = normalizedText
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length >= 20);

  const chunks: string[] = [];
  let currentChunkParagraphs: string[] = [];
  let currentChunkWordCount = 0;

  for (const paragraph of paragraphs) {
    const paragraphWordCount = paragraph.split(/\s+/).length;

    if (
      currentChunkParagraphs.length > 0 &&
      currentChunkWordCount + paragraphWordCount > 500
    ) {
      chunks.push(currentChunkParagraphs.join("\n\n"));
      currentChunkParagraphs = [];
      currentChunkWordCount = 0;
    }

    currentChunkParagraphs.push(paragraph);
    currentChunkWordCount += paragraphWordCount;
  }

  if (currentChunkParagraphs.length > 0) {
    chunks.push(currentChunkParagraphs.join("\n\n"));
  }

  if (chunks.length === 0) {
    throw new Error("Document has no usable content after chunking");
  }

  return chunks;
}
