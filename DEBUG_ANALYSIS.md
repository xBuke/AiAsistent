# Production Issue Debug Analysis: Fallback Message Always Triggered

## Issue Summary
Widget always replies with Croatian fallback message: **"Nemam dovoljno službenih informacija u dokumentima Grada Ploča da bih pouzdano odgovorio na to pitanje. Možete li ga malo precizirati ili pitati nešto drugo?"**

This indicates retrieval is returning 0 documents or the system is stuck in the "no docs" path.

---

## 1. Exact Code Path for Fallback Message

### Location
**File:** `apps/api/src/routes/chat.ts`  
**Line:** 277

### Trigger Condition
**File:** `apps/api/src/routes/chat.ts`  
**Line:** 273

```typescript
if (documents.length === 0) {
  usedFallback = true;
  const fallbackMessage = 'Nemam dovoljno službenih informacija...';
  // ... streams fallback message
}
```

### Conditions That Trigger Fallback
1. **Primary:** `documents.length === 0` after `retrieveDocuments()` call
   - This happens when:
     - `match_documents` RPC returns empty array
     - Both first pass (threshold 0.5) and second pass (threshold 0.35) return 0 docs
     - Documents filtered out due to similarity below threshold
   
2. **Potential causes:**
   - **Missing `city_id` column** in `documents` table (most likely)
   - **NULL `city_id` values** in documents (documents not scoped to city)
   - **City UUID mismatch** (resolved city UUID doesn't match document `city_id`)
   - **No documents exist** for the city
   - **Embedding dimension mismatch** (query embedding dimension doesn't match stored embeddings)
   - **Database connection/query errors** (but these throw 500, not fallback)

---

## 2. City ID Resolution Flow

### POST `/grad/:cityId/chat` → Document Filtering

**File:** `apps/api/src/routes/chat.ts`  
**Lines:** 77-98

#### Step 1: City Resolution
```typescript
// Try lookup by slug first
let { data: city, error: cityError } = await supabase
  .from('cities')
  .select('id, code')
  .eq('slug', cityId)  // ⚠️ NOTE: cities table may not have 'slug' column
  .single();

// Fallback: try by code (uppercased)
if (cityError || !city) {
  const derivedCode = cityId.toUpperCase();
  const { data: cityByCode, error: codeError } = await supabase
    .from('cities')
    .select('id, code')
    .eq('code', derivedCode)
    .single();
  city = cityByCode;
}
cityUuid = city.id;  // Resolved UUID
```

#### Step 2: Document Retrieval
**File:** `apps/api/src/services/retrieval.ts`  
**Lines:** 35-40

```typescript
let { data: documents, error } = await supabase.rpc('match_documents', {
  query_embedding: queryEmbedding,
  match_threshold: matchThreshold,
  match_count: TOP_K,
  p_city_id: cityId,  // ⚠️ Passes resolved city UUID
});
```

#### Step 3: Database Filtering
**File:** `apps/api/db/migrations/2026-02-03_match_documents_city_scope.sql`  
**Line:** 32

```sql
WHERE documents.embedding IS NOT NULL
  AND 1 - (documents.embedding <=> query_embedding) > match_threshold
  AND (p_city_id IS NULL OR documents.city_id = p_city_id)  -- ⚠️ CRITICAL FILTER
```

### Filters Used
1. **`city_id` filter:** `documents.city_id = p_city_id`
   - **Problem:** If `documents.city_id` column doesn't exist OR is NULL for all documents, this filter returns 0 rows
   
2. **Similarity threshold:** `similarity > match_threshold` (0.5 first pass, 0.35 second pass)

3. **Embedding exists:** `documents.embedding IS NOT NULL`

---

## 3. Environment Variables Required

### Required for Document Retrieval

| Env Var | Purpose | Read Location | Required? |
|---------|---------|---------------|-----------|
| `SUPABASE_URL` | Database connection URL | `apps/api/src/db/supabase.ts:3` | ✅ **YES** |
| `SUPABASE_SERVICE_ROLE_KEY` | Database authentication | `apps/api/src/db/supabase.ts:4` | ✅ **YES** |
| `OPENAI_API_KEY` | Embedding generation | `apps/api/src/embedding.ts:11` | ✅ **YES** |

### Required for LLM Response

| Env Var | Purpose | Read Location | Required? |
|---------|---------|---------------|-----------|
| `GROQ_API_KEY` | LLM API authentication | `apps/api/src/services/llm.ts:82,149` | ✅ **YES** |
| `GROQ_MODEL` | LLM model name | `apps/api/src/routes/chat.ts:68` | ❌ Optional (default: `llama-3.1-8b-instant`) |

### Optional Debug Logging

| Env Var | Purpose | Read Location | Required? |
|---------|---------|---------------|-----------|
| `DEMO_MODE` | Enable debug logging | `apps/api/src/routes/chat.ts:222,259` | ❌ Optional |
| `DEBUG_RETRIEVAL` | Enable retrieval debug logging | `apps/api/src/routes/chat.ts:222,259` (NEW) | ❌ Optional |

### Rate Limiting (Optional)

| Env Var | Purpose | Read Location | Required? |
|---------|---------|---------------|-----------|
| `RATE_LIMIT_CHAT_MAX` | Max requests per window | `apps/api/src/middleware/rateLimit.ts:10` | ❌ Optional (default: 20) |
| `RATE_LIMIT_CHAT_WINDOW_MS` | Rate limit window | `apps/api/src/middleware/rateLimit.ts:11` | ❌ Optional (default: 60000) |

---

## 4. Root Cause Candidates (Ranked)

### 🔴 **MOST LIKELY: Missing `city_id` Column in Documents Table**

**Evidence:**
- `match_documents` RPC function filters by `documents.city_id = p_city_id` (line 32 of migration)
- Original schema (`apps/api/supabase/schema.sql`) shows `documents` table **does NOT have `city_id` column**
- No migration found that adds `city_id` to `documents` table
- Ingest script (`apps/api/scripts/ingest.ts`) doesn't set `city_id` when inserting documents

**Impact:** If column doesn't exist, SQL query will fail OR return 0 rows (depending on PostgreSQL version/error handling).

**Fix:** Add migration to:
1. Add `city_id UUID` column to `documents` table
2. Backfill existing documents with appropriate `city_id` (or set to NULL if global)
3. Update ingest script to set `city_id` when inserting

---

### 🟡 **LIKELY: NULL `city_id` Values in Documents**

**Evidence:**
- Even if column exists, documents may have `NULL` city_id
- Filter `documents.city_id = p_city_id` won't match NULL values
- Ingest script doesn't set `city_id` when upserting

**Impact:** All documents have NULL `city_id`, so filter returns 0 rows.

**Fix:** Backfill documents with correct `city_id` based on document source or city association.

---

### 🟡 **LIKELY: City Resolution Failure (Slug Column Missing)**

**Evidence:**
- Code tries to query `cities` table by `slug` column first (line 81)
- Schema shows `cities` table has `code` but **no `slug` column** mentioned
- Falls back to `code` lookup, but if that also fails → 404 (not fallback)

**Impact:** If slug lookup fails silently and code lookup also fails, returns 404 (not fallback message).

**Fix:** Add `slug` column to `cities` table OR remove slug lookup logic.

---

### 🟢 **POSSIBLE: Embedding Dimension Mismatch**

**Evidence:**
- Embedding service uses OpenAI `text-embedding-3-small` with 512 dimensions (`apps/api/src/embedding.ts:4`)
- Migration shows flexible vector dimensions (`2026-02-04_flexible_vector_dimensions.sql`)
- Old documents may have 384-dim embeddings, new queries use 512-dim

**Impact:** Vector similarity search may fail or return incorrect results.

**Fix:** Ensure all documents are re-embedded with consistent dimension OR verify dimension compatibility.

---

### 🟢 **POSSIBLE: No Documents for City**

**Evidence:**
- Documents may simply not exist for the resolved city UUID
- Ingest script doesn't associate documents with cities

**Impact:** Valid query but no matching documents → fallback triggered.

**Fix:** Verify documents exist in database and are associated with correct `city_id`.

---

## 5. Minimal Debug Logging Patch

### Changes Made

**File:** `apps/api/src/routes/chat.ts`
- Added `DEBUG_RETRIEVAL` env var check alongside `DEMO_MODE`
- Added fallback reason logging when `documents.length === 0`

**File:** `apps/api/src/services/retrieval.ts`
- Added `DEBUG_RETRIEVAL` env var check alongside `DEMO_MODE`
- Added logging for retrieval attempts (first pass, second pass)
- Added logging for document counts at each stage

### Diff Summary

```diff
apps/api/src/routes/chat.ts:
+ // DEMO_MODE or DEBUG_RETRIEVAL: Log city resolution
+ if (process.env.DEMO_MODE === 'true' || process.env.DEBUG_RETRIEVAL === 'true') {
+   request.log.info({ cityId, cityUuid }, '[DEBUG] City resolution...');
+ }
+ 
+ // ... retrieval code ...
+ 
+ if (documents.length === 0) {
+   usedFallback = true;
+   
+   // DEMO_MODE or DEBUG_RETRIEVAL: Log fallback reason
+   if (process.env.DEMO_MODE === 'true' || process.env.DEBUG_RETRIEVAL === 'true') {
+     request.log.warn({
+       cityId, cityUuid, message,
+       reason: 'retrieved_docs_count_equals_zero',
+       retrieval_count: documents.length,
+     }, '[DEBUG] Fallback triggered: no documents retrieved');
+   }
+   // ... fallback message ...
+ }

apps/api/src/services/retrieval.ts:
+ // DEMO_MODE or DEBUG_RETRIEVAL: Log retrieval attempt
+ if (process.env.DEMO_MODE === 'true' || process.env.DEBUG_RETRIEVAL === 'true') {
+   console.log(`[DEBUG] Retrieval: starting first pass with city_id=${cityId}...`);
+ }
+ 
+ // ... after first pass ...
+ if (process.env.DEMO_MODE === 'true' || process.env.DEBUG_RETRIEVAL === 'true') {
+   console.log(`[DEBUG] Retrieval: first pass returned ${documents?.length || 0} documents`);
+ }
+ 
+ // ... after second pass ...
+ if (process.env.DEMO_MODE === 'true' || process.env.DEBUG_RETRIEVAL === 'true') {
+   console.log(`[DEBUG] Retrieval: second pass returned ${documents?.length || 0} documents`);
+ }
```

---

## 6. Smoke Test Checklist

### Local Testing

1. **Set environment variables:**
   ```bash
   export DEBUG_RETRIEVAL=true
   export DEMO_MODE=true  # Optional, enables additional logging
   ```

2. **Start API server:**
   ```bash
   cd apps/api
   npm run dev
   ```

3. **Send test request:**
   ```bash
   curl -X POST http://localhost:3000/grad/PLOCE/chat \
     -H "Content-Type: application/json" \
     -d '{"message": "Kada je radno vrijeme gradske uprave?"}'
   ```

4. **Check logs for:**
   - ✅ `[DEBUG] City resolution: resolved cityUuid and cityId slug`
   - ✅ `[DEBUG] Retrieval: starting first pass with city_id=...`
   - ✅ `[DEBUG] Retrieval: first pass returned X documents`
   - ✅ `[DEBUG] Retrieval results and context length` (if docs found)
   - ⚠️ `[DEBUG] Fallback triggered: no documents retrieved` (if 0 docs)

5. **Verify response:**
   - Check SSE stream for `event: meta` with `retrieved_docs_count` and `retrieved_docs_top3`
   - If `retrieved_docs_count > 0`, verify `retrieved_docs_top3` array has entries

### Vercel Production Logs

1. **Set environment variable in Vercel:**
   - Go to Vercel dashboard → Project → Settings → Environment Variables
   - Add `DEBUG_RETRIEVAL=true`

2. **Redeploy or trigger new request**

3. **Check Vercel logs:**
   ```bash
   vercel logs [deployment-url] --follow
   ```
   OR use Vercel dashboard → Deployments → [deployment] → Functions → View Function Logs

4. **Look for debug lines:**
   - `[DEBUG] City resolution: resolved cityUuid...`
   - `[DEBUG] Retrieval: starting first pass...`
   - `[DEBUG] Retrieval: first pass returned X documents`
   - `[DEBUG] Fallback triggered...` (if 0 docs)

5. **Verify meta event in response:**
   - Check browser Network tab → Response → Look for `event: meta`
   - Verify `retrieved_docs_count` > 0
   - Verify `retrieved_docs_top3` array populated

### Expected Log Output (Success Case)

```
[DEBUG] City resolution: resolved cityUuid and cityId slug { cityId: 'PLOCE', cityUuid: '...' }
[DEBUG] Retrieval: starting first pass with city_id=..., threshold=0.5, topK=5
[DEBUG] Retrieval: first pass returned 3 documents
[DEBUG] Retrieval debug for city_id=...:
  - threshold used: 0.5
  - topK requested: 5
  - retrieved_sources_count: 3
  - retrieved_docs_top3:
    1. "Radno vrijeme gradske uprave" (source: ..., score: 0.723)
    2. "Kontakt informacije" (source: ..., score: 0.689)
    3. "Gradska uprava" (source: ..., score: 0.654)
[DEBUG] Retrieval results and context length { retrieval_count: 3, ... }
```

### Expected Log Output (Failure Case)

```
[DEBUG] City resolution: resolved cityUuid and cityId slug { cityId: 'PLOCE', cityUuid: '...' }
[DEBUG] Retrieval: starting first pass with city_id=..., threshold=0.5, topK=5
[DEBUG] Retrieval: first pass returned 0 documents
[DEBUG] Retrieval: first pass (threshold=0.5) returned 0 docs, trying second pass (threshold=0.35)
[DEBUG] Retrieval: second pass returned 0 documents
[DEBUG] Fallback triggered: no documents retrieved { 
  cityId: 'PLOCE', 
  cityUuid: '...', 
  reason: 'retrieved_docs_count_equals_zero',
  retrieval_count: 0 
}
```

---

## 7. Verification Steps

### Step 1: Verify Database Schema

```sql
-- Check if documents table has city_id column
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'documents' AND column_name = 'city_id';

-- Check if cities table has slug column
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'cities' AND column_name = 'slug';

-- Count documents with NULL city_id
SELECT COUNT(*) FROM documents WHERE city_id IS NULL;

-- Count documents per city
SELECT city_id, COUNT(*) FROM documents GROUP BY city_id;
```

### Step 2: Verify City Resolution

```sql
-- Check cities table
SELECT id, code, slug FROM cities;

-- Verify city can be resolved by code
SELECT id, code FROM cities WHERE code = 'PLOCE';
```

### Step 3: Test match_documents RPC Directly

```sql
-- Get a test city UUID
SELECT id FROM cities WHERE code = 'PLOCE' LIMIT 1;

-- Test match_documents with a known city_id
-- (Replace <city_uuid> and <embedding_vector> with actual values)
SELECT * FROM match_documents(
  '<embedding_vector>'::vector,
  0.35,  -- threshold
  5,     -- match_count
  '<city_uuid>'::uuid  -- p_city_id
);
```

### Step 4: Check Embedding Dimensions

```sql
-- Check embedding dimensions in documents
SELECT 
  id,
  title,
  array_length(embedding::float[], 1) as embedding_dim
FROM documents 
WHERE embedding IS NOT NULL 
LIMIT 10;
```

---

## 8. Recommended Fixes (Priority Order)

### 🔴 **CRITICAL: Add `city_id` Column to Documents Table**

Create migration: `apps/api/db/migrations/add_documents_city_id.sql`

```sql
-- Add city_id column to documents table
ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS city_id UUID REFERENCES cities(id);

-- Create index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_documents_city_id ON documents(city_id);

-- Update match_documents function to handle NULL city_id gracefully
-- (Function already exists, but verify it handles NULL correctly)
```

### 🟡 **HIGH: Backfill Documents with city_id**

Determine city association logic (by document source, filename, or manual mapping) and update existing documents.

### 🟡 **MEDIUM: Update Ingest Script**

Modify `apps/api/scripts/ingest.ts` to accept and set `city_id` when ingesting documents.

### 🟢 **LOW: Add `slug` Column to Cities Table**

If using slug-based routing, add `slug` column to `cities` table and populate it.

---

## Summary

**Most Likely Root Cause:** `documents` table is missing `city_id` column, causing `match_documents` RPC to return 0 rows when filtering by `city_id`.

**Quick Verification:** Enable `DEBUG_RETRIEVAL=true` and check logs for retrieval counts and fallback reasons.

**Immediate Action:** Verify database schema, check if `documents.city_id` column exists, and verify documents have non-NULL `city_id` values.
