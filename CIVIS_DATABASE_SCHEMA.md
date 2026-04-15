# Civis — Database Schema Reference
> Last updated: April 15, 2026 | Supabase + pgvector

---

## 1. Tables Overview

| Table | Purpose | City-scoped? |
|---|---|---|
| `cities` | City identity, slugs, hashed passwords, allowed domains | — (root table) |
| `conversations` | Chat session per city | ✅ |
| `messages` | Individual messages within a conversation | ✅ |
| `tickets` | Human escalation pipeline | ✅ |
| `ticket_ref_counters` | Auto-increment ticket reference per city/year | ✅ |
| `document_files` | Uploaded document metadata (Phase 2) | ✅ |
| `documents` | RAG corpus chunks with pgvector embeddings | ✅ |
| `form_requests` | Administrative form submissions | ✅ has city_id + FK constraint |
| `form_request_attachments` | File attachments per form request | via form_requests |
| `conversation_notes` | Internal staff notes on conversations | via conversations |
| `analytics_daily` | Daily aggregated stats | ❌ not city-scoped |
| `knowledge_gaps` | Questions with no good RAG answer | ✅ city_id added (Phase 1) |

---

## 2. Table Definitions

### `cities`
| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | NO | uuid_generate_v4() | PK |
| `code` | text | NO | — | Uppercase city code (e.g. PLOCE) |
| `name` | text | NO | — | Display name |
| `admin_password_hash` | text | NO | — | bcrypt hash |
| `inbox_password_hash` | text | NO | — | bcrypt hash |
| `created_at` | timestamp | YES | now() | |
| `slug` | text | YES | — | URL slug (e.g. ploce) |
| `allowed_domains` | text[] | NO | '{}' | ✅ Added Phase 1 — origin allowlist for widget domains |

---

### `conversations`
| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | NO | uuid_generate_v4() | PK |
| `city_id` | uuid | NO | — | FK → cities.id (`fk_conversations_city`) |
| `created_at` | timestamp | NO | — | |
| `updated_at` | timestamp | NO | — | |
| `category` | text | YES | — | |
| `needs_human` | boolean | YES | — | Triggers ticket flow |
| `status` | text | YES | — | |
| `fallback_count` | integer | YES | — | RAG fallback counter |
| `external_id` | text | YES | — | |
| `submitted_at` | timestamp | YES | — | |
| `last_activity_at` | timestamp | YES | — | Bumped by trigger on note insert |
| `session_id` | text | YES | — | |
| `last_message_at` | timestamp | YES | — | |
| `title` | text | YES | — | Auto-generated title |
| `summary` | text | YES | — | |
| `title_generated_at` | timestamp | YES | — | |
| `title_source` | text | YES | — | |

---

### `messages`
| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `conversation_id` | uuid | YES | — | FK → conversations.id |
| `city_id` | uuid | NO | — | FK → cities.id (via trigger enforcement) |
| `role` | text | YES | — | 'user' or 'assistant' |
| `content` | text | YES | — | |
| `content_redacted` | text | YES | — | GDPR-safe version |
| `created_at` | timestamp | YES | now() | |
| `external_id` | text | YES | — | |
| `metadata` | jsonb | YES | — | RAG sources, latency, etc. |

---

### `tickets`
| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `conversation_id` | uuid | NO | — | FK → conversations.id (`fk_tickets_conversation`) |
| `city_id` | uuid | NO | — | FK → cities.id (`fk_tickets_city`) |
| `status` | text | YES | — | |
| `department` | text | YES | — | |
| `urgent` | boolean | YES | — | Legacy field |
| `is_urgent` | boolean | NO | false | Active urgency flag |
| `contact_name` | text | YES | — | |
| `contact_phone` | text | YES | — | |
| `contact_email` | text | YES | — | |
| `contact_location` | text | YES | — | |
| `contact_note` | text | YES | — | |
| `consent_at` | timestamp | YES | — | GDPR consent timestamp |
| `ticket_ref` | text | YES | — | e.g. PLOCE-2025-000001 |
| `created_at` | timestamp | NO | — | |
| `updated_at` | timestamp | NO | — | |
| `department_id` | uuid | YES | — | |

⚠️ **No explicit PK** — `conversation_id` acts as identifier (1:1 with conversations).
⚠️ **Duplicate urgency fields:** both `urgent` (legacy) and `is_urgent` (active) exist.

---

### `ticket_ref_counters`
| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `city_id` | uuid | NO | — | FK → cities.id (composite PK with year) |
| `year` | integer | NO | — | |
| `counter` | integer | NO | 0 | Auto-incremented by next_ticket_ref() |

---

### `document_files` ✅ Added Phase 2
| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `city_id` | uuid | NO | — | FK → cities.id ON DELETE CASCADE |
| `filename` | text | NO | — | Original uploaded filename |
| `file_type` | text | NO | — | CHECK IN ('pdf', 'docx', 'txt', 'md') |
| `file_size` | integer | YES | — | Size in bytes |
| `storage_path` | text | YES | — | Supabase Storage path (optional) |
| `uploaded_at` | timestamptz | NO | now() | |
| `uploaded_by` | text | YES | — | Audit trail (future use) |
| `chunk_count` | integer | YES | 0 | Denormalized count of chunks in documents |

> Parent record for RAG documents. Deleting a `document_files` row cascades to all its chunks in `documents`.

---

### `documents`
| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `city_id` | uuid | NO | — | FK → cities.id |
| `document_file_id` | uuid | YES | — | FK → document_files.id ON DELETE CASCADE ✅ Added Phase 2 |
| `title` | text | YES | — | Filename inherited from document_files on upload |
| `source_url` | text | YES | — | |
| `content` | text | YES | — | Chunk text |
| `content_hash` | text | YES | — | Deduplication |
| `embedding` | vector(512) | YES | — | pgvector — 512 dimensions (text-embedding-3-small) |
| `created_at` | timestamp | YES | now() | |

> `document_file_id` is nullable for legacy documents ingested via CLI script before Phase 2.

---

### `form_requests`
| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `city_id` | uuid | YES | — | FK → cities.id (`form_requests_city_id_fkey`) ✅ added Phase 0 |
| `type` | text | NO | — | Form type identifier |
| `status` | text | NO | 'ready' | |
| `reference_number` | text | NO | — | |
| `data_json` | jsonb | NO | '{}' | Submitted form data |
| `pdf_base64` | text | YES | — | Generated PDF |
| `pdf_url` | text | YES | — | Alternative PDF storage |
| `error_message` | text | YES | — | PDF generation errors |
| `created_at` | timestamp | NO | now() | |
| `updated_at` | timestamp | NO | now() | |

---

### `form_request_attachments`
| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `form_request_id` | uuid | NO | — | FK → form_requests.id |
| `category_key` | text | NO | — | |
| `category_label` | text | YES | — | |
| `seq_in_category` | integer | NO | 1 | |
| `original_filename` | text | YES | — | |
| `stored_filename` | text | NO | — | |
| `bucket_name` | text | NO | 'attachments' | Supabase storage bucket |
| `storage_path` | text | NO | — | |
| `mime_type` | text | NO | — | |
| `size_bytes` | bigint | NO | — | |
| `created_at` | timestamp | NO | now() | |

---

### `conversation_notes`
| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `conversation_id` | uuid | NO | — | FK → conversations.id |
| `note` | text | NO | — | |
| `created_at` | timestamp | NO | now() | |

---

### `analytics_daily`
| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `date` | date | NO | — | PK (implied) |
| `conversations_count` | integer | NO | 0 | |
| `questions_count` | integer | NO | 0 | |
| `avg_latency_ms` | integer | YES | — | |
| `tickets_open_count` | integer | NO | 0 | |
| `knowledge_gaps_count` | integer | NO | 0 | |

❌ **No `city_id`** — not multi-tenant ready. Migration pending (Phase 3 backlog).

---

### `knowledge_gaps`
| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `city_id` | uuid | YES | — | FK → cities.id ✅ added Phase 1 |
| `question` | text | NO | — | |
| `status` | text | NO | 'open' | |
| `reason` | text | NO | — | |
| `occurrences` | integer | NO | 1 | |
| `first_seen_at` | timestamp | NO | now() | |
| `last_seen_at` | timestamp | NO | now() | |

---

## 3. Foreign Key Constraints

| Table | Column | References | Constraint Name | Status |
|---|---|---|---|---|
| `conversations` | `city_id` | `cities.id` | `fk_conversations_city` | ✅ |
| `messages` | `conversation_id` | `conversations.id` | `messages_conversation_id_fkey` | ✅ |
| `tickets` | `city_id` | `cities.id` | `fk_tickets_city` | ✅ |
| `tickets` | `conversation_id` | `conversations.id` | `fk_tickets_conversation` | ✅ |
| `document_files` | `city_id` | `cities.id` | — | ✅ added Phase 2 |
| `documents` | `city_id` | `cities.id` | `documents_city_id_fkey` | ✅ |
| `documents` | `document_file_id` | `document_files.id` | — | ✅ added Phase 2 (CASCADE) |
| `form_requests` | `city_id` | `cities.id` | `form_requests_city_id_fkey` | ✅ added Phase 0 |
| `form_request_attachments` | `form_request_id` | `form_requests.id` | `form_request_attachments_form_request_id_fkey` | ✅ |
| `conversation_notes` | `conversation_id` | `conversations.id` | `conversation_notes_conversation_id_fkey` | ✅ |
| `knowledge_gaps` | `city_id` | `cities.id` | — | ✅ added Phase 1 (unnamed) |

---

## 4. Stored Functions (RPCs)

### `match_documents(p_city_id, query_embedding, match_threshold, match_count)`
> Used by RAG pipeline for similarity search.
```sql
SELECT id, title, source_url, content,
       1 - (embedding <=> query_embedding) AS similarity
FROM public.documents
WHERE city_id = p_city_id
  AND 1 - (embedding <=> query_embedding) >= match_threshold
ORDER BY embedding <=> query_embedding
LIMIT match_count;
```

### `next_ticket_ref(p_city_id, p_city_code)`
> Generates unique ticket reference like `PLOCE-2025-000001`.
```sql
-- Upserts into ticket_ref_counters, increments counter,
-- returns: UPPER(city_code) || '-' || year || '-' || LPAD(counter, 6, '0')
```

### `purge_gdpr_90d()`
> GDPR cleanup — deletes records older than 90 days from:
> `messages`, `ticket_intakes`, `tickets`, `conversations`

### `enforce_conversation_city_match` *(trigger)*
> On INSERT to `messages` and `tickets` — validates that `city_id` matches
> the `city_id` of the referenced conversation. Auto-fills `city_id` if null.

### `set_updated_at` *(trigger)*
> Auto-updates `updated_at = now()` on UPDATE.

### `_trg_bump_last_activity_on_note` *(trigger)*
> On INSERT to `conversation_notes` — bumps `conversations.last_activity_at`.

---

## 5. Migration Log

### Phase 0 ✅ Complete
```sql
-- 1. Add missing FK on form_requests
ALTER TABLE public.form_requests
  ADD CONSTRAINT form_requests_city_id_fkey
  FOREIGN KEY (city_id) REFERENCES public.cities(id);

-- 2. Remove duplicate FK on conversations
ALTER TABLE public.conversations
  DROP CONSTRAINT conversations_city_id_fkey;

-- 3. Remove duplicate FKs on tickets
ALTER TABLE public.tickets
  DROP CONSTRAINT tickets_city_id_fkey;
ALTER TABLE public.tickets
  DROP CONSTRAINT tickets_conversation_id_fkey;
```

### Phase 1 ✅ Complete
```sql
-- 4. Add allowed_domains to cities
ALTER TABLE public.cities
  ADD COLUMN allowed_domains TEXT[] NOT NULL DEFAULT '{}';

-- 5. Set allowed_domains for Ploče
UPDATE cities
SET allowed_domains = ARRAY['localhost', 'gradai.mangai.hr', 'civisai.mangai.hr']
WHERE slug = 'ploce';

-- 6. Add city_id to knowledge_gaps
ALTER TABLE public.knowledge_gaps
  ADD COLUMN city_id uuid REFERENCES public.cities(id);
```

### Phase 2 ✅ Complete
```sql
-- 7. Create document_files table
CREATE TABLE document_files (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id       uuid NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  filename      text NOT NULL,
  file_type     text NOT NULL CHECK (file_type IN ('pdf', 'docx', 'txt', 'md')),
  file_size     integer,
  storage_path  text,
  uploaded_at   timestamptz NOT NULL DEFAULT now(),
  uploaded_by   text,
  chunk_count   integer DEFAULT 0
);
CREATE INDEX idx_document_files_city_id ON document_files(city_id);

-- 8. Add document_file_id to documents
ALTER TABLE documents
  ADD COLUMN document_file_id uuid REFERENCES document_files(id) ON DELETE CASCADE;
CREATE INDEX idx_documents_document_file_id ON documents(document_file_id);
```

### Phase 3 — Pending
```sql
-- 9. Add city_id to analytics_daily
ALTER TABLE public.analytics_daily
  ADD COLUMN city_id uuid REFERENCES public.cities(id);
```

---

## 6. Known Issues & Backlog

| Issue | Table | Priority |
|---|---|---|
| `city_id` nullable on `form_requests` | form_requests | Low — FK exists, nulls are orphans only |
| `document_file_id` nullable on `documents` | documents | Low — legacy CLI-ingested docs have no parent |
| Duplicate urgency fields (`urgent` vs `is_urgent`) | tickets | Low — cleanup when tickets refactored |
| No explicit PK on tickets | tickets | Low — conversation_id is de facto PK |
| `analytics_daily` not city-scoped | analytics_daily | Phase 3 |

---

## 7. Extensions Required
- `uuid-ossp` — for `uuid_generate_v4()`
- `pgvector` — for `vector` type and `<=>` cosine distance operator

---

*This document reflects the live schema as of April 15, 2026. Run the schema queries again after each migration to verify.*
