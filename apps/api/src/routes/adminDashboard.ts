import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import OpenAI from 'openai';
import { supabase } from '../db/supabase.js';
import type { FormDefinitionPublic } from './forms.js';

interface SessionCookie {
  cityId: string;
  cityCode: string;
  role: 'admin' | 'inbox' | 'conversations' | 'forms' | 'readonly' | 'superadmin';
  userId: string;
  userName: string;
  isSuperadmin?: boolean;
}

interface DashboardQuery {
  range?: '24h' | '7d' | '30d';
  category?: string;
  search?: string;
}

interface TicketsQuery extends DashboardQuery {
  status?: 'open' | 'resolved' | 'all';
}

interface KnowledgeGapsQuery extends DashboardQuery {
  status?: 'open' | 'resolved' | 'all';
}

interface QuestionsExamplesQuery {
  question?: string;
  range?: '24h' | '7d' | '30d';
}

interface AdminReportsQuery {
  range?: '7d' | '30d' | '365d';
}

interface UpdateTicketBody {
  status?: string;
  is_urgent?: boolean;
  department_id?: string;
  read_at?: string;
  closed_at?: string;
  opened_at?: string;
  spam_flagged_at?: string;
  spam_flag_reason?: string;
  ai_category?: string;
}

interface FormDefinitionAdmin extends FormDefinitionPublic {
  city_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface FormDefinitionCreateBody {
  name: string;
  slug: string;
  description?: string | null;
  fields: unknown[];
  required_attachments: unknown[];
  trigger_doc_slugs: string[];
}

type FormDefinitionUpdateBody = Partial<FormDefinitionCreateBody & { is_active: boolean }>;

const FORM_DEFINITION_SLUG_PATTERN = /^[a-z0-9-]+$/;
const OPENAI_MODEL = 'gpt-4o-mini';

function mapFormDefinitionRow(row: {
  id: string;
  city_id: string;
  name: string;
  slug: string;
  description: string | null;
  fields: unknown;
  required_attachments: unknown;
  trigger_doc_slugs: unknown;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}): FormDefinitionAdmin {
  return {
    id: row.id,
    city_id: row.city_id,
    name: row.name,
    slug: row.slug,
    description: row.description ?? null,
    fields: Array.isArray(row.fields) ? row.fields : [],
    required_attachments: Array.isArray(row.required_attachments) ? row.required_attachments : [],
    trigger_doc_slugs: Array.isArray(row.trigger_doc_slugs)
      ? row.trigger_doc_slugs.filter((s): s is string => typeof s === 'string')
      : [],
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }
  return new OpenAI({ apiKey });
}

function extractJsonArray(raw: string): unknown[] {
  let jsonText = raw.trim();
  if (jsonText.startsWith('```')) {
    const match = jsonText.match(/```(?:json)?\s*(\[[\s\S]*\])\s*```/i);
    if (match?.[1]) {
      jsonText = match[1];
    }
  }
  const parsed = JSON.parse(jsonText);
  if (!Array.isArray(parsed)) {
    throw new Error('Model response is not a JSON array');
  }
  return parsed;
}

function extractJsonObject(raw: string): Record<string, unknown> {
  let jsonText = raw.trim();
  if (jsonText.startsWith('```')) {
    const match = jsonText.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/i);
    if (match?.[1]) {
      jsonText = match[1];
    }
  }
  const parsed = JSON.parse(jsonText);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Model response is not a JSON object');
  }
  return parsed as Record<string, unknown>;
}

function calculateTimeOpenHours(createdAt: string, closedAt: string | null): number | null {
  const createdTs = Date.parse(createdAt);
  if (Number.isNaN(createdTs)) {
    return null;
  }
  const endTs = closedAt ? Date.parse(closedAt) : Date.now();
  if (Number.isNaN(endTs)) {
    return null;
  }
  return Math.round((endTs - createdTs) / (1000 * 60 * 60));
}

function isValidIsoDate(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Helper to get and validate session from cookie
 */
async function getSession(request: FastifyRequest): Promise<SessionCookie | null> {
  const sessionCookie = request.cookies.session;
  if (!sessionCookie) {
    return null;
  }

  try {
    const session = JSON.parse(sessionCookie) as Partial<SessionCookie>;
    if (!session.role) {
      return null;
    }

    const validRoles = new Set([
      'admin',
      'inbox',
      'conversations',
      'forms',
      'readonly',
      'superadmin',
    ]);
    if (!validRoles.has(session.role)) {
      return null;
    }
    if (session.role === 'superadmin' && session.isSuperadmin === true) {
      return {
        cityId: session.cityId ?? '',
        cityCode: session.cityCode ?? '',
        role: 'superadmin',
        userId: session.userId ?? '',
        userName: session.userName ?? '',
        isSuperadmin: true,
      };
    }
    if (!session.cityId || !session.cityCode || !session.userId || !session.userName) {
      return null;
    }
    return session as SessionCookie;
  } catch {
    return null;
  }
}

/**
 * Helper to resolve city by cityCode (slug or code)
 */
async function resolveCity(cityCode: string) {
  let { data: city, error: cityError } = await supabase
    .from('cities')
    .select('id, code')
    .eq('slug', cityCode)
    .single();

  if (cityError || !city) {
    const derivedCode = cityCode.toUpperCase();
    const { data: cityByCode, error: codeError } = await supabase
      .from('cities')
      .select('id, code')
      .eq('code', derivedCode)
      .single();
    
    if (codeError || !cityByCode) {
      return null;
    }
    city = cityByCode;
  }

  return city;
}

/**
 * Get time range boundaries
 */
function getTimeRange(range: string = '7d'): { timeFrom: Date; timeTo: Date } {
  const now = new Date();
  let hours = 24;
  
  if (range === '24h') hours = 24;
  else if (range === '7d') hours = 24 * 7;
  else if (range === '30d') hours = 24 * 30;
  
  const timeFrom = new Date(now.getTime() - hours * 60 * 60 * 1000);
  return { timeFrom, timeTo: now };
}

/**
 * GET /admin/dashboard/summary
 * Returns dashboard summary with KPIs, charts, and previews
 */
export async function getDashboardSummaryHandler(
  request: FastifyRequest<{ 
    Querystring: DashboardQuery;
  }>,
  reply: FastifyReply
) {
  const session = await getSession(request);
  if (!session) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  if (session.role !== 'admin') {
    return reply.status(403).send({ error: 'Forbidden' });
  }

  const { range = '7d', category, search } = request.query;
  const { timeFrom, timeTo } = getTimeRange(range);

  try {
    // Resolve city - try cityCode first, fallback to direct lookup by cityId
    let city = null;
    if (session.cityCode) {
      city = await resolveCity(session.cityCode);
    }
    
    // Fallback: lookup directly by cityId
    if (!city && session.cityId) {
      const { data: cityById } = await supabase
        .from('cities')
        .select('id, code')
        .eq('id', session.cityId)
        .single();
      city = cityById;
    }

    if (!city) {
      return reply.status(404).send({ error: 'City not found' });
    }

    if (session.cityId !== city.id) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    // Get all conversations for this city in range
    let conversationsQuery = supabase
      .from('conversations')
      .select('id')
      .eq('city_id', city.id)
      .gte('created_at', timeFrom.toISOString())
      .lte('created_at', timeTo.toISOString());

    if (category && category !== 'all') {
      conversationsQuery = conversationsQuery.eq('category', category);
    }

    const { data: conversations } = await conversationsQuery;
    const conversationIds = (conversations || []).map(c => c.id);

    if (conversationIds.length === 0) {
      return reply.send({
        range,
        kpis: {
          conversations_total: 0,
          tickets_total: 0,
          tickets_open: 0,
          resolved_by_ai_pct: 0,
          avg_response_ms: null,
          knowledge_gaps_total: 0,
        },
        top_questions: [],
        knowledge_gaps: [],
        charts: {
          questions_per_day: [],
          top_categories: [],
        },
        tickets_preview: [],
      });
    }

    // Get user messages for questions count and examples
    let messagesQuery = supabase
      .from('messages')
      .select('id, conversation_id, content_redacted, created_at')
      .eq('role', 'user')
      .in('conversation_id', conversationIds)
      .gte('created_at', timeFrom.toISOString())
      .lte('created_at', timeTo.toISOString());

    if (search) {
      messagesQuery = messagesQuery.ilike('content_redacted', `%${search}%`);
    }

    const { data: userMessages } = await messagesQuery;

    // Get assistant messages for resolved_by_ai calculation
    const { data: assistantMessages } = await supabase
      .from('messages')
      .select('metadata')
      .eq('role', 'assistant')
      .in('conversation_id', conversationIds)
      .gte('created_at', timeFrom.toISOString())
      .lte('created_at', timeTo.toISOString());

    // Calculate KPIs
    const conversations_total = conversationIds.length;
    
    // Get tickets (conversations with needs_human=true or fallback_count>0)
    const { data: ticketsData } = await supabase
      .from('conversations')
      .select('id, status, needs_human, fallback_count')
      .eq('city_id', city.id)
      .gte('created_at', timeFrom.toISOString())
      .lte('created_at', timeTo.toISOString())
      .or('needs_human.eq.true,fallback_count.gt.0');

    const tickets_total = ticketsData?.length || 0;
    const tickets_open = ticketsData?.filter(t => t.status === 'open' || !t.status).length || 0;

    // Calculate resolved_by_ai_pct
    const totalAssistant = assistantMessages?.length || 0;
    const resolvedByAI = (assistantMessages || []).filter(msg => {
      const metadata = msg.metadata as any;
      return metadata?.resolved_by_ai === true;
    }).length;
    const resolved_by_ai_pct = totalAssistant > 0 ? Math.round((resolvedByAI / totalAssistant) * 100) : 0;

    // Calculate avg_response_ms
    const latencyValues: number[] = [];
    (assistantMessages || []).forEach(msg => {
      const metadata = msg.metadata as any;
      if (metadata?.latency_ms !== null && metadata?.latency_ms !== undefined) {
        const latency = typeof metadata.latency_ms === 'string' 
          ? parseFloat(metadata.latency_ms) 
          : metadata.latency_ms;
        if (!isNaN(latency) && latency > 0) {
          latencyValues.push(latency);
        }
      }
    });
    const avg_response_ms = latencyValues.length > 0
      ? Math.round(latencyValues.reduce((a, b) => a + b, 0) / latencyValues.length)
      : null;

    // Get knowledge gaps count (handle missing table gracefully)
    let knowledge_gaps_total = 0;
    try {
      const { count } = await supabase
        .from('knowledge_gaps')
        .select('*', { count: 'exact', head: true })
        .eq('city_id', city.id)
        .gte('last_seen_at', timeFrom.toISOString())
        .lte('last_seen_at', timeTo.toISOString());
      knowledge_gaps_total = count || 0;
    } catch (error) {
      // Table may not exist, handle gracefully
      request.log.warn({ error }, 'knowledge_gaps table may not exist');
    }

    // Top questions (group by content, case-insensitive)
    const questionCounts = new Map<string, { count: number; last_seen_at: string }>();
    (userMessages || []).forEach(msg => {
      const question = (msg.content_redacted || '').trim().toLowerCase();
      if (question.length > 0) {
        const existing = questionCounts.get(question);
        const msgDate = msg.created_at || new Date().toISOString();
        if (existing) {
          questionCounts.set(question, {
            count: existing.count + 1,
            last_seen_at: msgDate > existing.last_seen_at ? msgDate : existing.last_seen_at,
          });
        } else {
          questionCounts.set(question, { count: 1, last_seen_at: msgDate });
        }
      }
    });

    const top_questions = Array.from(questionCounts.entries())
      .map(([question, data]) => ({
        question,
        count: data.count,
        last_seen_at: data.last_seen_at,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Knowledge gaps (handle missing table gracefully)
    let knowledge_gaps: any[] = [];
    try {
      let gapsQuery = supabase
        .from('knowledge_gaps')
        .select('id, question, occurrences, status, last_seen_at, first_seen_at, reason')
        .eq('city_id', city.id)
        .gte('last_seen_at', timeFrom.toISOString())
        .lte('last_seen_at', timeTo.toISOString())
        .order('occurrences', { ascending: false })
        .limit(20);

      if (search) {
        gapsQuery = gapsQuery.ilike('question', `%${search}%`);
      }

      const { data: gaps } = await gapsQuery;
      knowledge_gaps = (gaps || []).map(gap => ({
        id: gap.id,
        question: gap.question,
        count: gap.occurrences || 1,
        status: gap.status || 'open',
        last_seen_at: gap.last_seen_at || (gap as any).first_seen_at,
        reason: gap.reason || null,
      }));
    } catch (error) {
      request.log.warn({ error }, 'knowledge_gaps table may not exist');
    }

    // Questions per day
    const questions_per_day: Array<{ date: string; count: number }> = [];
    const daysDiff = Math.ceil((timeTo.getTime() - timeFrom.getTime()) / (24 * 60 * 60 * 1000));
    for (let i = 0; i < daysDiff; i++) {
      const dayStart = new Date(timeFrom.getTime() + i * 24 * 60 * 60 * 1000);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      const dateStr = dayStart.toISOString().split('T')[0];
      
      const dayCount = (userMessages || []).filter(msg => {
        const msgDate = new Date(msg.created_at);
        return msgDate >= dayStart && msgDate < dayEnd;
      }).length;
      
      questions_per_day.push({ date: dateStr, count: dayCount });
    }

    // Top categories
    const categoryCounts = new Map<string, number>();
    (conversations || []).forEach(conv => {
      // Get category from conversation if available
      const convData = conversations?.find(c => c.id === conv.id);
      if (convData && 'category' in convData) {
        const cat = (convData as any).category;
        if (cat) {
          categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
        }
      }
    });

    // Get categories from conversations
    const { data: convsWithCategories } = await supabase
      .from('conversations')
      .select('category')
      .in('id', conversationIds)
      .not('category', 'is', null);

    (convsWithCategories || []).forEach(conv => {
      if (conv.category) {
        categoryCounts.set(conv.category, (categoryCounts.get(conv.category) || 0) + 1);
      }
    });

    const top_categories = Array.from(categoryCounts.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Tickets preview
    const tickets_preview = (ticketsData || []).slice(0, 10).map(ticket => {
      // Get question from first user message
      const firstUserMsg = (userMessages || []).find(m => m.conversation_id === ticket.id);
      return {
        id: ticket.id,
        status: ticket.status || 'open',
        reason: 'ai_fallback', // Default reason
        created_at: timeFrom.toISOString(), // Approximate
        question: firstUserMsg?.content_redacted || '',
        confidence: null,
      };
    });

    return reply.send({
      range,
      kpis: {
        conversations_total,
        tickets_total,
        tickets_open,
        resolved_by_ai_pct,
        avg_response_ms,
        knowledge_gaps_total,
      },
      top_questions,
      knowledge_gaps,
      charts: {
        questions_per_day,
        top_categories,
      },
      tickets_preview,
    });
  } catch (error) {
    request.log.error(error, 'Internal server error');
    return reply.status(500).send({ error: 'Internal server error' });
  }
}

/**
 * GET /admin/tickets
 * Returns list of tickets with filtering
 */
export async function getTicketsListHandler(
  request: FastifyRequest<{ 
    Querystring: TicketsQuery;
  }>,
  reply: FastifyReply
) {
  const session = await getSession(request);
  if (!session) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  if (session.role !== 'admin') {
    return reply.status(403).send({ error: 'Forbidden' });
  }

  const { range = '7d', status = 'all', search } = request.query;
  const { timeFrom, timeTo } = getTimeRange(range);

  try {
    // Resolve city - try cityCode first, fallback to direct lookup by cityId
    let city = null;
    if (session.cityCode) {
      city = await resolveCity(session.cityCode);
    }
    
    if (!city && session.cityId) {
      const { data: cityById } = await supabase
        .from('cities')
        .select('id, code')
        .eq('id', session.cityId)
        .single();
      city = cityById;
    }

    if (!city) {
      return reply.status(404).send({ error: 'City not found' });
    }

    if (session.cityId !== city.id) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    // Get tickets (conversations with submitted wizard intake)
    let ticketsQuery = supabase
      .from('conversations')
      .select('id, status, needs_human, fallback_count, created_at, updated_at, submitted_at')
      .eq('city_id', city.id)
      .gte('created_at', timeFrom.toISOString())
      .lte('created_at', timeTo.toISOString())
      .not('submitted_at', 'is', null);

    if (status === 'open') {
      ticketsQuery = ticketsQuery.eq('status', 'open');
    } else if (status === 'resolved') {
      ticketsQuery = ticketsQuery.eq('status', 'resolved');
    }

    const { data: tickets } = await ticketsQuery;

    // Get user messages for question text
    const conversationIds = (tickets || []).map(t => t.id);
    const { data: ticketRows } = conversationIds.length
      ? await supabase
          .from('tickets')
          .select(
            'conversation_id, read_at, closed_at, opened_at, spam_flagged_at, spam_flag_reason, ai_category, is_urgent'
          )
          .in('conversation_id', conversationIds)
          .eq('city_id', city.id)
      : { data: [] as any[] };
    const { data: userMessages } = await supabase
      .from('messages')
      .select('conversation_id, content_redacted')
      .eq('role', 'user')
      .in('conversation_id', conversationIds);

    const messagesByConv = new Map<string, string>();
    (userMessages || []).forEach(msg => {
      if (!messagesByConv.has(msg.conversation_id)) {
        messagesByConv.set(msg.conversation_id, msg.content_redacted || '');
      }
    });

    const ticketByConversationId = new Map<string, any>();
    (ticketRows || []).forEach((row) => {
      ticketByConversationId.set(row.conversation_id, row);
    });

    let result = (tickets || []).map(ticket => {
      const ticketMeta = ticketByConversationId.get(ticket.id);
      const closedAt = ticketMeta?.closed_at ?? null;
      return {
        id: ticket.id,
        status: ticket.status || 'open',
        reason: ticket.fallback_count > 0 ? 'ai_fallback' : 'no_context',
        created_at: ticket.created_at,
        updated_at: ticket.updated_at,
        submitted_at: ticket.submitted_at,
        question: messagesByConv.get(ticket.id) || '',
        confidence: null,
        read_at: ticketMeta?.read_at ?? null,
        closed_at: closedAt,
        opened_at: ticketMeta?.opened_at ?? null,
        spam_flagged_at: ticketMeta?.spam_flagged_at ?? null,
        spam_flag_reason: ticketMeta?.spam_flag_reason ?? null,
        ai_category: ticketMeta?.ai_category ?? null,
        is_urgent: ticketMeta?.is_urgent ?? false,
        time_open_hours: calculateTimeOpenHours(ticket.created_at, closedAt),
      };
    });

    if (search) {
      result = result.filter(t => t.question.toLowerCase().includes(search.toLowerCase()));
    }

    return reply.send(result);
  } catch (error) {
    request.log.error(error, 'Internal server error');
    return reply.status(500).send({ error: 'Internal server error' });
  }
}

/**
 * GET /admin/tickets/:id
 * Returns ticket detail with conversation messages
 */
export async function getTicketDetailHandler(
  request: FastifyRequest<{ 
    Params: { id: string };
  }>,
  reply: FastifyReply
) {
  const session = await getSession(request);
  if (!session) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  if (session.role !== 'admin') {
    return reply.status(403).send({ error: 'Forbidden' });
  }

  const { id } = request.params;

  try {
    // Resolve city - try cityCode first, fallback to direct lookup by cityId
    let city = null;
    if (session.cityCode) {
      city = await resolveCity(session.cityCode);
    }
    
    if (!city && session.cityId) {
      const { data: cityById } = await supabase
        .from('cities')
        .select('id, code')
        .eq('id', session.cityId)
        .single();
      city = cityById;
    }

    if (!city) {
      return reply.status(404).send({ error: 'City not found' });
    }

    if (session.cityId !== city.id) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    // Verify conversation belongs to this city
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('id, city_id, status, needs_human, fallback_count, created_at')
      .eq('id', id)
      .single();

    if (convError || !conversation) {
      return reply.status(404).send({ error: 'Ticket not found' });
    }

    if (conversation.city_id !== city.id) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const { data: ticketMeta } = await supabase
      .from('tickets')
      .select(
        'conversation_id, read_at, closed_at, opened_at, spam_flagged_at, spam_flag_reason, ai_category, is_urgent'
      )
      .eq('conversation_id', id)
      .eq('city_id', city.id)
      .maybeSingle();

    // Get messages
    const { data: messages } = await supabase
      .from('messages')
      .select('id, role, content_redacted, created_at, metadata')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true });

    return reply.send({
      id: conversation.id,
      status: conversation.status || 'open',
      reason: conversation.fallback_count > 0 ? 'ai_fallback' : 'no_context',
      created_at: conversation.created_at,
      question: (messages || []).find(m => m.role === 'user')?.content_redacted || '',
      confidence: null,
      read_at: ticketMeta?.read_at ?? null,
      closed_at: ticketMeta?.closed_at ?? null,
      opened_at: ticketMeta?.opened_at ?? null,
      spam_flagged_at: ticketMeta?.spam_flagged_at ?? null,
      spam_flag_reason: ticketMeta?.spam_flag_reason ?? null,
      ai_category: ticketMeta?.ai_category ?? null,
      is_urgent: ticketMeta?.is_urgent ?? false,
      time_open_hours: calculateTimeOpenHours(conversation.created_at, ticketMeta?.closed_at ?? null),
      messages: (messages || []).map(msg => ({
        id: msg.id,
        role: msg.role,
        content: msg.content_redacted,
        created_at: msg.created_at,
        metadata: msg.metadata,
      })),
    });
  } catch (error) {
    request.log.error(error, 'Internal server error');
    return reply.status(500).send({ error: 'Internal server error' });
  }
}

/**
 * PATCH /admin/tickets/:id
 * Updates ticket fields for conversation in current city
 */
export async function patchTicketHandler(
  request: FastifyRequest<{
    Params: { id: string };
    Body: UpdateTicketBody;
  }>,
  reply: FastifyReply
) {
  const session = await getSession(request);
  if (!session) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  if (session.role !== 'admin') {
    return reply.status(403).send({ error: 'Forbidden' });
  }

  const { id } = request.params;
  const body = request.body ?? {};

  try {
    let city = null;
    if (session.cityCode) {
      city = await resolveCity(session.cityCode);
    }
    if (!city && session.cityId) {
      const { data: cityById } = await supabase
        .from('cities')
        .select('id, code')
        .eq('id', session.cityId)
        .single();
      city = cityById;
    }
    if (!city) {
      return reply.status(404).send({ error: 'City not found' });
    }
    if (session.cityId !== city.id) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const updatePatch: Record<string, unknown> = {};

    if ('status' in body && body.status !== undefined) {
      if (typeof body.status !== 'string') {
        return reply.status(400).send({ error: 'status must be text' });
      }
      updatePatch.status = body.status.trim();
    }
    if ('is_urgent' in body && body.is_urgent !== undefined) {
      if (typeof body.is_urgent !== 'boolean') {
        return reply.status(400).send({ error: 'is_urgent must be boolean' });
      }
      updatePatch.is_urgent = body.is_urgent;
    }
    if ('department_id' in body && body.department_id !== undefined) {
      if (typeof body.department_id !== 'string' || !isValidUuid(body.department_id)) {
        return reply.status(400).send({ error: 'department_id must be uuid' });
      }
      updatePatch.department_id = body.department_id;
    }

    const datetimeFields: Array<keyof Pick<
      UpdateTicketBody,
      'read_at' | 'closed_at' | 'opened_at' | 'spam_flagged_at'
    >> = ['read_at', 'closed_at', 'opened_at', 'spam_flagged_at'];
    for (const field of datetimeFields) {
      if (field in body && body[field] !== undefined) {
        const value = body[field];
        if (typeof value !== 'string' || !isValidIsoDate(value)) {
          return reply.status(400).send({ error: `${field} must be timestamptz` });
        }
        updatePatch[field] = new Date(value).toISOString();
      }
    }

    if ('spam_flag_reason' in body && body.spam_flag_reason !== undefined) {
      if (typeof body.spam_flag_reason !== 'string') {
        return reply.status(400).send({ error: 'spam_flag_reason must be text' });
      }
      updatePatch.spam_flag_reason = body.spam_flag_reason.trim();
    }
    if ('ai_category' in body && body.ai_category !== undefined) {
      if (typeof body.ai_category !== 'string') {
        return reply.status(400).send({ error: 'ai_category must be text' });
      }
      updatePatch.ai_category = body.ai_category.trim();
    }

    if (Object.keys(updatePatch).length === 0) {
      return reply.status(400).send({ error: 'No valid fields provided' });
    }

    if ((updatePatch.status === 'closed' || body.status === 'closed') && !('closed_at' in updatePatch)) {
      updatePatch.closed_at = new Date().toISOString();
    }
    updatePatch.updated_at = new Date().toISOString();

    const { data: updatedTicket, error: updateError } = await supabase
      .from('tickets')
      .update(updatePatch)
      .eq('conversation_id', id)
      .eq('city_id', city.id)
      .select(
        'id, conversation_id, city_id, status, is_urgent, department_id, read_at, closed_at, opened_at, spam_flagged_at, spam_flag_reason, ai_category, updated_at, created_at'
      )
      .maybeSingle();

    if (updateError) {
      request.log.error(updateError, 'Ticket update failed');
      return reply.status(500).send({ error: 'Internal server error' });
    }
    if (!updatedTicket) {
      return reply.status(404).send({ error: 'Ticket not found' });
    }

    return reply.send(updatedTicket);
  } catch (error) {
    request.log.error(error, 'Internal server error');
    return reply.status(500).send({ error: 'Internal server error' });
  }
}

/**
 * POST /admin/tickets/:id/analyze
 * AI analysis of ticket contact + latest user messages
 */
export async function postTicketAnalyzeHandler(
  request: FastifyRequest<{
    Params: { id: string };
  }>,
  reply: FastifyReply
) {
  const session = await getSession(request);
  if (!session) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  if (session.role !== 'admin') {
    return reply.status(403).send({ error: 'Forbidden' });
  }

  const { id } = request.params;

  try {
    let city = null;
    if (session.cityCode) {
      city = await resolveCity(session.cityCode);
    }
    if (!city && session.cityId) {
      const { data: cityById } = await supabase
        .from('cities')
        .select('id, code')
        .eq('id', session.cityId)
        .single();
      city = cityById;
    }
    if (!city) {
      return reply.status(404).send({ error: 'City not found' });
    }
    if (session.cityId !== city.id) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const { data: conversation } = await supabase
      .from('conversations')
      .select('id, city_id')
      .eq('id', id)
      .maybeSingle();

    if (!conversation || conversation.city_id !== city.id) {
      return reply.status(404).send({ error: 'Ticket not found' });
    }

    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .select('id, conversation_id, city_id, contact_name, contact_email, contact_phone, contact_note')
      .eq('conversation_id', id)
      .eq('city_id', city.id)
      .maybeSingle();

    if (ticketError) {
      request.log.error(ticketError, 'Failed to fetch ticket for analysis');
      return reply.status(500).send({ error: 'Internal server error' });
    }
    if (!ticket) {
      return reply.status(404).send({ error: 'Ticket not found' });
    }

    const { data: recentUserMessages } = await supabase
      .from('messages')
      .select('content_redacted, created_at')
      .eq('conversation_id', id)
      .eq('role', 'user')
      .order('created_at', { ascending: false })
      .limit(5);

    const messagesChronological = [...(recentUserMessages || [])].reverse().map((msg) => ({
      content: msg.content_redacted ?? '',
      created_at: msg.created_at,
    }));

    const openai = getOpenAIClient();
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content:
            "You are analyzing a citizen support ticket for a Croatian municipality. Analyze the provided contact information and conversation messages.\n\nReturn ONLY valid JSON, no markdown:\n{\n  \"spam_score\": 0-100,\n  \"spam_reasons\": [\"reason1\", \"reason2\"],\n  \"is_suspicious\": true/false,\n  \"ai_category\": \"category name in Croatian\",\n  \"category_reason\": \"brief explanation\"\n}\n\nSpam indicators: fake/test names (e.g. asdf, test, 111), obviously fake emails, nonsense phone numbers, incoherent or offensive messages, repeated identical submissions.\nCategory should match the nature of the citizen request (e.g. 'Komunalne usluge', 'Socijalna pomoć', 'Parking', 'Građevinske dozvole', 'Opće informacije').",
        },
        {
          role: 'user',
          content: JSON.stringify({
            contact: {
              contact_name: ticket.contact_name ?? null,
              contact_email: ticket.contact_email ?? null,
              contact_phone: ticket.contact_phone ?? null,
              contact_note: ticket.contact_note ?? null,
            },
            messages: messagesChronological,
          }),
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty model response');
    }

    const analysis = extractJsonObject(content);
    const spamScoreRaw = analysis.spam_score;
    const spamScore = typeof spamScoreRaw === 'number' ? spamScoreRaw : Number(spamScoreRaw);
    const spamReasons = Array.isArray(analysis.spam_reasons)
      ? analysis.spam_reasons.filter((reason): reason is string => typeof reason === 'string')
      : [];
    const isSuspicious = analysis.is_suspicious === true;
    const aiCategory =
      typeof analysis.ai_category === 'string' && analysis.ai_category.trim()
        ? analysis.ai_category.trim()
        : null;

    const shouldFlagSpam = isSuspicious || (!Number.isNaN(spamScore) && spamScore >= 70);
    const nowIso = new Date().toISOString();
    const ticketUpdate: Record<string, unknown> = {
      ai_category: aiCategory,
      updated_at: nowIso,
    };

    if (shouldFlagSpam) {
      ticketUpdate.spam_flagged_at = nowIso;
      ticketUpdate.spam_flag_reason = spamReasons.join('; ') || 'AI suspicious/spam detection';
    }

    const { data: updatedTicket, error: updateError } = await supabase
      .from('tickets')
      .update(ticketUpdate)
      .eq('conversation_id', id)
      .eq('city_id', city.id)
      .select(
        'id, conversation_id, city_id, status, is_urgent, department_id, read_at, closed_at, opened_at, spam_flagged_at, spam_flag_reason, ai_category, updated_at, created_at'
      )
      .single();

    if (updateError) {
      request.log.error(updateError, 'Failed to persist ticket analysis');
      return reply.status(500).send({ error: 'Internal server error' });
    }

    return reply.send({
      analysis: {
        spam_score: Number.isNaN(spamScore) ? null : spamScore,
        spam_reasons: spamReasons,
        is_suspicious: isSuspicious,
        ai_category: aiCategory,
        category_reason:
          typeof analysis.category_reason === 'string' ? analysis.category_reason : null,
      },
      ticket: updatedTicket,
    });
  } catch (error) {
    request.log.error(error, 'Internal server error');
    return reply.status(500).send({ error: 'Internal server error' });
  }
}

/**
 * GET /admin/knowledge-gaps
 * Returns list of knowledge gaps
 */
export async function getKnowledgeGapsListHandler(
  request: FastifyRequest<{ 
    Querystring: KnowledgeGapsQuery;
  }>,
  reply: FastifyReply
) {
  const session = await getSession(request);
  if (!session) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  if (session.role !== 'admin') {
    return reply.status(403).send({ error: 'Forbidden' });
  }

  const { range = '7d', status = 'all', search } = request.query;
  const { timeFrom, timeTo } = getTimeRange(range);

  try {
    const city = await resolveCity(session.cityCode);
    if (!city) {
      return reply.status(404).send({ error: 'City not found' });
    }

    // Handle missing knowledge_gaps table gracefully
    try {
      let gapsQuery = supabase
        .from('knowledge_gaps')
        .select('id, question, occurrences, status, last_seen_at, first_seen_at, reason, category')
        .eq('city_id', city.id)
        .gte('last_seen_at', timeFrom.toISOString())
        .lte('last_seen_at', timeTo.toISOString())
        .order('occurrences', { ascending: false })
        .limit(100);

      if (status === 'open') {
        gapsQuery = gapsQuery.eq('status', 'open');
      } else if (status === 'resolved') {
        gapsQuery = gapsQuery.eq('status', 'resolved');
      }

      if (search) {
        gapsQuery = gapsQuery.ilike('question', `%${search}%`);
      }

      const { data: gaps } = await gapsQuery;

      const result = (gaps || []).map(gap => ({
        id: gap.id,
        question: gap.question,
        count: gap.occurrences || 1,
        status: gap.status || 'open',
        last_seen_at: gap.last_seen_at || gap.first_seen_at,
        reason: gap.reason || null,
        category: gap.category || null,
      }));

      return reply.send(result);
    } catch (error: any) {
      // Table may not exist, return empty array
      if (error.message?.includes('does not exist') || error.message?.includes('relation')) {
        return reply.send([]);
      }
      throw error;
    }
  } catch (error) {
    request.log.error(error, 'Internal server error');
    return reply.status(500).send({ error: 'Internal server error' });
  }
}

/**
 * POST /admin/knowledge-gaps/categorize
 * Categorizes uncategorized knowledge gaps using AI
 */
export async function postKnowledgeGapsCategorizeHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const session = await getSession(request);
  if (!session) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }
  if (session.role !== 'admin') {
    return reply.status(403).send({ error: 'Forbidden' });
  }

  try {
    const city = await resolveCity(session.cityCode);
    if (!city) {
      return reply.status(404).send({ error: 'City not found' });
    }

    const { data: gaps, error: gapsError } = await supabase
      .from('knowledge_gaps')
      .select('id, question')
      .eq('city_id', city.id)
      .is('category', null);

    if (gapsError) {
      throw gapsError;
    }

    if (!gaps || gaps.length === 0) {
      return reply.send({ categorized: 0, message: 'Nothing to categorize' });
    }

    const openai = getOpenAIClient();
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content:
            'You are categorizing citizen questions for a Croatian municipality chatbot. Group the following questions into logical categories in Croatian language (e.g. \'Komunalni otpad\', \'Parking\', \'Socijalna pomoć\', \'Građevinske dozvole\', \'Komunalne usluge\', etc). Return ONLY a valid JSON array, no markdown, no explanation:\n[{ "id": "<gap_id>", "category": "<category_label>" }]',
        },
        {
          role: 'user',
          content: JSON.stringify(
            gaps.map((gap) => ({
              id: gap.id,
              question: gap.question,
            }))
          ),
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty model response');
    }

    const parsed = extractJsonArray(content) as Array<{ id?: string; category?: string }>;
    let categorized = 0;

    for (const item of parsed) {
      if (!item?.id || typeof item.id !== 'string' || typeof item.category !== 'string') {
        continue;
      }
      const trimmedCategory = item.category.trim();
      if (!trimmedCategory) {
        continue;
      }

      const { error: updateError, data: updatedRows } = await supabase
        .from('knowledge_gaps')
        .update({
          category: trimmedCategory,
          category_generated_at: new Date().toISOString(),
        })
        .eq('id', item.id)
        .eq('city_id', city.id)
        .select('id');

      if (updateError) {
        request.log.warn({ updateError, id: item.id }, 'failed to update knowledge gap category');
        continue;
      }

      categorized += updatedRows?.length || 0;
    }

    return reply.send({ categorized });
  } catch (error) {
    request.log.error(error, 'Internal server error');
    return reply.status(500).send({ error: 'Internal server error' });
  }
}

/**
 * GET /admin/knowledge-gaps/suggestions
 * Returns AI suggestions for top categorized gaps
 */
export async function getKnowledgeGapsSuggestionsHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const session = await getSession(request);
  if (!session) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }
  if (session.role !== 'admin') {
    return reply.status(403).send({ error: 'Forbidden' });
  }

  try {
    const city = await resolveCity(session.cityCode);
    if (!city) {
      return reply.status(404).send({ error: 'City not found' });
    }

    const { data: gaps, error: gapsError } = await supabase
      .from('knowledge_gaps')
      .select('category, occurrences')
      .eq('city_id', city.id)
      .not('category', 'is', null);

    if (gapsError) {
      throw gapsError;
    }

    const countsByCategory = new Map<string, number>();
    for (const gap of gaps || []) {
      if (!gap.category) {
        continue;
      }
      const current = countsByCategory.get(gap.category) || 0;
      countsByCategory.set(gap.category, current + (gap.occurrences || 0));
    }

    const topCategories = Array.from(countsByCategory.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const categoriesWithExamples: Array<{
      category: string;
      count: number;
      example_questions: string[];
    }> = [];

    for (const topCategory of topCategories) {
      const { data: exampleGaps, error: exampleGapsError } = await supabase
        .from('knowledge_gaps')
        .select('question')
        .eq('city_id', city.id)
        .eq('category', topCategory.category)
        .not('question', 'is', null)
        .order('occurrences', { ascending: false })
        .limit(3);

      if (exampleGapsError) {
        throw exampleGapsError;
      }

      const exampleQuestions = (exampleGaps || [])
        .map((gap) => (gap.question || '').trim())
        .filter((question) => question.length > 0);

      categoriesWithExamples.push({
        category: topCategory.category,
        count: topCategory.count,
        example_questions: exampleQuestions,
      });
    }

    const openai = getOpenAIClient();
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content:
            'You are an advisor for a Croatian municipality chatbot. Based on the actual citizen questions that the chatbot could not answer, suggest 2-3 specific documents the city should add to its knowledge base. Be concrete and directly reference the question topics. Respond ONLY with valid JSON array, no markdown:\n[{"category": "...", "count": N, "suggestion": "Dodajte dokument o..."}]',
        },
        {
          role: 'user',
          content: JSON.stringify(categoriesWithExamples),
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty model response');
    }

    const suggestions = extractJsonArray(content);
    return reply.send(suggestions);
  } catch (error) {
    request.log.error(error, 'Internal server error');
    return reply.status(500).send({ error: 'Internal server error' });
  }
}

/**
 * GET /admin/knowledge-gaps/:id
 * Returns knowledge gap detail with example conversations
 */
export async function getKnowledgeGapDetailHandler(
  request: FastifyRequest<{ 
    Params: { id: string };
  }>,
  reply: FastifyReply
) {
  const session = await getSession(request);
  if (!session) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  if (session.role !== 'admin') {
    return reply.status(403).send({ error: 'Forbidden' });
  }

  const { id } = request.params;

  try {
    const city = await resolveCity(session.cityCode);
    if (!city) {
      return reply.status(404).send({ error: 'City not found' });
    }

    // Handle missing knowledge_gaps table gracefully
    try {
      const { data: gap, error: gapError } = await supabase
        .from('knowledge_gaps')
        .select('id, city_id, question, occurrences, status, last_seen_at, first_seen_at, reason')
        .eq('id', id)
        .eq('city_id', city.id)
        .single();

      if (gapError || !gap) {
        return reply.status(404).send({ error: 'Knowledge gap not found' });
      }
      if (gap.city_id !== city.id) {
        return reply.status(403).send({ error: 'Forbidden' });
      }

      // Get example conversations (last N where this question appeared)
      const normalizedQuestion = gap.question.trim().toLowerCase();
      const { data: userMessages } = await supabase
        .from('messages')
        .select('conversation_id, content_redacted, created_at')
        .eq('role', 'user')
        .ilike('content_redacted', `%${normalizedQuestion}%`)
        .order('created_at', { ascending: false })
        .limit(10);

      const conversationIds = Array.from(new Set((userMessages || []).map(m => m.conversation_id)));
      const examples = (conversationIds || []).slice(0, 10).map(convId => {
        const msg = (userMessages || []).find(m => m.conversation_id === convId);
        return {
          conversation_id: convId,
          question: msg?.content_redacted || '',
          created_at: msg?.created_at || '',
        };
      });

      return reply.send({
        id: gap.id,
        question: gap.question,
        count: gap.occurrences || 1,
        status: gap.status || 'open',
        last_seen_at: gap.last_seen_at || gap.first_seen_at,
        reason: gap.reason || null,
        examples,
      });
    } catch (error: any) {
      if (error.message?.includes('does not exist') || error.message?.includes('relation')) {
        return reply.status(404).send({ error: 'Knowledge gap not found' });
      }
      throw error;
    }
  } catch (error) {
    request.log.error(error, 'Internal server error');
    return reply.status(500).send({ error: 'Internal server error' });
  }
}

/**
 * GET /admin/questions/examples
 * Returns message snippets matching a question pattern
 */
export async function getQuestionsExamplesHandler(
  request: FastifyRequest<{ 
    Querystring: QuestionsExamplesQuery;
  }>,
  reply: FastifyReply
) {
  const session = await getSession(request);
  if (!session) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  if (session.role !== 'admin') {
    return reply.status(403).send({ error: 'Forbidden' });
  }

  const { question, range = '7d' } = request.query;

  if (!question) {
    return reply.status(400).send({ error: 'question parameter is required' });
  }

  const { timeFrom, timeTo } = getTimeRange(range);

  try {
    const city = await resolveCity(session.cityCode);
    if (!city) {
      return reply.status(404).send({ error: 'City not found' });
    }

    // Get conversations for this city
    const { data: conversations } = await supabase
      .from('conversations')
      .select('id')
      .eq('city_id', city.id)
      .gte('created_at', timeFrom.toISOString())
      .lte('created_at', timeTo.toISOString());

    const conversationIds = (conversations || []).map(c => c.id);

    if (conversationIds.length === 0) {
      return reply.send([]);
    }

    // Search for messages matching the question pattern
    const { data: messages } = await supabase
      .from('messages')
      .select('id, conversation_id, content_redacted, created_at')
      .eq('role', 'user')
      .in('conversation_id', conversationIds)
      .ilike('content_redacted', `%${question}%`)
      .order('created_at', { ascending: false })
      .limit(20);

    const result = (messages || []).map(msg => ({
      conversation_id: msg.conversation_id,
      question: msg.content_redacted || '',
      created_at: msg.created_at,
    }));

    return reply.send(result);
  } catch (error) {
    request.log.error(error, 'Internal server error');
    return reply.status(500).send({ error: 'Internal server error' });
  }
}

/**
 * GET /admin/reports
 * Returns aggregated reports data for the current admin city.
 */
export async function getAdminReportsHandler(
  request: FastifyRequest<{
    Querystring: AdminReportsQuery;
  }>,
  reply: FastifyReply
) {
  const session = await getSession(request);
  if (!session) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }
  if (session.role !== 'admin') {
    return reply.status(403).send({ error: 'Forbidden' });
  }

  const allowedRanges = new Set<AdminReportsQuery['range']>(['7d', '30d', '365d']);
  const range = request.query.range ?? '30d';
  if (!allowedRanges.has(range)) {
    return reply.status(400).send({ error: "range must be one of: '7d', '30d', '365d'" });
  }

  const rangeToInterval: Record<NonNullable<AdminReportsQuery['range']>, string> = {
    '7d': '7 days',
    '30d': '30 days',
    '365d': '365 days',
  };
  const interval = rangeToInterval[range];
  const days = Number.parseInt(interval.split(' ')[0], 10);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  try {
    const cityUuid = session.cityId;
    if (!cityUuid) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const [
      { data: conversationsRows, error: conversationsError },
      { data: ticketsRows, error: ticketsError },
      { data: categorizedConversationsRows, error: categoriesError },
      { count: totalConversationsCount, error: totalConversationsError },
      { count: totalMessagesCount, error: totalMessagesError },
      { count: totalTicketsCount, error: totalTicketsError },
      { data: fallbackRows, error: fallbackError },
    ] = await Promise.all([
      supabase
        .from('conversations')
        .select('created_at')
        .eq('city_id', cityUuid)
        .gte('created_at', since),
      supabase
        .from('tickets')
        .select('status')
        .eq('city_id', cityUuid)
        .gte('created_at', since),
      supabase
        .from('conversations')
        .select('category')
        .eq('city_id', cityUuid)
        .not('category', 'is', null)
        .gte('created_at', since),
      supabase
        .from('conversations')
        .select('*', { count: 'exact', head: true })
        .eq('city_id', cityUuid)
        .gte('created_at', since),
      supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('city_id', cityUuid)
        .gte('created_at', since),
      supabase
        .from('tickets')
        .select('id', { count: 'exact', head: true })
        .eq('city_id', cityUuid)
        .gte('created_at', since),
      supabase
        .from('conversations')
        .select('fallback_count')
        .eq('city_id', cityUuid)
        .gte('created_at', since),
    ]);

    if (ticketsError) request.log.warn({ error: ticketsError }, 'tickets query error');
    if (totalTicketsError) request.log.warn({ error: totalTicketsError }, 'tickets query error');

    if (
      conversationsError ||
      ticketsError ||
      categoriesError ||
      totalConversationsError ||
      totalMessagesError ||
      totalTicketsError ||
      fallbackError
    ) {
      request.log.error(
        {
          conversationsError,
          ticketsError,
          categoriesError,
          totalConversationsError,
          totalMessagesError,
          totalTicketsError,
          fallbackError,
        },
        'admin reports queries failed'
      );
      return reply.status(500).send({ error: 'Internal server error' });
    }

    const conversationsByDayMap = new Map<string, number>();
    for (const row of conversationsRows || []) {
      const date = (row.created_at || '').split('T')[0];
      if (!date) {
        continue;
      }
      conversationsByDayMap.set(date, (conversationsByDayMap.get(date) || 0) + 1);
    }
    const conversations_by_day = Array.from(conversationsByDayMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const ticketStatsMap = new Map<string, number>();
    for (const row of ticketsRows || []) {
      const status = row.status || 'unknown';
      ticketStatsMap.set(status, (ticketStatsMap.get(status) || 0) + 1);
    }
    const ticket_stats = Array.from(ticketStatsMap.entries()).map(([status, count]) => ({
      status,
      count,
    }));

    const categoryMap = new Map<string, number>();
    for (const row of categorizedConversationsRows || []) {
      const category = row.category;
      if (!category) {
        continue;
      }
      categoryMap.set(category, (categoryMap.get(category) || 0) + 1);
    }
    const top_categories = Array.from(categoryMap.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const total_messages = totalMessagesCount || 0;
    const fallbackTotal = (fallbackRows || []).reduce(
      (sum, row) => sum + (typeof row.fallback_count === 'number' ? row.fallback_count : 0),
      0
    );
    const fallback_rate =
      total_messages > 0 ? Math.round((fallbackTotal / total_messages) * 1000) / 10 : 0;

    return reply.send({
      conversations_by_day,
      ticket_stats,
      top_categories,
      kpis: {
        total_conversations: totalConversationsCount || 0,
        total_messages,
        total_tickets: totalTicketsCount || 0,
        fallback_rate,
      },
    });
  } catch (error) {
    request.log.error(error, 'Internal server error');
    return reply.status(500).send({ error: 'Internal server error' });
  }
}

/**
 * GET /admin/forms
 * Returns latest 50 rows from public.form_requests (reference_number, type, status, created_at).
 * In production, requires admin session; in development, auth is bypassed for local testing.
 */
export async function getAdminFormsHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const session = await getSession(request);
  if (!session) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }
  if (session.role !== 'admin') {
    return reply.status(403).send({ error: 'Forbidden' });
  }

  // Exclude draft rows so they never show in admin list (draft is for future use).
  let formsQuery = supabase
    .from('form_requests')
    .select('reference_number, type, status, created_at')
    .neq('status', 'draft')
    .order('created_at', { ascending: false })
    .limit(50);

  formsQuery = formsQuery.eq('city_id', session.cityId);

  const { data: rows, error } = await formsQuery;

  if (error) {
    request.log.error({ err: error }, 'admin forms list failed');
    return reply.status(500).send({ error: 'Internal server error' });
  }
  return reply.send(rows ?? []);
}

interface FormPdfParams {
  reference_number: string;
}

/**
 * GET /admin/forms/:reference_number/pdf
 * Serves PDF from pdf_base64. 404 if not found, 409 if pdf_base64 missing.
 * In production, requires admin session; in development, auth is bypassed for local testing.
 */
export async function getAdminFormPdfHandler(
  request: FastifyRequest<{ Params: FormPdfParams }>,
  reply: FastifyReply
) {
  const session = await getSession(request);
  if (!session) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }
  if (session.role !== 'admin') {
    return reply.status(403).send({ error: 'Forbidden' });
  }

  const { reference_number } = request.params;
  const { data: row, error } = await supabase
    .from('form_requests')
    .select('pdf_base64, city_id')
    .eq('reference_number', reference_number)
    .single();

  if (error || !row) {
    return reply.status(404).send({ error: 'Form request not found' });
  }
  if (row.city_id !== session.cityId) {
    return reply.status(403).send({ error: 'Forbidden' });
  }
  if (row.pdf_base64 == null || row.pdf_base64 === '') {
    return reply.status(409).send({ error: 'PDF not available for this request' });
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(row.pdf_base64, 'base64');
  } catch (e) {
    request.log.error({ err: e }, 'admin form PDF base64 decode failed');
    return reply.status(500).send({ error: 'Invalid PDF data' });
  }

  const filename = `${reference_number}.pdf`;
  return reply
    .header('Content-Type', 'application/pdf')
    .header('Content-Disposition', `inline; filename="${filename}"`)
    .send(buffer);
}

/**
 * GET /admin/forms/:reference_number/attachments
 * Returns list of attachments for a form request (admin-only). No public URLs; bucket is private.
 * Ordered by stored_filename asc.
 */
export async function getAdminFormAttachmentsHandler(
  request: FastifyRequest<{ Params: { reference_number: string } }>,
  reply: FastifyReply
) {
  const session = await getSession(request);
  if (!session) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }
  if (session.role !== 'admin') {
    return reply.status(403).send({ error: 'Forbidden' });
  }

  const { reference_number } = request.params;
  const { data: formRequest, error: frError } = await supabase
    .from('form_requests')
    .select('id, city_id')
    .eq('reference_number', reference_number)
    .single();

  if (frError || !formRequest) {
    return reply.status(404).send({ error: 'Form request not found' });
  }
  if (formRequest.city_id !== session.cityId) {
    return reply.status(403).send({ error: 'Forbidden' });
  }

  const { data: rows, error } = await supabase
    .from('form_request_attachments')
    .select('id, stored_filename, category_key, category_label, size_bytes, mime_type, created_at')
    .eq('form_request_id', formRequest.id)
    .order('stored_filename', { ascending: true });

  if (error) {
    request.log.error({ err: error }, 'admin form attachments list failed');
    return reply.status(500).send({ error: 'Internal server error' });
  }

  return reply.send(rows ?? []);
}

const SIGNED_URL_EXPIRY_SECONDS = 60;

/**
 * GET /admin/forms/:reference_number/attachments/:attachment_id/signed-url
 * Returns a short-lived signed URL for preview/download (admin-only).
 */
export async function getAdminFormAttachmentSignedUrlHandler(
  request: FastifyRequest<{
    Params: { reference_number: string; attachment_id: string };
  }>,
  reply: FastifyReply
) {
  const session = await getSession(request);
  if (!session) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }
  if (session.role !== 'admin') {
    return reply.status(403).send({ error: 'Forbidden' });
  }

  const { reference_number, attachment_id } = request.params;

  const { data: formRequest, error: frError } = await supabase
    .from('form_requests')
    .select('id, city_id')
    .eq('reference_number', reference_number)
    .single();

  if (frError || !formRequest) {
    return reply.status(404).send({ error: 'Form request not found' });
  }
  if (formRequest.city_id !== session.cityId) {
    return reply.status(403).send({ error: 'Forbidden' });
  }

  const { data: attachment, error: attError } = await supabase
    .from('form_request_attachments')
    .select('storage_path, bucket_name')
    .eq('id', attachment_id)
    .eq('form_request_id', formRequest.id)
    .single();

  if (attError || !attachment) {
    return reply.status(404).send({ error: 'Attachment not found' });
  }

  const { data: signed, error: signError } = await supabase.storage
    .from(attachment.bucket_name)
    .createSignedUrl(attachment.storage_path, SIGNED_URL_EXPIRY_SECONDS);

  if (signError) {
    request.log.error({ err: signError }, 'signed URL creation failed');
    return reply.status(500).send({ error: 'Failed to generate download URL' });
  }

  return reply.send({ url: signed.signedUrl });
}

/**
 * GET /admin/form-definitions
 * All form_definitions for session.cityId, ordered by created_at ascending.
 */
export async function getAdminFormDefinitionsHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const session = await getSession(request);
  if (!session) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }
  if (session.role !== 'admin') {
    return reply.status(403).send({ error: 'Forbidden' });
  }

  const { data: rows, error } = await supabase
    .from('form_definitions')
    .select(
      'id, city_id, name, slug, description, fields, required_attachments, trigger_doc_slugs, is_active, created_at, updated_at'
    )
    .eq('city_id', session.cityId)
    .order('created_at', { ascending: true });

  if (error) {
    request.log.error({ err: error }, 'admin form_definitions list failed');
    return reply.status(500).send({ error: 'Internal server error' });
  }

  return reply.send((rows ?? []).map(mapFormDefinitionRow));
}

/**
 * POST /admin/form-definitions
 */
export async function postAdminFormDefinitionsHandler(
  request: FastifyRequest<{ Body: FormDefinitionCreateBody }>,
  reply: FastifyReply
) {
  const session = await getSession(request);
  if (!session) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }
  if (session.role !== 'admin') {
    return reply.status(403).send({ error: 'Forbidden' });
  }

  const body = request.body ?? ({} as FormDefinitionCreateBody);
  const { name, slug, description, fields, required_attachments, trigger_doc_slugs } = body;

  if (name == null || typeof name !== 'string' || !name.trim()) {
    return reply.status(400).send({ error: 'name is required' });
  }
  if (slug == null || typeof slug !== 'string' || !slug.trim()) {
    return reply.status(400).send({ error: 'slug is required' });
  }
  const slugTrim = slug.trim();
  if (!FORM_DEFINITION_SLUG_PATTERN.test(slugTrim)) {
    return reply.status(400).send({ error: 'slug must match pattern ^[a-z0-9-]+$' });
  }
  if (!Array.isArray(fields)) {
    return reply.status(400).send({ error: 'fields must be an array' });
  }
  if (!Array.isArray(required_attachments)) {
    return reply.status(400).send({ error: 'required_attachments must be an array' });
  }
  if (!Array.isArray(trigger_doc_slugs)) {
    return reply.status(400).send({ error: 'trigger_doc_slugs must be an array' });
  }
  if (!trigger_doc_slugs.every((s): s is string => typeof s === 'string')) {
    return reply.status(400).send({ error: 'trigger_doc_slugs must be a string array' });
  }

  if (description !== undefined && description !== null && typeof description !== 'string') {
    return reply.status(400).send({ error: 'description must be a string or null' });
  }
  const desc =
    description === undefined || description === null ? null : description;

  const { data: existing, error: existErr } = await supabase
    .from('form_definitions')
    .select('id')
    .eq('city_id', session.cityId)
    .eq('slug', slugTrim)
    .maybeSingle();

  if (existErr) {
    request.log.error({ err: existErr }, 'form_definitions duplicate check failed');
    return reply.status(500).send({ error: 'Internal server error' });
  }
  if (existing) {
    return reply.status(409).send({ error: 'Form definition with this slug already exists for this city' });
  }

  const { data: row, error: insertError } = await supabase
    .from('form_definitions')
    .insert({
      city_id: session.cityId,
      name: name.trim(),
      slug: slugTrim,
      description: desc,
      fields,
      required_attachments,
      trigger_doc_slugs,
      is_active: true,
    })
    .select(
      'id, city_id, name, slug, description, fields, required_attachments, trigger_doc_slugs, is_active, created_at, updated_at'
    )
    .single();

  if (insertError) {
    const isUnique =
      insertError.code === '23505' ||
      Boolean(insertError.message && insertError.message.includes('unique'));
    if (isUnique) {
      return reply.status(409).send({ error: 'Form definition with this slug already exists for this city' });
    }
    request.log.error({ err: insertError }, 'form_definitions insert failed');
    return reply.status(500).send({ error: 'Internal server error' });
  }

  return reply.status(201).send(mapFormDefinitionRow(row));
}

/**
 * PUT /admin/form-definitions/:id
 * Partial update; only provided fields are set. updated_at always refreshed.
 */
export async function putAdminFormDefinitionsHandler(
  request: FastifyRequest<{ Params: { id: string }; Body: FormDefinitionUpdateBody }>,
  reply: FastifyReply
) {
  const session = await getSession(request);
  if (!session) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }
  if (session.role !== 'admin') {
    return reply.status(403).send({ error: 'Forbidden' });
  }

  const { id } = request.params;
  const body = request.body ?? {};

  const { data: current, error: fetchError } = await supabase
    .from('form_definitions')
    .select(
      'id, city_id, name, slug, description, fields, required_attachments, trigger_doc_slugs, is_active, created_at, updated_at'
    )
    .eq('id', id)
    .eq('city_id', session.cityId)
    .single();

  if (fetchError || !current) {
    return reply.status(404).send({ error: 'Form definition not found' });
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if ('name' in body && body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      return reply.status(400).send({ error: 'name must be a non-empty string' });
    }
    patch.name = body.name.trim();
  }

  if ('slug' in body && body.slug !== undefined) {
    if (typeof body.slug !== 'string' || !body.slug.trim()) {
      return reply.status(400).send({ error: 'slug must be a non-empty string' });
    }
    const newSlug = body.slug.trim();
    if (!FORM_DEFINITION_SLUG_PATTERN.test(newSlug)) {
      return reply.status(400).send({ error: 'slug must match pattern ^[a-z0-9-]+$' });
    }
    if (newSlug !== current.slug) {
      const { data: conflict, error: conflictErr } = await supabase
        .from('form_definitions')
        .select('id')
        .eq('city_id', session.cityId)
        .eq('slug', newSlug)
        .neq('id', id)
        .maybeSingle();

      if (conflictErr) {
        request.log.error({ err: conflictErr }, 'form_definitions slug conflict check failed');
        return reply.status(500).send({ error: 'Internal server error' });
      }
      if (conflict) {
        return reply.status(409).send({ error: 'Form definition with this slug already exists for this city' });
      }
    }
    patch.slug = newSlug;
  }

  if ('description' in body && body.description !== undefined) {
    if (body.description !== null && typeof body.description !== 'string') {
      return reply.status(400).send({ error: 'description must be a string or null' });
    }
    patch.description = body.description;
  }

  if ('fields' in body && body.fields !== undefined) {
    if (!Array.isArray(body.fields)) {
      return reply.status(400).send({ error: 'fields must be an array' });
    }
    patch.fields = body.fields;
  }

  if ('required_attachments' in body && body.required_attachments !== undefined) {
    if (!Array.isArray(body.required_attachments)) {
      return reply.status(400).send({ error: 'required_attachments must be an array' });
    }
    patch.required_attachments = body.required_attachments;
  }

  if ('trigger_doc_slugs' in body && body.trigger_doc_slugs !== undefined) {
    if (!Array.isArray(body.trigger_doc_slugs)) {
      return reply.status(400).send({ error: 'trigger_doc_slugs must be an array' });
    }
    if (!body.trigger_doc_slugs.every((s): s is string => typeof s === 'string')) {
      return reply.status(400).send({ error: 'trigger_doc_slugs must be a string array' });
    }
    patch.trigger_doc_slugs = body.trigger_doc_slugs;
  }

  if ('is_active' in body && body.is_active !== undefined) {
    if (typeof body.is_active !== 'boolean') {
      return reply.status(400).send({ error: 'is_active must be a boolean' });
    }
    patch.is_active = body.is_active;
  }

  const { data: row, error: updateError } = await supabase
    .from('form_definitions')
    .update(patch)
    .eq('id', id)
    .eq('city_id', session.cityId)
    .select(
      'id, city_id, name, slug, description, fields, required_attachments, trigger_doc_slugs, is_active, created_at, updated_at'
    )
    .single();

  if (updateError) {
    const isUnique =
      updateError.code === '23505' ||
      Boolean(updateError.message && updateError.message.includes('unique'));
    if (isUnique) {
      return reply.status(409).send({ error: 'Form definition with this slug already exists for this city' });
    }
    request.log.error({ err: updateError }, 'form_definitions update failed');
    return reply.status(500).send({ error: 'Internal server error' });
  }

  if (!row) {
    return reply.status(404).send({ error: 'Form definition not found' });
  }

  return reply.send(mapFormDefinitionRow(row));
}

/**
 * DELETE /admin/form-definitions/:id
 * Soft delete: is_active = false.
 */
export async function deleteAdminFormDefinitionsHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const session = await getSession(request);
  if (!session) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }
  if (session.role !== 'admin') {
    return reply.status(403).send({ error: 'Forbidden' });
  }

  const { id } = request.params;

  const { data: current, error: fetchError } = await supabase
    .from('form_definitions')
    .select('id')
    .eq('id', id)
    .eq('city_id', session.cityId)
    .maybeSingle();

  if (fetchError) {
    request.log.error({ err: fetchError }, 'form_definitions delete fetch failed');
    return reply.status(500).send({ error: 'Internal server error' });
  }
  if (!current) {
    return reply.status(404).send({ error: 'Form definition not found' });
  }

  const { error: updateError } = await supabase
    .from('form_definitions')
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('city_id', session.cityId);

  if (updateError) {
    request.log.error({ err: updateError }, 'form_definitions soft delete failed');
    return reply.status(500).send({ error: 'Internal server error' });
  }

  return reply.send({ success: true });
}

/**
 * Register admin dashboard routes
 */
export async function registerAdminDashboardRoutes(server: FastifyInstance) {
  server.get('/admin/dashboard/summary', getDashboardSummaryHandler);
  server.get('/admin/reports', getAdminReportsHandler);
  server.get('/admin/tickets', getTicketsListHandler);
  server.get('/admin/tickets/:id', getTicketDetailHandler);
  server.patch('/admin/tickets/:id', patchTicketHandler);
  server.post('/admin/tickets/:id/analyze', postTicketAnalyzeHandler);
  server.get('/admin/knowledge-gaps', getKnowledgeGapsListHandler);
  server.post('/admin/knowledge-gaps/categorize', postKnowledgeGapsCategorizeHandler);
  server.get('/admin/knowledge-gaps/suggestions', getKnowledgeGapsSuggestionsHandler);
  server.get('/admin/knowledge-gaps/:id', getKnowledgeGapDetailHandler);
  server.get('/admin/questions/examples', getQuestionsExamplesHandler);
  server.get('/admin/forms', getAdminFormsHandler);
  server.get('/admin/forms/:reference_number/pdf', getAdminFormPdfHandler);
  server.get('/admin/forms/:reference_number/attachments', getAdminFormAttachmentsHandler);
  server.get('/admin/forms/:reference_number/attachments/:attachment_id/signed-url', getAdminFormAttachmentSignedUrlHandler);
  server.get('/admin/form-definitions', getAdminFormDefinitionsHandler);
  server.post('/admin/form-definitions', postAdminFormDefinitionsHandler);
  server.put('/admin/form-definitions/:id', putAdminFormDefinitionsHandler);
  server.delete('/admin/form-definitions/:id', deleteAdminFormDefinitionsHandler);

  if (process.env.NODE_ENV !== 'production') {
    server.log.info('Admin forms endpoints registered: GET /admin/forms, GET /admin/forms/:reference_number/pdf, attachments');
  }
}
