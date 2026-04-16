import bcrypt from 'bcrypt';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { supabase } from '../db/supabase.js';

interface SessionCookie {
  cityId: string;
  cityCode: string;
  role: 'admin' | 'inbox' | 'conversations' | 'forms' | 'readonly' | 'superadmin';
  userId: string;
  userName: string;
  isSuperadmin?: boolean;
}

interface AdminUsersParams {
  cityCode: string;
}

interface AdminUsersByIdParams extends AdminUsersParams {
  userId: string;
}

interface CreateUserBody {
  name: string;
  password: string;
  role: string;
}

interface UpdatePasswordBody {
  password: string;
}

const SALT_ROUNDS = 10;
const ALLOWED_USER_ROLES = new Set(['admin', 'inbox', 'conversations', 'forms', 'readonly']);

/**
 * Helper to get and validate session from cookie
 */
async function getSession(request: FastifyRequest): Promise<SessionCookie | null> {
  const sessionCookie = request.cookies.session;
  if (!sessionCookie) {
    return null;
  }

  try {
    const session = JSON.parse(sessionCookie) as Partial<SessionCookie>;
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

function isAdminOrSuperadmin(session: SessionCookie): boolean {
  return session.role === 'admin' || (session.role === 'superadmin' && session.isSuperadmin === true);
}

function hasCityScopeAccess(session: SessionCookie, cityId: string): boolean {
  if (session.role === 'superadmin' && session.isSuperadmin === true) {
    return true;
  }
  return session.cityId === cityId;
}

export async function getAdminUsersHandler(
  request: FastifyRequest<{ Params: AdminUsersParams }>,
  reply: FastifyReply
) {
  const session = await getSession(request);
  if (!session) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }
  if (!isAdminOrSuperadmin(session)) {
    return reply.status(403).send({ error: 'Forbidden' });
  }

  const { cityCode } = request.params;
  const city = await resolveCity(cityCode);
  if (!city) {
    return reply.status(404).send({ error: 'City not found' });
  }
  if (!hasCityScopeAccess(session, city.id)) {
    return reply.status(403).send({ error: 'Forbidden' });
  }

  const { data, error } = await supabase
    .from('city_users')
    .select('id, name, role, created_at')
    .eq('city_id', city.id)
    .order('created_at', { ascending: true });

  if (error) {
    request.log.error(error, 'Failed to fetch city users');
    return reply.status(500).send({ error: 'Internal server error' });
  }

  return reply.send(data || []);
}

export async function createAdminUserHandler(
  request: FastifyRequest<{ Params: AdminUsersParams; Body: CreateUserBody }>,
  reply: FastifyReply
) {
  const session = await getSession(request);
  if (!session) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }
  if (!isAdminOrSuperadmin(session)) {
    return reply.status(403).send({ error: 'Forbidden' });
  }

  const { cityCode } = request.params;
  const city = await resolveCity(cityCode);
  if (!city) {
    return reply.status(404).send({ error: 'City not found' });
  }
  if (!hasCityScopeAccess(session, city.id)) {
    return reply.status(403).send({ error: 'Forbidden' });
  }

  const body = (request.body as CreateUserBody) || ({} as CreateUserBody);
  const name = (body.name || '').trim();
  const password = (body.password || '').trim();
  const role = (body.role || '').trim();

  if (!name || !password || !role) {
    return reply.status(400).send({ error: 'Missing required fields: name, password, role' });
  }
  if (!ALLOWED_USER_ROLES.has(role)) {
    return reply.status(400).send({
      error: 'Invalid role. Allowed: admin, inbox, conversations, forms, readonly',
    });
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const { data, error } = await supabase
    .from('city_users')
    .insert({
      city_id: city.id,
      name,
      role,
      password_hash: passwordHash,
    })
    .select('id, name, role, created_at')
    .single();

  if (error || !data) {
    request.log.error(error, 'Failed to create city user');
    return reply.status(500).send({ error: 'Internal server error' });
  }

  return reply.send(data);
}

export async function deleteAdminUserHandler(
  request: FastifyRequest<{ Params: AdminUsersByIdParams }>,
  reply: FastifyReply
) {
  const session = await getSession(request);
  if (!session) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }
  if (!isAdminOrSuperadmin(session)) {
    return reply.status(403).send({ error: 'Forbidden' });
  }

  const { cityCode, userId } = request.params;
  if (session.userId && session.userId === userId) {
    return reply.status(400).send({ error: 'Cannot delete your own account' });
  }

  const city = await resolveCity(cityCode);
  if (!city) {
    return reply.status(404).send({ error: 'City not found' });
  }
  if (!hasCityScopeAccess(session, city.id)) {
    return reply.status(403).send({ error: 'Forbidden' });
  }

  const { data: existing, error: lookupError } = await supabase
    .from('city_users')
    .select('id')
    .eq('id', userId)
    .eq('city_id', city.id)
    .maybeSingle();

  if (lookupError) {
    request.log.error(lookupError, 'Failed to lookup city user');
    return reply.status(500).send({ error: 'Internal server error' });
  }
  if (!existing) {
    return reply.status(404).send({ error: 'User not found' });
  }

  const { error: deleteError } = await supabase
    .from('city_users')
    .delete()
    .eq('id', userId)
    .eq('city_id', city.id);

  if (deleteError) {
    request.log.error(deleteError, 'Failed to delete city user');
    return reply.status(500).send({ error: 'Internal server error' });
  }

  return reply.send({ success: true });
}

export async function patchAdminUserPasswordHandler(
  request: FastifyRequest<{ Params: AdminUsersByIdParams; Body: UpdatePasswordBody }>,
  reply: FastifyReply
) {
  const session = await getSession(request);
  if (!session) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }
  if (!isAdminOrSuperadmin(session)) {
    return reply.status(403).send({ error: 'Forbidden' });
  }

  const { cityCode, userId } = request.params;
  const city = await resolveCity(cityCode);
  if (!city) {
    return reply.status(404).send({ error: 'City not found' });
  }
  if (!hasCityScopeAccess(session, city.id)) {
    return reply.status(403).send({ error: 'Forbidden' });
  }

  const body = (request.body as UpdatePasswordBody) || ({} as UpdatePasswordBody);
  const password = (body.password || '').trim();
  if (!password) {
    return reply.status(400).send({ error: 'Missing required field: password' });
  }

  const { data: existing, error: lookupError } = await supabase
    .from('city_users')
    .select('id')
    .eq('id', userId)
    .eq('city_id', city.id)
    .maybeSingle();

  if (lookupError) {
    request.log.error(lookupError, 'Failed to lookup city user');
    return reply.status(500).send({ error: 'Internal server error' });
  }
  if (!existing) {
    return reply.status(404).send({ error: 'User not found' });
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const { error: updateError } = await supabase
    .from('city_users')
    .update({ password_hash: passwordHash })
    .eq('id', userId)
    .eq('city_id', city.id);

  if (updateError) {
    request.log.error(updateError, 'Failed to update city user password');
    return reply.status(500).send({ error: 'Internal server error' });
  }

  return reply.send({ success: true });
}

export async function registerAdminUsersRoutes(app: FastifyInstance) {
  app.get('/admin/:cityCode/users', getAdminUsersHandler);
  app.post('/admin/:cityCode/users', createAdminUserHandler);
  app.delete('/admin/:cityCode/users/:userId', deleteAdminUserHandler);
  app.patch('/admin/:cityCode/users/:userId/password', patchAdminUserPasswordHandler);
}
