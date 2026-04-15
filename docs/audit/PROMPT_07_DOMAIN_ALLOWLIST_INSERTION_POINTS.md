# Domain Allowlist Insertion Points Audit — PROMPT_07

**Date:** 2025-02-12  
**Scope:** Per-city allowed domains (suffix match like `*.ploce.hr`) — insertion points for widget, forms, admin  
**Mode:** READ-ONLY (no code changes)

---

## 1) Current CORS + Origin Behavior Summary

### Global CORS (`apps/api/src/server.ts` lines 19–37)

| Behavior | Details |
|----------|---------|
| **Plugin** | `@fastify/cors` with `credentials: true` |
| **Origin callback** | `callback(null, true)` for all origins after explicit checks |
| **Explicit allows** | `http://localhost:5173` always; `https://gradai.mangai.hr` when `DEMO_MODE=true` |
| **Fallback** | All other origins allowed (`callback(null, true)`) |
| **Methods** | `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS` |
| **Allowed headers** | `Content-Type`, `Authorization` |

**Risk:** Any origin can send credentialed cross-origin requests. No per-city domain enforcement.

### Per-Route CORS / OPTIONS Handlers

| Route | File | Lines | Behavior |
|-------|------|-------|----------|
| `OPTIONS /grad/:cityId/chat` | `chat.ts` | 858–893 | Uses `allowedOrigins` list; non-whitelisted origin **still allowed** with warning; echoes `origin` in `Access-Control-Allow-Origin` |
| `POST /grad/:cityId/chat` | `chat.ts` | 75–110 | Same logic: `allowedOrigin = origin` for non-whitelisted; only logs `Request from non-whitelisted origin` |
| `OPTIONS /grad/:cityId/events` | `events.ts` | 455–467 | Echoes **any** `request.headers.origin` or `*` if absent; no allowlist |
| `POST /grad/:cityId/events` | `events.ts` | — | No CORS headers set in handler; relies on global CORS |
| `/forms/*` | `forms.ts` | — | No Origin/Host/Referer checks; no per-route CORS overrides |

### Chat `allowedOrigins` (chat.ts 76–82)

```ts
['https://gradai.mangai.hr', 'http://localhost:5173', 'http://localhost:3000',
 'http://127.0.0.1:5173', 'http://127.0.0.1:3000']
```

**Note:** `civisai.mangai.hr` is not listed; non-whitelisted origins are still accepted (with a log warning).

### Why Current CORS Is Risky for Production

1. **No per-city domain enforcement** — Any site (malicious or third-party) can embed the widget or call APIs if it knows `cityId` / `city_slug`.
2. **CSRF / abuse** — Chat, events, and forms are writable from any origin; no verification that the request comes from a city’s official site (e.g. `www.ploce.hr`, `grad.ploce.hr`).
3. **Data exfiltration** — Public PDF endpoint `GET /forms/:reference_number/pdf` returns PDFs to any origin; anyone with a reference number can fetch it.
4. **Credentials enabled** — `credentials: true` allows cookies to be sent cross-origin; without strict origin checks this amplifies risk.
5. **Events OPTIONS echoes any origin** — Reflects back whatever `Origin` the client sends, which enables arbitrary sites to pass preflight and call `POST /grad/:cityId/events`.

---

## 2) Recommended Enforcement Strategy (Host / Origin / Referer Precedence)

### Header Precedence for Domain Extraction

| Priority | Header | Notes |
|----------|--------|-------|
| 1 | `Origin` | Present on cross-origin requests (CORS, fetch, XHR). Most reliable for browser requests. |
| 2 | `Referer` | Present on navigations and some subrequests. Can be stripped by Referrer-Policy. |
| 3 | `Host` | Target host of the API; not the page origin. Only useful when widget and API share a domain or when using a reverse proxy that forwards Host. |

**Recommended logic:**

1. Extract domain from `Origin` if present (parse URL, use hostname).
2. Fallback to `Referer` hostname if `Origin` is absent.
3. Do not rely on `Host` for origin validation (it identifies the API host, not the page embedding the widget).
4. For same-origin or server-side clients (no Origin/Referer), define policy: reject, allow with API key, or allow only for specific paths (e.g. server-side form submission).

### Suffix Match Rule (e.g. `*.ploce.hr`)

- **Stored value:** `ploce.hr` or `*.ploce.hr` (stored as a suffix pattern).
- **Check:** `extractedHost.endsWith(allowedSuffix)` or `extractedHost === allowedSuffix`.
- **Normalize:** Lowercase, strip port, handle `*.ploce.hr` → `ploce.hr`.

---

## 3) Exact Endpoints That Must Enforce Allowlist

### Widget Requests (chat / events)

| Method | Endpoint | City from | Must enforce allowlist? |
|--------|----------|-----------|-------------------------|
| `OPTIONS` | `/grad/:cityId/chat` | Path `cityId` | **Yes** — preflight must match POST policy |
| `POST` | `/grad/:cityId/chat` | Path `cityId` | **Yes** |
| `OPTIONS` | `/grad/:cityId/events` | Path `cityId` | **Yes** |
| `POST` | `/grad/:cityId/events` | Path `cityId` | **Yes** |

City is known from path; can fetch `cities.allowed_domains` (or equivalent) and validate `Origin`/`Referer` before processing.

### Forms Submit / Draft / Attachments

| Method | Endpoint | City from | Must enforce allowlist? |
|--------|----------|-----------|-------------------------|
| `POST` | `/forms/submit` | Body `city_slug` | **Yes** |
| `POST` | `/forms/draft` | Body `city_slug` | **Yes** |
| `POST` | `/forms/:reference_number/attachments` | `form_requests.city_id` (DB lookup) | **Yes** — resolve city from form_request first |
| `GET` | `/forms/:reference_number/pdf` | None (reference only) | **Yes** — optionally; currently anyone with ref can fetch |

For attachments, city comes from `form_request.city_id`; resolve city, then check allowed domains.

### Admin (city session–bound)

| Method | Endpoint | City binding | Allowlist gap? |
|--------|----------|---------------|----------------|
| `POST` | `/admin/login` | N/A (unauthenticated) | Origin check optional; login is not city-scoped |
| `GET` | `/admin/dashboard/summary` | Session `cityId` | No — session-bound |
| `GET` | `/admin/tickets` | Session `cityId` | No |
| `GET` | `/admin/:cityCode/inbox` | Session `cityId` validated | No |
| `GET` | `/admin/forms` | Session present, **no city filter** | **Yes** — returns forms from all cities; should filter by `session.cityId` |
| `GET` | `/admin/forms/:reference_number/pdf` | Session present, **no city check** | **Yes** — admin for city A can fetch PDF for city B form |
| `GET` | `/admin/forms/:reference_number/attachments` | Session present, **no city check** | **Yes** |
| `GET` | `/admin/forms/:reference_number/attachments/:id/signed-url` | Session present, **no city check** | **Yes** |

**Admin gaps (not domain allowlist, but city scoping):**

- `GET /admin/forms` — does not filter by `city_id`; returns forms from all cities.
- `GET /admin/forms/:reference_number/*` — no validation that `form_request.city_id` matches `session.cityId`.

Domain allowlist is less critical for admin because access is already session-protected; the main admin gap is city scoping on forms routes.

---

## 4) Proposed Middleware vs Per-Route Checks (Pros / Cons)

### Option A: Global Middleware (Pre-Handler)

**Logic:** Run before handlers; match path/body to resolve city; check `Origin`/`Referer` against `cities.allowed_domains`.

| Pros | Cons |
|------|------|
| Single place for allowlist logic | City resolution differs per route (path vs body vs DB) |
| Consistent behavior across endpoints | Must handle routes with no city (e.g. `/health`, `/admin/login`) |
| Easy to add logging/metrics | OPTIONS needs same logic; middleware runs for both OPTIONS and POST |
| | Some routes (attachments) need DB lookup to get city — harder in pure middleware |

### Option B: Per-Route Checks (Inside Handlers)

**Logic:** Each handler (or shared helper) resolves city, fetches allowed domains, validates `Origin`/`Referer`, returns 403 if invalid.

| Pros | Cons |
|------|------|
| City resolution already done in each handler | Duplication across chat, events, forms |
| No need to skip irrelevant routes | OPTIONS handlers must call same helper |
| Explicit and easy to trace | Risk of forgetting a route |

### Option C: Shared Helper + Hook / Decorator

**Logic:** Create `validateAllowedOrigin(request, cityIdOrSlug)` used at the start of each public handler and OPTIONS handler. Resolves city, loads `allowed_domains`, checks Origin/Referer.

| Pros | Cons |
|------|------|
| Single implementation, reused | Still need to call it in each route |
| Clear insertion points | Same as Option B for coverage |
| Easy to unit test | |

### Recommendation

**Option C (shared helper):**

1. Add `checkDomainAllowlist(request, cityIdOrSlug, citySource: 'path'|'body'|'form_request')` in `apps/api/src/middleware/` or `apps/api/src/utils/`.
2. Call it at the very start of:
   - `chatHandler`, `chatOptionsHandler`
   - `eventsHandler`, `eventsOptionsHandler`
   - `formsSubmitHandler`, `formsDraftHandler`, `formsAttachmentsUploadHandler`
   - Optionally: `getFormPdfHandler`
3. On failure: return `403` and do not process the request.
4. Database: add `allowed_domains` (e.g. `TEXT[]` or JSONB) to `cities`; each value is a suffix like `ploce.hr` or `*.ploce.hr`.

**Why not full middleware:** Routes obtain city from different sources (path, body, DB). A generic middleware would need to inspect path params and body, which adds complexity. A shared helper called explicitly in each handler keeps logic centralized while matching how city is already resolved.

---

## Appendix: Request Headers Usage Today

| Header | Used in | Purpose |
|--------|---------|---------|
| `Origin` | `server.ts`, `chat.ts`, `events.ts` | CORS `Access-Control-Allow-Origin`; chat/events allowed origin selection |
| `Host` | Not used | — |
| `Referer` | Not used | — |

---

## Appendix: Current `cities` Schema (Relevant Columns)

From `apps/api/db/schema.sql`:

- `id`, `code`, `name`, `admin_password_hash`, `inbox_password_hash`, `created_at`
- `slug` (via migration)

**Missing:** `allowed_domains` or equivalent. Must be added (e.g. `allowed_domains TEXT[]` or `allowed_domains JSONB`) for per-city suffix patterns like `['ploce.hr', 'www.ploce.hr']` or `['*.ploce.hr']`.
