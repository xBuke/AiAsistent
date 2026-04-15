# Tickets & Inbox Audit — PROMPT_05

**Date:** 2025-02-12  
**Scope:** Ticket creation flow, admin inbox listing, ticket_ref generation, city_id scoping  
**Mode:** READ-ONLY (no code changes)

---

## 1) Ticket Creation Flow (UI → DB)

### Entry Points

Tickets are created **only** from chat/widget flows. Form wizards (novorodeno_dijete, jednokratna_novcana_pomoc) write to `form_requests`, **not** to `tickets`.

| Source | UI Component | Event Type | Endpoint | Table |
|--------|---------------|------------|----------|-------|
| Chat intake form | `TicketIntakeForm` | `ticket_intake_submitted` | `POST /grad/:cityId/events` | `tickets` |
| Contact handoff | `ContactHandoff` | `contact_submit` | `POST /grad/:cityId/events` | `tickets` |
| Ticket update (status/department/urgent) | — | `ticket_update` or `body.ticket` | `POST /grad/:cityId/events` | `tickets` |

### Flow Detail

1. **Widget opens** → `createConversationId()` (client UUID) → `emitConversationStart` → `POST /grad/:cityId/events` with `type: 'conversation_start'` (or on first message).
2. **Backend** resolves `cityId` (slug or code) → `cities.id`, creates `conversations` row with `city_id`, `external_id`.
3. **User submits intake form** (`TicketIntakeForm`) → `handleIntakeSubmit` → `POST /grad/:cityId/events` with `type: 'ticket_intake_submitted'` + `intake: { name, phone, email, address, description, contact_note, consent_* }`.
4. **Backend** (`events.ts`):
   - Resolves conversation by `external_id` (or creates new if not found).
   - Validates: `name`, `description`, `consent_given`, and `phone` OR `email`.
   - Upserts into `tickets` with `conversation_id`, `city_id`, contact fields, `contact_note`, `status: 'open'`.
   - Calls `next_ticket_ref` RPC if no existing `ticket_ref`; assigns result.
   - Updates `conversations`: `needs_human=true`, `status='open'`, `submitted_at`, `last_activity_at`.
5. **Response** returns `{ ok: true, ticket_ref: "..." }` when ref is generated.
6. **Widget** shows confirmation with ticket_ref if present.

### Alternative: Contact Handoff

- When user provides contact via `ContactHandoff` without full intake form:
  - `handleContactSubmit` → `type: 'contact_submit'` with `body.ticket.contact`.
  - Same events handler path: upsert `tickets` with contact data, generate `ticket_ref` via RPC.

### Conversation Creation (First Message)

- First chat message → `POST /chat` (not `/events`). Chat handler creates `conversations` row with `city_id` from URL `:cityId` param.
- Intake form submission requires an existing conversation: `conversationId` is set by `emitConversationStart` or when user sends first message. If user opens form via `matchesTicketIntent` before any chat, a new conversation is created with `createConversationId()` and `emitConversationStart`.

---

## 2) Admin Listing Flow + Filters

### Endpoint

- **GET** `/admin/:cityCode/inbox`
- Handler: `getInboxHandler` (`apps/api/src/routes/adminRead.ts`)

### Does Inbox Use `inbox_tickets` View?

**No.** The inbox does **not** use an `inbox_tickets` view. There is no `inbox_tickets` view in the codebase.

The inbox reads directly from the **`tickets`** table:

```ts
const { data: tickets } = await supabase
  .from('tickets')
  .select(`conversation_id, status, department, urgent, contact_*, ticket_ref, created_at, updated_at`)
  .eq('city_id', city.id)
  .not('contact_name', 'is', null)
  .or('contact_phone.not.is.null,contact_email.not.is.null')
  .order('created_at', { ascending: false });
```

### Server-Side Filters

| Filter | Implementation | Description |
|--------|----------------|-------------|
| City | `.eq('city_id', city.id)` | Only tickets for the resolved city |
| Valid ticket | `contact_name IS NOT NULL` AND (`contact_phone IS NOT NULL` OR `contact_email IS NOT NULL`) | Excludes incomplete tickets |
| Order | `created_at DESC` | Newest first |

### Client-Side (Inbox.tsx)

- `statusFilter`: `'open' \| 'closed' \| 'all'` (status chip)
- `statusChip`: `'all' \| 'open' \| 'resolved'`
- `urgentFilterOnly`: boolean
- `searchQuery`: text search over contact_name, contact_phone, contact_email, contact_note, first_user_message
- `selectedTags`: (UI only; no tags stored on tickets)

### Enrichment

- Inbox merges `conversations` (title, summary, category, submitted_at, last_activity_at) and first user message from `messages`.
- Primary source of truth for what appears in inbox: **`tickets`** table.

---

## 3) ticket_ref Generation Logic

### Invocation

- **RPC:** `supabase.rpc('next_ticket_ref', { p_city_id: city.id, p_city_code: cityCode })`
- Called from: `apps/api/src/routes/events.ts` (2 places)
  - When upserting ticket via `ticket_update` / `contact_submit`
  - When upserting via `ticket_intake_submitted`
- Only called when `existingTicket?.ticket_ref` is falsy (preserves existing ref on re-submit).

### Implementation

The RPC `next_ticket_ref` is **not** defined in this repository. It is invoked as a Supabase RPC; the implementation likely lives in a Supabase migration or schema file outside this repo.

### Inferred Behavior (from usage & demo data)

| Aspect | Inferred / Observed |
|--------|---------------------|
| Parameters | `p_city_id` (UUID), `p_city_code` (string, e.g. `'PL'`, `'DEMO'`) |
| Return | Single string (e.g. `'DEMO-2026-0001'`) |
| Format | `{CITY_CODE}-{YEAR}-{SEQ}` (from cleanup-and-setup-demo-v1.sql) |
| Per-city, per-year | Counters are typically scoped by `city_id` and year to produce unique refs like `PL-2026-0001`, `PL-2026-0002`, etc. |

**Risk:** Without the actual SQL, exact scoping and counter logic cannot be verified. If the RPC is missing or misconfigured in deployment, ticket creation will fail with 500.

---

## 4) City Scoping Enforcement

### End-to-End Trace

| Stage | city_id Source | Enforcement |
|-------|----------------|-------------|
| **Widget init** | `cityId` from embed/config (slug or code) | Passed in URL to `/grad/:cityId/events` |
| **Events handler** | `cityId` from URL | Lookup: slug → `cities.id`, fallback code → `cities.id`; 404 if not found |
| **Conversation creation** | `city.id` from resolved city | `conversations.city_id = city.id` |
| **Ticket upsert** | Same resolved `city.id` | `tickets.city_id = city.id` |
| **ticket_ref RPC** | `p_city_id: city.id`, `p_city_code: city.code` | City passed into RPC |
| **Inbox GET** | `cityCode` from URL param | `resolveCity(cityCode)` → `city.id`; `session.cityId === city.id` required |
| **Inbox query** | `city.id` | `.eq('city_id', city.id)` on `tickets` |
| **Conversation detail** | `cityCode` from URL | `session.cityId === city.id`; `conversation.city_id === city.id` |
| **PATCH ticket** | `cityCode` from URL | Fetch ticket with `.eq('city_id', city.id)`; update with `.eq('city_id', city.id)` |

### Session Validation

- Admin endpoints require `session.cityId` (set at login from city lookup).
- Every handler: `if (session.cityId !== city.id) return 403`.
- URL `cityCode` is resolved to `city.id`; session must match that city.

### Tables with city_id

| Table | Column | FK |
|-------|--------|-----|
| `conversations` | `city_id` | `cities(id)` |
| `tickets` | `city_id` | `cities(id)` |

Both are set at creation and used for all scoped queries.

---

## 5) Risks and Gaps

### Risks

| Risk | Severity | Description |
|------|----------|-------------|
| **`next_ticket_ref` RPC undefined** | High | If RPC is not deployed, ticket creation fails with 500. Implementation is not in repo. |
| **Forms ≠ Tickets** | Medium | Novorodeno/jednokratna forms write to `form_requests`, not `tickets`. They do not appear in the inbox. Admin must use Forms tab for those. |
| **No inbox_tickets view** | Low | Inbox uses direct `tickets` query. No view abstraction; logic is in app code. |
| **Valid-ticket filter** | Low | Tickets without `contact_name` or without both `contact_phone` and `contact_email` are excluded. Partial submissions never reach inbox. |
| **Contact handoff before conversation** | Low | If `conversationId` is missing when `handleContactSubmit` runs, submit is skipped (`if (!conversationId) return`). |

### Gaps

1. **`next_ticket_ref` SQL not in repo** — Cannot confirm per-city, per-year counter or locking behavior.
2. **Form requests vs tickets** — Two separate pipelines: chat intake → `tickets` (inbox); novorodeno/jednokratna → `form_requests` (Forms tab). No automatic link.
3. **Client-side filters only** — Status/urgent/search filters are applied in browser; no server-side pagination or filtering for large inboxes.
4. **Consent/consent_at** — Stored but not used for inbox filtering; may matter for compliance.

---

## Summary

| Question | Answer |
|----------|--------|
| How is a ticket created from widget/chat/forms? | Via `POST /grad/:cityId/events` with `ticket_intake_submitted` or `contact_submit`; writes to `tickets`. Form wizards (novorodeno, jednokratna) do not create tickets. |
| How are tickets listed in admin inbox? | `GET /admin/:cityCode/inbox` queries `tickets` with `city_id`, valid contact criteria, joined with `conversations` and first user message. |
| Does inbox use `inbox_tickets` view? | No. Direct `tickets` table query. |
| How are ticket_ref counters generated? | Via Supabase RPC `next_ticket_ref(p_city_id, p_city_code)`; format likely `CITY-YEAR-NNNN`. SQL not in repo. |
| Is city_id scoping enforced end-to-end? | Yes: events, conversations, tickets, and all admin handlers enforce `city_id` and session validation. |
