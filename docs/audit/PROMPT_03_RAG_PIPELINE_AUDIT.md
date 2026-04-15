# RAG Pipeline Audit

**Date:** 2026-02-12  
**Scope:** Document storage, retrieval, embeddings, city filtering, and source presentation  
**Mode:** READ-ONLY (no code changes)

---

## 1. Current Retrieval Flow Diagram

```
User message
     │
     ▼
chat.ts: resolve city_id (slug → UUID) from conversation
     │
     ▼
chat.ts: retrieveDocuments(message, cityUuid)
     │
     ├── retrieval.ts: embed(query) via OpenAI text-embedding-3-small (512 dim)
     │
     ├── retrieval.ts: supabase.rpc('match_documents', {
     │         query_embedding, match_threshold, match_count, p_city_id
     │     })
     │
     ├── SQL match_documents:
     │     • SELECT from documents WHERE embedding IS NOT NULL
     │     •   AND similarity > threshold  (1 - (embedding <=> query_embedding))
     │     •   AND (p_city_id IS NULL OR documents.city_id = p_city_id)
     │     • ORDER BY embedding <=> query_embedding
     │     • LIMIT match_count (5)
     │
     ├── Two-pass: if 0 results, retry with threshold 0.35 (first pass 0.5)
     │
     └── retrieval.ts: filter doc.similarity >= threshold, return top 5
     │
     ▼
retrieval.ts: buildContext(documents)
     • Truncate each doc.content to MAX_DOC_CHARS (2000)
     • Stop when total context exceeds MAX_TOTAL_CONTEXT_CHARS (8000)
     • Format: "DOC N TITLE: ...\nSOURCE: ...\nCONTENT: ...\n---\n"
     │
     ▼
chat.ts: streamChat({ messages, context })
     • LLM system prompt + CONTEXT block
     • LLM instructed: "Ne spominji izvore, linkove ili Sources:" (do not mention sources in text)
     │
     ▼
chat.ts: emit SSE meta with retrieved_docs_top3 (title, source=source_url, score)
     │
     ▼
Widget: MessageList displays "Izvori (N)" expandable citations
     • Shows doc.title and doc.source (source_url) for each of top 3
```

---

## 2. Key Code Paths + SQL Queries

### 2.1 Document storage (DB tables)

| Table     | Key columns                                      | Purpose                         |
|-----------|--------------------------------------------------|---------------------------------|
| `documents`| id, title, source_url, content, content_hash, embedding, city_id, created_at | Single table for RAG; one row per document |

- **Location:** `apps/api/supabase/schema.sql`, migrations in `apps/api/db/migrations/`
- **No `document_chunks` table** — documents are stored whole-document, not chunked

### 2.2 Embedding model and storage

| Aspect         | Details |
|----------------|---------|
| **Model**      | OpenAI `text-embedding-3-small` (512 dimensions) |
| **Storage**    | `documents.embedding` — **one embedding per document** (document-level, not chunk-level) |
| **Index**      | `documents_embedding_idx` — IVFFlat (vector_l2_ops), lists=100 |
| **Dimension**  | 512 (migration: flexible or fixed 512 — see `2026-02-04_flexible_vector_dimensions.sql`) |

- **Ingestion:** `apps/api/scripts/ingest.ts` — reads `.txt`/`.md` from `data/docs/`, parses TITLE/SOURCE/CITY, embeds `extractContentForEmbedding(content)` (max 12,000 chars), upserts into `documents`
- **Embedding module:** `apps/api/src/embedding.ts`

### 2.3 Similarity search

| Aspect         | Details |
|----------------|---------|
| **Mechanism**   | PostgreSQL `match_documents` RPC (Supabase) |
| **Vector op**   | `<=>` (pgvector cosine distance) |
| **Similarity**  | `1 - (documents.embedding <=> query_embedding)` (cosine similarity) |
| **Thresholds**  | First pass: 0.5; second pass: 0.35 if no results |
| **Top-K**       | 5 |

**SQL (from `2026-02-04_flexible_vector_dimensions.sql`):**

```sql
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
```

**Code path:**  
`apps/api/src/services/retrieval.ts` → `supabase.rpc('match_documents', { query_embedding, match_threshold, match_count, p_city_id })`

### 2.4 Source URL usage in responses

| Stage           | Field          | Usage |
|-----------------|----------------|-------|
| **DB**          | `documents.source_url` | Parsed from file header `SOURCE: https://...` during ingest |
| **Retrieval**   | `RetrievedDocument.source_url` | Returned by `match_documents`, passed through `retrieveDocuments` |
| **Chat**        | `retrievedDocs[].source` | `doc.source_url` mapped to `source` for meta event |
| **SSE meta**    | `retrieved_docs_top3[].source` | Emitted in `event: meta` |
| **Messages**    | `metadata.retrieved_docs_top3` | Stored with assistant message (contains `title`, `source`, `score`) |
| **Widget UI**   | `doc.source` in MessageList | Shown in expandable "Izvori (N)" citations as text (not clickable link) |

---

## 3. city_id Enforcement

| Question | Answer |
|----------|--------|
| **Is city_id enforced?** | Yes, when `p_city_id` is provided |
| **How?** | SQL: `(p_city_id IS NULL OR documents.city_id = p_city_id)` |
| **Effect** | Only documents with `documents.city_id = p_city_id` are returned. Documents with `city_id IS NULL` are excluded when a city is specified |
| **When is p_city_id passed?** | Always in chat flow — `retrieveDocuments(message, cityUuid)` with `cityUuid` from conversation |
| **What if city resolution fails?** | Chat returns 500: "City resolution failed" — retrieval is not attempted |
| **Migration** | `2026-02-10_documents_city_id.sql` adds `city_id` column; `2026-02-03_match_documents_city_scope.sql` adds the filter |

---

## 4. Insertion Points for Future Changes

### 4.1 document_chunks table

| Current state | Insertion point |
|---------------|------------------|
| No chunks; one embedding per document | **Ingestion:** Split `content` into chunks in `ingest.ts`, store chunks in new `document_chunks` table with `document_id`, `chunk_index`, `content`, `embedding` |
| Retrieval operates on documents | **Retrieval:** Add `match_chunks` RPC that queries `document_chunks` instead of `documents`; optionally JOIN back to `documents` for title/source_url. Or keep `match_documents` and add chunk-aware retrieval as a separate path |
| `buildContext` uses full `doc.content` | **Context building:** Use chunk content instead of full doc; consider deduplication when multiple chunks from same document |

**Suggested schema sketch:**
```sql
-- document_chunks (
--   id uuid,
--   document_id uuid REFERENCES documents(id),
--   chunk_index int,
--   content text,
--   embedding vector(512),
--   city_id uuid  -- denormalized for filter
-- )
```

### 4.2 RAG storage paths

| Current | Possible extension |
|---------|---------------------|
| `apps/api/data/docs/` — flat `.txt`/`.md` only | Add support for subfolders by city (e.g. `data/docs/ploce/`, `data/docs/split/`) and map to `city_id` during ingest |
| Ingest script resolves `CITY:` header to UUID | Add fallback: derive city from folder path when `CITY:` is missing |
| No object storage (S3/R2) | If moving to cloud: store raw PDFs/files in bucket, ingest text + embeddings into DB; document table could add `storage_path` column |

### 4.3 OCR fallback for scanned PDFs

| Current | Gap |
|---------|-----|
| Only `.txt` and `.md` ingested | No PDF ingestion for RAG |
| PDF handling exists for **form generation** (citizen forms), not for knowledge base | RAG docs are text-only |

**Insertion points:**

| Stage | Change |
|-------|--------|
| **Ingest** | Add PDF ingestion: detect text vs image PDF; use `pdf-parse` or similar for text extraction; for image-only PDFs, add OCR (e.g. Tesseract, cloud OCR) to produce text → then embed and store in `documents` |
| **File discovery** | Extend `ingest.ts` to list `.pdf` in addition to `.txt`/`.md` |
| **Content extraction** | New module: `extractPdfContent(path)` → text or null; if null/low confidence, call OCR pipeline |

---

## 5. Risks (Performance, Correctness)

### Performance

| Risk | Notes |
|------|-------|
| **IVFFlat index size** | `lists=100` may be low for large document sets; consider tuning when scaling |
| **Whole-document embedding** | Long documents truncated to 12,000 chars; single embedding may miss granular relevance; chunk-level retrieval would improve precision for long docs |
| **Two-pass retrieval** | Extra RPC when first pass returns 0; adds latency on empty-result queries |
| **Context truncation** | `MAX_DOC_CHARS=2000` per doc, `MAX_TOTAL_CONTEXT_CHARS=8000` total — may cut off relevant content |

### Correctness

| Risk | Notes |
|------|-------|
| **Documents without city_id** | Files missing `CITY:` header get `city_id = NULL`; they are **excluded** when a city is specified — may be intentional (global docs) or oversight |
| **Source not clickable** | Widget shows `source_url` as plain text; users cannot click. Consider rendering as `<a href="...">` when URL |
| **LLM instructed not to cite** | System prompt: "Ne spominji izvore, linkove ili Sources:" — LLM does not inline citations; attribution is only via expandable "Izvori" UI |
| **Content hash dedup** | Upsert by `content_hash`; renaming file without content change updates same row; removing file requires `cleanup-docs --delete-db` to avoid orphans |

### Operational

| Risk | Notes |
|------|-------|
| **Embedding dimension drift** | Migration to flexible vector; ensure all embeddings match deployed dimension |
| **OpenAI dependency** | Embeddings and chat depend on `OPENAI_API_KEY`; no fallback embedding provider |

---

## Summary

| Aspect | Current state |
|--------|---------------|
| **Storage** | Single `documents` table, whole-document |
| **Embeddings** | One per document, 512-dim, OpenAI text-embedding-3-small |
| **Search** | `match_documents` RPC, cosine similarity (`<=>`), IVFFlat index |
| **city_id** | Enforced in `match_documents` when `p_city_id` provided |
| **Sources in answer** | Not in LLM text; shown in widget as expandable "Izvori (N)" with title + source_url |
| **Chunks** | None |
| **PDF/OCR** | Not used for RAG; only .txt/.md ingested |
