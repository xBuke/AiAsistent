import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { supabase } from '../db/supabase.js';

interface SessionCookie {
  role: 'admin' | 'inbox' | 'conversations' | 'forms' | 'readonly' | 'superadmin';
  isSuperadmin?: boolean;
}

function getSession(request: FastifyRequest): SessionCookie | null {
  const cookie = request.cookies.session;
  if (!cookie) return null;
  try {
    const parsed = JSON.parse(cookie) as Partial<SessionCookie>;
    if (!parsed.role) return null;
    return parsed as SessionCookie;
  } catch {
    return null;
  }
}

export async function getSuperadminCitiesHandler(request: FastifyRequest, reply: FastifyReply) {
  const session = getSession(request);
  if (!session || session.role !== 'superadmin' || session.isSuperadmin !== true) {
    return reply.status(403).send({ error: 'Forbidden' });
  }

  const { data: cities, error: citiesError } = await supabase
    .from('cities')
    .select('id, name, slug')
    .order('name', { ascending: true });

  if (citiesError || !cities) {
    request.log.error(citiesError, 'Failed to fetch cities for superadmin');
    return reply.status(500).send({ error: 'Internal server error' });
  }

  if (cities.length === 0) {
    return reply.send([]);
  }

  const cityIds = cities.map((city) => city.id);
  const { data: users, error: usersError } = await supabase
    .from('city_users')
    .select('id, city_id, name, role, created_at')
    .in('city_id', cityIds);

  if (usersError) {
    request.log.error(usersError, 'Failed to fetch city users for superadmin');
    return reply.status(500).send({ error: 'Internal server error' });
  }

  const usersByCity = new Map<string, typeof users>();
  (users || []).forEach((user) => {
    const cityUsers = usersByCity.get(user.city_id) || [];
    cityUsers.push(user);
    usersByCity.set(user.city_id, cityUsers);
  });

  const payload = cities.map((city) => {
    const cityUsers = usersByCity.get(city.id) || [];
    return {
      id: city.id,
      name: city.name,
      slug: city.slug,
      userCount: cityUsers.length,
      city_users: cityUsers,
    };
  });

  return reply.send(payload);
}

export async function createSuperadminCityHandler(
  request: FastifyRequest<{
    Body: {
      name?: string;
      slug?: string;
      code?: string;
      allowed_domains?: unknown;
    };
  }>,
  reply: FastifyReply
) {
  const session = getSession(request);
  if (!session || session.role !== 'superadmin' || session.isSuperadmin !== true) {
    return reply.status(403).send({ error: 'Forbidden' });
  }

  const name = request.body?.name?.trim() || '';
  const slug = request.body?.slug?.trim() || '';
  const code = request.body?.code?.trim() || '';
  const allowedDomains = request.body?.allowed_domains;

  if (!name || !slug || !code) {
    return reply.status(400).send({ error: 'name, slug, and code are required' });
  }

  if (!/^[a-z0-9-]+$/.test(slug)) {
    return reply.status(400).send({ error: 'slug must contain lowercase letters, numbers, and hyphens only' });
  }

  if (!/^[A-Z0-9]+$/.test(code)) {
    return reply.status(400).send({ error: 'code must contain uppercase letters and numbers only' });
  }

  if (!Array.isArray(allowedDomains)) {
    return reply.status(400).send({ error: 'allowed_domains must be an array' });
  }

  const { data: existingCity, error: existingCityError } = await supabase
    .from('cities')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  if (existingCityError) {
    request.log.error(existingCityError, 'Failed to validate city slug uniqueness');
    return reply.status(500).send({ error: 'Internal server error' });
  }

  if (existingCity) {
    return reply.status(409).send({ error: 'City slug already exists' });
  }

  const { data: createdCity, error: createError } = await supabase
    .from('cities')
    .insert({
      name,
      slug,
      code,
      allowed_domains: allowedDomains,
      admin_password_hash: '',
      inbox_password_hash: '',
    })
    .select('id, name, slug, code, allowed_domains, created_at')
    .single();

  if (createError || !createdCity) {
    request.log.error(createError, 'Failed to create city');
    return reply.status(500).send({ error: 'Internal server error' });
  }

  return reply.status(201).send(createdCity);
}

export async function updateSuperadminCityDomainsHandler(
  request: FastifyRequest<{
    Params: { cityId: string };
    Body: { allowed_domains?: unknown };
  }>,
  reply: FastifyReply
) {
  const session = getSession(request);
  if (!session || session.isSuperadmin !== true) {
    return reply.status(403).send({ error: 'Forbidden' });
  }

  const allowedDomains = request.body?.allowed_domains;
  if (!Array.isArray(allowedDomains)) {
    return reply.status(400).send({ error: 'allowed_domains must be an array' });
  }

  const { data: city, error: updateError } = await supabase
    .from('cities')
    .update({ allowed_domains: allowedDomains })
    .eq('id', request.params.cityId)
    .select('id, name, slug, allowed_domains')
    .maybeSingle();

  if (updateError) {
    request.log.error(updateError, 'Failed to update city domains');
    return reply.status(500).send({ error: 'Internal server error' });
  }

  if (!city) {
    return reply.status(404).send({ error: 'City not found' });
  }

  return reply.send(city);
}

export async function registerSuperadminRoutes(app: FastifyInstance) {
  app.get('/superadmin/cities', getSuperadminCitiesHandler);
  app.post('/superadmin/cities', createSuperadminCityHandler);
  app.patch('/superadmin/cities/:cityId/domains', updateSuperadminCityDomainsHandler);
}
