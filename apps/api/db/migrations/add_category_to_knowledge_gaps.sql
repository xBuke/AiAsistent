ALTER TABLE knowledge_gaps 
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS category_generated_at timestamptz;
