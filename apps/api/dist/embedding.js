import OpenAI from 'openai';
const OPENAI_MODEL = 'text-embedding-3-small';
const OPENAI_EMBEDDING_DIM = 512; // OpenAI text-embedding-3-small minimum dimension
const MAX_EMBED_CHARS = 12000;
let openaiClient = null;
function getOpenAIClient() {
    if (!openaiClient) {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error('OPENAI_API_KEY environment variable is not set. Required for embeddings.');
        }
        openaiClient = new OpenAI({ apiKey });
    }
    return openaiClient;
}
/**
 * Generate embedding vector using OpenAI embeddings API
 * Returns embedding vector matching OpenAI text-embedding-3-small dimensions (512)
 */
export async function embed(text) {
    const truncated = text.length > MAX_EMBED_CHARS
        ? text.substring(0, MAX_EMBED_CHARS)
        : text;
    try {
        const client = getOpenAIClient();
        const response = await client.embeddings.create({
            model: OPENAI_MODEL,
            input: truncated,
            dimensions: OPENAI_EMBEDDING_DIM,
        });
        const embedding = response.data[0]?.embedding;
        if (!embedding || !Array.isArray(embedding)) {
            throw new Error('Invalid embedding response from OpenAI API');
        }
        if (embedding.length !== OPENAI_EMBEDDING_DIM) {
            throw new Error(`Expected embedding dimension ${OPENAI_EMBEDDING_DIM}, got ${embedding.length}`);
        }
        return embedding;
    }
    catch (error) {
        // Log error loudly - do NOT silently fail
        console.error('[EMBEDDING ERROR] Failed to generate embedding:', error);
        if (error instanceof Error) {
            console.error('[EMBEDDING ERROR] Error message:', error.message);
            console.error('[EMBEDDING ERROR] Error stack:', error.stack);
        }
        // Re-throw to prevent silent failure
        throw new Error(`Embedding generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}
