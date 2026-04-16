import { FastifyRequest, FastifyReply } from 'fastify';

export interface SessionCookie {
  cityId: string;
  cityCode: string;
  role: 'admin' | 'inbox' | 'conversations' | 'forms' | 'readonly' | 'superadmin';
  userId: string;
  userName: string;
  isSuperadmin?: boolean;
}

/**
 * Parse and validate session cookie
 */
function getSession(request: FastifyRequest): SessionCookie | null {
  const cookie = (request.cookies as { session?: string })?.session;
  if (!cookie) {
    return null;
  }

  try {
    const session = JSON.parse(cookie) as Partial<SessionCookie>;
    if (!session.role) {
      return null;
    }

    const validRoles = new Set([
      'admin',
      'inbox',
      'conversations',
      'forms',
      'readonly',
      'superadmin',
    ]);
    if (!validRoles.has(session.role)) {
      return null;
    }

    if (session.role === 'superadmin' && session.isSuperadmin === true) {
      return {
        cityId: session.cityId ?? '',
        cityCode: session.cityCode ?? '',
        role: 'superadmin',
        userId: session.userId ?? '',
        userName: session.userName ?? '',
        isSuperadmin: true,
      };
    }

    if (!session.cityId || !session.cityCode || !session.userId || !session.userName) {
      return null;
    }

    return session as SessionCookie;
  } catch {
    return null;
  }
}

/**
 * Middleware to require admin session
 * Returns 401 if no valid admin session is found
 */
export async function requireAdminSession(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<SessionCookie | null> {
  const session = getSession(request);

  if (!session) {
    return reply.status(401).send({ error: 'Unauthorized: No valid session' });
  }

  if (session.role !== 'admin' && session.role !== 'superadmin') {
    return reply.status(403).send({ error: 'Forbidden: Admin access required' });
  }

  // Attach session to request for use in handlers
  (request as any).session = session;

  return session;
}

/**
 * Middleware to require inbox session
 * Returns 401 if no valid inbox session is found
 */
export async function requireInboxSession(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<SessionCookie | null> {
  const session = getSession(request);

  if (!session) {
    return reply.status(401).send({ error: 'Unauthorized: No valid session' });
  }

  if (
    session.role !== 'inbox' &&
    session.role !== 'admin' &&
    session.role !== 'superadmin'
  ) {
    return reply.status(403).send({ error: 'Forbidden: Inbox access required' });
  }

  // Attach session to request for use in handlers
  (request as any).session = session;

  return session;
}

export async function requireAnySession(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<SessionCookie | null> {
  const session = getSession(request);
  if (!session) {
    return reply.status(401).send({ error: 'Unauthorized: No valid session' });
  }

  (request as any).session = session;
  return session;
}
