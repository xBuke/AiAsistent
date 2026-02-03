# Ticket Intake Form Implementation Analysis

## Executive Summary

This document analyzes the ticket intake form implementation, including component structure, validation, backend endpoint, and database operations. It provides a minimal change plan to require `contact_note` with user-friendly Croatian error messages.

---

## Component Structure

### 1. Form Component (Widget)

**File:** `apps/web/src/widget/ui/TicketIntakeForm.tsx`  
**Lines:** 1-406

**Component:** `TicketIntakeForm`  
**Props:**
```typescript
interface TicketIntakeFormProps {
  onSubmit: (data: TicketIntakeData) => void;
  lang?: string;
  primaryColor?: string;
  initialDescription?: string;
}
```

**Data Interface:**
```typescript
export interface TicketIntakeData {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  description: string;
  consent_given: boolean;
}
```

---

### 2. Form Rendering Location

**File:** `apps/web/src/widget/ui/ChatPanel.tsx`  
**Lines:** 211-221

**Conditional Rendering:**
```typescript
{showIntakeForm && onIntakeSubmit && (
  <TicketIntakeForm
    onSubmit={(data) => {
      onIntakeSubmit(data);
    }}
    lang={lang}
    primaryColor={primaryColor}
    initialDescription={intakeInitialDescription}
  />
)}
```

**Parent Component:** `WidgetApp` (line 858)  
**State Control:** `showIntakeForm` state in `WidgetApp.tsx` (line 38)

---

### 3. Submit Handler (Frontend)

**File:** `apps/web/src/widget/WidgetApp.tsx`  
**Lines:** 306-377

**Handler:** `handleIntakeSubmit`

**Process:**
1. Hides form immediately (`setShowIntakeForm(false)`)
2. Gets consent text from i18n
3. Creates `BackendEvent` with type `ticket_intake_submitted`
4. Sends POST request to `/grad/:cityId/events`
5. On success: Shows confirmation message with ticket_ref
6. On error: Resets form visibility

**Event Payload:**
```typescript
{
  type: 'ticket_intake_submitted',
  conversationId: string,
  timestamp: number,
  intake: {
    name: string,
    phone?: string,
    email?: string,
    address?: string,
    description: string,
    consent_given: boolean,
    consent_text: string,
    consent_timestamp: number,
  }
}
```

---

### 4. Backend Endpoint

**File:** `apps/api/src/routes/events.ts`  
**Endpoint:** `POST /grad/:cityId/events`  
**Handler:** `eventsHandler`  
**Lines:** 346-435

**Event Type:** `ticket_intake_submitted`

**Process:**
1. Validates required fields (lines 351-360)
2. Extracts `contact_note` from intake data (lines 362-366)
3. Upserts ticket into `public.tickets` table (lines 368-414)
4. Updates conversation metadata (lines 416-432)
5. Returns ticket_ref in response (line 437)

---

### 5. Database Insert/Update

**Table:** `public.tickets`  
**Operation:** `upsert` (insert or update on conflict)

**File:** `apps/api/src/routes/events.ts`  
**Lines:** 375-409

**Ticket Data Structure:**
```typescript
const ticketData: any = {
  conversation_id: conversationUuid,
  city_id: city.id,
  status: 'open',
  contact_name: intakeData.name || null,
  contact_phone: intakeData.phone || null,
  contact_email: intakeData.email || null,
  contact_location: intakeData.address || null,
  contact_note: contactNote,  // ← Currently optional (can be null)
  updated_at: now,
  created_at: existingTicket?.created_at || now,
  ticket_ref: existingTicket?.ticket_ref || nextRef,
  consent_at: intakeData.consent_given ? new Date(intakeData.consent_timestamp).toISOString() : undefined,
};
```

**Upsert:**
```typescript
await supabase
  .from('tickets')
  .upsert(ticketData, { onConflict: 'conversation_id' });
```

**Note:** `contact_note` column exists in database (used in admin queries), but may not be in `schema.sql` (schema file may be outdated).

---

## Current Required Fields

### Frontend Validation

**File:** `apps/web/src/widget/ui/TicketIntakeForm.tsx`  
**Validation Function:** `validate()` (lines 40-70)

**Required Fields:**
1. ✅ **name** (line 43-45)
   - Error: `intakeErrorName` → "Molimo unesite ime i prezime"

2. ✅ **description** (line 47-49)
   - Error: `intakeErrorDescription` → "Molimo unesite opis upita"

3. ✅ **phone OR email** (at least one) (lines 51-54)
   - Error: `intakeErrorPhoneOrEmail` → "Molimo unesite telefon ili e-mail"
   - Format validation for phone (lines 56-58)
   - Format validation for email (lines 60-62)

4. ✅ **consent** (lines 64-66)
   - Error: `intakeErrorConsent` → "Morate pristati na obradu osobnih podataka"

**Optional Fields:**
- `address` (no validation, can be empty)

**Currently NOT Required:**
- ❌ `contact_note` - **NOT in form** (no field exists in UI)
- ❌ `description` maps to `contact_note` in backend, but there's no separate "note" field

---

### Backend Validation

**File:** `apps/api/src/routes/events.ts`  
**Lines:** 350-360

**Required Fields Check:**
```typescript
// Validate required fields (consent and at least one contact method)
if (!intakeData.name || !intakeData.description || !intakeData.consent_given) {
  request.log.warn({ conversationUuid }, 'Invalid intake data: missing required fields');
  return reply.status(400).send({ error: 'Missing required intake fields' });
}

// Validate at least one contact method
if (!intakeData.phone && !intakeData.email) {
  request.log.warn({ conversationUuid }, 'Invalid intake data: missing contact method');
  return reply.status(400).send({ error: 'Phone or email is required' });
}
```

**Backend Required:**
1. ✅ `name`
2. ✅ `description`
3. ✅ `consent_given`
4. ✅ `phone` OR `email` (at least one)

**Backend Optional:**
- `address`
- `contact_note` (currently derived from `description` or other fields, can be null)

---

## Validation Location Summary

| Field | Frontend Validation | Backend Validation | Location |
|-------|-------------------|-------------------|----------|
| `name` | ✅ Yes | ✅ Yes | `TicketIntakeForm.tsx:43-45`, `events.ts:351` |
| `description` | ✅ Yes | ✅ Yes | `TicketIntakeForm.tsx:47-49`, `events.ts:351` |
| `phone` | ✅ Format only | ✅ Required if no email | `TicketIntakeForm.tsx:51-58`, `events.ts:357` |
| `email` | ✅ Format only | ✅ Required if no phone | `TicketIntakeForm.tsx:51-62`, `events.ts:357` |
| `consent` | ✅ Yes | ✅ Yes | `TicketIntakeForm.tsx:64-66`, `events.ts:351` |
| `address` | ❌ No | ❌ No | Optional |
| `contact_note` | ❌ **NOT IN FORM** | ❌ No | Currently derived from `description` |

---

## Current `contact_note` Handling

**Backend Extraction (events.ts:362-366):**
```typescript
const contactNote = (intakeData as { note?: string; napomena?: string; message?: string; description?: string }).note
  ?? (intakeData as { napomena?: string }).napomena
  ?? (intakeData as { message?: string }).message
  ?? intakeData.description  // ← Falls back to description
  ?? null;
```

**Current Behavior:**
- `contact_note` is derived from `description` if no separate `note` field exists
- Can be `null` if `description` is also empty (but `description` is required)
- No separate UI field for `contact_note`

**Database Column:**
- Column exists: `tickets.contact_note` (TEXT, nullable)
- Used in admin queries (see `adminRead.ts`)

---

## Minimal Change Plan: Require `contact_note`

### Assumption
Based on the analysis, it appears `contact_note` should be a separate field from `description`. The current implementation uses `description` as a fallback, but we need to add a dedicated field.

### Option 1: Add Separate "Napomena" Field (Recommended)

**Changes Required:**

#### 1. Add Field to Form Component

**File:** `apps/web/src/widget/ui/TicketIntakeForm.tsx`

**Add State:**
```typescript
// Line 30: Add after address state
const [note, setNote] = useState('');
```

**Add to Errors Type:**
```typescript
// Line 32-38: Add note to errors
const [errors, setErrors] = useState<{
  name?: string;
  description?: string;
  phone?: string;
  email?: string;
  consent?: string;
  note?: string;  // ← ADD THIS
}>({});
```

**Add Validation:**
```typescript
// Line 40-70: Add validation in validate() function
const validate = (): boolean => {
  const newErrors: typeof errors = {};
  
  // ... existing validations ...
  
  // ADD THIS: Require contact_note
  if (!note.trim()) {
    newErrors.note = t(lang, 'intakeErrorNote');
  }
  
  setErrors(newErrors);
  return Object.keys(newErrors).length === 0;
};
```

**Add Form Field (after Description field, before Phone):**
```typescript
// After line 208 (after Description field), add:

{/* Note (Napomena) - Required */}
<div style={{ marginBottom: '12px' }}>
  <label
    style={{
      display: 'block',
      marginBottom: '4px',
      fontSize: '14px',
      color: '#333',
      fontWeight: 500,
    }}
  >
    {t(lang, 'intakeNote')} <span style={{ color: '#d32f2f' }}>*</span>
  </label>
  <textarea
    value={note}
    onChange={(e) => {
      setNote(e.target.value);
      if (errors.note) {
        setErrors({ ...errors, note: undefined });
      }
    }}
    rows={3}
    placeholder={t(lang, 'intakeNotePlaceholder')}
    style={{
      width: '100%',
      padding: '8px 12px',
      border: errors.note ? '1px solid #d32f2f' : '1px solid #ddd',
      borderRadius: '8px',
      fontSize: '14px',
      fontFamily: 'inherit',
      resize: 'vertical',
      outline: 'none',
    }}
    onFocus={(e) => {
      e.target.style.borderColor = primaryColor;
    }}
    onBlur={(e) => {
      e.target.style.borderColor = errors.note ? '#d32f2f' : '#ddd';
    }}
  />
  {errors.note && (
    <div style={{ marginTop: '4px', fontSize: '12px', color: '#d32f2f' }}>
      {errors.note}
    </div>
  )}
</div>
```

**Update Submit Handler:**
```typescript
// Line 76-83: Update onSubmit call
onSubmit({
  name: name.trim(),
  phone: phone.trim() || undefined,
  email: email.trim() || undefined,
  address: address.trim() || undefined,
  description: description.trim(),
  note: note.trim(),  // ← ADD THIS
  consent_given: true,
});
```

#### 2. Update Data Interface

**File:** `apps/web/src/widget/ui/TicketIntakeForm.tsx`

```typescript
// Line 4-11: Update interface
export interface TicketIntakeData {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  description: string;
  note: string;  // ← ADD THIS (required)
  consent_given: boolean;
}
```

#### 3. Update Backend Event Type

**File:** `apps/web/src/widget/utils/eventsClient.ts`

```typescript
// Update BackendEvent type to include note in intake
intake?: {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  description: string;
  note: string;  // ← ADD THIS
  consent_given: boolean;
  consent_text: string;
  consent_timestamp: number;
};
```

#### 4. Update WidgetApp Submit Handler

**File:** `apps/web/src/widget/WidgetApp.tsx`

```typescript
// Line 323-332: Update intake data
intake: {
  name: data.name,
  phone: data.phone,
  email: data.email,
  address: data.address,
  description: data.description,
  note: data.note,  // ← ADD THIS
  consent_given: data.consent_given,
  consent_text: consentText,
  consent_timestamp: consentTimestamp,
},
```

#### 5. Update Backend Validation

**File:** `apps/api/src/routes/events.ts`

```typescript
// Line 350-360: Add note validation
// Validate required fields (consent and at least one contact method)
if (!intakeData.name || !intakeData.description || !intakeData.consent_given) {
  request.log.warn({ conversationUuid }, 'Invalid intake data: missing required fields');
  return reply.status(400).send({ error: 'Missing required intake fields' });
}

// ADD THIS: Validate contact_note
if (!intakeData.note || !intakeData.note.trim()) {
  request.log.warn({ conversationUuid }, 'Invalid intake data: missing contact_note');
  return reply.status(400).send({ error: 'Contact note is required' });
}

// Validate at least one contact method
if (!intakeData.phone && !intakeData.email) {
  request.log.warn({ conversationUuid }, 'Invalid intake data: missing contact method');
  return reply.status(400).send({ error: 'Phone or email is required' });
}
```

**Update contact_note extraction:**
```typescript
// Line 362-366: Update to use note field directly
const contactNote = intakeData.note?.trim() || null;

if (!contactNote) {
  request.log.warn({ conversationUuid }, 'Invalid intake data: contact_note is empty');
  return reply.status(400).send({ error: 'Contact note is required' });
}
```

#### 6. Add i18n Strings

**File:** `apps/web/src/widget/i18n/strings.hr.ts`

```typescript
// Add after line 47 (after intakeErrorConsent):
intakeNote: 'Napomena',
intakeNotePlaceholder: 'Dodatne napomene ili informacije...',
intakeErrorNote: 'Molimo unesite napomenu',
```

**File:** `apps/web/src/widget/i18n/strings.en.ts`

```typescript
// Add corresponding English strings:
intakeNote: 'Note',
intakeNotePlaceholder: 'Additional notes or information...',
intakeErrorNote: 'Please enter a note',
```

---

### Option 2: Make `description` Map to `contact_note` (Simpler, but less clear)

If `description` should be the `contact_note`, then:

1. **Backend:** Require `contact_note` to be non-null (already validated via `description`)
2. **Backend:** Update extraction to require `description`:
```typescript
const contactNote = intakeData.description?.trim() || null;
if (!contactNote) {
  return reply.status(400).send({ error: 'Description is required' });
}
```

**Note:** This option doesn't add a new field but makes the existing `description` field map directly to `contact_note` with explicit validation.

---

## Recommended Approach

**Option 1 (Separate Field)** is recommended because:
1. Clearer separation: `description` = problem description, `note` = additional notes
2. Better UX: Users understand they need to fill both fields
3. More flexible: Can have different validation rules for each
4. Matches admin UI: Admin shows `contact_note` separately

**Minimal Changes Summary:**
1. ✅ Add `note` state and field to `TicketIntakeForm.tsx`
2. ✅ Add validation for `note` in frontend
3. ✅ Update `TicketIntakeData` interface
4. ✅ Update backend to require `note` field
5. ✅ Add Croatian error message: `"Molimo unesite napomenu"`
6. ✅ Update backend validation to check `note` field

**No UI Refactoring Required:**
- Only adding one new textarea field
- Following existing form field patterns
- Using existing error display mechanism

---

## File Reference Summary

| File | Lines | Purpose |
|------|-------|---------|
| `apps/web/src/widget/ui/TicketIntakeForm.tsx` | 1-406 | Form component, validation, UI |
| `apps/web/src/widget/WidgetApp.tsx` | 306-377 | Submit handler, API call |
| `apps/api/src/routes/events.ts` | 346-435 | Backend endpoint, DB upsert |
| `apps/web/src/widget/ui/ChatPanel.tsx` | 211-221 | Form rendering |
| `apps/web/src/widget/i18n/strings.hr.ts` | 41-46 | Croatian error messages |
| `apps/web/src/widget/utils/eventsClient.ts` | 17-26 | BackendEvent type definition |

---

## Conclusion

**Current State:**
- `contact_note` is optional (can be null)
- Derived from `description` if no separate field exists
- No dedicated UI field for `contact_note`

**Required Changes:**
- Add `note` field to form (separate from `description`)
- Add frontend validation with Croatian error message
- Add backend validation to require `note`
- Update data interfaces and event payloads

**Minimal Impact:**
- No UI refactoring needed
- Follows existing patterns
- Only adds required validation + error rendering
