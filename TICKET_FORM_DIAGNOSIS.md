# Ticket Form Regression Diagnosis

## Executive Summary

**Problem**: When users send "Imam problem" or "Želim prijaviti problem", the ticket intake form does NOT open, despite receiving metadata indicating `needs_human: true`.

**Root Cause**: **MOST LIKELY** - Frontend keyword matching patterns are incomplete and inconsistent with backend, causing messages to bypass the frontend gate and rely on backend metadata, but there may be a timing/state issue preventing the form from opening after streaming completes.

---

## TASK 1: Ticket Form Contract Specification

### Expected Contract

**Backend → Frontend Contract:**
- **If backend emits**: SSE `event: meta` with `{"needs_human": true}` (or `{"needsHuman": true}`)
- **Then frontend opens**: Ticket intake form via `setShowIntakeForm(true)` in `WidgetApp.tsx`

**File References:**
- **Backend emission**: `apps/api/src/routes/chat.ts:272-282` (keyword trigger) or `apps/api/src/routes/chat.ts:662-672` (normal LLM path - but currently hardcoded to `needs_human: false`)
- **Frontend reception**: `apps/web/src/widget/transports/api.ts:100-130` (SSE meta event parsing)
- **Frontend trigger**: `apps/web/src/widget/WidgetApp.tsx:878-922` (checks `meta?.needs_human === true` after streaming)

### Additional Frontend Gate (Pre-Backend)

**Frontend → Frontend Contract:**
- **If message matches**: `matchesTicketIntent()` in `ChatPanel.tsx:82-93` OR `WidgetApp.tsx:78-89`
- **Then frontend opens**: Form immediately WITHOUT sending to backend (early return)

**File References:**
- **Frontend gate**: `apps/web/src/widget/ui/ChatPanel.tsx:106-125` (checks before `onSend`)
- **Alternative gate**: `apps/web/src/widget/WidgetApp.tsx:430-460` (checks in `handleSend` before transport)

---

## TASK 2: End-to-End Flow Trace

### A) Frontend Message Send Handler

**Location**: `apps/web/src/widget/WidgetApp.tsx:429-1032`

**Flow**:
1. **Line 430-460**: Frontend gate check `matchesTicketIntent(text)` - if matches, opens form and returns early (skips backend)
2. **Line 476-489**: **CRITICAL**: Resets `setShowIntakeForm(false)` at start of EVERY send (even if gate didn't match)
3. **Line 671-748**: Streams tokens via `transport.sendMessage()` with `onMeta` callback
4. **Line 691-747**: `onMeta` callback stores metadata in `metaRef.current` and attaches to message
5. **Line 814-876**: After streaming completes, resolves metadata via `resolveMeta(transport)`
6. **Line 878-922**: **CRITICAL CHECK**: `const needsHuman = meta?.needs_human === true || meta?.needsHuman === true;` then `if (needsHuman && !intakeSubmitted) { setShowIntakeForm(true); }`

**Key Observations**:
- **Line 478**: `setShowIntakeForm(false)` is called at START of every send, potentially resetting state
- **Line 882**: Uses strict `=== true` check (undefined/null treated as false)
- **Line 899**: Only opens form if `needsHuman && !intakeSubmitted`

### B) Transport Layer (SSE Parsing)

**Location**: `apps/web/src/widget/transports/api.ts:14-285`

**Flow**:
1. **Line 76-80**: Parses SSE event type (`event: meta`, `event: action`, etc.)
2. **Line 100-130**: Handles `event: meta`:
   - Parses JSON payload
   - Stores in `this._metadata`
   - Calls `onMeta(parsed)` callback if provided
3. **Line 132-154**: Handles `event: message` (default) - yields tokens

**Key Observations**:
- **Line 104**: Stores metadata in `this._metadata` (accessible via `transport.metadata`)
- **Line 118-120**: Calls `onMeta` callback from input, which updates `metaRef.current` in WidgetApp
- **Line 128**: Resets `currentEvent = ''` after processing (could cause issues if multiple data lines)

### C) Backend Chat Handler

**Location**: `apps/api/src/routes/chat.ts:58-867`

**Flow**:
1. **Line 268-306**: **Keyword trigger path**: If `matchesTicketIntent(message)` matches:
   - Emits `event: meta` with `needs_human: true`, `model: null`, `retrieved_docs_count: 0`
   - Sends `data: [DONE]`
   - Updates conversation `needs_human: true` in DB
   - Returns early (no LLM call)
2. **Line 308-340**: Document retrieval (if keyword didn't match)
3. **Line 365-627**: **Fallback path**: If no documents retrieved:
   - Emits `event: meta` with `needs_human: false` (line 403)
   - Streams fallback message
   - Returns
4. **Line 642-655**: **LLM path**: Streams tokens from LLM
5. **Line 662-672**: **CRITICAL**: Emits `event: meta` with `needs_human: false` (hardcoded, line 670)
6. **Line 675**: Sends `data: [DONE]`

**Key Observations**:
- **Line 38-52**: Backend `matchesTicketIntent` patterns:
  - `'želim prijaviti kvar'` (with ž)
  - `'želim prijaviti problem'` (with ž)
  - `'prijava kvara'`
  - `'prijava problema'`
  - `'prijaviti problem'`
  - `'prijaviti kvar'`
- **Line 670**: Normal LLM success path ALWAYS sets `needs_human: false` (hardcoded)
- **Line 403**: Fallback path also sets `needs_human: false` (hardcoded)

### Keyword Pattern Mismatch Analysis

**Frontend patterns** (ChatPanel.tsx:84-91, WidgetApp.tsx:80-87):
- `'prijaviti problem'` ✓
- `'prijaviti kvar'` ✓
- `'prijava problema'` ✓
- `'prijava kvara'` ✓
- `'trebam prijaviti'` ✓
- `'zelim prijaviti'` ✓ (diacritics stripped)

**Backend patterns** (chat.ts:42-49):
- `'želim prijaviti kvar'` (with ž)
- `'želim prijaviti problem'` (with ž)
- `'prijava kvara'`
- `'prijava problema'`
- `'prijaviti problem'`
- `'prijaviti kvar'`

**User inputs**:
- `"Imam problem"` - ❌ NOT in any pattern list
- `"Želim prijaviti problem"` - ✓ Matches backend pattern (line 44), but frontend strips diacritics to "zelim prijaviti problem" which doesn't match frontend patterns exactly

---

## TASK 3: What Differs Now vs Expected

### Expected Behavior

1. User sends "Želim prijaviti problem"
2. **Option A (Frontend gate)**: Frontend `matchesTicketIntent` catches it → opens form immediately
3. **Option B (Backend trigger)**: Message goes to backend → backend `matchesTicketIntent` catches it → sends `needs_human: true` → frontend receives meta → opens form

### Actual Behavior (Based on User's Meta)

User receives:
```json
{"model":null,"latency_ms":1422,"retrieved_docs_count":0,"retrieved_docs_top3":[],"used_fallback":false,"needs_human":true}
```

This indicates:
- ✅ Backend keyword trigger fired (line 268-306 in chat.ts)
- ✅ Backend sent `needs_human: true`
- ✅ Frontend received meta event
- ❌ **Form did NOT open**

### The Break

**Hypothesis**: Frontend receives `needs_human: true` but form doesn't open due to:

1. **State reset issue**: `setShowIntakeForm(false)` at line 478 might be called AFTER the meta event sets it to true
2. **Timing issue**: Meta event arrives during streaming, but form check happens after streaming completes, and state might be stale
3. **Metadata resolution issue**: `resolveMeta()` at line 815 might not be finding the metadata correctly
4. **Condition check issue**: The `=== true` check at line 882 might be failing due to type coercion

---

## TASK 4: Ranked Hypotheses

### Root Cause Candidate #1 (MOST LIKELY): State Reset Race Condition

**Explanation**: 
- Line 478 in `WidgetApp.tsx` calls `setShowIntakeForm(false)` at the START of `handleSend`
- Meta event arrives DURING streaming (via `onMeta` callback at line 691-747)
- Meta event might trigger a state update to `true` via `metaRef.current` storage
- But the check at line 882 happens AFTER streaming completes, and the state might have been reset or the metadata might not be properly resolved

**Evidence**:
- User receives `needs_human: true` in meta (confirmed)
- Form doesn't open (confirmed)
- Line 478 explicitly resets form state at start
- Line 882 checks metadata AFTER streaming completes

**Confirming Check**:
- Add log at line 478: `console.log('[RESET] setShowIntakeForm(false) called, current meta:', metaRef.current)`
- Add log at line 882: `console.log('[CHECK] needsHuman check:', { needsHuman, meta, metaRef: metaRef.current, transportMeta: transport.metadata })`
- Add log in `onMeta` callback (line 693): `console.log('[META_RECEIVED]', metaObj)`

**File**: `apps/web/src/widget/WidgetApp.tsx:478, 691-747, 814-922`

---

### Root Cause Candidate #2: Metadata Resolution Failure

**Explanation**:
- `resolveMeta()` at line 815 checks: `metaRef.current || tmeta || traceMetadata`
- If `metaRef.current` is null (not set by `onMeta`), it falls back to `transport.metadata`
- But `transport.metadata` might not be set if the SSE event wasn't parsed correctly
- The `onMeta` callback might not be called if SSE parsing fails silently

**Evidence**:
- Line 104 in `api.ts` stores metadata in `this._metadata`
- Line 118-120 calls `onMeta` callback
- Line 128 resets `currentEvent = ''` which could cause issues if multiple data lines exist
- Line 815 `resolveMeta()` might return undefined if all sources are null

**Confirming Check**:
- Add log at line 815: `console.log('[RESOLVE_META]', { metaRef: metaRef.current, transportMeta: transport.metadata, resolved: meta })`
- Add log at line 104 in `api.ts`: `console.log('[API_TRANSPORT] Meta stored:', parsed)`
- Add log at line 118: `console.log('[API_TRANSPORT] Calling onMeta:', parsed)`

**Files**: 
- `apps/web/src/widget/WidgetApp.tsx:814-815`
- `apps/web/src/widget/transports/api.ts:100-130`

---

### Root Cause Candidate #3: Keyword Pattern Mismatch (Partial)

**Explanation**:
- "Imam problem" doesn't match ANY pattern (frontend or backend)
- "Želim prijaviti problem" matches backend pattern but frontend strips diacritics
- Frontend gate doesn't catch it → message goes to backend
- Backend catches it and sends `needs_human: true`
- But frontend might have already reset state or metadata isn't properly propagated

**Evidence**:
- "Imam problem" not in pattern lists (confirmed)
- Backend uses `ž` (with diacritic), frontend strips diacritics
- User's meta shows backend DID trigger (model: null, needs_human: true)

**Confirming Check**:
- Test with "Želim prijaviti problem" vs "zelim prijaviti problem" (normalized)
- Check if frontend gate catches it: add log at `ChatPanel.tsx:107` and `WidgetApp.tsx:431`
- Verify backend receives the message: check backend logs

**Files**:
- `apps/web/src/widget/ui/ChatPanel.tsx:82-93`
- `apps/web/src/widget/WidgetApp.tsx:78-89`
- `apps/api/src/routes/chat.ts:38-52`

---

### Root Cause Candidate #4: `intakeSubmitted` Guard

**Explanation**:
- Line 899 checks: `if (needsHuman && !intakeSubmitted)`
- If `intakeSubmitted` is `true` from a previous interaction, form won't open
- State might persist across messages

**Evidence**:
- Line 899 has explicit `!intakeSubmitted` check
- Line 348 sets `intakeSubmitted = true` after submission
- State might not be reset between conversations

**Confirming Check**:
- Add log at line 899: `console.log('[FORM_GUARD]', { needsHuman, intakeSubmitted, willOpen: needsHuman && !intakeSubmitted })`
- Check if `intakeSubmitted` state persists: add log in useEffect tracking state

**File**: `apps/web/src/widget/WidgetApp.tsx:899`

---

## TASK 5: Minimal Debug Patch List

### Frontend Debug Logs (WidgetApp.tsx)

**Location 1**: Line 431 (Frontend gate check)
```typescript
if (matchesTicketIntent(text)) {
  console.log('[DEBUG][FRONTEND_GATE] Matched ticket intent, opening form', { text, normalized: normalizeCroatianText(text) });
  // ... existing code
}
```

**Location 2**: Line 478 (State reset)
```typescript
// CRITICAL: Reset intake form state at the start of each message send
console.log('[DEBUG][RESET] Resetting showIntakeForm to false', { 
  beforeReset: showIntakeForm, 
  currentMeta: metaRef.current,
  transportMeta: transport instanceof ApiTransport ? transport.metadata : null
});
setShowIntakeForm(false);
```

**Location 3**: Line 693 (Meta received)
```typescript
onMeta: (metaObj) => {
  console.log('[DEBUG][META_RECEIVED] Meta event received', {
    needs_human: metaObj?.needs_human,
    needsHuman: metaObj?.needsHuman,
    fullMeta: metaObj,
    timestamp: Date.now()
  });
  // ... existing code
}
```

**Location 4**: Line 815 (Metadata resolution)
```typescript
// Resolve metadata from multiple sources (single source of truth)
const meta = resolveMeta(transport);
console.log('[DEBUG][RESOLVE_META] Resolved metadata', {
  metaRef: metaRef.current,
  transportMeta: transport instanceof ApiTransport ? transport.metadata : null,
  resolved: meta,
  needs_human: meta?.needs_human,
  needsHuman: meta?.needsHuman
});
```

**Location 5**: Line 882 (Needs human check)
```typescript
const needsHuman = meta?.needs_human === true || meta?.needsHuman === true;
console.log('[DEBUG][NEEDS_HUMAN_CHECK]', {
  metaNeedsHuman_snake: meta?.needs_human,
  metaNeedsHuman_camel: meta?.needsHuman,
  computedNeedsHuman: needsHuman,
  intakeSubmitted,
  willOpenForm: needsHuman && !intakeSubmitted,
  showIntakeFormBefore: showIntakeForm
});
```

**Location 6**: Line 906 (Form open call)
```typescript
if (needsHuman && !intakeSubmitted) {
  console.log('[DEBUG][FORM_OPEN] Calling setShowIntakeForm(true)', {
    needsHuman,
    intakeSubmitted,
    meta
  });
  setShowIntakeForm(true);
  // ... existing code
}
```

### Backend Debug Logs (chat.ts)

**Location 1**: Line 269 (Keyword match)
```typescript
if (matchesTicketIntent(message)) {
  request.log.info({ 
    message, 
    conversationUuid,
    normalized: message.toLowerCase().trim(),
    matched: true
  }, '[DEBUG][BACKEND_GATE] Ticket intent detected via keyword matching');
  // ... existing code
}
```

**Location 2**: Line 282 (Meta emission)
```typescript
writeSseEvent(reply.raw, 'meta', JSON.stringify(traceData));
request.log.info({
  conversationUuid,
  traceData,
  needs_human: traceData.needs_human
}, '[DEBUG][BACKEND_META] Emitting meta event with needs_human=true');
```

### Transport Debug Logs (api.ts)

**Location 1**: Line 101 (Meta event detected)
```typescript
// Handle meta event
if (currentEvent === 'meta') {
  console.log('[DEBUG][TRANSPORT] Meta event detected, payload:', payload.substring(0, 200));
  // ... existing code
}
```

**Location 2**: Line 118 (onMeta callback)
```typescript
// Call onMeta callback from input if provided
if (onMeta) {
  console.log('[DEBUG][TRANSPORT] Calling onMeta callback', {
    parsed,
    needs_human: parsed?.needs_human,
    needsHuman: parsed?.needsHuman
  });
  onMeta(parsed);
}
```

---

## Next Steps (Diagnostic Only)

1. **Add all debug logs** listed above (temporary, clearly marked)
2. **Test with exact inputs**:
   - "Imam problem"
   - "Želim prijaviti problem"
   - "zelim prijaviti problem" (normalized)
3. **Capture console logs** from:
   - Frontend gate check
   - State reset
   - Meta received
   - Metadata resolution
   - Needs human check
   - Form open call
4. **Capture backend logs** for:
   - Keyword match
   - Meta emission
5. **Compare timestamps** to identify race conditions or ordering issues

---

## Summary

**Most Likely Root Cause**: State reset race condition (#1) - `setShowIntakeForm(false)` at line 478 resets state, but meta event arrives during streaming and the check happens after streaming completes, potentially missing the metadata or having stale state.

**Secondary Likelihood**: Metadata resolution failure (#2) - `resolveMeta()` might not be finding the metadata correctly if `metaRef.current` is null and `transport.metadata` isn't set.

**Confidence**: High that backend IS sending `needs_human: true` (confirmed by user's meta), but frontend is NOT opening the form. The debug logs will pinpoint exactly where the flow breaks.
