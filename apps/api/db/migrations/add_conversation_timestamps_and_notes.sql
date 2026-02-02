-- Add submitted_at and last_activity_at to conversations table
-- Add conversation_notes table for append-only admin notes

-- Add submitted_at column to conversations (timestamptz)
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;

-- Add last_activity_at column to conversations (timestamptz)
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;

-- Add submitted_at and consent_at to ticket_intakes (timestamptz)
ALTER TABLE ticket_intakes 
ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;

ALTER TABLE ticket_intakes 
ADD COLUMN IF NOT EXISTS consent_at TIMESTAMPTZ;

-- Create conversation_notes table (append-only admin notes)
CREATE TABLE IF NOT EXISTS conversation_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    note TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_conversation_notes_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_conversation_notes_conversation_id ON conversation_notes(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_notes_created_at ON conversation_notes(created_at DESC);

-- Update existing conversations: set last_activity_at = updated_at if null
UPDATE conversations 
SET last_activity_at = updated_at 
WHERE last_activity_at IS NULL AND updated_at IS NOT NULL;
