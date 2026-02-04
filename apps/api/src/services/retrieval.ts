/**
 * Document retrieval service using vector similarity search
 */

import { supabase } from '../db/supabase.js';
import { embed } from '../embedding.js';

const TOP_K = 5;
const SIMILARITY_THRESHOLD_FIRST_PASS = 0.5;
const SIMILARITY_THRESHOLD_SECOND_PASS = 0.35;
const MAX_DOC_CHARS = 2000;
const MAX_TOTAL_CONTEXT_CHARS = 8000;

interface RetrievedDocument {
  id: string;
  title: string | null;
  source_url: string | null;
  content: string | null;
  similarity: number;
}

/**
 * Retrieve relevant documents for a query using vector similarity search
 * Implements two-pass retrieval: first pass with threshold 0.5, second pass with 0.35 if no results
 * @param query - The search query string
 * @param cityId - The city UUID to scope the search (required)
 */
export async function retrieveDocuments(query: string, cityId: string): Promise<RetrievedDocument[]> {
  // Generate embedding for the query
  // If this fails, let it throw - chat handler will return 500
  const queryEmbedding = await embed(query);

  // First pass: threshold 0.5
  let matchThreshold = SIMILARITY_THRESHOLD_FIRST_PASS;
  let { data: documents, error } = await supabase.rpc('match_documents', {
    query_embedding: queryEmbedding,
    match_threshold: matchThreshold,
    match_count: TOP_K,
    p_city_id: cityId,
  });

  if (error) {
    console.error('[RETRIEVAL ERROR] Supabase RPC error:', error);
    console.error('[RETRIEVAL ERROR] Query:', query);
    console.error('[RETRIEVAL ERROR] City ID:', cityId);
    throw new Error(`Database retrieval failed: ${error.message}`);
  }

  // Second pass: if no results, try with lower threshold 0.35
  if (!documents || documents.length === 0) {
    matchThreshold = SIMILARITY_THRESHOLD_SECOND_PASS;
    const secondPassResult = await supabase.rpc('match_documents', {
      query_embedding: queryEmbedding,
      match_threshold: matchThreshold,
      match_count: TOP_K,
      p_city_id: cityId,
    });

    if (secondPassResult.error) {
      console.error('[RETRIEVAL ERROR] Second pass Supabase RPC error:', secondPassResult.error);
      throw new Error(`Database retrieval failed (second pass): ${secondPassResult.error.message}`);
    }

    documents = secondPassResult.data;
    
    // DEMO_MODE: Log that second pass was used
    if (process.env.DEMO_MODE === 'true') {
      console.log(`[DEMO_MODE] Retrieval: first pass (threshold=${SIMILARITY_THRESHOLD_FIRST_PASS}) returned 0 docs, using second pass (threshold=${SIMILARITY_THRESHOLD_SECOND_PASS})`);
    }
  } else {
    // DEMO_MODE: Log that first pass was used
    if (process.env.DEMO_MODE === 'true') {
      console.log(`[DEMO_MODE] Retrieval: using first pass threshold=${SIMILARITY_THRESHOLD_FIRST_PASS}`);
    }
  }

  if (!documents || documents.length === 0) {
    return [];
  }

  // Filter out documents with similarity below threshold and return
  const filteredDocs = documents
    .filter((doc: any) => doc.similarity >= matchThreshold)
    .map((doc: any) => ({
      id: doc.id,
      title: doc.title,
      source_url: doc.source_url,
      content: doc.content,
      similarity: doc.similarity,
    }));

  // DEMO_MODE debug logging
  if (process.env.DEMO_MODE === 'true') {
    console.log(`[DEMO_MODE] Retrieval debug for city_id=${cityId}:`);
    console.log(`  - threshold used: ${matchThreshold}`);
    console.log(`  - topK requested: ${TOP_K}`);
    console.log(`  - retrieved_sources_count: ${filteredDocs.length}`);
    console.log(`  - retrieved_docs_top3:`);
    filteredDocs.slice(0, 3).forEach((doc: RetrievedDocument, idx: number) => {
      console.log(`    ${idx + 1}. "${doc.title || 'Untitled'}" (source: ${doc.source_url || 'N/A'}, score: ${doc.similarity.toFixed(3)})`);
    });
  }

  return filteredDocs;
}

/**
 * Build context string from retrieved documents
 */
export function buildContext(documents: RetrievedDocument[]): string {
  if (documents.length === 0) {
    return '';
  }

  let context = '';
  for (const doc of documents) {
    if (!doc.content) continue;

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
