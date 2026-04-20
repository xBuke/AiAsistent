import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { supabase } from '../db/supabase.js';
import type { FormDefinitionPublic } from './forms.js';

interface FormDefinitionAdmin extends FormDefinitionPublic {
  city_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface FormDefinitionCreateBody {
  name: string;
  slug: string;
  description?: string | null;
  fields: unknown[];
  required_attachments: unknown[];
  trigger_doc_slugs: string[];
  city_id: string;
}

type FormDefinitionUpdateBody = Partial<
  Omit<FormDefinitionCreateBody, 'city_id'> & { is_active: boolean }
>;

const FORM_DEFINITION_SLUG_PATTERN = /^[a-z0-9-]+$/;

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function mapFormDefinitionRow(row: {
  id: string;
  city_id: string;
  name: string;
  slug: string;
  description: string | null;
  fields: unknown;
  required_attachments: unknown;
  trigger_doc_slugs: unknown;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}): FormDefinitionAdmin {
  return {
    id: row.id,
    city_id: row.city_id,
    name: row.name,
    slug: row.slug,
    description: row.description ?? null,
    fields: Array.isArray(row.fields) ? row.fields : [],
    required_attachments: Array.isArray(row.required_attachments) ? row.required_attachments : [],
    trigger_doc_slugs: Array.isArray(row.trigger_doc_slugs)
      ? row.trigger_doc_slugs.filter((s): s is string => typeof s === 'string')
      : [],
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

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

export async function getSuperadminFormDefinitionsHandler(
  request: FastifyRequest<{ Querystring: { cityId?: string } }>,
  reply: FastifyReply
) {
  const session = getSession(request);
  if (!session || session.role !== 'superadmin' || session.isSuperadmin !== true) {
    return reply.status(403).send({ error: 'Forbidden' });
  }

  const cityId = request.query.cityId?.trim() || '';
  if (!cityId || !isUuid(cityId)) {
    return reply.status(400).send({ error: 'cityId query parameter must be a valid UUID' });
  }

  const { data: rows, error } = await supabase
    .from('form_definitions')
    .select(
      'id, city_id, name, slug, description, fields, required_attachments, trigger_doc_slugs, is_active, created_at, updated_at'
    )
    .eq('city_id', cityId)
    .order('created_at', { ascending: true });

  if (error) {
    request.log.error({ err: error }, 'superadmin form_definitions list failed');
    return reply.status(500).send({ error: 'Internal server error' });
  }

  return reply.send((rows ?? []).map(mapFormDefinitionRow));
}

export async function postSuperadminFormDefinitionsHandler(
  request: FastifyRequest<{ Body: FormDefinitionCreateBody }>,
  reply: FastifyReply
) {
  const session = getSession(request);
  if (!session || session.role !== 'superadmin' || session.isSuperadmin !== true) {
    return reply.status(403).send({ error: 'Forbidden' });
  }

  const body = request.body ?? ({} as FormDefinitionCreateBody);
  const { name, slug, description, fields, required_attachments, trigger_doc_slugs, city_id } = body;

  if (city_id == null || typeof city_id !== 'string' || !city_id.trim() || !isUuid(city_id.trim())) {
    return reply.status(400).send({ error: 'city_id must be a valid UUID' });
  }
  const cityIdTrim = city_id.trim();

  if (name == null || typeof name !== 'string' || !name.trim()) {
    return reply.status(400).send({ error: 'name is required' });
  }
  if (slug == null || typeof slug !== 'string' || !slug.trim()) {
    return reply.status(400).send({ error: 'slug is required' });
  }
  const slugTrim = slug.trim();
  if (!FORM_DEFINITION_SLUG_PATTERN.test(slugTrim)) {
    return reply.status(400).send({ error: 'slug must match pattern ^[a-z0-9-]+$' });
  }
  if (!Array.isArray(fields)) {
    return reply.status(400).send({ error: 'fields must be an array' });
  }
  if (!Array.isArray(required_attachments)) {
    return reply.status(400).send({ error: 'required_attachments must be an array' });
  }
  if (!Array.isArray(trigger_doc_slugs)) {
    return reply.status(400).send({ error: 'trigger_doc_slugs must be an array' });
  }
  if (!trigger_doc_slugs.every((s): s is string => typeof s === 'string')) {
    return reply.status(400).send({ error: 'trigger_doc_slugs must be a string array' });
  }

  if (description !== undefined && description !== null && typeof description !== 'string') {
    return reply.status(400).send({ error: 'description must be a string or null' });
  }
  const desc = description === undefined || description === null ? null : description;

  const { data: cityRow, error: cityErr } = await supabase
    .from('cities')
    .select('id')
    .eq('id', cityIdTrim)
    .maybeSingle();

  if (cityErr) {
    request.log.error({ err: cityErr }, 'superadmin form_definitions city lookup failed');
    return reply.status(500).send({ error: 'Internal server error' });
  }
  if (!cityRow) {
    return reply.status(400).send({ error: 'city not found' });
  }

  const { data: existing, error: existErr } = await supabase
    .from('form_definitions')
    .select('id')
    .eq('city_id', cityIdTrim)
    .eq('slug', slugTrim)
    .maybeSingle();

  if (existErr) {
    request.log.error({ err: existErr }, 'form_definitions duplicate check failed');
    return reply.status(500).send({ error: 'Internal server error' });
  }
  if (existing) {
    return reply.status(409).send({ error: 'Form definition with this slug already exists for this city' });
  }

  const { data: row, error: insertError } = await supabase
    .from('form_definitions')
    .insert({
      city_id: cityIdTrim,
      name: name.trim(),
      slug: slugTrim,
      description: desc,
      fields,
      required_attachments,
      trigger_doc_slugs,
      is_active: true,
    })
    .select(
      'id, city_id, name, slug, description, fields, required_attachments, trigger_doc_slugs, is_active, created_at, updated_at'
    )
    .single();

  if (insertError) {
    const isUnique =
      insertError.code === '23505' ||
      Boolean(insertError.message && insertError.message.includes('unique'));
    if (isUnique) {
      return reply.status(409).send({ error: 'Form definition with this slug already exists for this city' });
    }
    request.log.error({ err: insertError }, 'form_definitions insert failed');
    return reply.status(500).send({ error: 'Internal server error' });
  }

  return reply.status(201).send(mapFormDefinitionRow(row));
}

export async function putSuperadminFormDefinitionsHandler(
  request: FastifyRequest<{ Params: { id: string }; Body: FormDefinitionUpdateBody }>,
  reply: FastifyReply
) {
  const session = getSession(request);
  if (!session || session.role !== 'superadmin' || session.isSuperadmin !== true) {
    return reply.status(403).send({ error: 'Forbidden' });
  }

  const { id } = request.params;
  const body = request.body ?? {};

  const { data: current, error: fetchError } = await supabase
    .from('form_definitions')
    .select(
      'id, city_id, name, slug, description, fields, required_attachments, trigger_doc_slugs, is_active, created_at, updated_at'
    )
    .eq('id', id)
    .single();

  if (fetchError || !current) {
    return reply.status(404).send({ error: 'Form definition not found' });
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if ('name' in body && body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      return reply.status(400).send({ error: 'name must be a non-empty string' });
    }
    patch.name = body.name.trim();
  }

  if ('slug' in body && body.slug !== undefined) {
    if (typeof body.slug !== 'string' || !body.slug.trim()) {
      return reply.status(400).send({ error: 'slug must be a non-empty string' });
    }
    const newSlug = body.slug.trim();
    if (!FORM_DEFINITION_SLUG_PATTERN.test(newSlug)) {
      return reply.status(400).send({ error: 'slug must match pattern ^[a-z0-9-]+$' });
    }
    if (newSlug !== current.slug) {
      const { data: conflict, error: conflictErr } = await supabase
        .from('form_definitions')
        .select('id')
        .eq('city_id', current.city_id)
        .eq('slug', newSlug)
        .neq('id', id)
        .maybeSingle();

      if (conflictErr) {
        request.log.error({ err: conflictErr }, 'form_definitions slug conflict check failed');
        return reply.status(500).send({ error: 'Internal server error' });
      }
      if (conflict) {
        return reply.status(409).send({ error: 'Form definition with this slug already exists for this city' });
      }
    }
    patch.slug = newSlug;
  }

  if ('description' in body && body.description !== undefined) {
    if (body.description !== null && typeof body.description !== 'string') {
      return reply.status(400).send({ error: 'description must be a string or null' });
    }
    patch.description = body.description;
  }

  if ('fields' in body && body.fields !== undefined) {
    if (!Array.isArray(body.fields)) {
      return reply.status(400).send({ error: 'fields must be an array' });
    }
    patch.fields = body.fields;
  }

  if ('required_attachments' in body && body.required_attachments !== undefined) {
    if (!Array.isArray(body.required_attachments)) {
      return reply.status(400).send({ error: 'required_attachments must be an array' });
    }
    patch.required_attachments = body.required_attachments;
  }

  if ('trigger_doc_slugs' in body && body.trigger_doc_slugs !== undefined) {
    if (!Array.isArray(body.trigger_doc_slugs)) {
      return reply.status(400).send({ error: 'trigger_doc_slugs must be an array' });
    }
    if (!body.trigger_doc_slugs.every((s): s is string => typeof s === 'string')) {
      return reply.status(400).send({ error: 'trigger_doc_slugs must be a string array' });
    }
    patch.trigger_doc_slugs = body.trigger_doc_slugs;
  }

  if ('is_active' in body && body.is_active !== undefined) {
    if (typeof body.is_active !== 'boolean') {
      return reply.status(400).send({ error: 'is_active must be a boolean' });
    }
    patch.is_active = body.is_active;
  }

  const { data: row, error: updateError } = await supabase
    .from('form_definitions')
    .update(patch)
    .eq('id', id)
    .select(
      'id, city_id, name, slug, description, fields, required_attachments, trigger_doc_slugs, is_active, created_at, updated_at'
    )
    .single();

  if (updateError) {
    const isUnique =
      updateError.code === '23505' ||
      Boolean(updateError.message && updateError.message.includes('unique'));
    if (isUnique) {
      return reply.status(409).send({ error: 'Form definition with this slug already exists for this city' });
    }
    request.log.error({ err: updateError }, 'form_definitions update failed');
    return reply.status(500).send({ error: 'Internal server error' });
  }

  if (!row) {
    return reply.status(404).send({ error: 'Form definition not found' });
  }

  return reply.send(mapFormDefinitionRow(row));
}

export async function deleteSuperadminFormDefinitionsHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const session = getSession(request);
  if (!session || session.role !== 'superadmin' || session.isSuperadmin !== true) {
    return reply.status(403).send({ error: 'Forbidden' });
  }

  const { id } = request.params;

  const { data: current, error: fetchError } = await supabase
    .from('form_definitions')
    .select('id')
    .eq('id', id)
    .maybeSingle();

  if (fetchError) {
    request.log.error({ err: fetchError }, 'form_definitions delete fetch failed');
    return reply.status(500).send({ error: 'Internal server error' });
  }
  if (!current) {
    return reply.status(404).send({ error: 'Form definition not found' });
  }

  const { error: updateError } = await supabase
    .from('form_definitions')
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (updateError) {
    request.log.error({ err: updateError }, 'form_definitions soft delete failed');
    return reply.status(500).send({ error: 'Internal server error' });
  }

  return reply.send({ success: true });
}

export async function registerSuperadminRoutes(app: FastifyInstance) {
  app.get('/superadmin/cities', getSuperadminCitiesHandler);
  app.post('/superadmin/cities', createSuperadminCityHandler);
  app.patch('/superadmin/cities/:cityId/domains', updateSuperadminCityDomainsHandler);
  app.get('/superadmin/form-definitions', getSuperadminFormDefinitionsHandler);
  app.post('/superadmin/form-definitions', postSuperadminFormDefinitionsHandler);
  app.put('/superadmin/form-definitions/:id', putSuperadminFormDefinitionsHandler);
  app.delete('/superadmin/form-definitions/:id', deleteSuperadminFormDefinitionsHandler);
}
