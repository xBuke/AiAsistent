import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { supabase } from '../db/supabase.js';

const PROTECTED_PREFIXES = ['/chat', '/events', '/forms'];

function isProtectedRoute(request: FastifyRequest): boolean {
  const path = request.url.split('?')[0];
  // Public catalog: same as other read-only public form surface; GET often has no Origin.
  if (request.method === 'GET' && path.startsWith('/forms/definitions/')) {
    return false;
  }
  return PROTECTED_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function getOriginHost(originHeader: string): string | null {
  const origin = originHeader.trim();
  if (!origin) return null;

  try {
    // URL.hostname strips protocol and port automatically.
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function forbid(reply: FastifyReply): void {
  reply.code(403).send({ error: 'Forbidden' });
}

export function registerOriginValidation(server: FastifyInstance): void {
  server.addHook(
    'onRequest',
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (request.method === 'OPTIONS') {
        return;
      }

      if (!isProtectedRoute(request)) {
        return;
      }

      const originHeader = Array.isArray(request.headers.origin)
        ? request.headers.origin[0]
        : request.headers.origin;

      if (!originHeader || !originHeader.trim()) {
        forbid(reply);
        return;
      }

      const hostname = getOriginHost(originHeader);
      if (!hostname) {
        forbid(reply);
        return;
      }

      // Equivalent to: SELECT id FROM cities WHERE $hostname = ANY(allowed_domains) LIMIT 1
      const { data, error } = await supabase
        .from('cities')
        .select('id')
        .contains('allowed_domains', [hostname])
        .limit(1);

      if (error || !data || data.length === 0) {
        forbid(reply);
        return;
      }

      return;
    }
  );
}
