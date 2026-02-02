-- Migration: Add unique constraint on (conversation_id, external_id) for messages
-- This prevents duplicate messages when external_id is set
-- Only applies to rows where external_id is NOT NULL
-- 
-- Note: Using a partial unique index (WHERE clause) since we only want uniqueness
-- when external_id is set. NULL values are not considered equal in unique constraints.

CREATE UNIQUE INDEX IF NOT EXISTS messages_conversation_external_id_uq
ON messages (conversation_id, external_id)
WHERE external_id IS NOT NULL;

-- Add comment to document the index
COMMENT ON INDEX messages_conversation_external_id_uq IS 'Unique constraint on (conversation_id, external_id) to prevent duplicate messages. Only applies when external_id is set.';

-- Note: Supabase/PostgREST will automatically use this index for upsert onConflict
-- when you specify: onConflict: 'conversation_id,external_id'
