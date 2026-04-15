import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { supabase } from '../db/supabase.js';
import { extractText } from '../utils/extractText.js';
import { chunkText } from '../utils/chunkText.js';
import { embed } from '../embedding.js';

interface SessionCookie {
  cityId: string;
  cityCode: string;
  role: 'admin' | 'inbox';
}

interface AdminDocumentsParams {
  cityCode: string;
}

interface DeleteAdminDocumentParams extends AdminDocumentsParams {
  documentFileId: string;
}

const MAX_UPLOAD_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MIME_TYPE_TO_FILE_TYPE = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
  'text/markdown': 'md',
} as const;

/**
 * Helper to get and validate session from cookie
 */
async function getSession(request: FastifyRequest): Promise<SessionCookie | null> {
  const sessionCookie = request.cookies.session;
  if (!sessionCookie) {
    return null;
  }

  try {
    const session: SessionCookie = JSON.parse(sessionCookie);
    if (!session.cityId || !session.role) {
      return null;
    }
    if (session.role !== 'admin' && session.role !== 'inbox') {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

/**
 * Helper to resolve city by cityCode (slug or code)
 */
async function resolveCity(cityCode: string) {
  let { data: city, error: cityError } = await supabase
    .from('cities')
    .select('id, code')
    .eq('slug', cityCode)
    .single();

  if (cityError || !city) {
    const derivedCode = cityCode.toUpperCase();
    const { data: cityByCode, error: codeError } = await supabase
      .from('cities')
      .select('id, code')
      .eq('code', derivedCode)
      .single();

    if (codeError || !cityByCode) {
      return null;
    }
    city = cityByCode;
  }

  return city;
}

/**
 * GET /admin/:cityCode/documents
 * Returns document files for the scoped city
 */
export async function getAdminDocumentsHandler(
  request: FastifyRequest<{ Params: AdminDocumentsParams }>,
  reply: FastifyReply
) {
  const session = await getSession(request);
  if (!session) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  if (session.role !== 'admin') {
    return reply.status(403).send({ error: 'Forbidden' });
  }

  const { cityCode } = request.params;

  try {
    const city = await resolveCity(cityCode);
    if (!city) {
      return reply.status(404).send({ error: 'City not found' });
    }

    if (session.cityId !== city.id) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const { data: documentFiles, error } = await supabase
      .from('document_files')
      .select('id, filename, file_type, file_size, chunk_count, uploaded_at')
      .eq('city_id', city.id)
      .order('uploaded_at', { ascending: false });

    if (error) {
      request.log.error(error, 'Failed to fetch document files');
      return reply.status(500).send({ error: 'Internal server error' });
    }

    return reply.send(documentFiles || []);
  } catch (error) {
    request.log.error(error, 'Internal server error');
    return reply.status(500).send({ error: 'Internal server error' });
  }
}

/**
 * DELETE /admin/:cityCode/documents/:documentFileId
 * Deletes a document file for the scoped city
 */
export async function deleteAdminDocumentHandler(
  request: FastifyRequest<{ Params: DeleteAdminDocumentParams }>,
  reply: FastifyReply
) {
  const session = await getSession(request);
  if (!session) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  if (session.role !== 'admin') {
    return reply.status(403).send({ error: 'Forbidden' });
  }

  const { cityCode, documentFileId } = request.params;

  try {
    const city = await resolveCity(cityCode);
    if (!city) {
      return reply.status(404).send({ error: 'City not found' });
    }

    if (session.cityId !== city.id) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const { data: documentFile, error: lookupError } = await supabase
      .from('document_files')
      .select('id, city_id')
      .eq('id', documentFileId)
      .single();

    if (lookupError || !documentFile) {
      return reply.status(404).send({ error: 'Document file not found' });
    }

    if (documentFile.city_id !== city.id) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const { error: deleteError } = await supabase
      .from('document_files')
      .delete()
      .eq('id', documentFileId);

    if (deleteError) {
      request.log.error(deleteError, 'Failed to delete document file');
      return reply.status(500).send({ error: 'Internal server error' });
    }

    return reply.send({ success: true });
  } catch (error) {
    request.log.error(error, 'Internal server error');
    return reply.status(500).send({ error: 'Internal server error' });
  }
}

/**
 * POST /admin/:cityCode/documents
 * Uploads a single document file, extracts/chunks content, and stores embeddings.
 */
export async function createAdminDocumentHandler(
  request: FastifyRequest<{ Params: AdminDocumentsParams }>,
  reply: FastifyReply
) {
  const session = await getSession(request);
  if (!session) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  if (session.role !== 'admin') {
    return reply.status(403).send({ error: 'Forbidden' });
  }

  const { cityCode } = request.params;

  try {
    const city = await resolveCity(cityCode);
    if (!city) {
      return reply.status(404).send({ error: 'City not found' });
    }

    if (session.cityId !== city.id) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    let filePart: Awaited<ReturnType<typeof request.file>> | undefined;
    try {
      filePart = await request.file();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('File size limit') || msg.includes('fileSize')) {
        return reply.status(400).send({ error: 'File size exceeds 10MB limit' });
      }
      request.log.error({ err }, 'Multipart parse error');
      return reply.status(400).send({ error: 'Invalid multipart request' });
    }

    if (!filePart || filePart.type !== 'file' || filePart.fieldname !== 'file') {
      return reply.status(400).send({ error: 'No file uploaded in field "file"' });
    }

    const filename = filePart.filename ?? 'file';
    const mimetype = filePart.mimetype ?? '';
    const fileType = MIME_TYPE_TO_FILE_TYPE[mimetype as keyof typeof MIME_TYPE_TO_FILE_TYPE];
    if (!fileType) {
      return reply.status(400).send({
        error:
          'Invalid file type. Allowed: application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document, text/plain, text/markdown',
      });
    }

    const buffer = await filePart.toBuffer();
    const fileSize = buffer.length;
    if (fileSize > MAX_UPLOAD_FILE_SIZE_BYTES) {
      return reply.status(400).send({ error: 'File size exceeds 10MB limit' });
    }

    let chunks: string[] = [];
    try {
      const text = await extractText(buffer, fileType);
      chunks = chunkText(text);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(422).send({ error: message });
    }

    const { data: documentFile, error: documentFileError } = await supabase
      .from('document_files')
      .insert({
        city_id: city.id,
        filename,
        file_type: fileType,
        file_size: fileSize,
        chunk_count: chunks.length,
      })
      .select('id, filename, chunk_count')
      .single();

    if (documentFileError || !documentFile) {
      request.log.error(documentFileError, 'Failed to insert document file');
      return reply.status(500).send({ error: 'Internal server error' });
    }

    try {
      for (const chunk of chunks) {
        const embedding = await embed(chunk);
        const { error: insertChunkError } = await supabase.from('documents').insert({
          city_id: city.id,
          document_file_id: documentFile.id,
          content: chunk,
          embedding,
          title: filename,
        });

        if (insertChunkError) {
          throw insertChunkError;
        }
      }
    } catch (err: unknown) {
      request.log.error({ err, documentFileId: documentFile.id }, 'Embedding/chunk insert failed');
      await supabase.from('document_files').delete().eq('id', documentFile.id);
      return reply.status(500).send({ error: 'Failed to embed and store document chunks' });
    }

    return reply.send({
      id: documentFile.id,
      filename: documentFile.filename,
      chunk_count: chunks.length,
    });
  } catch (error) {
    request.log.error(error, 'Internal server error');
    return reply.status(500).send({ error: 'Internal server error' });
  }
}

/**
 * Register admin document routes
 */
export async function registerAdminDocumentRoutes(app: FastifyInstance) {
  app.post('/admin/:cityCode/documents', createAdminDocumentHandler);
  app.get('/admin/:cityCode/documents', getAdminDocumentsHandler);
  app.delete('/admin/:cityCode/documents/:documentFileId', deleteAdminDocumentHandler);
}
