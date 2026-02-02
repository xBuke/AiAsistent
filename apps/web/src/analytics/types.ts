export type AnalyticsEventType = "question" | "fallback" | "conversation_start" | "message" | "conversation_end";

export type ConfidenceLevel = "low" | "med" | "high";

// Base event fields shared by all events
interface BaseAnalyticsEvent {
  id: string;
  cityId: string;
  timestamp: number;
  sessionId: string;
}

// Legacy question/fallback events
export interface BaseQuestionOrFallbackEvent extends BaseAnalyticsEvent {
  type: "question" | "fallback";
  question: string;
  answerChars?: number;
  latencyMs?: number;
  sourcesCount?: number;
  category?: string;
  confidence?: ConfidenceLevel;
}

// Conversation start event
export interface ConversationStartEvent extends BaseAnalyticsEvent {
  type: "conversation_start";
  conversationId: string;
}

// Message event (user or assistant)
export interface MessageEvent extends BaseAnalyticsEvent {
  type: "message";
  conversationId: string;
  messageId?: string;
  role?: "user" | "assistant";
  content?: string;
  turnIndex?: number;
  category?: string;
}

// Conversation end event
export interface ConversationEndEvent extends BaseAnalyticsEvent {
  type: "conversation_end";
  conversationId: string;
  reason?: "user_closed" | "timeout";
}

// Union type for all analytics events
export type AnalyticsEvent =
  | BaseQuestionOrFallbackEvent
  | ConversationStartEvent
  | MessageEvent
  | ConversationEndEvent;
