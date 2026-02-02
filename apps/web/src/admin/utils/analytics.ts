import type { AnalyticsEvent } from '../../analytics/types';

export type DateRange = '24h' | '7d' | '30d';

export interface FilterState {
  dateRange: DateRange;
  category: string;
  searchQuery: string;
}

/**
 * Get timestamp for start of date range
 */
export function getDateRangeStart(range: DateRange): number {
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  
  switch (range) {
    case '24h':
      return now - oneDay;
    case '7d':
      return now - (7 * oneDay);
    case '30d':
      return now - (30 * oneDay);
    default:
      return now - (7 * oneDay);
  }
}

/**
 * Filter events by date range, category, and search query
 */
export function filterEvents(
  events: AnalyticsEvent[],
  filters: FilterState
): AnalyticsEvent[] {
  const startTime = getDateRangeStart(filters.dateRange);
  
  return events.filter(event => {
    // Date range filter
    if (event.timestamp < startTime) {
      return false;
    }
    
    // Category filter
    if (filters.category !== 'All') {
      // For legacy question/fallback events, check event.category
      // For message events, check event.category
      // For conversation_start/end, no category so they're excluded unless "All"
      if (event.type === 'question' || event.type === 'fallback') {
        if (event.category !== filters.category) {
          return false;
        }
      } else if (event.type === 'message' && 'category' in event) {
        if (event.category !== filters.category) {
          return false;
        }
      } else {
        // conversation_start/end don't have category, exclude them when filtering by category
        return false;
      }
    }
    
    // Search query filter (only for questions and messages with content)
    if (filters.searchQuery.trim()) {
      const query = filters.searchQuery.toLowerCase();
      let searchableText = '';
      
      if (event.type === 'question' || event.type === 'fallback') {
        searchableText = event.question.toLowerCase();
      } else if (event.type === 'message' && 'content' in event && event.content) {
        searchableText = event.content.toLowerCase();
      } else {
        // No searchable text for conversation_start/end
        return false;
      }
      
      if (!searchableText.includes(query)) {
        return false;
      }
    }
    
    return true;
  });
}

/**
 * Get questions count in last 24 hours
 */
export function getQuestionsLast24h(events: AnalyticsEvent[]): number {
  const startTime = getDateRangeStart('24h');
  return events.filter(
    e => e.type === 'question' && e.timestamp >= startTime
  ).length;
}

/**
 * Get questions count in last 7 days
 */
export function getQuestionsLast7d(events: AnalyticsEvent[]): number {
  const startTime = getDateRangeStart('7d');
  return events.filter(
    e => e.type === 'question' && e.timestamp >= startTime
  ).length;
}

/**
 * Get unique sessions count in last 7 days
 */
export function getUniqueSessionsLast7d(events: AnalyticsEvent[]): number {
  const startTime = getDateRangeStart('7d');
  const sessions = new Set<string>();
  
  events.forEach(event => {
    if (event.timestamp >= startTime) {
      sessions.add(event.sessionId);
    }
  });
  
  return sessions.size;
}

/**
 * Calculate fallback rate (fallbacks / questions) in last 7 days
 */
export function getFallbackRateLast7d(events: AnalyticsEvent[]): number {
  const startTime = getDateRangeStart('7d');
  const filtered = events.filter(e => e.timestamp >= startTime);
  
  const questions = filtered.filter(e => e.type === 'question').length;
  const fallbacks = filtered.filter(e => e.type === 'fallback').length;
  
  if (questions === 0) return 0;
  return fallbacks / questions;
}

/**
 * Calculate average latency in last 7 days
 */
export function getAvgLatencyLast7d(events: AnalyticsEvent[]): number | null {
  const startTime = getDateRangeStart('7d');
  const questions = events.filter(
    e => e.type === 'question' && e.timestamp >= startTime && e.latencyMs !== undefined
  );
  
  if (questions.length === 0) return null;
  
  const sum = questions.reduce((acc, e) => acc + (e.latencyMs || 0), 0);
  return Math.round(sum / questions.length);
}

/**
 * Group questions by day for the last 7 days
 */
export function groupQuestionsByDay(events: AnalyticsEvent[]): Array<{ date: string; count: number }> {
  const startTime = getDateRangeStart('7d');
  const questions = events.filter(
    e => e.type === 'question' && e.timestamp >= startTime
  );
  
  // Initialize all 7 days with 0
  const days: Array<{ date: string; count: number }> = [];
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  
  for (let i = 6; i >= 0; i--) {
    const dayStart = now - (i * oneDay);
    const dayEnd = dayStart + oneDay;
    const dateStr = new Date(dayStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    
    const count = questions.filter(
      e => e.timestamp >= dayStart && e.timestamp < dayEnd
    ).length;
    
    days.push({ date: dateStr, count });
  }
  
  return days;
}

/**
 * Get top categories by question count in last 7 days
 */
export function getTopCategories(events: AnalyticsEvent[], limit: number = 5): Array<{ category: string; count: number }> {
  const startTime = getDateRangeStart('7d');
  const questions = events.filter(
    e => e.type === 'question' && e.timestamp >= startTime && e.category
  );
  
  const categoryCounts = new Map<string, number>();
  
  questions.forEach(q => {
    if (q.category) {
      categoryCounts.set(q.category, (categoryCounts.get(q.category) || 0) + 1);
    }
  });
  
  return Array.from(categoryCounts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Get all unique categories from events
 */
export function getAllCategories(events: AnalyticsEvent[]): string[] {
  const categories = new Set<string>();
  
  events.forEach(event => {
    if (event.category) {
      categories.add(event.category);
    }
  });
  
  return Array.from(categories).sort();
}

/**
 * Get recent questions (latest 50)
 */
export function getRecentQuestions(events: AnalyticsEvent[], limit: number = 50): AnalyticsEvent[] {
  return events
    .filter(e => e.type === 'question')
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
}

/**
 * Get knowledge gaps (fallback events, latest 50)
 */
export function getKnowledgeGaps(events: AnalyticsEvent[], limit: number = 50): AnalyticsEvent[] {
  return events
    .filter(e => e.type === 'fallback')
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
}

/**
 * Shorten session ID for display
 */
export function shortenSessionId(sessionId: string): string {
  return sessionId.length > 12 ? `${sessionId.substring(0, 12)}...` : sessionId;
}
