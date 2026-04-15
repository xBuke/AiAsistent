# Widget City Routing Audit — PROMPT_02

**Date:** 2025-02-12  
**Scope:** Widget initialization, request routing, city resolution, domain validation  
**Mode:** READ-ONLY (no code changes)

---

## 1) Widget Entry Files + How City Is Passed

### Entry Chain

| File | Role |
|------|------|
| `apps/web/src/widget/entry.ts` | Entry point, imports `init.ts` |
| `apps/web/src/widget/init.ts` | City resolution, `mountWidget()` |
| `apps/web/src/widget/WidgetApp.tsx` | Consumes `config.cityId` |

### City Resolution Logic (init.ts, lines 57–86)

**Order of precedence:**

1. **Production override** (lines 66–68): If `window.location.hostname` is `gradai.mangai.hr` or `civisai.mangai.hr` → `cityId = 'demo'` (hardcoded).
2. **URL parameter** (lines 71–75): `?city=X` from `URLSearchParams`.
3. **Script tag data attributes** (lines 78–80): `scriptTag.dataset.cityId` **or** `scriptTag.dataset.city`.
4. **Missing**: If still undefined → `console.warn` and early return (widget does not mount).

### data-city vs data-city-id

Both are supported. At line 79:

```typescript
cityId = scriptTag.dataset.cityId || scriptTag.dataset.city;
```

So `data-city="slug"` is read as a fallback after `data-city-id`.

### Embed Snippet Example

From `apps/web/index.html` (lines 29–34):

```html
<script
  src="/widget.js"
  data-api-base="/api"
  data-city-id="demo"
  defer
></script>
```

### WidgetApp Runtime Override

In `WidgetApp.tsx` (lines 126–128):

```typescript
const cityId = (typeof window !== 'undefined' && window.location.hostname === 'gradai.mangai.hr') 
  ? 'demo' 
  : config.cityId;
```

This forces `demo` on `gradai.mangai.hr` even if `config.cityId` differs.

---

## 2) Backend Entry Points + How City Is Resolved

### Chat

| Aspect | Value |
|--------|-------|
| Route | `POST /grad/:cityId/chat` |
| City source | URL path param `cityId` |
| Resolution | 1) `cities.slug`; 2) `cities.code` (uppercased) |
| File | `apps/api/src/routes/chat.ts` (lines 64, 135–155) |
| Response if invalid | 400 if missing; 404 `{ error: 'unknown_city' }` if not found |

### Events

| Aspect | Value |
|--------|-------|
| Route | `POST /grad/:cityId/events` |
| City source | URL path param `cityId` |
| Resolution | Same as chat (slug → code) |
| File | `apps/api/src/routes/events.ts` (lines 99, 123–152) |
| Response if invalid | 400 if missing; 404 `{ error: 'unknown_city' }` if not found |

### Forms (Submit & Draft)

| Aspect | Value |
|--------|-------|
| Routes | `POST /forms/submit`, `POST /forms/draft` |
| City source | Request body `city_slug` |
| Resolution | Same as chat (slug → code) |
| File | `apps/api/src/routes/forms.ts` (lines 46–49, 63–135; 245–259) |
| Response if invalid | 400 `city_slug is required`; 400 `City not found` if invalid |

### Forms (Attachments)

| Aspect | Value |
|--------|-------|
| Route | `POST /forms/:reference_number/attachments` |
| City source | Derived from `form_requests.city_id` (no `city_slug` param) |
| File | `apps/api/src/routes/forms.ts` (lines 395–436) |

### City Resolution Pattern (All Backends)

```typescript
// 1) Lookup by slug (exact match)
let { data: city } = await supabase
  .from('cities')
  .select('id, code')
  .eq('slug', cityId)  // or citySlug
  .single();

// 2) Fallback: lookup by code (uppercased)
if (cityError || !city) {
  const derivedCode = cityId.toUpperCase();
  const { data: cityByCode } = await supabase
    .from('cities')
    .select('id, code')
    .eq('code', derivedCode)
    .single();
  // ...
}
```

Note: `cities` table has `slug` column (added by `apps/api/scripts/setup-demo-city.sql` if missing).

---

## 3) Current Behavior if City Missing/Invalid

| Scenario | Widget | Chat | Events | Forms |
|----------|--------|------|--------|-------|
| City missing | Logs warn, does not mount | 400 Missing cityId | 400 Missing cityId | 400 city_slug required |
| City invalid (no DB match) | N/A | 404 unknown_city | 404 unknown_city | 400 City not found |
| City valid | Mounts with resolved `cityId` | Proceeds | Proceeds | Proceeds |

---

## 4) Current Behavior Regarding Allowed Domains

### Summary: No Domain Allowlist

There is no validation that requests come from allowed domains (e.g. `*.ploce.hr`) based on Host, Origin, or Referer.

### CORS Configuration

| Layer | Behavior |
|-------|----------|
| `apps/api/src/server.ts` (lines 19–37) | CORS allows `http://localhost:5173`; `https://gradai.mangai.hr` when `DEMO_MODE=true`; **all other origins allowed** (`callback(null, true)`) |
| `apps/api/src/routes/chat.ts` (lines 77–96) | `allowedOrigins` list: gradai.mangai.hr, localhost variants. Non-whitelisted origin is **still allowed**; only logs a warning |
| `apps/api/src/routes/events.ts` (lines 461–465) | OPTIONS handler echoes **any** `request.headers.origin` in `Access-Control-Allow-Origin` (or `*` if absent) |
| Forms routes | No Origin/Host/Referer checks |

### Database

`cities` schema (`apps/api/db/schema.sql`): no `allowed_domains` or similar column. Columns: `id`, `code`, `name`, `admin_password_hash`, `inbox_password_hash` (and `slug` via migration).

### Domain References in Codebase

`ploce.hr` appears only in:

- Document content / source URLs (`apps/api/data/docs/`, `apps/web/public/docs/`)
- Mock conversation content (`apps/web/src/admin/mock/conversations.ts`)

None of these are used for domain validation.

---

## 5) Gaps vs Desired

### Desired: `data-city` Required

| Desired | Current | Gap |
|---------|---------|-----|
| `data-city` required on embed | Optional; fallbacks: `?city=X`, `data-city-id`, `data-city` | City can come from URL param or dev overrides without `data-city` |
| Single source of truth | Multiple sources with precedence | Harder to enforce embeddability policy |

### Desired: Enforce Domain Allowlist Per City (Suffix Match)

| Desired | Current | Gap |
|---------|---------|-----|
| Per-city allowed domains (e.g. `*.ploce.hr`) | None | No `cities.allowed_domains` or equivalent |
| Host/Origin/Referer validation | No validation | Any domain can call widget endpoints |
| Reject non-allowed domains | N/A | No rejection logic |

### Suggested Implementations (Informational Only)

1. **Require data-city**: In `init.ts`, treat `data-city` (or `data-city-id`) as mandatory when not on production override hostnames; reject mounting otherwise.
2. **Domain allowlist**:
   - Add `allowed_domains` (or similar) column to `cities`.
   - Middleware/handler: resolve city (from path/body), then check that `Host`/`Origin`/`Referer` matches a configured domain suffix (e.g. `endsWith('ploce.hr')`).
   - Return 403 for non-allowed origins.

---

## Appendix: API Call Summary

| Endpoint | City in | Header/Query/Body | Domain check |
|----------|---------|-------------------|--------------|
| `POST /grad/:cityId/chat` | Path | Path param | None |
| `POST /grad/:cityId/events` | Path | Path param | None |
| `POST /forms/submit` | Body | `city_slug` in JSON body | None |
| `POST /forms/draft` | Body | `city_slug` in JSON body | None |
| `POST /forms/:ref/attachments` | N/A | City from `form_requests.city_id` | None |

Widget transport code:

- `apps/web/src/widget/transports/api.ts`: `POST ${apiBaseUrl}/grad/${cityId}/chat` (line 24)
- `apps/web/src/widget/utils/eventsClient.ts`: `POST ${apiBaseUrl}/grad/${cityId}/events` (line 47)
- `apps/web/src/widget/WidgetApp.tsx`: forms use `city_slug` in body via `buildNovorodenoSubmitPayload`, `buildJednokratnaSubmitPayload`
