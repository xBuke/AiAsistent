import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { supabase } from '../db/supabase.js';
import { generateReferenceNumber } from '../forms/referenceNumber.js';
import { generateFormPdf, type FormType } from '../forms/generateFormPdf.js';

const ALLOWED_TYPES: FormType[] = ['novorodeno_dijete', 'jednokratna_novcana_pomoc'];
const MAX_REF_RETRIES = 3;
const ERROR_MESSAGE_MAX_LENGTH = 500;

// Attachment upload limits (CIVIS Phase 2).
const MAX_ATTACHMENTS_PER_REQUEST = 10;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;

interface SubmitBody {
  city_slug: string;
  type: string;
  data: Record<string, unknown>;
  /** When provided, submit updates this draft instead of creating a new row. */
  reference_number?: string;
  /** Enabled attachment category keys; each must have >= 1 file when reference_number is used. */
  attachments_enabled_categories?: string[];
}

interface DraftBody {
  city_slug: string;
  type: string;
  data_json?: Record<string, unknown>;
}

/**
 * Form request status lifecycle (for regression/documentation):
 * - processing -> submitted (success after PDF generation)
 * - processing -> failed (PDF generation error)
 * - draft (future; must never show in admin list)
 */
/**
 * POST /forms/submit
 * Validates type, creates form_requests row (processing), generates PDF, updates row (submitted), returns reference_number and status.
 */
export async function formsSubmitHandler(
  request: FastifyRequest<{ Body: SubmitBody }>,
  reply: FastifyReply
) {
  const body = request.body || {};
  const { city_slug: citySlug, type, data, reference_number: draftRef, attachments_enabled_categories: enabledCategories } = body;

  if (!citySlug || typeof citySlug !== 'string' || !citySlug.trim()) {
    return reply.status(400).send({ error: 'city_slug is required' });
  }
  if (!type || typeof type !== 'string') {
    return reply.status(400).send({ error: 'type is required' });
  }
  if (!ALLOWED_TYPES.includes(type as FormType)) {
    return reply.status(400).send({
      error: 'Invalid type. Allowed: novorodeno_dijete, jednokratna_novcana_pomoc',
    });
  }
  if (data == null || typeof data !== 'object' || Array.isArray(data)) {
    return reply.status(400).send({ error: 'data must be a non-null object' });
  }

  const slug = citySlug.trim();
  let reference_number: string | null = null;
  let city: { id: string } | null = null;

  // --- Draft path: update existing row (draft -> processing -> submitted/failed) ---
  if (draftRef && typeof draftRef === 'string' && draftRef.trim()) {
    const refTrimmed = draftRef.trim();
    const { data: existing, error: fetchError } = await supabase
      .from('form_requests')
      .select('id, status, city_id')
      .eq('reference_number', refTrimmed)
      .single();

    if (fetchError || !existing) {
      return reply.status(400).send({ error: 'Draft not found' });
    }
    if (existing.status !== 'draft') {
      return reply.status(409).send({ error: 'Already submitted' });
    }

    // Enforce: each enabled category must have >= 1 attachment
    const categories = Array.isArray(enabledCategories)
      ? enabledCategories.filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
      : [];
    for (const category_key of categories) {
      const { count, error: countErr } = await supabase
        .from('form_request_attachments')
        .select('*', { count: 'exact', head: true })
        .eq('form_request_id', existing.id)
        .eq('category_key', category_key);
      if (countErr || (count ?? 0) === 0) {
        return reply.status(400).send({
          error: 'Missing attachment for category',
          category_key,
        });
      }
    }

    // Update draft to processing and set final data_json; keep city_id
    const { error: updateDraftError } = await supabase
      .from('form_requests')
      .update({
        status: 'processing',
        data_json: data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);

    if (updateDraftError) {
      request.log.error({ err: updateDraftError }, 'form_requests draft update failed');
      return reply.status(500).send({ error: 'Failed to update draft' });
    }

    reference_number = refTrimmed;
    city = { id: existing.city_id };
  } else {
    // --- New submission path: resolve city and create new row ---
    let { data: cityRow, error: cityError } = await supabase
      .from('cities')
      .select('id')
      .eq('slug', slug)
      .single();
    if (cityError || !cityRow) {
      const { data: cityByCode, error: codeError } = await supabase
        .from('cities')
        .select('id')
        .eq('code', slug.toUpperCase())
        .single();
      if (codeError || !cityByCode) {
        return reply.status(400).send({ error: 'City not found' });
      }
      cityRow = cityByCode;
    }
    city = cityRow;

    let lastInsertError: unknown = null;
    for (let attempt = 0; attempt < MAX_REF_RETRIES; attempt++) {
      reference_number = generateReferenceNumber(slug, type);
      const { data: row, error: insertError } = await supabase
        .from('form_requests')
        .insert({
          city_id: city.id,
          type,
          status: 'processing',
          reference_number,
          data_json: data,
          pdf_base64: null,
          pdf_url: null,
          error_message: null,
        })
        .select('id')
        .single();

      if (!insertError) {
        lastInsertError = null;
        break;
      }
      lastInsertError = insertError;
      const isUniqueViolation =
        insertError.code === '23505' ||
        (insertError.message && insertError.message.includes('unique'));
      if (!isUniqueViolation) {
        request.log.error({ err: insertError }, 'form_requests insert failed');
        return reply.status(500).send({
          error: 'Failed to create form submission',
          reference_number: null,
        });
      }
    }

    if (lastInsertError || reference_number === null) {
      request.log.error({ err: lastInsertError }, 'form_requests insert failed after retries');
      return reply.status(500).send({
        error: 'Failed to create form submission (reference number conflict)',
        reference_number: null,
      });
    }
  }

  // --- Common: generate PDF and set submitted / failed ---
  try {
    const dataWithRef = {
      ...data,
      meta: { ...(data.meta && typeof data.meta === 'object' ? data.meta : {}), ref_broj: reference_number },
    };
    const pdfBuffer = await generateFormPdf(type as FormType, dataWithRef);
    const pdf_base64 = pdfBuffer.toString('base64');

    const { error: updateError } = await supabase
      .from('form_requests')
      .update({
        status: 'submitted',
        pdf_base64,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq('reference_number', reference_number);

    if (updateError) {
      request.log.error({ err: updateError }, 'form_requests update after PDF failed');
      return reply.status(500).send({
        error: 'Form saved but failed to attach PDF',
        reference_number,
        status: 'processing',
      });
    }

    return reply.send({ reference_number, status: 'submitted' });
  } catch (pdfErr: unknown) {
    const errMessage =
      pdfErr instanceof Error ? pdfErr.message : String(pdfErr);
    const truncated = errMessage.slice(0, ERROR_MESSAGE_MAX_LENGTH);

    request.log.error({ err: pdfErr }, 'PDF generation failed');

    await supabase
      .from('form_requests')
      .update({
        status: 'failed',
        error_message: truncated,
        updated_at: new Date().toISOString(),
      })
      .eq('reference_number', reference_number);

    return reply.status(500).send({
      error: 'Form submission saved but PDF generation failed',
      reference_number,
      status: 'failed',
    });
  }
}

/**
 * POST /forms/draft
 * Creates a draft form_request to reserve reference_number. No PDF generation.
 * Used when wizard reaches Attachments step so uploads can be tied to the draft.
 */
export async function formsDraftHandler(
  request: FastifyRequest<{ Body: DraftBody }>,
  reply: FastifyReply
) {
  const body = request.body || {};
  const { city_slug: citySlug, type, data_json } = body;

  if (!citySlug || typeof citySlug !== 'string' || !citySlug.trim()) {
    return reply.status(400).send({ error: 'city_slug is required' });
  }
  if (!type || typeof type !== 'string') {
    return reply.status(400).send({ error: 'type is required' });
  }
  if (!ALLOWED_TYPES.includes(type as FormType)) {
    return reply.status(400).send({
      error: 'Invalid type. Allowed: novorodeno_dijete, jednokratna_novcana_pomoc',
    });
  }

  const slug = citySlug.trim();
  // Resolve city: slug first, then code (same as submit).
  let { data: city, error: cityError } = await supabase
    .from('cities')
    .select('id')
    .eq('slug', slug)
    .single();
  if (cityError || !city) {
    const { data: cityByCode, error: codeError } = await supabase
      .from('cities')
      .select('id')
      .eq('code', slug.toUpperCase())
      .single();
    if (codeError || !cityByCode) {
      return reply.status(400).send({ error: 'City not found' });
    }
    city = cityByCode;
  }

  const dataJson = data_json != null && typeof data_json === 'object' && !Array.isArray(data_json)
    ? data_json
    : {};

  let reference_number: string | null = null;
  let form_request_id: string | null = null;
  let lastInsertError: unknown = null;

  for (let attempt = 0; attempt < MAX_REF_RETRIES; attempt++) {
    reference_number = generateReferenceNumber(slug, type);

    const { data: row, error: insertError } = await supabase
      .from('form_requests')
      .insert({
        city_id: city.id,
        type,
        status: 'draft',
        reference_number,
        data_json: dataJson,
        pdf_base64: null,
        pdf_url: null,
        error_message: null,
      })
      .select('id')
      .single();

    if (!insertError) {
      form_request_id = row?.id ?? null;
      lastInsertError = null;
      break;
    }

    lastInsertError = insertError;
    const isUniqueViolation =
      insertError.code === '23505' ||
      (insertError.message && insertError.message.includes('unique'));
    if (!isUniqueViolation) {
      request.log.error({ err: insertError }, 'form_requests draft insert failed');
      return reply.status(500).send({ error: 'Failed to create draft' });
    }
  }

  if (lastInsertError || reference_number === null || form_request_id === null) {
    request.log.error({ err: lastInsertError }, 'form_requests draft insert failed after retries');
    return reply.status(500).send({ error: 'Failed to create draft (reference number conflict)' });
  }

  return reply.send({
    form_request_id,
    reference_number,
    status: 'draft',
  });
}

/**
 * POST /forms/:reference_number/attachments
 * Multipart: category_key (required), category_label (optional), file (single file per request).
 * Uploads to Supabase Storage and inserts into form_request_attachments.
 * Allowed only for status draft or processing; 409 for submitted.
 */
export async function formsAttachmentsUploadHandler(
  request: FastifyRequest<{ Params: { reference_number: string } }>,
  reply: FastifyReply
) {
  const { reference_number } = request.params;
  if (!reference_number || !reference_number.trim()) {
    return reply.status(400).send({ error: 'reference_number is required' });
  }

  let category_key = '';
  let category_label = '';
  let fileBuffer: Buffer | null = null;
  let original_filename = '';
  let mime_type = '';
  let fileSizeBytes = 0;

  try {
    const parts = request.parts();
    for await (const part of parts) {
      if (part.type === 'field') {
        const value = String((part as { fieldname: string; value: unknown }).value ?? '').trim();
        const fieldname = (part as { fieldname: string }).fieldname;
        if (fieldname === 'category_key') category_key = value;
        if (fieldname === 'category_label') category_label = value;
      }
      if (part.type === 'file') {
        const filePart = part as { filename: string; mimetype: string; toBuffer: () => Promise<Buffer> };
        original_filename = filePart.filename ?? 'file';
        mime_type = filePart.mimetype ?? '';
        fileBuffer = await filePart.toBuffer();
        fileSizeBytes = fileBuffer.length;
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('File size limit') || msg.includes('fileSize')) {
      return reply.status(400).send({ error: 'File size exceeds 5MB limit' });
    }
    request.log.error({ err }, 'Multipart parse error');
    return reply.status(400).send({ error: 'Invalid multipart request' });
  }

  if (!category_key) {
    return reply.status(400).send({ error: 'category_key is required' });
  }
  if (!fileBuffer || fileBuffer.length === 0) {
    return reply.status(400).send({ error: 'No file provided' });
  }
  if (fileSizeBytes > MAX_FILE_SIZE_BYTES) {
    return reply.status(400).send({ error: 'File size exceeds 5MB limit' });
  }
  if (!ALLOWED_MIME_TYPES.includes(mime_type as any)) {
    return reply.status(400).send({
      error: 'Invalid file type. Allowed: application/pdf, image/jpeg, image/png',
    });
  }

  // Lookup form_request by reference_number; get id, status, type, city_id for storage path.
  const { data: formRequest, error: frError } = await supabase
    .from('form_requests')
    .select('id, status, type, city_id')
    .eq('reference_number', reference_number.trim())
    .single();

  if (frError || !formRequest) {
    return reply.status(404).send({ error: 'Form request not found' });
  }

  // Allow uploads only for draft and processing; reject submitted.
  if (formRequest.status === 'submitted') {
    return reply.status(409).send({ error: 'Cannot add attachments to a submitted request' });
  }
  if (formRequest.status !== 'draft' && formRequest.status !== 'processing') {
    return reply.status(409).send({ error: 'Attachments can only be added to draft or processing requests' });
  }

  // Total attachments for this form_request must not exceed 10.
  const { count, error: countError } = await supabase
    .from('form_request_attachments')
    .select('*', { count: 'exact', head: true })
    .eq('form_request_id', formRequest.id);

  if (countError) {
    request.log.error({ err: countError }, 'form_request_attachments count failed');
    return reply.status(500).send({ error: 'Failed to validate attachment count' });
  }
  if ((count ?? 0) >= MAX_ATTACHMENTS_PER_REQUEST) {
    return reply.status(400).send({ error: 'Maximum 10 attachments per request' });
  }

  // City slug for storage path: prefer cities.slug, fallback to city.code lowercased.
  const { data: cityRow } = await supabase
    .from('cities')
    .select('slug, code')
    .eq('id', formRequest.city_id)
    .single();

  const citySlug =
    (cityRow?.slug && String(cityRow.slug).trim()) ||
    (cityRow?.code ? String(cityRow.code).toLowerCase() : 'unknown');

  // seq_in_category: max(seq_in_category) for (form_request_id, category_key) + 1.
  const { data: maxSeqRows } = await supabase
    .from('form_request_attachments')
    .select('seq_in_category')
    .eq('form_request_id', formRequest.id)
    .eq('category_key', category_key)
    .order('seq_in_category', { ascending: false })
    .limit(1);

  const seq_in_category = (maxSeqRows?.[0]?.seq_in_category ?? 0) + 1;
  const seq2 = String(seq_in_category).padStart(2, '0');

  // Extension from MIME (not from original filename).
  const extMap: Record<string, string> = {
    'application/pdf': 'pdf',
    'image/jpeg': 'jpg',
    'image/png': 'png',
  };
  const ext = extMap[mime_type] ?? 'bin';

  const stored_filename = `${reference_number}_${formRequest.type}_${category_key}_${seq2}.${ext}`;
  // Path inside bucket (bucket name is "attachments"); DB stores this path.
  const storage_path = `${citySlug}/${reference_number}/${stored_filename}`;

  // Upload to Supabase Storage (server-side; bucket "attachments").
  const { error: uploadError } = await supabase.storage
    .from('attachments')
    .upload(storage_path, fileBuffer, {
      contentType: mime_type,
      upsert: false,
    });

  if (uploadError) {
    request.log.error({ err: uploadError }, 'Supabase storage upload failed');
    return reply.status(500).send({ error: 'File upload failed' });
  }

  // Insert attachment metadata into form_request_attachments.
  const { data: inserted, error: insertError } = await supabase
    .from('form_request_attachments')
    .insert({
      form_request_id: formRequest.id,
      category_key,
      category_label: category_label || null,
      seq_in_category,
      original_filename,
      stored_filename,
      bucket_name: 'attachments',
      storage_path,
      mime_type,
      size_bytes: fileSizeBytes,
    })
    .select('id, stored_filename, category_key, seq_in_category, created_at')
    .single();

  if (insertError) {
    request.log.error({ err: insertError }, 'form_request_attachments insert failed');
    return reply.status(500).send({ error: 'Failed to save attachment record' });
  }

  return reply.send({
    id: inserted.id,
    stored_filename: inserted.stored_filename,
    category_key: inserted.category_key,
    seq_in_category: inserted.seq_in_category,
    created_at: inserted.created_at,
  });
}

export async function registerFormsRoutes(server: FastifyInstance) {
  server.post('/forms/submit', formsSubmitHandler);
  server.post('/forms/draft', formsDraftHandler);
  server.post('/forms/:reference_number/attachments', formsAttachmentsUploadHandler);
}
