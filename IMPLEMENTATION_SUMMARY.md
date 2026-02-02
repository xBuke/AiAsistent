# Implementation Summary: Inbox Data Fix + Admin Notes

## Changed Files

1. **apps/api/db/migrations/add_conversation_timestamps_and_notes.sql** (NEW)
   - Migration to add `submitted_at` and `last_activity_at` to `conversations`
   - Migration to add `submitted_at` and `consent_at` to `ticket_intakes`
   - Creates `conversation_notes` table for append-only admin notes

2. **apps/api/src/routes/events.ts**
   - Updated `ticket_intake_submitted` handler to set `submitted_at` and `consent_at` on `ticket_intakes`
   - Updated `ticket_intake_submitted` handler to set `conversations.submitted_at` and `last_activity_at`
   - Updated message insert logic to update `conversations.last_activity_at` on new messages
   - Updated ticket upsert logic to update `conversations.last_activity_at` on status/department/urgent changes
   - Updated conversation update logic to always update `last_activity_at` on any activity

3. **apps/api/src/routes/adminRead.ts**
   - Added `getConversationDetailHandler`: GET `/admin/:cityCode/conversations/:conversationUuid`
     - Returns conversation meta (submitted_at, last_activity_at, needs_human, status, department, urgent, category, tags)
     - Returns messages with timestamps
     - Returns notes ordered by created_at DESC
   - Added `postConversationNoteHandler`: POST `/admin/:cityCode/conversations/:conversationUuid/notes`
     - Validates note (non-empty, max 2000 chars)
     - Inserts append-only note
     - Updates `conversations.last_activity_at`
   - Added `patchConversationHandler`: PATCH `/admin/:cityCode/conversations/:conversationUuid`
     - Accepts status/department/urgent/needs_human
     - Updates `conversations.last_activity_at` on any change
   - Updated `getConversationsHandler` to include `submitted_at` and `last_activity_at` in response
   - Updated `patchTicketHandler` to update `conversations.last_activity_at` when ticket fields change

## New Routes

### POST /admin/:cityCode/conversations/:conversationUuid/notes
**Body:**
```json
{
  "note": "Admin note text here"
}
```

**Response:**
```json
{
  "id": "uuid",
  "note": "Admin note text here",
  "created_at": "2024-01-23T10:00:00Z"
}
```

### GET /admin/:cityCode/conversations/:conversationUuid
**Response:**
```json
{
  "conversation": {
    "id": "uuid",
    "submitted_at": "2024-01-23T10:00:00Z",
    "last_activity_at": "2024-01-23T11:00:00Z",
    "needs_human": true,
    "status": "open",
    "department": "Komunalno",
    "urgent": false,
    "category": "issue_reporting",
    "tags": [],
    "created_at": "2024-01-23T09:00:00Z",
    "updated_at": "2024-01-23T11:00:00Z"
  },
  "messages": [
    {
      "id": "uuid",
      "role": "user",
      "content_redacted": "Message text",
      "created_at": "2024-01-23T09:00:00Z",
      "external_id": null,
      "metadata": null
    }
  ],
  "notes": [
    {
      "id": "uuid",
      "note": "Admin note",
      "created_at": "2024-01-23T10:30:00Z"
    }
  ]
}
```

### PATCH /admin/:cityCode/conversations/:conversationUuid
**Body:**
```json
{
  "status": "in_progress",
  "department": "Komunalno",
  "urgent": true,
  "needs_human": false
}
```

**Response:**
```json
{
  "ok": true
}
```

## Manual Test Steps

### 1. Run Migration
```bash
# Connect to your Supabase database and run:
psql -h <host> -U <user> -d <database> -f apps/api/db/migrations/add_conversation_timestamps_and_notes.sql
```

### 2. Test ticket_intake_submitted Event
```bash
# Replace CITY_ID with actual city slug/code and CONVERSATION_ID with a valid conversation UUID
curl -X POST http://localhost:3000/grad/CITY_ID/events \
  -H "Content-Type: application/json" \
  -d '{
    "type": "ticket_intake_submitted",
    "conversationId": "CONVERSATION_ID",
    "intake": {
      "name": "Test User",
      "phone": "+385123456789",
      "email": "test@example.com",
      "description": "Test issue description",
      "consent_given": true,
      "consent_text": "I consent",
      "consent_timestamp": 1706000000000
    }
  }'

# Verify:
# - ticket_intakes.submitted_at is set
# - ticket_intakes.consent_at is set (since consent_given=true)
# - conversations.submitted_at is set
# - conversations.last_activity_at is set
```

### 3. Test Admin Note Creation
```bash
# First, get admin session cookie (login via admin UI or set cookie manually)
# Then:
curl -X POST http://localhost:3000/admin/CITY_CODE/conversations/CONVERSATION_UUID/notes \
  -H "Content-Type: application/json" \
  -H "Cookie: session=<admin_session_cookie>" \
  -d '{
    "note": "This is a test admin note"
  }'

# Verify:
# - Note is created in conversation_notes table
# - conversations.last_activity_at is updated
```

### 4. Test Conversation Detail Endpoint
```bash
curl http://localhost:3000/admin/CITY_CODE/conversations/CONVERSATION_UUID \
  -H "Cookie: session=<admin_session_cookie>"

# Verify response includes:
# - conversation.submitted_at
# - conversation.last_activity_at
# - conversation.needs_human
# - messages array with timestamps
# - notes array ordered by created_at DESC
```

### 5. Test Conversation Autosave (PATCH)
```bash
curl -X PATCH http://localhost:3000/admin/CITY_CODE/conversations/CONVERSATION_UUID \
  -H "Content-Type: application/json" \
  -H "Cookie: session=<admin_session_cookie>" \
  -d '{
    "status": "in_progress",
    "department": "Komunalno",
    "urgent": true,
    "needs_human": false
  }'

# Verify:
# - conversations.status is updated
# - conversations.needs_human is updated
# - tickets.department is updated (or created)
# - tickets.urgent is updated (or created)
# - conversations.last_activity_at is updated
```

### 6. Test Message Insert Updates last_activity_at
```bash
curl -X POST http://localhost:3000/grad/CITY_ID/events \
  -H "Content-Type: application/json" \
  -d '{
    "type": "message",
    "conversationId": "CONVERSATION_ID",
    "messageId": "msg_123",
    "role": "user",
    "content": "Test message",
    "timestamp": 1706000000000
  }'

# Verify:
# - conversations.last_activity_at is updated to message timestamp
```

### 7. Test needs_human Badge in Inbox
```bash
# Get conversations list
curl http://localhost:3000/admin/CITY_CODE/conversations \
  -H "Cookie: session=<admin_session_cookie>"

# Verify:
# - Conversations with needs_human=true show in response
# - Frontend should display "Treba ljudsku pomoc" badge for these
```

## Notes

- All timestamps are stored as `timestamptz` (UTC)
- `submitted_at` represents the moment user clicked SUBMIT on intake form
- `last_activity_at` updates on: new message, admin note, status/department/urgent change
- Notes are append-only (no update/delete endpoints)
- Note validation: non-empty, max 2000 characters
- `needs_human` is set to `true` when fallback_count > 0 or explicitly set via events/API
