/**
 * Document retrieval service using vector similarity search
 */
import { supabase } from '../db/supabase.js';
import { embed } from '../embedding.js';
const TOP_K = 5;
const SIMILARITY_THRESHOLD = 0.5;
const MAX_DOC_CHARS = 2000;
const MAX_TOTAL_CONTEXT_CHARS = 8000;
/**
 * Retrieve relevant documents for a query using vector similarity search
 */
export async function retrieveDocuments(query) {
    try {
        // Generate embedding for the query
        const queryEmbedding = await embed(query);
        // Retrieve documents using match_documents RPC
        const { data: documents, error } = await supabase.rpc('match_documents', {
            query_embedding: queryEmbedding,
            match_threshold: SIMILARITY_THRESHOLD,
            match_count: TOP_K,
        });
        if (error) {
            console.error('Error retrieving documents:', error);
            return [];
        }
        if (!documents || documents.length === 0) {
            return [];
        }
        // Filter out documents with similarity below threshold and return
        return documents
            .filter((doc) => doc.similarity >= SIMILARITY_THRESHOLD)
            .map((doc) => ({
            id: doc.id,
            title: doc.title,
            source_url: doc.source_url,
            content: doc.content,
            similarity: doc.similarity,
        }));
    }
    catch (error) {
        console.error('Error in retrieveDocuments:', error);
        return [];
    }
}
/**
 * Build context string from retrieved documents
 */
export function buildContext(documents) {
    if (documents.length === 0) {
        return '';
    }
    let context = '';
    for (const doc of documents) {
        if (!doc.content)
            continue;
        const truncated = doc.content.length > MAX_DOC_CHARS
            ? doc.content.substring(0, MAX_DOC_CHARS)
            : doc.content;
        const title = doc.title || 'Untitled';
        const source = doc.source_url || 'N/A';
        const docSection = `DOC ${documents.indexOf(doc) + 1} TITLE: ${title}\nSOURCE: ${source}\nCONTENT: ${truncated}\n---\n`;
        // Stop if adding this doc would exceed limit
        if (context.length + docSection.length > MAX_TOTAL_CONTEXT_CHARS) {
            break;
        }
        context += docSection;
    }
    return context;
}
