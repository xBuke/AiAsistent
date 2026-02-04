import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { supabase } from '../db/supabase.js';
import { verifyPassword } from '../auth/password.js';
import { LOGIN_RATE_LIMIT } from '../middleware/rateLimit.js';

interface LoginBody {
  cityCode: string;
  password: string;
  role?: 'admin' | 'inbox';
}

interface SessionCookie {
  cityId: string;
  cityCode: string;
  role: 'admin' | 'inbox';
}

/**
 * POST /admin/login
 * Authenticate a user with city code and password
 */
export async function loginHandler(
  request: FastifyRequest<{ Body: LoginBody }>,
  reply: FastifyReply
) {
  const body = request.body || {};
  const { cityCode } = body;

  // Extract password from request body
  const rawPassword = body.password ?? '';

  // Normalize password (trim whitespace)
  const password = rawPassword.trim();

  // Validate required fields
  if (!cityCode || !password) {
    return reply.status(400).send({ error: 'Missing required fields: cityCode, password' });
  }

  // Default role to "admin" if undefined or empty
  const role = body.role === 'inbox' ? 'inbox' : 'admin';

  try {
    // A) Resolve city by slug first, then fallback to code (consistent with /events)
    // 1) Try lookup by slug (exact match)
    let { data: city, error: cityError } = await supabase
      .from('cities')
      .select('id, code, admin_password_hash, inbox_password_hash')
      .eq('slug', cityCode)
      .single();

    let matchType: 'slug' | 'code' | null = 'slug';

    // 2) Fallback: try by code (uppercased)
    if (cityError || !city) {
      const derivedCode = cityCode.toUpperCase();
      const { data: cityByCode, error: codeError } = await supabase
        .from('cities')
        .select('id, code, admin_password_hash, inbox_password_hash')
        .eq('code', derivedCode)
        .single();
      
      if (codeError || !cityByCode) {
        return reply.status(404).send({ error: 'City not found' });
      }
      city = cityByCode;
      matchType = 'code';
    }

    // Debug log before password verification
    request.log.info({ cityCode, matchType, role }, 'City resolved, verifying password');

    // Compute hash to check based on role
    const hashToCheck = role === 'admin' 
      ? city.admin_password_hash 
      : city.inbox_password_hash;

    // Safe debug log (no full password or hash)
    request.log.info({
      role,
      hashPresent: !!hashToCheck,
      hashPrefix: hashToCheck ? hashToCheck.slice(0, 4) : null,
      hashLen: hashToCheck ? hashToCheck.length : 0
    }, 'Hash check details');

    // Temporary debug log for password normalization
    request.log.info({
      rawPasswordLength: rawPassword.length,
      normalizedLength: password.length
    }, 'Password normalization');

    // DEMO_MODE: Check hardcoded admin password first
    const isDemoMode = process.env.DEMO_MODE === 'true';
    let isValid = false;
    
    if (isDemoMode && role === 'admin') {
      // In DEMO_MODE, admin password is hardcoded (bypass hash check)
      isValid = password === 'demo-yc-x26';
    } else {
      // Normal password verification requires hash
      if (!hashToCheck) {
        return reply.status(401).send({ error: 'Invalid password' });
      }
      isValid = await verifyPassword(password, hashToCheck);
    }

    if (!isValid) {
      return reply.status(401).send({ error: 'Invalid password' });
    }

    // Create session cookie
    const session: SessionCookie = {
      cityId: city.id,
      cityCode: city.code,
      role,
    };

    // Set httpOnly cookie
    // DEMO_MODE: Use cross-site cookie settings (secure: true, sameSite: none, maxAge: 2 hours)
    // Note: sameSite: 'none' is required for cross-site cookies (gradai.mangai.hr -> asistent-api-nine.vercel.app)
    const cookieOptions = isDemoMode
      ? {
          httpOnly: true,
          secure: true,
          sameSite: 'none' as const,
          path: '/',
          maxAge: 60 * 60 * 2, // 2 hours
        }
      : {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax' as const,
          path: '/',
          maxAge: 60 * 60 * 24, // 1 day
        };
    
    reply.setCookie('session', JSON.stringify(session), cookieOptions);

    return reply.send({ success: true, cityId: city.id, cityCode: city.code, role });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ error: 'Internal server error' });
  }
}

/**
 * POST /admin/logout
 * Clear the session cookie
 */
export async function logoutHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const isDemoMode = process.env.DEMO_MODE === 'true';
  reply.clearCookie('session', {
    httpOnly: true,
    secure: isDemoMode ? true : process.env.NODE_ENV === 'production',
    sameSite: isDemoMode ? ('none' as const) : ('lax' as const),
    path: '/',
  });

  return reply.send({ success: true });
}

/**
 * Register auth routes
 */
export async function registerAuthRoutes(server: FastifyInstance) {
  // Apply rate limiting only if LOGIN_RATE_LIMIT is defined (DEMO_MODE only)
  if (LOGIN_RATE_LIMIT) {
    server.post('/admin/login', {
      config: {
        rateLimit: LOGIN_RATE_LIMIT,
      },
    }, loginHandler);
  } else {
    server.post('/admin/login', loginHandler);
  }
  server.post('/admin/logout', logoutHandler);
}
