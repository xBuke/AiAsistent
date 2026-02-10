import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { supabase } from '../db/supabase.js';
import { generateReferenceNumber } from '../forms/referenceNumber.js';
import { generateFormPdf, type FormType } from '../forms/generateFormPdf.js';

const ALLOWED_TYPES: FormType[] = ['novorodeno_dijete', 'jednokratna_novcana_pomoc'];
const MAX_REF_RETRIES = 3;
const ERROR_MESSAGE_MAX_LENGTH = 500;

interface SubmitBody {
  city_slug: string;
  type: string;
  data: Record<string, unknown>;
}

/**
 * POST /forms/submit
 * Validates type, creates form_requests row (processing), generates PDF, updates row (ready), returns reference_number and status.
 */
export async function formsSubmitHandler(
  request: FastifyRequest<{ Body: SubmitBody }>,
  reply: FastifyReply
) {
  const body = request.body || {};
  const { city_slug: citySlug, type, data } = body;

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

  let reference_number: string | null = null;
  let lastInsertError: unknown = null;

  for (let attempt = 0; attempt < MAX_REF_RETRIES; attempt++) {
    reference_number = generateReferenceNumber(citySlug.trim(), type);

    const { data: row, error: insertError } = await supabase
      .from('form_requests')
      .insert({
        city_id: null,
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
        status: 'ready',
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

    return reply.send({ reference_number, status: 'ready' });
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

export async function registerFormsRoutes(server: FastifyInstance) {
  server.post('/forms/submit', formsSubmitHandler);
}
