// Use /api proxy for same-origin requests (avoids cross-site cookie issues in incognito)
// In production, Vercel rewrites /api/* to https://asistent-api-nine.vercel.app/*
// In development, fallback to localhost
const BASE = import.meta.env.PROD 
  ? '/api' 
  : ((import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE_URL || 'http://localhost:3000');

const defaultOpts: RequestInit = { credentials: 'include' };

export interface AdminLoginParams {
  cityCode: string;
  password: string;
  role: 'admin' | 'inbox';
}

/**
 * POST /admin/login — authenticate and set session cookie.
 */
export async function adminLogin({ cityCode, password, role }: AdminLoginParams): Promise<boolean> {
  const res = await fetch(`${BASE}/admin/login`, {
    ...defaultOpts,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cityCode, password, role }),
  });
  if (!res.ok) return false;
  const data = await res.json().catch(() => ({}));
  return Boolean(data?.success);
}

/** API conversation item (GET /admin/:cityCode/conversations) */
export interface ApiConversation {
  conversationUuid: string;
  externalConversationId: string | null;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  lastActivityAt: string | null;
  category: string | null;
  needsHuman: boolean;
  status: string | null;
  fallbackCount: number;
  messageCount: number;
  firstUserMessage: string | null;
  title: string | null;
  summary: string | null;
}

/** API inbox item (GET /admin/:cityCode/inbox) - based on tickets table */
export interface ApiInboxItem {
  conversation_id: string;
  status: string | null;
  department: string | null;
  urgent: boolean;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  contact_location: string | null;
  contact_note: string | null;
  consent_at: string | null;
  ticket_ref: string | null;
  created_at: string;
  updated_at: string;
  // Display fields from conversations (for UI compatibility)
  title: string | null;
  summary: string | null;
  category: string | null;
  submitted_at: string | null;
  last_activity_at: string | null;
  first_user_message: string | null;
}

/**
 * GET /admin/:cityCode/inbox — list tickets from tickets table (single source of truth).
 */
export async function fetchInbox(cityCode: string): Promise<ApiInboxItem[]> {
  const res = await fetch(`${BASE}/admin/${encodeURIComponent(cityCode)}/inbox`, {
    ...defaultOpts,
    method: 'GET',
  });
  if (!res.ok) throw new Error(`Inbox: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/**
 * GET /admin/:cityCode/conversations — list conversations where needs_human = false for city.
 */
export async function fetchConversations(cityCode: string): Promise<ApiConversation[]> {
  const res = await fetch(`${BASE}/admin/${encodeURIComponent(cityCode)}/conversations`, {
    ...defaultOpts,
    method: 'GET',
  });
  if (!res.ok) throw new Error(`Conversations: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/** API message item (GET .../messages) */
export interface ApiMessage {
  id: string;
  role: string;
  content_redacted: string | null;
  created_at: string;
  external_id: string | null;
}

/**
 * GET /admin/:cityCode/conversations/:conversationUuid/messages — messages for a conversation.
 */
export async function fetchMessages(
  cityCode: string,
  conversationUuid: string
): Promise<ApiMessage[]> {
  const res = await fetch(
    `${BASE}/admin/${encodeURIComponent(cityCode)}/conversations/${encodeURIComponent(conversationUuid)}/messages`,
    { ...defaultOpts, method: 'GET' }
  );
  if (!res.ok) throw new Error(`Messages: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/** API ticket item (GET /admin/:cityCode/tickets) */
export interface ApiTicket {
  conversationUuid: string;
  external_id: string | null;
  created_at: string;
  updated_at: string;
  category: string | null;
  fallback_count: number;
  needs_human: boolean;
  status: string | null;
  issue_preview: string | null;
  contact_email: string | null;
  contact_phone: string | null;
}

export interface PatchTicketBody {
  status?: 'open' | 'in_progress' | 'resolved';
  department?: string | null;
  urgent?: boolean;
  internal_note?: string | null;
}

/**
 * GET /admin/:cityCode/tickets — list tickets for city.
 */
export async function fetchTickets(cityCode: string): Promise<ApiTicket[]> {
  const res = await fetch(`${BASE}/admin/${encodeURIComponent(cityCode)}/tickets`, {
    ...defaultOpts,
    method: 'GET',
  });
  if (!res.ok) throw new Error(`Tickets: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/**
 * PATCH /admin/:cityCode/tickets/:conversationUuid — update ticket workflow fields.
 */
export async function patchTicket(
  cityCode: string,
  conversationUuid: string,
  body: PatchTicketBody
): Promise<void> {
  const res = await fetch(
    `${BASE}/admin/${encodeURIComponent(cityCode)}/tickets/${encodeURIComponent(conversationUuid)}`,
    {
      ...defaultOpts,
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) throw new Error(`Patch ticket: ${res.status}`);
}

/** API reports response (GET /admin/:cityCode/reports) */
export interface ApiReports {
  questions24h: number;
  questions7d: number;
  questions30d: number;
  uniqueSessions7d: number;
  fallbackRate: number;
  fallbackCount: number;
  avgLatency: number | null;
  questionsByDay: Array<{ date: string; count: number }>;
  topCategories: Array<{ category: string; count: number }>;
}

/**
 * GET /admin/:cityCode/reports — get dashboard metrics.
 */
export async function fetchReports(cityCode: string): Promise<ApiReports> {
  const res = await fetch(`${BASE}/admin/${encodeURIComponent(cityCode)}/reports`, {
    ...defaultOpts,
    method: 'GET',
  });
  if (!res.ok) throw new Error(`Reports: ${res.status}`);
  const data = await res.json();
  return data;
}

/** API conversation detail (GET /admin/:cityCode/conversations/:conversationUuid) */
export interface ApiConversationDetail {
  conversation: {
    id: string;
    submitted_at: string | null;
    last_activity_at: string | null;
    needs_human: boolean;
    status: string | null;
    department: string | null;
    urgent: boolean;
    category: string | null;
    tags: string[];
    created_at: string;
    updated_at: string;
    title: string | null;
    summary: string | null;
  };
  messages: Array<{
    id: string;
    role: string;
    content_redacted: string | null;
    created_at: string;
    external_id: string | null;
    metadata: unknown | null;
  }>;
  notes: Array<{
    id: string;
    note: string;
    created_at: string;
  }>;
  ticket_intake: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    description: string;
    consent_given: boolean;
    consent_text: string;
    consent_timestamp: string;
    submitted_at: string;
    consent_at: string | null;
    created_at: string;
  } | null;
  /** Full ticket from tickets table (for "Ticket submitted" card and modal). Present when conversation has a ticket. */
  ticket?: {
    ticket_ref: string | null;
    status: string | null;
    department: string | null;
    urgent: boolean;
    contact_name: string | null;
    contact_phone: string | null;
    contact_email: string | null;
    contact_location: string | null;
    contact_note: string | null;
    consent_at: string | null;
  };
}

/**
 * GET /admin/:cityCode/conversations/:conversationUuid — get conversation detail with messages and notes.
 */
export async function fetchConversationDetail(
  cityCode: string,
  conversationUuid: string
): Promise<ApiConversationDetail> {
  const res = await fetch(
    `${BASE}/admin/${encodeURIComponent(cityCode)}/conversations/${encodeURIComponent(conversationUuid)}`,
    { ...defaultOpts, method: 'GET' }
  );
  if (!res.ok) throw new Error(`Conversation detail: ${res.status}`);
  return await res.json();
}

export interface PostNoteBody {
  note: string;
}

/**
 * POST /admin/:cityCode/conversations/:conversationUuid/notes — add an admin note.
 */
export async function postConversationNote(
  cityCode: string,
  conversationUuid: string,
  body: PostNoteBody
): Promise<{ id: string; note: string; created_at: string }> {
  const res = await fetch(
    `${BASE}/admin/${encodeURIComponent(cityCode)}/conversations/${encodeURIComponent(conversationUuid)}/notes`,
    {
      ...defaultOpts,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) throw new Error(`Post note: ${res.status}`);
  return await res.json();
}

export interface PatchConversationBody {
  status?: 'open' | 'in_progress' | 'resolved';
  department?: string | null;
  urgent?: boolean;
  needs_human?: boolean;
}

export interface PatchConversationResponse {
  id: string;
  external_id: string | null;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  last_activity_at: string | null;
  category: string | null;
  needs_human: boolean;
  status: string | null;
  fallback_count: number;
  department: string | null;
  urgent: boolean;
}

/**
 * PATCH /admin/:cityCode/conversations/:conversationUuid — update conversation fields (autosave).
 * Returns updated conversation row.
 */
export async function patchConversation(
  cityCode: string,
  conversationUuid: string,
  body: PatchConversationBody
): Promise<PatchConversationResponse> {
  const url = `${BASE}/admin/${encodeURIComponent(cityCode)}/conversations/${encodeURIComponent(conversationUuid)}`;
  const res = await fetch(url, {
    ...defaultOpts,
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Patch conversation: ${res.status}`);
  return await res.json();
}

/** Dashboard summary response (GET /admin/dashboard/summary) */
export interface DashboardSummary {
  range: '24h' | '7d' | '30d';
  kpis: {
    conversations_total: number;
    tickets_total: number;
    tickets_open: number;
    resolved_by_ai_pct: number;
    avg_response_ms: number | null;
    knowledge_gaps_total: number;
  };
  top_questions: Array<{
    question: string;
    count: number;
    last_seen_at: string;
  }>;
  knowledge_gaps: Array<{
    id: string;
    question: string;
    count: number;
    status: string;
    last_seen_at: string;
    reason: string | null;
  }>;
  charts: {
    questions_per_day: Array<{ date: string; count: number }>;
    top_categories: Array<{ category: string; count: number }>;
  };
  tickets_preview: Array<{
    id: string;
    status: string;
    reason: string;
    created_at: string;
    question: string;
    confidence: number | null;
  }>;
}

/**
 * GET /admin/dashboard/summary — get dashboard summary with filters.
 */
export async function fetchDashboardSummary(
  cityCode: string,
  params?: { range?: '24h' | '7d' | '30d'; category?: string; search?: string }
): Promise<DashboardSummary> {
  const queryParams = new URLSearchParams();
  if (params?.range) queryParams.set('range', params.range);
  if (params?.category && params.category !== 'All' && params.category !== 'all') {
    queryParams.set('category', params.category);
  }
  if (params?.search) queryParams.set('search', params.search);

  const queryString = queryParams.toString();
  const url = `${BASE}/admin/dashboard/summary${queryString ? `?${queryString}` : ''}`;

  const res = await fetch(url, {
    ...defaultOpts,
    method: 'GET',
  });
  if (!res.ok) throw new Error(`Dashboard summary: ${res.status}`);
  return await res.json();
}

/** Question examples response (GET /admin/questions/examples) */
export interface QuestionExamples {
  question: string;
  examples: Array<{
    content: string;
    created_at: string;
    conversation_id: string;
  }>;
}

/**
 * GET /admin/questions/examples — get example questions for a normalized question.
 */
export async function fetchQuestionExamples(
  params?: { question?: string; range?: '24h' | '7d' | '30d' }
): Promise<QuestionExamples> {
  const queryParams = new URLSearchParams();
  if (params?.question) queryParams.set('question', params.question);
  if (params?.range) queryParams.set('range', params.range);

  const queryString = queryParams.toString();
  const url = `${BASE}/admin/questions/examples${queryString ? `?${queryString}` : ''}`;

  const res = await fetch(url, {
    ...defaultOpts,
    method: 'GET',
  });
  if (!res.ok) throw new Error(`Question examples: ${res.status}`);
  return await res.json();
}

/** Knowledge gap detail response (GET /admin/knowledge-gaps/:id) */
export interface KnowledgeGapDetail {
  id: string;
  question: string;
  occurrences: number;
  status: string;
  last_seen_at: string;
  reason: string | null;
  examples: Array<{
    content: string;
    created_at: string;
    conversation_id: string;
  }>;
}

/**
 * GET /admin/knowledge-gaps/:id — get knowledge gap detail.
 */
export async function fetchKnowledgeGapDetail(id: string): Promise<KnowledgeGapDetail> {
  const res = await fetch(`${BASE}/admin/knowledge-gaps/${encodeURIComponent(id)}`, {
    ...defaultOpts,
    method: 'GET',
  });
  if (!res.ok) throw new Error(`Knowledge gap detail: ${res.status}`);
  return await res.json();
}

/**
 * GET /admin/tickets/:id — get ticket detail (reuses conversation detail endpoint).
 */
export async function fetchTicketDetail(
  cityCode: string,
  ticketId: string
): Promise<ApiConversationDetail> {
  return fetchConversationDetail(cityCode, ticketId);
}
