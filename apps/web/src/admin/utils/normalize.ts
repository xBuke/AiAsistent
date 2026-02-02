/**
 * Normalize question text for grouping
 * - Trim whitespace
 * - Convert to lowercase
 */
export function normalizeQuestion(question: string): string {
  return question.trim().toLowerCase();
}
