import type { AnalyticsEvent } from '../../analytics/types';

// Generate mock events for multiple days and at least 2 categories
const now = Date.now();
const oneDay = 24 * 60 * 60 * 1000;

// Helper to generate random events
function createMockEvent(
  cityId: string,
  timestamp: number,
  type: "question" | "fallback",
  category?: string,
  sessionId?: string
): AnalyticsEvent {
  const isQuestion = type === "question";
  const baseEvent: AnalyticsEvent = {
    id: `mock_${timestamp}_${Math.random().toString(36).substring(2, 9)}`,
    cityId,
    timestamp,
    sessionId: sessionId || `session_${Math.random().toString(36).substring(2, 11)}`,
    type,
    question: isQuestion
      ? category === "budget"
        ? "Koliki je proračun za 2024. godinu?"
        : category === "services"
        ? "Kako mogu prijaviti problem s komunalnim uslugama?"
        : "Gdje se nalazi gradska uprava?"
      : "I don't understand your question",
  };

  if (isQuestion) {
    baseEvent.answerChars = Math.floor(Math.random() * 500) + 100;
    baseEvent.latencyMs = Math.floor(Math.random() * 2000) + 300;
    baseEvent.sourcesCount = Math.floor(Math.random() * 5) + 1;
    baseEvent.category = category;
    const confidences: Array<"low" | "med" | "high"> = ["low", "med", "high"];
    baseEvent.confidence = confidences[Math.floor(Math.random() * confidences.length)];
  }

  return baseEvent;
}

// Generate mock events for the past 7 days
export function generateMockEvents(cityId: string): AnalyticsEvent[] {
  const mockEvents: AnalyticsEvent[] = [];
  const sessions = [
    `session_${Math.random().toString(36).substring(2, 11)}`,
    `session_${Math.random().toString(36).substring(2, 11)}`,
    `session_${Math.random().toString(36).substring(2, 11)}`,
  ];

  // Generate events for each day
  for (let day = 0; day < 7; day++) {
    const dayStart = now - (day * oneDay);
    const eventsPerDay = Math.floor(Math.random() * 15) + 5; // 5-20 events per day

    for (let i = 0; i < eventsPerDay; i++) {
      const hourOffset = Math.random() * 24;
      const minuteOffset = Math.random() * 60;
      const timestamp = dayStart - (hourOffset * 60 * 60 * 1000) - (minuteOffset * 60 * 1000);

      const sessionId = sessions[Math.floor(Math.random() * sessions.length)];
      const isQuestion = Math.random() > 0.2; // 80% questions, 20% fallbacks
      const category = isQuestion
        ? (Math.random() > 0.5 ? "budget" : "services")
        : undefined;

      mockEvents.push(
        createMockEvent(
          cityId,
          timestamp,
          isQuestion ? "question" : "fallback",
          category,
          sessionId
        )
      );
    }
  }

  // Sort by timestamp (newest first)
  return mockEvents.sort((a, b) => b.timestamp - a.timestamp);
}

// Export a pre-generated mock dataset for common city IDs
export const mockEvents: AnalyticsEvent[] = [
  ...generateMockEvents("ploca"),
  ...generateMockEvents("zagreb"),
];
