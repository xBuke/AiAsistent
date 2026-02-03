# YC Demo Quick Reference

## TL;DR
**Readiness Score: 68/100** → Fixable to **85/100** in ~75 minutes

### What Works ✅
- Widget → API → DB → Widget (Q/A flow)
- Ticket intake submission + ticket reference
- Admin dashboard (conversations vs tickets)
- Intake fields displayed in admin
- 10s polling for realtime updates

### What's Missing ❌
- Citations UI (backend returns, UI doesn't show)
- Deterministic guardrails (only prompt-based)
- Ticket ref RPC function (may not exist)

---

## Demo URLs

**Widget:** `http://localhost:5173/widget-test.html?cityId=ploce&apiBaseUrl=http://localhost:3000`  
**Admin:** `http://localhost:5173/admin/ploce`

---

## Demo Flow (75s)

| Time | Action | Expected Output |
|------|--------|----------------|
| 0-5s | Open widget | Croatian UI visible |
| 5-25s | Ask: "Koje su radno vrijeme gradske uprave?" | Answer + citations (if fix applied) |
| 25-45s | Ask: "Želim prijaviti problem s cestom" → Fill intake form → Submit | Ticket ref: "PL-2026-001" |
| 45-60s | Switch to admin → View ticket | See intake fields + ticket ref |
| 60-70s | Ask: "Koliko košta gradonačelnik?" | Deterministic refusal (if fix applied) |
| 70-75s | Show admin dashboard | Polling updates visible |

---

## Critical Files

| Component | File Path |
|-----------|-----------|
| Widget UI | `apps/web/src/widget/WidgetApp.tsx` |
| Chat API | `apps/api/src/routes/chat.ts` |
| Ticket Intake | `apps/api/src/routes/events.ts` |
| Admin Dashboard | `apps/web/src/admin/Inbox.tsx` |
| Citations Display | `apps/web/src/widget/ui/MessageList.tsx` |

---

## Quick Fixes (See DEMO_FIXES_IMPLEMENTATION.md)

1. **Citations** (30 min): Add citation rendering in `MessageList.tsx`
2. **Guardrail** (20 min): Add deterministic check in `chat.ts`
3. **Ticket Ref RPC** (15 min): Create `next_ticket_ref` SQL function
4. **Metadata Pass** (10 min): Include metadata in Message component

---

## Pre-Demo Checklist

- [ ] `DEMO_MODE=true` in API `.env`
- [ ] Documents ingested (`npm run ingest`)
- [ ] City exists in DB (`code='PL'`, `slug='ploce'`)
- [ ] Admin password set
- [ ] API running (port 3000)
- [ ] Web running (port 5173)
- [ ] Widget test page opens
- [ ] Admin login works

---

## Fallback Scripts

**If citations don't show:** Mention "Answers are grounded in city documents"  
**If intake form doesn't appear:** Manually set `needs_human=true` in DB  
**If ticket ref missing:** Use mock "PL-DEMO-001"  
**If guardrail doesn't trigger:** Show prompt-based refusal

---

## Data Contracts

**Chat Request:**
```json
POST /grad/:cityId/chat
{ "message": "...", "conversationId": "..." }
```

**Chat Response:** SSE stream with `data: <token>` and `event: meta`

**Ticket Intake:**
```json
POST /grad/:cityId/events
{ "type": "ticket_intake_submitted", "intake": {...} }
```

**Response:** `{ "ok": true, "ticket_ref": "PL-2026-001" }`

---

## Key Database Tables

- `conversations` - Chat sessions
- `messages` - User/assistant messages
- `tickets` - Tickets (needs_human=true OR fallback_count>0)
- `ticket_intakes` - Intake form submissions
- `documents` - Vector-embedded city documents

---

## Polling Strategy

Admin dashboard polls every **10s** when "Live" toggle is enabled.  
Uses `usePolling` hook in `apps/web/src/admin/hooks/usePolling.ts`.

---

## Acceptance Criteria

**Citations:**
- [ ] I can click source link and see snippet

**Guardrail:**
- [ ] Deterministic refusal for "Koliko košta gradonačelnik?"
- [ ] No ticket created

**Ticket Ref:**
- [ ] Format: "PL-2026-001"
- [ ] Shown in widget confirmation
- [ ] Visible in admin dashboard

---

For detailed implementation, see `DEMO_FIXES_IMPLEMENTATION.md`.  
For full assessment, see `DEMO_READINESS_ASSESSMENT.md`.
