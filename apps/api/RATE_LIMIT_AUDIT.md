# Rate Limiting Audit Report

## Findings

### Existing Rate Limiting
- **Status**: ❌ **NO rate limiting was found**
- **Search Results**: 
  - Searched for "rate", "limit", "express-rate-limit", "429", "too many requests"
  - No rate limiting middleware or logic found in the codebase
  - No rate limiting packages installed

### Current Endpoint Status
- `POST /grad/:cityId/chat` (SSE streaming): **No rate limiting**
- `POST /grad/:cityId/events`: **No rate limiting**
- `OPTIONS` preflight requests: **Not rate limited** (correct behavior)
- Admin endpoints (`/admin/*`): **Not rate limited** (intentional)

### Server Configuration
- Server framework: **Fastify** (not Express)
- Deployment: **Vercel** (requires proxy trust)
- Proxy trust: **Not configured** (needed for correct IP detection)

## Fix

### Changes Made

1. **Installed `@fastify/rate-limit` package**
   - Added to `apps/api/package.json`

2. **Created rate limiting middleware** (`apps/api/src/middleware/rateLimit.ts`)
   - Chat endpoint: 20 requests/minute per IP
   - Events endpoint: 60 requests/minute per IP
   - Configurable via environment variables
   - Skips OPTIONS requests (CORS preflight)
   - Skips admin routes
   - Uses IP address for rate limiting (handles proxy correctly)

3. **Applied rate limiting to routes**
   - `apps/api/src/routes/chat.ts`: Registered chat rate limiter
   - `apps/api/src/routes/events.ts`: Registered events rate limiter

4. **Configured proxy trust** (`apps/api/src/server.ts`)
   - Set `trustProxy: true` for Vercel deployment
   - Enables correct IP detection from `X-Forwarded-For` header

### Rate Limit Configuration

**Chat Endpoint** (`POST /grad/:cityId/chat`):
- Default: 20 requests per minute per IP
- Env vars: `RATE_LIMIT_CHAT_MAX`, `RATE_LIMIT_CHAT_WINDOW_MS`
- Returns 429 JSON before SSE streaming starts

**Events Endpoint** (`POST /grad/:cityId/events`):
- Default: 60 requests per minute per IP
- Env vars: `RATE_LIMIT_EVENTS_MAX`, `RATE_LIMIT_EVENTS_WINDOW_MS`
- Returns 429 JSON response

### Implementation Details

- Rate limiting runs **before** route handlers (prevents SSE from starting if limit exceeded)
- OPTIONS requests are explicitly skipped (CORS preflight works)
- Admin routes are excluded via skip function
- IP detection works correctly behind Vercel proxy
- Error responses include `retryAfter` field (seconds until reset)

## Changed Files

1. `apps/api/package.json` - Added `@fastify/rate-limit` dependency
2. `apps/api/src/middleware/rateLimit.ts` - **NEW** - Rate limiting configuration
3. `apps/api/src/server.ts` - Added `trustProxy: true`
4. `apps/api/src/routes/chat.ts` - Registered chat rate limiter
5. `apps/api/src/routes/events.ts` - Registered events rate limiter

## How to Run

1. **Install dependencies:**
   ```bash
   cd apps/api
   npm install
   ```

2. **Build (optional):**
   ```bash
   npm run build
   ```

3. **Start server:**
   ```bash
   npm run dev
   ```

4. **Test rate limiting:**
   See `RATE_LIMIT_TEST.md` for detailed test commands

## Acceptance Checklist

- [ ] Sending >20 `/chat` requests in a minute from same IP returns 429 (before streaming starts)
- [ ] Sending >60 `/events` requests in a minute from same IP returns 429
- [ ] OPTIONS preflight is not blocked/rate-limited
- [ ] Normal usage still works (streaming not interrupted)
- [ ] Admin endpoints unaffected

### Testing Instructions

See `RATE_LIMIT_TEST.md` for detailed curl commands to verify each checklist item.

## Environment Variables

Optional overrides (defaults are safe for V1):
- `RATE_LIMIT_CHAT_MAX=20` - Chat requests per window
- `RATE_LIMIT_CHAT_WINDOW_MS=60000` - Chat window in milliseconds
- `RATE_LIMIT_EVENTS_MAX=60` - Events requests per window
- `RATE_LIMIT_EVENTS_WINDOW_MS=60000` - Events window in milliseconds

## Notes

- Rate limiting is **per-IP address**
- Counters reset after the time window expires
- The implementation is minimal and does not refactor existing architecture
- No new dependencies beyond `@fastify/rate-limit` (standard Fastify plugin)
- SSE streaming is protected (rate limit checked before stream starts)
