import { useState, useMemo, useEffect, useCallback } from 'react';
import { getConversations, getConversationTranscript, type ConversationSummary, type TranscriptMessage } from '../analytics/store';
import type { Category } from '../analytics/categorize';
import { getEventsByCity } from '../analytics/store';
import { categoryLabel, categoryOrder } from './utils/categories';
import { formatDateTime, formatMessageTime, formatRelativeTime } from './utils/dateFormat';
import {
  fetchConversations as fetchConversationsApi,
  fetchMessages as fetchMessagesApi,
  type ApiConversation,
  type ApiMessage,
} from './api/adminClient';
import { usePolling } from './hooks/usePolling';

/** Unified conversation item (API or mock). */
type ConversationItem = ConversationSummary & {
  fallbackCount?: number;
  firstUserMessage?: string | null;
  submittedAt?: string | null;
  lastActivityAt?: string | null;
  title?: string | null;
  summary?: string | null;
};

interface ConversationsProps {
  cityId: string;
  liveEnabled: boolean;
  reloadTrigger?: number; // When this changes, reload conversations
}

type DateRangePreset = 'today' | '7d' | '30d' | 'custom';

// Helper function to get date range from preset
function getDateRangeFromPreset(preset: DateRangePreset): { from: number; to: number } {
  const now = Date.now();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = today.getTime();

  switch (preset) {
    case 'today':
      return { from: todayStart, to: now };
    case '7d':
      return { from: now - 7 * 24 * 60 * 60 * 1000, to: now };
    case '30d':
      return { from: now - 30 * 24 * 60 * 60 * 1000, to: now };
    case 'custom':
      return { from: 0, to: now };
    default:
      return { from: 0, to: now };
  }
}

/** Parse timestamp string to epoch ms. Use for stable sorting; avoids fragile Date parsing. */
function parseTimestamp(s: string): number {
  if (!s || typeof s !== 'string') return 0;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : 0;
}

// Helper function to get date section for grouping
function getDateSection(timestamp: number): 'today' | 'yesterday' | 'thisWeek' | 'older' {
  const date = new Date(timestamp);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (dateOnly.getTime() === today.getTime()) {
    return 'today';
  } else if (dateOnly.getTime() === yesterday.getTime()) {
    return 'yesterday';
  } else if (date.getTime() >= weekAgo.getTime()) {
    return 'thisWeek';
  } else {
    return 'older';
  }
}


// Helper function to calculate fallback count (mock only)
function getFallbackCountMock(cityId: string, _conversationId: string, sessionId: string, startTime: number, endTime?: number): number {
  const events = getEventsByCity(cityId);
  const conversationEnd = endTime || Date.now();
  return events.filter(event => {
    if (event.type === 'fallback') {
      return event.sessionId === sessionId && event.timestamp >= startTime && event.timestamp <= conversationEnd;
    }
    return false;
  }).length;
}

function mapApiConversation(c: ApiConversation, cityId: string): ConversationItem {
  const startTime = parseTimestamp(c.createdAt);
  const endTime = parseTimestamp(c.updatedAt) || startTime;
  const sessionId = c.externalConversationId ?? c.conversationUuid;
  const category = (c.category ?? 'general') as Category;
  const isSpam = category === 'spam';
  return {
    conversationId: c.conversationUuid,
    cityId,
    sessionId,
    startTime,
    endTime,
    messageCount: c.messageCount,
    userMessageCount: 0,
    assistantMessageCount: 0,
    category,
    isSpam,
    needsHuman: c.needsHuman,
    fallbackCount: c.fallbackCount,
    firstUserMessage: c.firstUserMessage,
    submittedAt: c.submittedAt,
    lastActivityAt: c.lastActivityAt,
    title: c.title,
    summary: c.summary,
  };
}

function mapApiMessage(m: ApiMessage): TranscriptMessage {
  return {
    messageId: m.id,
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.content_redacted ?? undefined,
    timestamp: new Date(m.created_at).getTime(),
  };
}

type SortOption = 'newest' | 'oldest' | 'category';

export function Conversations({ cityId, liveEnabled, reloadTrigger }: ConversationsProps) {
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [sortOption, setSortOption] = useState<SortOption>('newest');
  const [rangePreset, setRangePreset] = useState<DateRangePreset>('30d');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [hideSpam, setHideSpam] = useState<boolean>(true);
  
  // Collapsible filters state
  const [filtersCollapsed, setFiltersCollapsed] = useState<boolean>(() => {
    const stored = localStorage.getItem('admin.conversations.filtersCollapsed');
    return stored !== null ? stored === 'true' : true; // Default to collapsed
  });

  const [apiConversations, setApiConversations] = useState<ApiConversation[] | null>(null);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [conversationsError, setConversationsError] = useState<string | null>(null);
  const [selectedMessages, setSelectedMessages] = useState<TranscriptMessage[] | null>(null);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);

  const cityCode = cityId;
  const useMock = (import.meta as { env?: { VITE_ADMIN_USE_MOCK?: string } }).env?.VITE_ADMIN_USE_MOCK === 'true';

  // Fetch conversations function (reusable for polling)
  const fetchConversations = useCallback(async () => {
    if (useMock) {
      setConversationsLoading(false);
      setConversationsError(null);
      return;
    }
    try {
      const list = await fetchConversationsApi(cityCode);
      setApiConversations(list);
      setConversationsLoading(false);
      setConversationsError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load conversations';
      setApiConversations(null);
      setConversationsLoading(false);
      setConversationsError(errorMessage);
    }
  }, [cityCode, useMock]);

  // Initial fetch
  useEffect(() => {
    if (useMock) {
      setConversationsLoading(false);
      setConversationsError(null);
      return;
    }
    setConversationsLoading(true);
    setConversationsError(null);
    setApiConversations(null);
    fetchConversations();
  }, [cityCode, fetchConversations, useMock]);

  // Poll conversations every 10s when Live is enabled
  usePolling({
    callback: fetchConversations,
    intervalMs: 10000,
    enabled: liveEnabled,
  });

  // Reload when reloadTrigger changes (e.g., when needs_human is toggled off in Inbox)
  useEffect(() => {
    if (reloadTrigger !== undefined && reloadTrigger > 0) {
      fetchConversations();
    }
  }, [reloadTrigger, fetchConversations]);

  // Persist filters collapsed state
  useEffect(() => {
    localStorage.setItem('admin.conversations.filtersCollapsed', String(filtersCollapsed));
  }, [filtersCollapsed]);

  // Calculate active filters count (filters that differ from defaults)
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (rangePreset !== '30d') count++;
    if (hideSpam !== true) count++; // Default is true
    if (categoryFilter !== 'All') count++;
    if (sortOption !== 'newest') count++;
    if (searchQuery.trim() !== '') count++;
    return count;
  }, [rangePreset, hideSpam, categoryFilter, sortOption, searchQuery]);

  const useBackend = !useMock && apiConversations !== null && conversationsError === null;

  // Fetch messages function (reusable for polling)
  const fetchMessages = useCallback(async () => {
    if (!selectedConversationId || !useBackend) {
      return;
    }
    try {
      const list = await fetchMessagesApi(cityCode, selectedConversationId);
      setSelectedMessages(list.map(mapApiMessage));
      setMessagesLoading(false);
      setMessagesError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load messages';
      setSelectedMessages(null);
      setMessagesLoading(false);
      setMessagesError(errorMessage);
    }
  }, [cityCode, selectedConversationId, useBackend]);

  // Initial fetch when selecting a conversation
  useEffect(() => {
    if (!selectedConversationId || !useBackend) {
      setSelectedMessages(null);
      setMessagesLoading(false);
      return;
    }
    setMessagesLoading(true);
    setSelectedMessages(null);
    fetchMessages();
  }, [cityCode, selectedConversationId, useBackend, fetchMessages]);

  // Poll messages every 5s when Live is enabled and conversation is selected
  usePolling({
    callback: fetchMessages,
    intervalMs: 5000,
    enabled: liveEnabled && !!selectedConversationId && useBackend,
  });

  const cityConversations: ConversationItem[] = useMemo(() => {
    if (useMock) {
      return getConversations(cityId) as ConversationItem[];
    }
    if (useBackend && apiConversations) {
      return apiConversations.map((c) => mapApiConversation(c, cityId));
    }
    return [];
  }, [useMock, useBackend, apiConversations, cityId]);


  // Calculate date range
  const dateRange = useMemo(() => {
    if (rangePreset === 'custom') {
      const from = fromDate ? new Date(fromDate).getTime() : 0;
      const to = toDate ? new Date(toDate).getTime() + 24 * 60 * 60 * 1000 - 1 : Date.now();
      return { from, to };
    }
    return getDateRangeFromPreset(rangePreset);
  }, [rangePreset, fromDate, toDate]);

  // Filter conversations by date range, spam, and search (before category filter)
  const preFilteredConversations = useMemo(() => {
    let filtered = cityConversations;

    // Filter out conversations without user messages (only show conversations with at least one user message)
    filtered = filtered.filter(conv => (conv.firstUserMessage ?? '').trim().length > 0);

    // Apply date range filter
    filtered = filtered.filter(conv => {
      return conv.startTime >= dateRange.from && conv.startTime <= dateRange.to;
    });

    // Apply spam filter
    if (hideSpam) {
      filtered = filtered.filter(conv => !conv.isSpam);
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      if (useBackend) {
        filtered = filtered.filter(conv => {
          const id = conv.conversationId?.toLowerCase() ?? '';
          const sid = conv.sessionId?.toLowerCase() ?? '';
          return id.includes(query) || sid.includes(query);
        });
      } else {
        filtered = filtered.filter(conv => {
          const transcript = getConversationTranscript(cityId, conv.conversationId);
          return transcript.some(
            msg => msg.role === 'user' && msg.content && msg.content.toLowerCase().includes(query)
          );
        });
      }
    }

    return filtered;
  }, [cityConversations, dateRange, hideSpam, searchQuery, cityId, useBackend]);

  // Get unique categories from pre-filtered conversations (for dropdown)
  const availableCategories = useMemo(() => {
    const cats = new Set<Category>();
    preFilteredConversations.forEach(conv => {
      cats.add(conv.category);
    });
    return Array.from(cats).sort((a, b) => {
      const orderA = categoryOrder(a);
      const orderB = categoryOrder(b);
      if (orderA !== orderB) return orderA - orderB;
      return categoryLabel(a).localeCompare(categoryLabel(b), 'hr');
    });
  }, [preFilteredConversations]);

  // Apply category filter and sorting
  const filteredConversations = useMemo(() => {
    let filtered = preFilteredConversations;

    // Apply category filter
    if (categoryFilter !== 'All') {
      filtered = filtered.filter(conv => conv.category === categoryFilter);
    }

    // Apply sorting. "Newest" = by last activity (lastActivityAt / updated_at / endTime) DESC.
    const byUpdated = (a: ConversationItem, b: ConversationItem) => {
      const aTime = a.lastActivityAt ? parseTimestamp(a.lastActivityAt) : (a.endTime ?? a.startTime);
      const bTime = b.lastActivityAt ? parseTimestamp(b.lastActivityAt) : (b.endTime ?? b.startTime);
      return bTime - aTime;
    };
    const byCreatedAsc = (a: ConversationItem, b: ConversationItem) =>
      a.startTime - b.startTime;
    const sorted = [...filtered];
    switch (sortOption) {
      case 'newest':
        return sorted.sort(byUpdated);
      case 'oldest':
        return sorted.sort(byCreatedAsc);
      case 'category':
        return sorted.sort((a, b) => {
          const orderA = categoryOrder(a.category);
          const orderB = categoryOrder(b.category);
          if (orderA !== orderB) return orderA - orderB;
          const labelA = categoryLabel(a.category);
          const labelB = categoryLabel(b.category);
          if (labelA !== labelB) return labelA.localeCompare(labelB, 'hr');
          return byUpdated(a, b);
        });
      default:
        return sorted.sort(byUpdated);
    }
  }, [preFilteredConversations, categoryFilter, sortOption]);

  // Group conversations by date sections
  const groupedConversations = useMemo(() => {
    const groups: Record<string, ConversationSummary[]> = {
      today: [],
      yesterday: [],
      thisWeek: [],
      older: [],
    };

    filteredConversations.forEach(conv => {
      const section = getDateSection(conv.endTime ?? conv.startTime);
      groups[section].push(conv);
    });

    return groups;
  }, [filteredConversations]);

  // Selected conversation with transcript
  const selectedConversation = useMemo(() => {
    if (!selectedConversationId) return null;
    return cityConversations.find(c => c.conversationId === selectedConversationId) || null;
  }, [selectedConversationId, cityConversations]);

  const selectedConversationTranscript = useMemo((): TranscriptMessage[] => {
    if (!selectedConversationId) return [];
    if (useBackend) {
      if (messagesLoading) return [];
      return selectedMessages ?? [];
    }
    return getConversationTranscript(cityId, selectedConversationId);
  }, [selectedConversationId, cityId, useBackend, messagesLoading, selectedMessages]);

  const selectedConversationFallbackCount = useMemo(() => {
    if (!selectedConversation) return 0;
    const item = selectedConversation as ConversationItem;
    if (typeof item.fallbackCount === 'number') return item.fallbackCount;
    return getFallbackCountMock(cityId, selectedConversation.conversationId, selectedConversation.sessionId, selectedConversation.startTime, selectedConversation.endTime);
  }, [selectedConversation, cityId]);

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) {
      return 'Prije manje od sat vremena';
    } else if (diffHours < 24) {
      return `Prije ${diffHours} ${diffHours === 1 ? 'sata' : 'sati'}`;
    } else if (diffDays === 1) {
      return 'Jučer';
    } else if (diffDays < 7) {
      return `Prije ${diffDays} ${diffDays === 1 ? 'dana' : 'dana'}`;
    } else {
      return date.toLocaleDateString('hr-HR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
  };

  const formatMessageTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('hr-HR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const shortSessionId = (sessionId: string) => {
    return sessionId.substring(0, 12) + '...';
  };

  // Get conversation title (from API title, or fallback to first user message, or "Razgovor" + short id)
  const getConversationTitle = useCallback((conv: ConversationItem): string => {
    // Prefer API title if available
    if ((conv as any).title) {
      return (conv as any).title;
    }
    // Fallback to first user message
    if (conv.firstUserMessage) {
      const text = conv.firstUserMessage.trim();
      if (text.length <= 100) return text;
      return text.substring(0, 97) + '...';
    }
    // Final fallback: "Razgovor" + short id
    const shortId = conv.conversationId.substring(0, 8);
    return `Razgovor ${shortId}`;
  }, []);

  // Get conversation subtitle (category OR first user question snippet OR last_message_at)
  const getConversationSubtitle = useCallback((conv: ConversationItem): string | null => {
    // Prefer category if available
    if (conv.category) {
      return categoryLabel(conv.category);
    }
    // Fallback to first user message snippet (if not already used as title)
    if (conv.firstUserMessage && !(conv as any).title) {
      const text = conv.firstUserMessage.trim();
      if (text.length > 100) {
        return text.substring(0, 97) + '...';
      }
      return text;
    }
    // Fallback to last activity time
    if (conv.lastActivityAt) {
      const date = new Date(conv.lastActivityAt);
      return formatDate(date.getTime());
    }
    return null;
  }, []);

  // Conversation list item component
  function ConversationListItem({
    conv,
    isSelected,
    onClick,
    hideSpam,
    formatCategoryLabel,
    getFallbackCount,
    getConversationTitle,
    getConversationSubtitle,
  }: {
    conv: ConversationItem;
    isSelected: boolean;
    onClick: () => void;
    hideSpam: boolean;
    formatCategoryLabel: (category: Category) => string;
    getFallbackCount: () => number;
    getConversationTitle: (conv: ConversationItem) => string;
    getConversationSubtitle: (conv: ConversationItem) => string | null;
  }) {
    const fallbackCount = getFallbackCount();
    const title = getConversationTitle(conv);
    const subtitle = getConversationSubtitle(conv);
    const lastActivityRelative = conv.lastActivityAt ? formatRelativeTime(conv.lastActivityAt) : null;
    return (
      <div
        onClick={onClick}
        style={{
          padding: '0.875rem 1rem',
          borderBottom: '1px solid #e5e7eb',
          borderLeft: isSelected ? '3px solid #3b82f6' : '3px solid transparent',
          cursor: 'pointer',
          backgroundColor: isSelected ? '#eff6ff' : '#ffffff',
          transition: 'background-color 0.2s, border-color 0.2s',
        }}
        onMouseEnter={(e) => {
          if (!isSelected) {
            e.currentTarget.style.backgroundColor = '#f9fafb';
          }
        }}
        onMouseLeave={(e) => {
          if (!isSelected) {
            e.currentTarget.style.backgroundColor = '#ffffff';
          }
        }}
      >
        {/* Primary: title (larger) */}
        <div
          style={{
            fontSize: '0.9375rem',
            fontWeight: 600,
            color: '#111827',
            marginBottom: subtitle ? '0.25rem' : '0.375rem',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            lineHeight: '1.35',
          }}
        >
          {title}
        </div>
        {/* Primary: one-line preview */}
        {subtitle && (
          <div
            style={{
              fontSize: '0.8125rem',
              color: '#4b5563',
              marginBottom: '0.5rem',
              display: '-webkit-box',
              WebkitLineClamp: 1,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              lineHeight: '1.4',
            }}
          >
            {subtitle}
          </div>
        )}
        {/* Secondary: relative time + pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.375rem 0.5rem' }}>
          {lastActivityRelative && (
            <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
              {lastActivityRelative}
            </span>
          )}
          {conv.category && (
            <span
              style={{
                padding: '0.125rem 0.5rem',
                backgroundColor: '#e0e7ff',
                color: '#3730a3',
                borderRadius: '9999px',
                fontSize: '0.6875rem',
                fontWeight: 500,
              }}
            >
              {formatCategoryLabel(conv.category)}
            </span>
          )}
          {!hideSpam && conv.isSpam && (
            <span
              style={{
                padding: '0.125rem 0.5rem',
                backgroundColor: '#fee2e2',
                color: '#991b1b',
                borderRadius: '9999px',
                fontSize: '0.6875rem',
                fontWeight: 500,
              }}
            >
              Spam
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        height: 'calc(100vh - 200px)',
        gap: '1rem',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      }}
    >
      {/* Left sidebar - Conversation list */}
      <div
        style={{
          width: '320px',
          backgroundColor: '#ffffff',
          borderRadius: '0.5rem',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Search and filters */}
        <div style={{ padding: '1rem', borderBottom: '1px solid #e5e7eb' }}>
          {/* Search input - always visible */}
          <input
            type="text"
            placeholder="Pretraži razgovore..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
              marginBottom: '0.75rem',
            }}
          />
          
          {/* Filters header with toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <button
              onClick={() => setFiltersCollapsed(!filtersCollapsed)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
                backgroundColor: '#ffffff',
                cursor: 'pointer',
                color: '#374151',
                fontWeight: 500,
                transition: 'background-color 0.2s, border-color 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#f9fafb';
                e.currentTarget.style.borderColor = '#9ca3af';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#ffffff';
                e.currentTarget.style.borderColor = '#d1d5db';
              }}
            >
              <span>Filtri</span>
              {activeFiltersCount > 0 && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: '1.25rem',
                    height: '1.25rem',
                    padding: '0 0.375rem',
                    backgroundColor: '#3b82f6',
                    color: '#ffffff',
                    borderRadius: '0.75rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                  }}
                >
                  {activeFiltersCount}
                </span>
              )}
              <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                {filtersCollapsed ? '▼' : '▲'}
              </span>
            </button>
          </div>

          {/* Collapsible filters section */}
          <div
            style={{
              maxHeight: filtersCollapsed ? '0' : '1000px',
              overflow: 'hidden',
              opacity: filtersCollapsed ? 0 : 1,
              transition: 'max-height 0.3s ease-in-out, opacity 0.3s ease-in-out',
            }}
          >
            {/* Date range filter */}
            <div style={{ marginBottom: '0.75rem' }}>
              <select
                value={rangePreset}
                onChange={(e) => setRangePreset(e.target.value as DateRangePreset)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                  backgroundColor: '#ffffff',
                  marginBottom: '0.5rem',
                }}
              >
                <option value="today">Danas</option>
                <option value="7d">Zadnjih 7 dana</option>
                <option value="30d">Zadnjih 30 dana</option>
                <option value="custom">Prilagođeno</option>
              </select>
              {rangePreset === 'custom' && (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem',
                    }}
                  />
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem',
                    }}
                  />
                </div>
              )}
            </div>

            {/* Hide spam toggle */}
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '0.75rem',
                fontSize: '0.875rem',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={hideSpam}
                onChange={(e) => setHideSpam(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              <span>Sakrij spam</span>
            </label>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
                backgroundColor: '#ffffff',
                marginBottom: '0.75rem',
              }}
            >
              <option value="All">Sve kategorije</option>
              {availableCategories.map(cat => (
                <option key={cat} value={cat}>
                  {categoryLabel(cat)}
                </option>
              ))}
            </select>

            {/* Sort dropdown */}
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as SortOption)}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
                backgroundColor: '#ffffff',
              }}
            >
              <option value="newest">Najnovije prvo</option>
              <option value="oldest">Najstarije prvo</option>
              <option value="category">Po kategoriji</option>
            </select>
          </div>
        </div>

        {/* Conversation list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {conversationsLoading ? (
            <div
              style={{
                padding: '2rem',
                textAlign: 'center',
                color: '#6b7280',
                fontSize: '0.875rem',
              }}
            >
              Učitavanje...
            </div>
          ) : conversationsError ? (
            <div
              style={{
                padding: '2rem',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                alignItems: 'center',
              }}
            >
              <div style={{ color: '#dc2626', fontSize: '0.875rem', fontWeight: 500 }}>
                {conversationsError === 'Conversations: 401' || conversationsError === 'Conversations: 403'
                  ? 'Neispravna autentikacija'
                  : 'Greška pri učitavanju razgovora'}
              </div>
              <button
                onClick={() => {
                  setConversationsLoading(true);
                  setConversationsError(null);
                  fetchConversations();
                }}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Pokušaj ponovno
              </button>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div
              style={{
                padding: '2rem',
                textAlign: 'center',
                color: '#6b7280',
                fontSize: '0.875rem',
              }}
            >
              Nema razgovora
            </div>
          ) : (
            <>
              {/* Today section */}
              {groupedConversations.today.length > 0 && (
                <>
                  <div
                    style={{
                      padding: '0.75rem 1rem',
                      backgroundColor: '#f9fafb',
                      borderBottom: '1px solid #e5e7eb',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: '#374151',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    Danas
                  </div>
                  {groupedConversations.today.map(conv => (
                    <ConversationListItem
                      key={conv.conversationId}
                      conv={conv}
                      isSelected={selectedConversationId === conv.conversationId}
                      onClick={() => setSelectedConversationId(conv.conversationId)}
                      hideSpam={hideSpam}
                      formatCategoryLabel={categoryLabel}
                      getFallbackCount={() => (typeof (conv as ConversationItem).fallbackCount === 'number' ? (conv as ConversationItem).fallbackCount! : getFallbackCountMock(cityId, conv.conversationId, conv.sessionId, conv.startTime, conv.endTime))}
                      getConversationTitle={getConversationTitle}
                      getConversationSubtitle={getConversationSubtitle}
                    />
                  ))}
                </>
              )}

              {/* Yesterday section */}
              {groupedConversations.yesterday.length > 0 && (
                <>
                  <div
                    style={{
                      padding: '0.75rem 1rem',
                      backgroundColor: '#f9fafb',
                      borderBottom: '1px solid #e5e7eb',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: '#374151',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    Jučer
                  </div>
                  {groupedConversations.yesterday.map(conv => (
                    <ConversationListItem
                      key={conv.conversationId}
                      conv={conv}
                      isSelected={selectedConversationId === conv.conversationId}
                      onClick={() => setSelectedConversationId(conv.conversationId)}
                      hideSpam={hideSpam}
                      formatCategoryLabel={categoryLabel}
                      getFallbackCount={() => (typeof (conv as ConversationItem).fallbackCount === 'number' ? (conv as ConversationItem).fallbackCount! : getFallbackCountMock(cityId, conv.conversationId, conv.sessionId, conv.startTime, conv.endTime))}
                      getConversationTitle={getConversationTitle}
                      getConversationSubtitle={getConversationSubtitle}
                    />
                  ))}
                </>
              )}

              {/* This week section */}
              {groupedConversations.thisWeek.length > 0 && (
                <>
                  <div
                    style={{
                      padding: '0.75rem 1rem',
                      backgroundColor: '#f9fafb',
                      borderBottom: '1px solid #e5e7eb',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: '#374151',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    Ovaj tjedan
                  </div>
                  {groupedConversations.thisWeek.map(conv => (
                    <ConversationListItem
                      key={conv.conversationId}
                      conv={conv}
                      isSelected={selectedConversationId === conv.conversationId}
                      onClick={() => setSelectedConversationId(conv.conversationId)}
                      hideSpam={hideSpam}
                      formatCategoryLabel={categoryLabel}
                      getFallbackCount={() => (typeof (conv as ConversationItem).fallbackCount === 'number' ? (conv as ConversationItem).fallbackCount! : getFallbackCountMock(cityId, conv.conversationId, conv.sessionId, conv.startTime, conv.endTime))}
                      getConversationTitle={getConversationTitle}
                      getConversationSubtitle={getConversationSubtitle}
                    />
                  ))}
                </>
              )}

              {/* Older section */}
              {groupedConversations.older.length > 0 && (
                <>
                  <div
                    style={{
                      padding: '0.75rem 1rem',
                      backgroundColor: '#f9fafb',
                      borderBottom: '1px solid #e5e7eb',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: '#374151',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    Starije
                  </div>
                  {groupedConversations.older.map(conv => (
                    <ConversationListItem
                      key={conv.conversationId}
                      conv={conv}
                      isSelected={selectedConversationId === conv.conversationId}
                      onClick={() => setSelectedConversationId(conv.conversationId)}
                      hideSpam={hideSpam}
                      formatCategoryLabel={categoryLabel}
                      getFallbackCount={() => (typeof (conv as ConversationItem).fallbackCount === 'number' ? (conv as ConversationItem).fallbackCount! : getFallbackCountMock(cityId, conv.conversationId, conv.sessionId, conv.startTime, conv.endTime))}
                      getConversationTitle={getConversationTitle}
                      getConversationSubtitle={getConversationSubtitle}
                    />
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Right side - Transcript viewer */}
      <div
        style={{
          flex: 1,
          backgroundColor: '#ffffff',
          borderRadius: '0.5rem',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {selectedConversation ? (
          <>
            {/* Header: title prominent, metadata secondary, badge calm */}
            <div
              style={{
                padding: '1.25rem 1.5rem',
                borderBottom: '1px solid #e5e7eb',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: '1rem',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2
                  style={{
                    margin: 0,
                    fontSize: '1.25rem',
                    fontWeight: 600,
                    color: '#111827',
                    marginBottom: '0.375rem',
                    lineHeight: '1.3',
                  }}
                >
                  {(selectedConversation as any).title || getConversationTitle(selectedConversation as ConversationItem)}
                </h2>
                {(selectedConversation as any).summary && (
                  <div
                    style={{
                      fontSize: '0.875rem',
                      color: '#6b7280',
                      marginBottom: '0.5rem',
                      lineHeight: '1.4',
                    }}
                  >
                    {(selectedConversation as any).summary}
                  </div>
                )}
                <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                  {formatDate(selectedConversation.startTime)} · {selectedConversation.messageCount} poruka
                  {selectedConversationFallbackCount > 0 && (
                    <span style={{ color: '#dc2626', marginLeft: '0.375rem' }}>
                      · {selectedConversationFallbackCount} fallback
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', flexShrink: 0 }}>
                <span
                  style={{
                    padding: '0.25rem 0.5rem',
                    backgroundColor: '#f3f4f6',
                    color: '#4b5563',
                    borderRadius: '9999px',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                  }}
                >
                  {categoryLabel(selectedConversation.category)}
                </span>
                {selectedConversation.isSpam && (
                  <span
                    style={{
                      padding: '0.25rem 0.5rem',
                      backgroundColor: '#fef2f2',
                      color: '#991b1b',
                      borderRadius: '9999px',
                      fontSize: '0.75rem',
                      fontWeight: 500,
                    }}
                  >
                    Spam
                  </span>
                )}
              </div>
            </div>

            {/* Messages - chat bubbles, calm spacing */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '1.25rem 1.5rem',
              }}
            >
              {messagesLoading ? (
                <div
                  style={{
                    padding: '2rem',
                    textAlign: 'center',
                    color: '#6b7280',
                    fontSize: '0.875rem',
                  }}
                >
                  Učitavanje poruka...
                </div>
              ) : messagesError ? (
                <div
                  style={{
                    padding: '2rem',
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ color: '#dc2626', fontSize: '0.875rem', fontWeight: 500 }}>
                    {messagesError === 'Messages: 401' || messagesError === 'Messages: 403'
                      ? 'Neispravna autentikacija'
                      : 'Greška pri učitavanju poruka'}
                  </div>
                  <button
                    onClick={() => {
                      setMessagesLoading(true);
                      setMessagesError(null);
                      fetchMessages();
                    }}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: '#3b82f6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    Pokušaj ponovno
                  </button>
                </div>
              ) : selectedConversationTranscript.length === 0 ? (
                <div
                  style={{
                    padding: '2rem',
                    textAlign: 'center',
                    color: '#6b7280',
                    fontSize: '0.875rem',
                  }}
                >
                  Nema poruka u ovom razgovoru
                </div>
              ) : (
                selectedConversationTranscript.map((msg, index) => (
                  <div
                    key={msg.messageId || `msg-${index}`}
                    style={{
                      marginBottom: '1.25rem',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: msg.role === 'user' ? 'flex-start' : 'flex-end',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '0.6875rem',
                        color: '#9ca3af',
                        marginBottom: '0.25rem',
                        paddingLeft: msg.role === 'user' ? '0.25rem' : 0,
                        paddingRight: msg.role === 'user' ? 0 : '0.25rem',
                        alignSelf: msg.role === 'user' ? 'flex-start' : 'flex-end',
                      }}
                    >
                      {msg.role === 'user' ? 'Građanin' : 'Asistent'}
                    </span>
                    <div
                      style={{
                        maxWidth: '75%',
                        padding: '0.875rem 1.125rem',
                        borderRadius: '1rem',
                        backgroundColor: msg.role === 'user' ? '#e0f2fe' : '#f9fafb',
                        color: msg.role === 'user' ? '#0c4a6e' : '#111827',
                        border: msg.role === 'assistant' ? '1px solid #e5e7eb' : 'none',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                      }}
                    >
                      <div style={{ fontSize: '0.9375rem', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {msg.content || '(prazna poruka)'}
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: '0.6875rem',
                        color: '#9ca3af',
                        marginTop: '0.25rem',
                        paddingLeft: msg.role === 'user' ? '0.25rem' : 0,
                        paddingRight: msg.role === 'user' ? 0 : '0.25rem',
                        alignSelf: msg.role === 'user' ? 'flex-start' : 'flex-end',
                      }}
                    >
                      {formatMessageTime(msg.timestamp)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#6b7280',
              fontSize: '0.875rem',
            }}
          >
            Odaberite razgovor za prikaz transkripta
          </div>
        )}
      </div>
    </div>
  );
}
