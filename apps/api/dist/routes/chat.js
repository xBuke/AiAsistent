import { streamChat } from '../services/llm.js';
import { retrieveDocuments, buildContext } from '../services/retrieval.js';
import { updateConversationFallback } from './events.js';
import { CHAT_RATE_LIMIT } from '../middleware/rateLimit.js';
/**
 * POST /grad/:cityId/chat
 * Stream chat responses using Server-Sent Events (SSE)
 */
export async function chatHandler(request, reply) {
    const { cityId } = request.params;
    const { message } = request.body || {};
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
    }
    else {
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
    let retrievedDocs = [];
    try {
        // Retrieve relevant documents
        const documents = await retrieveDocuments(message);
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
            const fallbackMessage = 'U dostupnim službenim dokumentima ne nalazim točnu informaciju za vaše pitanje. Možete li navesti više detalja (npr. ulica/naselje) ili želite da ovaj upit proslijedim nadležnoj službi?';
            // Stream fallback message word by word (token-like) for consistency with LLM streaming
            const words = fallbackMessage.split(/(\s+)/);
            for (const word of words) {
                reply.raw.write(`data: ${word}\n\n`);
            }
            reply.raw.write('data: [DONE]\n\n');
            // Emit meta event with trace data
            const latencyMs = Date.now() - traceStartTime;
            const traceData = {
                model,
                latency_ms: latencyMs,
                retrieved_docs_count: 0,
                retrieved_docs_top3: [],
                used_fallback: true,
            };
            reply.raw.write(`event: meta\ndata: ${JSON.stringify(traceData)}\n\n`);
            reply.raw.end();
            // Update conversation if conversationId is provided
            if (conversationId) {
                try {
                    await updateConversationFallback(cityId, conversationId);
                }
                catch (error) {
                    request.log.warn({ error, conversationId }, 'Failed to update conversation fallback');
                }
            }
            return;
        }
        // Convert user message to chat format
        const messages = [
            {
                role: 'user',
                content: message,
            },
        ];
        // Stream tokens from LLM with context
        for await (const token of streamChat({ messages, context })) {
            // Format as SSE: data: token\n\n
            reply.raw.write(`data: ${token}\n\n`);
        }
        // Send completion signal
        reply.raw.write('data: [DONE]\n\n');
        // Emit meta event with trace data
        const latencyMs = Date.now() - traceStartTime;
        const traceData = {
            model,
            latency_ms: latencyMs,
            retrieved_docs_count: documents.length,
            retrieved_docs_top3: retrievedDocs,
            used_fallback: false,
        };
        reply.raw.write(`event: meta\ndata: ${JSON.stringify(traceData)}\n\n`);
        reply.raw.end();
    }
    catch (error) {
        request.log.error(error);
        reply.raw.write(`data: [ERROR] ${error instanceof Error ? error.message : 'Unknown error'}\n\n`);
        reply.raw.end();
    }
}
/**
 * OPTIONS handler for CORS preflight
 */
export async function chatOptionsHandler(request, reply) {
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
 * Register chat routes
 * Rate limit runs in onRequest before handler → 429 before any SSE.
 * OPTIONS has no config.rateLimit → never rate limited.
 */
export async function registerChatRoutes(server) {
    server.options('/grad/:cityId/chat', chatOptionsHandler);
    server.post('/grad/:cityId/chat', { config: { rateLimit: CHAT_RATE_LIMIT } }, chatHandler);
}
