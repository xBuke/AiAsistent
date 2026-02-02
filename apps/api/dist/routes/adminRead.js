import { supabase } from '../db/supabase.js';
/*
 * Migration: add internal_note to tickets (run if missing).
 * alter table public.tickets add column if not exists internal_note text;
 */
/**
 * Helper to get and validate session from cookie
 */
async function getSession(request) {
    const sessionCookie = request.cookies.session;
    if (!sessionCookie) {
        return null;
    }
    try {
        const session = JSON.parse(sessionCookie);
        if (!session.cityId || !session.role) {
            return null;
        }
        if (session.role !== 'admin' && session.role !== 'inbox') {
            return null;
        }
        return session;
    }
    catch {
        return null;
    }
}
/**
 * Helper to resolve city by cityCode (slug or code)
 */
async function resolveCity(cityCode) {
    // Try lookup by slug first (exact match)
    let { data: city, error: cityError } = await supabase
        .from('cities')
        .select('id, code')
        .eq('slug', cityCode)
        .single();
    // Fallback: try by code (uppercased)
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
 * GET /admin/:cityCode/conversations
 * Returns list of conversations sorted by updated_at desc
 */
export async function getConversationsHandler(request, reply) {
    // Check authentication
    const session = await getSession(request);
    if (!session) {
        return reply.status(401).send({ error: 'Unauthorized' });
    }
    // Check role (inbox and admin both allowed)
    if (session.role !== 'admin' && session.role !== 'inbox') {
        return reply.status(403).send({ error: 'Forbidden' });
    }
    const { cityCode } = request.params;
    try {
        // Resolve city
        const city = await resolveCity(cityCode);
        if (!city) {
            return reply.status(404).send({ error: 'City not found' });
        }
        // Validate session cityId matches resolved city
        if (session.cityId !== city.id) {
            return reply.status(403).send({ error: 'Forbidden' });
        }
        // Get conversations with message count
        const { data: conversations, error: convError } = await supabase
            .from('conversations')
            .select(`
        id,
        external_id,
        created_at,
        updated_at,
        category,
        needs_human,
        status,
        fallback_count
      `)
            .eq('city_id', city.id)
            .order('updated_at', { ascending: false })
            .order('created_at', { ascending: false });
        if (convError) {
            request.log.error(convError, 'Failed to fetch conversations');
            return reply.status(500).send({ error: 'Internal server error' });
        }
        // Get message counts for each conversation
        const conversationsWithCounts = await Promise.all((conversations || []).map(async (conv) => {
            const { count, error: countError } = await supabase
                .from('messages')
                .select('*', { count: 'exact', head: true })
                .eq('conversation_id', conv.id);
            const messageCount = countError ? 0 : (count || 0);
            return {
                conversationUuid: conv.id,
                externalConversationId: conv.external_id || null,
                createdAt: conv.created_at,
                updatedAt: conv.updated_at,
                category: conv.category,
                needsHuman: conv.needs_human,
                status: conv.status,
                fallbackCount: conv.fallback_count || 0,
                messageCount,
            };
        }));
        return reply.send(conversationsWithCounts);
    }
    catch (error) {
        request.log.error(error, 'Internal server error');
        return reply.status(500).send({ error: 'Internal server error' });
    }
}
/**
 * GET /admin/:cityCode/conversations/:conversationUuid/messages
 * Returns messages for a conversation sorted by created_at asc
 */
export async function getConversationMessagesHandler(request, reply) {
    // Check authentication
    const session = await getSession(request);
    if (!session) {
        return reply.status(401).send({ error: 'Unauthorized' });
    }
    // Check role (inbox and admin both allowed)
    if (session.role !== 'admin' && session.role !== 'inbox') {
        return reply.status(403).send({ error: 'Forbidden' });
    }
    const { cityCode, conversationUuid } = request.params;
    const limit = parseInt(request.query.limit || '200', 10);
    try {
        // Resolve city
        const city = await resolveCity(cityCode);
        if (!city) {
            return reply.status(404).send({ error: 'City not found' });
        }
        // Validate session cityId matches resolved city
        if (session.cityId !== city.id) {
            return reply.status(403).send({ error: 'Forbidden' });
        }
        // Verify conversation belongs to this city
        const { data: conversation, error: convError } = await supabase
            .from('conversations')
            .select('id, city_id')
            .eq('id', conversationUuid)
            .single();
        if (convError || !conversation) {
            return reply.status(404).send({ error: 'Conversation not found' });
        }
        if (conversation.city_id !== city.id) {
            return reply.status(403).send({ error: 'Forbidden' });
        }
        // Get messages
        const { data: messages, error: msgError } = await supabase
            .from('messages')
            .select('id, role, content_redacted, created_at, external_id, metadata')
            .eq('conversation_id', conversationUuid)
            .order('created_at', { ascending: true })
            .limit(limit);
        if (msgError) {
            request.log.error(msgError, 'Failed to fetch messages');
            return reply.status(500).send({ error: 'Internal server error' });
        }
        const formattedMessages = (messages || []).map((msg) => ({
            id: msg.id,
            role: msg.role,
            content_redacted: msg.content_redacted,
            created_at: msg.created_at,
            external_id: msg.external_id || null,
            metadata: msg.metadata || null,
        }));
        return reply.send(formattedMessages);
    }
    catch (error) {
        request.log.error(error, 'Internal server error');
        return reply.status(500).send({ error: 'Internal server error' });
    }
}
/**
 * GET /admin/:cityCode/tickets
 * Returns list of tickets sorted by updated_at desc
 */
export async function getTicketsHandler(request, reply) {
    // Check authentication
    const session = await getSession(request);
    if (!session) {
        return reply.status(401).send({ error: 'Unauthorized' });
    }
    // Check role (inbox and admin both allowed)
    if (session.role !== 'admin' && session.role !== 'inbox') {
        return reply.status(403).send({ error: 'Forbidden' });
    }
    const { cityCode } = request.params;
    try {
        // Resolve city
        const city = await resolveCity(cityCode);
        if (!city) {
            return reply.status(404).send({ error: 'City not found' });
        }
        // Validate session cityId matches resolved city
        if (session.cityId !== city.id) {
            return reply.status(403).send({ error: 'Forbidden' });
        }
        // Get tickets
        const { data: tickets, error: ticketsError } = await supabase
            .from('tickets')
            .select(`
        conversation_id,
        status,
        department,
        urgent,
        ticket_ref,
        contact_name,
        contact_email,
        contact_phone,
        contact_location,
        consent_at,
        created_at,
        updated_at,
        internal_note
      `)
            .eq('city_id', city.id)
            .order('updated_at', { ascending: false });
        if (ticketsError) {
            request.log.error(ticketsError, 'Failed to fetch tickets');
            return reply.status(500).send({ error: 'Internal server error' });
        }
        // Get conversation data for tickets
        const conversationIds = (tickets || []).map(t => t.conversation_id);
        let conversations = [];
        if (conversationIds.length > 0) {
            const { data: convData, error: convError } = await supabase
                .from('conversations')
                .select('id, category, fallback_count')
                .in('id', conversationIds);
            if (convError) {
                request.log.warn(convError, 'Failed to fetch conversation data for tickets');
            }
            else {
                conversations = convData || [];
            }
        }
        // Create a map for quick lookup
        const convMap = new Map();
        conversations.forEach(conv => {
            convMap.set(conv.id, conv);
        });
        const formattedTickets = (tickets || []).map((ticket) => {
            const conv = convMap.get(ticket.conversation_id);
            return {
                conversationUuid: ticket.conversation_id,
                status: ticket.status,
                department: ticket.department,
                urgent: ticket.urgent || false,
                ticket_ref: ticket.ticket_ref,
                fallback_count: conv?.fallback_count || 0,
                contact_name: ticket.contact_name,
                contact_email: ticket.contact_email,
                contact_phone: ticket.contact_phone,
                contact_location: ticket.contact_location,
                note: null, // Note field not in schema, return null
                consent_at: ticket.consent_at,
                created_at: ticket.created_at,
                updated_at: ticket.updated_at,
                category: conv?.category || null,
                internal_note: ticket.internal_note ?? null,
            };
        });
        return reply.send(formattedTickets);
    }
    catch (error) {
        request.log.error(error, 'Internal server error');
        return reply.status(500).send({ error: 'Internal server error' });
    }
}
/**
 * PATCH /admin/:cityCode/tickets/:conversationUuid
 * Update ticket workflow fields. Authenticated via admin cookie; city isolation enforced.
 */
export async function patchTicketHandler(request, reply) {
    const session = await getSession(request);
    if (!session) {
        return reply.status(401).send({ error: 'Unauthorized' });
    }
    if (session.role !== 'admin' && session.role !== 'inbox') {
        return reply.status(403).send({ error: 'Forbidden' });
    }
    const { cityCode, conversationUuid } = request.params;
    const body = request.body || {};
    try {
        const city = await resolveCity(cityCode);
        if (!city) {
            return reply.status(404).send({ error: 'City not found' });
        }
        if (session.cityId !== city.id) {
            return reply.status(403).send({ error: 'Forbidden' });
        }
        const { data: ticket, error: fetchError } = await supabase
            .from('tickets')
            .select('conversation_id, city_id')
            .eq('conversation_id', conversationUuid)
            .eq('city_id', city.id)
            .single();
        if (fetchError || !ticket) {
            return reply.status(404).send({ error: 'Ticket not found' });
        }
        const updates = { updated_at: new Date().toISOString() };
        if (body.status !== undefined) {
            const valid = ['open', 'in_progress', 'resolved'].includes(body.status);
            if (!valid) {
                return reply.status(400).send({ error: 'Invalid status' });
            }
            updates.status = body.status;
        }
        if (body.department !== undefined)
            updates.department = body.department;
        if (body.urgent !== undefined)
            updates.urgent = body.urgent;
        if (body.internal_note !== undefined)
            updates.internal_note = body.internal_note;
        const { error: updateError } = await supabase
            .from('tickets')
            .update(updates)
            .eq('conversation_id', conversationUuid)
            .eq('city_id', city.id);
        if (updateError) {
            request.log.error(updateError, 'Failed to update ticket');
            return reply.status(500).send({ error: 'Internal server error' });
        }
        return reply.send({ ok: true });
    }
    catch (error) {
        request.log.error(error, 'Internal server error');
        return reply.status(500).send({ error: 'Internal server error' });
    }
}
/**
 * Register admin read routes
 */
export async function registerAdminReadRoutes(server) {
    server.get('/admin/:cityCode/conversations', getConversationsHandler);
    server.get('/admin/:cityCode/conversations/:conversationUuid/messages', getConversationMessagesHandler);
    server.get('/admin/:cityCode/tickets', getTicketsHandler);
    server.patch('/admin/:cityCode/tickets/:conversationUuid', patchTicketHandler);
}
