# Document Management Guide

This directory contains the source documents that are ingested into the Supabase database for the AI assistant.

## Workflow for Updating Documents

### 1. Add/Update Documents

Simply place new or updated `.txt` or `.md` files in this directory (`apps/api/data/docs/`).

**File naming conventions:**
- Use descriptive names (e.g., `Kontakt.txt`, `mayor_questions.txt`)
- The `rename-docs.ts` script can help normalize filenames if needed

**File format:**
- Files can include metadata at the top:
  ```
  TITLE: Document Title
  TYPE: document_type
  DATE: 2024-01-01
  SOURCE: https://example.com
  ---
  [Document content here...]
  ```
- The content after the `---` separator (or entire file if no separator) will be used for embeddings

### 2. Ingest Documents to Database

After adding or updating files, run the ingestion script:

```bash
cd apps/api
npm run ingest
```

This script will:
- Read all `.txt` and `.md` files from `data/docs/`
- Generate embeddings for each document
- Upsert documents into Supabase (updates if content hash matches, inserts if new)

### 3. Clean Up Old Documents

After removing files from this directory, clean up the database:

**Step 1: Check what will be deleted (dry run)**
```bash
cd apps/api
npm run cleanup-docs
```

**Step 2: Delete orphaned documents from database**
```bash
npm run cleanup-docs -- --delete-db
```

The cleanup script will:
- Compare files in `data/docs/` with documents in the database
- Identify documents in the database that don't have corresponding files
- Delete those orphaned documents (when `--delete-db` flag is used)

## Available Scripts

- `npm run ingest` - Ingests all `.txt` and `.md` files from `data/docs/` into the database
- `npm run cleanup-docs` - Shows which documents in DB don't have corresponding files (dry run)
- `npm run cleanup-docs -- --delete-db` - Deletes orphaned documents from the database
- `npm run rename-docs` - Renames files to clean naming conventions (dry run)
- `npm run rename-docs -- --apply` - Applies file renames

## Complete Update Workflow Example

1. **Remove old files:**
   ```bash
   # Manually delete old files from data/docs/ directory
   # Or use your file manager
   ```

2. **Add new files:**
   ```bash
   # Copy new files to data/docs/ directory
   ```

3. **Check what will be cleaned up:**
   ```bash
   cd apps/api
   npm run cleanup-docs
   ```

4. **Delete orphaned documents from database:**
   ```bash
   npm run cleanup-docs -- --delete-db
   ```

5. **Ingest new/updated documents:**
   ```bash
   npm run ingest
   ```

## Notes

- Documents are identified by `content_hash` in the database, so updating a file with the same content won't create duplicates
- The ingestion process automatically updates existing documents if their content hash matches
- Always run `cleanup-docs` before `ingest` when removing files to keep the database in sync
- The cleanup script uses title matching (case-insensitive, without extension) to match files with database documents
