import { supabase } from '../db/supabase.js';
import { verifyPassword } from '../auth/password.js';
import { LOGIN_RATE_LIMIT } from '../middleware/rateLimit.js';
async function resolveCity(cityCode) {
    let { data: city, error: cityError } = await supabase
        .from('cities')
        .select('id, code, slug')
        .eq('slug', cityCode)
        .single();
    if (cityError || !city) {
        const derivedCode = cityCode.toUpperCase();
        const { data: cityByCode, error: codeError } = await supabase
            .from('cities')
            .select('id, code, slug')
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
 * POST /admin/login
 * Authenticate a user with city code and password
 */
export async function loginHandler(request, reply) {
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
    try {
        const isDemoMode = process.env.DEMO_MODE === 'true';
        if (cityCode === 'superadmin') {
            const { data: superadmin, error: superadminError } = await supabase
                .from('superadmins')
                .select('password_hash')
                .limit(1)
                .maybeSingle();
            if (superadminError || !superadmin?.password_hash) {
                return reply.status(401).send({ error: 'Invalid password' });
            }
            const isValid = await verifyPassword(password, superadmin.password_hash);
            if (!isValid) {
                return reply.status(401).send({ error: 'Invalid password' });
            }
            reply.setCookie('session', JSON.stringify({ isSuperadmin: true, role: 'superadmin' }), isDemoMode
                ? {
                    httpOnly: true,
                    secure: true,
                    sameSite: 'none',
                    path: '/',
                    maxAge: 60 * 60 * 2,
                }
                : {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'lax',
                    path: '/',
                    maxAge: 60 * 60 * 24,
                });
            return reply.send({ role: 'superadmin', userName: 'Superadmin' });
        }
        const city = await resolveCity(cityCode);
        if (!city) {
            return reply.status(404).send({ error: 'City not found' });
        }
        const { data: cityUsers, error: cityUsersError } = await supabase
            .from('city_users')
            .select('id, name, role, password_hash')
            .eq('city_id', city.id);
        if (cityUsersError || !cityUsers?.length) {
            return reply.status(401).send({ error: 'Invalid password' });
        }
        let matchedUser = null;
        for (const user of cityUsers) {
            if (!user.password_hash) {
                continue;
            }
            const isValid = await verifyPassword(password, user.password_hash);
            if (isValid) {
                matchedUser = user;
                break;
            }
        }
        if (!matchedUser) {
            return reply.status(401).send({ error: 'Invalid password' });
        }
        const session = {
            cityId: city.id,
            cityCode: city.slug || city.code,
            role: matchedUser.role,
            userId: matchedUser.id,
            userName: matchedUser.name,
        };
        // Set httpOnly cookie
        // DEMO_MODE: Use cross-site cookie settings (secure: true, sameSite: none, maxAge: 2 hours)
        // Note: sameSite: 'none' is required for cross-site cookies (gradai.mangai.hr -> asistent-api-nine.vercel.app)
        const cookieOptions = isDemoMode
            ? {
                httpOnly: true,
                secure: true,
                sameSite: 'none',
                path: '/',
                maxAge: 60 * 60 * 2, // 2 hours
            }
            : {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                path: '/',
                maxAge: 60 * 60 * 24, // 1 day
            };
        reply.setCookie('session', JSON.stringify(session), cookieOptions);
        return reply.send({ role: matchedUser.role, userName: matchedUser.name, userId: matchedUser.id });
    }
    catch (error) {
        request.log.error(error);
        return reply.status(500).send({ error: 'Internal server error' });
    }
}
/**
 * POST /admin/logout
 * Clear the session cookie
 */
export async function logoutHandler(request, reply) {
    const isDemoMode = process.env.DEMO_MODE === 'true';
    reply.clearCookie('session', {
        httpOnly: true,
        secure: isDemoMode ? true : process.env.NODE_ENV === 'production',
        sameSite: isDemoMode ? 'none' : 'lax',
        path: '/',
    });
    return reply.send({ success: true });
}
/**
 * Register auth routes
 */
export async function registerAuthRoutes(server) {
    server.post('/admin/login', {
        config: {
            rateLimit: LOGIN_RATE_LIMIT,
        },
    }, loginHandler);
    server.post('/admin/logout', logoutHandler);
}
