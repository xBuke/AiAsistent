# Admin Dashboard 401 Error - Root Cause & Fix

## Root Cause (3 bullets)

1. **Cross-site cookie blocking**: In DEMO_MODE, cookies are set with `sameSite: 'strict'` (line 124 in `apps/api/src/routes/auth.ts`). When the frontend (`https://gradai.mangai.hr`) makes requests to the API (`https://asistent-api-nine.vercel.app`), browsers block cookies with `sameSite: 'strict'` because they're cross-site. This causes `getSession()` to return `null`, resulting in 401 Unauthorized.

2. **Cookie not sent in requests**: The `session` cookie (set by POST `/admin/login`) contains `{ cityId, cityCode, role }` and is required for all admin endpoints. Because the cookie is blocked, subsequent requests to `/admin/demo/inbox` have no session cookie, triggering 401 at line 214 in `apps/api/src/routes/adminRead.ts`.

3. **CORS allows credentials but cookie attributes prevent transmission**: While CORS is configured with `credentials: true` and the frontend uses `credentials: 'include'`, the cookie's `sameSite: 'strict'` attribute prevents the browser from sending it cross-site, regardless of CORS settings.

## Minimal Patch List

### File 1: `apps/api/src/routes/auth.ts`
**Line 120-127**: Change `sameSite: 'strict'` to `sameSite: 'none'` in DEMO_MODE

```typescript
// DEMO_MODE: Use cross-site cookie settings (secure: true, sameSite: none, maxAge: 2 hours)
// Note: sameSite: 'none' is required for cross-site cookies (gradai.mangai.hr -> asistent-api-nine.vercel.app)
const cookieOptions = isDemoMode
  ? {
      httpOnly: true,
      secure: true,
      sameSite: 'none' as const,  // Changed from 'strict'
      path: '/',
      maxAge: 60 * 60 * 2, // 2 hours
    }
```

**Line 150-162**: Update logout handler to use same cookie settings

```typescript
export async function logoutHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const isDemoMode = process.env.DEMO_MODE === 'true';
  reply.clearCookie('session', {
    httpOnly: true,
    secure: isDemoMode ? true : process.env.NODE_ENV === 'production',
    sameSite: isDemoMode ? ('none' as const) : ('lax' as const),  // Changed
    path: '/',
  });

  return reply.send({ success: true });
}
```

### File 2: `apps/api/src/server.ts`
**Line 18-31**: Explicitly allow production admin frontend origin in CORS (defensive, already allows all)

```typescript
await server.register(cors, {
  origin: (origin, callback) => {
    // Always allow http://localhost:5173 for admin frontend (required when credentials: true)
    if (origin === 'http://localhost:5173') {
      callback(null, true);
      return;
    }
    // DEMO_MODE: Explicitly allow production admin frontend origin
    if (process.env.DEMO_MODE === 'true' && origin === 'https://gradai.mangai.hr') {
      callback(null, true);
      return;
    }
    // Allow all other origins for widget endpoints (maintains existing behavior)
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});
```

## Manual Test Steps (Browser DevTools)

### 1. Clear existing cookies
- Open DevTools → Application → Cookies → `https://asistent-api-nine.vercel.app`
- Delete any existing `session` cookie

### 2. Login and verify cookie is set
- Navigate to `https://gradai.mangai.hr/admin/demo`
- Open DevTools → Network tab
- Enter password `demo-yc-x26` and login
- Find POST request to `/admin/login`
  - **Check Response Headers**: Should contain `Set-Cookie: session=...; HttpOnly; Secure; SameSite=None; Path=/`
  - **Verify**: `SameSite=None` is present (not `SameSite=Strict`)

### 3. Verify cookie is sent in subsequent requests
- After login, find GET request to `/admin/demo/inbox` (or any admin endpoint)
- **Check Request Headers**: Should contain `Cookie: session=...`
- **Verify**: Cookie is present and request returns 200 (not 401)

### 4. Verify CORS headers
- Check OPTIONS preflight (if any) or actual GET request
- **Response Headers should include**:
  - `Access-Control-Allow-Origin: https://gradai.mangai.hr` (or specific origin)
  - `Access-Control-Allow-Credentials: true`
- **Request Headers should include**:
  - `Origin: https://gradai.mangai.hr`

### 5. Test logout clears cookie
- Click logout
- Find POST request to `/admin/logout`
- **Check Response Headers**: Should contain `Set-Cookie: session=; ... SameSite=None; ... Max-Age=0` (clearing cookie)

## City Slug Usage Analysis

### Where cityCode/slug is used:

1. **Widget Chat** (`/grad/:cityId/chat`):
   - Parameter: `cityId` from URL path
   - Resolution: Tries `slug` first (line 114 in `chat.ts`), then falls back to `code` (uppercased)
   - Format: Can be slug (e.g., `demo`, `ploce`) or code (e.g., `DEMO`, `PLOCE`)

2. **Admin Inbox** (`/admin/:cityCode/inbox`):
   - Parameter: `cityCode` from URL path (e.g., `/admin/demo/inbox`)
   - Resolution: Tries `slug` first (line 89 in `adminRead.ts`), then falls back to `code` (uppercased)
   - Format: Frontend uses `cityId` from URL (`/admin/:cityId`) and passes it as `cityCode` to API

3. **Admin Dashboard Summary** (`/admin/dashboard/summary`):
   - Parameter: None in URL; uses `session.cityCode` from cookie
   - Resolution: Uses `resolveCity(session.cityCode)` (line 120 in `adminDashboard.ts`)
   - Format: Uses `cityCode` stored in session cookie (set during login)

4. **Admin Login** (`/admin/login`):
   - Parameter: `cityCode` in request body
   - Resolution: Tries `slug` first (line 49 in `auth.ts`), then falls back to `code` (uppercased)
   - Format: Frontend hardcodes `cityCode = 'demo'` (line 164 in `AdminApp.tsx`)

### Expected formats:
- **Demo mode**: `cityCode = 'demo'` (slug) or `'DEMO'` (code fallback)
- **Production**: `cityCode = 'ploce'` (slug) or `'PLOCE'` (code fallback)

### Could mismatch cause 401 or 404?
- **404**: Yes, if `cityCode` doesn't match any `slug` or `code` in DB
- **401**: No, 401 is only from missing/invalid session cookie. City resolution happens after auth check, so mismatched cityCode would cause 404 (city not found) or 403 (session.cityId doesn't match resolved city.id), not 401.

### Frontend → Backend flow:
1. User visits `/admin/demo` → Frontend extracts `cityId = 'demo'` from URL
2. Login: Frontend sends `cityCode = 'demo'` (hardcoded) to POST `/admin/login`
3. Backend resolves city by slug `'demo'` → Sets cookie with `cityCode = city.code` (from DB)
4. Subsequent requests: Frontend uses `cityId` (from URL) as `cityCode` in API calls (e.g., `/admin/demo/inbox`)
5. Backend validates session cookie, then resolves city from `cityCode` param, then verifies `session.cityId === resolved.city.id`

**Note**: The frontend uses `cityId` from URL params, but the backend expects `cityCode` in the path. Both resolve to the same value (`'demo'`), so no mismatch occurs.
