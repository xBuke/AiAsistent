-- Migration: Add metadata column to messages table
-- This migration adds a jsonb metadata column to store debug trace information
-- for assistant messages (model, latency, retrieved docs, etc.)

-- Add metadata column if it doesn't exist
ALTER TABLE messages ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Add comment to document the column
COMMENT ON COLUMN messages.metadata IS 'Debug trace metadata for assistant messages. Contains model name, latency_ms, retrieved_docs_top3, retrieved_docs_count, and used_fallback.';
