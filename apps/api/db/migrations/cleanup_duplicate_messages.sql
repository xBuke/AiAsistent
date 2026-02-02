-- OPTIONAL CLEANUP: Remove duplicate messages
-- This script removes duplicate messages, keeping the earliest created_at per (conversation_id, external_id)
-- 
-- WARNING: Review the results before running DELETE. This is a destructive operation.
-- 
-- To preview what will be deleted, run the SELECT query first:
-- SELECT 
--   conversation_id,
--   external_id,
--   COUNT(*) as duplicate_count,
--   MIN(created_at) as earliest_created_at
-- FROM messages
-- WHERE external_id IS NOT NULL
-- GROUP BY conversation_id, external_id
-- HAVING COUNT(*) > 1;
--
-- Then run the DELETE to remove duplicates (keeping the earliest):

DELETE FROM messages
WHERE id IN (
  SELECT id
  FROM (
    SELECT 
      id,
      ROW_NUMBER() OVER (
        PARTITION BY conversation_id, external_id 
        ORDER BY created_at ASC
      ) as rn
    FROM messages
    WHERE external_id IS NOT NULL
  ) ranked
  WHERE rn > 1
);

-- After cleanup, verify no duplicates remain:
-- SELECT 
--   conversation_id,
--   external_id,
--   COUNT(*) as count
-- FROM messages
-- WHERE external_id IS NOT NULL
-- GROUP BY conversation_id, external_id
-- HAVING COUNT(*) > 1;
-- (Should return 0 rows)
