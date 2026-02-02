# Rate Limiting Test Instructions

## Overview

Rate limiting uses `@fastify/rate-limit`, registered **once** in `server.ts` via `registerRateLimit(server)` (see `apps/api/src/middleware/rateLimit.ts`). Per-route config:

- **POST /grad/:cityId/chat** → `config.rateLimit: { max: 20, timeWindow: 60000 }` (20 req/min per IP)
- **POST /grad/:cityId/events** → `config.rateLimit: { max: 60, timeWindow: 60000 }` (60 req/min per IP)

OPTIONS and /admin/* have **no** `config.rateLimit` → never rate limited. Limiter runs in `onRequest` **before** the handler → 429 is sent **before** any SSE for /chat.

## Prerequisites

1. Start the API: `cd apps/api && npm run dev`
2. Set `BASE=http://localhost:3000` and `CITY=ploca` (or your city ID).

---

## Acceptance Checklist

### 1. 25 rapid /chat → ≥5 return 429, before SSE begins

```bash
BASE=http://localhost:3000
CITY=ploca
n=0
for i in $(seq 1 25); do
  code=$(curl -s -o /tmp/chat_resp.txt -w "%{http_code}" -X POST "$BASE/grad/$CITY/chat" \
    -H "Content-Type: application/json" \
    -d '{"message":"test"}')
  if [ "$code" = "429" ]; then n=$((n+1)); fi
done
echo "429 count: $n (expect >= 5)"
# Verify 429 has no SSE: 21st request is 429; body must not contain "data:"
for _ in $(seq 1 20); do curl -s -o /dev/null -X POST "$BASE/grad/$CITY/chat" -H "Content-Type: application/json" -d '{"message":"x"}'; done
curl -s -X POST "$BASE/grad/$CITY/chat" -H "Content-Type: application/json" -d '{"message":"x"}' > /tmp/chat_429.txt
grep -q "data:" /tmp/chat_429.txt && echo "FAIL: 429 response contained SSE data" || echo "OK: 429 had no SSE"
```

**Expected:** `429 count: >= 5`, and "OK: 429 had no SSE" (429 happens before stream starts).

### 2. 70 rapid /events → ≥10 return 429

```bash
BASE=http://localhost:3000
CITY=ploca
n=0
for i in $(seq 1 70); do
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/grad/$CITY/events" \
    -H "Content-Type: application/json" \
    -d '{"type":"message","role":"user","content":"test"}')
  if [ "$code" = "429" ]; then n=$((n+1)); fi
done
echo "429 count: $n (expect >= 10)"
```

**Expected:** `429 count: >= 10`.

### 3. OPTIONS never return 429

```bash
BASE=http://localhost:3000
CITY=ploca
n=0
for i in $(seq 1 100); do
  code=$(curl -s -o /dev/null -w "%{http_code}" -X OPTIONS "$BASE/grad/$CITY/chat" \
    -H "Origin: http://localhost:5173" \
    -H "Access-Control-Request-Method: POST")
  if [ "$code" = "429" ]; then n=$((n+1)); fi
done
echo "OPTIONS 429 count: $n (expect 0)"
```

**Expected:** `OPTIONS 429 count: 0`. All should be 204.

### 4. /admin routes are not rate limited

```bash
# Admin endpoints have no config.rateLimit → never limited.
# (May 401 without cookie, but must NOT 429 from rate limiting.)
curl -s -o /dev/null -w "%{http_code}\n" -X GET "http://localhost:3000/admin/ploca/conversations"
# Expect 401 (unauthorized) or 200 (if logged in), never 429
```

**Expected:** 401 or 200, **never** 429.

---

## Windows (PowerShell)

Use `curl.exe` (Windows 10+); PowerShell's `curl` is an alias for Invoke-WebRequest. Use `-o NUL` (not `$null`) so `-w "%{http_code}"` is captured correctly. Or use **Git Bash** / **WSL** to run the bash loops above.

Create body files to avoid JSON escaping issues:
```powershell
'{"message":"test"}' | Out-File -Encoding utf8 tmp_chat.json
'{"type":"message","role":"user","content":"test"}' | Out-File -Encoding utf8 tmp_events.json
```

```powershell
$base = "http://localhost:3000"
$city = "ploca"

# Chat 429 count (expect >= 5)
$n = 0; 1..25 | ForEach-Object {
  $c = (curl.exe -s -o NUL -w "%{http_code}" -X POST "$base/grad/$city/chat" -H "Content-Type: application/json" -d "@tmp_chat.json")
  if ($c -eq "429") { $n++ }
}; "429 count: $n (expect >= 5)"

# Events 429 count (expect >= 10)
$n = 0; 1..70 | ForEach-Object {
  $c = (curl.exe -s -o NUL -w "%{http_code}" -X POST "$base/grad/$city/events" -H "Content-Type: application/json" -d "@tmp_events.json")
  if ($c -eq "429") { $n++ }
}; "429 count: $n (expect >= 10)"

# OPTIONS never 429 (expect 0)
$n = 0; 1..100 | ForEach-Object {
  $c = (curl.exe -s -o NUL -w "%{http_code}" -X OPTIONS "$base/grad/$city/chat" -H "Origin: http://localhost:5173")
  if ($c -eq "429") { $n++ }
}; "OPTIONS 429 count: $n (expect 0)"
```

---

## Env overrides (optional)

- `RATE_LIMIT_CHAT_MAX` (default 20)
- `RATE_LIMIT_CHAT_WINDOW_MS` (default 60000)
- `RATE_LIMIT_EVENTS_MAX` (default 60)
- `RATE_LIMIT_EVENTS_WINDOW_MS` (default 60000)

---

## Plugin registration (reference)

- **File:** `apps/api/src/server.ts`
- **Line:** After `server.register(cookie)`, before health/routes: `await registerRateLimit(server);` (line 33).
- **Implementation:** `apps/api/src/middleware/rateLimit.ts` → `registerRateLimit()` calls `server.register(rateLimit, { global: false, ... })`.
- **Plugin:** `@fastify/rate-limit` ^9.x (Fastify 4–compatible; 10.x requires Fastify 5).
