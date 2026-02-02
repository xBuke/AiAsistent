# Inbox Implementation Summary

## Overview
Implemented inbox filtering so that "Inbox" shows ONLY tickets with `needs_human = true`, while "Svi razgovori" (Conversations) shows ALL conversations.

## Changed Files

1. **apps/api/src/routes/adminRead.ts**
   - Added `getInboxHandler()` - new endpoint for inbox
   - Added `fetchConversationsWithDetails()` helper function
   - Updated `getConversationsHandler()` to use helper and return ALL conversations
   - Updated `patchConversationHandler()` to return updated conversation row
   - Registered new `/admin/:cityCode/inbox` route

2. **apps/web/src/admin/api/adminClient.ts**
   - Added `fetchInbox()` function
   - Updated `patchConversation()` return type to `PatchConversationResponse`

3. **apps/web/src/admin/Inbox.tsx**
   - Changed from `fetchConversations()` to `fetchInbox()`
   - Updated error messages to reference "Inbox" instead of "Conversations"

## SQL Queries Used

### GET /admin/:cityCode/inbox
```sql
-- Main query (via Supabase PostgREST)
SELECT 
  id,
  external_id,
  created_at,
  updated_at,
  submitted_at,
  last_activity_at,
  category,
  needs_human,
  status,
  fallback_count
FROM conversations
WHERE city_id = :cityId
  AND needs_human = true
ORDER BY last_activity_at DESC NULLS LAST,
         updated_at DESC,
         created_at DESC;

-- For each conversation, get first user message (for title):
SELECT content_redacted
FROM messages
WHERE conversation_id = :conversationId
  AND role = 'user'
ORDER BY created_at ASC
LIMIT 1;
```

### GET /admin/:cityCode/conversations
```sql
-- Main query (via Supabase PostgREST)
SELECT 
  id,
  external_id,
  created_at,
  updated_at,
  submitted_at,
  last_activity_at,
  category,
  needs_human,
  status,
  fallback_count
FROM conversations
WHERE city_id = :cityId
ORDER BY last_activity_at DESC NULLS LAST,
         updated_at DESC,
         created_at DESC;

-- For each conversation, get first user message (for title):
SELECT content_redacted
FROM messages
WHERE conversation_id = :conversationId
  AND role = 'user'
ORDER BY created_at ASC
LIMIT 1;
```

### PATCH /admin/:cityCode/conversations/:conversationUuid
```sql
-- Update conversation
UPDATE conversations
SET 
  status = :status,           -- if provided
  needs_human = :needs_human, -- if provided
  department = :department,   -- if provided (via tickets table)
  urgent = :urgent,          -- if provided (via tickets table)
  last_activity_at = NOW(),
  updated_at = NOW()
WHERE id = :conversationUuid;

-- Return updated row
SELECT 
  c.id,
  c.external_id,
  c.created_at,
  c.updated_at,
  c.submitted_at,
  c.last_activity_at,
  c.category,
  c.needs_human,
  c.status,
  c.fallback_count,
  t.department,
  t.urgent
FROM conversations c
LEFT JOIN tickets t ON t.conversation_id = c.id
WHERE c.id = :conversationUuid;
```

### POST /admin/:cityCode/conversations/:conversationUuid/notes
```sql
-- Insert note
INSERT INTO conversation_notes (conversation_id, note, created_at)
VALUES (:conversationId, :note, NOW())
RETURNING id, note, created_at;

-- Update conversation last_activity_at
UPDATE conversations
SET last_activity_at = NOW()
WHERE id = :conversationId;
```

### Ticket Submit Event (ticket_intake_submitted)
```sql
-- Insert ticket intake
INSERT INTO ticket_intakes (
  id, city_id, conversation_id, name, phone, email, address,
  description, consent_given, consent_text, consent_timestamp,
  created_at, submitted_at, consent_at
)
VALUES (
  :id, :cityId, :conversationId, :name, :phone, :email, :address,
  :description, :consentGiven, :consentText, :consentTimestamp,
  NOW(), NOW(), CASE WHEN :consentGiven THEN NOW() ELSE NULL END
);

-- Update conversation
UPDATE conversations
SET 
  needs_human = true,
  status = 'open',
  submitted_at = NOW(),
  last_activity_at = NOW(),
  updated_at = NOW()
WHERE id = :conversationId;
```

## Manual Test Steps

### Test A: Intake Submit → needs_human true → Appears in Inbox
1. Open widget and start a conversation
2. Fill out ticket intake form and submit
3. Verify:
   - `ticket_intakes.submitted_at` is set to current time
   - `ticket_intakes.consent_at` is set if consent_given = true
   - `conversations.submitted_at` is set to current time
   - `conversations.last_activity_at` is set to current time
   - `conversations.needs_human` = true
4. Open admin panel → Inbox tab
5. Verify: The conversation appears in Inbox list

### Test B: PATCH needs_human false → Disappears from Inbox, Still Visible in Conversations
1. Open admin panel → Inbox tab
2. Select a conversation that has `needs_human = true`
3. In the workflow form, uncheck "Treba ljudsku pomoć" (or set needs_human to false via API)
4. Wait for autosave (500ms debounce)
5. Verify:
   - Conversation disappears from Inbox immediately (on next poll or refresh)
   - Switch to "Svi razgovori" (Conversations) tab
   - Verify: The conversation is still visible in Conversations list

### Test C: Add Note → last_activity_at Updates
1. Open admin panel → Inbox or Conversations tab
2. Select a conversation
3. Add a note in the "Dodaj internu napomenu" section
4. Verify:
   - Note appears in timeline
   - `conversation_notes` table has new row
   - `conversations.last_activity_at` is updated to current time
   - Conversation moves to top of list (if sorted by last_activity_at)

## Endpoints Summary

| Endpoint | Method | Description | Filter |
|----------|--------|-------------|--------|
| `/admin/:cityCode/inbox` | GET | List conversations needing human help | `needs_human = true` |
| `/admin/:cityCode/conversations` | GET | List ALL conversations | None |
| `/admin/:cityCode/conversations/:id` | PATCH | Update conversation fields | Returns updated row |
| `/admin/:cityCode/conversations/:id/notes` | POST | Add admin note | Updates `last_activity_at` |

## Key Behaviors

1. **Inbox filtering**: Only shows conversations where `needs_human = true`
2. **Sorting**: Both endpoints sort by `last_activity_at DESC` (nulls last), then `updated_at DESC`, then `created_at DESC`
3. **Title**: First user message is used as title (earliest user message by `created_at ASC`)
4. **Autosave**: PATCH endpoint updates `last_activity_at` automatically
5. **Ticket submit**: Sets `needs_human = true`, `submitted_at = NOW()`, `last_activity_at = NOW()`
6. **Notes**: Updates `last_activity_at` when note is added
