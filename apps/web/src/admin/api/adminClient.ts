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
  role?: 'admin' | 'inbox' | 'conversations' | 'forms' | 'readonly' | 'superadmin';
}

export type AdminRole = 'admin' | 'inbox' | 'conversations' | 'forms' | 'readonly' | 'superadmin';

export interface AdminLoginResponse {
  success: boolean;
  role: AdminRole;
  userName: string;
  userId?: string;
}

/**
 * POST /admin/login — authenticate and set session cookie.
 */
export async function adminLogin({
  cityCode,
  password,
  role = 'admin',
}: AdminLoginParams): Promise<AdminLoginResponse | null> {
  const res = await fetch(`${BASE}/admin/login`, {
    ...defaultOpts,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cityCode, password, role }),
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => ({}));
  if (!data?.role) {
    return null;
  }
  return {
    success: true,
    role: data.role as AdminRole,
    userName: String(data.userName ?? ''),
    userId: data.userId ? String(data.userId) : undefined,
  };
}

export interface AdminUser {
  id: string;
  name: string;
  role: Exclude<AdminRole, 'superadmin'>;
  created_at: string;
}

export async function fetchAdminUsers(cityCode: string): Promise<AdminUser[]> {
  const res = await fetch(`${BASE}/admin/${encodeURIComponent(cityCode)}/users`, {
    ...defaultOpts,
    method: 'GET',
  });
  if (!res.ok) throw new Error(`Users: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function createAdminUser(
  cityCode: string,
  body: { name: string; password: string; role: Exclude<AdminRole, 'superadmin'> }
): Promise<AdminUser> {
  const res = await fetch(`${BASE}/admin/${encodeURIComponent(cityCode)}/users`, {
    ...defaultOpts,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Create user: ${res.status}`);
  return await res.json();
}

export async function deleteAdminUser(cityCode: string, userId: string): Promise<void> {
  const res = await fetch(`${BASE}/admin/${encodeURIComponent(cityCode)}/users/${encodeURIComponent(userId)}`, {
    ...defaultOpts,
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Delete user: ${res.status}`);
}

export interface SuperadminCityUser {
  id: string;
  name: string;
  role: Exclude<AdminRole, 'superadmin'>;
  city_id: string;
  created_at: string;
}

export interface SuperadminCity {
  id: string;
  name: string;
  slug: string;
  userCount: number;
  city_users: SuperadminCityUser[];
}

export async function fetchSuperadminCities(): Promise<SuperadminCity[]> {
  const res = await fetch(`${BASE}/superadmin/cities`, {
    ...defaultOpts,
    method: 'GET',
  });
  if (!res.ok) throw new Error(`Superadmin cities: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
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
  question?: string | null;
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
  const res = await fetch(`${BASE}/admin/tickets`, {
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
    content: string | null;
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
  conversationUuid: string
): Promise<ApiConversationDetail> {
  const res = await fetch(
    `${BASE}/admin/tickets/${encodeURIComponent(conversationUuid)}`,
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
  const payload: Record<string, unknown> = {
    ...(body.status !== undefined ? { status: body.status } : {}),
    ...(body.urgent !== undefined ? { is_urgent: body.urgent } : {}),
    ...(body.department !== undefined ? { department_id: body.department } : {}),
  };
  const url = `${BASE}/admin/tickets/${encodeURIComponent(conversationUuid)}`;
  const res = await fetch(url, {
    ...defaultOpts,
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
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
    category?: string | null;
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

export interface SentimentByCategory {
  category: string;
  positive: number;
  neutral: number;
  negative: number;
  total: number;
}

export interface SentimentTrendPoint {
  week: string;
  positive: number;
  neutral: number;
  negative: number;
  avgScore: number;
}

export interface SentimentStats {
  byCategory: SentimentByCategory[];
  trend: SentimentTrendPoint[];
  overall: {
    positive: number;
    neutral: number;
    negative: number;
    avgScore: number;
  };
}

/**
 * GET /admin/dashboard/summary — get dashboard summary with filters.
 */
export async function fetchDashboardSummary(
  _cityCode: string,
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

/**
 * GET /admin/sentiment/stats — sentiment breakdown and trend.
 */
export async function getSentimentStats(days: number): Promise<SentimentStats> {
  const query = new URLSearchParams();
  query.set('days', String(days));
  const res = await fetch(`${BASE}/admin/sentiment/stats?${query.toString()}`, {
    ...defaultOpts,
    method: 'GET',
  });
  if (!res.ok) throw new Error(`Sentiment stats: ${res.status}`);
  return await res.json();
}

/**
 * POST /admin/sentiment/backfill — classify existing summaries.
 */
export async function triggerBackfill(): Promise<{ processed: number; failed: number }> {
  const res = await fetch(`${BASE}/admin/sentiment/backfill`, {
    ...defaultOpts,
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Sentiment backfill: ${res.status}`);
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
  count?: number;
  occurrences?: number;
  status: string;
  last_seen_at: string;
  first_seen_at?: string;
  reason: string | null;
  examples: Array<{
    question?: string;
    content?: string;
    created_at: string;
    conversation_id: string;
  }>;
}

export interface KnowledgeGapListItem {
  id: string;
  question: string;
  count: number;
  status: string;
  last_seen_at: string;
  reason: string | null;
  category: string | null;
}

export interface KnowledgeGapSuggestion {
  category: string;
  count: number;
  suggestion: string;
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
 * GET /admin/knowledge-gaps — list knowledge gaps for selected range.
 */
export async function fetchKnowledgeGaps(
  params?: { range?: '7d' | '30d' | '365d' }
): Promise<KnowledgeGapListItem[]> {
  const queryParams = new URLSearchParams();
  if (params?.range) queryParams.set('range', params.range);
  const queryString = queryParams.toString();

  const res = await fetch(`${BASE}/admin/knowledge-gaps${queryString ? `?${queryString}` : ''}`, {
    ...defaultOpts,
    method: 'GET',
  });
  if (!res.ok) throw new Error(`Knowledge gaps: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? (data as KnowledgeGapListItem[]) : [];
}

/**
 * GET /admin/knowledge-gaps/suggestions — list AI suggestions by category.
 */
export async function fetchKnowledgeGapSuggestions(): Promise<KnowledgeGapSuggestion[]> {
  const res = await fetch(`${BASE}/admin/knowledge-gaps/suggestions`, {
    ...defaultOpts,
    method: 'GET',
  });
  if (!res.ok) throw new Error(`Knowledge gap suggestions: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? (data as KnowledgeGapSuggestion[]) : [];
}

/**
 * POST /admin/knowledge-gaps/categorize — trigger AI categorization job.
 */
export async function categorizeKnowledgeGaps(): Promise<{ categorized: number; message?: string }> {
  const res = await fetch(`${BASE}/admin/knowledge-gaps/categorize`, {
    ...defaultOpts,
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Knowledge gaps categorize: ${res.status}`);
  return await res.json();
}

/**
 * GET /admin/tickets/:id — get ticket detail (reuses conversation detail endpoint).
 */
export async function fetchTicketDetail(
  cityCode: string,
  ticketId: string
): Promise<ApiConversationDetail> {
  return fetchConversationDetail(ticketId);
}

/** API form request item (GET /admin/forms) */
export interface ApiFormRequest {
  reference_number: string;
  type: string;
  status: string | null;
  created_at: string;
}

/**
 * GET /admin/forms — list form requests (reference_number, type, status, created_at).
 */
export async function fetchAdminForms(): Promise<ApiFormRequest[]> {
  const res = await fetch(`${BASE}/admin/forms`, {
    ...defaultOpts,
    method: 'GET',
  });
  if (!res.ok) throw new Error(`Forms: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/**
 * URL for opening a form request PDF in a new tab. Same-origin in prod (/api/...) so cookies are sent.
 */
export function getAdminFormPdfUrl(referenceNumber: string): string {
  return `${BASE}/admin/forms/${encodeURIComponent(referenceNumber)}/pdf`;
}

/** API attachment item (GET /admin/forms/:reference_number/attachments) */
export interface ApiAttachment {
  id: string;
  stored_filename: string;
  category_key: string;
  category_label?: string;
  size_bytes: number;
  mime_type: string;
  created_at: string;
}

/**
 * GET /admin/forms/:reference_number/attachments — list attachments for a form request (admin-only).
 */
export async function fetchAdminFormAttachments(referenceNumber: string): Promise<ApiAttachment[]> {
  const res = await fetch(
    `${BASE}/admin/forms/${encodeURIComponent(referenceNumber)}/attachments`,
    { ...defaultOpts, method: 'GET' }
  );
  if (!res.ok) throw new Error(`Attachments: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/**
 * GET /admin/forms/:reference_number/attachments/:attachment_id/signed-url — get signed URL for an attachment (admin-only).
 * Returns { url: string }.
 */
export async function fetchAdminFormAttachmentSignedUrl(
  referenceNumber: string,
  attachmentId: string
): Promise<string> {
  const res = await fetch(
    `${BASE}/admin/forms/${encodeURIComponent(referenceNumber)}/attachments/${encodeURIComponent(attachmentId)}/signed-url`,
    { ...defaultOpts, method: 'GET' }
  );
  if (!res.ok) throw new Error(`Signed URL: ${res.status}`);
  const data = await res.json();
  return data?.url ?? '';
}

// --- Form definitions (builder / CRUD) — distinct from fetchAdminForms (submissions) ---

export type FormDefinitionFieldType = 'text' | 'date' | 'number' | 'select' | 'textarea';

export interface FormDefinitionField {
  id: string;
  label: string;
  type: FormDefinitionFieldType;
  required: boolean;
  placeholder: string;
  options?: string[];
}

export interface FormDefinitionAttachment {
  id: string;
  label: string;
  description: string;
  required: boolean;
}

export interface FormDefinitionAdmin {
  id: string;
  name: string;
  slug: string;
  description: string;
  fields: FormDefinitionField[];
  required_attachments: FormDefinitionAttachment[];
  trigger_doc_slugs: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
  /** Present when loaded via superadmin API */
  city_id?: string;
}

export type FormDefinitionCreateBody = {
  name: string;
  slug: string;
  description?: string;
  fields: FormDefinitionField[];
  required_attachments: FormDefinitionAttachment[];
  trigger_doc_slugs: string[];
};

/** POST /superadmin/form-definitions — same as create body plus target city */
export type SuperadminFormDefinitionCreateBody = FormDefinitionCreateBody & { city_id: string };

export type FormDefinitionUpdateBody = Partial<FormDefinitionCreateBody & { is_active: boolean }>;

export class AdminFormDefinitionConflictError extends Error {
  readonly status = 409;
  constructor(message: string) {
    super(message);
    this.name = 'AdminFormDefinitionConflictError';
  }
}

function isFieldType(v: unknown): v is FormDefinitionFieldType {
  return v === 'text' || v === 'date' || v === 'number' || v === 'select' || v === 'textarea';
}

function normalizeFormDefinitionField(raw: unknown, fallbackId: string): FormDefinitionField {
  if (!raw || typeof raw !== 'object') {
    return {
      id: fallbackId,
      label: '',
      type: 'text',
      required: false,
      placeholder: '',
    };
  }
  const o = raw as Record<string, unknown>;
  const optionsRaw = o.options;
  const options = Array.isArray(optionsRaw)
    ? optionsRaw.filter((x): x is string => typeof x === 'string')
    : undefined;
  return {
    id: typeof o.id === 'string' && o.id ? o.id : fallbackId,
    label: typeof o.label === 'string' ? o.label : '',
    type: isFieldType(o.type) ? o.type : 'text',
    required: Boolean(o.required),
    placeholder: typeof o.placeholder === 'string' ? o.placeholder : '',
    ...(options && options.length > 0 ? { options } : {}),
  };
}

function normalizeFormDefinitionAttachment(raw: unknown, fallbackId: string): FormDefinitionAttachment {
  if (!raw || typeof raw !== 'object') {
    return { id: fallbackId, label: '', description: '', required: false };
  }
  const o = raw as Record<string, unknown>;
  return {
    id: typeof o.id === 'string' && o.id ? o.id : fallbackId,
    label: typeof o.label === 'string' ? o.label : '',
    description: typeof o.description === 'string' ? o.description : '',
    required: Boolean(o.required),
  };
}

function normalizeFormDefinitionAdmin(raw: unknown): FormDefinitionAdmin | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === 'string' ? o.id : '';
  if (!id) return null;
  const fieldsRaw = o.fields;
  const fieldsArr = Array.isArray(fieldsRaw) ? fieldsRaw : [];
  const attRaw = o.required_attachments;
  const attArr = Array.isArray(attRaw) ? attRaw : [];
  const triggersRaw = o.trigger_doc_slugs;
  const triggers = Array.isArray(triggersRaw)
    ? triggersRaw.filter((s): s is string => typeof s === 'string')
    : [];
  const cityId = typeof o.city_id === 'string' && o.city_id ? o.city_id : undefined;
  return {
    id,
    name: typeof o.name === 'string' ? o.name : '',
    slug: typeof o.slug === 'string' ? o.slug : '',
    description: o.description == null ? '' : String(o.description),
    fields: fieldsArr.map((f, i) => normalizeFormDefinitionField(f, `field-${i}`)),
    required_attachments: attArr.map((a, i) => normalizeFormDefinitionAttachment(a, `att-${i}`)),
    trigger_doc_slugs: triggers,
    is_active: o.is_active === undefined ? true : Boolean(o.is_active),
    created_at: typeof o.created_at === 'string' ? o.created_at : '',
    updated_at: typeof o.updated_at === 'string' ? o.updated_at : '',
    ...(cityId ? { city_id: cityId } : {}),
  };
}

async function throwUnlessOkFormDefinition(res: Response): Promise<void> {
  if (res.ok) return;
  let message = `Form definition: ${res.status}`;
  try {
    const data = (await res.json()) as { error?: string; message?: string };
    if (typeof data?.error === 'string' && data.error.trim()) message = data.error.trim();
    else if (typeof data?.message === 'string' && data.message.trim()) message = data.message.trim();
  } catch {
    // ignore
  }
  if (res.status === 409) {
    throw new AdminFormDefinitionConflictError(message);
  }
  throw new Error(message);
}

/**
 * GET /admin/form-definitions — list form definitions for the logged-in city (admin session).
 */
export async function fetchAdminFormDefinitions(): Promise<FormDefinitionAdmin[]> {
  const res = await fetch(`${BASE}/admin/form-definitions`, {
    ...defaultOpts,
    method: 'GET',
  });
  if (!res.ok) throw new Error(`Form definitions: ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data
    .map(normalizeFormDefinitionAdmin)
    .filter((row): row is FormDefinitionAdmin => row !== null);
}

/**
 * POST /admin/form-definitions — create form definition.
 */
export async function createAdminFormDefinition(
  body: FormDefinitionCreateBody
): Promise<FormDefinitionAdmin> {
  const res = await fetch(`${BASE}/admin/form-definitions`, {
    ...defaultOpts,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  await throwUnlessOkFormDefinition(res);
  const raw = await res.json();
  const parsed = normalizeFormDefinitionAdmin(raw);
  if (!parsed) throw new Error('Invalid form definition response');
  return parsed;
}

/**
 * PUT /admin/form-definitions/:id — update form definition (partial).
 */
export async function updateAdminFormDefinition(
  id: string,
  body: FormDefinitionUpdateBody
): Promise<FormDefinitionAdmin> {
  const res = await fetch(`${BASE}/admin/form-definitions/${encodeURIComponent(id)}`, {
    ...defaultOpts,
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  await throwUnlessOkFormDefinition(res);
  const raw = await res.json();
  const parsed = normalizeFormDefinitionAdmin(raw);
  if (!parsed) throw new Error('Invalid form definition response');
  return parsed;
}

/**
 * DELETE /admin/form-definitions/:id — soft delete (is_active = false).
 */
export async function deleteAdminFormDefinition(id: string): Promise<{ success: boolean }> {
  const res = await fetch(`${BASE}/admin/form-definitions/${encodeURIComponent(id)}`, {
    ...defaultOpts,
    method: 'DELETE',
  });
  await throwUnlessOkFormDefinition(res);
  const data = await res.json().catch(() => ({}));
  if (data && typeof data === 'object' && 'success' in data) {
    return { success: Boolean((data as { success?: boolean }).success) };
  }
  return { success: true };
}

/**
 * GET /superadmin/form-definitions?cityId= — list all form definitions for a city (superadmin session).
 */
export async function fetchSuperadminFormDefinitions(cityId: string): Promise<FormDefinitionAdmin[]> {
  const res = await fetch(
    `${BASE}/superadmin/form-definitions?cityId=${encodeURIComponent(cityId)}`,
    {
      ...defaultOpts,
      method: 'GET',
    }
  );
  if (!res.ok) throw new Error(`Form definitions: ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data
    .map(normalizeFormDefinitionAdmin)
    .filter((row): row is FormDefinitionAdmin => row !== null);
}

/**
 * POST /superadmin/form-definitions — create form definition for the given city.
 */
export async function createSuperadminFormDefinition(
  body: SuperadminFormDefinitionCreateBody
): Promise<FormDefinitionAdmin> {
  const res = await fetch(`${BASE}/superadmin/form-definitions`, {
    ...defaultOpts,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  await throwUnlessOkFormDefinition(res);
  const raw = await res.json();
  const parsed = normalizeFormDefinitionAdmin(raw);
  if (!parsed) throw new Error('Invalid form definition response');
  return parsed;
}

/**
 * PUT /superadmin/form-definitions/:id — update (superadmin session).
 */
export async function updateSuperadminFormDefinition(
  id: string,
  body: FormDefinitionUpdateBody
): Promise<FormDefinitionAdmin> {
  const res = await fetch(`${BASE}/superadmin/form-definitions/${encodeURIComponent(id)}`, {
    ...defaultOpts,
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  await throwUnlessOkFormDefinition(res);
  const raw = await res.json();
  const parsed = normalizeFormDefinitionAdmin(raw);
  if (!parsed) throw new Error('Invalid form definition response');
  return parsed;
}

/**
 * DELETE /superadmin/form-definitions/:id — soft delete (superadmin session).
 */
export async function deleteSuperadminFormDefinition(id: string): Promise<{ success: boolean }> {
  const res = await fetch(`${BASE}/superadmin/form-definitions/${encodeURIComponent(id)}`, {
    ...defaultOpts,
    method: 'DELETE',
  });
  await throwUnlessOkFormDefinition(res);
  const data = await res.json().catch(() => ({}));
  if (data && typeof data === 'object' && 'success' in data) {
    return { success: Boolean((data as { success?: boolean }).success) };
  }
  return { success: true };
}
