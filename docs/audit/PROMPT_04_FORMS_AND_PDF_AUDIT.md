# Forms and PDF Audit — PROMPT_04

**Date:** 2025-02-12  
**Scope:** Forms system, form_requests lifecycle, PDF generation/storage, attachment uploads, city scoping  
**Mode:** READ-ONLY (no code changes)

---

## 1) Endpoints List + Payloads

### Public/Widget Forms API (`apps/api/src/routes/forms.ts`)

| Method | Endpoint | Payload / Params | Response |
|--------|----------|------------------|----------|
| `POST` | `/forms/submit` | Body: `{ city_slug, type, data[, reference_number, attachments_enabled_categories ] }` | `{ reference_number, status: 'submitted' \| 'failed' }` or `400/500` |
| `POST` | `/forms/draft` | Body: `{ city_slug, type[, data_json ] }` | `{ form_request_id, reference_number, status: 'draft' }` or `400/500` |
| `GET` | `/forms/:reference_number/pdf` | Params: `reference_number` | PDF binary (inline) or `404/409/500` |
| `POST` | `/forms/:reference_number/attachments` | Multipart: `category_key` (required), `category_label`, `file` | `{ id, stored_filename, category_key, seq_in_category, created_at }` or `400/404/409/500` |

### Admin Forms API (`apps/api/src/routes/adminDashboard.ts`)

| Method | Endpoint | Payload / Params | Response |
|--------|----------|------------------|----------|
| `GET` | `/admin/forms` | (none) | `[{ reference_number, type, status, created_at }]` (latest 50, excludes draft) |
| `GET` | `/admin/forms/:reference_number/pdf` | Params: `reference_number` | PDF binary (inline) or `404/409/500` |
| `GET` | `/admin/forms/:reference_number/attachments` | Params: `reference_number` | `[{ id, stored_filename, category_key, category_label, size_bytes, mime_type, created_at }]` |
| `GET` | `/admin/forms/:reference_number/attachments/:attachment_id/signed-url` | Params: `reference_number`, `attachment_id` | `{ url }` (signed URL, 60s expiry) |

### Payload Details

**POST /forms/submit**
```json
{
  "city_slug": "ploce",
  "type": "novorodeno_dijete" | "jednokratna_novcana_pomoc",
  "data": { /* form-specific fields */ },
  "reference_number": "<optional, for draft -> submit path>",
  "attachments_enabled_categories": ["category_key1", "category_key2"]
}
```

**POST /forms/draft**
```json
{
  "city_slug": "ploce",
  "type": "novorodeno_dijete" | "jednokratna_novcana_pomoc",
  "data_json": { }
}
```

**POST /forms/:reference_number/attachments** (multipart/form-data)
- `category_key` (required)
- `category_label` (optional)
- `file` (single file, max 5MB)

---

## 2) DB Writes (Tables/Fields)

### `form_requests`

| Operation | When | Fields Written |
|-----------|------|----------------|
| INSERT (new) | `POST /forms/submit` (no draft) or `POST /forms/draft` | `city_id`, `type`, `status`, `reference_number`, `data_json`, `pdf_base64`, `pdf_url`, `error_message` (all null for draft) |
| UPDATE (draft→submit) | `POST /forms/submit` with `reference_number` | `status: 'processing'`, `data_json`, `updated_at` |
| UPDATE (after PDF) | After `generateFormPdf()` succeeds | `status: 'submitted'`, `pdf_base64`, `error_message: null`, `updated_at` |
| UPDATE (PDF failed) | On PDF generation exception | `status: 'failed'`, `error_message`, `updated_at` |

**Note:** `pdf_url` is always set to `null` on insert/update. No external storage URL is written.

### `form_request_attachments`

| Operation | When | Fields Written |
|-----------|------|----------------|
| INSERT | `POST /forms/:reference_number/attachments` | `form_request_id`, `category_key`, `category_label`, `seq_in_category`, `original_filename`, `stored_filename`, `bucket_name`, `storage_path`, `mime_type`, `size_bytes` |

---

## 3) Storage Writes (Bucket/Path Conventions)

### PDF

- **Storage location:** Database column `form_requests.pdf_base64` (base64-encoded PDF).
- **No file storage:** PDFs are NOT stored in Supabase Storage. The `pdf_url` column exists but is never populated.

### Attachments

| Field | Value |
|-------|-------|
| **Bucket** | `attachments` (hardcoded) |
| **Path pattern** | `{citySlug}/{reference_number}/{stored_filename}` |
| **stored_filename** | `{reference_number}_{form_type}_{category_key}_{seq2}.{ext}` |
| **Example** | `ploce/ploce-20260212-0421/ploce-20260212-0421_jednokratna_novcana_pomoc_osobni_dokumenti_01.pdf` |

**City slug resolution (for path):**  
`cities.slug` (preferred) or `cities.code.toLowerCase()` fallback. If both missing → `'unknown'`.

**Allowed MIME types:** `application/pdf`, `image/jpeg`, `image/png`  
**Limits:** 5MB per file, 10 attachments per form request.

---

## 4) Current City Scoping

### Form Creation (Submit/Draft)

| Endpoint | City source | Validation |
|----------|-------------|------------|
| `POST /forms/submit` | Body `city_slug` | Required. Resolved via `cities.slug` or `cities.code` (uppercase). 400 if missing or not found. |
| `POST /forms/draft` | Body `city_slug` | Same as submit. |
| `POST /forms/:reference_number/attachments` | `form_requests.city_id` | No direct city param. City inferred from form_request row (used only for storage path). |

### Form Reads

| Endpoint | City filter |
|----------|-------------|
| `GET /forms/:reference_number/pdf` | **None.** Any client with `reference_number` can fetch PDF (if status = submitted). |
| `GET /admin/forms` | **None.** Returns latest 50 form_requests across all cities. |
| `GET /admin/forms/:reference_number/pdf` | **None.** |
| `GET /admin/forms/:reference_number/attachments` | **None.** |
| `GET /admin/forms/:reference_number/attachments/:id/signed-url` | **None.** |

**Summary:**  
- `form_requests.city_id` is set correctly on insert.  
- Admin endpoints do **not** restrict by city; admin can see forms from any city.  
- Public PDF endpoint is unscoped; `reference_number` is globally unique, so no city check.

---

## 5) Forms and Wizard Flow

### Which Forms Exist

| Type | Display name | Wizard component |
|------|--------------|------------------|
| `novorodeno_dijete` | Novorođeno dijete (novčana pomoć) | `NovorodenoDijeteWizard` |
| `jednokratna_novcana_pomoc` | Jednokratna novčana pomoć | `JednokratnaNovcanaPomocWizard` |

### How Wizards Are Triggered

1. **Source:** `MessageList.tsx` — `getCtaFormTypeFromTopDoc(message)`
2. **Logic:** For last assistant message, inspect `message.metadata?.retrieved_docs_top3[0].title`.
3. **Mapping (normalized title → form):**
   - `novcana_pomoc_za_novorodeno_dijete` → `novorodeno_dijete`
   - `jednokratna_novcana_pomoc` → `jednokratna_novcana_pomoc`
4. **CTA:** If `!dismissed && !activeForm`, show "Pošalji zahtjev" button. On click → `setActiveForm(formType)`.

Wizards are **hardcoded** in the frontend. No per-city configuration.

### Draft + Attachments Flow (jednokratna, novorodeno)

1. User reaches attachments step (step 4 for jednokratna).
2. Wizard calls `POST /forms/draft` with `city_slug`, `type` → gets `reference_number`.
3. User selects categories, uploads files → `POST /forms/:reference_number/attachments` per file.
4. On final submit: `POST /forms/submit` with `reference_number`, `data`, `attachments_enabled_categories`.
5. API validates that each enabled category has ≥ 1 attachment; generates PDF; updates row to `submitted`.

---

## 6) PDF Generation Logic

| Step | Location | Behavior |
|------|----------|----------|
| 1 | `forms.ts:188-189` | `generateFormPdf(type, dataWithRef)` → returns `Buffer` |
| 2 | `generateFormPdf.ts` | Dispatches by `formType` to `renderNovorodenoDijeteHtml` or `renderJednokratnaPomocHtml` |
| 3 | `templates/novorodenoDijete.ts`, `templates/jednokratnaPomoc.ts` | Render HTML from `data` |
| 4 | `pdf/htmlToPdf.ts` | `htmlToPdfBuffer(html)` — Puppeteer (local) or Puppeteer + Chromium (Vercel/Lambda) |
| 5 | `forms.ts:189-199` | Base64-encode buffer → `pdf_base64`; update `form_requests` row |

---

## 7) Gaps vs Desired A2 Approach

Desired A2 approach (from audit scope):
- **Wizards in code, per-city settings JSON in DB**
- **Per-city onboarding**

### Current State vs A2

| A2 Requirement | Current State | Gap |
|----------------|---------------|-----|
| Wizards in code | ✅ Two wizards hardcoded in `NovorodenoDijeteWizard.tsx`, `JednokratnaNovcanaPomocWizard.tsx` | None |
| Per-city settings JSON in DB | ❌ No `city_settings` or similar table. Form types, steps, labels are hardcoded. | No per-city form configuration. |
| Per-city onboarding | ❌ No onboarding flow or city-specific enablement. Widget form CTAs are driven by doc title matching, not city config. | Cities cannot opt in/out of forms or customize behavior. |
| Admin city-scoped forms | ❌ `GET /admin/forms` returns all cities. Admin session has `cityId` but forms endpoints don't use it. | Admin sees forms from all cities; no city filter. |
| pdf_url usage | ❌ `pdf_url` column exists but is never written. PDFs stored only in `pdf_base64`. | No option for external/storage-hosted PDFs. |
| Form type validation | `ALLOWED_TYPES` in code. Adding a form requires code change. | No DB-driven form type registry. |
| Attachment categories | Hardcoded in each wizard (`NOVORODENO_ATTACHMENT_CATEGORIES`, `JEDNOKRATNA_ATTACHMENT_CATEGORIES`). | Not configurable per city. |

### Recommendations for A2 Alignment

1. **Admin forms:** Filter `GET /admin/forms` (and related) by `session.cityId` → `form_requests.city_id`.
2. **City settings:** Introduce `city_settings` (or `cities.form_config`) JSON column for per-city form enablement and attachment categories.
3. **Wizard trigger:** Derive CTA visibility from city config (e.g. `form_config.enabled_forms`) instead of only doc title.
4. **PDF storage (optional):** Consider storing PDFs in Supabase Storage and populating `pdf_url` to reduce DB size and enable CDN.
5. **Form type registry:** Move allowed types to DB or city config so new forms can be added without code deploy.

---

## Appendix: File References

| Topic | File(s) |
|-------|---------|
| Forms routes | `apps/api/src/routes/forms.ts` |
| Admin forms | `apps/api/src/routes/adminDashboard.ts` (lines 805–989) |
| PDF generation | `apps/api/src/forms/generateFormPdf.ts`, `apps/api/src/pdf/htmlToPdf.ts` |
| Reference number | `apps/api/src/forms/referenceNumber.ts` |
| Wizard trigger | `apps/web/src/widget/ui/MessageList.tsx` (getCtaFormTypeFromTopDoc) |
| Novorodeno wizard | `apps/web/src/widget/ui/NovorodenoDijeteWizard.tsx` |
| Jednokratna wizard | `apps/web/src/widget/ui/JednokratnaNovcanaPomocWizard.tsx` |
| Widget form handlers | `apps/web/src/widget/WidgetApp.tsx` (lines 429–585) |
