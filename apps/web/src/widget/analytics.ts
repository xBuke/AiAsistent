import { addEvent, getCurrentSessionId, createConversationId } from '../analytics/store';
import type { AnalyticsEvent } from '../analytics/types';
import { redactPII } from '../analytics/redact';
import { postBackendEvent, type BackendEvent } from './utils/eventsClient';

/**
 * Helper to emit analytics events from the widget
 * Legacy function for question/fallback events (kept for compatibility)
 */
export function emitEvent(
  type: 'question' | 'fallback',
  cityId: string,
  question: string,
  options?: {
    answerChars?: number;
    latencyMs?: number;
    conversationId?: string;
    apiBaseUrl?: string;
  }
): void {
  const event: AnalyticsEvent = {
    id: `event_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
    cityId,
    timestamp: Date.now(),
    sessionId: getCurrentSessionId(),
    type,
    question,
    answerChars: options?.answerChars,
    latencyMs: options?.latencyMs,
    // category and confidence left undefined as per requirements
  };

  // Add conversationId if provided (for fallback tracking)
  if (options?.conversationId) {
    (event as any).conversationId = options.conversationId;
  }

  addEvent(event);

  // Also send to backend if apiBaseUrl is provided
  if (options?.apiBaseUrl) {
    const backendEvent: BackendEvent = {
      type,
      conversationId: options.conversationId,
      question,
      meta: {
        latencyMs: options.latencyMs,
        sourcesCount: (event as any).sourcesCount,
        ...(type === 'fallback' && { fallback: true }),
      },
      timestamp: event.timestamp,
    };
    postBackendEvent({
      apiBaseUrl: options.apiBaseUrl,
      cityId,
      event: backendEvent,
    }).catch(() => {
      // Already handled in postBackendEvent, but catch to be safe
    });
  }
}

/**
 * Emit conversation_start event
 */
export function emitConversationStart(cityId: string, conversationId: string, apiBaseUrl?: string): void {
  const event: AnalyticsEvent = {
    id: `event_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
    cityId,
    timestamp: Date.now(),
    sessionId: getCurrentSessionId(),
    type: 'conversation_start',
    conversationId,
  };

  addEvent(event);

  // Also send to backend if apiBaseUrl is provided
  if (apiBaseUrl) {
    const backendEvent: BackendEvent = {
      type: 'conversation_start',
      conversationId,
      timestamp: event.timestamp,
    };
    postBackendEvent({
      apiBaseUrl,
      cityId,
      event: backendEvent,
    }).catch(() => {
      // Already handled in postBackendEvent, but catch to be safe
    });
  }
}

/**
 * Emit message event (user or assistant)
 */
export function emitMessage(
  cityId: string,
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
  messageId?: string,
  turnIndex?: number,
  apiBaseUrl?: string,
  latencyMs?: number,
  metadata?: Record<string, any>
): void {
  // TODO: category can be assigned/enriched server-side later
  const redactedContent = redactPII(content);
  const event: AnalyticsEvent = {
    id: `event_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
    cityId,
    timestamp: Date.now(),
    sessionId: getCurrentSessionId(),
    type: 'message',
    conversationId,
    messageId,
    role,
    content: redactedContent,
    turnIndex,
    category: undefined, // TODO: category can be assigned/enriched server-side later
  };

  addEvent(event);

  // Also send to backend if apiBaseUrl is provided
  if (apiBaseUrl) {
    const backendEvent: BackendEvent = {
      type: 'message',
      conversationId,
      messageId,
      role,
      content: redactedContent,
      meta: latencyMs ? { latencyMs } : undefined,
      metadata: metadata, // Debug trace metadata for assistant messages
      timestamp: event.timestamp,
    };
    postBackendEvent({
      apiBaseUrl,
      cityId,
      event: backendEvent,
    }).catch(() => {
      // Already handled in postBackendEvent, but catch to be safe
    });

    // For user messages, also send a "question" event
    if (role === 'user') {
      const questionEvent: BackendEvent = {
        type: 'question',
        conversationId,
        question: redactedContent,
        timestamp: event.timestamp,
      };
      postBackendEvent({
        apiBaseUrl,
        cityId,
        event: questionEvent,
      }).catch(() => {
        // Already handled in postBackendEvent, but catch to be safe
      });
    }
  }
}

/**
 * Emit conversation_end event
 */
export function emitConversationEnd(
  cityId: string,
  conversationId: string,
  reason?: 'user_closed' | 'timeout',
  apiBaseUrl?: string
): void {
  const event: AnalyticsEvent = {
    id: `event_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
    cityId,
    timestamp: Date.now(),
    sessionId: getCurrentSessionId(),
    type: 'conversation_end',
    conversationId,
    reason,
  };

  addEvent(event);

  // Also send to backend if apiBaseUrl is provided
  if (apiBaseUrl) {
    const backendEvent: BackendEvent = {
      type: 'conversation_end',
      conversationId,
      timestamp: event.timestamp,
    };
    postBackendEvent({
      apiBaseUrl,
      cityId,
      event: backendEvent,
    }).catch(() => {
      // Already handled in postBackendEvent, but catch to be safe
    });
  }
}

/**
 * Export createConversationId for use in WidgetApp
 */
export { createConversationId };
