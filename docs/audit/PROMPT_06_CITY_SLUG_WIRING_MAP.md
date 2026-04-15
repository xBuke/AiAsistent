# City Slug/Code Wiring Map — Audit

**Scope:** End-to-end map of how city slug/code flows through widget, backend, admin, and DB.  
**Mode:** READ-ONLY. No code modified.  
**Date:** 2025-02-12

---

## 1) Embed Contract

### Recommended snippet(s) and required attributes

**Minimum required:**
- `data-city` **or** `data-city-id` (slug or code; both supported as fallbacks)

**Recommended for production (external embedding):**
```html
<script
  src="https://your-domain/widget.js"
  data-city="demo"
  data-api-base="https://api.example.com"
  defer
></script>
```

**Alternative (data-city-id has same semantics):**
```html
<script
  src="https://your-domain/widget.js"
  data-city-id="demo"
  data-api-base="https://api.example.com"
  defer
></script>
```

**Optional attributes:**
- `data-api-base` or `data-api-base-url` — API base URL (required for chat/events/forms)
- `data-lang` — language override
- `data-primary`, `data-secondary`, `data-logo` — theme customisation

**Fallbacks (in order):**
1. Host override: on `gradai.mangai.hr` or `civisai.mangai.hr` → `cityId = 'demo'` (overrides everything)
2. `?city=X` URL query param
3. `data-city-id` then `data-city` on script tag
4. If missing → widget does not mount, logs warning

**Source:** `apps/web/src/widget/init.ts` lines 59–86

---

## 2) Widget Flow

### Where slug is read, stored, and used

| Step | File | Approx lines | Description |
|------|------|---------------|-------------|
| Read | `init.ts` | 62–80 | `cityId` from host override → `?city=` → `scriptTag.dataset.cityId` \|\| `scriptTag.dataset.city` |
| Store | `init.ts` | 95–104 | Passed to `mountWidget({ cityId, apiBaseUrl, lang, theme })` |
| Override (runtime) | `WidgetApp.tsx` | 126–129 | If hostname `gradai.mangai.hr` → `cityId = 'demo'` else `config.cityId` (note: `civisai.mangai.hr` not checked here; init already sets demo) |
| Chat API | `transports/api.ts` | 15, 24 | `POST ${apiBaseUrl}/grad/${cityId}/chat` |
| Events API | `utils/eventsClient.ts` | 38–47 | `POST ${apiBaseUrl}/grad/${cityId}/events` |
| Form submit (novorodeno) | `WidgetApp.tsx` | 54–58, 439 | `buildNovorodenoSubmitPayload(cityId, ...)` → body `city_slug: citySlug` |
| Form submit (jednokratna) | `WidgetApp.tsx` | 90–93, 504 | `buildJednokratnaSubmitPayload(cityId, ...)` → body `city_slug: citySlug` |
| Form draft | `NovorodenoDijeteWizard.tsx` | 190 | `POST /forms/draft` body `{ city_slug: citySlug, ... }` |
| Form draft | `JednokratnaNovcanaPomocWizard.tsx` | 213 | Same |
| `emitConversationStart` | `WidgetApp.tsx` | 242, 255, 270, etc. | Passes `cityId` to events client |

**Note:** Widget uses `cityId` for chat/events (path param) and `citySlug` / `city_slug` for forms (body). Both refer to the same value (slug or code).

---

## 3) Backend Flow

### Per endpoint: city source, resolution, missing/invalid handling

| Endpoint | File | City source | Resolution | Missing | Invalid |
|---------|------|-------------|------------|---------|---------|
| `POST /admin/login` | `auth.ts` | Body `cityCode` | slug first, then code (uppercased) | 400 Missing required fields | 404 City not found |
| `POST /grad/:cityId/chat` | `chat.ts` | Params `cityId` | slug first, then code | 400 Missing cityId | 404 unknown_city |
| `POST /grad/:cityId/events` | `events.ts` | Params `cityId` | slug first, then code | 400 Missing cityId | 404 unknown_city |
| `POST /forms/submit` | `forms.ts` | Body `city_slug` | slug first, then code | 400 city_slug required | 400 City not found |
| `POST /forms/draft` | `forms.ts` | Body `city_slug` | slug first, then code | 400 city_slug required | 400 City not found |
| `GET /admin/:cityCode/inbox` | `adminRead.ts` | Params `cityCode` | `resolveCity(cityCode)` | N/A (404 if not found) | 404 City not found; 403 if session.cityId ≠ city.id |
| `GET /admin/:cityCode/conversations` | `adminRead.ts` | Params `cityCode` | same | same | same |
| `GET /admin/:cityCode/conversations/:uuid` | `adminRead.ts` | Params `cityCode` | same | same | same |
| `GET /admin/:cityCode/conversations/:uuid/messages` | `adminRead.ts` | Params `cityCode` | same | same | same |
| `POST /admin/:cityCode/.../notes` | `adminRead.ts` | Params `cityCode` | same | same | same |
| `PATCH /admin/:cityCode/conversations/:uuid` | `adminRead.ts` | Params `cityCode` | same | same | same |
| `GET /admin/:cityCode/tickets` | `adminRead.ts` | Params `cityCode` | same | same | same |
| `PATCH /admin/:cityCode/tickets/:uuid` | `adminRead.ts` | Params `cityCode` | same | same | same |
| `GET /admin/:cityCode/reports` | `adminRead.ts` | Params `cityCode` | same | same | same |
| `GET /admin/:cityCode/.../title` | `adminRead.ts` | Params `cityCode` | same | same | same |
| `GET /admin/dashboard/summary` | `adminDashboard.ts` | Session cookie | `resolveCity(session.cityCode)` or direct `session.cityId` | 401 Unauthorized | 404 City not found; 403 if mismatch |

**City resolution pattern (shared):**
1. Lookup `cities` by `slug` (exact match)
2. Fallback: lookup by `code` (uppercased input)
3. Return `{ id, code }` or null

**Location of helpers:**
- `adminRead.ts` lines 84–107: `resolveCity(cityCode)`
- `adminDashboard.ts` lines 55–77: `resolveCity(cityCode)`
- `auth.ts` lines 46–66: inline
- `chat.ts` lines 132–154: inline
- `events.ts` lines 119–152: inline
- `forms.ts` lines 120–137, 261–275: inline
- `events.ts` lines 488–501: `updateConversationFallback` — same pattern

---

## 4) Data Layer

### Tables touched per endpoint and city-scoped fields

| Endpoint | Tables | City-scoped fields |
|----------|--------|---------------------|
| `POST /admin/login` | `cities` | Read: id, code, admin_password_hash, inbox_password_hash |
| `POST /grad/:cityId/chat` | `cities`, `conversations`, `messages`, `tickets` | All filtered by `city_id` |
| `POST /grad/:cityId/events` | `cities`, `conversations`, `tickets` | All filtered by `city_id` |
| `POST /forms/submit` | `cities`, `form_requests`, `form_request_attachments` | `form_requests.city_id` |
| `POST /forms/draft` | `cities`, `form_requests` | `form_requests.city_id` |
| `GET /admin/:cityCode/*` | `cities`, `conversations`, `tickets`, `messages` | All via `city_id` |
| `GET /admin/dashboard/summary` | `cities`, `conversations`, `tickets` | All via `city_id` |

**City-scoped tables:**
- `cities` — id, slug, code (lookup keys)
- `conversations` — city_id
- `messages` — via conversation_id → conversations.city_id
- `tickets` — conversation_id → conversations.city_id; also city_id where used
- `form_requests` — city_id
- `form_request_attachments` — via form_request_id → form_requests.city_id

---

## 5) Hardcoded "demo" Overrides

### Complete list with location and impact

| Location | File | Approx lines | What | Impact |
|----------|------|-------------|------|--------|
| Host override | `init.ts` | 66–69 | `hostname === 'gradai.mangai.hr' \|\| 'civisai.mangai.hr'` → `cityId = 'demo'` | Forces demo city on production hostnames regardless of embed attributes |
| Runtime override | `WidgetApp.tsx` | 126–129 | `hostname === 'gradai.mangai.hr'` → `cityId = 'demo'` | Redundant for gradai (init already sets demo); civisai uses config.cityId (which init sets to demo) |
| Login body | `AdminApp.tsx` | 165 | `const cityCode = 'demo'` in handleLogin | Login always uses demo; route param `cityId` ignored for auth |
| Debug password | `auth.ts` | 96–98 | `DEMO_MODE === 'true'` && `password === 'demo-yc-x26'` | Bypasses hash check for demo admin |
| Redirects | `App.tsx` | 2755–2756 | `/admin`, `/admin/login` → `/admin/demo` | All admin entry points land on demo |
| Embed default | `index.html` | 33 | `data-city-id="demo"` on widget script | Default for main app embed |
| Admin label | `init.ts` | 143, 179 | `label.textContent = 'Widget građanina (demo)'` | Cosmetic label on admin routes |
| CORS | `server.ts` | 27–28 | `DEMO_MODE && origin === 'https://gradai.mangai.hr'` → allow | Allows production admin origin |
| Chat CORS | `chat.ts` | 79, 867 | `allowedOrigins` includes `https://gradai.mangai.hr` | Chat OPTIONS/POST allow gradai (non-whitelisted still allowed with warning) |

**Note:** `civisai.mangai.hr` is not in `chat.ts` allowedOrigins; events OPTIONS echoes any origin. Non-whitelisted origins are still allowed (with a warning) in chat.

**SQL scripts (demo city setup, not runtime overrides):**
- `setup-demo-city.sql` — ensures `slug='demo'`, `code='DEMO'` city exists
- `cleanup-and-setup-demo-v1.sql` — demo city references for seed data
- `set-demo-password.ts` — sets hash for demo city

---

## 6) Gaps vs Target

### Target behaviours

| Target | Current | Gap |
|--------|---------|-----|
| **data-city mandatory** | Optional with fallbacks (`?city=`, `data-city-id`, host override) | City can come from URL param or hostname without `data-city`; widget still mounts |
| **No hostname override to demo in production** | `gradai.mangai.hr` and `civisai.mangai.hr` force `cityId = 'demo'` | Any embedding on these hosts will always use demo, regardless of config |
| **Admin login uses /admin/:citySlug** | Route is `/admin/:cityId`; login hardcodes `cityCode = 'demo'` | Visiting `/admin/zagreb` still logs in as demo; route param only used for post-login API paths (inbox, conversations, etc.) |
| **Host/Origin/Referer validation** | None on widget endpoints | Any origin can call chat/events/forms |
| **civisai in CORS** | `gradai.mangai.hr` in server.ts and chat.ts; `civisai` not in chat allowedOrigins | civisai requests may hit "non-whitelisted" warning but are still allowed |

### Summary of gaps

1. **Embed:** `data-city` is not enforced; host override and `?city=` bypass it.
2. **Production override:** Hostnames `gradai.mangai.hr` and `civisai.mangai.hr` always force demo.
3. **Admin login:** `handleLogin` ignores route param; always sends `cityCode = 'demo'`.
4. **Security:** No Host/Origin/Referer checks on widget API calls.
5. **CORS:** `civisai.mangai.hr` not explicitly in chat allowedOrigins (but non-whitelisted origins are still accepted).

---

## Appendix: File/Line Quick Reference

| Component | File | Key lines |
|-----------|------|-----------|
| Widget init | `apps/web/src/widget/init.ts` | 59–97, 143, 179 |
| Widget runtime | `apps/web/src/widget/WidgetApp.tsx` | 52–93, 126–129, 242, 439, 504, 633, 703 |
| Chat transport | `apps/web/src/widget/transports/api.ts` | 15, 24 |
| Events client | `apps/web/src/widget/utils/eventsClient.ts` | 38–47 |
| Form wizards | `JednokratnaNovcanaPomocWizard.tsx`, `NovorodenoDijeteWizard.tsx` | 190, 213 |
| Auth | `apps/api/src/routes/auth.ts` | 27–71, 96–98 |
| Chat | `apps/api/src/routes/chat.ts` | 64–154, 76–96, 866–891 |
| Events | `apps/api/src/routes/events.ts` | 99–152, 456–470 |
| Forms | `apps/api/src/routes/forms.ts` | 46–50, 120–137, 245–259 |
| Admin read | `apps/api/src/routes/adminRead.ts` | 61–107, 213–234, 1481–1490 |
| Admin dashboard | `apps/api/src/routes/adminDashboard.ts` | 32–77, 104–139 |
| Server CORS | `apps/api/src/server.ts` | 19–37 |
| Admin app | `apps/web/src/admin/AdminApp.tsx` | 44, 158–166, 302–316 |
| Admin client | `apps/web/src/admin/api/adminClient.ts` | 19–24, 76–77, 89–90 |
| App routes | `apps/web/src/App.tsx` | 2754–2756 |
| Index embed | `apps/web/index.html` | 29–34 |
