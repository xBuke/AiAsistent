# Prompt Fixes: Eliminate Generic/Placeholder Answers

**Date:** 2026-02-03  
**Goal:** Force assistant to use retrieved CONTEXT verbatim when available, eliminate placeholders like "od:00 do:00"

---

## Code Edits

### File: `apps/api/src/services/llm.ts`

#### Change 1: Updated TOČNOST section (lines 38-41)

**Before:**
```typescript
TOČNOST:
- Ne izmišljaj podatke (telefoni, e-mailovi, datumi, rokovi, iznosi, radna vremena).
- Ako informacija nije sigurna ili nije dostupna, reci da nemaš pouzdanu informaciju i postavi jedno kratko potpitanje.
```

**After:**
```typescript
TOČNOST:
- Ne izmišljaj podatke (telefoni, e-mailovi, datumi, rokovi, iznosi, radna vremena).
- Ako informacija nije dostupna U KONTEKSTU, postavi jedno kratko potpitanje za pojašnjenje.
- Ako je informacija DOSTUPNA U KONTEKSTU, koristi je točno kako je navedena.
```

**Rationale:** Clarifies that uncertainty only applies when CONTEXT is missing, not when it exists.

---

#### Change 2: Updated STIL section (line 30)

**Before:**
```typescript
- 2–6 rečenica po odgovoru.
```

**After:**
```typescript
- 1–4 rečenice po odgovoru.
```

**Rationale:** Enforces shorter, more direct answers as requested.

---

#### Change 3: Completely rewrote GROUNDING_INSTRUCTIONS (lines 49-71)

**Before:**
```typescript
const GROUNDING_INSTRUCTIONS = `

OGRANIČENJA ODGOVORA (KRITIČNO):
- Odgovaraj ISKLJUČIVO na temelju informacija iz CONTEXT-a koji ti je dostavljen.
- Ako CONTEXT ne sadrži informaciju potrebnu za odgovor na korisnikovo pitanje, reci to jasno i postavi jedno kratko potpitanje za pojašnjenje.
- NIKADA ne izmišljaj podatke koji nisu u CONTEXT-u.
- NIKADA ne pretpostavljaj informacije koje nisu eksplicitno navedene u CONTEXT-u.
- Ako CONTEXT ne pokriva korisnikovo pitanje, jednostavno reci da nemaš tu informaciju u dostupnim dokumentima i postavi jedno kratko potpitanje.`;
```

**After:**
```typescript
const GROUNDING_INSTRUCTIONS = `

KORIŠTENJE CONTEXT-a (KRITIČNO):
- Odgovaraj ISKLJUČIVO na temelju informacija iz CONTEXT-a koji ti je dostavljen.
- Kada CONTEXT sadrži točne podatke (vremena, datume, brojeve, imena, adrese), IZVAĐAJ I KORISTI IH VERBATIM - točno kako su navedeni u CONTEXT-u.
- NIKADA ne izlazi placeholdere poput "od:00 do:00", "uglavnom", "može varirati" ili slične generičke fraze.
- NIKADA ne izmišljaj podatke koji nisu u CONTEXT-u.
- NIKADA ne pretpostavljaj informacije koje nisu eksplicitno navedene u CONTEXT-u.

RADNO VRIJEME (SPECIFIČNO):
- Ako pitanje traži radno vrijeme i CONTEXT sadrži radno vrijeme, navedi ga TOČNO kako je zapisano u CONTEXT-u (npr. "07:30 – 15:30", "11:00 – 19:00").
- Ako CONTEXT ne sadrži radno vrijeme za traženi odjel/lokaciju, pitaj: "Za koji odjel ili lokaciju trebate radno vrijeme?"

KADA INFORMACIJA NIJE U CONTEXT-u:
- Ako CONTEXT ne sadrži informaciju potrebnu za odgovor, reci to jasno i postavi JEDNO kratko potpitanje za pojašnjenje.
- NIKADA ne koristi generičke fraze poput "Pokušajte preformulirati pitanje" kada CONTEXT postoji - samo kada je retrieval potpuno prazan.
- Preferiraj specifično potpitanje umjesto općenitih odgovora.

ODGOVORI:
- Drži odgovore kratke (1–4 rečenice).
- Ne spominji izvore, linkove ili "Sources:" u tekstu odgovora.
- Ne dodavaj generičke završne rečenice.`;
```

**Rationale:**
- Explicitly forbids placeholders like "od:00 do:00"
- Forces verbatim extraction of exact data from CONTEXT
- Adds specific rule for working hours questions
- Prohibits generic phrases when CONTEXT exists
- Removes citation mentions from answer text
- Enforces 1-4 sentence limit

---

## Manual Test Cases

### Test Case A: Working Hours Question (CONTEXT Available)

**Prompt:**
```
Koje je radno vrijeme gradske uprave?
```

**Expected Behavior:**
- ✅ Retrieves document `03_city_admin_working_hours.txt`
- ✅ CONTEXT contains: "Ponedjeljak, utorak, srijeda i petak: 07:30 – 15:30" and "Četvrtak: 11:00 – 19:00"
- ✅ Answer should quote times VERBATIM: "07:30 – 15:30" and "11:00 – 19:00"
- ✅ Answer should be 1-4 sentences, direct, no citations
- ❌ Should NOT say "uglavnom od:00 do:00" or any placeholder
- ❌ Should NOT say "Pokušajte preformulirati pitanje"

**Expected Answer (example):**
```
Službeno radno vrijeme gradske uprave je ponedjeljak, utorak, srijeda i petak od 07:30 do 15:30, a četvrtkom od 11:00 do 19:00.
```

---

### Test Case B: General Capabilities Question (No CONTEXT Needed)

**Prompt:**
```
Kako mi možeš pomoći kao AI asistent?
```

**Expected Behavior:**
- ✅ May or may not retrieve documents (depending on relevance)
- ✅ If CONTEXT exists but doesn't answer the question, should ask ONE clarifying question
- ✅ If no CONTEXT, can answer generally about being a city administration assistant
- ✅ Answer should be 1-4 sentences, direct
- ❌ Should NOT say "Pokušajte preformulirati pitanje" if CONTEXT exists but doesn't answer

**Expected Answer (example, if no relevant CONTEXT):**
```
Mogu vam pomoći s informacijama o gradskim uslugama, dokumentima, procedurama i radnom vremenu gradske uprave. Što vas konkretno zanima?
```

**OR (if CONTEXT exists but doesn't answer):**
```
Mogu vam pomoći s informacijama o gradskim uslugama. O čemu točno trebate informacije?
```

---

### Test Case C: Question Not Answered by Docs (CONTEXT Exists but Incomplete)

**Prompt:**
```
Koliko košta izdavanje osobne iskaznice?
```

**Expected Behavior:**
- ✅ May retrieve documents, but they likely don't contain this specific information
- ✅ CONTEXT exists (documents retrieved), but doesn't answer the question
- ✅ Should ask ONE short clarifying question
- ❌ Should NOT say "Pokušajte preformulirati pitanje"
- ❌ Should NOT give generic answer or placeholder

**Expected Answer (example):**
```
Nemam informaciju o cijeni izdavanja osobne iskaznice u dostupnim dokumentima. Za koji ured ili lokaciju trebate tu informaciju?
```

**OR:**
```
Nemam tu informaciju u dostupnim dokumentima. Možete li pojasniti gdje ili kako želite izdati osobnu iskaznicu?
```

---

## Verification Checklist

- [x] Updated `BASE_SYSTEM_PROMPT` TOČNOST section to clarify CONTEXT usage
- [x] Changed answer length from 2-6 to 1-4 sentences
- [x] Completely rewrote `GROUNDING_INSTRUCTIONS` with verbatim extraction rules
- [x] Added explicit prohibition of placeholders ("od:00 do:00", "uglavnom", etc.)
- [x] Added specific rule for working hours questions
- [x] Prohibited generic phrases when CONTEXT exists
- [x] Removed citation mentions from answer text
- [x] Enforced clarifying questions instead of generic responses
- [x] No changes to retrieval logic (as requested)
- [x] No changes to DB schema (as requested)
- [x] No new dependencies (as requested)
- [x] Fallback message only used when `documents.length === 0` (already correct)

---

## Files Modified

1. **`apps/api/src/services/llm.ts`**
   - Lines 30, 38-41, 49-71

**No other files modified** (retrieval logic, chat.ts fallback behavior already correct)

---

## Next Steps

1. Deploy changes to production
2. Test with the 3 manual test cases above
3. Monitor production logs for any instances of placeholder responses
4. Verify that working hours questions return exact times from CONTEXT

---

**End of Summary**
