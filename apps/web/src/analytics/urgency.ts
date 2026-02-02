import type { Ticket } from './tickets';
import type { TranscriptMessage } from './store';

/**
 * Compute urgency score for a ticket
 * Higher score = more urgent
 */
export function computeUrgency(
  ticket: Ticket,
  transcriptUserText: string[]
): number {
  let score = 0;

  // Manual override: if urgent flag is set, add large boost
  if (ticket.urgent === true) {
    score += 100;
  }

  // Status-based urgency
  if (ticket.status === 'contact_requested') {
    score += 50;
  }

  // Needs human flag
  if (ticket.needsHuman === true) {
    score += 20;
  }

  // Check transcript for urgent keywords (Croatian)
  const urgentKeywords = ['hitno', 'urgentno', 'odmah'];
  const transcriptText = transcriptUserText.join(' ').toLowerCase();
  const hasUrgentKeyword = urgentKeywords.some(keyword => 
    transcriptText.includes(keyword)
  );
  if (hasUrgentKeyword) {
    score += 20;
  }

  // Category-based urgency
  if (ticket.category === 'issue_reporting') {
    score += 15;
  }

  // Fallback count indicates user frustration
  if (ticket.fallbackCount >= 2) {
    score += 10;
  }

  // Recent activity (within last 30 minutes)
  const now = Date.now();
  const thirtyMinutesAgo = now - (30 * 60 * 1000);
  if (ticket.updatedAt >= thirtyMinutesAgo) {
    score += 10;
  }

  return score;
}
