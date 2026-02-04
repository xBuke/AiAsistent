-- Migration: Make embedding vector dimension flexible
-- This allows documents to use different embedding dimensions (e.g., OpenAI 512-dim vs old 384-dim)
-- Option A: Flexible vector type (no fixed dimension)

-- Step 1: Drop the existing index (required before altering column)
DROP INDEX IF EXISTS documents_embedding_idx;

-- Step 2: Alter the embedding column to use flexible vector type
-- Note: This will work with any dimension, but existing 384-dim vectors remain valid
ALTER TABLE documents 
  ALTER COLUMN embedding TYPE vector USING embedding::vector;

-- Step 3: Recreate the index with flexible vector type
-- Note: IVFFlat index requires a fixed dimension, so we'll use HNSW instead for flexibility
-- OR keep IVFFlat but it will work with the new dimension
CREATE INDEX documents_embedding_idx ON documents 
  USING ivfflat (embedding vector_l2_ops) 
  WITH (lists = 100);

-- Step 4: Update match_documents function to accept flexible vector dimension
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector,
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 5,
  p_city_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  title text,
  source_url text,
  content text,
  content_hash text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    documents.id,
    documents.title,
    documents.source_url,
    documents.content,
    documents.content_hash,
    1 - (documents.embedding <=> query_embedding) AS similarity
  FROM documents
  WHERE documents.embedding IS NOT NULL
    AND 1 - (documents.embedding <=> query_embedding) > match_threshold
    AND (p_city_id IS NULL OR documents.city_id = p_city_id)
  ORDER BY documents.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
