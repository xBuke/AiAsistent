import type { Pipeline } from '@xenova/transformers';

const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';
const EMBEDDING_DIM = 384;
const MAX_EMBED_CHARS = 12000;

let embedder: Pipeline | null = null;

async function getEmbedder(): Promise<Pipeline> {
  if (!embedder) {
    // Lazy dynamic import to avoid loading sharp at module initialization
    const { pipeline } = await import('@xenova/transformers');
    embedder = await pipeline('feature-extraction', MODEL_NAME);
    console.log(`✓ Embedding model loaded: ${MODEL_NAME}`);
  }
  return embedder;
}

export async function embed(text: string): Promise<number[]> {
  const truncated = text.length > MAX_EMBED_CHARS 
    ? text.substring(0, MAX_EMBED_CHARS) 
    : text;
  
  const model = await getEmbedder();
  const result = await model(truncated, { pooling: 'mean', normalize: true });
  
  // Convert tensor to array and ensure it's exactly 384 dimensions
  let embedding: number[];
  if (Array.isArray(result.data)) {
    embedding = result.data;
  } else if (result.data && typeof result.data === 'object' && 'tolist' in result.data) {
    embedding = (result.data as any).tolist();
  } else {
    embedding = Array.from(result.data as any);
  }
  
  // Flatten if nested array
  if (embedding.length > 0 && Array.isArray(embedding[0])) {
    embedding = embedding.flat();
  }
  
  if (embedding.length !== EMBEDDING_DIM) {
    throw new Error(`Expected embedding dimension ${EMBEDDING_DIM}, got ${embedding.length}`);
  }
  
  return embedding;
}
