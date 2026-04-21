import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  fetchInbox,
  fetchConversationDetail,
  postConversationNote,
  patchConversation,
  type ApiInboxItem,
  type ApiConversationDetail,
  type PatchConversationBody,
} from './api/adminClient';
import { usePolling } from './hooks/usePolling';
import { formatDateTime, formatMessageTime, formatRelativeTime } from './utils/dateFormat';
import { DataTable, type DataTableColumn } from './components/DataTable';
import './Inbox.css';

type WorkflowStatus = 'open' | 'resolved' | 'closed';
type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed' | 'spam';
type SpamAnalysisResult = {
  ai_category: string | null;
  is_suspicious: boolean;
  spam_score: number;
  spam_reasons: string[];
};
type InboxTicket = ApiInboxItem & {
  read_at?: string | null;
  ai_category?: string | null;
  time_open_hours?: number | null;
  closed_at?: string | null;
  spam_flagged_at?: string | null;
};

const DEPARTMENT_OPTIONS = ['Uprava', 'Komunalno', 'Financije', 'Turizam', 'Ostalo'] as const;

interface InboxProps {
  cityId: string;
  liveEnabled: boolean;
  onNavigateToAllConversations?: () => void;
  onNeedsHumanToggledOff?: () => void;
}

type StatusFilter = 'open' | 'closed' | 'all';
type StatusChip = 'all' | 'open' | 'resolved' | 'spam';

// Simple toast notification
function showToast(message: string) {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #10b981;
    color: white;
    padding: 0.75rem 1rem;
    border-radius: 0.375rem;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    z-index: 10000;
    font-size: 0.875rem;
    font-weight: 500;
  `;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s';
    toast.style.opacity = '0';
    setTimeout(() => document.body.removeChild(toast), 300);
  }, 2000);
}

export function Inbox({ cityId, liveEnabled, onNavigateToAllConversations, onNeedsHumanToggledOff }: InboxProps) {
  const [conversations, setConversations] = useState<InboxTicket[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [conversationDetail, setConversationDetail] = useState<ApiConversationDetail | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [statusChip, setStatusChip] = useState<StatusChip>('all');
  const [filtersCollapsed, setFiltersCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 768;
    }
    return false;
  });
  const userToggledFilters = useRef(false);
  const [urgentFilterOnly, setUrgentFilterOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [noteText, setNoteText] = useState<string>('');
  const [isAddingNote, setIsAddingNote] = useState(false);
  const noteInputRef = useRef<HTMLTextAreaElement>(null);

  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [conversationsError, setConversationsError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  // Track if detail fetch is in progress to prevent overlapping requests
  const detailFetchInFlightRef = useRef(false);

  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatus>('open');
  const [workflowDepartment, setWorkflowDepartment] = useState<string>('');
  const [workflowUrgent, setWorkflowUrgent] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [ticketModalOpen, setTicketModalOpen] = useState(false);
  const [analysisByConversationId, setAnalysisByConversationId] = useState<Record<string, SpamAnalysisResult>>({});
  const [analysisLoadingId, setAnalysisLoadingId] = useState<string | null>(null);
  const [autoAnalyzedIds, setAutoAnalyzedIds] = useState<Record<string, true>>({});
  const pendingAutosaveRef = useRef<PatchConversationBody | null>(null);
  const savingInProgressRef = useRef(false);
  const transcriptRef = useRef<HTMLDivElement>(null);
  // Store initial conversation values to compare against (prevents autosave loop)
  const initialConversationRef = useRef<{
    status: string | null;
    department: string | null;
    urgent: boolean;
  } | null>(null);

  const cityCode = cityId;
  const API_BASE =
    import.meta.env.PROD
      ? '/api'
      : ((import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE_URL || 'http://localhost:3000');

  const patchTicketFields = useCallback(
    async (conversationUuid: string, body: Record<string, unknown>) => {
      const res = await fetch(
        `${API_BASE}/admin/${encodeURIComponent(cityCode)}/tickets/${encodeURIComponent(conversationUuid)}`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) throw new Error(`Patch ticket: ${res.status}`);
      return res;
    },
    [API_BASE, cityCode]
  );

  const analyzeTicket = useCallback(
    async (conversationUuid: string): Promise<SpamAnalysisResult> => {
      const res = await fetch(
        `${API_BASE}/admin/${encodeURIComponent(cityCode)}/tickets/${encodeURIComponent(conversationUuid)}/analyze`,
        {
          method: 'POST',
          credentials: 'include',
        }
      );
      if (!res.ok) throw new Error(`Analyze ticket: ${res.status}`);
      const data = (await res.json()) as Partial<SpamAnalysisResult>;
      return {
        ai_category: data.ai_category ?? null,
        is_suspicious: Boolean(data.is_suspicious),
        spam_score: Number(data.spam_score ?? 0),
        spam_reasons: Array.isArray(data.spam_reasons) ? data.spam_reasons : [],
      };
    },
    [API_BASE, cityCode]
  );

  // Load tickets list (inbox: tickets table is single source of truth)
  const loadConversations = useCallback(async () => {
    try {
      const list = await fetchInbox(cityCode);
      setConversations(list as InboxTicket[]);
      setConversationsLoading(false);
      setConversationsError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load tickets';
      setConversations([]);
      setConversationsLoading(false);
      setConversationsError(errorMessage);
    }
  }, [cityCode]);

  // Load conversation detail
  // isBackgroundRefresh: if true, don't show loading spinner (for polling updates)
  const loadConversationDetail = useCallback(async (conversationUuid: string, isBackgroundRefresh: boolean = false) => {
    // Prevent overlapping requests
    if (detailFetchInFlightRef.current) {
      return;
    }
    
    detailFetchInFlightRef.current = true;
    
    // Only show loading spinner on initial load, not on background refresh
    if (!isBackgroundRefresh) {
      setDetailLoading(true);
    }
    setDetailError(null);
    
    try {
      const detail = await fetchConversationDetail(cityCode, conversationUuid);
      setConversationDetail(detail);
      // Store initial values for autosave comparison (only on initial load)
      if (!isBackgroundRefresh) {
        initialConversationRef.current = {
          status: detail.conversation.status,
          department: detail.conversation.department,
          urgent: detail.conversation.urgent,
        };
        // Initialize workflow form from detail (in_progress treated as open for dropdown)
        setWorkflowStatus(
          detail.conversation.status === 'open' ||
            detail.conversation.status === 'in_progress' ||
            detail.conversation.status === 'resolved' ||
            detail.conversation.status === 'closed'
            ? detail.conversation.status === 'closed'
              ? 'closed'
              : detail.conversation.status === 'resolved'
                ? 'resolved'
              : 'open'
            : 'open'
        );
        setWorkflowDepartment(detail.conversation.department || '');
        setWorkflowUrgent(detail.conversation.urgent || false);
      }
      setSaveError(null);
      setDetailLoading(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load conversation detail';
      // Only clear detail and show error on initial load
      if (!isBackgroundRefresh) {
        setConversationDetail(null);
        setDetailError(errorMessage);
      }
      setDetailLoading(false);
    } finally {
      detailFetchInFlightRef.current = false;
    }
  }, [cityCode]);

  // Initial load
  useEffect(() => {
    setConversationsLoading(true);
    loadConversations();
  }, [loadConversations]);

  // Poll conversations every 4s when Live is enabled
  usePolling({
    callback: loadConversations,
    intervalMs: 4000,
    enabled: liveEnabled,
  });

  // Load detail when selection changes - ONLY when cityId or selectedConversationId changes
  // Use ref to prevent StrictMode double-invocation from causing duplicate requests
  const loadingRef = useRef<string | null>(null);
  const loadConversationDetailRef = useRef(loadConversationDetail);
  
  // Keep ref in sync with latest callback (but don't trigger effect)
  useEffect(() => {
    loadConversationDetailRef.current = loadConversationDetail;
  }, [loadConversationDetail]);
  
  useEffect(() => {
    if (selectedConversationId) {
      // Prevent duplicate requests from StrictMode double-invocation
      if (loadingRef.current === selectedConversationId) {
        return;
      }
      loadingRef.current = selectedConversationId;

      loadConversationDetailRef.current(selectedConversationId).finally(() => {
        // Clear loading ref after request completes (success or error)
        if (loadingRef.current === selectedConversationId) {
          loadingRef.current = null;
        }
      });
    } else {
      setConversationDetail(null);
      initialConversationRef.current = null;
      loadingRef.current = null;
      detailFetchInFlightRef.current = false;
    }
  }, [cityId, selectedConversationId]);

  // Poll conversation detail every 4s when Live is enabled and conversation is selected
  // Smart scroll: only auto-scroll if user is at bottom
  // This is called for background refresh (polling), so use isBackgroundRefresh=true
  const loadConversationDetailWithScroll = useCallback(async (conversationUuid: string) => {
    if (!transcriptRef.current) {
      await loadConversationDetail(conversationUuid, true);
      return;
    }
    
    // Check if user is scrolled to bottom (within 50px threshold)
    const container = transcriptRef.current;
    const wasAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 50;
    
    // Background refresh: don't show loading spinner
    await loadConversationDetail(conversationUuid, true);
    
    // Only auto-scroll if user was at bottom
    if (wasAtBottom && container) {
      // Use setTimeout to ensure DOM has updated
      setTimeout(() => {
        if (container) {
          container.scrollTop = container.scrollHeight;
        }
      }, 0);
    }
  }, [loadConversationDetail]);

  usePolling({
    callback: () => {
      if (selectedConversationId) {
        loadConversationDetailWithScroll(selectedConversationId);
      }
    },
    intervalMs: 4000,
    enabled: liveEnabled && !!selectedConversationId,
  });

  // Full title (contact + phone/email) — for detail view only
  const getConversationTitleFull = useCallback((conv: ApiInboxItem): string => {
    const contactParts: string[] = [];
    if (conv.contact_name) contactParts.push(conv.contact_name);
    const contactInfo: string[] = [];
    if (conv.contact_phone) contactInfo.push(conv.contact_phone);
    if (conv.contact_email) contactInfo.push(conv.contact_email);
    if (contactInfo.length > 0) contactParts.push(`(${contactInfo.join(', ')})`);
    if (contactParts.length > 0) return contactParts.join(' ');
    if (conv.title) return conv.title;
    return `Razgovor ${conv.conversation_id.substring(0, 8)}`;
  }, []);

  // Ticket title for list primary line: trigger/title first, then first user message, then fallback. No citizen name.
  const getTicketTitle = useCallback((conv: ApiInboxItem): string => {
    const title = conv.title?.trim();
    if (title) return title;
    const first = conv.first_user_message?.trim();
    if (first) return first;
    return 'Upit građana';
  }, []);

  // One-line context preview for list secondary line (muted). No citizen name.
  // Optionally show Napomena truncated to 80 chars when present.
  const getListPreview = useCallback((conv: ApiInboxItem): string | null => {
    const oneLine = (s: string, maxLen = 80) => {
      const t = s.replace(/\s+/g, ' ').trim();
      return t.length <= maxLen ? t : t.substring(0, maxLen - 3) + '…';
    };
    if (conv.contact_note?.trim()) return 'Napomena: ' + oneLine(conv.contact_note, 80);
    if (conv.summary) return oneLine(conv.summary);
    if (conv.first_user_message) return oneLine(conv.first_user_message);
    if (conv.category && conv.category !== 'issue_reporting') return conv.category;
    return null;
  }, []);

  // Filter and sort conversations (status chips + Hitno + search + tags)
  const filteredConversations = useMemo(() => {
    let filtered = [...conversations];

    // Status chip: conv.status (open includes legacy in_progress / resolved|closed)
    if (statusChip === 'spam') {
      filtered = filtered.filter((c) => c.status === 'spam');
    } else if (statusChip === 'open') {
      filtered = filtered.filter((c) => c.status === 'open' || c.status === 'in_progress');
    } else if (statusChip === 'resolved') {
      filtered = filtered.filter((c) => c.status === 'resolved' || c.status === 'closed');
    } else {
      filtered = filtered.filter((c) => c.status !== 'spam');
    }

    // Hitno: only urgent (conv.urgent)
    if (urgentFilterOnly) {
      filtered = filtered.filter((c) => c.urgent === true);
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((c) => {
        if (c.conversation_id.toLowerCase().includes(query)) return true;
        if (c.first_user_message && c.first_user_message.toLowerCase().includes(query)) return true;
        return false;
      });
    }

    // Tag filter (using category for now, tags not yet implemented)
    if (selectedTags.length > 0) {
      filtered = filtered.filter((c) => {
        return c.category && selectedTags.includes(c.category);
      });
    }

    // Sort by created_at desc (time of form submission - tickets table ordering)
    filtered.sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bTime - aTime;
    });

    return filtered;
  }, [conversations, statusChip, urgentFilterOnly, searchQuery, selectedTags]);

  // Get all unique tags from conversations (using category for now, tags not yet implemented)
  // Exclude "issue_reporting" from dropdown options only - conversations still appear in list
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    conversations.forEach((conv) => {
      if (conv.category && conv.category !== 'issue_reporting') {
        tags.add(conv.category);
      }
      // When tags are implemented in API, add them here:
      // if (conv.tags && Array.isArray(conv.tags)) {
      //   conv.tags.forEach(tag => tags.add(tag));
      // }
    });
    return Array.from(tags).sort();
  }, [conversations]);

  const unreadCount = useMemo(() => conversations.filter((conv) => !conv.read_at).length, [conversations]);

  const selectedTicket = useMemo(
    () => conversations.find((c) => c.conversation_id === selectedConversationId) ?? null,
    [conversations, selectedConversationId]
  );

  const formatOpenDuration = useCallback((hoursValue: number | null | undefined): string => {
    if (typeof hoursValue !== 'number' || Number.isNaN(hoursValue)) return '—';
    if (hoursValue < 24) return `${Math.max(1, Math.round(hoursValue))}h`;
    if (hoursValue < 48) return '1 dan';
    return `${Math.max(2, Math.round(hoursValue / 24))} dana`;
  }, []);

  const formatClosedAtDisplay = useCallback((isoDate: string | null | undefined): string => {
    if (!isoDate) return '—';
    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('hr-HR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }, []);

  const updateTicketLocally = useCallback((conversationId: string, updates: Partial<InboxTicket>) => {
    setConversations((prev) => prev.map((c) => (c.conversation_id === conversationId ? { ...c, ...updates } : c)));
  }, []);

  const runAnalyzeTicket = useCallback(
    async (conversationId: string, withLoadingState: boolean) => {
      if (withLoadingState) {
        setAnalysisLoadingId(conversationId);
      }
      try {
        const result = await analyzeTicket(conversationId);
        setAnalysisByConversationId((prev) => ({ ...prev, [conversationId]: result }));
        updateTicketLocally(conversationId, {
          ai_category: result.ai_category,
        });
      } catch (err) {
        console.error('Analyze ticket failed:', err);
      } finally {
        if (withLoadingState) {
          setAnalysisLoadingId((prev) => (prev === conversationId ? null : prev));
        }
      }
    },
    [analyzeTicket, updateTicketLocally]
  );

  const handleOpenConversation = useCallback(
    async (conversationId: string) => {
      setSelectedConversationId(conversationId);
      const openedTicket = conversations.find((c) => c.conversation_id === conversationId);
      if (openedTicket && !openedTicket.read_at) {
        const readAt = new Date().toISOString();
        updateTicketLocally(conversationId, { read_at: readAt });
        try {
          await patchTicketFields(conversationId, { read_at: readAt });
        } catch (err) {
          console.error('Failed to mark ticket as read:', err);
        }
      }
    },
    [conversations, patchTicketFields, updateTicketLocally]
  );

  useEffect(() => {
    if (!selectedTicket?.conversation_id) return;
    if (selectedTicket.ai_category) return;
    if (autoAnalyzedIds[selectedTicket.conversation_id]) return;
    setAutoAnalyzedIds((prev) => ({ ...prev, [selectedTicket.conversation_id]: true }));
    runAnalyzeTicket(selectedTicket.conversation_id, false);
  }, [selectedTicket, autoAnalyzedIds, runAnalyzeTicket]);

  const handleStatusChange = useCallback(
    async (nextStatus: WorkflowStatus) => {
      if (!selectedConversationId) return;
      const nowIso = new Date().toISOString();
      const closedAt = nextStatus === 'closed' ? nowIso : null;
      const patchBody: Record<string, unknown> = {
        status: nextStatus,
        ...(nextStatus === 'closed' ? { closed_at: nowIso } : {}),
      };

      setWorkflowStatus(nextStatus);
      setSaveStatus('saving');
      setSaveError(null);
      updateTicketLocally(selectedConversationId, {
        status: nextStatus,
        closed_at: closedAt,
      });
      setConversationDetail((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          conversation: {
            ...prev.conversation,
            status: nextStatus,
          },
        };
      });

      try {
        await patchTicketFields(selectedConversationId, patchBody);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch (err) {
        console.error('Status update failed:', err);
        setSaveStatus('idle');
        setSaveError('Failed to save. Try again.');
        loadConversations();
        loadConversationDetail(selectedConversationId, true);
      }
    },
    [selectedConversationId, updateTicketLocally, patchTicketFields, loadConversations, loadConversationDetail]
  );

  // Autosave on change (immediate save, last-write-wins if save in progress)
  const autosave = useCallback(
    (updates: PatchConversationBody) => {
      if (!selectedConversationId) return;

      // Only send status, department, is_urgent (do not send needs_human)
      const payload: PatchConversationBody = {};
      if (updates.status !== undefined) payload.status = updates.status;
      if (updates.department !== undefined) payload.department = updates.department;
      if (updates.urgent !== undefined) payload.urgent = updates.urgent;

      if (Object.keys(payload).length === 0) return;

      setSaveError(null);

      // Update local state optimistically (detail + left list)
      setConversationDetail((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          conversation: {
            ...prev.conversation,
            ...(payload.status !== undefined && { status: payload.status }),
            ...(payload.department !== undefined && { department: payload.department }),
            ...(payload.urgent !== undefined && { urgent: payload.urgent }),
          },
        };
      });
      setConversations((prev) =>
        prev.map((c) =>
          c.conversation_id === selectedConversationId
            ? {
                ...c,
                ...(payload.status !== undefined && { status: payload.status }),
                ...(payload.department !== undefined && { department: payload.department }),
                ...(payload.urgent !== undefined && { urgent: payload.urgent }),
              }
            : c
        )
      );

      if (initialConversationRef.current) {
        initialConversationRef.current = {
          ...initialConversationRef.current,
          ...(payload.status !== undefined && { status: payload.status }),
          ...(payload.department !== undefined && { department: payload.department }),
          ...(payload.urgent !== undefined && { urgent: payload.urgent }),
        };
      }

      const doSave = async (body: PatchConversationBody) => {
        savingInProgressRef.current = true;
        setIsSaving(true);
        setSaveStatus('saving');
        try {
          await patchConversation(cityCode, selectedConversationId, body);
          savingInProgressRef.current = false;
          setIsSaving(false);
          setSaveStatus('saved');
          setTimeout(() => setSaveStatus('idle'), 2000);
          // Last-write-wins: if another change was queued, save it now
          const pending = pendingAutosaveRef.current;
          pendingAutosaveRef.current = null;
          if (pending && selectedConversationId && (pending.status !== undefined || pending.department !== undefined || pending.urgent !== undefined)) {
            doSave(pending);
          }
        } catch (err) {
          console.error('Autosave failed:', err);
          savingInProgressRef.current = false;
          if (selectedConversationId) {
            // Background refresh to avoid flickering during error recovery
            loadConversationDetail(selectedConversationId, true);
            loadConversations();
          }
          setIsSaving(false);
          setSaveStatus('idle');
          setSaveError('Failed to save. Try again.');
          pendingAutosaveRef.current = null;
        }
      };

      if (savingInProgressRef.current) {
        pendingAutosaveRef.current = payload;
        return;
      }
      doSave(payload);
    },
    [cityCode, selectedConversationId, loadConversationDetail, loadConversations]
  );

  // Handle workflow changes (autosave on change)
  // Compare against initial values stored in ref, NOT conversationDetail object (prevents loop)
  useEffect(() => {
    if (!selectedConversationId || !initialConversationRef.current) return;

    const initial = initialConversationRef.current;
    const updates: PatchConversationBody = {};
    let hasChanges = false;

    if (workflowDepartment !== (initial.department || '')) {
      updates.department = workflowDepartment.trim() || null;
      hasChanges = true;
    }

    if (workflowUrgent !== initial.urgent) {
      updates.urgent = workflowUrgent;
      hasChanges = true;
    }

    if (hasChanges) {
      autosave(updates);
    }
  }, [workflowDepartment, workflowUrgent, selectedConversationId, autosave]);

  // Handle add note - updates local state optimistically
  const handleAddNote = useCallback(async () => {
    if (!selectedConversationId || !noteText.trim() || isAddingNote) return;

    const noteTextToAdd = noteText.trim();
    setIsAddingNote(true);

    // Optimistically add note to local state (using functional update to avoid dependency on conversationDetail)
    const optimisticNote = {
      id: `temp-${Date.now()}`,
      note: noteTextToAdd,
      created_at: new Date().toISOString(),
    };
    setConversationDetail((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        notes: [...prev.notes, optimisticNote],
      };
    });
    setNoteText('');

    // Auto-scroll to bottom after adding note
    setTimeout(() => {
      if (transcriptRef.current) {
        transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
      }
      noteInputRef.current?.focus();
    }, 100);

    try {
      const savedNote = await postConversationNote(cityCode, selectedConversationId, { note: noteTextToAdd });
      // Replace optimistic note with real note from server
      setConversationDetail((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          notes: prev.notes.map((n) => (n.id === optimisticNote.id ? savedNote : n)),
        };
      });
      showToast('Spremljeno');
    } catch (err) {
      console.error('Failed to add note:', err);
      // Revert optimistic update on error
      setConversationDetail((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          notes: prev.notes.filter((n) => n.id !== optimisticNote.id),
        };
      });
      setNoteText(noteTextToAdd); // Restore note text
      showToast('Greška pri dodavanju napomene');
    } finally {
      setIsAddingNote(false);
    }
  }, [cityCode, selectedConversationId, noteText, isAddingNote]);

  // Merge messages, notes, and optional ticket card into timeline (sorted by created_at)
  const timelineItems = useMemo(() => {
    const messages = conversationDetail?.messages ?? [];
    const notes = conversationDetail?.notes ?? [];
    const ticket = conversationDetail?.ticket;

    const items: Array<
      | { type: 'message'; id: string; role: string; content: string | null; created_at: string }
      | { type: 'note'; id: string; note: string; created_at: string }
      | { type: 'ticket'; id: string; created_at: string }
    > = [];

    // Add messages
    messages.forEach((msg) => {
      items.push({
        type: 'message',
        id: msg.id,
        role: msg.role,
        content: msg.content_redacted,
        created_at: msg.created_at,
      });
    });

    // Add notes (only with non-empty content)
    notes.forEach((note) => {
      if (typeof note.note === 'string' && note.note.trim().length > 0) {
        items.push({
          type: 'note',
          id: note.id,
          note: note.note,
          created_at: note.created_at,
        });
      }
    });

    // Virtual ticket card when conversation has a ticket (placed near end by sort)
    if (ticket) {
      const ticketTime = conversationDetail?.conversation?.last_activity_at ?? conversationDetail?.conversation?.updated_at ?? new Date().toISOString();
      items.push({ type: 'ticket', id: 'ticket-submitted', created_at: ticketTime });
    }

    // Sort by created_at ascending (oldest first) for normal chat order
    items.sort((a, b) => {
      const aTime = new Date(a.created_at).getTime();
      const bTime = new Date(b.created_at).getTime();
      return aTime - bTime;
    });

    return items;
  }, [conversationDetail]);

  // Auto-scroll transcript to bottom when new messages/notes arrive
  // Only auto-scroll if user is already at bottom (within 50px threshold)
  useEffect(() => {
    if (timelineItems.length > 0 && transcriptRef.current) {
      const container = transcriptRef.current;
      const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 50;
      if (isAtBottom) {
        container.scrollTop = container.scrollHeight;
      }
    }
  }, [timelineItems.length]);

  // Get status badge style
  const getStatusBadgeStyle = (status: string | null) => {
    switch (status) {
      case 'open':
      case 'in_progress':
        return { backgroundColor: '#fef3c7', color: '#92400e' };
      case 'resolved':
      case 'closed':
        return { backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' };
      default:
        return { backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' };
    }
  };

  const getStatusLabel = (status: string | null) => {
    switch (status) {
      case 'open':
      case 'in_progress':
        return 'Otvoreno';
      case 'resolved':
      case 'closed':
        return 'Riješeno';
      default:
        return 'Otvoreno';
    }
  };

  const [isMobile, setIsMobile] = useState(false);
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list');

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!userToggledFilters.current) {
        if (mobile && !filtersCollapsed) {
          setFiltersCollapsed(true);
        } else if (!mobile && filtersCollapsed) {
          setFiltersCollapsed(false);
        }
      }
      if (!mobile) {
        setMobileView('list');
      }
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [filtersCollapsed]);

  // On mobile, switch to detail view when conversation is selected
  useEffect(() => {
    if (isMobile && selectedConversationId) {
      setMobileView('detail');
    } else if (isMobile && !selectedConversationId) {
      setMobileView('list');
    }
  }, [isMobile, selectedConversationId]);

  // Compute KPIs from conversations array
  const kpis = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    let aktivniZahtjevi = 0;
    let danasZaprimljeni = 0;
    let hitniZahtjevi = 0;
    let rijeseniDanas = 0;

    conversations.forEach((conv) => {
      // 1. Aktivni zahtjevi: not resolved/closed
      if (conv.status !== 'resolved' && conv.status !== 'closed') {
        aktivniZahtjevi++;
      }

      // 2. Danas zaprimljeni: created today
      if (conv.created_at) {
        const createdDate = new Date(conv.created_at);
        if (createdDate >= todayStart && createdDate < todayEnd) {
          danasZaprimljeni++;
        }
      }

      // 3. Hitni zahtjevi: urgent flag
      if (conv.urgent === true) {
        hitniZahtjevi++;
      }

      // 4. Riješeni danas: resolved/closed and updated today
      if ((conv.status === 'resolved' || conv.status === 'closed') && conv.updated_at) {
        const updatedDate = new Date(conv.updated_at);
        if (updatedDate >= todayStart && updatedDate < todayEnd) {
          rijeseniDanas++;
        }
      }
    });

    return {
      aktivniZahtjevi,
      danasZaprimljeni,
      hitniZahtjevi,
      rijeseniDanas,
    };
  }, [conversations]);

  // KPI Bar component
  const KPIBar = () => (
    <div
      style={{
        width: '100%',
        backgroundColor: 'var(--bg-primary)',
        borderBottom: '1px solid var(--border-color)',
        padding: '1rem 1.5rem',
        marginBottom: '1rem',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
          gap: isMobile ? '1rem' : '2rem',
          maxWidth: '1200px',
          margin: '0 auto',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
            {kpis.aktivniZahtjevi}
          </div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Aktivni zahtjevi</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
            {kpis.danasZaprimljeni}
          </div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Danas zaprimljeni</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
            {kpis.hitniZahtjevi}
          </div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Hitni zahtjevi</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
            {kpis.rijeseniDanas}
          </div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Riješeni danas</div>
        </div>
      </div>
    </div>
  );

  const inboxColumns: Array<DataTableColumn<InboxTicket>> = useMemo(
    () => [
      {
        key: 'title',
        label: 'Razgovori',
        render: (conv) => (
          <div className="inbox-ticket-cell">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              {!conv.read_at && <span style={{ color: '#2563eb', fontSize: '0.875rem', lineHeight: 1 }}>●</span>}
              <div className="inbox-ticket-title-line" style={{ fontWeight: conv.read_at ? 500 : 700 }}>
                {getTicketTitle(conv)}
              </div>
            </div>
            {conv.ai_category && (
              <div
                style={{
                  marginTop: '0.25rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '0.15rem 0.45rem',
                  borderRadius: '9999px',
                  fontSize: '0.6875rem',
                  backgroundColor: '#e5e7eb',
                  color: '#374151',
                  fontWeight: 500,
                }}
              >
                {conv.ai_category}
              </div>
            )}
            <div className="inbox-ticket-meta-row">
              <span className="inbox-ticket-status-pill">{getStatusLabel(conv.status)}</span>
              <span className="inbox-ticket-category-pill">{conv.category ?? '—'}</span>
              <span className="inbox-ticket-date-pill">{conv.last_activity_at ? formatRelativeTime(conv.last_activity_at) : '—'}</span>
            </div>
            {getListPreview(conv) && (
              <div className="inbox-ticket-preview">{getListPreview(conv)}</div>
            )}
          </div>
        ),
      },
    ],
    [getListPreview, getTicketTitle]
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      }}
    >
      <KPIBar />
      <div
        style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          height: isMobile ? 'auto' : 'calc(100vh - 136px)',
          gap: '0.75rem',
          overflow: 'hidden',
          padding: '0 0.75rem 0.75rem',
        }}
      >
      {/* Left sidebar - Conversation list */}
      <div
        style={{
          width: isMobile ? '100%' : '320px',
          minWidth: isMobile ? 'auto' : '320px',
          maxWidth: isMobile ? '100%' : '320px',
          height: isMobile ? '50vh' : 'auto',
          backgroundColor: 'var(--bg-card)',
          borderRadius: '0.5rem',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
          display: isMobile && mobileView === 'detail' ? 'none' : 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Filters */}
        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>Razgovori</span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '0.15rem 0.5rem',
                borderRadius: '9999px',
                backgroundColor: '#dbeafe',
                color: '#1d4ed8',
                fontSize: '0.75rem',
                fontWeight: 600,
              }}
            >
              Nepročitano ({unreadCount})
            </span>
          </div>
          {/* Search - always visible */}
          <input
            type="text"
            placeholder="Pretraži po ID-u ili pitanju..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid var(--border-color)',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
              marginBottom: '0.5rem',
              minHeight: '34px',
            }}
          />

          {/* Filters toggle button */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <button
              type="button"
              onClick={() => {
                userToggledFilters.current = true;
                setFiltersCollapsed(!filtersCollapsed);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 0.75rem',
                border: '1px solid var(--border-color)',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
                backgroundColor: 'var(--bg-card)',
                cursor: 'pointer',
                color: 'var(--text-primary)',
                fontWeight: 500,
                transition: 'background-color 0.2s, border-color 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-primary)';
                e.currentTarget.style.borderColor = 'var(--border-color)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-card)';
                e.currentTarget.style.borderColor = 'var(--border-color)';
              }}
            >
              <span>Filtri</span>
              {(statusChip !== 'all' || urgentFilterOnly || selectedTags.length > 0) && (
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
                  {[statusChip !== 'all' ? 1 : 0, urgentFilterOnly ? 1 : 0, selectedTags.length].reduce((a, b) => a + b, 0)}
                </span>
              )}
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                {filtersCollapsed ? '▼' : '▲'}
              </span>
            </button>
          </div>

          {/* Collapsible filters section */}
          {!filtersCollapsed && (
          <div
            style={{
              overflow: 'hidden',
            }}
          >
            {/* Status + Hitno chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginBottom: '0.75rem' }}>
            <button
              type="button"
              onClick={() => setStatusChip('all')}
              style={{
                padding: '0.25rem 0.5rem',
                borderRadius: '9999px',
                fontSize: '0.75rem',
                fontWeight: 500,
                border: '1px solid var(--border-color)',
                backgroundColor: statusChip === 'all' ? 'var(--bg-primary)' : 'var(--bg-card)',
                color: statusChip === 'all' ? 'var(--text-primary)' : 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              Sve
            </button>
            <button
              type="button"
              onClick={() => setStatusChip('open')}
              style={{
                padding: '0.25rem 0.5rem',
                borderRadius: '9999px',
                fontSize: '0.75rem',
                fontWeight: 500,
                border: '1px solid var(--border-color)',
                backgroundColor: statusChip === 'open' ? '#fef3c7' : 'var(--bg-card)',
                color: statusChip === 'open' ? '#92400e' : 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              Otvoreno
            </button>
            <button
              type="button"
              onClick={() => setStatusChip('resolved')}
              style={{
                padding: '0.25rem 0.5rem',
                borderRadius: '9999px',
                fontSize: '0.75rem',
                fontWeight: 500,
                border: '1px solid var(--border-color)',
                backgroundColor: statusChip === 'resolved' ? 'var(--bg-primary)' : 'var(--bg-card)',
                color: statusChip === 'resolved' ? 'var(--text-primary)' : 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              Riješeno
            </button>
            <button
              type="button"
              onClick={() => setUrgentFilterOnly((prev) => !prev)}
              style={{
                padding: '0.25rem 0.5rem',
                borderRadius: '9999px',
                fontSize: '0.75rem',
                fontWeight: 500,
                border: '1px solid var(--border-color)',
                backgroundColor: urgentFilterOnly ? '#fee2e2' : 'var(--bg-card)',
                color: urgentFilterOnly ? '#991b1b' : 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              Hitno
            </button>
            <button
              type="button"
              onClick={() => setStatusChip('spam')}
              style={{
                padding: '0.25rem 0.5rem',
                borderRadius: '9999px',
                fontSize: '0.75rem',
                fontWeight: 500,
                border: '1px solid #f59e0b',
                backgroundColor: statusChip === 'spam' ? '#ffedd5' : '#fff7ed',
                color: statusChip === 'spam' ? '#9a3412' : '#b45309',
                cursor: 'pointer',
              }}
            >
              Spam
            </button>
          </div>

            {/* Legacy status dropdown - hidden, kept for compatibility */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              disabled
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid var(--border-color)',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
                backgroundColor: 'var(--bg-primary)',
                marginBottom: '0.75rem',
                cursor: 'not-allowed',
                opacity: 0.6,
                display: 'none',
              }}
              title="Status filter is display-only. All tickets are shown."
            >
              <option value="all">Sve (prikazuje se sve)</option>
            </select>

            {/* Tag filter */}
            {allTags.length > 0 && (
              <select
                value={selectedTags[0] ?? ''}
                onChange={(e) => {
                  const value = e.target.value;
                  setSelectedTags(value ? [value] : []);
                }}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid var(--border-color)',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                  backgroundColor: 'var(--bg-card)',
                  minHeight: '36px',
                  maxHeight: '36px',
                }}
              >
                <option value="">Sve kategorije</option>
                {allTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            )}
          </div>
          )}
        </div>

        {/* Conversation list */}
        <div className="inbox-list-scroll" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {conversationsLoading ? (
            <div
              style={{
                padding: '2rem',
                textAlign: 'center',
                color: 'var(--text-secondary)',
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
                {conversationsError === 'Inbox: 401' || conversationsError === 'Inbox: 403'
                  ? 'Neispravna autentikacija'
                  : 'Greška pri učitavanju inboxa'}
              </div>
              <button
                onClick={() => {
                  setConversationsLoading(true);
                  setConversationsError(null);
                  loadConversations();
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
          ) : (
            <div className="inbox-table-wrap">
              <DataTable
                columns={inboxColumns}
                data={filteredConversations}
                isLoading={conversationsLoading}
                emptyMessage="Nema ticketa u inboxu."
                onRowClick={(row) => {
                  handleOpenConversation(row.conversation_id);
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Right side - Conversation detail */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          height: isMobile ? (mobileView === 'detail' ? 'calc(100vh - 120px)' : '50vh') : '100%',
          backgroundColor: 'var(--bg-card)',
          borderRadius: '0.5rem',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
          display: isMobile && mobileView === 'list' && !selectedConversationId ? 'none' : 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          minHeight: 0,
        }}
      >
        {selectedConversationId && conversationDetail ? (
          <>
            {/* Header: title prominent, metadata secondary, status calm, controls reduced weight */}
            <div
              style={{
                padding: '0.5rem 0.75rem',
                borderBottom: '1px solid var(--border-color)',
                flexShrink: 0,
              }}
            >
              {/* Back button for mobile */}
              {isMobile && (
                <button
                  onClick={() => {
                    setMobileView('list');
                    // Keep selection so user can return to same conversation
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    marginBottom: '0.75rem',
                    padding: '0.5rem 0.75rem',
                    backgroundColor: 'transparent',
                    border: '1px solid var(--border-color)',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s, border-color 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--bg-primary)';
                    e.currentTarget.style.borderColor = 'var(--border-color)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.borderColor = 'var(--border-color)';
                  }}
                >
                  <span>←</span>
                  <span>Nazad na listu</span>
                </button>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <h2 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: '1.2', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                      {conversationDetail.conversation.title || (selectedTicket ? getConversationTitleFull(selectedTicket) : 'Razgovor')}
                    </h2>
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedConversationId) {
                          runAnalyzeTicket(selectedConversationId, true);
                        }
                      }}
                      disabled={!selectedConversationId || analysisLoadingId === selectedConversationId}
                      style={{
                        padding: '0.2rem 0.55rem',
                        borderRadius: '0.35rem',
                        border: '1px solid var(--border-color)',
                        backgroundColor: 'var(--bg-primary)',
                        color: 'var(--text-secondary)',
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        cursor: !selectedConversationId || analysisLoadingId === selectedConversationId ? 'not-allowed' : 'pointer',
                        opacity: !selectedConversationId || analysisLoadingId === selectedConversationId ? 0.75 : 1,
                      }}
                    >
                      {analysisLoadingId === selectedConversationId ? 'Analiza...' : 'Analiziraj'}
                    </button>
                  </div>
                  <div style={{ fontSize: '0.6875rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.5rem', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                    <span>ID: {conversationDetail.conversation.id.substring(0, 8)}...</span>
                    {selectedTicket?.ticket_ref && <span>Ref: {selectedTicket.ticket_ref}</span>}
                  </div>
                </div>
                <span
                  style={{
                    padding: '0.25rem 0.5rem',
                    borderRadius: '9999px',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    flexShrink: 0,
                    ...getStatusBadgeStyle(conversationDetail.conversation.status),
                  }}
                >
                  {getStatusLabel(conversationDetail.conversation.status)}
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'nowrap', gap: '0.375rem', alignItems: 'center', fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <span>Status:</span>
                  <select
                    value={workflowStatus}
                    onChange={(e) => {
                      const v = e.target.value as WorkflowStatus;
                      handleStatusChange(v);
                    }}
                    style={{
                      padding: '0.2rem 0.4rem',
                      border: '1px solid var(--border-color)',
                      borderRadius: '0.25rem',
                      fontSize: '0.75rem',
                      backgroundColor: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="open">Otvoreno</option>
                    <option value="resolved">Riješeno</option>
                    <option value="closed">Zatvoreno</option>
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <span>Odjel:</span>
                  <select
                    value={workflowDepartment}
                    onChange={(e) => {
                      const v = e.target.value;
                      const departmentValue = v.trim() || null;
                      setWorkflowDepartment(v);
                      if (initialConversationRef.current) {
                        initialConversationRef.current = { ...initialConversationRef.current, department: departmentValue };
                      }
                      autosave({ department: departmentValue });
                    }}
                    style={{
                      padding: '0.2rem 0.4rem',
                      border: '1px solid var(--border-color)',
                      borderRadius: '0.25rem',
                      fontSize: '0.75rem',
                      backgroundColor: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="">--</option>
                    {DEPARTMENT_OPTIONS.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Hitno</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={workflowUrgent}
                    onClick={() => {
                      const next = !workflowUrgent;
                      setWorkflowUrgent(next);
                      if (initialConversationRef.current) {
                        initialConversationRef.current = { ...initialConversationRef.current, urgent: next };
                      }
                      autosave({ urgent: next });
                    }}
                    style={{
                      position: 'relative',
                      width: '2.25rem',
                      height: '1.25rem',
                      borderRadius: '9999px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: workflowUrgent ? '#dc2626' : 'var(--bg-primary)',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        top: '2px',
                        left: workflowUrgent ? 'calc(100% - 1rem)' : '2px',
                        width: '0.875rem',
                        height: '0.875rem',
                        borderRadius: '50%',
                        backgroundColor: 'var(--bg-card)',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                        transition: 'left 0.15s ease',
                      }}
                    />
                  </button>
                </div>
                {saveStatus === 'saving' && <span style={{ fontStyle: 'italic' }}>Saving…</span>}
                {saveStatus === 'saved' && <span style={{ color: '#10b981', fontWeight: 500 }}>Saved</span>}
                {saveError && <span style={{ color: '#dc2626', fontSize: '0.75rem' }}>{saveError}</span>}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.35rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                <span>
                  {selectedTicket?.closed_at
                    ? `Zatvoreno za: ${formatOpenDuration(selectedTicket.time_open_hours)}`
                    : `Otvoreno: ${formatOpenDuration(selectedTicket?.time_open_hours)}`}
                </span>
                <span>AI kategorija: {selectedTicket?.ai_category ?? '—'}</span>
                {selectedTicket?.closed_at && <span>Zatvoreno: {formatClosedAtDisplay(selectedTicket.closed_at)}</span>}
              </div>
            </div>

            {selectedConversationId && analysisByConversationId[selectedConversationId] && (
              <div
                style={{
                  margin: '0.75rem 1rem 0',
                  padding: '0.75rem',
                  border: '1px solid var(--border-color)',
                  borderRadius: '0.5rem',
                  backgroundColor: 'var(--bg-primary)',
                }}
              >
                <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                  AI kategorija: {analysisByConversationId[selectedConversationId].ai_category ?? '—'}
                </div>
                {(analysisByConversationId[selectedConversationId].is_suspicious ||
                  analysisByConversationId[selectedConversationId].spam_score >= 70) ? (
                  <div
                    style={{
                      padding: '0.65rem',
                      borderRadius: '0.5rem',
                      backgroundColor: '#fef3c7',
                      border: '1px solid #f59e0b',
                      color: '#92400e',
                    }}
                  >
                    <div style={{ fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                      ⚠️ Sumnjiv tiket — spam score: {analysisByConversationId[selectedConversationId].spam_score}/100
                    </div>
                    {analysisByConversationId[selectedConversationId].spam_reasons.length > 0 && (
                      <ul style={{ margin: '0 0 0.5rem 1rem', padding: 0 }}>
                        {analysisByConversationId[selectedConversationId].spam_reasons.map((reason, idx) => (
                          <li key={`${selectedConversationId}-reason-${idx}`} style={{ fontSize: '0.8125rem', marginBottom: '0.15rem' }}>
                            {reason}
                          </li>
                        ))}
                      </ul>
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        if (!selectedConversationId) return;
                        const spamFlaggedAt = new Date().toISOString();
                        try {
                          await patchTicketFields(selectedConversationId, { status: 'spam', spam_flagged_at: spamFlaggedAt });
                          updateTicketLocally(selectedConversationId, { status: 'spam', spam_flagged_at: spamFlaggedAt });
                          setConversationDetail((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  conversation: {
                                    ...prev.conversation,
                                    status: 'spam',
                                  },
                                }
                              : prev
                          );
                          setStatusChip('spam');
                        } catch (err) {
                          console.error('Move to spam failed:', err);
                        }
                      }}
                      style={{
                        padding: '0.35rem 0.65rem',
                        borderRadius: '0.35rem',
                        border: '1px solid #dc2626',
                        backgroundColor: '#fee2e2',
                        color: '#991b1b',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Premjesti u spam
                    </button>
                  </div>
                ) : (
                  <div
                    style={{
                      padding: '0.65rem',
                      borderRadius: '0.5rem',
                      backgroundColor: '#dcfce7',
                      border: '1px solid #4ade80',
                      color: '#166534',
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                    }}
                  >
                    ✓ Tiket izgleda legitimno
                  </div>
                )}
              </div>
            )}

            {/* Transcript - flex-grow with own scroll */}
            <div
              ref={transcriptRef}
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '0.75rem 1rem',
                paddingBottom: '0.75rem',
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
              }}
            >
              {/* Podaci iz prijave card - shown when ticket_intake exists */}
              {!detailLoading && !detailError && conversationDetail?.ticket_intake && (
                <div
                  style={{
                    marginBottom: '1.5rem',
                    padding: '1rem',
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '0.5rem',
                  }}
                >
                  <div
                    style={{
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      marginBottom: '0.75rem',
                    }}
                  >
                    Podaci iz prijave
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem',
                      fontSize: '0.8125rem',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 500 }}>Ime:</span> {conversationDetail.ticket_intake.name}
                    </div>
                    {conversationDetail.ticket_intake.phone && (
                      <div>
                        <span style={{ fontWeight: 500 }}>Telefon:</span> {conversationDetail.ticket_intake.phone}
                      </div>
                    )}
                    {conversationDetail.ticket_intake.email && (
                      <div>
                        <span style={{ fontWeight: 500 }}>Email:</span> {conversationDetail.ticket_intake.email}
                      </div>
                    )}
                    <div style={{ marginTop: '0.25rem' }}>
                      <div style={{ fontWeight: 500, marginBottom: '0.25rem' }}>Opis:</div>
                      <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {conversationDetail.ticket_intake.description}
                      </div>
                    </div>
                    <div style={{ marginTop: '0.5rem' }}>
                      <span style={{ fontWeight: 500 }}>Napomena:</span>
                      <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: '0.25rem' }}>
                        {conversationDetail.ticket?.contact_note?.trim() ? conversationDetail.ticket.contact_note : '—'}
                      </div>
                    </div>
                    <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      <div>
                        Predano: {formatDateTime(conversationDetail.ticket_intake.submitted_at)}
                      </div>
                      {conversationDetail.ticket_intake.consent_at && (
                        <div>
                          Pristanak zabilježen: {formatDateTime(conversationDetail.ticket_intake.consent_at)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {detailLoading ? (
                <div
                  style={{
                    padding: '2rem',
                    textAlign: 'center',
                    color: 'var(--text-secondary)',
                    fontSize: '0.875rem',
                  }}
                >
                  Učitavanje...
                </div>
              ) : detailError ? (
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
                    {detailError === 'Conversation detail: 401' || detailError === 'Conversation detail: 403'
                      ? 'Neispravna autentikacija'
                      : 'Greška pri učitavanju detalja'}
                  </div>
                  <button
                    onClick={() => {
                      if (selectedConversationId) {
                        loadConversationDetail(selectedConversationId);
                      }
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
              ) : timelineItems.length === 0 ? (
                <div
                  style={{
                    padding: '2rem',
                    textAlign: 'center',
                    color: 'var(--text-secondary)',
                    fontSize: '0.875rem',
                  }}
                >
                  Nema poruka u ovom razgovoru
                </div>
              ) : (
                timelineItems.map((item) => {
                  if (item.type === 'message') {
                    return (
                      <div
                        key={item.id}
                        style={{
                          marginBottom: '1.25rem',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: item.role === 'user' ? 'flex-start' : 'flex-end',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '0.6875rem',
                            color: 'var(--text-secondary)',
                            marginBottom: '0.25rem',
                            paddingLeft: item.role === 'user' ? '0.25rem' : 0,
                            paddingRight: item.role === 'user' ? 0 : '0.25rem',
                            alignSelf: item.role === 'user' ? 'flex-start' : 'flex-end',
                          }}
                        >
                          {item.role === 'user' ? 'Građanin' : 'Asistent'}
                        </span>
                        <div
                          style={{
                            maxWidth: '75%',
                            padding: '0.875rem 1.125rem',
                            borderRadius: '1rem',
                            backgroundColor: item.role === 'user' ? 'rgba(16, 185, 129, 0.1)' : 'var(--bg-primary)',
                            color: item.role === 'user' ? '#0c4a6e' : 'var(--text-primary)',
                            border: item.role === 'assistant' ? '1px solid var(--border-color)' : 'none',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                            lineHeight: 1.55,
                          }}
                        >
                          <div style={{ fontSize: '0.9375rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {item.content || '(prazna poruka)'}
                          </div>
                        </div>
                        <span
                          style={{
                            fontSize: '0.6875rem',
                            color: 'var(--text-secondary)',
                            marginTop: '0.25rem',
                            paddingLeft: item.role === 'user' ? '0.25rem' : 0,
                            paddingRight: item.role === 'user' ? 0 : '0.25rem',
                            alignSelf: item.role === 'user' ? 'flex-start' : 'flex-end',
                          }}
                        >
                          {formatMessageTime(item.created_at)}
                        </span>
                      </div>
                    );
                  }
                  if (item.type === 'ticket' && conversationDetail?.ticket) {
                    const t = conversationDetail.ticket;
                    const noteOneLine = t.contact_note?.replace(/\s+/g, ' ').trim();
                    const notePreview = noteOneLine ? noteOneLine.slice(0, 60) + (noteOneLine.length > 60 ? '…' : '') : null;
                    const locPreview = t.contact_location?.trim() || null;
                    return (
                      <div
                        key={item.id}
                        style={{
                          marginBottom: '1.5rem',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'flex-start',
                        }}
                      >
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setTicketModalOpen(true)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setTicketModalOpen(true); } }}
                          style={{
                            width: '100%',
                            maxWidth: '420px',
                            padding: '0.875rem 1.125rem',
                            backgroundColor: 'rgba(16, 185, 129, 0.1)',
                            border: '1px solid #a7f3d0',
                            borderRadius: '0.75rem',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#065f46', marginBottom: '0.5rem' }}>
                            Poslana prijava
                          </div>
                          <div style={{ fontSize: '0.8125rem', color: '#047857', marginBottom: '0.25rem' }}>
                            {t.ticket_ref ? `Ref: ${t.ticket_ref}` : '—'}
                          </div>
                          {notePreview && (
                            <div style={{ fontSize: '0.8125rem', color: 'var(--text-primary)', marginBottom: '0.25rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {notePreview}
                            </div>
                          )}
                          {locPreview && (
                            <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>{locPreview}</div>
                          )}
                          <div style={{ fontSize: '0.75rem', color: '#059669', marginTop: '0.5rem', fontWeight: 500 }}>
                            Klikni za detalje
                          </div>
                        </div>
                        <span style={{ fontSize: '0.6875rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                          {formatMessageTime(item.created_at)}
                        </span>
                      </div>
                    );
                  }
                  if (item.type === 'note' && item.note != null && String(item.note).trim().length > 0) {
                    return (
                      <div
                        key={item.id}
                        style={{
                          marginBottom: '1.5rem',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'flex-start',
                        }}
                      >
                        <div
                          style={{
                            width: '100%',
                            maxWidth: '720px',
                            padding: '0.75rem 1rem',
                            backgroundColor: 'rgba(234, 179, 8, 0.1)',
                            border: '1px solid #fde047',
                            borderRadius: '0.5rem',
                            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                          }}
                        >
                          <div
                            style={{
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              color: '#78350f',
                              marginBottom: '0.5rem',
                              textTransform: 'uppercase',
                            }}
                          >
                            Interna napomena
                          </div>
                          <div style={{ fontSize: '0.875rem', lineHeight: 1.6, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
                            {item.note}
                          </div>
                          <div
                            style={{
                              fontSize: '0.75rem',
                              color: '#78350f',
                              marginTop: '0.5rem',
                            }}
                          >
                            {formatMessageTime(item.created_at)}
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })
              )}
            </div>

            {/* Note composer - sticky bottom, compact */}
            <div
              style={{
                padding: '0.75rem',
                borderTop: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-card)',
                flexShrink: 0,
              }}
            >
              <div>
                <textarea
                  ref={noteInputRef}
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      handleAddNote();
                    }
                  }}
                  placeholder="Interna napomena..."
                  disabled={isAddingNote}
                  rows={2}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '0.5rem',
                    border: '1px solid var(--border-color)',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                    fontFamily: 'inherit',
                    resize: 'none',
                    marginBottom: '0.5rem',
                  }}
                />
                <button
                  onClick={handleAddNote}
                  disabled={!noteText.trim() || isAddingNote}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: !noteText.trim() || isAddingNote ? '#9ca3af' : '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    cursor: !noteText.trim() || isAddingNote ? 'not-allowed' : 'pointer',
                    marginTop: '0.5rem',
                  }}
                >
                  {isAddingNote ? 'Dodavanje...' : 'Dodaj napomenu'}
                </button>
              </div>
            </div>

            {/* Ticket details modal (read-only) */}
            {ticketModalOpen && conversationDetail?.ticket && (() => {
              const t = conversationDetail.ticket;
              const row = (label: string, value: string | null | undefined) => (
                <div key={label} style={{ marginBottom: '0.75rem' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>{label}</div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{value?.trim() || '—'}</div>
                </div>
              );
              return (
                <div
                  style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 10000,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'rgba(0,0,0,0.4)',
                  }}
                  onClick={() => setTicketModalOpen(false)}
                >
                  <div
                    style={{
                      backgroundColor: 'var(--bg-card)',
                      borderRadius: '0.5rem',
                      boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
                      maxWidth: '480px',
                      width: '90%',
                      maxHeight: '90vh',
                      overflowY: 'auto',
                      padding: '1.5rem',
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                      <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, color: 'var(--text-primary)' }}>Detalji prijave</h3>
                      <button
                        type="button"
                        onClick={() => setTicketModalOpen(false)}
                        style={{
                          padding: '0.25rem',
                          border: 'none',
                          background: 'none',
                          cursor: 'pointer',
                          fontSize: '1.25rem',
                          color: 'var(--text-secondary)',
                          lineHeight: 1,
                        }}
                        aria-label="Zatvori"
                      >
                        ×
                      </button>
                    </div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                      {row('Ref', t.ticket_ref)}
                      {row('Status', t.status)}
                      {row('Odjel', t.department)}
                      {row('Hitno', t.urgent ? 'Da' : 'Ne')}
                      {row('Ime', t.contact_name)}
                      {row('Telefon', t.contact_phone)}
                      {row('Email', t.contact_email)}
                      {row('Lokacija', t.contact_location)}
                      {row('Napomena', t.contact_note)}
                      {row('Pristanak zabilježen', t.consent_at ? formatDateTime(t.consent_at) : null)}
                    </div>
                  </div>
                </div>
              );
            })()}
          </>
        ) : (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-secondary)',
              fontSize: '0.875rem',
            }}
          >
            Odaberite razgovor za prikaz detalja
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
