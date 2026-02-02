export type LinkifyToken =
  | { type: 'text'; value: string }
  | { type: 'link'; value: string; href: string; kind: 'phone' | 'email' | 'url' };

/**
 * Linkifies text by detecting phone numbers, emails, and URLs.
 * Returns an array of tokens in original order.
 */
export function linkifyText(text: string): LinkifyToken[] {
  if (!text) return [{ type: 'text', value: text }];

  const tokens: LinkifyToken[] = [];
  const matches: Array<{
    start: number;
    end: number;
    token: LinkifyToken;
  }> = [];

  // URL pattern: http://, https://, or www.
  const urlPattern = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
  let urlMatch;
  while ((urlMatch = urlPattern.exec(text)) !== null) {
    const value = urlMatch[0];
    let href = value;
    if (value.toLowerCase().startsWith('www.')) {
      href = `https://${value}`;
    }
    matches.push({
      start: urlMatch.index,
      end: urlMatch.index + value.length,
      token: { type: 'link', value, href, kind: 'url' },
    });
  }

  // Email pattern: basic email regex
  const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  let emailMatch;
  while ((emailMatch = emailPattern.exec(text)) !== null) {
    const value = emailMatch[0];
    // Skip if already matched as part of a URL
    const isInUrl = matches.some(
      (m) => m.start <= emailMatch.index && m.end >= emailMatch.index + value.length
    );
    if (!isInUrl) {
      matches.push({
        start: emailMatch.index,
        end: emailMatch.index + value.length,
        token: { type: 'link', value, href: `mailto:${value}`, kind: 'email' },
      });
    }
  }

  // Phone pattern: permissive regex (allows spaces, -, /, parentheses, starting +)
  // Pattern: optional +, then digits with separators
  const phonePattern = /\+?[\d\s\-/()]{7,}/g;
  let phoneMatch;
  while ((phoneMatch = phonePattern.exec(text)) !== null) {
    const value = phoneMatch[0];
    // Skip if already matched as part of a URL or email
    const isInUrlOrEmail = matches.some(
      (m) => m.start <= phoneMatch.index && m.end >= phoneMatch.index + value.length
    );
    if (!isInUrlOrEmail) {
      // Normalize phone: keep only digits and optional leading +
      const normalized = value.replace(/[^\d+]/g, '');
      // Only consider it a phone if it has at least 7 digits
      if (normalized.replace(/\+/g, '').length >= 7) {
        matches.push({
          start: phoneMatch.index,
          end: phoneMatch.index + value.length,
          token: { type: 'link', value, href: `tel:${normalized}`, kind: 'phone' },
        });
      }
    }
  }

  // Sort matches by start position
  matches.sort((a, b) => a.start - b.start);

  // Remove overlapping matches (keep the first one)
  const nonOverlapping: typeof matches = [];
  for (const match of matches) {
    const overlaps = nonOverlapping.some(
      (m) => !(match.end <= m.start || match.start >= m.end)
    );
    if (!overlaps) {
      nonOverlapping.push(match);
    }
  }

  // Build token array
  let lastIndex = 0;
  for (const match of nonOverlapping) {
    // Add text before match
    if (match.start > lastIndex) {
      tokens.push({ type: 'text', value: text.substring(lastIndex, match.start) });
    }
    // Add link token
    tokens.push(match.token);
    lastIndex = match.end;
  }
  // Add remaining text
  if (lastIndex < text.length) {
    tokens.push({ type: 'text', value: text.substring(lastIndex) });
  }

  return tokens.length > 0 ? tokens : [{ type: 'text', value: text }];
}
