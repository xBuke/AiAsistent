-- Migration: Change embedding vector to fixed 512 dimensions (OpenAI text-embedding-3-small)
-- Option B: Fixed dimension migration (requires re-embedding all documents)

-- Step 1: Drop the existing index (required before altering column)
DROP INDEX IF EXISTS documents_embedding_idx;

-- Step 2: Clear existing embeddings (they will be re-embedded with new dimension)
-- WARNING: This deletes all existing embeddings - they must be re-embedded
UPDATE documents SET embedding = NULL;

-- Step 3: Alter the embedding column to use 512 dimensions
ALTER TABLE documents 
  ALTER COLUMN embedding TYPE vector(512) USING NULL;

-- Step 4: Recreate the index with 512 dimensions
CREATE INDEX documents_embedding_idx ON documents 
  USING ivfflat (embedding vector_l2_ops) 
  WITH (lists = 100);

-- Step 5: Update match_documents function to accept 512-dimensional vectors
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(512),
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
