# Ticket Intakes Migration Analysis

## Executive Summary

**Database State:**
- ✅ `public.tickets` EXISTS and is the single source of truth
- ❌ `public.ticket_intakes` DOES NOT EXIST (confirmed by SQL audit)

**Current Implementation:**
- `events.ts` already uses `tickets` table (line 368: "do not use ticket_intakes")
- `adminRead.ts` has 2 endpoints still querying `ticket_intakes` (MUST FIX)
- Intake fields are stored in `tickets` columns (see mapping below)

---

## 1. Ticket Intakes References - Classification

### (A) DEAD/LEGACY - Safe to Ignore

| File | Line | Usage | Classification |
|------|------|-------|----------------|
| `apps/api/db/migrations/add_ticket_intakes.sql` | 4-24 | CREATE TABLE migration | Legacy migration file |
| `apps/api/db/migrations/add_conversation_timestamps_and_notes.sql` | 12-17 | ALTER TABLE ticket_intakes | Legacy migration file |
| `apps/api/scripts/cleanup-and-setup-demo-v1.sql` | 69-71, 624-635 | DROP TABLE verification | Cleanup script (correct) |

### (B) MUST MIGRATE - Active Code Using ticket_intakes

| File | Line | Function | Issue | Priority |
|------|------|----------|-------|----------|
| `apps/api/src/routes/adminRead.ts` | 583 | `getConversationDetailHandler` | Queries `ticket_intakes` for detail view | HIGH |
| `apps/api/src/routes/adminRead.ts` | 1040 | `getTicketsHandler` | Queries `ticket_intakes` for intake data | HIGH |
| `apps/api/dist/routes/adminRead.js` | 456, 847 | Compiled JS | Auto-fixed when TS is fixed | AUTO |

### (C) DOCS ONLY - No Code Changes Needed

| File | Line | Usage |
|------|------|-------|
| `DEMO_QUICK_REFERENCE.md` | 108 | Documentation reference |
| `DEMO_READINESS_ASSESSMENT.md` | 18, 419 | Documentation reference |
| `INBOX_IMPLEMENTATION.md` | 132, 160-161 | Documentation reference |
| `IMPLEMENTATION_SUMMARY.md` | 7, 11, 134-135 | Documentation reference |

---

## 2. Intake Fields Mapping: ticket_intakes → tickets

### Data Contract for `public.tickets` Table

**Schema (from `apps/api/db/schema.sql` lines 42-58):**
```sql
CREATE TABLE tickets (
    conversation_id UUID PRIMARY KEY,
    city_id UUID NOT NULL,
    status TEXT,
    department TEXT,
    urgent BOOLEAN,
    contact_name TEXT,        -- Maps from: ticket_intakes.name
    contact_phone TEXT,        -- Maps from: ticket_intakes.phone
    contact_email TEXT,        -- Maps from: ticket_intakes.email
    contact_location TEXT,     -- Maps from: ticket_intakes.address
    contact_note TEXT,         -- Maps from: ticket_intakes.description (via events.ts line 383)
    consent_at TIMESTAMP,      -- Maps from: ticket_intakes.consent_timestamp (when consent_given=true)
    ticket_ref TEXT,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);
```

### Field Mapping Table

| ticket_intakes Column | tickets Column | Notes |
|----------------------|----------------|-------|
| `name` | `contact_name` | Direct mapping |
| `phone` | `contact_phone` | Direct mapping |
| `email` | `contact_email` | Direct mapping |
| `address` | `contact_location` | Direct mapping |
| `description` | `contact_note` | Used in `events.ts` line 383 |
| `consent_given` | `consent_at` | If true, set `consent_at = consent_timestamp` |
| `consent_text` | ❌ NOT STORED | Lost field (not in tickets schema) |
| `consent_timestamp` | `consent_at` | When `consent_given = true` |
| `created_at` | `created_at` | Direct mapping |
| `conversation_id` | `conversation_id` | Primary key |
| `city_id` | `city_id` | Direct mapping |

### How Intake Data is Currently Stored

**Source:** `apps/api/src/routes/events.ts` lines 346-435 (`ticket_intake_submitted` handler)

```typescript
// Intake fields are upserted into tickets table:
const ticketData = {
  conversation_id: conversationUuid,
  city_id: city.id,
  status: 'open',
  contact_name: intakeData.name || null,           // ← name
  contact_phone: intakeData.phone || null,         // ← phone
  contact_email: intakeData.email || null,         // ← email
  contact_location: intakeData.address || null,    // ← address
  contact_note: contactNote,                       // ← description
  consent_at: new Date(intakeData.consent_timestamp).toISOString(), // ← consent_timestamp
  ticket_ref: nextRef,
  created_at: existingTicket?.created_at || now,
  updated_at: now,
};
```

**Conclusion:** Intake data is stored in `tickets` table columns. No separate `ticket_intakes` table is needed.

---

## 3. Updated Demo Fixes Plan

### Fix 3: Create Ticket Reference RPC ✅ VERIFIED CORRECT

**File:** `apps/api/db/migrations/add_ticket_ref_rpc.sql` (from DEMO_FIXES_IMPLEMENTATION.md line 168)

**Status:** ✅ RPC function correctly uses `tickets` table (line 185 in demo plan):
```sql
FROM tickets
WHERE city_id = p_city_id
  AND ticket_ref LIKE p_city_code || '-' || v_year || '-%';
```

**No changes needed** - RPC is already correct.

### Fix 3.1: Verify Ticket Creation Flow ✅ VERIFIED CORRECT

**Where ticket_ref is written:**
- `apps/api/src/routes/events.ts` line 316-324: `ticket_update` / `contact_submit` events
- `apps/api/src/routes/events.ts` line 396-404: `ticket_intake_submitted` event

**Both paths:**
1. Check for existing `ticket_ref` in `tickets` table
2. If missing, call `next_ticket_ref` RPC (uses `tickets` table)
3. Upsert to `tickets` table with generated `ticket_ref`

**Status:** ✅ Already correct - no `ticket_intakes` references.

---

## 4. Minimal Patch List

### Patch 1: Fix `getConversationDetailHandler` (adminRead.ts line 583)

**File:** `apps/api/src/routes/adminRead.ts`  
**Function:** `getConversationDetailHandler` (lines 505-643)  
**Issue:** Queries `ticket_intakes` table that doesn't exist  
**Fix:** Read intake data from `tickets` table instead

**Current Code (lines 580-592):**
```typescript
// Get latest ticket intake (order by submitted_at desc, limit 1)
const { data: ticketIntake, error: intakeError } = await supabase
  .from('ticket_intakes')
  .select('*')
  .eq('conversation_id', conversationUuid)
  .order('submitted_at', { ascending: false, nullsFirst: false })
  .limit(1)
  .maybeSingle();
```

**Replacement:**
```typescript
// Get ticket intake data from tickets table (single source of truth)
const { data: ticketIntakeData, error: intakeError } = await supabase
  .from('tickets')
  .select('contact_name, contact_phone, contact_email, contact_location, contact_note, consent_at, created_at')
  .eq('conversation_id', conversationUuid)
  .single();

// Transform to match expected intake format (for backward compatibility)
const ticketIntake = ticketIntakeData ? {
  name: ticketIntakeData.contact_name,
  phone: ticketIntakeData.contact_phone,
  email: ticketIntakeData.contact_email,
  address: ticketIntakeData.contact_location,
  description: ticketIntakeData.contact_note,
  consent_given: ticketIntakeData.consent_at !== null,
  consent_text: null, // Not stored in tickets table
  consent_timestamp: ticketIntakeData.consent_at,
  created_at: ticketIntakeData.created_at,
} : null;
```

**Response Update (line 623):**
```typescript
ticket_intake: ticketIntake || null,  // Now derived from tickets table
```

**Acceptance Criteria:**
- ✅ GET `/admin/:cityCode/conversations/:conversationUuid` returns `ticket_intake` object
- ✅ Intake fields match expected format (name, phone, email, address, description, consent_given, consent_timestamp)
- ✅ No errors when `ticket_intakes` table doesn't exist
- ✅ Works for conversations with and without tickets

---

### Patch 2: Fix `getTicketsHandler` (adminRead.ts line 1040)

**File:** `apps/api/src/routes/adminRead.ts`  
**Function:** `getTicketsHandler` (lines 966-1134)  
**Issue:** Queries `ticket_intakes` table for intake data  
**Fix:** Read intake data from `tickets` table instead

**Current Code (lines 1038-1047):**
```typescript
// Get ticket intakes for these conversations
const { data: ticketIntakes, error: intakeError } = await supabase
  .from('ticket_intakes')
  .select('conversation_id, name, phone, email, address, description, consent_given, consent_text, consent_timestamp, created_at')
  .in('conversation_id', conversationIds)
  .order('created_at', { ascending: false });
```

**Replacement:**
```typescript
// Get ticket intake data from tickets table (single source of truth)
const { data: ticketsData, error: intakeError } = await supabase
  .from('tickets')
  .select('conversation_id, contact_name, contact_phone, contact_email, contact_location, contact_note, consent_at, created_at')
  .in('conversation_id', conversationIds)
  .order('created_at', { ascending: false });

// Transform to match expected intake format
const ticketIntakes = (ticketsData || []).map(t => ({
  conversation_id: t.conversation_id,
  name: t.contact_name,
  phone: t.contact_phone,
  email: t.contact_email,
  address: t.contact_location,
  description: t.contact_note,
  consent_given: t.consent_at !== null,
  consent_text: null, // Not stored in tickets table
  consent_timestamp: t.consent_at,
  created_at: t.created_at,
}));
```

**Acceptance Criteria:**
- ✅ GET `/admin/:cityCode/tickets` returns tickets with `intake` object
- ✅ Intake data is populated from `tickets` table columns
- ✅ No errors when `ticket_intakes` table doesn't exist
- ✅ Fallback to message extraction still works when no ticket exists

---

## 5. Implementation Order

1. **Patch 1** (`getConversationDetailHandler`) - Fixes conversation detail view
2. **Patch 2** (`getTicketsHandler`) - Fixes tickets list view
3. **Verify** - Test both endpoints with DEMO city data
4. **Update Docs** - Mark `ticket_intakes` references as legacy (optional)

---

## 6. Safety Notes

✅ **No Refactors:** Only changing table name in queries  
✅ **Minimal Changes:** Transform data shape to match expected API contract  
✅ **DEMO_MODE Safe:** Changes are in admin endpoints, not demo-specific code  
✅ **Backward Compatible:** Response format unchanged (intake object shape preserved)  
✅ **No Schema Changes:** Using existing `tickets` table columns

---

## 7. Testing Checklist

After applying patches:

- [ ] GET `/admin/:cityCode/conversations/:conversationUuid` returns `ticket_intake` from tickets
- [ ] GET `/admin/:cityCode/tickets` returns tickets with `intake` from tickets
- [ ] No SQL errors about missing `ticket_intakes` table
- [ ] Intake fields (name, phone, email, address, description) are populated
- [ ] Consent fields (`consent_given`, `consent_timestamp`) are populated when present
- [ ] `consent_text` is null (field not stored in tickets table)
- [ ] Works for conversations without tickets (returns null intake)
- [ ] Works for conversations with tickets but no intake data (returns null intake)

---

## 8. Data Loss Note

**Lost Field:** `consent_text` (the actual consent text string)

**Impact:** Low - consent is tracked via `consent_at` timestamp  
**Mitigation:** If consent text is needed, add `consent_text TEXT` column to `tickets` table in future migration

---

## Summary

**Total Changes Required:** 2 patches in 1 file (`apps/api/src/routes/adminRead.ts`)  
**Estimated Time:** 30 minutes  
**Risk Level:** Low (minimal changes, backward compatible)  
**Breaking Changes:** None (API contract preserved)
