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

export async function registerSuperadminRoutes(app: FastifyInstance) {
  app.get('/superadmin/cities', getSuperadminCitiesHandler);
}
