/**
 * Utility functions to check if user messages contain contact information
 */

/**
 * Extract email from text using simple regex
 */
function extractEmail(text: string): string | null {
  if (!text) return null;
  // Simple email pattern: word chars, dots, hyphens, @, domain
  const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
  const match = text.match(emailPattern);
  return match ? match[0] : null;
}

/**
 * Extract Croatian phone number from text using simple regex
 */
function extractPhone(text: string): string | null {
  if (!text) return null;
  // Croatian phone patterns:
  // +385 XX XXX XXXX, +385XXXXXXXXX, 0XX XXX XXXX, 0XXXXXXXXX
  // Also matches variations with spaces/dashes
  const phonePatterns = [
    /\+385\s*\d{1,2}\s*\d{3}\s*\d{3,4}/,  // +385 XX XXX XXXX
    /\+385\d{8,9}/,                        // +385XXXXXXXXX
    /0\d{1,2}\s*\d{3}\s*\d{3,4}/,          // 0XX XXX XXXX
    /0\d{8,9}/,                            // 0XXXXXXXXX
  ];
  
  for (const pattern of phonePatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[0]; // Return as-is, normalization not needed for check
    }
  }
  return null;
}

/**
 * Check if any of the user messages contain email or phone number
 * @param userMessages Array of user message strings
 * @returns true if at least one email or phone is found
 */
export function hasContactInfo(userMessages: string[]): boolean {
  if (!userMessages || userMessages.length === 0) {
    return false;
  }
  
  for (const message of userMessages) {
    if (extractEmail(message) || extractPhone(message)) {
      return true;
    }
  }
  
  return false;
}
