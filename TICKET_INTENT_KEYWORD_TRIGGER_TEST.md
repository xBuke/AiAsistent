# Ticket Intent Keyword Trigger - Manual Test Checklist

## Implementation Summary

**File**: `apps/api/src/routes/chat.ts`
- **Keyword matching function**: Lines 34-52 (`matchesTicketIntent`)
- **Trigger check**: Lines 268-300 (before retrieval/LLM)
- **SSE event**: Emits `meta` event with `needs_human: true`

## Trigger Contract Confirmed

1. **Backend emits**: `event: meta` SSE event with JSON payload containing `needs_human: true`
   - Location: `apps/api/src/routes/chat.ts:295` (via `writeSseEvent`)
   
2. **Frontend listens**: `apps/web/src/widget/transports/api.ts:100-130` parses `meta` events
   - Stores in `transport.metadata`
   
3. **Frontend triggers form**: `apps/web/src/widget/WidgetApp.tsx:779-785`
   - Checks `meta?.needs_human === true`
   - Calls `setShowIntakeForm(true)` when true

## Supported Keywords (Case-Insensitive)

- "želim prijaviti kvar"
- "želim prijaviti problem"
- "prijava kvara"
- "prijava problema"
- "prijaviti problem"
- "prijaviti kvar"

## Manual Test Steps

### Prerequisites
1. Start the API server: `cd apps/api && npm run dev`
2. Start the web widget: `cd apps/web && npm run dev`
3. Open widget in browser (typically `http://localhost:5173`)

### Test Case 1: Exact Match - "Želim prijaviti problem ili kvar"
1. Open widget chat
2. Send message: "Želim prijaviti problem ili kvar"
3. **Expected**: 
   - ✅ Ticket form opens immediately (no LLM response)
   - ✅ No assistant message appears
   - ✅ Form is visible and ready for input
   - ✅ Check browser console: `CHAT_RESPONSE` log shows `needs_human: true`
   - ✅ Check network tab: SSE stream includes `event: meta` with `needs_human: true`

### Test Case 2: Case Variations
1. Send: "ŽELIM PRIJAVITI KVAR" (all caps)
2. **Expected**: ✅ Form opens (case-insensitive match)

### Test Case 3: Partial Match
1. Send: "Trebam prijaviti problem sa cestom"
2. **Expected**: ✅ Form opens (contains "prijaviti problem")

### Test Case 4: Other Keywords
1. Send: "prijava kvara"
2. **Expected**: ✅ Form opens

### Test Case 5: Non-Matching Message
1. Send: "Kada je radno vrijeme gradske uprave?"
2. **Expected**: 
   - ✅ Normal LLM response (no form)
   - ✅ No `needs_human: true` in metadata
   - ✅ Conversation continues normally

### Test Case 6: Verify No LLM Call
1. Send ticket intent message
2. **Expected**:
   - ✅ Check API logs: No "Stream tokens from LLM" log
   - ✅ Check API logs: "Ticket intent detected via keyword matching" log appears
   - ✅ Response latency is very low (<100ms, no LLM wait)

### Test Case 7: Verify Database Update
1. Send ticket intent message
2. Check database: `conversations` table
3. **Expected**:
   - ✅ `needs_human` column = `true` for the conversation
   - ✅ `last_activity_at` is updated

### Test Case 8: Form Submission Flow
1. Send ticket intent message (form opens)
2. Fill out ticket form with:
   - Name: "Test User"
   - Description: "Test problem description"
   - Other required fields
3. Submit form
4. **Expected**:
   - ✅ Form submits successfully
   - ✅ Confirmation message appears with ticket_ref
   - ✅ Ticket appears in "upiti koji traže reakciju grada" table
   - ✅ Ticket status = `contact_requested` or `open`

## Automated Test (Optional)

You can test the endpoint directly with curl:

```bash
curl -X POST http://localhost:3000/grad/demo/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Želim prijaviti problem ili kvar"}' \
  --no-buffer
```

**Expected SSE output**:
```
: keep-alive

event: meta
data: {"model":null,"latency_ms":<number>,"retrieved_docs_count":0,"retrieved_docs_top3":[],"used_fallback":false,"needs_human":true}

data: [DONE]
```

## Verification Checklist

- [ ] TypeScript build passes (`cd apps/api && npm run build`)
- [ ] No TypeScript errors
- [ ] Keyword matching is case-insensitive
- [ ] Form opens immediately (no delay)
- [ ] No LLM response appears
- [ ] SSE stream includes `needs_human: true` in meta event
- [ ] Database `conversations.needs_human` is set to `true`
- [ ] Form submission works correctly
- [ ] Ticket appears in tickets table after submission

## Edge Cases to Test

1. **Empty message**: Should not match (validation catches this earlier)
2. **Message with extra text**: "Pozdrav, želim prijaviti kvar na ulici" - should match
3. **Multiple keywords**: "Želim prijaviti problem i kvar" - should match
4. **Unicode normalization**: Test with different accents if applicable

## Notes

- This is a **deterministic** trigger - no LLM involvement
- Keywords are strict but case-insensitive
- Trigger happens BEFORE retrieval/LLM calls (minimal latency)
- All user-facing text remains in Croatian (no changes needed)
