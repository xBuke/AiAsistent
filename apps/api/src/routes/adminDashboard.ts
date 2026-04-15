import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { supabase } from '../db/supabase.js';

interface SessionCookie {
  cityId: string;
  cityCode: string;
  role: 'admin' | 'inbox';
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

/**
 * Helper to get and validate session from cookie
 */
async function getSession(request: FastifyRequest): Promise<SessionCookie | null> {
  const sessionCookie = request.cookies.session;
  if (!sessionCookie) {
    return null;
  }

  try {
    const session: SessionCookie = JSON.parse(sessionCookie);
    if (!session.cityId || !session.role) {
      return null;
    }
    if (session.role !== 'admin' && session.role !== 'inbox') {
      return null;
    }
    return session;
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

    // Get tickets (conversations with needs_human=true or fallback_count>0)
    let ticketsQuery = supabase
      .from('conversations')
      .select('id, status, needs_human, fallback_count, created_at, updated_at')
      .eq('city_id', city.id)
      .gte('created_at', timeFrom.toISOString())
      .lte('created_at', timeTo.toISOString())
      .or('needs_human.eq.true,fallback_count.gt.0');

    if (status === 'open') {
      ticketsQuery = ticketsQuery.eq('status', 'open');
    } else if (status === 'resolved') {
      ticketsQuery = ticketsQuery.eq('status', 'resolved');
    }

    const { data: tickets } = await ticketsQuery;

    // Get user messages for question text
    const conversationIds = (tickets || []).map(t => t.id);
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

    let result = (tickets || []).map(ticket => ({
      id: ticket.id,
      status: ticket.status || 'open',
      reason: ticket.fallback_count > 0 ? 'ai_fallback' : 'no_context',
      created_at: ticket.created_at,
      updated_at: ticket.updated_at,
      question: messagesByConv.get(ticket.id) || '',
      confidence: null,
    }));

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
        .select('id, question, occurrences, status, last_seen_at, first_seen_at, reason')
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
        .select('id, question, occurrences, status, last_seen_at, first_seen_at, reason')
        .eq('id', id)
        .single();

      if (gapError || !gap) {
        return reply.status(404).send({ error: 'Knowledge gap not found' });
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
 * GET /admin/forms
 * Returns latest 50 rows from public.form_requests (reference_number, type, status, created_at).
 * In production, requires admin session; in development, auth is bypassed for local testing.
 */
export async function getAdminFormsHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  if (process.env.NODE_ENV === 'production') {
    const session = await getSession(request);
    if (!session) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
    if (session.role !== 'admin') {
      return reply.status(403).send({ error: 'Forbidden' });
    }
  }

  // Exclude draft rows so they never show in admin list (draft is for future use).
  const { data: rows, error } = await supabase
    .from('form_requests')
    .select('reference_number, type, status, created_at')
    .neq('status', 'draft')
    .order('created_at', { ascending: false })
    .limit(50);

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
  if (process.env.NODE_ENV === 'production') {
    const session = await getSession(request);
    if (!session) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
    if (session.role !== 'admin') {
      return reply.status(403).send({ error: 'Forbidden' });
    }
  }

  const { reference_number } = request.params;
  const { data: row, error } = await supabase
    .from('form_requests')
    .select('pdf_base64')
    .eq('reference_number', reference_number)
    .single();

  if (error || !row) {
    return reply.status(404).send({ error: 'Form request not found' });
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
  if (process.env.NODE_ENV === 'production') {
    const session = await getSession(request);
    if (!session) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
    if (session.role !== 'admin') {
      return reply.status(403).send({ error: 'Forbidden' });
    }
  }

  const { reference_number } = request.params;
  const { data: formRequest, error: frError } = await supabase
    .from('form_requests')
    .select('id')
    .eq('reference_number', reference_number)
    .single();

  if (frError || !formRequest) {
    return reply.status(404).send({ error: 'Form request not found' });
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
  if (process.env.NODE_ENV === 'production') {
    const session = await getSession(request);
    if (!session) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
    if (session.role !== 'admin') {
      return reply.status(403).send({ error: 'Forbidden' });
    }
  }

  const { reference_number, attachment_id } = request.params;

  const { data: formRequest, error: frError } = await supabase
    .from('form_requests')
    .select('id')
    .eq('reference_number', reference_number)
    .single();

  if (frError || !formRequest) {
    return reply.status(404).send({ error: 'Form request not found' });
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
 * Register admin dashboard routes
 */
export async function registerAdminDashboardRoutes(server: FastifyInstance) {
  server.get('/admin/dashboard/summary', getDashboardSummaryHandler);
  server.get('/admin/tickets', getTicketsListHandler);
  server.get('/admin/tickets/:id', getTicketDetailHandler);
  server.get('/admin/knowledge-gaps', getKnowledgeGapsListHandler);
  server.get('/admin/knowledge-gaps/:id', getKnowledgeGapDetailHandler);
  server.get('/admin/questions/examples', getQuestionsExamplesHandler);
  server.get('/admin/forms', getAdminFormsHandler);
  server.get('/admin/forms/:reference_number/pdf', getAdminFormPdfHandler);
  server.get('/admin/forms/:reference_number/attachments', getAdminFormAttachmentsHandler);
  server.get('/admin/forms/:reference_number/attachments/:attachment_id/signed-url', getAdminFormAttachmentSignedUrlHandler);

  if (process.env.NODE_ENV !== 'production') {
    server.log.info('Admin forms endpoints registered: GET /admin/forms, GET /admin/forms/:reference_number/pdf, attachments');
  }
}
