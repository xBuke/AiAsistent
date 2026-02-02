import { supabase } from '../db/supabase.js';
import { verifyPassword } from '../auth/password.js';
/**
 * POST /admin/login
 * Authenticate a user with city code and password
 */
export async function loginHandler(request, reply) {
    const body = request.body || {};
    const { cityCode } = body;
    // Extract password from request body with fallback
    const rawPassword = body.password ?? body.adminPassword ?? '';
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
        let matchType = 'slug';
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
        if (!hashToCheck) {
            return reply.status(401).send({ error: 'Invalid password' });
        }
        // Temporary debug log for password normalization
        request.log.info({
            rawPasswordLength: rawPassword.length,
            normalizedLength: password.length
        }, 'Password normalization');
        // Verify password (using normalized password)
        const isValid = await verifyPassword(password, hashToCheck);
        if (!isValid) {
            return reply.status(401).send({ error: 'Invalid password' });
        }
        // Create session cookie
        const session = {
            cityId: city.id,
            cityCode: city.code,
            role,
        };
        // Set httpOnly cookie
        reply.setCookie('session', JSON.stringify(session), {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 60 * 60 * 24 * 7, // 7 days
        });
        return reply.send({ success: true, cityId: city.id, cityCode: city.code, role });
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
    reply.clearCookie('session', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
    });
    return reply.send({ success: true });
}
/**
 * Register auth routes
 */
export async function registerAuthRoutes(server) {
    server.post('/admin/login', loginHandler);
    server.post('/admin/logout', logoutHandler);
}
