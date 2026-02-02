import { supabase } from '../db/supabase.js';
import { randomUUID } from 'crypto';
import { EVENTS_RATE_LIMIT } from '../middleware/rateLimit.js';
// Category IDs must match admin UI exactly (apps/web admin utils/categories + analytics/categorize).
// Order used for "first match wins". Keywords lowercased; match on latest user message.
const CATEGORY_ORDER = [
    'contacts_hours', 'forms_requests', 'utilities_communal', 'budget_finance',
    'tenders_jobs', 'acts_decisions', 'permits_solutions', 'social_support',
    'events_news', 'issue_reporting', 'general', 'spam',
];
const CATEGORY_KEYWORDS = {
    contacts_hours: ['kontakt', 'telefon', 'email', 'mail', 'radno vrijeme', 'adresa', 'ured'],
    forms_requests: ['obrazac', 'zahtjev', 'ispuniti', 'predati', 'pdf', 'prilog'],
    utilities_communal: ['komunal', 'otpad', 'smeće', 'rasvjeta', 'voda', 'kanal', 'cesta', 'parking'],
    budget_finance: ['proračun', 'rebalans', 'nabava', 'izvješće', 'financ'],
    tenders_jobs: ['natječaj', 'zapošlj', 'posao', 'prijava', 'oglas'],
    acts_decisions: ['odluka', 'pravilnik', 'statut', 'sjednica', 'vijeće'],
    permits_solutions: ['dozvola', 'rješenje', 'građev', 'legaliz', 'suglasnost'],
    social_support: ['potpora', 'stipend', 'socijal', 'naknada'],
    events_news: ['događaj', 'manifest', 'obavijest', 'novost'],
    issue_reporting: ['prijaviti', 'kvar', 'problem', 'rupa', 'ne radi', 'curi', 'buka'],
    general: [],
    spam: [],
};
const SPAM_WORDS = ['kurcina', 'jebem', 'pizda', 'serem', 'jebote'];
function classifyByKeywords(text) {
    const t = text.toLowerCase().trim();
    for (const w of SPAM_WORDS) {
        if (t.includes(w))
            return 'spam';
    }
    for (const cat of CATEGORY_ORDER) {
        if (cat === 'general' || cat === 'spam')
            continue;
        const kw = CATEGORY_KEYWORDS[cat] ?? [];
        for (const k of kw) {
            if (t.includes(k))
                return cat;
        }
    }
    return null;
}
/**
 * POST /grad/:cityId/events
 * Ingest analytics events from widget
 */
export async function eventsHandler(request, reply) {
    const { cityId } = request.params;
    const body = request.body || {};
    // Validate input
    if (!body.type || typeof body.type !== 'string') {
        return reply.status(400).send({ error: 'Missing or invalid type field' });
    }
    if (!cityId) {
        return reply.status(400).send({ error: 'Missing cityId parameter' });
    }
    // Log event receipt
    request.log.info({
        type: body.type,
        cityId,
        conversationId: body.conversationId,
    }, 'Event received');
    try {
        // A) Resolve city by slug first, then fallback to code
        // 1) Try lookup by slug (exact match)
        let { data: city, error: cityError } = await supabase
            .from('cities')
            .select('id, code')
            .eq('slug', cityId)
            .single();
        let matchType = 'slug';
        // 2) Fallback: try by code (uppercased)
        if (cityError || !city) {
            const derivedCode = cityId.toUpperCase();
            const { data: cityByCode, error: codeError } = await supabase
                .from('cities')
                .select('id, code')
                .eq('code', derivedCode)
                .single();
            if (codeError || !cityByCode) {
                request.log.warn({ cityId }, 'City not found');
                return reply.status(404).send({ error: 'unknown_city' });
            }
            city = cityByCode;
            matchType = 'code';
        }
        request.log.info({ cityId, matchType, cityCode: city.code }, 'City resolved');
        const now = new Date().toISOString();
        const timestamp = body.timestamp ? new Date(body.timestamp).toISOString() : now;
        // B) Resolve or create conversation with external_id mapping
        const externalConversationId = body.conversationId || `conv_${randomUUID()}`;
        // A) Try to fetch existing conversation by external_id
        const { data: existingConv, error: lookupError } = await supabase
            .from('conversations')
            .select('id, fallback_count, created_at, category, status')
            .eq('city_id', city.id)
            .eq('external_id', externalConversationId)
            .limit(1)
            .maybeSingle();
        // If lookup fails (e.g., column doesn't exist), log and treat as not found
        if (lookupError) {
            request.log.warn(lookupError, 'Error looking up conversation by external_id, treating as new');
        }
        let conversationUuid;
        // B) If found, use its UUID
        if (existingConv) {
            conversationUuid = existingConv.id;
            request.log.info({ conversationUuid, externalConversationId }, 'Found existing conversation');
        }
        else {
            // C) If not found, generate new UUID and insert
            conversationUuid = randomUUID();
            const fallbackCount = body.type === 'fallback' ? 1 : 0;
            const userContent = typeof body.content === 'string' ? body.content : '';
            const isFirstUserMessage = body.type === 'message' && body.role === 'user' && userContent.length > 0;
            const initialCategory = isFirstUserMessage
                ? (classifyByKeywords(userContent) ?? body.category ?? null)
                : (body.category ?? null);
            const { error: convError } = await supabase
                .from('conversations')
                .insert({
                id: conversationUuid,
                city_id: city.id,
                external_id: externalConversationId,
                created_at: now,
                updated_at: now,
                status: 'open',
                fallback_count: fallbackCount,
                category: initialCategory,
                needs_human: body.needsHuman ?? false,
            });
            if (convError) {
                request.log.error({ conversationUuid, external_id: externalConversationId }, 'Failed to create conversation');
                return reply.status(500).send({ error: 'Failed to create conversation' });
            }
            request.log.info({ conversationUuid, externalConversationId }, 'Created new conversation');
        }
        // Update existing conversation if needed (fallback count, needs_human, updated_at).
        // Category: only set via auto-classify when null; never overwrite existing or use body.category.
        if (existingConv) {
            const fallbackCount = existingConv.fallback_count || 0;
            const newFallbackCount = body.type === 'fallback' ? fallbackCount + 1 : fallbackCount;
            const updatePayload = {
                updated_at: now,
                needs_human: body.needsHuman ?? false,
                fallback_count: newFallbackCount,
            };
            const userMsgContent = typeof body.content === 'string' ? body.content : '';
            const shouldClassify = existingConv.category == null &&
                (existingConv.status === 'open' || existingConv.status == null) &&
                body.type === 'message' &&
                body.role === 'user' &&
                userMsgContent.length > 0;
            if (shouldClassify) {
                const { count, error: countErr } = await supabase
                    .from('messages')
                    .select('*', { count: 'exact', head: true })
                    .eq('conversation_id', conversationUuid)
                    .eq('role', 'user');
                if (!countErr && (count ?? 0) === 0) {
                    const classified = classifyByKeywords(userMsgContent);
                    if (classified) {
                        updatePayload.category = classified;
                        request.log.info({ conversationUuid, category: classified }, 'Auto-classified conversation');
                    }
                }
            }
            const { error: updateError } = await supabase
                .from('conversations')
                .update(updatePayload)
                .eq('id', conversationUuid);
            if (updateError) {
                request.log.error(updateError, 'Failed to update conversation');
                // Continue processing even if update fails
            }
        }
        // C) Insert message when type == "message"
        if (body.type === 'message' && body.role && body.content) {
            const externalMessageId = body.messageId; // Treat as external_id (text like "assistant_...")
            // Only store metadata for assistant messages
            const messageMetadata = body.role === 'assistant' && body.metadata ? body.metadata : null;
            // De-duplication: Check if message with same external_id already exists for this conversation
            if (externalMessageId) {
                const { data: existingMsg, error: lookupError } = await supabase
                    .from('messages')
                    .select('id')
                    .eq('conversation_id', conversationUuid)
                    .eq('external_id', externalMessageId)
                    .limit(1)
                    .maybeSingle();
                // If lookup fails (e.g., column doesn't exist), log and continue with insert
                if (lookupError) {
                    request.log.warn(lookupError, 'Error looking up message by external_id, continuing with insert');
                }
                // If message already exists, skip insert
                if (existingMsg) {
                    request.log.info({ externalMessageId, conversationUuid }, 'Message already exists, skipping insert');
                    // Continue processing (return ok at end)
                }
                else {
                    // Insert new message with generated UUID and external_id
                    const messageUuid = randomUUID();
                    const insertPayload = {
                        id: messageUuid,
                        external_id: externalMessageId,
                        conversation_id: conversationUuid,
                        role: body.role,
                        content_redacted: body.content,
                        created_at: timestamp,
                    };
                    // Add metadata only for assistant messages
                    if (messageMetadata) {
                        insertPayload.metadata = messageMetadata;
                    }
                    const { error: msgError } = await supabase
                        .from('messages')
                        .insert(insertPayload);
                    if (msgError) {
                        request.log.error({ conversationUuid, external_id: externalMessageId }, 'Failed to insert message');
                        return reply.status(500).send({ error: 'Failed to insert message' });
                    }
                    request.log.info({ messageUuid, externalMessageId, conversationUuid }, 'Inserted new message');
                }
            }
            else {
                // No externalMessageId provided, insert without external_id
                const messageUuid = randomUUID();
                const insertPayload = {
                    id: messageUuid,
                    conversation_id: conversationUuid,
                    role: body.role,
                    content_redacted: body.content,
                    created_at: timestamp,
                };
                // Add metadata only for assistant messages
                if (messageMetadata) {
                    insertPayload.metadata = messageMetadata;
                }
                const { error: msgError } = await supabase
                    .from('messages')
                    .insert(insertPayload);
                if (msgError) {
                    request.log.error({ conversationUuid }, 'Failed to insert message');
                    return reply.status(500).send({ error: 'Failed to insert message' });
                }
                request.log.info({ messageUuid, conversationUuid }, 'Inserted new message without external_id');
            }
        }
        // D) Ticket upsert when type in ["ticket_update","contact_submit"] or body.ticket present
        const shouldUpsertTicket = body.type === 'ticket_update' ||
            body.type === 'contact_submit' ||
            body.ticket !== undefined;
        if (shouldUpsertTicket && body.ticket) {
            const ticketData = {
                conversation_id: conversationUuid,
                city_id: city.id,
                status: body.ticket.status || null,
                department: body.ticket.department || null,
                urgent: body.ticket.urgent ?? false,
                updated_at: now,
            };
            // Handle contact fields
            if (body.ticket.contact) {
                ticketData.contact_name = body.ticket.contact.name || null;
                ticketData.contact_phone = body.ticket.contact.phone || null;
                ticketData.contact_email = body.ticket.contact.email || null;
                ticketData.contact_location = body.ticket.contact.location || null;
                if (body.ticket.contact.consentAt) {
                    ticketData.consent_at = new Date(body.ticket.contact.consentAt).toISOString();
                }
            }
            if (body.ticket.ticketRef) {
                ticketData.ticket_ref = body.ticket.ticketRef;
            }
            // Get existing ticket to preserve created_at
            const { data: existingTicket } = await supabase
                .from('tickets')
                .select('created_at')
                .eq('conversation_id', conversationUuid)
                .single();
            ticketData.created_at = existingTicket?.created_at || now;
            const { error: ticketError } = await supabase
                .from('tickets')
                .upsert(ticketData, {
                onConflict: 'conversation_id',
            });
            if (ticketError) {
                request.log.error({ conversationUuid, external_id: externalConversationId }, 'Failed to upsert ticket');
                return reply.status(500).send({ error: 'Failed to upsert ticket' });
            }
        }
        return reply.status(200).send({ ok: true });
    }
    catch (error) {
        request.log.error(error, 'Internal server error');
        return reply.status(500).send({ error: 'Internal server error' });
    }
}
/**
 * OPTIONS handler for CORS preflight
 */
export async function eventsOptionsHandler(request, reply) {
    const origin = request.headers.origin;
    if (origin) {
        reply.header('Access-Control-Allow-Origin', origin);
    }
    else {
        reply.header('Access-Control-Allow-Origin', '*');
    }
    reply.header('Access-Control-Allow-Credentials', 'true');
    reply.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type');
    return reply.status(204).send();
}
/**
 * Register events routes
 * OPTIONS has no config.rateLimit → never rate limited.
 */
export async function registerEventsRoutes(server) {
    server.options('/grad/:cityId/events', eventsOptionsHandler);
    server.post('/grad/:cityId/events', { config: { rateLimit: EVENTS_RATE_LIMIT } }, eventsHandler);
}
/**
 * Internal helper to update conversation with fallback status
 * Used by chat handler when fallback triggers
 */
export async function updateConversationFallback(cityId, conversationId) {
    try {
        // Resolve city by slug first, then fallback to code
        let { data: city, error: cityError } = await supabase
            .from('cities')
            .select('id, code')
            .eq('slug', cityId)
            .single();
        if (cityError || !city) {
            const derivedCode = cityId.toUpperCase();
            const { data: cityByCode, error: codeError } = await supabase
                .from('cities')
                .select('id, code')
                .eq('code', derivedCode)
                .single();
            if (codeError || !cityByCode) {
                throw new Error('City not found');
            }
            city = cityByCode;
        }
        const now = new Date().toISOString();
        const externalConversationId = conversationId;
        // Find existing conversation
        const { data: existingConv, error: lookupError } = await supabase
            .from('conversations')
            .select('id, fallback_count')
            .eq('city_id', city.id)
            .eq('external_id', externalConversationId)
            .limit(1)
            .maybeSingle();
        if (lookupError) {
            throw new Error(`Failed to lookup conversation: ${lookupError.message}`);
        }
        if (existingConv) {
            // Update existing conversation
            const fallbackCount = (existingConv.fallback_count || 0) + 1;
            const { error: updateError } = await supabase
                .from('conversations')
                .update({
                updated_at: now,
                needs_human: true,
                fallback_count: fallbackCount,
            })
                .eq('id', existingConv.id);
            if (updateError) {
                throw new Error(`Failed to update conversation: ${updateError.message}`);
            }
        }
        else {
            // Create new conversation with fallback status
            const conversationUuid = randomUUID();
            const { error: convError } = await supabase
                .from('conversations')
                .insert({
                id: conversationUuid,
                city_id: city.id,
                external_id: externalConversationId,
                created_at: now,
                updated_at: now,
                status: 'open',
                fallback_count: 1,
                needs_human: true,
            });
            if (convError) {
                throw new Error(`Failed to create conversation: ${convError.message}`);
            }
        }
    }
    catch (error) {
        console.error('Error updating conversation fallback:', error);
        throw error;
    }
}
