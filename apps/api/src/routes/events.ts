import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { supabase } from '../db/supabase.js';
import { randomUUID } from 'crypto';
import { EVENTS_RATE_LIMIT } from '../middleware/rateLimit.js';

interface EventBody {
  type: string;
  conversationId?: string;
  messageId?: string;
  role?: 'user' | 'assistant';
  content?: string;
  question?: string;
  timestamp?: number;
  ticket?: {
    status?: string;
    ticketRef?: string;
    contact?: {
      name?: string;
      phone?: string;
      email?: string;
      location?: string;
      note?: string;
      consentAt?: number;
    };
    department?: string;
    urgent?: boolean;
  };
  intake?: {
    name: string;
    phone?: string;
    email?: string;
    address?: string;
    description: string;
    contact_note?: string;
    consent_given: boolean;
    consent_text: string;
    consent_timestamp: number;
  };
  meta?: Record<string, any>;
  metadata?: Record<string, any>; // Debug trace metadata for assistant messages
  category?: string;
  needsHuman?: boolean;
}

interface EventParams {
  cityId: string;
}

// Category IDs must match admin UI exactly (apps/web admin utils/categories + analytics/categorize).
// Order used for "first match wins". Keywords lowercased; match on latest user message.
const CATEGORY_ORDER = [
  'contacts_hours', 'forms_requests', 'utilities_communal', 'budget_finance',
  'tenders_jobs', 'acts_decisions', 'permits_solutions', 'social_support',
  'events_news', 'issue_reporting', 'general', 'spam',
] as const;

const CATEGORY_KEYWORDS: Record<string, string[]> = {
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

function classifyByKeywords(text: string): string | null {
  const t = text.toLowerCase().trim();
  for (const w of SPAM_WORDS) {
    if (t.includes(w)) return 'spam';
  }
  for (const cat of CATEGORY_ORDER) {
    if (cat === 'general' || cat === 'spam') continue;
    const kw = CATEGORY_KEYWORDS[cat] ?? [];
    for (const k of kw) {
      if (t.includes(k)) return cat;
    }
  }
  return null;
}

/**
 * POST /grad/:cityId/events
 * Ingest analytics events from widget
 */
export async function eventsHandler(
  request: FastifyRequest<{ 
    Params: EventParams;
    Body: EventBody;
  }>,
  reply: FastifyReply
) {
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
    let responseTicketRef: string | null = null;

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

    let conversationUuid: string;

    // B) If found, use its UUID
    if (existingConv) {
      conversationUuid = existingConv.id;
      request.log.info({ conversationUuid, externalConversationId }, 'Found existing conversation');
    } else {
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

    // Update existing conversation if needed (fallback count, needs_human, updated_at, last_activity_at).
    // Category: only set via auto-classify when null; never overwrite existing or use body.category.
    if (existingConv) {
      const fallbackCount = existingConv.fallback_count || 0;
      const newFallbackCount = body.type === 'fallback' ? fallbackCount + 1 : fallbackCount;
      const updatePayload: Record<string, unknown> = {
        updated_at: now,
        last_activity_at: now, // Update last_activity_at on any conversation activity
        needs_human: body.needsHuman ?? false,
        fallback_count: newFallbackCount,
      };

      const userMsgContent = typeof body.content === 'string' ? body.content : '';
      const shouldClassify =
        existingConv.category == null &&
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

    // C) Message persistence handled by /chat endpoint only to prevent duplicates
    // Messages are persisted by /chat only to prevent duplicates; /events is telemetry-only.
    // The /events endpoint receives message events for analytics/telemetry but does not insert into messages table.
    if (body.type === 'message' && body.role && body.content) {
      // Log event receipt for telemetry (no database insertion)
      request.log.info({ 
        conversationUuid, 
        role: body.role, 
        contentLength: body.content.length 
      }, 'Message event received (telemetry only, not persisted)');
      
      // Update conversation last_activity_at for telemetry tracking
      await supabase
        .from('conversations')
        .update({ last_activity_at: timestamp })
        .eq('id', conversationUuid);
    }

    // D) Ticket upsert when type in ["ticket_update","contact_submit"] or body.ticket present
    const shouldUpsertTicket = 
      body.type === 'ticket_update' || 
      body.type === 'contact_submit' || 
      body.ticket !== undefined;

    if (shouldUpsertTicket && body.ticket) {
      const ticketData: any = {
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
        ticketData.contact_note = body.ticket.contact.note ?? null;

        if (body.ticket.contact.consentAt) {
          ticketData.consent_at = new Date(body.ticket.contact.consentAt).toISOString();
        }
      }

      // Get existing ticket to preserve created_at and ticket_ref
      const { data: existingTicket } = await supabase
        .from('tickets')
        .select('created_at, ticket_ref')
        .eq('conversation_id', conversationUuid)
        .single();

      ticketData.created_at = existingTicket?.created_at || now;

      // Ensure ticket_ref: keep existing or generate via RPC
      if (existingTicket?.ticket_ref) {
        ticketData.ticket_ref = existingTicket.ticket_ref;
      } else {
        const cityCode = city.code || 'PL';
        const { data: nextRef, error: rpcError } = await supabase.rpc('next_ticket_ref', {
          p_city_id: city.id,
          p_city_code: cityCode,
        });
        if (rpcError) {
          request.log.error({ conversationUuid, error: rpcError }, 'next_ticket_ref RPC failed');
          return reply.status(500).send({ error: 'Failed to generate ticket ref' });
        }
        ticketData.ticket_ref = nextRef ?? null;
      }

      const { error: ticketError } = await supabase
        .from('tickets')
        .upsert(ticketData, {
          onConflict: 'conversation_id',
        });

      if (ticketError) {
        request.log.error({ conversationUuid, external_id: externalConversationId }, 'Failed to upsert ticket');
        return reply.status(500).send({ error: 'Failed to upsert ticket' });
      }
      responseTicketRef = ticketData.ticket_ref ?? null;

      // Update conversation last_activity_at when ticket status/department/urgent changes
      await supabase
        .from('conversations')
        .update({ last_activity_at: now })
        .eq('id', conversationUuid);
    }

    // E) Handle ticket_intake_submitted event
    if (body.type === 'ticket_intake_submitted') {
      const intakeData = (body.intake ?? body) as NonNullable<EventBody['intake']>;
      
      // Validate required fields (consent and at least one contact method)
      if (!intakeData.name || !intakeData.description || !intakeData.consent_given) {
        request.log.warn({ conversationUuid }, 'Invalid intake data: missing required fields');
        return reply.status(400).send({ error: 'Missing required intake fields' });
      }
      
      // Validate at least one contact method
      if (!intakeData.phone && !intakeData.email) {
        request.log.warn({ conversationUuid }, 'Invalid intake data: missing contact method');
        return reply.status(400).send({ error: 'Phone or email is required' });
      }

      // Extract contact_note, prioritizing contact_note field, then fallback to description
      const intakeWithNote = intakeData as { contact_note?: string; note?: string; napomena?: string; message?: string; description?: string };
      const contactNote = intakeWithNote.contact_note
        ?? intakeWithNote.note
        ?? (intakeData as { napomena?: string }).napomena
        ?? (intakeData as { message?: string }).message
        ?? intakeData.description
        ?? null;

      // Validate contact_note is present and non-empty
      if (!contactNote || !contactNote.trim()) {
        request.log.warn({ conversationUuid }, 'Invalid intake data: missing or empty contact_note');
        return reply.status(400).send({ error: 'Molimo unesite opis problema.' });
      }

      // Upsert into tickets (single source of truth; do not use ticket_intakes)
      const { data: existingTicket } = await supabase
        .from('tickets')
        .select('created_at, ticket_ref')
        .eq('conversation_id', conversationUuid)
        .single();

      const ticketData: any = {
        conversation_id: conversationUuid,
        city_id: city.id,
        status: 'open',
        contact_name: intakeData.name || null,
        contact_phone: intakeData.phone || null,
        contact_email: intakeData.email || null,
        contact_location: intakeData.address || null,
        contact_note: contactNote,
        updated_at: now,
        created_at: existingTicket?.created_at || now,
      };
      if (intakeData.consent_given && intakeData.consent_timestamp) {
        ticketData.consent_at = new Date(intakeData.consent_timestamp).toISOString();
      }

      // Ensure ticket_ref: keep existing or generate via RPC
      if (existingTicket?.ticket_ref) {
        ticketData.ticket_ref = existingTicket.ticket_ref;
      } else {
        const cityCode = city.code || 'PL';
        const { data: nextRef, error: rpcError } = await supabase.rpc('next_ticket_ref', {
          p_city_id: city.id,
          p_city_code: cityCode,
        });
        if (rpcError) {
          request.log.error({ conversationUuid, error: rpcError }, 'next_ticket_ref RPC failed');
          return reply.status(500).send({ error: 'Failed to generate ticket ref' });
        }
        ticketData.ticket_ref = nextRef ?? null;
      }

      const { error: ticketError } = await supabase
        .from('tickets')
        .upsert(ticketData, { onConflict: 'conversation_id' });

      if (ticketError) {
        request.log.error({ conversationUuid, error: ticketError }, 'Failed to upsert ticket');
        return reply.status(500).send({ error: 'Failed to upsert ticket' });
      }
      
      // Update conversation: set submitted_at, last_activity_at, needs_human=true and status='open'
      const convUpdate: any = {
        needs_human: true,
        status: 'open',
        updated_at: now,
        last_activity_at: now,
        submitted_at: now,
      };
      
      const { error: convUpdateError } = await supabase
        .from('conversations')
        .update(convUpdate)
        .eq('id', conversationUuid);
      
      if (convUpdateError) {
        request.log.error({ conversationUuid, error: convUpdateError }, 'Failed to update conversation after intake');
      }
      responseTicketRef = ticketData.ticket_ref ?? null;
      request.log.info({ conversationUuid }, 'Ticket intake submitted, ticket upserted and conversation updated');
    }

    return reply.status(200).send(responseTicketRef != null ? { ok: true, ticket_ref: responseTicketRef } : { ok: true });
  } catch (error) {
    request.log.error(error, 'Internal server error');
    return reply.status(500).send({ error: 'Internal server error' });
  }
}

/**
 * OPTIONS handler for CORS preflight
 */
export async function eventsOptionsHandler(
  request: FastifyRequest<{ Params: EventParams }>,
  reply: FastifyReply
) {
  const origin = request.headers.origin;
  if (origin) {
    reply.header('Access-Control-Allow-Origin', origin);
  } else {
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
export async function registerEventsRoutes(server: FastifyInstance) {
  server.options('/grad/:cityId/events', eventsOptionsHandler);
  server.post('/grad/:cityId/events', { config: { rateLimit: EVENTS_RATE_LIMIT } }, eventsHandler);
}

/**
 * Internal helper to update conversation with fallback status
 * Used by chat handler when fallback triggers
 */
export async function updateConversationFallback(cityId: string, conversationId: string): Promise<void> {
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
    } else {
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
  } catch (error) {
    console.error('Error updating conversation fallback:', error);
    throw error;
  }
}
