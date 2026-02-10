/**
 * Generates a demo reference number for form submissions.
 * Format: {citySlug}-{YYYYMMDD}-{4-digit random}
 * e.g. pl-20260210-0421
 * Uniqueness is enforced by DB unique constraint on reference_number; callers should retry on conflict.
 */
export function generateReferenceNumber(citySlug: string, _type: string): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const datePart = `${y}${m}${d}`;
  const randomPart = String(Math.floor(1000 + Math.random() * 9000));
  return `${citySlug}-${datePart}-${randomPart}`;
}
