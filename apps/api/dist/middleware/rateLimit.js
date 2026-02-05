import rateLimit from '@fastify/rate-limit';
/**
 * Per-route rate limit configs for @fastify/rate-limit.
 * Use with route option: config: { rateLimit: CHAT_RATE_LIMIT } etc.
 * OPTIONS and /admin/* have no config → never rate limited.
 */
export const CHAT_RATE_LIMIT = {
    max: parseInt(process.env.RATE_LIMIT_CHAT_MAX || '20', 10),
    timeWindow: parseInt(process.env.RATE_LIMIT_CHAT_WINDOW_MS || '60000', 10),
};
export const EVENTS_RATE_LIMIT = {
    max: parseInt(process.env.RATE_LIMIT_EVENTS_MAX || '60', 10),
    timeWindow: parseInt(process.env.RATE_LIMIT_EVENTS_WINDOW_MS || '60000', 10),
};
/**
 * Login rate limit (DEMO_MODE only)
 * Only active when DEMO_MODE === 'true', otherwise undefined (no rate limiting)
 */
export const LOGIN_RATE_LIMIT = process.env.DEMO_MODE === 'true'
    ? {
        max: parseInt(process.env.RATE_LIMIT_LOGIN_MAX || '5', 10),
        timeWindow: parseInt(process.env.RATE_LIMIT_LOGIN_WINDOW_MS || '900000', 10), // 15 minutes
    }
    : undefined;
/**
 * Register @fastify/rate-limit once. Global: false → only routes with config.rateLimit
 * are limited. OPTIONS and /admin/* have no config → never limited.
 * Uses req.ip (trustProxy must be true for correct client IP behind proxy).
 */
export async function registerRateLimit(server) {
    await server.register(rateLimit, {
        global: false,
        keyGenerator: (req) => req.ip || req.socket?.remoteAddress || 'unknown',
        errorResponseBuilder: (_req, context) => ({
            statusCode: 429,
            error: 'Too many requests',
            message: 'Rate limit exceeded. Please try again later.',
            retryAfter: Math.ceil(context.ttl / 1000),
        }),
        onExceeded: (req, key) => {
            req.log.warn({ ip: key, path: req.url }, 'Rate limit exceeded');
        },
    });
}
