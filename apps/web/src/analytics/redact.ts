/**
 * GDPR-friendly PII redaction helper
 * Masks sensitive information in text before storing in analytics
 */

/**
 * Redact PII from text content
 * - Emails: masked as "***@***"
 * - Phone numbers: sequences of 8+ digits masked as "***"
 * - OIB-like numbers: 11 digits masked as "***"
 */
export function redactPII(text: string): string {
  if (!text || typeof text !== 'string') {
    return text;
  }

  let redacted = text;

  // Mask emails (simple pattern: something@something)
  // Matches: word characters, dots, hyphens, plus signs before @, then domain
  redacted = redacted.replace(
    /[a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    '***@***'
  );

  // Mask phone numbers: sequences of 8 or more consecutive digits
  // This catches most phone number formats
  redacted = redacted.replace(/\d{8,}/g, '***');

  // Mask OIB-like numbers: exactly 11 digits (Croatian personal identification number)
  // This is more specific than the phone number pattern above
  redacted = redacted.replace(/\b\d{11}\b/g, '***');

  return redacted;
}
