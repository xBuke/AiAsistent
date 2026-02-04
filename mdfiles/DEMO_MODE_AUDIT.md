# DEMO_MODE Audit: Generic Demo Assistant Behavior

**Date:** 2026-02-04  
**Task:** Analyze if DEMO_MODE enables "generic demo assistant" behavior that causes vague answers

---

## Executive Summary

**Finding:** DEMO_MODE **DOES** enable generic assistant behavior, but **ONLY** when no documents are retrieved (`documents.length === 0`). When documents ARE found, DEMO_MODE has **NO EFFECT** on answer quality or style.

**Impact:** DEMO_MODE causes generic answers only in fallback scenarios (retrieval returns 0 docs). This is intentional to avoid showing "Ne mogu pouzdano odgovoriti" during demos.

---

## 1. DEMO_MODE Usage Classification

### 1.1 Logging Only (No Behavior Change)

| File | Lines | Classification |
|------|-------|----------------|
| `apps/api/src/routes/chat.ts` | 221-226 | Logging only (city resolution) |
| `apps/api/src/routes/chat.ts` | 258-269 | Logging only (retrieval results) |
| `apps/api/src/services/llm.ts` | 97-99 | Logging only (context injection) |
| `apps/api/src/services/llm.ts` | 103-104 | Logging only (empty context) |
| `apps/api/src/services/retrieval.ts` | 67-68 | Logging only (second pass) |
| `apps/api/src/services/retrieval.ts` | 72-73 | Logging only (first pass) |
| `apps/api/src/services/retrieval.ts` | 93-102 | Logging only (debug info) |

**Total:** 7 instances - all logging only, no answer style impact.

---

### 1.2 ⚠️ CRITICAL: Answer Style Change (Fallback Only)

| File | Lines | Classification | Impact |
|------|-------|----------------|--------|
| `apps/api/src/routes/chat.ts` | 276-359 | **Affects LLM prompt/persona** | **HIGH** - Changes answer style when no docs found |

**Condition:** `DEMO_MODE === 'true'` AND `documents.length === 0`

**Behavior Change:**
- **Non-DEMO_MODE:** Returns hardcoded fallback: `"Ne mogu pouzdano odgovoriti iz dostupnih dokumenata. Pokušajte preformulirati pitanje."`
- **DEMO_MODE:** Uses generic assistant LLM call with `demoSystemPrompt` that allows general answers

---

## 2. Detailed Analysis: `apps/api/src/routes/chat.ts` Lines 276-359

### 2.1 Code Flow

```typescript
// Line 273: Check if no documents retrieved
if (documents.length === 0) {
  usedFallback = true;
  
  // Line 277: Check DEMO_MODE
  const demoMode = process.env.DEMO_MODE === 'true';
  
  if (demoMode) {
    // Lines 280-351: Use generic assistant prompt
    const demoSystemPrompt = `Ti si AI asistent gradskih usluga.
    ...
    OPĆENITO:
    - Ako je službeni kontekst dostupan, koristi ga.
    - Ako kontekst nije dostupan, odgovori općenito i praktično (kako gradovi obično funkcioniraju).
    - Izbjegavaj izmišljanje specifičnih brojeva/datuma/pravnih tvrdnji.`;
    
    // Make LLM call with generic prompt (no context)
  } else {
    // Lines 361-368: Return hardcoded fallback message
    const fallbackMessage = 'Ne mogu pouzdano odgovoriti iz dostupnih dokumenata. Pokušajte preformulirati pitanje.';
  }
}
```

### 2.2 Generic Prompt Analysis (`demoSystemPrompt`)

**Location:** Lines 291-322

**Key Instructions That Enable Generic Answers:**

1. **Line 321:** `"Ako kontekst nije dostupan, odgovori općenito i praktično (kako gradovi obično funkcioniraju)."`
   - **Impact:** Allows generic answers without specific city data
   - **Risk:** May produce vague, non-specific responses

2. **Line 322:** `"Izbjegavaj izmišljanje specifičnih brojeva/datuma/pravnih tvrdnji."`
   - **Impact:** Prevents hallucination but may lead to overly cautious answers
   - **Risk:** May avoid specific details even when general knowledge could help

3. **Line 310:** `"UVJEK pozovi korisnika da postavi sljedeće pitanje."`
   - **Impact:** Encourages conversational flow
   - **Risk:** May feel scripted/generic

4. **Line 306:** `"Drži odgovore kratke i razgovorne (2–4 rečenice maksimalno)."`
   - **Impact:** Limits answer depth
   - **Risk:** May produce superficial answers

**When Used:** ONLY when `documents.length === 0` (no retrieval results)

---

## 3. Normal Flow (When Documents ARE Found)

**Key Finding:** DEMO_MODE has **ZERO EFFECT** when documents are retrieved.

### 3.1 Document Retrieval Success Path

```typescript
// Line 231: Retrieve documents
documents = await retrieveDocuments(message, cityUuid);

// Line 249: Build context
const context = buildContext(documents);

// Line 273: Check if documents exist
if (documents.length === 0) {
  // DEMO_MODE branch (only here)
} else {
  // Line 612: Normal flow - DEMO_MODE NOT CHECKED
  for await (const token of streamChat({ messages, context })) {
    // Uses BASE_SYSTEM_PROMPT + GROUNDING_INSTRUCTIONS + CONTEXT
    // DEMO_MODE has no effect here
  }
}
```

**Conclusion:** When `documents.length > 0`, the system uses:
- `BASE_SYSTEM_PROMPT` (from `llm.ts`)
- `GROUNDING_INSTRUCTIONS` (from `llm.ts`)
- Full document `CONTEXT` (from retrieval)

DEMO_MODE is **NOT CHECKED** in this path, so answer quality is unaffected.

---

## 4. Impact Assessment

### 4.1 When DEMO_MODE Causes Generic Answers

**Scenario:** `DEMO_MODE=true` AND retrieval returns 0 documents

**Examples:**
- Query has no matching documents (low similarity)
- Embedding/retrieval service failure (but caught and returns empty array)
- City has no documents in knowledge base

**Answer Style:**
- Generic, conversational responses
- No specific city data
- May reference "how cities usually work" (line 321)
- Short answers (2-4 sentences, line 306)

**Risk Level:** ⚠️ **MEDIUM** - Generic answers only in fallback scenarios

---

### 4.2 When DEMO_MODE Does NOT Affect Answers

**Scenario:** `DEMO_MODE=true` AND retrieval returns ≥1 documents

**Answer Style:**
- Uses full document context
- Specific city data extracted verbatim
- Grounded in retrieved documents
- Same quality as production (DEMO_MODE ignored)

**Risk Level:** ✅ **NONE** - No impact on answer quality

---

## 5. File-by-File Breakdown

### 5.1 `apps/api/src/routes/chat.ts`

| Line Range | DEMO_MODE Check | Classification | Impact on Answer Style |
|------------|-----------------|----------------|----------------------|
| 221-226 | `if (process.env.DEMO_MODE === 'true')` | Logging only | None |
| 258-269 | `if (process.env.DEMO_MODE === 'true')` | Logging only | None |
| 276-359 | `const demoMode = process.env.DEMO_MODE === 'true'` | **Answer style change** | **HIGH** (fallback only) |

**Total Impact:** 1 instance changes answer style (fallback case only)

---

### 5.2 `apps/api/src/services/llm.ts`

| Line Range | DEMO_MODE Check | Classification | Impact on Answer Style |
|------------|-----------------|----------------|----------------------|
| 97-99 | `if (process.env.DEMO_MODE === 'true')` | Logging only | None |
| 103-104 | `if (process.env.DEMO_MODE === 'true')` | Logging only | None |

**Total Impact:** 0 instances change answer style

**Note:** Line 68 contains "DEMO MODE - STROGA PRAVILA" but this is part of `GROUNDING_INSTRUCTIONS` constant, not conditional on DEMO_MODE.

---

### 5.3 `apps/api/src/services/retrieval.ts`

| Line Range | DEMO_MODE Check | Classification | Impact on Answer Style |
|------------|-----------------|----------------|----------------------|
| 67-68 | `if (process.env.DEMO_MODE === 'true')` | Logging only | None |
| 72-73 | `if (process.env.DEMO_MODE === 'true')` | Logging only | None |
| 93-102 | `if (process.env.DEMO_MODE === 'true')` | Logging only | None |

**Total Impact:** 0 instances change answer style

---

## 6. Recommendations

### 6.1 For YC Demo

**Option A: Keep DEMO_MODE=true (Current Behavior)**
- ✅ **Pros:** Prevents "Ne mogu pouzdano odgovoriti" during demo (better UX)
- ⚠️ **Cons:** May produce generic answers if retrieval fails
- **Risk:** Low - only affects fallback scenarios

**Option B: Disable DEMO_MODE for Demo**
- ✅ **Pros:** Shows honest fallback behavior
- ⚠️ **Cons:** May show "Ne mogu pouzdano odgovoriti" if retrieval fails
- **Risk:** Medium - could break demo flow if retrieval has issues

**Recommendation:** **Keep DEMO_MODE=true** for YC demo, but ensure retrieval is working well (pre-seed demo city with documents).

---

### 6.2 Flag Renaming (Optional)

**Current:** `DEMO_MODE` (ambiguous - could imply generic behavior always)

**Proposed:** Split into two flags:
- `DEMO_LOGS_ONLY=true` - Enable demo logging (no behavior change)
- `DEMO_FALLBACK_GENERIC=true` - Enable generic fallback when no docs found

**Benefit:** Clearer separation of concerns

**Priority:** Low - current behavior is acceptable

---

### 6.3 Code Changes (If Needed)

**If generic fallback is too vague:**

1. **Improve `demoSystemPrompt`** (lines 291-322):
   - Add instruction: "Ako nema specifičnih podataka, jasno reci da nema dostupnih informacija za taj grad"
   - Remove: "odgovori općenito i praktično" (line 321) - too vague

2. **Hybrid approach:**
   - Use generic prompt BUT add disclaimer: "Ovo je opći odgovor jer trenutno nemam dostupne specifične informacije za vaš grad."

**Priority:** Low - only affects fallback scenarios

---

## 7. Summary Table

| Scenario | DEMO_MODE | Documents Found | Answer Style | Generic? |
|----------|-----------|-----------------|--------------|----------|
| Normal retrieval | `true` | Yes (≥1) | Grounded in context | ❌ No |
| Normal retrieval | `false` | Yes (≥1) | Grounded in context | ❌ No |
| Fallback | `true` | No (0) | Generic assistant | ⚠️ **Yes** |
| Fallback | `false` | No (0) | Hardcoded message | ❌ No (but unhelpful) |

---

## 8. Conclusion

**DEMO_MODE enables generic demo assistant behavior ONLY when:**
- `documents.length === 0` (no retrieval results)
- Fallback scenario

**DEMO_MODE does NOT affect answer style when:**
- Documents are retrieved successfully
- Normal flow is used

**Recommendation for YC Demo:**
- ✅ **Keep DEMO_MODE=true** - Prevents unhelpful fallback messages
- ✅ **Ensure retrieval works** - Pre-seed demo city with documents to avoid fallback
- ⚠️ **Monitor fallback rate** - If many queries hit fallback, generic answers may appear

**Files with Answer Style Impact:**
- `apps/api/src/routes/chat.ts:276-359` - Generic prompt when no docs found

**Files with Logging Only:**
- `apps/api/src/routes/chat.ts:221-226, 258-269`
- `apps/api/src/services/llm.ts:97-99, 103-104`
- `apps/api/src/services/retrieval.ts:67-68, 72-73, 93-102`

---

**Audit Complete** - No code changes made (analysis only)
