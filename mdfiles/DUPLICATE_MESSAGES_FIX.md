# Fix: Duplicate Messages in Ticket Conversations

## Problem
Ticket conversations showed duplicate messages because:
1. Messages were inserted twice (once from chat.ts, once from events.ts)
2. `external_id` was NULL, so no unique constraint could prevent duplicates
3. Timestamps differed slightly, making deduplication by (role, created_at) unreliable

## Solution
Ensured every message insert sets a deterministic `external_id` and made insertion idempotent using upsert.

## Changes Made

### 1. Database Migrations

#### `apps/api/db/migrations/add_messages_external_id.sql`
- Adds `external_id TEXT` column to `messages` table
- Allows NULL for backward compatibility, but code now always sets it

#### `apps/api/db/migrations/add_messages_unique_index.sql`
- Creates unique index on `(conversation_id, external_id)` WHERE `external_id IS NOT NULL`
- Prevents duplicate messages when `external_id` is set
- Partial index (only applies when `external_id` is not null)

#### `apps/api/db/migrations/cleanup_duplicate_messages.sql` (OPTIONAL)
- SQL to remove existing duplicate messages
- Keeps earliest `created_at` per `(conversation_id, external_id)`
- **DO NOT RUN AUTOMATICALLY** - review first, then run manually if needed

### 2. Code Changes

#### `apps/api/src/routes/chat.ts`
- **User messages**: Always sets `external_id` using `messageUuid` from request body OR generates `user-${Date.now()}`
- **Assistant messages**: Always sets `external_id` as `assistant-${Date.now()}`
- Changed all `.insert()` to `.upsert()` with `onConflict: 'conversation_id,external_id'`
- Added `messageUuid?: string` to `ChatBody` interface

#### `apps/api/src/routes/events.ts`
- Always sets `external_id`: uses `body.messageId` if provided, otherwise generates `${body.role}-${Date.now()}`
- Changed `.insert()` to `.upsert()` with `onConflict: 'conversation_id,external_id'`
- Removed manual duplicate checking logic (now handled by upsert)

## SQL to Run

Run these migrations in order:

```sql
-- 1. Add external_id column
\i apps/api/db/migrations/add_messages_external_id.sql

-- 2. Add unique index
\i apps/api/db/migrations/add_messages_unique_index.sql

-- 3. (OPTIONAL) Cleanup existing duplicates
-- Review the SELECT query in cleanup_duplicate_messages.sql first!
\i apps/api/db/migrations/cleanup_duplicate_messages.sql
```

Or paste the SQL directly:

```sql
-- Migration 1: Add external_id column
ALTER TABLE messages ADD COLUMN IF NOT EXISTS external_id TEXT;
COMMENT ON COLUMN messages.external_id IS 'External message ID from widget (e.g., "user-1234567890" or "assistant-1234567890"). Used for idempotent insertion and duplicate prevention.';

-- Migration 2: Add unique index
CREATE UNIQUE INDEX IF NOT EXISTS messages_conversation_external_id_uq
ON messages (conversation_id, external_id)
WHERE external_id IS NOT NULL;
COMMENT ON INDEX messages_conversation_external_id_uq IS 'Unique constraint on (conversation_id, external_id) to prevent duplicate messages. Only applies when external_id is set.';
```

## Test Checklist

- [ ] Run migrations (steps 1-2 above)
- [ ] Send 1 widget message → DB should have 1 user row + 1 assistant row (no duplicates)
- [ ] Check ticket view → each message appears once
- [ ] Re-send same event (simulate retry) → no new rows created
- [ ] Verify `external_id` is set for all new messages (not NULL)
- [ ] Test with widget sending `messageId` → should use provided ID
- [ ] Test without widget `messageId` → should generate deterministic ID

## Changed Files

1. `apps/api/db/migrations/add_messages_external_id.sql` (NEW)
2. `apps/api/db/migrations/add_messages_unique_index.sql` (NEW)
3. `apps/api/db/migrations/cleanup_duplicate_messages.sql` (NEW)
4. `apps/api/src/routes/chat.ts` (MODIFIED)
5. `apps/api/src/routes/events.ts` (MODIFIED)

## Notes

- The unique index is partial (WHERE `external_id IS NOT NULL`) to allow NULL values for backward compatibility, but code now always sets `external_id`
- Supabase's `upsert` with `onConflict: 'conversation_id,external_id'` should work with the unique index
- If upsert fails due to composite key support issues, the unique index will still prevent duplicates at the database level
- External IDs are deterministic: `user-${timestamp}` or `assistant-${timestamp}` for consistency
