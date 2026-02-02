import type { AnalyticsEvent } from './types';
import { categorizeConversation, type Category } from './categorize';
import type { Ticket, TicketStatus, ContactRequest } from './tickets';
import { suggestDepartment } from './route';

// Import mock conversations converter
// No circular dependency: conversations.ts doesn't import from store.ts
import { convertMockConversationsToEvents } from '../admin/mock/conversations';

function getMockConversationEvents(cityId: string): AnalyticsEvent[] {
  try {
    return convertMockConversationsToEvents(cityId);
  } catch (e) {
    // If mock conversations not available, return empty array
    return [];
  }
}

type Listener = () => void;

// In-memory store
const events: AnalyticsEvent[] = [];
const listeners: Set<Listener> = new Set();

// Ticket store: keyed by `${cityId}:${conversationId}`
const tickets: Map<string, Ticket> = new Map();

// Ticket reference number counters per city (in-memory)
const ticketCounters: Map<string, number> = new Map();

// Session ID generator (random, in-memory)
let currentSessionId: string | null = null;

function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

function getSessionId(): string {
  if (!currentSessionId) {
    currentSessionId = generateSessionId();
  }
  return currentSessionId;
}

/**
 * Generate a unique conversation ID
 */
export function createConversationId(): string {
  return `conv_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Add an event to the store
 */
export function addEvent(event: AnalyticsEvent): void {
  events.push(event);
  // Notify all listeners
  listeners.forEach(listener => listener());
}

/**
 * Get events, optionally filtered by cityId
 */
export function getEvents(cityId?: string): AnalyticsEvent[] {
  if (cityId) {
    return events.filter(event => event.cityId === cityId);
  }
  return [...events];
}

/**
 * Get events filtered by cityId (alias for getEvents with cityId)
 * Also includes mock conversation events for admin view
 */
export function getEventsByCity(cityId: string): AnalyticsEvent[] {
  const realEvents = getEvents(cityId);
  const mockEvents = getMockConversationEvents(cityId);
  // Merge and deduplicate by id
  const allEvents = [...realEvents, ...mockEvents];
  const unique = new Map<string, AnalyticsEvent>();
  allEvents.forEach(event => {
    const existing = unique.get(event.id);
    if (!existing || event.timestamp > existing.timestamp) {
      unique.set(event.id, event);
    }
  });
  return Array.from(unique.values());
}

/**
 * Subscribe to store updates
 * Returns unsubscribe function
 */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Get current session ID
 */
export function getCurrentSessionId(): string {
  return getSessionId();
}

/**
 * Reset session ID (useful for testing or new sessions)
 */
export function resetSessionId(): void {
  currentSessionId = null;
}

/**
 * Clear all events (useful for testing)
 */
export function clearEvents(): void {
  events.length = 0;
  listeners.forEach(listener => listener());
}

/**
 * Get count of fallback events for a conversation within a time window
 * @param cityId - City ID to filter events
 * @param conversationId - Conversation ID to filter events
 * @param windowMs - Time window in milliseconds (from now going backwards)
 * @returns Number of fallback events within the window
 */
export function getRecentFallbackCount(
  cityId: string,
  conversationId: string,
  windowMs: number
): number {
  const now = Date.now();
  const windowStart = now - windowMs;
  
  return events.filter(event => {
    // Must be a fallback event
    if (event.type !== 'fallback') {
      return false;
    }
    
    // Must match cityId
    if (event.cityId !== cityId) {
      return false;
    }
    
    // Must match conversationId (check if property exists, as legacy events may not have it)
    const eventConvId = (event as any).conversationId;
    if (eventConvId !== conversationId) {
      return false;
    }
    
    // Must be within time window
    if (event.timestamp < windowStart) {
      return false;
    }
    
    return true;
  }).length;
}

/**
 * Conversation summary interface
 */
export interface ConversationSummary {
  conversationId: string;
  cityId: string;
  sessionId: string;
  startTime: number;
  endTime?: number;
  messageCount: number;
  userMessageCount: number;
  assistantMessageCount: number;
  reason?: "user_closed" | "timeout";
  category: Category;
  isSpam: boolean;
  needsHuman: boolean;
}

/**
 * Get all conversations for a city, with summaries
 */
export function getConversations(cityId: string): ConversationSummary[] {
  const cityEvents = getEventsByCity(cityId);
  const conversations = new Map<string, ConversationSummary>();
  const userMessagesByConversation = new Map<string, string[]>();

  // First pass: collect user messages for categorization
  cityEvents.forEach(event => {
    if (event.type === 'message' && event.role === 'user' && event.content) {
      const convId = event.conversationId;
      if (!userMessagesByConversation.has(convId)) {
        userMessagesByConversation.set(convId, []);
      }
      userMessagesByConversation.get(convId)!.push(event.content);
    }
  });

  // Process events to build conversation summaries
  cityEvents.forEach(event => {
    if (event.type === 'conversation_start') {
      const convId = event.conversationId;
      if (!conversations.has(convId)) {
        conversations.set(convId, {
          conversationId: convId,
          cityId: event.cityId,
          sessionId: event.sessionId,
          startTime: event.timestamp,
          messageCount: 0,
          userMessageCount: 0,
          assistantMessageCount: 0,
          category: "general",
          isSpam: false,
          needsHuman: false,
        });
      }
    } else if (event.type === 'message') {
      const convId = event.conversationId;
      let summary = conversations.get(convId);
      if (!summary) {
        // Create summary if message appears before conversation_start
        summary = {
          conversationId: convId,
          cityId: event.cityId,
          sessionId: event.sessionId,
          startTime: event.timestamp,
          messageCount: 0,
          userMessageCount: 0,
          assistantMessageCount: 0,
          category: "general",
          isSpam: false,
          needsHuman: false,
        };
        conversations.set(convId, summary);
      }
      summary.messageCount++;
      if (event.role === 'user') {
        summary.userMessageCount++;
      } else if (event.role === 'assistant') {
        summary.assistantMessageCount++;
      }
    } else if (event.type === 'conversation_end') {
      const convId = event.conversationId;
      let summary = conversations.get(convId);
      if (!summary) {
        summary = {
          conversationId: convId,
          cityId: event.cityId,
          sessionId: event.sessionId,
          startTime: event.timestamp,
          messageCount: 0,
          userMessageCount: 0,
          assistantMessageCount: 0,
          category: "general",
          isSpam: false,
          needsHuman: false,
        };
        conversations.set(convId, summary);
      }
      summary.endTime = event.timestamp;
      if (event.reason) {
        summary.reason = event.reason;
      }
    }
  });

  // Compute categorization from user messages
  const result = Array.from(conversations.values());
  
  // Check for explicit categories from mock conversations (stored in message events)
  const explicitCategories = new Map<string, { category?: string; isSpam?: boolean; needsHuman?: boolean }>();
  cityEvents.forEach(event => {
    if (event.type === 'message' && event.conversationId) {
      const convId = event.conversationId;
      if (!explicitCategories.has(convId)) {
        explicitCategories.set(convId, {});
      }
      const info = explicitCategories.get(convId)!;
      // Check if this is from a mock conversation (message events from mocks have category set)
      if (event.category && event.id?.startsWith('mock_')) {
        // Determine spam and needsHuman from category
        info.category = event.category as Category;
        info.isSpam = event.category === 'spam';
        info.needsHuman = event.category === 'issue_reporting';
      }
    }
  });
  
  for (const summary of result) {
    // Use explicit category from mock if available
    const explicit = explicitCategories.get(summary.conversationId);
    if (explicit?.category) {
      summary.category = explicit.category as Category;
      if (explicit.isSpam !== undefined) summary.isSpam = explicit.isSpam;
      if (explicit.needsHuman !== undefined) summary.needsHuman = explicit.needsHuman;
    } else {
      // Otherwise categorize from user messages
      const userTexts = userMessagesByConversation.get(summary.conversationId) || [];
      if (userTexts.length > 0) {
        const categorization = categorizeConversation(userTexts);
        summary.category = categorization.category;
        summary.isSpam = categorization.isSpam;
        summary.needsHuman = categorization.needsHuman;
      }
    }
  }

  return result.sort((a, b) => b.startTime - a.startTime);
}

/**
 * Message interface for transcript
 */
export interface TranscriptMessage {
  messageId?: string;
  role: "user" | "assistant";
  content?: string;
  timestamp: number;
  turnIndex?: number;
  category?: string;
}

/**
 * Get full conversation transcript (ordered messages)
 */
export function getConversationTranscript(
  cityId: string,
  conversationId: string
): TranscriptMessage[] {
  const cityEvents = getEventsByCity(cityId);
  
  // Filter for messages in this conversation
  const messages: TranscriptMessage[] = [];
  
  cityEvents.forEach(event => {
    if (event.type === 'message' && event.conversationId === conversationId) {
      if (event.role && event.content !== undefined) {
        messages.push({
          messageId: event.messageId,
          role: event.role,
          content: event.content,
          timestamp: event.timestamp,
          turnIndex: event.turnIndex,
          category: event.category,
        });
      }
    }
  });

  // Sort by turnIndex if available, otherwise by timestamp
  messages.sort((a, b) => {
    if (a.turnIndex !== undefined && b.turnIndex !== undefined) {
      return a.turnIndex - b.turnIndex;
    }
    return a.timestamp - b.timestamp;
  });

  return messages;
}

/**
 * Generate ticket reference number
 * Format: "PL-2026-000123" where prefix is derived from cityId
 */
export function generateTicketRef(cityId: string): string {
  // Derive prefix from cityId (ploce -> PL, split -> ST, fallback to first 2 letters uppercased)
  const cityLower = cityId.toLowerCase();
  let prefix: string;
  
  if (cityLower === 'ploce' || cityLower.startsWith('ploce')) {
    prefix = 'PL';
  } else if (cityLower === 'split' || cityLower.startsWith('split')) {
    prefix = 'ST';
  } else {
    // Fallback: use first 2 letters uppercased
    prefix = cityId.substring(0, 2).toUpperCase();
  }
  
  const year = new Date().getFullYear();
  
  // Get or initialize counter for this city
  const currentCount = ticketCounters.get(cityId) || 0;
  const nextCount = currentCount + 1;
  ticketCounters.set(cityId, nextCount);
  
  // Format: prefix-year-000123 (6 digits, zero-padded)
  const paddedCount = nextCount.toString().padStart(6, '0');
  
  return `${prefix}-${year}-${paddedCount}`;
}

/**
 * Upsert a ticket (create or update)
 * Implements ticket lifecycle rules:
 * - When status is "needs_human", ticket exists even without contact
 * - When contact is added, status becomes "contact_requested"
 * - When closeTicket called, status becomes "closed"
 */
export function upsertTicket(
  partialTicket: Partial<Ticket> & { cityId: string; conversationId: string }
): Ticket {
  const key = `${partialTicket.cityId}:${partialTicket.conversationId}`;
  const now = Date.now();
  
  const existing = tickets.get(key);
  
  let ticket: Ticket;
  
  if (existing) {
    // Update existing ticket
    ticket = {
      ...existing,
      ...partialTicket,
      updatedAt: now,
    };
    
    // Lifecycle rule: if contact is being added and status is not explicitly set to "closed"
    if (partialTicket.contact && ticket.status !== 'closed') {
      ticket.status = 'contact_requested';
      ticket.contact = partialTicket.contact;
    }
    
    // If status is explicitly provided, use it (unless contact rule applies)
    if (partialTicket.status && !partialTicket.contact) {
      ticket.status = partialTicket.status;
    }
    
    // Auto-suggest department if not set and category is available
    if (!ticket.department && ticket.category) {
      const suggested = suggestDepartment(ticket.category);
      if (suggested) {
        ticket.department = suggested;
      }
    }
  } else {
    // Create new ticket
    // Default needsHuman to true if not provided (tickets are for human attention)
    const needsHuman = partialTicket.needsHuman ?? true;
    
    // Determine status: if contact provided, use 'contact_requested', otherwise use provided status or default to 'needs_human'
    const status: TicketStatus = partialTicket.contact 
      ? 'contact_requested' 
      : (partialTicket.status || 'needs_human');
    
    // Auto-suggest department if not provided and category is available
    const category = partialTicket.category;
    let department = partialTicket.department;
    if (!department && category) {
      const suggested = suggestDepartment(category);
      if (suggested) {
        department = suggested;
      }
    }
    
    ticket = {
      cityId: partialTicket.cityId,
      conversationId: partialTicket.conversationId,
      createdAt: now,
      updatedAt: now,
      status,
      category,
      department,
      needsHuman,
      fallbackCount: partialTicket.fallbackCount ?? 0,
      contact: partialTicket.contact,
      internalNotes: partialTicket.internalNotes,
    };
  }
  
  tickets.set(key, ticket);
  // Notify listeners
  listeners.forEach(listener => listener());
  
  return ticket;
}

/**
 * Get all tickets for a city
 */
export function getTickets(cityId: string): Ticket[] {
  const result: Ticket[] = [];
  tickets.forEach(ticket => {
    if (ticket.cityId === cityId) {
      result.push(ticket);
    }
  });
  return result.sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Get a specific ticket by cityId and conversationId
 */
export function getTicket(cityId: string, conversationId: string): Ticket | undefined {
  const key = `${cityId}:${conversationId}`;
  return tickets.get(key);
}

/**
 * Close a ticket (sets status to "closed")
 */
export function closeTicket(cityId: string, conversationId: string): void {
  const key = `${cityId}:${conversationId}`;
  const existing = tickets.get(key);
  
  if (existing) {
    const updated: Ticket = {
      ...existing,
      status: 'closed',
      updatedAt: Date.now(),
    };
    tickets.set(key, updated);
    // Notify listeners
    listeners.forEach(listener => listener());
  }
}

/**
 * Add an internal note to a ticket
 */
export function addTicketNote(cityId: string, conversationId: string, note: string): void {
  const key = `${cityId}:${conversationId}`;
  const existing = tickets.get(key);
  
  if (existing) {
    const notes = existing.internalNotes || [];
    const updated: Ticket = {
      ...existing,
      internalNotes: [...notes, note],
      updatedAt: Date.now(),
    };
    tickets.set(key, updated);
    // Notify listeners
    listeners.forEach(listener => listener());
  }
}

/**
 * Reopen a ticket (sets status to "needs_human")
 */
export function reopenTicket(cityId: string, conversationId: string): void {
  const key = `${cityId}:${conversationId}`;
  const existing = tickets.get(key);
  
  if (existing) {
    const updated: Ticket = {
      ...existing,
      status: 'needs_human',
      updatedAt: Date.now(),
    };
    tickets.set(key, updated);
    // Notify listeners
    listeners.forEach(listener => listener());
  }
}
