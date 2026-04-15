# AI Assistant Onboarding Handoff

## 1) Application Purpose

### What this product is

This project is a municipal AI assistant platform ("Civis"/"Grad Ploce") with two user-facing surfaces:

1. A **citizen chat/widget** embedded on city websites for:
   - answering questions from official city documents (RAG),
   - guiding users through selected administrative form flows,
   - escalating to human follow-up via ticket intake/contact handoff.
2. An **admin console** for city staff to:
   - review conversations and tickets,
   - inspect analytics/dashboard summaries,
   - access submitted forms and generated PDFs.

### Who it is for

- **Primary end users:** city residents (citizens) interacting with the chat widget.
- **Operational users:** municipal admin/inbox staff managing requests and monitoring interactions.
- **Deployment audience:** city IT/admin teams embedding widget and configuring city data.

### Product behavior goals

- Croatian-first, official-tone assistant responses.
- Retrieval-grounded answers (avoid hallucinated city facts).
- Clear separation between:
  - informational Q&A,
  - ticket escalation flow,
  - form submission flow with PDF generation.

## 2) Repository and Tech Stack

## Monorepo layout

- `apps/api`: Fastify + TypeScript backend.
- `apps/web`: React + Vite + TypeScript frontend.
- `docs`: deployment, diagnostics, and 7 focused architecture/security audits.

## Backend stack (`apps/api`)

- Runtime: Node.js 20.x, TypeScript, ESM.
- HTTP framework: Fastify.
- Plugins: `@fastify/cors`, `@fastify/cookie`, `@fastify/multipart`, rate-limit.
- DB/API: Supabase (`@supabase/supabase-js`) using Postgres + RPC.
- AI:
  - OpenAI SDK (`openai`) for chat streaming + embeddings.
  - RAG retrieval via pgvector RPC (`match_documents`).
- PDF pipeline:
  - HTML template rendering per form type,
  - Puppeteer (`puppeteer-core` + `@sparticuz/chromium`) for PDF generation.
- Auth/security:
  - bcrypt password verification,
  - cookie-based admin sessions.

## Frontend stack (`apps/web`)

- React 18 + React Router 7 + TypeScript.
- Build: Vite.
- Two build targets:
  - SPA/admin/landing build (`dist/`),
  - embeddable widget bundle (`dist-widget/widget.js`) copied to `dist/widget.js`.
- QA tooling present: Playwright packages.

## 3) Current Architecture (What Exists Now)

## API architecture

`apps/api/src/server.ts` composes route modules:

- `registerAuthRoutes` - admin login/logout.
- `registerChatRoutes` - citizen chat SSE, RAG, metadata, ticket intent detection.
- `registerEventsRoutes` - conversation lifecycle events + ticket writes.
- `registerAdminReadRoutes` - inbox/conversations/tickets reporting endpoints.
- `registerAdminDashboardRoutes` - dashboard + forms admin endpoints.
- `registerFormsRoutes` - form draft/submit/pdf/attachments.

Health endpoint: `GET /health`.

Dev debug endpoints include PDF test routes.

## Data model shape (as used by code/audits)

Core tables used by runtime:

- `cities` (city identity, slug/code, password hashes; currently no domain allowlist field).
- `conversations`, `messages`.
- `tickets` (human follow-up pipeline).
- `documents` (RAG corpus with embeddings and city scope).
- `form_requests`, `form_request_attachments`.

Important stored procedure dependencies:

- `match_documents` (RAG vector search).
- `next_ticket_ref` (ticket reference generation; required but SQL not in repo).

## Web architecture

- `src/App.tsx` routes:
  - `/` Croatian landing/demo page.
  - `/en` English landing page.
  - `/admin/:cityId` admin app.
  - redirects from `/admin` and `/admin/login` to `/admin/demo`.
- Widget subsystem in `src/widget/*`:
  - standalone embed entry/init,
  - chat transport,
  - CTA forms and wizards,
  - events reporting.

## 4) Current Development Status (Done vs Not Done)

## Implemented and functioning (high confidence)

1. **End-to-end chat + SSE stream path** with structured `meta` events.
2. **RAG pipeline**:
   - embedding generation,
   - Supabase RPC similarity search,
   - city-scoped retrieval and context assembly.
3. **Ticket pipeline**:
   - intent detection + `needs_human` signaling,
   - ticket creation via events flow,
   - admin inbox reads from `tickets`.
4. **Forms pipeline**:
   - draft -> attachment upload -> submit validation,
   - generated PDF stored in `form_requests.pdf_base64`,
   - admin and public PDF retrieval endpoints exist.
5. **Admin UI + auth flow** present and wired to backend routes.
6. **Widget dual-build deployment model** supported in build scripts (SPA + widget artifact).

## Partially implemented / known architectural debt

From current audits and source:

1. **Per-city behavior is not fully enforced in frontend auth and routing**
   - admin login path currently hardcodes demo city in frontend logic (audit finding).
2. **Domain allowlist security is missing**
   - broad CORS acceptance and no per-city Host/Origin/Referer validation.
3. **Admin forms endpoints are not fully city-scoped**
   - some forms admin reads expose cross-city records.
4. **RAG is document-level only**
   - no chunk table/chunk retrieval; no PDF OCR ingestion for RAG corpus.
5. **`next_ticket_ref` RPC definition is external**
   - runtime depends on DB function not versioned in this repo.
6. **Docs/config drift exists**
   - old deployment docs mention Groq, while current runtime uses OpenAI.

## In-progress / recent state markers

- Recent local work included diagnostics around widget ticket-form behavior and deployment/bundle investigations.
- Working tree currently contains mixed local changes (docs relocations and dependency lock/node_modules churn), so branch hygiene is required before feature work.

## 5) Key Design Decisions Already Made

These are implicit platform choices already encoded in implementation and docs:

1. **Fastify backend with modular route registration** (not Express runtime path).
2. **OpenAI-centric AI layer** for both chat and embeddings.
3. **Croatian official response style + strict grounding policy** in system prompts.
4. **RAG attribution strategy**
   - sources are surfaced in metadata/UI ("Izvori"), not in assistant text body.
5. **City resolution strategy everywhere**
   - resolve by `slug` first, fallback to uppercased `code`.
6. **Widget is standalone artifact**
   - separate build target from SPA, intended for external script embed.
7. **Form PDFs generated server-side from HTML templates**
   - persisted as base64 in DB, not storage object URL by default.
8. **Ticket vs form are separate pipelines**
   - ticket inbox flow (`tickets`) is distinct from administrative form submissions (`form_requests`).
9. **Session cookie model for admin authorization**
   - backend validates city binding via `session.cityId`.

## 6) Where Work Stopped

Based on audits, diagnostics docs, and current repo state, work paused at a "hardening + multi-city readiness" stage rather than greenfield feature build.

Latest completed analysis focused on:

1. **Admin auth audit**
   - identified route-param/city mismatch and logout/rate-limit/lockout gaps.
2. **Widget city routing audit**
   - mapped how city is resolved and where demo overrides bypass intended behavior.
3. **RAG audit**
   - documented current retrieval architecture and extension points.
4. **Forms/PDF audit**
   - mapped lifecycle and identified city-scoping/configuration gaps.
5. **Tickets/inbox audit**
   - validated city scoping, highlighted missing RPC source in repo.
6. **Domain allowlist insertion-point audit**
   - identified exact enforcement points and recommended shared helper strategy.
7. **Diagnostic docs around ticket intake regression and widget deployment**
   - detailed tracing of meta-event-to-form-open path and widget bundling/deploy behavior.

## 7) Recommended Next Step (Immediate Priority)

### Primary next task

Implement **city-aware domain allowlist enforcement** for public widget/form endpoints first, then clean up per-city admin alignment.

Why this first:

- It closes the largest security/control gap.
- It is a prerequisite for safe multi-city production embedding.
- It aligns with existing audit recommendations and current architecture.

### Concrete execution plan

1. **DB/schema**
   - add `cities.allowed_domains` (TEXT[] or JSONB) with suffix patterns.
2. **Backend helper**
   - implement reusable origin-validation helper with precedence:
     `Origin` -> `Referer` -> policy fallback.
3. **Apply checks to endpoints**
   - `POST/OPTIONS /grad/:cityId/chat`
   - `POST/OPTIONS /grad/:cityId/events`
   - `POST /forms/submit`
   - `POST /forms/draft`
   - `POST /forms/:reference_number/attachments`
   - optional: `GET /forms/:reference_number/pdf` hardening pass.
4. **Tests + verification**
   - positive/negative origin cases by city.
   - ensure allowed suffix matching works (`*.ploce.hr` style).
5. **Follow-up task immediately after**
   - enforce city scoping on admin forms endpoints and remove frontend demo hardcoding for admin login city code.

## 8) Fast Start Checklist for New Assistant

1. Read these first (order matters):
   - `docs/audit/PROMPT_07_DOMAIN_ALLOWLIST_INSERTION_POINTS.md`
   - `docs/audit/PROMPT_06_CITY_SLUG_WIRING_MAP.md`
   - `docs/audit/PROMPT_01_ADMIN_AUTH_AUDIT.md`
   - `docs/audit/PROMPT_04_FORMS_AND_PDF_AUDIT.md`
   - `docs/audit/PROMPT_05_TICKETS_INBOX_AUDIT.md`
   - `docs/audit/PROMPT_03_RAG_PIPELINE_AUDIT.md`
2. Verify runtime/env assumptions before coding:
   - OpenAI keys and Supabase env vars.
   - existence of `next_ticket_ref` and `match_documents` in target DB.
3. Clean working tree strategy:
   - separate unrelated local artifact/doc moves from functional changes.
4. Implement in small vertical slices:
   - schema/migration -> helper -> endpoint integration -> tests -> docs.
5. Keep widget + SPA deployment behavior intact:
   - ensure `build` still outputs both SPA assets and `dist/widget.js`.

## 9) Known Risks to Watch During Takeover

1. **Config/documentation drift** may cause false assumptions during deploy.
2. **Demo-mode overrides** can mask true multi-city behavior in local/manual testing.
3. **Cross-city data exposure risk** exists in some admin/form endpoints until scoping fixes land.
4. **Implicit DB dependencies (RPCs)** can break features if not present in environment.
5. **Dirty local branch artifacts** can contaminate PRs if not isolated early.

---

This document should be treated as the canonical handoff snapshot for the incoming AI assistant and updated after each major architecture/security change.
