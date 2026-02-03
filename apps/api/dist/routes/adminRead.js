import { supabase } from '../db/supabase.js';
/** Map UI status to stored ticket status (public.tickets.status). */
function mapStatusToStored(input) {
    const t = input?.trim();
    if (t === 'Otvoreno')
        return 'open';
    if (t === 'Riješeno')
        return 'closed';
    if (t === 'resolved')
        return 'closed';
    return t;
}
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
 * Helper function to fetch conversations with first user message and message count
 * Used by both inbox and conversations endpoints
 */
async function fetchConversationsWithDetails(cityId, filterNeedsHuman) {
    let query = supabase
        .from('conversations')
        .select(`
      id,
      external_id,
      created_at,
      updated_at,
      submitted_at,
      last_activity_at,
      category,
      needs_human,
      status,
      fallback_count,
      title,
      summary
    `)
        .eq('city_id', cityId);
    // Apply needs_human filter if specified
    if (filterNeedsHuman !== undefined) {
        if (filterNeedsHuman === true) {
            // Inbox: ONLY needs_human = true
            query = query.eq('needs_human', true);
        }
        else {
            // Conversations: needs_human = false OR null (treat null as false)
            query = query.or('needs_human.is.null,needs_human.eq.false');
        }
    }
    // Sort by last_activity_at DESC (nulls last), then updated_at DESC, then created_at DESC
    // Note: Supabase PostgREST supports multiple order() calls
    const { data: conversations, error: convError } = await query
        .order('last_activity_at', { ascending: false, nullsFirst: false })
        .order('updated_at', { ascending: false })
        .order('created_at', { ascending: false });
    if (convError) {
        throw convError;
    }
    // Get message counts and first user message for each conversation
    const conversationsWithCounts = await Promise.all((conversations || []).map(async (conv) => {
        const { count, error: countError } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('conversation_id', conv.id);
        const messageCount = countError ? 0 : (count || 0);
        // Get first user message for title
        const { data: firstUserMessage } = await supabase
            .from('messages')
            .select('content_redacted')
            .eq('conversation_id', conv.id)
            .eq('role', 'user')
            .order('created_at', { ascending: true })
            .limit(1)
            .single();
        const firstUserMessageText = firstUserMessage?.content_redacted || null;
        return {
            conversationUuid: conv.id,
            externalConversationId: conv.external_id || null,
            createdAt: conv.created_at,
            updatedAt: conv.updated_at,
            submittedAt: conv.submitted_at || null,
            lastActivityAt: conv.last_activity_at || null,
            category: conv.category,
            needsHuman: conv.needs_human || false,
            status: conv.status,
            fallbackCount: conv.fallback_count || 0,
            messageCount,
            firstUserMessage: firstUserMessageText,
            title: conv.title || null,
            summary: conv.summary || null,
        };
    }));
    return conversationsWithCounts;
}
/**
 * GET /admin/:cityCode/inbox
 * Returns list of VALID tickets from tickets table, sorted by created_at desc
 * Valid ticket = contact_name IS NOT NULL AND (contact_phone IS NOT NULL OR contact_email IS NOT NULL)
 * Tickets table is the single source of truth for Inbox
 */
export async function getInboxHandler(request, reply) {
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
        // Get tickets from tickets table - single source of truth
        // Filter ONLY valid tickets: contact_name IS NOT NULL AND (contact_phone IS NOT NULL OR contact_email IS NOT NULL)
        // Order by created_at DESC (time of form submission)
        const { data: tickets, error: ticketsError } = await supabase
            .from('tickets')
            .select(`
        conversation_id,
        status,
        department,
        urgent,
        contact_name,
        contact_phone,
        contact_email,
        contact_location,
        contact_note,
        consent_at,
        ticket_ref,
        created_at,
        updated_at
      `)
            .eq('city_id', city.id)
            .not('contact_name', 'is', null)
            .or('contact_phone.not.is.null,contact_email.not.is.null')
            .order('created_at', { ascending: false });
        if (ticketsError) {
            request.log.error(ticketsError, 'Failed to fetch tickets');
            return reply.status(500).send({ error: 'Internal server error' });
        }
        // Safety filter: Ensure only valid tickets (contact_name IS NOT NULL AND (contact_phone IS NOT NULL OR contact_email IS NOT NULL))
        // This is a safety net in case the Supabase query syntax needs adjustment
        const validTickets = (tickets || []).filter(ticket => {
            return ticket.contact_name !== null &&
                ticket.contact_name !== undefined &&
                (ticket.contact_phone !== null && ticket.contact_phone !== undefined ||
                    ticket.contact_email !== null && ticket.contact_email !== undefined);
        });
        // Get conversation data for display (title, summary, first user message, etc.)
        // but tickets table remains the source of truth for what appears in inbox
        const conversationIds = validTickets.map(t => t.conversation_id);
        let conversationsData = {};
        let messagesData = {};
        if (conversationIds.length > 0) {
            // Get conversations for display fields
            const { data: conversations } = await supabase
                .from('conversations')
                .select('id, title, summary, category, submitted_at, last_activity_at')
                .in('id', conversationIds);
            if (conversations) {
                conversations.forEach(conv => {
                    conversationsData[conv.id] = conv;
                });
            }
            // Get first user message for each conversation
            const { data: firstMessages } = await supabase
                .from('messages')
                .select('conversation_id, content_redacted')
                .in('conversation_id', conversationIds)
                .eq('role', 'user')
                .order('created_at', { ascending: true });
            if (firstMessages) {
                // Group by conversation_id and take first message per conversation
                const firstByConv = new Map();
                firstMessages.forEach(msg => {
                    if (!firstByConv.has(msg.conversation_id)) {
                        firstByConv.set(msg.conversation_id, msg.content_redacted || '');
                    }
                });
                firstByConv.forEach((content, convId) => {
                    messagesData[convId] = content;
                });
            }
        }
        // Build response: ticket fields as primary, with conversation display fields
        const inboxItems = validTickets.map(ticket => {
            const conv = conversationsData[ticket.conversation_id] || {};
            const firstUserMessage = messagesData[ticket.conversation_id] || null;
            return {
                conversation_id: ticket.conversation_id,
                status: ticket.status,
                department: ticket.department,
                urgent: ticket.urgent || false,
                contact_name: ticket.contact_name,
                contact_phone: ticket.contact_phone,
                contact_email: ticket.contact_email,
                contact_location: ticket.contact_location,
                contact_note: ticket.contact_note ?? null,
                consent_at: ticket.consent_at,
                ticket_ref: ticket.ticket_ref,
                created_at: ticket.created_at,
                updated_at: ticket.updated_at,
                // Display fields from conversations (for UI compatibility)
                title: conv.title || null,
                summary: conv.summary || null,
                category: conv.category || null,
                submitted_at: conv.submitted_at || null,
                last_activity_at: conv.last_activity_at || null,
                first_user_message: firstUserMessage,
            };
        });
        return reply.send(inboxItems);
    }
    catch (error) {
        request.log.error(error, 'Internal server error');
        return reply.status(500).send({ error: 'Internal server error' });
    }
}
/**
 * GET /admin/:cityCode/conversations
 * Returns list of conversations where needs_human = false, EXCLUDING conversations that have tickets.
 * A conversation has a ticket if its id exists in tickets table.
 * Sorted by last_activity_at desc
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
        // Get conversations with needs_human = false
        const conversationsWithCounts = await fetchConversationsWithDetails(city.id, false);
        // EXCLUDE conversations that have tickets with assigned ticket_ref (ticketed only when ticket_ref is assigned)
        // A conversation is ticketed only if it has a ticket with ticket_ref IS NOT NULL
        const { data: tickets, error: ticketsError } = await supabase
            .from('tickets')
            .select('conversation_id')
            .eq('city_id', city.id)
            .not('ticket_ref', 'is', null);
        if (ticketsError) {
            request.log.error(ticketsError, 'Failed to fetch tickets for exclusion');
            return reply.status(500).send({ error: 'Internal server error' });
        }
        // Build set of conversation IDs that have tickets
        const ticketConversationIds = new Set((tickets || []).map(t => t.conversation_id));
        // Filter out conversations that have tickets
        const conversationsWithoutTickets = conversationsWithCounts.filter(conv => !ticketConversationIds.has(conv.conversationUuid));
        return reply.send(conversationsWithoutTickets);
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
 * GET /admin/:cityCode/conversations/:conversationUuid
 * Returns conversation detail with meta, messages, and notes
 */
export async function getConversationDetailHandler(request, reply) {
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
        // Get conversation with meta fields
        const { data: conversation, error: convError } = await supabase
            .from('conversations')
            .select('id, city_id, submitted_at, last_activity_at, needs_human, status, category, created_at, updated_at, title, summary')
            .eq('id', conversationUuid)
            .single();
        if (convError || !conversation) {
            return reply.status(404).send({ error: 'Conversation not found' });
        }
        if (conversation.city_id !== city.id) {
            return reply.status(403).send({ error: 'Forbidden' });
        }
        // Get ticket for detail card/modal (read-only: ref, status, contact fields, consent)
        const { data: ticket } = await supabase
            .from('tickets')
            .select('ticket_ref, status, department, urgent, contact_name, contact_phone, contact_email, contact_location, contact_note, consent_at')
            .eq('conversation_id', conversationUuid)
            .single();
        // Get messages with timestamps
        const { data: messages, error: msgError } = await supabase
            .from('messages')
            .select('id, role, content_redacted, created_at, external_id, metadata')
            .eq('conversation_id', conversationUuid)
            .order('created_at', { ascending: true });
        if (msgError) {
            request.log.error(msgError, 'Failed to fetch messages');
            return reply.status(500).send({ error: 'Internal server error' });
        }
        // Get notes ordered by created_at DESC
        const { data: notes, error: notesError } = await supabase
            .from('conversation_notes')
            .select('id, note, created_at')
            .eq('conversation_id', conversationUuid)
            .order('created_at', { ascending: false });
        if (notesError) {
            request.log.error(notesError, 'Failed to fetch notes');
            return reply.status(500).send({ error: 'Internal server error' });
        }
        // Get ticket intake data from tickets table (single source of truth)
        // Transform to match expected intake format for backward compatibility
        const { data: ticketIntakeData, error: intakeError } = await supabase
            .from('tickets')
            .select('contact_name, contact_phone, contact_email, contact_location, contact_note, consent_at, created_at')
            .eq('conversation_id', conversationUuid)
            .maybeSingle();
        if (intakeError) {
            request.log.warn(intakeError, 'Failed to fetch ticket intake (non-fatal)');
        }
        // Transform tickets table data to match expected intake format
        const ticketIntake = ticketIntakeData ? {
            name: ticketIntakeData.contact_name,
            phone: ticketIntakeData.contact_phone,
            email: ticketIntakeData.contact_email,
            address: ticketIntakeData.contact_location,
            description: ticketIntakeData.contact_note,
            consent_given: ticketIntakeData.consent_at !== null,
            consent_text: null, // Not stored in tickets table
            consent_timestamp: ticketIntakeData.consent_at,
            created_at: ticketIntakeData.created_at,
        } : null;
        return reply.send({
            conversation: {
                id: conversation.id,
                submitted_at: conversation.submitted_at,
                last_activity_at: conversation.last_activity_at,
                needs_human: conversation.needs_human,
                status: conversation.status,
                department: ticket?.department || null,
                urgent: ticket?.urgent || false,
                category: conversation.category,
                tags: [], // Tags can be added later if needed
                created_at: conversation.created_at,
                updated_at: conversation.updated_at,
                title: conversation.title || null,
                summary: conversation.summary || null,
            },
            messages: (messages || []).map((msg) => ({
                id: msg.id,
                role: msg.role,
                content_redacted: msg.content_redacted,
                created_at: msg.created_at,
                external_id: msg.external_id || null,
                metadata: msg.metadata || null,
            })),
            notes: (notes || []).map((note) => ({
                id: note.id,
                note: note.note,
                created_at: note.created_at,
            })),
            ticket_intake: ticketIntake || null,
            ticket: ticket
                ? {
                    ticket_ref: ticket.ticket_ref ?? null,
                    status: ticket.status ?? null,
                    department: ticket.department ?? null,
                    urgent: ticket.urgent ?? false,
                    contact_name: ticket.contact_name ?? null,
                    contact_phone: ticket.contact_phone ?? null,
                    contact_email: ticket.contact_email ?? null,
                    contact_location: ticket.contact_location ?? null,
                    contact_note: ticket.contact_note ?? null,
                    consent_at: ticket.consent_at ?? null,
                }
                : undefined,
        });
    }
    catch (error) {
        request.log.error(error, 'Internal server error');
        return reply.status(500).send({ error: 'Internal server error' });
    }
}
/**
 * POST /admin/:cityCode/conversations/:conversationUuid/notes
 * Add an append-only admin note to a conversation
 */
export async function postConversationNoteHandler(request, reply) {
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
    const body = request.body || {};
    // Validate note
    if (!body.note || typeof body.note !== 'string') {
        return reply.status(400).send({ error: 'Note is required and must be a string' });
    }
    const noteText = body.note.trim();
    if (noteText.length === 0) {
        return reply.status(400).send({ error: 'Note cannot be empty' });
    }
    if (noteText.length > 2000) {
        return reply.status(400).send({ error: 'Note cannot exceed 2000 characters' });
    }
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
        const now = new Date().toISOString();
        // Insert note
        const { data: note, error: noteError } = await supabase
            .from('conversation_notes')
            .insert({
            conversation_id: conversationUuid,
            note: noteText,
            created_at: now,
        })
            .select('id, note, created_at')
            .single();
        if (noteError) {
            request.log.error(noteError, 'Failed to insert note');
            return reply.status(500).send({ error: 'Internal server error' });
        }
        // Update conversation last_activity_at
        await supabase
            .from('conversations')
            .update({ last_activity_at: now })
            .eq('id', conversationUuid);
        return reply.send(note);
    }
    catch (error) {
        request.log.error(error, 'Internal server error');
        return reply.status(500).send({ error: 'Internal server error' });
    }
}
/**
 * PATCH /admin/:cityCode/conversations/:conversationUuid
 * Autosave: Update conversation status/department/urgent/needs_human and update last_activity_at
 */
export async function patchConversationHandler(request, reply) {
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
    const body = request.body || {};
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
        const now = new Date().toISOString();
        const updates = {
            last_activity_at: now,
            updated_at: now,
        };
        if (body.needs_human !== undefined) {
            updates.needs_human = body.needs_human;
        }
        const { error: convUpdateError } = await supabase
            .from('conversations')
            .update(updates)
            .eq('id', conversationUuid);
        if (convUpdateError) {
            request.log.error(convUpdateError, 'Failed to update conversation');
            return reply.status(500).send({ error: 'Internal server error' });
        }
        // Update ticket fields if status, department or urgent provided
        if (body.status !== undefined || body.department !== undefined || body.urgent !== undefined) {
            const ticketUpdates = {
                updated_at: now,
            };
            if (body.status !== undefined) {
                const mapped = mapStatusToStored(body.status);
                const valid = ['open', 'closed', 'contact_requested', 'needs_human'].includes(mapped);
                if (!valid) {
                    return reply.status(400).send({ error: 'Invalid status' });
                }
                ticketUpdates.status = mapped;
            }
            if (body.department !== undefined) {
                ticketUpdates.department = body.department;
            }
            if (body.urgent !== undefined) {
                ticketUpdates.urgent = body.urgent;
            }
            const { data: existingTicket } = await supabase
                .from('tickets')
                .select('conversation_id')
                .eq('conversation_id', conversationUuid)
                .eq('city_id', city.id)
                .single();
            if (existingTicket) {
                const { error: ticketUpdateError } = await supabase
                    .from('tickets')
                    .update(ticketUpdates)
                    .eq('conversation_id', conversationUuid)
                    .eq('city_id', city.id);
                if (ticketUpdateError) {
                    request.log.error(ticketUpdateError, 'Failed to update ticket');
                    return reply.status(500).send({ error: 'Internal server error' });
                }
            }
            else {
                const { error: ticketCreateError } = await supabase
                    .from('tickets')
                    .insert({
                    conversation_id: conversationUuid,
                    city_id: city.id,
                    ...ticketUpdates,
                    created_at: now,
                });
                if (ticketCreateError) {
                    request.log.error(ticketCreateError, 'Failed to create ticket');
                    return reply.status(500).send({ error: 'Internal server error' });
                }
            }
        }
        // Fetch and return updated conversation row
        const { data: updatedConversation, error: fetchError } = await supabase
            .from('conversations')
            .select(`
        id,
        external_id,
        created_at,
        updated_at,
        submitted_at,
        last_activity_at,
        category,
        needs_human,
        status,
        fallback_count
      `)
            .eq('id', conversationUuid)
            .single();
        if (fetchError) {
            request.log.error(fetchError, 'Failed to fetch updated conversation');
            return reply.status(500).send({ error: 'Internal server error' });
        }
        const { data: ticket } = await supabase
            .from('tickets')
            .select('status, department, urgent')
            .eq('conversation_id', conversationUuid)
            .single();
        return reply.send({
            id: updatedConversation.id,
            external_id: updatedConversation.external_id,
            created_at: updatedConversation.created_at,
            updated_at: updatedConversation.updated_at,
            submitted_at: updatedConversation.submitted_at,
            last_activity_at: updatedConversation.last_activity_at,
            category: updatedConversation.category,
            needs_human: updatedConversation.needs_human,
            status: ticket?.status ?? updatedConversation.status ?? null,
            fallback_count: updatedConversation.fallback_count,
            department: ticket?.department || null,
            urgent: ticket?.urgent || false,
        });
    }
    catch (error) {
        request.log.error(error, 'Internal server error');
        return reply.status(500).send({ error: 'Internal server error' });
    }
}
/**
 * Extract email from text using simple regex
 */
function extractEmail(text) {
    if (!text)
        return null;
    // Simple email pattern: word chars, dots, hyphens, @, domain
    const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
    const match = text.match(emailPattern);
    return match ? match[0] : null;
}
/**
 * Extract Croatian phone number from text using simple regex
 */
function extractPhone(text) {
    if (!text)
        return null;
    // Croatian phone patterns:
    // +385 XX XXX XXXX, +385XXXXXXXXX, 0XX XXX XXXX, 0XXXXXXXXX
    // Also matches variations with spaces/dashes
    const phonePatterns = [
        /\+385\s*\d{1,2}\s*\d{3}\s*\d{3,4}/, // +385 XX XXX XXXX
        /\+385\d{8,9}/, // +385XXXXXXXXX
        /0\d{1,2}\s*\d{3}\s*\d{3,4}/, // 0XX XXX XXXX
        /0\d{8,9}/, // 0XXXXXXXXX
    ];
    for (const pattern of phonePatterns) {
        const match = text.match(pattern);
        if (match) {
            // Normalize: remove spaces, ensure +385 format if starts with 0
            let phone = match[0].replace(/\s+/g, '');
            if (phone.startsWith('0')) {
                phone = '+385' + phone.substring(1);
            }
            return phone;
        }
    }
    return null;
}
/**
 * GET /admin/:cityCode/tickets
 * Returns list of tickets (conversations needing human follow-up) sorted by updated_at desc
 * A ticket is a conversation where needs_human=true OR fallback_count>0
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
        // Get conversations that need human follow-up
        // A ticket is: needs_human=true OR fallback_count>0
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
            .or('needs_human.eq.true,fallback_count.gt.0')
            .order('updated_at', { ascending: false });
        if (convError) {
            request.log.error(convError, 'Failed to fetch conversations');
            return reply.status(500).send({ error: 'Internal server error' });
        }
        // If no conversations, return empty array
        if (!conversations || conversations.length === 0) {
            return reply.send([]);
        }
        // For each conversation, fetch user messages to extract issue preview and contact info
        const conversationIds = conversations.map(c => c.id);
        // Get all user messages for these conversations
        const { data: userMessages, error: msgError } = await supabase
            .from('messages')
            .select('id, conversation_id, content_redacted, created_at')
            .eq('role', 'user')
            .in('conversation_id', conversationIds)
            .order('created_at', { ascending: true });
        if (msgError) {
            request.log.warn(msgError, 'Failed to fetch user messages for contact extraction');
        }
        // Get ticket intake data from tickets table (single source of truth)
        const { data: ticketsData, error: intakeError } = await supabase
            .from('tickets')
            .select('conversation_id, contact_name, contact_phone, contact_email, contact_location, contact_note, consent_at, created_at')
            .in('conversation_id', conversationIds)
            .order('created_at', { ascending: false });
        if (intakeError) {
            request.log.warn(intakeError, 'Failed to fetch ticket intake data');
        }
        // Transform tickets table data to match expected intake format
        const ticketIntakes = (ticketsData || []).map(t => ({
            conversation_id: t.conversation_id,
            name: t.contact_name,
            phone: t.contact_phone,
            email: t.contact_email,
            address: t.contact_location,
            description: t.contact_note,
            consent_given: t.consent_at !== null,
            consent_text: null, // Not stored in tickets table
            consent_timestamp: t.consent_at,
            created_at: t.created_at,
        }));
        // Group messages by conversation_id
        const messagesByConv = new Map();
        (userMessages || []).forEach(msg => {
            const convId = msg.conversation_id;
            if (!messagesByConv.has(convId)) {
                messagesByConv.set(convId, []);
            }
            messagesByConv.get(convId).push(msg);
        });
        // Group intakes by conversation_id (take most recent if multiple)
        const intakesByConv = new Map();
        (ticketIntakes || []).forEach(intake => {
            const convId = intake.conversation_id;
            // Only keep the first (most recent) intake per conversation
            if (!intakesByConv.has(convId)) {
                intakesByConv.set(convId, intake);
            }
        });
        // Build tickets with issue preview, contact extraction, and intake data
        const tickets = conversations.map(conv => {
            const messages = messagesByConv.get(conv.id) || [];
            const intake = intakesByConv.get(conv.id) || null;
            // Get latest user message (or first if no latest) as issue preview
            const latestMessage = messages.length > 0
                ? messages[messages.length - 1]
                : null;
            const issuePreview = latestMessage?.content_redacted || null;
            // Extract contact info from all user messages (fallback if no intake)
            let contactEmail = null;
            let contactPhone = null;
            // Prefer intake data, fallback to message extraction
            if (intake) {
                contactEmail = intake.email || null;
                contactPhone = intake.phone || null;
            }
            else {
                // Check all user messages for contact info
                for (const msg of messages) {
                    const content = msg.content_redacted || '';
                    if (!contactEmail) {
                        contactEmail = extractEmail(content);
                    }
                    if (!contactPhone) {
                        contactPhone = extractPhone(content);
                    }
                    // Stop if both found
                    if (contactEmail && contactPhone)
                        break;
                }
            }
            return {
                conversationUuid: conv.id,
                external_id: conv.external_id || null,
                created_at: conv.created_at,
                updated_at: conv.updated_at,
                category: conv.category || null,
                fallback_count: conv.fallback_count || 0,
                needs_human: conv.needs_human || false,
                status: conv.status || null,
                issue_preview: issuePreview,
                contact_email: contactEmail,
                contact_phone: contactPhone,
                intake: intake ? {
                    name: intake.name,
                    phone: intake.phone || null,
                    email: intake.email || null,
                    address: intake.address || null,
                    description: intake.description,
                    consent_given: intake.consent_given,
                    consent_text: intake.consent_text,
                    consent_timestamp: intake.consent_timestamp,
                    created_at: intake.created_at,
                } : null,
            };
        });
        return reply.send(tickets);
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
        // Update conversation last_activity_at when ticket is updated
        await supabase
            .from('conversations')
            .update({ last_activity_at: new Date().toISOString() })
            .eq('id', conversationUuid);
        return reply.send({ ok: true });
    }
    catch (error) {
        request.log.error(error, 'Internal server error');
        return reply.status(500).send({ error: 'Internal server error' });
    }
}
/**
 * GET /admin/:cityCode/reports
 * Returns dashboard metrics based on real database data
 */
export async function getReportsHandler(request, reply) {
    // Check authentication
    const session = await getSession(request);
    if (!session) {
        return reply.status(401).send({ error: 'Unauthorized' });
    }
    // Check role (admin only for reports)
    if (session.role !== 'admin') {
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
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        // Get all conversations for this city first
        const { data: cityConversations } = await supabase
            .from('conversations')
            .select('id')
            .eq('city_id', city.id);
        const conversationIds = (cityConversations || []).map(c => c.id);
        if (conversationIds.length === 0) {
            // No conversations, return empty metrics
            return reply.send({
                questions24h: 0,
                questions7d: 0,
                questions30d: 0,
                uniqueSessions7d: 0,
                fallbackRate: 0,
                fallbackCount: 0,
                avgLatency: null,
                questionsByDay: Array.from({ length: 7 }, (_, i) => {
                    const dayStart = new Date(now.getTime() - (6 - i) * 24 * 60 * 60 * 1000);
                    const dateStr = dayStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    return { date: dateStr, count: 0 };
                }),
                topCategories: [],
            });
        }
        // 1. Total Questions (24h / 7d / 30d) - filter by conversation_id in city
        const { count: questions24h } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('role', 'user')
            .in('conversation_id', conversationIds)
            .gte('created_at', oneDayAgo.toISOString());
        const { count: questions7d } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('role', 'user')
            .in('conversation_id', conversationIds)
            .gte('created_at', sevenDaysAgo.toISOString());
        const { count: questions30d } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('role', 'user')
            .in('conversation_id', conversationIds)
            .gte('created_at', thirtyDaysAgo.toISOString());
        // Get all user messages in last 7 days for further calculations
        const { data: userMessages7d } = await supabase
            .from('messages')
            .select('conversation_id, created_at')
            .eq('role', 'user')
            .in('conversation_id', conversationIds)
            .gte('created_at', sevenDaysAgo.toISOString());
        // 2. Unique Sessions (7d) - distinct conversations with user messages
        const uniqueConversationIds = new Set((userMessages7d || []).map(m => m.conversation_id));
        // 3. Fallback Rate (7d)
        // Count assistant messages with used_fallback = true
        const { data: assistantMessages7d } = await supabase
            .from('messages')
            .select('metadata')
            .eq('role', 'assistant')
            .in('conversation_id', conversationIds)
            .gte('created_at', sevenDaysAgo.toISOString());
        const fallbackCount = (assistantMessages7d || []).filter(msg => {
            const metadata = msg.metadata;
            return metadata?.used_fallback === true || metadata?.used_fallback === 'true';
        }).length;
        const totalQuestions7d = questions7d || 0;
        const fallbackRate = totalQuestions7d > 0 ? fallbackCount / totalQuestions7d : 0;
        // 4. Avg Latency (7d)
        const latencyValues = [];
        (assistantMessages7d || []).forEach(msg => {
            const metadata = msg.metadata;
            if (metadata?.latency_ms !== null && metadata?.latency_ms !== undefined) {
                const latency = typeof metadata.latency_ms === 'string'
                    ? parseFloat(metadata.latency_ms)
                    : metadata.latency_ms;
                if (!isNaN(latency) && latency > 0) {
                    latencyValues.push(latency);
                }
            }
        });
        const avgLatency = latencyValues.length > 0
            ? Math.round(latencyValues.reduce((a, b) => a + b, 0) / latencyValues.length)
            : null;
        // 5. Questions per Day (last 7 days)
        const questionsByDay = [];
        for (let i = 6; i >= 0; i--) {
            const dayStart = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
            const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
            const dateStr = dayStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const dayCount = (userMessages7d || []).filter(msg => {
                const msgDate = new Date(msg.created_at);
                return msgDate >= dayStart && msgDate < dayEnd;
            }).length;
            questionsByDay.push({ date: dateStr, count: dayCount });
        }
        // 6. Top Categories (last 7 days)
        // Get conversations that have user messages in the window and belong to this city
        const conversationIds7d = Array.from(uniqueConversationIds);
        let topCategories = [];
        if (conversationIds7d.length > 0) {
            const { data: conversations7d } = await supabase
                .from('conversations')
                .select('category')
                .in('id', conversationIds7d)
                .eq('city_id', city.id)
                .not('category', 'is', null);
            const categoryCounts = new Map();
            (conversations7d || []).forEach(conv => {
                if (conv.category) {
                    categoryCounts.set(conv.category, (categoryCounts.get(conv.category) || 0) + 1);
                }
            });
            topCategories = Array.from(categoryCounts.entries())
                .map(([category, count]) => ({ category, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 5);
        }
        return reply.send({
            questions24h: questions24h || 0,
            questions7d: questions7d || 0,
            questions30d: questions30d || 0,
            uniqueSessions7d: uniqueConversationIds.size,
            fallbackRate,
            fallbackCount,
            avgLatency,
            questionsByDay,
            topCategories,
        });
    }
    catch (error) {
        request.log.error(error, 'Internal server error');
        return reply.status(500).send({ error: 'Internal server error' });
    }
}
/**
 * GET /admin/:cityCode/conversations/:conversationUuid/title
 * Get conversation title and summary
 */
async function getConversationTitleHandler(request, reply) {
    const session = await getSession(request);
    if (!session) {
        return reply.status(401).send({ error: 'Unauthorized' });
    }
    const { cityCode, conversationUuid } = request.params;
    try {
        const city = await resolveCity(cityCode);
        if (!city) {
            return reply.status(404).send({ error: 'City not found' });
        }
        // Verify conversation belongs to city
        const { data: conversation, error: convError } = await supabase
            .from('conversations')
            .select('id, title, summary, title_source, title_generated_at')
            .eq('id', conversationUuid)
            .eq('city_id', city.id)
            .single();
        if (convError || !conversation) {
            return reply.status(404).send({ error: 'Conversation not found' });
        }
        return reply.send({
            title: conversation.title || null,
            summary: conversation.summary || null,
            title_source: conversation.title_source || null,
            title_generated_at: conversation.title_generated_at || null,
        });
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
    server.get('/admin/:cityCode/inbox', getInboxHandler);
    server.get('/admin/:cityCode/conversations', getConversationsHandler);
    server.get('/admin/:cityCode/conversations/:conversationUuid', getConversationDetailHandler);
    server.get('/admin/:cityCode/conversations/:conversationUuid/messages', getConversationMessagesHandler);
    server.get('/admin/:cityCode/conversations/:conversationUuid/title', getConversationTitleHandler);
    server.post('/admin/:cityCode/conversations/:conversationUuid/notes', postConversationNoteHandler);
    server.patch('/admin/:cityCode/conversations/:conversationUuid', patchConversationHandler);
    server.get('/admin/:cityCode/tickets', getTicketsHandler);
    server.patch('/admin/:cityCode/tickets/:conversationUuid', patchTicketHandler);
    server.get('/admin/:cityCode/reports', getReportsHandler);
}
