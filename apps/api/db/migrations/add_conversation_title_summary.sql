-- Add title, summary, title_generated_at, title_source, last_message_at columns to conversations table

-- Add title column (text, nullable)
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS title TEXT;

-- Add summary column (text, nullable)
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS summary TEXT;

-- Add title_generated_at column (timestamptz, nullable)
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS title_generated_at TIMESTAMPTZ;

-- Add title_source column (text, nullable) - values: 'first_message' or 'llm'
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS title_source TEXT;

-- Add last_message_at column (timestamptz, nullable)
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ;

-- Create index on title_source for efficient queries
CREATE INDEX IF NOT EXISTS idx_conversations_title_source ON conversations(title_source);

-- Create index on last_message_at for efficient queries
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at ON conversations(last_message_at DESC);
