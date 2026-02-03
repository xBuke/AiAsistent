# Diagnostic Report: Widget Fallback & Admin Dashboard Visibility Issues

**Date:** 2026-02-03  
**Issues:**
1. Public widget returns fallback message ("Ne mogu pouzdano odgovoriti...")
2. Conversations from https://gradai.mangai.hr/ not visible in /admin/demo

---

## 1. Widget Endpoint Analysis

### Widget Client Code
**File:** `apps/web/src/widget/transports/api.ts`
- **Function:** `ApiTransport.sendMessage()` (lines 11-235)
- **Endpoint:** `POST ${apiBaseUrl}/grad/${cityId}/chat`
- **Headers:** `Content-Type: application/json`
- **Body Payload:**
  ```json
  {
    "message": string,
    "conversationId"?: string,
    "messageId"?: string
  }
  ```

### Widget Configuration
**File:** `apps/web/src/widget/init.ts`
- **Function:** `initWidget()` (lines 27-82)
- **apiBaseUrl Source:** Read from `scriptTag.dataset.apiBase` attribute
- **cityId Source:** Read from `scriptTag.dataset.city` attribute
- **Note:** Widget on https://gradai.mangai.hr/ must have these data attributes configured

### Backend Chat Handler
**File:** `apps/api/src/routes/chat.ts`
- **Function:** `chatHandler()` (lines 25-768)
- **Route:** `POST /grad/:cityId/chat`
- **City Resolution:** 
  - First tries `slug` match (line 81)
  - Falls back to `code` match (uppercase, line 85-90)
- **Conversation Creation:** Lines 124-143
  - Creates conversation with `city_id`, `external_id`, `status: 'open'`, `fallback_count: 0`, `needs_human: false`
- **Message Insertion:** Lines 145-213 (user), 348-465 (assistant fallback), 598-722 (assistant success)

---

## 2. Admin Dashboard Endpoint Analysis

### "Razgovori" (Conversations) Endpoint
**File:** `apps/api/src/routes/adminRead.ts`
- **Function:** `getConversationsHandler()` (lines 360-418)
- **Route:** `GET /admin/:cityCode/conversations`
- **Query Logic:**
  - Calls `fetchConversationsWithDetails(city.id, false)` (line 390)
  - Filters: `needs_human = false OR null` (line 143)
  - **EXCLUDES** conversations that have tickets with `ticket_ref IS NOT NULL` (lines 392-411)
- **Helper Function:** `fetchConversationsWithDetails()` (lines 114-199)
  - Filters by `city_id` (line 134)
  - Sorts by `last_activity_at DESC`, then `updated_at DESC`, then `created_at DESC`

### "Upiti koji traže reakciju grada" (Tickets) Endpoint
**File:** `apps/api/src/routes/adminDashboard.ts`
- **Function:** `getTicketsListHandler()` (lines 399-492)
- **Route:** `GET /admin/tickets`
- **Query Logic:**
  - Queries `conversations` table (line 442-448)
  - Filters: `city_id = city.id` AND (`needs_human = true` OR `fallback_count > 0`)
  - **Note:** This is different from Inbox endpoint which queries `tickets` table

### Dashboard Summary Endpoint
**File:** `apps/api/src/routes/adminDashboard.ts`
- **Function:** `getDashboardSummaryHandler()` (lines 98-393)
- **Route:** `GET /admin/dashboard/summary`
- **Query Logic:**
  - Queries `conversations` table directly (lines 142-153)
  - Filters by `city_id` and date range
  - Tickets query: `needs_human = true OR fallback_count > 0` (line 211)

---

## 3. Database Write vs Read Comparison

### ✅ Conversations ARE Being Written
**Evidence:**
- `chat.ts` lines 124-143: Creates conversation record
- `chat.ts` lines 145-213: Inserts user message
- `chat.ts` lines 348-465 (fallback) & 598-722 (success): Inserts assistant message
- All writes use `city_id` from resolved city (line 98)

### ⚠️ Potential Divergence Points

1. **City ID Mismatch:**
   - Widget uses `cityId` from config (could be slug or code)
   - Admin uses `cityCode` from URL param
   - Resolution logic matches slug first, then code (lines 78-97)
   - **Risk:** If widget uses different identifier than admin expects, conversations written to different city_id

2. **Filtering Logic:**
   - Admin "Razgovori" excludes conversations with tickets (`ticket_ref IS NOT NULL`)
   - Admin "Tickets" only shows `needs_human = true OR fallback_count > 0`
   - **Risk:** Normal conversations (no fallback, no needs_human) should appear in "Razgovori" but might be excluded if they have tickets

3. **Date Range Filtering:**
   - Admin queries use `created_at` range filters
   - **Risk:** If conversations are older than default range (7d), they won't appear

---

## 4. Fallback Message Analysis

### Fallback Message Location
**File:** `apps/api/src/routes/chat.ts`
- **Line 309:** `'Ne mogu pouzdano odgovoriti iz dostupnih dokumenata. Pokušajte preformulirati pitanje.'`
- **Line 316:** Same message (non-demo mode)

### Fallback Trigger Conditions
**File:** `apps/api/src/routes/chat.ts`, line 227
```typescript
if (documents.length === 0) {
  usedFallback = true;
  // ... fallback logic
}
```

**File:** `apps/api/src/services/retrieval.ts`
- **Function:** `retrieveDocuments()` (lines 24-59)
- **Similarity Threshold:** `SIMILARITY_THRESHOLD = 0.5` (line 9)
- **Top K:** `TOP_K = 5` (line 8)
- **Filtering:** Documents with `similarity < 0.5` are filtered out (line 47)

### Fallback Scenarios (Ranked by Likelihood)

1. **No documents retrieved (RAG returns 0 documents)** ✅ CONFIRMED
   - Trigger: `documents.length === 0` (line 227)
   - Causes:
     - No documents in database
     - Query embedding doesn't match any documents above threshold (0.5)
     - `match_documents` RPC returns empty array

2. **DEMO_MODE LLM call fails** ⚠️ POSSIBLE
   - When `DEMO_MODE=true` and no docs found, tries LLM call (lines 233-305)
   - If LLM call fails (catch block line 306), falls back to hardcoded message (line 309)
   - **Current .env:** `DEMO_MODE=true` (confirmed in `.env` file)

3. **All documents below similarity threshold** ⚠️ POSSIBLE
   - Documents retrieved but filtered out due to `similarity < 0.5`
   - Results in `documents.length === 0` after filtering

---

## 5. Root Causes (Ranked by Likelihood)

### 🔴 HIGH PROBABILITY

#### 1. No Documents in Database / Low Similarity Scores
**Likelihood:** Very High
**Evidence:**
- Fallback triggers when `documents.length === 0`
- Similarity threshold is 0.5 (moderate)
- If documents exist but scores are < 0.5, they're filtered out
**Files:**
- `apps/api/src/services/retrieval.ts` (lines 9, 24-59)
- `apps/api/src/routes/chat.ts` (line 216, 227)

#### 2. DEMO_MODE LLM Call Failing
**Likelihood:** High
**Evidence:**
- `.env` has `DEMO_MODE=true`
- When no docs found, code attempts LLM call (lines 233-305)
- If LLM fails, catch block returns fallback message (lines 306-313)
- Error is logged but not surfaced to user
**Files:**
- `apps/api/src/routes/chat.ts` (lines 230-313)
- `apps/api/.env` (line 7: `DEMO_MODE=true`)

#### 3. City ID Mismatch Between Widget and Admin
**Likelihood:** Medium-High
**Evidence:**
- Widget uses `cityId` from config (could be slug or code)
- Admin uses `cityCode` from URL
- Resolution logic tries slug first, then code
- If widget uses different identifier, conversations written to wrong city_id
**Files:**
- `apps/api/src/routes/chat.ts` (lines 78-97)
- `apps/api/src/routes/adminRead.ts` (lines 42-63: `resolveCity()`)

### 🟡 MEDIUM PROBABILITY

#### 4. Conversations Filtered Out by Ticket Exclusion
**Likelihood:** Medium
**Evidence:**
- "Razgovori" endpoint excludes conversations with `ticket_ref IS NOT NULL` (lines 392-411)
- If widget conversations somehow get tickets created, they won't appear in "Razgovori"
**Files:**
- `apps/api/src/routes/adminRead.ts` (lines 392-411)

#### 5. Date Range Filtering
**Likelihood:** Low-Medium
**Evidence:**
- Admin queries use date range filters (default 7d)
- If conversations are older, they won't appear
**Files:**
- `apps/api/src/routes/adminDashboard.ts` (lines 114, 146-147)

### 🟢 LOW PROBABILITY

#### 6. Different Supabase Project / Environment Variables
**Likelihood:** Low
**Evidence:**
- `.env` shows Supabase URL: `https://uvzbrhjvcqwwtcnkjcoq.supabase.co`
- Widget might be pointing to different API base URL
- Need to verify widget's `apiBaseUrl` configuration on production site

---

## 6. Exact File Paths + Function Names

### Widget Endpoints
- **File:** `apps/web/src/widget/transports/api.ts`
  - **Function:** `ApiTransport.sendMessage()` (line 11)
  - **URL Construction:** Line 21: `${apiBaseUrl}/grad/${cityId}/chat`

### Backend Chat Handler
- **File:** `apps/api/src/routes/chat.ts`
  - **Function:** `chatHandler()` (line 25)
  - **Route Registration:** `registerChatRoutes()` (line 794)
  - **City Resolution:** Lines 78-97
  - **Conversation Creation:** Lines 124-143
  - **Fallback Logic:** Lines 226-554
  - **Fallback Message:** Lines 309, 316

### Retrieval Service
- **File:** `apps/api/src/services/retrieval.ts`
  - **Function:** `retrieveDocuments()` (line 24)
  - **Threshold:** `SIMILARITY_THRESHOLD = 0.5` (line 9)

### Admin Endpoints
- **File:** `apps/api/src/routes/adminRead.ts`
  - **Function:** `getConversationsHandler()` (line 360)
  - **Helper:** `fetchConversationsWithDetails()` (line 114)
  - **Helper:** `resolveCity()` (line 42)

- **File:** `apps/api/src/routes/adminDashboard.ts`
  - **Function:** `getTicketsListHandler()` (line 399)
  - **Function:** `getDashboardSummaryHandler()` (line 98)

---

## 7. Minimal Fix Plan

### Fix 1: Always Log All Conversations (Even Non-Ticket)
**Current Behavior:**
- Conversations are created in `chat.ts` lines 124-143 ✅ (already working)
- Messages are inserted ✅ (already working)

**Issue:**
- Conversations might be filtered out if they have tickets with `ticket_ref`

**Fix:**
- **File:** `apps/api/src/routes/adminRead.ts`
- **Function:** `getConversationsHandler()` (line 360)
- **Change:** Remove or modify ticket exclusion logic (lines 392-411)
- **Action:** Only exclude tickets that have `ticket_ref IS NOT NULL` AND are in "Inbox" (which uses different endpoint)
- **Note:** Current logic already excludes tickets with `ticket_ref`, but this might be too aggressive

### Fix 2: Ticket Routing - Only When ticket_ref Exists
**Current Behavior:**
- "Upiti koji traže reakciju grada" shows conversations with `needs_human = true OR fallback_count > 0`
- Inbox shows tickets from `tickets` table with `ticket_ref IS NOT NULL`

**Issue:**
- Two different definitions of "ticket"
- Dashboard tickets endpoint queries `conversations` table, not `tickets` table

**Fix:**
- **File:** `apps/api/src/routes/adminDashboard.ts`
- **Function:** `getTicketsListHandler()` (line 399)
- **Change:** Query `tickets` table instead of `conversations` table
- **Filter:** Only tickets with `ticket_ref IS NOT NULL` (form submitted)
- **Action:** 
  ```typescript
  // Instead of querying conversations, query tickets table
  const { data: tickets } = await supabase
    .from('tickets')
    .select('conversation_id, ticket_ref, status, ...')
    .eq('city_id', city.id)
    .not('ticket_ref', 'is', null)
    .gte('created_at', timeFrom.toISOString())
    .lte('created_at', timeTo.toISOString());
  ```

### Fix 3: Demo Mode Fallback - General Croatian Answer Instead of "Ne mogu pouzdano..."
**Current Behavior:**
- When `DEMO_MODE=true` and no docs found, tries LLM call
- If LLM fails, returns hardcoded fallback message (line 309)

**Fix:**
- **File:** `apps/api/src/routes/chat.ts`
- **Function:** `chatHandler()` (lines 226-554)
- **Change:** Improve DEMO_MODE fallback behavior
- **Action:**
  1. Ensure LLM call doesn't fail (check GROQ_API_KEY, network, etc.)
  2. If LLM still fails, use a more helpful general Croatian civic-assistant answer
  3. Update fallback message to be more informative:
     ```typescript
     const fallbackMessage = 'Dobrodošli! Ja sam AI asistent gradske uprave. Mogu vam pomoći s informacijama o gradskim uslugama, dokumentima i procedurama. Što vas konkretno zanima?';
     ```
  4. Consider making DEMO_MODE always succeed with a graceful fallback

**Alternative Approach:**
- Always use LLM in DEMO_MODE (even when docs found) with general assistant prompt
- Only use RAG when documents are available AND similarity is high enough

---

## 8. Verification Steps

### To Verify Widget Configuration:
1. Inspect https://gradai.mangai.hr/ page source
2. Find widget script tag: `<script src="..." data-city="..." data-api-base="...">`
3. Verify `data-api-base` points to correct API URL
4. Verify `data-city` matches expected city identifier

### To Verify Database State:
1. Query `conversations` table for recent entries:
   ```sql
   SELECT id, city_id, external_id, created_at, needs_human, fallback_count 
   FROM conversations 
   WHERE created_at > NOW() - INTERVAL '7 days'
   ORDER BY created_at DESC;
   ```
2. Check if conversations exist for the expected `city_id`
3. Verify `messages` table has corresponding entries

### To Verify Retrieval:
1. Check `documents` table has entries:
   ```sql
   SELECT COUNT(*) FROM documents WHERE embedding IS NOT NULL;
   ```
2. Test retrieval manually with a sample query
3. Check similarity scores in logs

### To Verify DEMO_MODE:
1. Check `.env` file has `DEMO_MODE=true`
2. Check `GROQ_API_KEY` is set and valid
3. Test LLM call directly (bypass retrieval)
4. Check server logs for LLM errors

---

## Summary

**Primary Issues:**
1. Fallback message appears when RAG returns 0 documents (likely due to no docs or low similarity)
2. DEMO_MODE LLM fallback might be failing silently
3. Conversations might be written but filtered out due to ticket exclusion logic

**Recommended Actions:**
1. ✅ Verify widget `apiBaseUrl` and `cityId` configuration on production
2. ✅ Check database for documents and recent conversations
3. ✅ Fix DEMO_MODE fallback to use general Croatian assistant answer
4. ✅ Align ticket routing logic (use `tickets` table with `ticket_ref` filter)
5. ✅ Ensure all conversations appear in "Razgovori" (review exclusion logic)
