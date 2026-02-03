import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { streamChat, generateConversationTitleSummary } from '../services/llm.js';
import { retrieveDocuments, buildContext } from '../services/retrieval.js';
import { updateConversationFallback } from './events.js';
import { CHAT_RATE_LIMIT } from '../middleware/rateLimit.js';
import { supabase } from '../db/supabase.js';
import { randomUUID } from 'crypto';
import Groq from 'groq-sdk';

interface ChatBody {
  message: string;
  conversationId?: string;
  messageId?: string; // Stable client-generated messageId for idempotent insertion
  messageUuid?: string; // Legacy: External message ID from widget (deprecated, use messageId)
}

interface ChatParams {
  cityId: string;
}

/**
 * POST /grad/:cityId/chat
 * Stream chat responses using Server-Sent Events (SSE)
 */
export async function chatHandler(
  request: FastifyRequest<{ 
    Params: ChatParams;
    Body: ChatBody;
  }>,
  reply: FastifyReply
) {
  const { cityId } = request.params;
  const { message, messageId, messageUuid } = request.body || {};

  // Validate input
  if (!message || typeof message !== 'string') {
    return reply.status(400).send({ error: 'Missing or invalid message field' });
  }

  if (!cityId) {
    return reply.status(400).send({ error: 'Missing cityId parameter' });
  }

  // Hijack the response to handle streaming manually
  reply.hijack();

  // Set CORS headers (required when hijacking response - bypasses Fastify CORS plugin)
  const origin = request.headers.origin;
  if (origin) {
    reply.raw.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    reply.raw.setHeader('Access-Control-Allow-Origin', '*');
  }
  reply.raw.setHeader('Access-Control-Allow-Credentials', 'true');
  reply.raw.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  reply.raw.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Set SSE headers
  reply.raw.setHeader('Content-Type', 'text/event-stream');
  reply.raw.setHeader('Cache-Control', 'no-cache');
  reply.raw.setHeader('Connection', 'keep-alive');
  reply.raw.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  const { conversationId } = request.body || {};

  // Track trace data
  const traceStartTime = Date.now();
  const model = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
  let usedFallback = false;
  let retrievedDocs: Array<{ title: string | null; source: string | null; score: number }> = [];
  let conversationUuid: string | null = null;
  let cityUuid: string | null = null;
  let assistantResponse = '';
  let existingConv: { id: string; fallback_count: number | null; created_at: string; category: string | null; status: string | null } | null = null;

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
        request.log.warn({ cityId }, 'City not found');
        return reply.status(404).send({ error: 'unknown_city' });
      }
      city = cityByCode;
    }
    cityUuid = city.id;

    // Resolve or create conversation
    const externalConversationId = conversationId || `conv_${randomUUID()}`;
    const now = new Date().toISOString();
    
    const { data: existingConvData, error: lookupError } = await supabase
      .from('conversations')
      .select('id, fallback_count, created_at, category, status')
      .eq('city_id', cityUuid)
      .eq('external_id', externalConversationId)
      .limit(1)
      .maybeSingle();

    if (lookupError) {
      request.log.warn(lookupError, 'Error looking up conversation by external_id, treating as new');
    }

    if (existingConvData) {
      existingConv = existingConvData;
      conversationUuid = existingConv.id;
      // Update last_activity_at
      await supabase
        .from('conversations')
        .update({ last_activity_at: now, updated_at: now })
        .eq('id', conversationUuid);
    } else {
      conversationUuid = randomUUID();
      const { error: convError } = await supabase
        .from('conversations')
        .insert({
          id: conversationUuid,
          city_id: cityUuid,
          external_id: externalConversationId,
          created_at: now,
          updated_at: now,
          status: 'open',
          fallback_count: 0,
          needs_human: false,
        });

      if (convError) {
        request.log.error({ conversationUuid, external_id: externalConversationId }, 'Failed to create conversation');
        // Continue anyway, don't fail the request
      }
    }

    // Insert user message
    if (conversationUuid) {
      try {
        const userMessageUuid = randomUUID();
        // Use stable messageId for idempotent insertion (reused on retries)
        // Format: user:{messageId} or fallback to legacy messageUuid or generate UUID
        const externalMessageId = messageId 
          ? `user:${messageId}` 
          : messageUuid || `user:${randomUUID()}`;
        
        // Log idempotency info (temporary debugging)
        request.log.info({
          conversationUuid,
          messageId: messageId || null,
          userExternalId: externalMessageId,
        }, 'Message insertion: user message');
        
        await supabase
          .from('messages')
          .upsert({
            id: userMessageUuid,
            conversation_id: conversationUuid,
            external_id: externalMessageId,
            role: 'user',
            content_redacted: message,
            created_at: now,
          }, {
            onConflict: 'conversation_id,external_id',
          });

        // Update last_message_at
        await supabase
          .from('conversations')
          .update({ last_message_at: now })
          .eq('id', conversationUuid);

        // Check if this is the first user message
        const { data: userMessages, error: msgCountError } = await supabase
          .from('messages')
          .select('id')
          .eq('conversation_id', conversationUuid)
          .eq('role', 'user');

        const isFirstUserMessage = !msgCountError && userMessages && userMessages.length === 1;

        if (isFirstUserMessage) {
          // Get current conversation to check if title is empty
          const { data: conv } = await supabase
            .from('conversations')
            .select('title, title_source')
            .eq('id', conversationUuid)
            .single();

          // Set title from first message if title is empty
          if (conv && (!conv.title || conv.title.trim() === '')) {
            const truncatedTitle = message.trim().slice(0, 60);
            await supabase
              .from('conversations')
              .update({
                title: truncatedTitle,
                title_source: 'first_message',
              })
              .eq('id', conversationUuid);
          }
        }
      } catch (error) {
        request.log.warn({ error, conversationUuid }, 'Failed to insert user message');
      }
    }

    // Retrieve relevant documents (scoped by city_id)
    if (!cityUuid) {
      request.log.error({ cityId }, 'City UUID not resolved, cannot retrieve documents');
      return reply.status(500).send({ error: 'City resolution failed' });
    }
    const documents = await retrieveDocuments(message, cityUuid);
    const context = buildContext(documents);

    // Capture top 3 retrieved docs for trace
    retrievedDocs = documents.slice(0, 3).map(doc => ({
      title: doc.title,
      source: doc.source_url || null,
      score: doc.similarity,
    }));

    // Fallback: if no documents retrieved or all have low similarity
    if (documents.length === 0) {
      usedFallback = true;
      
      // Check if DEMO_MODE is enabled
      const demoMode = process.env.DEMO_MODE === 'true';
      
      if (demoMode) {
        // Demo mode: Use general assistant LLM call instead of fallback message
        try {
          const apiKey = process.env.GROQ_API_KEY;
          if (!apiKey) {
            throw new Error('GROQ_API_KEY environment variable is not set');
          }
          
          const groq = new Groq({ apiKey });
          const demoModel = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
          
          // General assistant system prompt for demo mode
          const demoSystemPrompt = `Ti si AI asistent gradskih usluga.

PRAVILA IDENTITETA (KRITIČNO):
- NIKADA se ne referiraj na sebe kao "chatbot".
- UVJEK se referiraj na sebe kao "AI asistent" ili "AI pomoćnik".
- Ne spominji da si demo osim ako nije eksplicitno pitano.
- Govori kao razvojni, adaptivni sustav koji uči iz potreba građana.
- Ton: profesionalan, smiren, ljudski, pouzdan.
- Drži uvod kratko (maksimalno 3 rečenice).

Ako te pitaju tko si ili što radiš:
- Daj kratko, samopouzdano objašnjenje.
- Završi jednim jednostavnim potpitanjem.

PRAVILA STILA ODGOVORA (KRITIČNO):
- Drži odgovore kratke i razgovorne (2–4 rečenice maksimalno).
- NIKADA ne koristi duga nabrajanja osim ako nije eksplicitno traženo.
- Preferiraj jedan kratak odlomak umjesto bullet pointova.
- Ako nabrajaš mogućnosti, sažmi ih u jednu ili dvije rečenice.
- UVJEK pozovi korisnika da postavi sljedeće pitanje.
- Zvuči ljudski, korisno i smireno — ne kao dokumentacija.

Ako korisnik pita općenito što možeš:
- Daj kratak sažetak mogućnosti.
- Završi mekim pitanjem poput:
  "Što vas konkretno zanima?" ili
  "Možete mi malo pojasniti situaciju?"

OPĆENITO:
- Ako je službeni kontekst dostupan, koristi ga.
- Ako kontekst nije dostupan, odgovori općenito i praktično (kako gradovi obično funkcioniraju).
- Izbjegavaj izmišljanje specifičnih brojeva/datuma/pravnih tvrdnji.`;
          
          const groqMessages = [
            {
              role: 'system' as const,
              content: demoSystemPrompt,
            },
            {
              role: 'user' as const,
              content: message,
            },
          ];
          
          // Stream tokens from LLM
          const stream = await groq.chat.completions.create({
            model: demoModel,
            messages: groqMessages,
            stream: true,
          });
          
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content;
            if (content && content.length > 0) {
              reply.raw.write(`data: ${content}\n\n`);
              assistantResponse += content;
            }
          }
          
          // Send completion signal
          reply.raw.write('data: [DONE]\n\n');
        } catch (error) {
          // If LLM call fails in demo mode, fall back to original message
          request.log.warn({ error }, 'Demo mode LLM call failed, using fallback message');
          const fallbackMessage = 'Ne mogu pouzdano odgovoriti iz dostupnih dokumenata. Pokušajte preformulirati pitanje.';
          reply.raw.write(`data: ${fallbackMessage}\n\n`);
          assistantResponse = fallbackMessage;
          reply.raw.write('data: [DONE]\n\n');
        }
      } else {
        // Original behavior: Stream fallback message (widget expects answer/text field, so stream it as tokens)
        const fallbackMessage = 'Ne mogu pouzdano odgovoriti iz dostupnih dokumenata. Pokušajte preformulirati pitanje.';
        // Stream message token by token to match success response format
        reply.raw.write(`data: ${fallbackMessage}\n\n`);
        assistantResponse = fallbackMessage;
        
        // Send completion signal
        reply.raw.write('data: [DONE]\n\n');
      }
      
      // Emit meta event with trace data (include needs_human explicitly)
      const latencyMs = Date.now() - traceStartTime;
      const traceData = {
        model,
        latency_ms: latencyMs,
        retrieved_docs_count: 0,
        retrieved_docs_top3: [],
        used_fallback: true,
        needs_human: false, // Explicitly set to false - never infer from fallback
      };
      reply.raw.write(`event: meta\ndata: ${JSON.stringify(traceData)}\n\n`);
      
      // Log before responding
      request.log.info({
        conversationUuid,
        needs_human: false,
        action_type: null,
        fallback_count: existingConv ? (existingConv.fallback_count || 0) + 1 : 1,
        error_present: false,
      }, 'Fallback response (no documents) - needs_human=false');
      
      reply.raw.end();

        // Log assistant message (fallback case)
        if (conversationUuid) {
          try {
            const assistantMessageUuid = randomUUID();
            const assistantMessageTime = new Date().toISOString();
            // Use stable messageId for idempotent insertion (same messageId as user message)
            const externalMessageId = messageId 
              ? `assistant:${messageId}` 
              : `assistant:${randomUUID()}`;
            
            // Log idempotency info (temporary debugging)
            request.log.info({
              conversationUuid,
              messageId: messageId || null,
              assistantExternalId: externalMessageId,
            }, 'Message insertion: assistant message (fallback)');
            
            await supabase
              .from('messages')
              .upsert({
                id: assistantMessageUuid,
                conversation_id: conversationUuid,
                external_id: externalMessageId,
                role: 'assistant',
                content_redacted: assistantResponse, // Use fallback message
                created_at: assistantMessageTime,
                metadata: {
                  latency_ms: latencyMs,
                  confidence: null,
                  retrieved_sources_count: 0,
                  resolved_by_ai: false,
                  used_fallback: true,
                },
              }, {
                onConflict: 'conversation_id,external_id',
              });

          // Update last_message_at
          await supabase
            .from('conversations')
            .update({ last_message_at: assistantMessageTime })
            .eq('id', conversationUuid);

          // Check if we should generate LLM title/summary (same logic as success case)
          const { data: allMessages } = await supabase
            .from('messages')
            .select('role, content_redacted')
            .eq('conversation_id', conversationUuid)
            .order('created_at', { ascending: true });

          const { data: conv } = await supabase
            .from('conversations')
            .select('title_source')
            .eq('id', conversationUuid)
            .single();

          if (allMessages && conv && conv.title_source !== 'llm') {
            const userMessageCount = allMessages.filter(m => m.role === 'user').length;
            const totalMessageCount = allMessages.length;

            if (userMessageCount >= 2 || totalMessageCount >= 4) {
              // Generate title/summary using LLM (non-blocking)
              generateConversationTitleSummary(
                allMessages.map(m => ({
                  role: m.role as 'user' | 'assistant',
                  content: m.content_redacted || '',
                }))
              )
                .then(result => {
                  if (result) {
                    return supabase
                      .from('conversations')
                      .update({
                        title: result.title,
                        summary: result.summary,
                        title_source: 'llm',
                        title_generated_at: new Date().toISOString(),
                      })
                      .eq('id', conversationUuid);
                  } else {
                    // Fallback: use first user message title if LLM fails
                    const firstUserMsg = allMessages.find(m => m.role === 'user');
                    if (firstUserMsg && firstUserMsg.content_redacted) {
                      const truncatedTitle = firstUserMsg.content_redacted.trim().slice(0, 60);
                      return supabase
                        .from('conversations')
                        .update({
                          title: truncatedTitle,
                          title_source: 'first_message',
                        })
                        .eq('id', conversationUuid);
                    }
                  }
                })
                .catch(async (error) => {
                  request.log.warn({ error, conversationUuid }, 'Failed to generate conversation title/summary');
                  // Fallback: use first user message title
                  const firstUserMsg = allMessages.find(m => m.role === 'user');
                  if (firstUserMsg && firstUserMsg.content_redacted) {
                    const truncatedTitle = firstUserMsg.content_redacted.trim().slice(0, 60);
                    try {
                      await supabase
                        .from('conversations')
                        .update({
                          title: truncatedTitle,
                          title_source: 'first_message',
                        })
                        .eq('id', conversationUuid);
                    } catch {
                      // Ignore errors in fallback
                    }
                  }
                });
            }
          }
        } catch (error) {
          request.log.warn({ error, conversationUuid }, 'Failed to insert assistant message (fallback)');
        }

        // Create ticket (handle missing fields gracefully)
        try {
          const ticketData: any = {
            conversation_id: conversationUuid,
            city_id: cityUuid!,
            status: 'open',
            created_at: now,
            updated_at: now,
          };
          // Only add reason/question if columns exist (handle gracefully)
          try {
            await supabase
              .from('tickets')
              .upsert(ticketData, {
                onConflict: 'conversation_id',
              });
          } catch (err: any) {
            // If error is about missing columns, try without them
            if (err.message?.includes('column') && err.message?.includes('does not exist')) {
              await supabase
                .from('tickets')
                .upsert(ticketData, {
                  onConflict: 'conversation_id',
                });
            } else {
              throw err;
            }
          }
        } catch (error) {
          request.log.warn({ error, conversationUuid }, 'Failed to create ticket (non-fatal)');
        }

        // Upsert knowledge gap (case-insensitive match)
        try {
          const normalizedQuestion = message.trim().toLowerCase();
          // Search for existing gap with case-insensitive match
          const { data: existingGaps } = await supabase
            .from('knowledge_gaps')
            .select('id, occurrences, question')
            .limit(100); // Get recent gaps to check

          // Find case-insensitive match
          const existingGap = existingGaps?.find(gap => 
            (gap.question || '').trim().toLowerCase() === normalizedQuestion
          );

          if (existingGap) {
            await supabase
              .from('knowledge_gaps')
              .update({
                occurrences: (existingGap.occurrences || 1) + 1,
                last_seen_at: now,
              })
              .eq('id', existingGap.id);
          } else {
            await supabase
              .from('knowledge_gaps')
              .insert({
                conversation_id: conversationUuid,
                question: message,
                occurrences: 1,
                reason: 'no_sources',
                status: 'open',
                last_seen_at: now,
                created_at: now,
              });
          }
        } catch (error) {
          request.log.warn({ error, conversationUuid }, 'Failed to upsert knowledge gap (non-fatal, table may not exist)');
        }

        // Update conversation fallback count (DO NOT set needs_human - only set when explicitly required)
        if (existingConv) {
          await supabase
            .from('conversations')
            .update({
              fallback_count: (existingConv.fallback_count || 0) + 1,
              needs_human: false, // Explicitly set to false - never infer from fallback
              last_activity_at: now,
            })
            .eq('id', conversationUuid);
        }
      }

      // Note: Removed updateConversationFallback call - it was setting needs_human=true incorrectly
      // needs_human should only be set when classifier/intent explicitly requires it or ticket_intake_submitted

      return;
    }

    // Convert user message to chat format
    const messages = [
      {
        role: 'user' as const,
        content: message,
      },
    ];

    // Stream tokens from LLM with context and collect response
    for await (const token of streamChat({ messages, context })) {
      // Format as SSE: data: token\n\n
      reply.raw.write(`data: ${token}\n\n`);
      assistantResponse += token;
    }

    // Send completion signal
    reply.raw.write('data: [DONE]\n\n');
    
    // Emit meta event with trace data (include needs_human explicitly)
    const latencyMs = Date.now() - traceStartTime;
    const traceData = {
      model,
      latency_ms: latencyMs,
      retrieved_docs_count: documents.length,
      retrieved_docs_top3: retrievedDocs,
      used_fallback: false,
      needs_human: false, // Explicitly set to false
    };
    reply.raw.write(`event: meta\ndata: ${JSON.stringify(traceData)}\n\n`);
    
    // Log before responding
    request.log.info({
      conversationUuid,
      needs_human: false,
      action_type: null,
      fallback_count: existingConv?.fallback_count || 0,
      error_present: false,
    }, 'Success response - needs_human=false');
    
    reply.raw.end();

    // Log assistant message with metadata
    if (conversationUuid && assistantResponse) {
      try {
        const assistantMessageUuid = randomUUID();
        const assistantMessageTime = new Date().toISOString();
        // Determine confidence based on similarity scores
        const avgSimilarity = retrievedDocs.length > 0
          ? retrievedDocs.reduce((sum, doc) => sum + (doc.score || 0), 0) / retrievedDocs.length
          : 0;
        const confidence = avgSimilarity >= 0.7 ? 'high' : avgSimilarity >= 0.5 ? 'medium' : 'low';
        // Use stable messageId for idempotent insertion (same messageId as user message)
        const externalMessageId = messageId 
          ? `assistant:${messageId}` 
          : `assistant:${randomUUID()}`;

        // Log idempotency info (temporary debugging)
        request.log.info({
          conversationUuid,
          messageId: messageId || null,
          assistantExternalId: externalMessageId,
        }, 'Message insertion: assistant message (success)');

        await supabase
          .from('messages')
          .upsert({
            id: assistantMessageUuid,
            conversation_id: conversationUuid,
            external_id: externalMessageId,
            role: 'assistant',
            content_redacted: assistantResponse,
            created_at: assistantMessageTime,
            metadata: {
              latency_ms: latencyMs,
              confidence,
              retrieved_sources_count: documents.length,
              resolved_by_ai: true,
              used_fallback: false,
            },
          }, {
            onConflict: 'conversation_id,external_id',
          });

        // Update last_message_at
        await supabase
          .from('conversations')
          .update({ last_message_at: assistantMessageTime })
          .eq('id', conversationUuid);

        // Check if we should generate LLM title/summary
        // Conditions: at least 2 user messages OR 4 total messages, and title_source is not 'llm'
        const { data: allMessages } = await supabase
          .from('messages')
          .select('role, content_redacted')
          .eq('conversation_id', conversationUuid)
          .order('created_at', { ascending: true });

        const { data: conv } = await supabase
          .from('conversations')
          .select('title_source')
          .eq('id', conversationUuid)
          .single();

        if (allMessages && conv && conv.title_source !== 'llm') {
          const userMessageCount = allMessages.filter(m => m.role === 'user').length;
          const totalMessageCount = allMessages.length;

          if (userMessageCount >= 2 || totalMessageCount >= 4) {
            // Generate title/summary using LLM (non-blocking)
            generateConversationTitleSummary(
              allMessages.map(m => ({
                role: m.role as 'user' | 'assistant',
                content: m.content_redacted || '',
              }))
            )
              .then(result => {
                if (result) {
                  return supabase
                    .from('conversations')
                    .update({
                      title: result.title,
                      summary: result.summary,
                      title_source: 'llm',
                      title_generated_at: new Date().toISOString(),
                    })
                    .eq('id', conversationUuid);
                } else {
                  // Fallback: use first user message title if LLM fails
                  const firstUserMsg = allMessages.find(m => m.role === 'user');
                  if (firstUserMsg && firstUserMsg.content_redacted) {
                    const truncatedTitle = firstUserMsg.content_redacted.trim().slice(0, 60);
                    return supabase
                      .from('conversations')
                      .update({
                        title: truncatedTitle,
                        title_source: 'first_message',
                      })
                      .eq('id', conversationUuid);
                  }
                }
              })
              .catch(async (error) => {
                request.log.warn({ error, conversationUuid }, 'Failed to generate conversation title/summary');
                // Fallback: use first user message title
                const firstUserMsg = allMessages.find(m => m.role === 'user');
                if (firstUserMsg && firstUserMsg.content_redacted) {
                  const truncatedTitle = firstUserMsg.content_redacted.trim().slice(0, 60);
                  try {
                    await supabase
                      .from('conversations')
                      .update({
                        title: truncatedTitle,
                        title_source: 'first_message',
                      })
                      .eq('id', conversationUuid);
                  } catch {
                    // Ignore errors in fallback
                  }
                }
              });
          }
        }
      } catch (error) {
        request.log.warn({ error, conversationUuid }, 'Failed to insert assistant message');
      }
    }
  } catch (error) {
    request.log.error(error);
    
    // Stream error message (widget expects answer/text field, so stream it as tokens)
    const errorMessage = 'Došlo je do pogreške. Pokušajte ponovno.';
    reply.raw.write(`data: ${errorMessage}\n\n`);
    
    // Send completion signal
    reply.raw.write('data: [DONE]\n\n');
    
    // Emit meta event with trace data (include needs_human explicitly)
    const latencyMs = Date.now() - traceStartTime;
    const traceData = {
      model,
      latency_ms: latencyMs,
      retrieved_docs_count: retrievedDocs.length,
      retrieved_docs_top3: retrievedDocs,
      used_fallback: false,
      needs_human: false, // Explicitly set to false - never set on errors
    };
    reply.raw.write(`event: meta\ndata: ${JSON.stringify(traceData)}\n\n`);
    
    // Log before responding (error case)
    request.log.info({
      conversationUuid,
      needs_human: false,
      action_type: null,
      fallback_count: existingConv?.fallback_count || 0,
      error_present: true,
    }, 'Error response - needs_human=false (never set on errors)');
    
    // Ensure conversation stays needs_human=false on error (never infer from errors)
    if (conversationUuid) {
      try {
        await supabase
          .from('conversations')
          .update({ needs_human: false })
          .eq('id', conversationUuid);
      } catch (updateError) {
        request.log.warn({ updateError, conversationUuid }, 'Failed to ensure needs_human=false on error');
      }
    }
    
    reply.raw.end();
  }
}

/**
 * OPTIONS handler for CORS preflight
 */
export async function chatOptionsHandler(
  request: FastifyRequest<{ Params: ChatParams }>,
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
 * Register chat routes
 * Rate limit runs in onRequest before handler → 429 before any SSE.
 * OPTIONS has no config.rateLimit → never rate limited.
 */
export async function registerChatRoutes(server: FastifyInstance) {
  server.options('/grad/:cityId/chat', chatOptionsHandler);
  server.post('/grad/:cityId/chat', { config: { rateLimit: CHAT_RATE_LIMIT } }, chatHandler);
}
