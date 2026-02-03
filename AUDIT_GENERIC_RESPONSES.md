# Audit: Generic Responses Instead of Using Retrieved Documents

**Date:** 2026-02-03  
**Context:** Assistant sometimes responds with generic text (e.g., "uglavnom od:00 do:00") and does NOT cite sources, despite retrieved documents existing and `match_documents` working.

---

## 1. Prompt Templates / System Prompts Found

### 1.1 Main System Prompt (`apps/api/src/services/llm.ts`)

**Location:** Lines 21-46  
**Variable:** `BASE_SYSTEM_PROMPT`

```typescript
const BASE_SYSTEM_PROMPT = `Ti si službeni AI asistent gradske uprave u Republici Hrvatskoj.

JEZIK – OBAVEZNA PRAVILA:
- Odgovaraj ISKLJUČIVO na književnom hrvatskom standardu (HR).
...

TOČNOST:
- Ne izmišljaj podatke (telefoni, e-mailovi, datumi, rokovi, iznosi, radna vremena).
- Ako informacija nije sigurna ili nije dostupna, reci da nemaš pouzdanu informaciju i postavi jedno kratko potpitanje.
```

**⚠️ ISSUE:** Line 40 says "Ako informacija nije sigurna ili nije dostupna" - this could cause the model to be overly cautious and give generic responses even when context exists.

---

### 1.2 Grounding Instructions (`apps/api/src/services/llm.ts`)

**Location:** Lines 49-56  
**Variable:** `GROUNDING_INSTRUCTIONS`  
**When added:** Only when `context && context.length > 0` (line 72)

```typescript
const GROUNDING_INSTRUCTIONS = `

OGRANIČENJA ODGOVORA (KRITIČNO):
- Odgovaraj ISKLJUČIVO na temelju informacija iz CONTEXT-a koji ti je dostavljen.
- Ako CONTEXT ne sadrži informaciju potrebnu za odgovor na korisnikovo pitanje, reci to jasno i postavi jedno kratko potpitanje za pojašnjenje.
- NIKADA ne izmišljaj podatke koji nisu u CONTEXT-u.
- NIKADA ne pretpostavljaj informacije koje nisu eksplicitno navedene u CONTEXT-u.
- Ako CONTEXT ne pokriva korisnikovo pitanje, jednostavno reci da nemaš tu informaciju u dostupnim dokumentima i postavi jedno kratko potpitanje.`;
```

**✅ GOOD:** Explicitly tells model to use CONTEXT.  
**⚠️ MISSING:** No instruction to cite sources (e.g., "Prema dokumentu...").  
**⚠️ ISSUE:** "NIKADA ne pretpostavljaj" might cause model to be too conservative and avoid extracting specific times/dates even when they're in the context.

---

### 1.3 Demo Mode Prompt (`apps/api/src/routes/chat.ts`)

**Location:** Lines 249-280  
**Variable:** `demoSystemPrompt`  
**When used:** Only when `DEMO_MODE === 'true'` AND `documents.length === 0` (line 237)

```typescript
const demoSystemPrompt = `Ti si AI asistent gradskih usluga.
...
OPĆENITO:
- Ako je službeni kontekst dostupan, koristi ga.
- Ako kontekst nije dostupan, odgovori općenito i praktično (kako gradovi obično funkcioniraju).
- Izbjegavaj izmišljanje specifičnih brojeva/datuma/pravnih tvrdnji.`;
```

**✅ GOOD:** Only used when NO documents found.  
**⚠️ NOTE:** This prompt is NOT used when documents ARE found, so it's not causing the generic responses in production.

---

### 1.4 Fallback Messages (`apps/api/src/routes/chat.ts`)

**Location:** Lines 313, 320  
**Keyword:** "Ne mogu pouzdano"

```typescript
// Line 313 (DEMO_MODE fallback)
const fallbackMessage = 'Ne mogu pouzdano odgovoriti iz dostupnih dokumenata. Pokušajte preformulirati pitanje.';

// Line 320 (non-DEMO_MODE fallback)
const fallbackMessage = 'Ne mogu pouzdano odgovoriti iz dostupnih dokumenata. Pokušajte preformulirati pitanje.';
```

**✅ GOOD:** These are only used when `documents.length === 0`, not when documents exist.

---

## 2. Document Injection Flow

### 2.1 Document Retrieval (`apps/api/src/routes/chat.ts`)

**Location:** Lines 220-221

```typescript
const documents = await retrieveDocuments(message, cityUuid);
const context = buildContext(documents);
```

**✅ GOOD:** Documents are retrieved with full content (see `retrieval.ts`).

---

### 2.2 Context Building (`apps/api/src/services/retrieval.ts`)

**Location:** Lines 80-107  
**Function:** `buildContext(documents: RetrievedDocument[])`

```typescript
export function buildContext(documents: RetrievedDocument[]): string {
  if (documents.length === 0) {
    return '';
  }

  let context = '';
  for (const doc of documents) {
    if (!doc.content) continue;  // ⚠️ SKIPS docs without content

    const truncated = doc.content.length > MAX_DOC_CHARS
      ? doc.content.substring(0, MAX_DOC_CHARS)
      : doc.content;

    const title = doc.title || 'Untitled';
    const source = doc.source_url || 'N/A';
    
    const docSection = `DOC ${documents.indexOf(doc) + 1} TITLE: ${title}\nSOURCE: ${source}\nCONTENT: ${truncated}\n---\n`;

    // Stop if adding this doc would exceed limit
    if (context.length + docSection.length > MAX_TOTAL_CONTEXT_CHARS) {
      break;
    }

    context += docSection;
  }

  return context;
}
```

**✅ GOOD:** Full document content IS included (not just titles).  
**✅ GOOD:** Format includes TITLE, SOURCE, and CONTENT.  
**⚠️ POTENTIAL ISSUE:** If `doc.content` is null/empty, the document is skipped. Need to verify documents in DB have content.

---

### 2.3 Context Injection into LLM (`apps/api/src/services/llm.ts`)

**Location:** Lines 70-75

```typescript
// Build system prompt with grounding instructions if context is provided
let systemPrompt = BASE_SYSTEM_PROMPT;
if (context && context.length > 0) {
  systemPrompt += GROUNDING_INSTRUCTIONS;
  systemPrompt += `\n\nCONTEXT:\n${context}`;
}
```

**✅ GOOD:** Context IS added to system prompt when documents exist.  
**✅ GOOD:** Grounding instructions ARE added when context exists.

---

### 2.4 LLM Call (`apps/api/src/services/llm.ts`)

**Location:** Lines 78-87

```typescript
const groqMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
  {
    role: 'system',
    content: systemPrompt,  // Contains BASE_SYSTEM_PROMPT + GROUNDING_INSTRUCTIONS + CONTEXT
  },
  ...messages.map((msg) => ({
    role: msg.role as 'user' | 'assistant',
    content: msg.content,
  })),
];
```

**✅ GOOD:** Context is in the system prompt, which is sent to the LLM.

---

## 3. Runtime Flags

### 3.1 DEMO_MODE

**Location:** `apps/api/src/routes/chat.ts:235`  
**Usage:** Only affects behavior when `documents.length === 0`

```typescript
const demoMode = process.env.DEMO_MODE === 'true';

if (demoMode) {
  // Uses demoSystemPrompt (generic assistant)
} else {
  // Uses fallback message
}
```

**✅ GOOD:** DEMO_MODE does NOT affect behavior when documents ARE found.  
**✅ GOOD:** When documents exist, normal flow is used regardless of DEMO_MODE.

---

### 3.2 NODE_ENV

**Location:** `apps/api/src/routes/auth.ts:112, 135`  
**Usage:** Only for cookie security settings, NOT for prompt behavior.

**✅ GOOD:** NODE_ENV does NOT affect chat prompts or document retrieval.

---

### 3.3 Other Flags

**Search results:** No `STRICT_MODE`, `SAFE_MODE`, or `RAG_DISABLED` flags found in codebase.

**✅ GOOD:** No flags disable RAG or change prompt behavior when documents exist.

---

## 4. Why "od:00 do:00" Nonsense Response?

### 4.1 Document Content Verification

**Location:** `apps/api/data/docs/03_city_admin_working_hours.txt`

The document EXISTS and contains proper content:
```
Službeno radno vrijeme gradske uprave:
- Ponedjeljak, utorak, srijeda i petak: 07:30 – 15:30
- Četvrtak: 11:00 – 19:00
```

**✅ GOOD:** Document has specific times, not placeholders.

---

### 4.2 Root Cause Analysis

**Most Likely Causes (ranked):**

#### 🔴 **CAUSE #1: Model Over-Conservatism Due to Conflicting Instructions**

**Evidence:**
- `BASE_SYSTEM_PROMPT` line 40: "Ako informacija nije sigurna ili nije dostupna, reci da nemaš pouzdanu informaciju"
- `GROUNDING_INSTRUCTIONS` line 55: "NIKADA ne pretpostavljaj informacije koje nisu eksplicitno navedene"

**Problem:** The model might interpret "ne pretpostavljaj" as "don't extract specific times unless 100% certain", leading to placeholder-like responses ("od:00 do:00") instead of using the actual times from context.

**Location:** `apps/api/src/services/llm.ts:40, 55`

---

#### 🟡 **CAUSE #2: Missing Explicit Citation Instruction**

**Evidence:**
- No instruction to cite sources (e.g., "Prema dokumentu...")
- No instruction to explicitly reference the CONTEXT when answering

**Problem:** Model might use context but not cite it, and might generate generic responses without clear attribution.

**Location:** `apps/api/src/services/llm.ts:49-56` (GROUNDING_INSTRUCTIONS)

---

#### 🟡 **CAUSE #3: Context Format Might Not Be Clear Enough**

**Evidence:**
- Context format: `DOC 1 TITLE: ...\nSOURCE: ...\nCONTENT: ...\n---\n`
- No explicit instruction to extract specific data types (times, dates, etc.) from CONTENT

**Problem:** Model might not recognize that times in CONTENT should be extracted and used verbatim.

**Location:** `apps/api/src/services/retrieval.ts:96`

---

#### 🟢 **CAUSE #4: Documents Missing Content Field**

**Evidence:**
- `buildContext()` skips documents where `doc.content` is null/empty (line 87)
- If documents in DB have null `content`, they won't be included in context

**Problem:** Need to verify that documents in production DB have `content` populated.

**Location:** `apps/api/src/services/retrieval.ts:87`

---

## 5. Most Likely Root Cause

**PRIMARY ISSUE:** The `BASE_SYSTEM_PROMPT` instruction "Ako informacija nije sigurna ili nije dostupna" combined with `GROUNDING_INSTRUCTIONS` "NIKADA ne pretpostavljaj" creates a conflict:

1. Model receives context with specific times (07:30-15:30, etc.)
2. Model is told "don't assume/hallucinate"
3. Model interprets this as "be very conservative with specific numbers"
4. Model generates placeholder-like response ("od:00 do:00") instead of extracting actual times from context

**Secondary Issue:** No explicit instruction to cite sources or use "Prema dokumentu..." lead-in.

---

## 6. Minimal Fix Plan

### Fix 1: Strengthen Grounding Instructions

**File:** `apps/api/src/services/llm.ts`  
**Location:** Lines 49-56 (GROUNDING_INSTRUCTIONS)

**Change:**
```typescript
const GROUNDING_INSTRUCTIONS = `

OGRANIČENJA ODGOVORA (KRITIČNO):
- Odgovaraj ISKLJUČIVO na temelju informacija iz CONTEXT-a koji ti je dostavljen.
- KORISTI točne podatke iz CONTEXT-a (vremena, datume, brojeve) - ne izmišljaj ih.
- Ako CONTEXT sadrži specifične podatke (npr. radno vrijeme 07:30-15:30), koristi te točne podatke.
- Ako CONTEXT ne sadrži informaciju potrebnu za odgovor na korisnikovo pitanje, reci to jasno i postavi jedno kratko potpitanje za pojašnjenje.
- NIKADA ne izmišljaj podatke koji nisu u CONTEXT-u.
- NIKADA ne pretpostavljaj informacije koje nisu eksplicitno navedene u CONTEXT-u.
- Ako CONTEXT ne pokriva korisnikovo pitanje, jednostavno reci da nemaš tu informaciju u dostupnim dokumentima i postavi jedno kratko potpitanje.`;
```

**Rationale:** Explicitly tells model to USE exact data from context, not avoid it.

---

### Fix 2: Add Citation Instruction (Optional)

**File:** `apps/api/src/services/llm.ts`  
**Location:** After GROUNDING_INSTRUCTIONS

**Change:**
```typescript
const GROUNDING_INSTRUCTIONS = `
...
- Ako CONTEXT ne pokriva korisnikovo pitanje, jednostavno reci da nemaš tu informaciju u dostupnim dokumentima i postavi jedno kratko potpitanje.

CITIRANJE (OPCIJA):
- Možeš koristiti "Prema dokumentu..." ili "Prema dostupnim dokumentima..." kao uvod u odgovor kada koristiš informacije iz CONTEXT-a.
- Nije obavezno, ali može poboljšati transparentnost.`;
```

**Rationale:** Encourages citation without making it mandatory.

---

### Fix 3: Clarify "Uncertainty" Instruction

**File:** `apps/api/src/services/llm.ts`  
**Location:** Line 40 (BASE_SYSTEM_PROMPT)

**Change:**
```typescript
TOČNOST:
- Ne izmišljaj podatke (telefoni, e-mailovi, datumi, rokovi, iznosi, radna vremena).
- Ako informacija nije sigurna ili nije dostupna U KONTEKSTU, reci da nemaš pouzdanu informaciju i postavi jedno kratko potpitanje.
- Ako je informacija DOSTUPNA U KONTEKSTU, koristi je točno kako je navedena.
```

**Rationale:** Clarifies that "uncertainty" only applies when context is missing, not when context exists.

---

### Fix 4: Verify Document Content in Production

**Action:** Check production database to ensure documents have `content` field populated.

**SQL Query:**
```sql
SELECT id, title, 
       CASE WHEN content IS NULL OR content = '' THEN 'MISSING' ELSE 'OK' END as content_status,
       LENGTH(content) as content_length
FROM documents
WHERE city_id = (SELECT id FROM cities WHERE slug = 'ploce' LIMIT 1)
LIMIT 10;
```

---

## 7. Summary

### Findings

1. ✅ **Documents ARE retrieved** with full content
2. ✅ **Context IS injected** into LLM prompt when documents exist
3. ✅ **Grounding instructions ARE added** when context exists
4. ⚠️ **Prompt instructions may be too conservative**, causing model to avoid extracting specific data
5. ⚠️ **No explicit citation instruction** (optional)
6. ✅ **DEMO_MODE does NOT affect** behavior when documents exist

### Root Cause

**PRIMARY:** Conflicting instructions in `BASE_SYSTEM_PROMPT` and `GROUNDING_INSTRUCTIONS` cause model to be overly conservative, generating placeholder-like responses instead of extracting specific data from context.

**SECONDARY:** Missing explicit instruction to use exact data from context (times, dates, etc.).

### Recommended Fixes (Minimal, No Refactor)

1. **Strengthen GROUNDING_INSTRUCTIONS** to explicitly tell model to USE exact data from context
2. **Clarify BASE_SYSTEM_PROMPT** "uncertainty" instruction to only apply when context is missing
3. **Add optional citation instruction** (e.g., "Prema dokumentu...")
4. **Verify production DB** documents have content populated

### Files to Modify

- `apps/api/src/services/llm.ts` (lines 40, 49-56)

### Files to Verify (No Changes)

- `apps/api/src/services/retrieval.ts` (already correct)
- `apps/api/src/routes/chat.ts` (already correct)

---

**End of Audit Report**
