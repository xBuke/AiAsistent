# Citation Fields Analysis

## Executive Summary

This document analyzes all citation-related fields across the codebase to determine their data structures, usage locations, and how they're returned (JSON response, SSE streaming, or DB storage). The goal is to identify a single canonical `Citation` type for UI rendering without refactoring.

---

## Field Occurrences

### 1. `retrieved_docs_top3`

#### Backend Creation (API)
**File:** `apps/api/src/routes/chat.ts`  
**Lines:** 70, 220-224, 331, 581, 739

**Data Structure:**
```typescript
// Line 70: Variable declaration
let retrievedDocs: Array<{ title: string | null; source: string | null; score: number }> = [];

// Lines 220-224: Creation from retrieved documents
retrievedDocs = documents.slice(0, 3).map(doc => ({
  title: doc.title,                    // string | null
  source: doc.source_url || null,     // string | null (from RetrievedDocument.source_url)
  score: doc.similarity,              // number (from RetrievedDocument.similarity)
}));
```

**Runtime Shape:**
```typescript
Array<{
  title: string | null;
  source: string | null;
  score: number;
}>
```

**Source Document Structure** (from `apps/api/src/services/retrieval.ts`):
```typescript
interface RetrievedDocument {
  id: string;
  title: string | null;
  source_url: string | null;
  content: string | null;
  similarity: number;
}
```

#### SSE Streaming Event
**File:** `apps/api/src/routes/chat.ts`  
**Lines:** 335, 585, 743

**Event Format:**
```typescript
// Lines 327-335 (fallback case)
const traceData = {
  model: string,
  latency_ms: number,
  retrieved_docs_count: 0,
  retrieved_docs_top3: [],  // Empty array
  used_fallback: true,
  needs_human: false,
};
reply.raw.write(`event: meta\ndata: ${JSON.stringify(traceData)}\n\n`);

// Lines 577-585 (success case)
const traceData = {
  model: string,
  latency_ms: number,
  retrieved_docs_count: documents.length,
  retrieved_docs_top3: retrievedDocs,  // Array with 0-3 items
  used_fallback: false,
  needs_human: false,
};
reply.raw.write(`event: meta\ndata: ${JSON.stringify(traceData)}\n\n`);

// Lines 735-743 (error case)
const traceData = {
  model: string,
  latency_ms: number,
  retrieved_docs_count: retrievedDocs.length,
  retrieved_docs_top3: retrievedDocs,  // Array with 0-3 items
  used_fallback: false,
  needs_human: false,
};
reply.raw.write(`event: meta\ndata: ${JSON.stringify(traceData)}\n\n`);
```

**SSE Event Type:** `event: meta`  
**Endpoint:** `POST /grad/:cityId/chat`  
**Return Type:** SSE streaming event (not JSON response)

#### Frontend Extraction
**File:** `apps/web/src/widget/transports/api.ts`  
**Lines:** 98-105

```typescript
// Handle meta event
if (currentEvent === 'meta') {
  try {
    this._metadata = JSON.parse(payload);  // Contains retrieved_docs_top3
  } catch {
    // Ignore parse errors for metadata
  }
  currentEvent = ''; // Reset event type
  continue;
}
```

**Access:** `transport.metadata?.retrieved_docs_top3`  
**Type:** `Record<string, any> | null`

#### Database Storage
**File:** `apps/api/src/routes/chat.ts`  
**Lines:** 374-380, 629-635

**⚠️ IMPORTANT:** `retrieved_docs_top3` is **NOT** stored in the database `messages.metadata` column. Only these fields are stored:

```typescript
// Lines 374-380 (fallback case)
metadata: {
  latency_ms: number,
  confidence: null,
  retrieved_sources_count: 0,
  resolved_by_ai: false,
  used_fallback: true,
}

// Lines 629-635 (success case)
metadata: {
  latency_ms: number,
  confidence: 'high' | 'medium' | 'low',
  retrieved_sources_count: number,  // documents.length
  resolved_by_ai: true,
  used_fallback: false,
}
```

**Database Column:** `messages.metadata` (JSONB)  
**Migration:** `apps/api/db/migrations/add_messages_metadata.sql`  
**Comment:** "Debug trace metadata for assistant messages. Contains model name, latency_ms, retrieved_docs_top3, retrieved_docs_count, and used_fallback."  
**⚠️ NOTE:** The comment mentions `retrieved_docs_top3`, but it's actually NOT stored in DB - only `retrieved_sources_count` is stored.

#### Admin API Retrieval
**File:** `apps/api/src/routes/adminRead.ts`  
**Lines:** 475, 491

```typescript
// Line 475: Select includes metadata
.select('id, role, content_redacted, created_at, external_id, metadata')

// Line 491: Returned as-is
metadata: msg.metadata || null,
```

**Endpoint:** `GET /admin/:cityCode/conversations/:conversationUuid/messages`  
**Return Type:** JSON response  
**⚠️ NOTE:** Since `retrieved_docs_top3` is not stored in DB, it will be `null` or missing from `metadata` when retrieved via admin API.

---

### 2. `retrieved_docs` (without `_top3` suffix)

**Occurrences:** Only in variable names and comments. No separate field exists.

---

### 3. `sources`

**Occurrences:** Found 1903 matches, but **NONE** are citation-related. All matches are:
- Source map files (`sources: [...]`)
- General documentation references
- No actual citation field named `sources`

**Conclusion:** No citation field named `sources` exists in the codebase.

---

### 4. `citations`

**Occurrences:** Found 7 matches, but **NONE** are actual citation fields:
- Documentation mentions (`.md` files)
- Tokenizer vocabulary (`tokenizer.json`)
- No actual citation field named `citations` exists

**Conclusion:** No citation field named `citations` exists in the codebase.

---

### 5. `doc_id`

**Occurrences:** **0 matches** (no citation-related `doc_id` field)

**Note:** `RetrievedDocument` interface has `id: string`, but this is not exposed in `retrieved_docs_top3`.

---

### 6. `chunk_id`

**Occurrences:** **0 matches** (no `chunk_id` field exists)

---

### 7. `metadata` (as container for citations)

**Occurrences:** 1833 matches (very common term)

**Relevant Usage:**
- `messages.metadata` (JSONB column in database)
- `transport.metadata` (from SSE `meta` event)
- `traceMetadata` (frontend variable)

**Citation Data Location:**
- **SSE:** `metadata.retrieved_docs_top3` (available during streaming)
- **DB:** `metadata.retrieved_sources_count` (only count, not the actual citations)
- **Frontend:** `transport.metadata?.retrieved_docs_top3` (available after streaming)

---

## Data Flow Summary

### 1. Backend Creation
```
RetrievedDocument[] (from retrieval service)
  ↓
documents.slice(0, 3).map(...) 
  ↓
retrievedDocs: Array<{title, source, score}>
  ↓
traceData.retrieved_docs_top3
```

### 2. SSE Streaming
```
POST /grad/:cityId/chat
  ↓
Stream tokens: data: <token>\n\n
  ↓
Stream completion: data: [DONE]\n\n
  ↓
Stream metadata: event: meta\ndata: {...retrieved_docs_top3...}\n\n
```

### 3. Frontend Extraction
```
ApiTransport.sendMessage()
  ↓
Parse SSE: event: meta → this._metadata = JSON.parse(payload)
  ↓
WidgetApp: transport.metadata?.retrieved_docs_top3
```

### 4. Database Storage
```
⚠️ NOT STORED: retrieved_docs_top3 is NOT saved to DB
✅ STORED: retrieved_sources_count (number only)
```

### 5. Admin API Retrieval
```
GET /admin/:cityCode/conversations/:conversationUuid/messages
  ↓
Returns: { metadata: { retrieved_sources_count: number, ... } }
  ↓
⚠️ retrieved_docs_top3 is MISSING (not stored in DB)
```

---

## Current UI State

**File:** `apps/web/src/widget/ui/MessageList.tsx`  
**Lines:** 5-9

```typescript
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  // ⚠️ NO metadata field
  // ⚠️ NO citations field
}
```

**Conclusion:** Citations are **NOT** currently rendered in the UI. The `Message` interface doesn't include metadata or citations.

---

## Canonical Citation Type

Based on the analysis, here is the **single canonical Citation type** that matches the runtime data structure:

```typescript
/**
 * Canonical Citation type matching retrieved_docs_top3 structure
 * This is the exact shape returned in SSE meta events and available
 * in transport.metadata.retrieved_docs_top3
 */
export interface Citation {
  /** Document title (may be null) */
  title: string | null;
  
  /** Source URL (may be null) */
  source: string | null;
  
  /** Similarity score (0-1 range, typically 0.5-1.0) */
  score: number;
}

/**
 * Citations array type (top 3 retrieved documents)
 */
export type Citations = Citation[];

/**
 * Extended metadata type that includes citations
 * This matches the structure from SSE meta events
 */
export interface ChatMetadata {
  /** Model name used for generation */
  model: string;
  
  /** Response latency in milliseconds */
  latency_ms: number;
  
  /** Total number of documents retrieved */
  retrieved_docs_count: number;
  
  /** Top 3 retrieved documents for citations */
  retrieved_docs_top3: Citations;
  
  /** Whether fallback response was used */
  used_fallback: boolean;
  
  /** Whether human intervention is needed */
  needs_human: boolean;
}
```

---

## Key Findings

1. **Single Citation Source:** Only `retrieved_docs_top3` contains citation data
2. **SSE Only:** Citations are available via SSE `meta` event, NOT in JSON responses
3. **Not Stored in DB:** `retrieved_docs_top3` is NOT persisted - only `retrieved_sources_count` is stored
4. **Frontend Access:** Available via `transport.metadata?.retrieved_docs_top3` after streaming completes
5. **UI Missing:** Citations are not currently rendered - `Message` interface lacks metadata field
6. **Admin API Limitation:** Admin API cannot retrieve citations because they're not stored in DB

---

## Recommendations

### For UI Rendering (No Refactoring Required)

1. **Extend Message Interface:**
```typescript
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: ChatMetadata;  // Add optional metadata
}
```

2. **Pass Metadata When Creating Messages:**
```typescript
// In WidgetApp.tsx after streaming completes
const assistantMessage: Message = {
  id: assistantMessageId,
  role: 'assistant',
  content: finalAnswerContent,
  metadata: traceMetadata,  // Include citations here
};
```

3. **Render Citations in MessageList:**
```typescript
{message.metadata?.retrieved_docs_top3?.length > 0 && (
  <div className="citations">
    {message.metadata.retrieved_docs_top3.map((citation, idx) => (
      <a key={idx} href={citation.source || '#'} target="_blank">
        {citation.title || 'Source'}
      </a>
    ))}
  </div>
)}
```

### For Database Persistence (Future Enhancement)

If citations need to be stored for admin retrieval:

1. **Update DB Storage:**
```typescript
metadata: {
  ...existingFields,
  retrieved_docs_top3: retrievedDocs,  // Add this
}
```

2. **Update Migration Comment:**
The comment already mentions `retrieved_docs_top3`, but the actual storage doesn't include it.

---

## File Reference Summary

| File | Lines | Purpose |
|------|-------|---------|
| `apps/api/src/routes/chat.ts` | 70, 220-224, 331, 581, 739 | Creates `retrieved_docs_top3`, sends via SSE |
| `apps/api/src/services/retrieval.ts` | 13-19 | Defines `RetrievedDocument` interface |
| `apps/web/src/widget/transports/api.ts` | 98-105 | Extracts metadata from SSE `meta` event |
| `apps/web/src/widget/WidgetApp.tsx` | 674-678 | Accesses `transport.metadata` |
| `apps/web/src/widget/ui/MessageList.tsx` | 5-9 | Defines `Message` interface (no metadata) |
| `apps/api/src/routes/adminRead.ts` | 475, 491 | Returns messages with metadata (citations missing) |
| `apps/api/db/migrations/add_messages_metadata.sql` | 9 | Documents metadata column (mentions citations but not stored) |

---

## Conclusion

**Single Source of Truth:** `retrieved_docs_top3` in SSE `meta` events  
**Canonical Type:** `Citation` interface as defined above  
**Current State:** Citations exist but are not rendered in UI  
**Storage:** Citations are NOT persisted to database  
**Access:** Available via `transport.metadata?.retrieved_docs_top3` after streaming

The canonical `Citation` type can be used directly without refactoring - it matches the exact runtime structure from the backend.
