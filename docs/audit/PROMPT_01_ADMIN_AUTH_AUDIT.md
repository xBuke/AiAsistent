# Admin Authentication Audit — PROMPT_01

**Date:** 2025-02-12  
**Scope:** Admin auth flow for `/admin` and `/admin/:cityId`  
**Mode:** READ-ONLY (no code changes)

---

## 1) Key Files and Line References

| Purpose | Path | Approx Lines | Notes |
|---------|------|--------------|-------|
| Login handler | `apps/api/src/routes/auth.ts` | 22–143 | POST /admin/login |
| Logout handler | `apps/api/src/routes/auth.ts` | 149–163 | POST /admin/logout |
| Auth route registration | `apps/api/src/routes/auth.ts` | 167–179 | Rate limit wiring |
| Session validation (adminRead) | `apps/api/src/routes/adminRead.ts` | 61–78, 213–235 | getSession + cityId match |
| Session validation (adminDashboard) | `apps/api/src/routes/adminDashboard.ts` | 32–50, 104–139 | getSession + cityId match |
| Auth middleware (unused) | `apps/api/src/auth/middleware.ts` | 12–81 | requireAdminSession, requireInboxSession |
| Rate limit config | `apps/api/src/middleware/rateLimit.ts` | 19–27, 34–48 | LOGIN_RATE_LIMIT (DEMO_MODE only) |
| Password verify | `apps/api/src/auth/password.ts` | 1–24 | bcrypt compare |
| Cookie plugin | `apps/api/src/server.ts` | 3, 40 | @fastify/cookie |
| Admin App (frontend) | `apps/web/src/admin/AdminApp.tsx` | 44–75, 157–180, 184–223 | Route param cityId, login flow |
| Admin client (API calls) | `apps/web/src/admin/api/adminClient.ts` | 1–28 | adminLogin, credentials |
| Login form | `apps/web/src/admin/LoginForm.tsx` | 1–129 | Password input only |
| Cities schema | `apps/api/db/schema.sql` | 8–16 | code, admin_password_hash, inbox_password_hash |
| Cities slug (migrations) | `apps/api/scripts/setup-demo-city.sql` | 5–17, 46–50 | slug added if missing |

---

## 2) Request/Response Contract for Login & Logout

### POST /admin/login

**Request:**
- **Method:** POST
- **Body:** `{ cityCode: string, password: string, role?: 'admin' | 'inbox' }`
- **Content-Type:** application/json
- **Credentials:** Must send `credentials: 'include'` for cookie to be set

**Responses:**

| Status | Body | When |
|--------|------|------|
| 200 | `{ success: true, cityId, cityCode, role }` | Auth success; session cookie set |
| 400 | `{ error: 'Missing required fields: cityCode, password' }` | Missing cityCode or password |
| 401 | `{ error: 'Invalid password' }` | Wrong password or missing hash |
| 404 | `{ error: 'City not found' }` | cityCode resolves to no city |
| 429 | `{ statusCode: 429, error: 'Too many requests', message: '...', retryAfter }` | Rate limit exceeded (DEMO_MODE only) |
| 500 | `{ error: 'Internal server error' }` | Server error |

**Cookie set on success:**
- **Name:** `session`
- **Value:** JSON string: `{ cityId: string, cityCode: string, role: 'admin' | 'inbox' }`
- **Options:**
  - DEMO_MODE: `httpOnly`, `secure`, `sameSite: 'none'`, `path: '/'`, `maxAge: 7200` (2h)
  - Normal: `httpOnly`, `secure` (prod), `sameSite: 'lax'`, `path: '/'`, `maxAge: 86400` (24h)

### POST /admin/logout

**Request:**
- **Method:** POST
- **Credentials:** Should use `credentials: 'include'` so cookie is sent and cleared correctly

**Responses:**
- **200** `{ success: true }` — Cookie cleared

**Note:** The frontend currently does **not** call POST /admin/logout. Logout button only sets `setIsAuthenticated(false)`; session cookie remains.

---

## 3) How citySlug / cityCode Is Determined and Enforced

### At Login (auth.ts)

- Client sends `cityCode` in the body (slug or code).
- Server resolves city by:
  1. `slug` (exact match) in cities table
  2. Fallback: `code` (uppercased cityCode)
- Session cookie stores: `cityId` (UUID), `cityCode` (from cities.code), `role`.

### At Protected Endpoints

- **adminRead.ts** (e.g. `/admin/:cityCode/inbox`):
  - `cityCode` from URL path.
  - Resolve city by slug then code (same as login).
  - Validate: `session.cityId === city.id` → 403 if mismatch.
- **adminDashboard.ts** (e.g. `/admin/dashboard/summary`):
  - No cityCode in path; uses `session.cityCode` or `session.cityId` to resolve city.
  - Validate: `session.cityId === city.id`.

### Frontend

- Route: `/admin/:cityId` (param is `cityId` but used as slug/code).
- In `AdminApp.tsx`, `handleLogin` **hardcodes** `cityCode = 'demo'` regardless of `cityId` from URL:
  ```ts
  const cityCode = 'demo';
  const ok = await adminLogin({ cityCode, password, role: 'admin' });
  ```
- Inbox, Conversations, etc. pass `cityId` from `useParams` to API as `cityCode` (e.g. `fetchInbox(cityCode)` where `cityCode = cityId`).

**Summary:**
- Session is bound to one city (`cityId` in cookie).
- Each protected request checks `session.cityId === resolved_city.id`.
- Frontend login always uses `demo`; route param is only used for API calls after login.

---

## 4) Current Security Protections

### Rate Limiting

- **DEMO_MODE only:** `LOGIN_RATE_LIMIT` is set when `DEMO_MODE === 'true'`.
  - Default: 5 requests per 15 minutes per IP.
  - Configurable via `RATE_LIMIT_LOGIN_MAX`, `RATE_LIMIT_LOGIN_WINDOW_MS`.
- **Non-DEMO:** `LOGIN_RATE_LIMIT` is `undefined`; no rate limit on login.

### Lockout

- **None.** No account lockout or per-city lockout after N failed attempts.
- Only rate limiting (when enabled) slows repeated attempts.

### Other Protections

- Passwords stored as bcrypt hashes (`admin_password_hash`, `inbox_password_hash`).
- Session cookie is httpOnly.
- Session structure validated (cityId, cityCode, role).

---

## 5) Gaps vs Desired Behavior

| Desired | Current | Gap |
|--------|---------|-----|
| One login per city at /admin/:citySlug | Login hardcodes `cityCode = 'demo'`; route param ignored for auth | Login does not use route param as city |
| Session MUST be bound to citySlug | Session includes cityId/cityCode; endpoints check `session.cityId === city.id` | **Satisfied** on the backend |
| Rate-limit + lockout after N failures | Rate limit only in DEMO_MODE; no lockout | Rate limit missing in non-DEMO; no lockout |
| Logout clears server session | Frontend only clears local state; does not call POST /admin/logout | Session cookie persists after "logout" |

### Detailed Gaps

1. **Login cityCode vs route:** Frontend should pass `cityId` (or equivalent slug/code) from URL to login, not `'demo'`, so `/admin/zagreb` uses Zagreb credentials.

2. **Rate limiting:** Login rate limiting should be active in production, not only in DEMO_MODE.

3. **Lockout:** Add lockout (e.g. per-city or per-IP) after N failed attempts.  
   **UNKNOWN:** Storage for attempt counts and lockout state. No table found; would need design and implementation.

4. **Logout:** On Logout click, call POST /admin/logout with `credentials: 'include'` before clearing local auth state.

5. **Global vs per-city:** Backend supports per-city passwords; frontend is effectively demo-only.  
   **UNKNOWN:** Whether a "global" admin password is intended for any environment.

---

## Appendix: Session Cookie Shape

```ts
interface SessionCookie {
  cityId: string;   // UUID from cities.id
  cityCode: string; // cities.code (e.g. 'DEMO')
  role: 'admin' | 'inbox';
}
```

---

## Appendix: Route Summary

| Route | Auth | citySlug/cityCode source |
|-------|------|--------------------------|
| POST /admin/login | None | Request body `cityCode` |
| POST /admin/logout | None | N/A |
| GET /admin/:cityCode/inbox | Session cookie | URL param; validated vs session.cityId |
| GET /admin/:cityCode/conversations | Session cookie | URL param; validated |
| GET /admin/:cityCode/tickets | Session cookie | URL param; validated |
| GET /admin/dashboard/summary | Session cookie | session.cityCode / session.cityId |
| GET /admin/forms | Session cookie | session only |
