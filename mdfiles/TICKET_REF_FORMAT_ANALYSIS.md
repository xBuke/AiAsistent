# Ticket Reference Format Analysis

## Executive Summary

This document analyzes all references to `ticket_ref` format and generation across the codebase, including supported formats, validation patterns, and user-facing display locations.

---

## Supported Formats

### 1. Primary Format (Production - SQL RPC Function)

**Format:** `CITYCODE-YYYY-NNN`

**Pattern:**
- `CITYCODE`: 2+ uppercase letters (city code from `cities.code`)
- `YYYY`: 4-digit year (extracted from current date)
- `NNN`: 3-digit sequence number, zero-padded (e.g., 001, 002, 123)

**Examples:**
- `PL-2026-001` (Ploče, first ticket of 2026)
- `PL-2026-002` (Ploče, second ticket of 2026)
- `ST-2026-001` (Split, first ticket of 2026)
- `DEMO-2026-001` (Demo city)

**Source:** `apps/api/db/migrations/add_ticket_ref_rpc.sql` (documented in `DEMO_FIXES_IMPLEMENTATION.md` lines 167-197)

**SQL Function:**
```sql
CREATE OR REPLACE FUNCTION next_ticket_ref(
  p_city_id UUID,
  p_city_code TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_year INTEGER;
  v_seq INTEGER;
  v_ref TEXT;
BEGIN
  v_year := EXTRACT(YEAR FROM NOW());
  
  -- Get next sequence number for this city/year from tickets table
  SELECT COALESCE(MAX(CAST(SPLIT_PART(ticket_ref, '-', 3) AS INTEGER)), 0) + 1
  INTO v_seq
  FROM tickets
  WHERE city_id = p_city_id
    AND ticket_ref LIKE p_city_code || '-' || v_year || '-%';
  
  -- Format: CITYCODE-YYYY-NNN (e.g., PL-2026-001)
  v_ref := p_city_code || '-' || v_year || '-' || LPAD(v_seq::TEXT, 3, '0');
  
  RETURN v_ref;
END;
$$;
```

**Key Points:**
- Sequence number extracted from existing tickets using `SPLIT_PART(ticket_ref, '-', 3)`
- Filtered by city and year: `ticket_ref LIKE p_city_code || '-' || v_year || '-%'`
- Zero-padded to 3 digits using `LPAD(v_seq::TEXT, 3, '0')`

---

### 2. Frontend Fallback Format (Analytics Store - Not Used in Production)

**Format:** `CITYCODE-YYYY-NNNNNN`

**Pattern:**
- `CITYCODE`: 2 uppercase letters (derived from cityId)
- `YYYY`: 4-digit year
- `NNNNNN`: 6-digit sequence number, zero-padded

**Examples:**
- `PL-2026-000123`
- `ST-2026-000456`

**Source:** `apps/web/src/analytics/store.ts` lines 367-392

**Note:** This format is only used in the frontend analytics store for in-memory ticket generation. **Not used in production** - production uses the SQL RPC function.

---

### 3. Demo Format (Test Data)

**Format:** `DEMO-YYYY-NNNN`

**Examples:**
- `DEMO-2026-0001`
- `DEMO-2026-0002`

**Source:** `apps/api/scripts/cleanup-and-setup-demo-v1.sql` line 538

**Note:** Used only in demo/test data setup scripts.

---

## Format Generation Locations

### Backend (Production)

**File:** `apps/api/src/routes/events.ts`  
**Lines:** 311-324, 391-404

**Process:**
1. Check if existing ticket has `ticket_ref`
2. If missing, call `next_ticket_ref` RPC function
3. RPC generates format: `CITYCODE-YYYY-NNN`

```typescript
// Ensure ticket_ref: keep existing or generate via RPC
if (existingTicket?.ticket_ref) {
  ticketData.ticket_ref = existingTicket.ticket_ref;
} else {
  const cityCode = city.code || 'PL';
  const { data: nextRef, error: rpcError } = await supabase.rpc('next_ticket_ref', {
    p_city_id: city.id,
    p_city_code: cityCode,
  });
  if (rpcError) {
    request.log.error({ conversationUuid, error: rpcError }, 'next_ticket_ref RPC failed');
    return reply.status(500).send({ error: 'Failed to generate ticket ref' });
  }
  ticketData.ticket_ref = nextRef ?? null;
}
```

**Endpoints:**
- `POST /grad/:cityId/events` (type: `ticket_intake_submitted`)
- `POST /grad/:cityId/events` (type: `ticket_update` with contact data)

---

## Validation Patterns

### SQL Pattern Matching

**Pattern:** `ticket_ref LIKE p_city_code || '-' || v_year || '-%'`

**Source:** `apps/api/db/migrations/add_ticket_ref_rpc.sql` line 190

**Purpose:** Filters existing tickets by city code and year to find the maximum sequence number.

**Example:**
- For city code `PL` and year `2026`: `ticket_ref LIKE 'PL-2026-%'`
- Matches: `PL-2026-001`, `PL-2026-002`, `PL-2026-123`
- Does not match: `PL-2025-001`, `ST-2026-001`

---

### Sequence Number Extraction

**Pattern:** `SPLIT_PART(ticket_ref, '-', 3)`

**Source:** `apps/api/db/migrations/add_ticket_ref_rpc.sql` line 186

**Purpose:** Extracts the sequence number (third part after splitting by `-`).

**Example:**
- `PL-2026-001` → `001` → cast to INTEGER → `1`
- `PL-2026-123` → `123` → cast to INTEGER → `123`

---

### Recommended Validation Regex

Based on the production format (`CITYCODE-YYYY-NNN`), here is the recommended regex pattern:

**Strict Pattern (Exact Match):**
```regex
^[A-Z]{2,}-\d{4}-\d{3}$
```

**Explanation:**
- `^` - Start of string
- `[A-Z]{2,}` - 2 or more uppercase letters (city code)
- `-` - Literal hyphen
- `\d{4}` - Exactly 4 digits (year)
- `-` - Literal hyphen
- `\d{3}` - Exactly 3 digits (sequence number)
- `$` - End of string

**Examples:**
- ✅ `PL-2026-001` (matches)
- ✅ `ST-2026-123` (matches)
- ✅ `DEMO-2026-001` (matches)
- ❌ `PL-2026-1` (sequence too short)
- ❌ `PL-26-001` (year too short)
- ❌ `pl-2026-001` (lowercase city code)
- ❌ `PL-2026-0001` (sequence too long)

**Relaxed Pattern (Allows Variable Length):**
```regex
^[A-Z]{2,}-\d{4}-\d+$
```

**Explanation:**
- Same as above, but `\d+` allows 1 or more digits for sequence number
- Useful for validating existing tickets that may have been created with different formats

**TypeScript/JavaScript Example:**
```typescript
const TICKET_REF_REGEX = /^[A-Z]{2,}-\d{4}-\d{3}$/;

function isValidTicketRef(ref: string): boolean {
  return TICKET_REF_REGEX.test(ref);
}

// Usage
isValidTicketRef('PL-2026-001'); // true
isValidTicketRef('PL-2026-1');   // false
```

---

## User-Facing Display Locations

### 1. Widget Confirmation Message

**Location:** Widget chat panel (after ticket intake submission)

**File:** `apps/web/src/widget/WidgetApp.tsx`  
**Lines:** 295-296, 359-360

**Format:**
```typescript
const confirmationContent = ticketRefFromServer
  ? `${t(config.lang, 'contactConfirmationPrefix')} ${ticketRefFromServer}. ${t(config.lang, 'contactConfirmationSuffix')}`
  : t(config.lang, 'intakeConfirmation');
```

**Croatian:**
- Prefix: `"Hvala! Zaprimili smo upit pod brojem"`
- Suffix: `"Kontaktirat ćemo Vas čim dobijemo odgovor."`
- **Full message:** `"Hvala! Zaprimili smo upit pod brojem PL-2026-001. Kontaktirat ćemo Vas čim dobijemo odgovor."`

**English:**
- Prefix: `"Thank you! We have received your inquiry with reference number"`
- Suffix: `"We will contact you as soon as we have an answer."`
- **Full message:** `"Thank you! We have received your inquiry with reference number PL-2026-001. We will contact you as soon as we have an answer."`

**Source:** `apps/web/src/widget/i18n/strings.hr.ts` lines 24-25  
**Source:** `apps/web/src/widget/i18n/strings.en.ts` lines 24-25

---

### 2. Admin Inbox - List View

**Location:** Admin Inbox ticket list

**File:** `apps/web/src/admin/Inbox.tsx`  
**Line:** 1278

**Format:**
```typescript
{t.ticket_ref ? `Ref: ${t.ticket_ref}` : '—'}
```

**Display:** `Ref: PL-2026-001` or `—` (if no ticket_ref)

**Context:** Shown in ticket card preview

---

### 3. Admin Inbox - Detail View (Header)

**Location:** Admin Inbox conversation detail header

**File:** `apps/web/src/admin/Inbox.tsx`  
**Line:** 942

**Format:**
```typescript
{(() => {
  const ticket = conversations.find(c => c.conversation_id === selectedConversationId);
  if (ticket?.ticket_ref) return <span>Ref: {ticket.ticket_ref}</span>;
  return null;
})()}
```

**Display:** `Ref: PL-2026-001` (shown in metadata section)

**Context:** Shown alongside conversation ID, submission date, and last activity

---

### 4. Admin Inbox - Detail View (Ticket Card)

**Location:** Admin Inbox ticket detail card

**File:** `apps/web/src/admin/Inbox.tsx`  
**Line:** 1462

**Format:**
```typescript
{row('Ref', t.ticket_ref)}
```

**Display:** 
```
Ref: PL-2026-001
```

**Context:** Shown in ticket information card with other fields (Status, Department, etc.)

---

## API Response Format

**Endpoint:** `POST /grad/:cityId/events`  
**Response:** JSON

**Success Response:**
```json
{
  "ok": true,
  "ticket_ref": "PL-2026-001"
}
```

**Fallback Response (if ticket_ref generation fails):**
```json
{
  "ok": true
}
```

**Source:** `apps/api/src/routes/events.ts` line 437

---

## Database Storage

**Table:** `tickets`  
**Column:** `ticket_ref` (TEXT, nullable)

**Source:** `apps/api/db/schema.sql` line 53

**Storage:**
- Stored as plain text (no constraints)
- Can be `NULL` if generation fails
- Preserved on ticket updates (existing `ticket_ref` is kept)

**Query Pattern:**
```sql
-- Filter tickets with ticket_ref
WHERE ticket_ref IS NOT NULL

-- Filter by city and year pattern
WHERE ticket_ref LIKE 'PL-2026-%'
```

---

## Key Findings

1. **Single Production Format:** `CITYCODE-YYYY-NNN` (3-digit sequence)
2. **No Client-Side Validation:** No regex validation found in frontend code
3. **SQL-Based Generation:** Uses PostgreSQL RPC function, not client-side
4. **User-Facing Messages:** Ticket ref displayed in widget confirmation and admin UI
5. **Database Pattern Matching:** Uses SQL `LIKE` pattern for sequence extraction
6. **Fallback Handling:** If RPC fails, `ticket_ref` can be `NULL` (no error thrown to user)

---

## Recommendations

### For Validation

**Recommended Regex:**
```regex
^[A-Z]{2,}-\d{4}-\d{3}$
```

**TypeScript Type:**
```typescript
type TicketRef = `${string}-${number}-${string}`; // e.g., "PL-2026-001"
```

**Validation Function:**
```typescript
function isValidTicketRef(ref: string): boolean {
  return /^[A-Z]{2,}-\d{4}-\d{3}$/.test(ref);
}
```

### For Display

**Consistent Formatting:**
- Always display as: `Ref: {ticket_ref}`
- Use `—` or `null` when `ticket_ref` is missing
- No additional formatting needed (already formatted by backend)

### For Error Handling

**Current Behavior:**
- If RPC fails, `ticket_ref` is `NULL`
- User still sees confirmation message (without ticket ref)
- No error shown to user

**Recommendation:**
- Consider logging RPC failures for monitoring
- Consider showing a generic message if ticket ref generation fails
- Consider retry logic for transient RPC failures

---

## File Reference Summary

| File | Lines | Purpose |
|------|-------|---------|
| `apps/api/db/migrations/add_ticket_ref_rpc.sql` | 167-197 | SQL RPC function definition (documented) |
| `apps/api/src/routes/events.ts` | 311-324, 391-404 | Ticket ref generation (production) |
| `apps/web/src/widget/WidgetApp.tsx` | 295-296, 359-360 | Widget confirmation message |
| `apps/web/src/admin/Inbox.tsx` | 942, 1278, 1462 | Admin UI display |
| `apps/web/src/widget/i18n/strings.hr.ts` | 24-25 | Croatian confirmation messages |
| `apps/web/src/widget/i18n/strings.en.ts` | 24-25 | English confirmation messages |
| `apps/web/src/analytics/store.ts` | 367-392 | Frontend fallback format (not used) |
| `apps/api/scripts/cleanup-and-setup-demo-v1.sql` | 538 | Demo data format |

---

## Conclusion

**Production Format:** `CITYCODE-YYYY-NNN` (e.g., `PL-2026-001`)  
**Best Regex:** `^[A-Z]{2,}-\d{4}-\d{3}$`  
**User Display:** Shown in widget confirmation and admin inbox (3 locations)  
**Validation:** Currently none in frontend; SQL pattern matching in backend

The ticket reference format is consistent across the codebase, with the primary format being `CITYCODE-YYYY-NNN` generated by the SQL RPC function `next_ticket_ref`.
