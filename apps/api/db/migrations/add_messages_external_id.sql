-- Migration: Add external_id column to messages table
-- This migration adds an external_id column to store widget-generated message IDs
-- for idempotent message insertion and duplicate prevention

-- Add external_id column if it doesn't exist
ALTER TABLE messages ADD COLUMN IF NOT EXISTS external_id TEXT;

-- Add comment to document the column
COMMENT ON COLUMN messages.external_id IS 'External message ID from widget (e.g., "user-1234567890" or "assistant-1234567890"). Used for idempotent insertion and duplicate prevention.';
