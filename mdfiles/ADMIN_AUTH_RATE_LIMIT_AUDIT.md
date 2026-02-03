# Admin Auth & Rate Limiting Demo Risk Audit

**Date:** 2026-02-03  
**Scope:** Admin authentication, rate limiting, session/cookie security for demo deployment

---

## 1. Admin Login Method

### Current Implementation
- **Method:** Password-based authentication with bcrypt hashing
- **Storage:** Passwords stored as `admin_password_hash` and `inbox_password_hash` in Supabase `cities` table
- **Session:** Cookie-based sessions (httpOnly cookies)
- **Location:** `apps/api/src/routes/auth.ts`

### Authentication Flow
1. Client sends `POST /admin/login` with `{ cityCode, password, role }`
2. Server resolves city by slug first, then falls back to code (uppercased)
3. Password verified against bcrypt hash from database
4. Session cookie created with `{ cityId, cityCode, role }`
5. Cookie set with httpOnly, secure (production only), sameSite: 'lax'

### Admin Route Protection
- All admin routes use `getSession()` helper to validate session cookie
- Routes check `session.role === 'admin'` for admin-only endpoints
- Routes validate `session.cityId` matches requested city
- **Location:** `apps/api/src/routes/adminRead.ts`, `apps/api/src/routes/adminDashboard.ts`

---

## 2. Default Demo Credentials

### ✅ Default Credentials Exist
- **cityCode:** `"demo"` (or `"DEMO"`)
- **password:** `"demo"`
- **role:** `"admin"`

### Setup Scripts
- **SQL:** `apps/api/scripts/setup-demo-city.sql` - Creates demo city
- **Node:** `apps/api/scripts/set-demo-password.ts` - Sets password hash to "demo"
- **Documentation:** `apps/api/scripts/SETUP_DEMO_CITY.md`

### Risk Level: 🔴 HIGH
- Default credentials are **publicly documented** in codebase
- Anyone can login with `cityCode="demo"` and `password="demo"`
- No IP restrictions or additional demo-only protections

---

## 3. Rate Limiting Settings

### Chat Endpoint (`POST /grad/:cityId/chat`)
- **Current:** 20 requests/minute per IP
- **Config:** `RATE_LIMIT_CHAT_MAX=20`, `RATE_LIMIT_CHAT_WINDOW_MS=60000`
- **Status:** ✅ Rate limited
- **Location:** `apps/api/src/middleware/rateLimit.ts`, `apps/api/src/routes/chat.ts`

### Events Endpoint (`POST /grad/:cityId/events`)
- **Current:** 60 requests/minute per IP
- **Config:** `RATE_LIMIT_EVENTS_MAX=60`, `RATE_LIMIT_EVENTS_WINDOW_MS=60000`
- **Status:** ✅ Rate limited
- **Location:** `apps/api/src/middleware/rateLimit.ts`, `apps/api/src/routes/events.ts`

### Admin Endpoints (`/admin/*`)
- **Current:** ❌ **NO rate limiting**
- **Rationale:** Intentionally excluded (per `RATE_LIMIT_AUDIT.md`)
- **Endpoints affected:**
  - `POST /admin/login` - **CRITICAL: No rate limiting on login endpoint**
  - `POST /admin/logout`
  - `GET /admin/:cityCode/*` (all admin read routes)
  - `GET /admin/dashboard/*` (all dashboard routes)
  - `PATCH /admin/:cityCode/*` (admin write routes)

### Risk Level: 🔴 HIGH
- **Login endpoint unprotected** - vulnerable to brute force attacks
- **Admin endpoints unprotected** - vulnerable to DoS attacks
- Default demo credentials + no rate limiting = easy target for abuse

---

## 4. Session/Cookie Settings

### Current Cookie Configuration
**Location:** `apps/api/src/routes/auth.ts:110-116`

```typescript
reply.setCookie('session', JSON.stringify(session), {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',  // ⚠️ ISSUE
  sameSite: 'lax',
  path: '/',
  maxAge: 60 * 60 * 24, // 1 day (source) vs 7 days (dist) - ⚠️ INCONSISTENCY
});
```

### Issues Identified

#### 🔴 Issue 1: `secure` Flag Conditional on NODE_ENV
- **Problem:** `secure: true` only when `NODE_ENV === 'production'`
- **Risk:** On Vercel, if `NODE_ENV` is not explicitly set to `"production"`, cookies will be sent over HTTP
- **Impact:** Session cookies vulnerable to interception on non-HTTPS connections
- **Vercel Note:** Vercel sets `NODE_ENV=production` by default, but this is fragile

#### 🟡 Issue 2: `sameSite: 'lax'`
- **Current:** `sameSite: 'lax'`
- **Risk:** Moderate - allows cookies on top-level navigations (GET requests)
- **Better for demo:** `sameSite: 'strict'` provides better CSRF protection
- **Trade-off:** May break if admin frontend is on different domain/subdomain

#### 🟡 Issue 3: MaxAge Inconsistency
- **Source code:** `maxAge: 60 * 60 * 24` (1 day)
- **Dist code:** `maxAge: 60 * 60 * 24 * 7` (7 days)
- **Risk:** Low - but indicates build/deployment inconsistency

#### 🟡 Issue 4: No Vercel-Specific Cookie Configuration
- **Current:** No `vercel.json` cookie/header overrides
- **Risk:** Low - relies on Fastify cookie plugin defaults
- **Note:** Vercel may strip/modify cookies in edge functions

---

## 5. DEMO_MODE Usage

### Current State
- **DEMO_MODE** is only used in `apps/api/src/routes/chat.ts` for fallback LLM behavior
- **Not used** for authentication, rate limiting, or cookie security
- **Location:** `apps/api/src/routes/chat.ts:231`

### Risk
- No demo-specific security hardening
- Same security settings for demo and production

---

## 6. Risks That Could Break a Demo

### 🔴 CRITICAL Risks

#### Risk 1: Brute Force Attack on Login
- **Vulnerability:** `POST /admin/login` has no rate limiting
- **Impact:** Attacker can attempt unlimited login attempts
- **Demo Impact:** 
  - Demo credentials (`demo`/`demo`) can be brute-forced (though simple, still vulnerable)
  - Database load from excessive login attempts
  - Potential account lockout if implemented later
- **Severity:** HIGH

#### Risk 2: Default Credentials Publicly Known
- **Vulnerability:** Default credentials documented in codebase
- **Impact:** Anyone can login to demo admin panel
- **Demo Impact:**
  - Unauthorized access to admin dashboard
  - Data tampering/deletion
  - Service disruption
- **Severity:** HIGH

#### Risk 3: Admin Endpoints DoS
- **Vulnerability:** No rate limiting on admin endpoints
- **Impact:** Attacker can flood admin endpoints with requests
- **Demo Impact:**
  - Admin panel becomes unusable
  - Database connection exhaustion
  - Cost spikes (if using pay-per-request services)
- **Severity:** MEDIUM-HIGH

#### Risk 4: Cookie Security on Vercel
- **Vulnerability:** `secure` flag depends on `NODE_ENV`
- **Impact:** If `NODE_ENV` is not `"production"`, cookies sent over HTTP
- **Demo Impact:**
  - Session hijacking if HTTP is used
  - Unauthorized admin access
- **Severity:** MEDIUM (Vercel uses HTTPS by default, but fragile)

### 🟡 MODERATE Risks

#### Risk 5: Session Cookie Theft
- **Vulnerability:** `sameSite: 'lax'` allows cookies on GET requests
- **Impact:** CSRF attacks possible on GET endpoints
- **Demo Impact:** Unauthorized data access via CSRF
- **Severity:** MEDIUM

#### Risk 6: Long-Lived Sessions
- **Vulnerability:** Sessions last 1-7 days (inconsistent)
- **Impact:** Stolen sessions remain valid for extended period
- **Demo Impact:** Extended unauthorized access window
- **Severity:** LOW-MEDIUM

---

## 7. Minimal Fixes Behind DEMO_MODE=true

### Fix 1: Rate Limit Admin Login Endpoint (DEMO_MODE)
**Location:** `apps/api/src/routes/auth.ts`

```typescript
// Add to loginHandler, before password verification
if (process.env.DEMO_MODE === 'true') {
  // Rate limit: 5 attempts per 15 minutes per IP
  // Implementation: Use existing rateLimit middleware or add simple in-memory counter
}
```

**Minimal Implementation:**
- Add rate limit config for `/admin/login` when `DEMO_MODE=true`
- Use existing `@fastify/rate-limit` plugin
- Set to 5 attempts per 15 minutes per IP

### Fix 2: Stricter Cookie Settings (DEMO_MODE)
**Location:** `apps/api/src/routes/auth.ts:110-116`

```typescript
reply.setCookie('session', JSON.stringify(session), {
  httpOnly: true,
  secure: process.env.DEMO_MODE === 'true' ? true : (process.env.NODE_ENV === 'production'),
  sameSite: process.env.DEMO_MODE === 'true' ? 'strict' : 'lax',
  path: '/',
  maxAge: process.env.DEMO_MODE === 'true' ? 60 * 60 * 2 : (60 * 60 * 24), // 2 hours for demo
});
```

**Changes:**
- Force `secure: true` when `DEMO_MODE=true`
- Use `sameSite: 'strict'` for demo (better CSRF protection)
- Shorter session duration (2 hours) for demo

### Fix 3: Rate Limit Admin Endpoints (DEMO_MODE)
**Location:** `apps/api/src/middleware/rateLimit.ts`

```typescript
export const ADMIN_RATE_LIMIT = process.env.DEMO_MODE === 'true' ? {
  max: parseInt(process.env.RATE_LIMIT_ADMIN_MAX || '30', 10),
  timeWindow: parseInt(process.env.RATE_LIMIT_ADMIN_WINDOW_MS || '60000', 10),
} : undefined;
```

**Then apply to admin routes:**
- Add rate limit config to admin route registrations when `DEMO_MODE=true`
- Set to 30 requests/minute per IP (more lenient than chat, but still protected)

### Fix 4: Login Attempt Logging (DEMO_MODE)
**Location:** `apps/api/src/routes/auth.ts`

```typescript
// Log failed login attempts when DEMO_MODE=true
if (process.env.DEMO_MODE === 'true' && !isValid) {
  request.log.warn({
    ip: request.ip,
    cityCode,
    role,
    timestamp: new Date().toISOString(),
  }, 'Failed login attempt in demo mode');
}
```

**Purpose:** Monitor and detect brute force attempts

### Fix 5: Admin Endpoint Rate Limiting Registration
**Location:** `apps/api/src/routes/adminRead.ts`, `apps/api/src/routes/adminDashboard.ts`

```typescript
// In registerAdminReadRoutes and registerAdminDashboardRoutes
const rateLimitConfig = process.env.DEMO_MODE === 'true' 
  ? { config: { rateLimit: ADMIN_RATE_LIMIT } }
  : {};

server.get('/admin/:cityCode/inbox', rateLimitConfig, getInboxHandler);
// ... apply to all admin routes
```

---

## 8. Implementation Checklist

### Minimal Changes Required (No Refactor)

- [ ] **Fix 1:** Add rate limiting to `/admin/login` when `DEMO_MODE=true`
  - File: `apps/api/src/routes/auth.ts`
  - Add rate limit config: 5 attempts per 15 minutes
  - Use existing `@fastify/rate-limit` plugin

- [ ] **Fix 2:** Stricter cookie settings when `DEMO_MODE=true`
  - File: `apps/api/src/routes/auth.ts`
  - Force `secure: true`
  - Use `sameSite: 'strict'`
  - Reduce `maxAge` to 2 hours

- [ ] **Fix 3:** Add rate limiting config for admin endpoints
  - File: `apps/api/src/middleware/rateLimit.ts`
  - Export `ADMIN_RATE_LIMIT` config (30 req/min)

- [ ] **Fix 4:** Apply rate limiting to admin routes when `DEMO_MODE=true`
  - Files: `apps/api/src/routes/adminRead.ts`, `apps/api/src/routes/adminDashboard.ts`
  - Conditionally add rate limit config to route registrations

- [ ] **Fix 5:** Add failed login attempt logging when `DEMO_MODE=true`
  - File: `apps/api/src/routes/auth.ts`
  - Log failed attempts with IP, cityCode, timestamp

- [ ] **Fix 6:** Fix maxAge inconsistency
  - File: `apps/api/src/routes/auth.ts`
  - Ensure source and dist match (use 1 day consistently)

---

## 9. Environment Variables

### Required for Demo Mode Fixes

```bash
# Enable demo mode security hardening
DEMO_MODE=true

# Optional: Override rate limits for demo
RATE_LIMIT_ADMIN_MAX=30          # Admin endpoints per minute
RATE_LIMIT_ADMIN_WINDOW_MS=60000 # Admin window (1 minute)
RATE_LIMIT_LOGIN_MAX=5           # Login attempts per window
RATE_LIMIT_LOGIN_WINDOW_MS=900000 # Login window (15 minutes)
```

---

## 10. Testing Recommendations

### Demo Mode Security Tests

1. **Login Rate Limiting:**
   ```bash
   # Should fail after 5 attempts
   for i in {1..6}; do
     curl -X POST https://demo-api.vercel.app/admin/login \
       -H "Content-Type: application/json" \
       -d '{"cityCode":"demo","password":"wrong"}'
   done
   ```

2. **Admin Endpoint Rate Limiting:**
   ```bash
   # Should fail after 30 requests/minute
   # (Requires valid session cookie)
   ```

3. **Cookie Security:**
   - Verify `Secure` flag is set in production
   - Verify `SameSite=Strict` when `DEMO_MODE=true`
   - Verify session expires after 2 hours in demo mode

4. **Session Validation:**
   - Verify admin routes reject requests without valid session
   - Verify admin routes reject requests with wrong cityId

---

## 11. Summary

### Current State
- ✅ Password-based auth with bcrypt
- ✅ Session cookies with httpOnly
- ✅ Admin routes protected by session validation
- ✅ Chat/Events endpoints rate limited
- ❌ **No rate limiting on admin endpoints**
- ❌ **No rate limiting on login endpoint**
- ⚠️ **Default demo credentials publicly documented**
- ⚠️ **Cookie security depends on NODE_ENV**

### Critical Risks for Demo
1. **Brute force on login** (no rate limiting)
2. **Default credentials** (publicly known)
3. **Admin endpoint DoS** (no rate limiting)
4. **Cookie security** (fragile NODE_ENV check)

### Minimal Fixes (DEMO_MODE=true)
1. Rate limit `/admin/login` (5 attempts / 15 min)
2. Rate limit admin endpoints (30 req / min)
3. Stricter cookies (`secure: true`, `sameSite: 'strict'`, 2h expiry)
4. Failed login logging
5. Fix maxAge inconsistency

### Files to Modify
- `apps/api/src/routes/auth.ts` - Login handler, cookie settings
- `apps/api/src/middleware/rateLimit.ts` - Add admin rate limit config
- `apps/api/src/routes/adminRead.ts` - Apply rate limiting to routes
- `apps/api/src/routes/adminDashboard.ts` - Apply rate limiting to routes

---

**Note:** This audit is analysis-only. No code changes have been made. All fixes should be implemented behind `DEMO_MODE=true` flag to avoid affecting production behavior.
