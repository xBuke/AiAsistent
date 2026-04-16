-- Restrict retrieval to chunks from active document_files rows.
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(384),
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
    AND EXISTS (
      SELECT 1
      FROM document_files
      WHERE document_files.id = documents.document_file_id
        AND document_files.is_active = TRUE
    )
  ORDER BY documents.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
