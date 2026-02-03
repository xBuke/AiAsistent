# Retrieval Empty Results Analysis

## Problem Statement
Chat endpoint `/grad/:cityId/chat` sometimes returns "Ne mogu pouzdano odgovoriti iz dostupnih dokumenata..." even though:
- Database is correct: `cities.slug="ploce"` => `cities.id="a36fe81a-c18f-455c-b6b8-1c11d0d5d836"`
- 12 documents exist with `city_id=a36fe81a...` and 12 embeddings (not null)

## 1. Retrieval Step Identification

### File: `apps/api/src/routes/chat.ts`
**Line 216:** `const documents = await retrieveDocuments(message);`

**Issue:** `retrieveDocuments()` is called with ONLY the message string. The `cityUuid` (resolved at line 98) is **NOT passed** to the retrieval function.

### File: `apps/api/src/services/retrieval.ts`
**Lines 24-58:** `retrieveDocuments(query: string)` function

**Retrieval Flow:**
1. **Line 27:** Generates embedding for query: `const queryEmbedding = await embed(query);`
2. **Lines 30-34:** Calls RPC `match_documents`:
   ```typescript
   const { data: documents, error } = await supabase.rpc('match_documents', {
     query_embedding: queryEmbedding,
     match_threshold: SIMILARITY_THRESHOLD,  // 0.5
     match_count: TOP_K,  // 5
   });
   ```
3. **Lines 36-38:** On error, returns empty array `[]`
4. **Lines 41-43:** If no documents, returns empty array `[]`
5. **Lines 46-54:** Filters documents by similarity threshold again (redundant)

**Constants:**
- `TOP_K = 5` (line 8)
- `SIMILARITY_THRESHOLD = 0.5` (line 9)

### File: `apps/api/supabase/schema.sql`
**Lines 28-58:** `match_documents` RPC function definition

**SQL Function:**
```sql
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(384),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 5
)
RETURNS TABLE (...)
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
  ORDER BY documents.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

**Critical Issue:** The `match_documents` function does **NOT filter by `city_id`**. It searches **ALL documents** across **ALL cities**.

**Filters Applied:**
- ✅ `documents.embedding IS NOT NULL`
- ✅ Similarity threshold: `1 - (documents.embedding <=> query_embedding) > match_threshold`
- ❌ **MISSING:** `documents.city_id = p_city_id` filter

## 2. CityId Handling Verification

### File: `apps/api/src/routes/chat.ts`

**Lines 32-98:** City resolution logic

1. **Line 32:** `const { cityId } = request.params;` - receives slug "ploce"
2. **Lines 78-82:** First attempt - lookup by slug:
   ```typescript
   let { data: city, error: cityError } = await supabase
     .from('cities')
     .select('id, code')
     .eq('slug', cityId)  // cityId = "ploce"
     .single();
   ```
3. **Lines 84-97:** Fallback - lookup by code (uppercased):
   ```typescript
   if (cityError || !city) {
     const derivedCode = cityId.toUpperCase();  // "PLOCE"
     const { data: cityByCode, error: codeError } = await supabase
       .from('cities')
       .select('id, code')
       .eq('code', derivedCode)
       .single();
     // ...
   }
   ```
4. **Line 98:** `cityUuid = city.id;` - stores UUID: `a36fe81a-c18f-455c-b6b8-1c11d0d5d836`

**Status:** ✅ City resolution works correctly. `cityUuid` is properly resolved.

**Problem:** `cityUuid` is resolved but **NEVER passed to `retrieveDocuments()`** (line 216).

## 3. Reasons `retrieval_docs_top3` Might Be Empty

### Hypothesis 1: **MISSING CITY FILTER** (HIGHEST LIKELIHOOD)
**Location:** `apps/api/supabase/schema.sql:28-58` (match_documents RPC)

**Problem:**
- `match_documents` searches ALL documents across ALL cities
- Query searches globally, not scoped to Ploce documents
- If other cities have documents with higher similarity scores, they may be returned instead
- If Ploce documents don't match well globally (even though they exist), threshold filtering may exclude them

**Evidence:**
- `retrieveDocuments()` doesn't accept `cityUuid` parameter
- `match_documents` RPC has no `city_id` parameter
- No `WHERE city_id = ...` clause in the SQL function

**Impact:** Even with 12 Ploce documents, if global search finds better matches from other cities OR if Ploce documents don't meet the 0.5 threshold in global context, results are empty.

### Hypothesis 2: **SIMILARITY THRESHOLD TOO STRICT** (MEDIUM LIKELIHOOD)
**Location:** `apps/api/src/services/retrieval.ts:9`

**Problem:**
- `SIMILARITY_THRESHOLD = 0.5` may be too high
- Cosine similarity range: 0.0 (no match) to 1.0 (perfect match)
- Threshold of 0.5 means documents need >50% similarity
- If query doesn't match well semantically, even valid Ploce documents may be filtered out

**Evidence:**
- Threshold applied twice: once in RPC (line 54 of schema.sql), once in TypeScript (line 47 of retrieval.ts)
- No logging of similarity scores to diagnose threshold issues

**Impact:** Valid Ploce documents exist but don't meet similarity threshold, so they're filtered out.

### Hypothesis 3: **ERROR SILENTLY CAUGHT** (LOW-MEDIUM LIKELIHOOD)
**Location:** `apps/api/src/services/retrieval.ts:36-38, 55-57`

**Problem:**
- Both RPC errors and general errors return empty array `[]`
- Errors are logged to `console.error` but not to request logger
- No error details propagated to chat handler

**Evidence:**
```typescript
if (error) {
  console.error('Error retrieving documents:', error);
  return [];  // Silent failure
}
// ...
catch (error) {
  console.error('Error in retrieveDocuments:', error);
  return [];  // Silent failure
}
```

**Impact:** If RPC call fails (e.g., connection issue, function missing, permission error), empty results are returned without visibility.

### Hypothesis 4: **VECTOR DIMENSION MISMATCH** (LOW LIKELIHOOD)
**Location:** `apps/api/src/services/retrieval.ts:27` and `apps/api/supabase/schema.sql:29`

**Problem:**
- Query embedding dimension must match document embedding dimension
- Schema expects `vector(384)`
- If embedding service returns wrong dimension, similarity calculation fails

**Evidence:**
- Schema: `query_embedding vector(384)`
- No validation of embedding dimension before RPC call

**Impact:** If dimension mismatch, RPC may fail or return incorrect results.

### Hypothesis 5: **EMBEDDING COLUMN MISMATCH** (VERY LOW LIKELIHOOD)
**Location:** `apps/api/supabase/schema.sql:51`

**Problem:**
- Query uses `documents.embedding` column
- If documents table has different embedding column name or structure, query fails

**Evidence:**
- Schema shows `embedding vector(384)` column
- User confirmed embeddings exist (not null)

**Impact:** Unlikely given user confirmation that embeddings exist.

### Hypothesis 6: **RETRIEVAL CALL SKIPPED** (VERY LOW LIKELIHOOD)
**Location:** `apps/api/src/routes/chat.ts:216`

**Problem:**
- If `retrieveDocuments()` throws before returning, empty array might be returned
- But code shows it's always called

**Evidence:**
- Line 216 always executes (no conditional)
- Function has try-catch that returns `[]` on error

**Impact:** Unlikely - function is always called.

## 4. Exact File Paths and Line Numbers

### Retrieval Function Call
- **File:** `apps/api/src/routes/chat.ts`
- **Line:** 216
- **Code:** `const documents = await retrieveDocuments(message);`
- **Issue:** Missing `cityUuid` parameter

### Retrieval Implementation
- **File:** `apps/api/src/services/retrieval.ts`
- **Lines:** 24-58
- **Function:** `retrieveDocuments(query: string)`
- **Issue:** No `cityId` parameter, no city filtering

### RPC Function Definition
- **File:** `apps/api/supabase/schema.sql`
- **Lines:** 28-58
- **Function:** `match_documents(query_embedding, match_threshold, match_count)`
- **Issue:** No `city_id` parameter, no `WHERE city_id = ...` filter

### City Resolution
- **File:** `apps/api/src/routes/chat.ts`
- **Lines:** 78-98
- **Code:** Resolves slug "ploce" to UUID `a36fe81a-c18f-455c-b6b8-1c11d0d5d836`
- **Status:** ✅ Works correctly, but result not used in retrieval

### Threshold Constants
- **File:** `apps/api/src/services/retrieval.ts`
- **Line 9:** `SIMILARITY_THRESHOLD = 0.5`
- **Line 8:** `TOP_K = 5`

## 5. Hypotheses Ranked by Likelihood

### 🥇 **Hypothesis 1: Missing City Filter** (95% confidence)
**Root Cause:** `match_documents` RPC searches ALL cities, not filtered by `city_id`.

**Why This Causes Empty Results:**
1. Query searches globally across all cities
2. If other cities have documents with higher similarity, they're returned instead of Ploce documents
3. If Ploce documents don't rank in top 5 globally, they're excluded
4. Even if Ploce documents exist and match, global competition may push them below threshold

**Evidence:**
- `retrieveDocuments()` doesn't accept `cityUuid`
- `match_documents` RPC has no `city_id` parameter
- No `WHERE city_id = ...` in SQL function
- User confirmed 12 Ploce documents exist with embeddings

**Minimal Fix Plan:**
1. **Modify RPC function** (`apps/api/supabase/schema.sql:28-58`):
   - Add `p_city_id UUID` parameter
   - Add `AND documents.city_id = p_city_id` to WHERE clause
2. **Modify retrieval service** (`apps/api/src/services/retrieval.ts:24`):
   - Change signature: `retrieveDocuments(query: string, cityId: string)`
   - Pass `cityId` to RPC: `match_documents({ ..., city_id: cityId })`
3. **Modify chat handler** (`apps/api/src/routes/chat.ts:216`):
   - Pass `cityUuid`: `retrieveDocuments(message, cityUuid)`

### 🥈 **Hypothesis 2: Similarity Threshold Too Strict** (60% confidence)
**Root Cause:** Threshold of 0.5 may filter out valid Ploce documents.

**Why This Causes Empty Results:**
- Even with city filtering, if similarity scores are 0.4-0.49, documents are excluded
- Query semantics may not match document content well enough

**Minimal Fix Plan:**
1. **Lower threshold** (`apps/api/src/services/retrieval.ts:9`):
   - Change `SIMILARITY_THRESHOLD` from `0.5` to `0.3` or `0.4`
2. **Add logging** to see actual similarity scores:
   - Log scores before filtering
   - Log how many documents pass/fail threshold

### 🥉 **Hypothesis 3: Error Silently Caught** (40% confidence)
**Root Cause:** RPC errors return empty array without visibility.

**Why This Causes Empty Results:**
- If RPC fails (permissions, connection, function missing), empty array returned
- No error details in chat handler logs

**Minimal Fix Plan:**
1. **Propagate errors** (`apps/api/src/services/retrieval.ts:36-38`):
   - Log to `request.log` instead of `console.error`
   - Throw error or return error details instead of empty array
2. **Add error handling** in chat handler:
   - Check for retrieval errors
   - Log error details

## 6. Minimal Fix Plan (Top 2 Hypotheses)

### Fix 1: Add City Filtering (Hypothesis 1)

**Step 1: Update RPC Function**
**File:** `apps/api/supabase/schema.sql`
**Lines:** 28-58

**Change:**
```sql
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(384),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 5,
  p_city_id UUID DEFAULT NULL  -- ADD THIS
)
RETURNS TABLE (...)
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
    AND (p_city_id IS NULL OR documents.city_id = p_city_id)  -- ADD THIS
  ORDER BY documents.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

**Step 2: Update Retrieval Service**
**File:** `apps/api/src/services/retrieval.ts`
**Line:** 24

**Change:**
```typescript
export async function retrieveDocuments(query: string, cityId: string): Promise<RetrievedDocument[]> {
  // ...
  const { data: documents, error } = await supabase.rpc('match_documents', {
    query_embedding: queryEmbedding,
    match_threshold: SIMILARITY_THRESHOLD,
    match_count: TOP_K,
    p_city_id: cityId,  // ADD THIS
  });
  // ...
}
```

**Step 3: Update Chat Handler**
**File:** `apps/api/src/routes/chat.ts`
**Line:** 216

**Change:**
```typescript
const documents = await retrieveDocuments(message, cityUuid);
```

### Fix 2: Lower Threshold + Add Logging (Hypothesis 2)

**Step 1: Lower Threshold**
**File:** `apps/api/src/services/retrieval.ts`
**Line:** 9

**Change:**
```typescript
const SIMILARITY_THRESHOLD = 0.3;  // Changed from 0.5
```

**Step 2: Add Logging**
**File:** `apps/api/src/services/retrieval.ts`
**After line 41:**

**Add:**
```typescript
if (!documents || documents.length === 0) {
  console.log('No documents retrieved. Query:', query, 'CityId:', cityId);
  return [];
}

// Log similarity scores
console.log('Retrieved documents:', documents.map(d => ({ 
  id: d.id, 
  similarity: d.similarity 
})));
```

## 7. Recommended Action Plan

1. **Immediate:** Implement Fix 1 (City Filtering) - This addresses the most likely root cause
2. **Secondary:** Add logging to diagnose threshold issues (Fix 2, Step 2)
3. **If still failing:** Lower threshold (Fix 2, Step 1) and investigate error handling

## Summary

**Primary Issue:** `match_documents` RPC function does NOT filter by `city_id`, causing global search across all cities instead of city-specific search. This is why Ploce documents (which exist) are not returned - they're competing with documents from all other cities in a global similarity search.

**Secondary Issue:** Similarity threshold of 0.5 may be too strict, and errors are silently caught without visibility.

**Root Cause Location:** `apps/api/supabase/schema.sql:28-58` - Missing `city_id` filter in `match_documents` function.
