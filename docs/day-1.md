# Day 1 Report

## What was built

- **Monorepo structure**: `/apps/api` and `/apps/web` with separate package.json files
- **API** (Node + Express + TypeScript):
  - GET `/health` endpoint
  - POST `/chat` endpoint with SSE streaming via Groq API
  - CORS middleware
  - dotenv support for `GROQ_API_KEY` and `PORT`
- **Web app** (Vite + React + TypeScript):
  - Chat UI with message list (user vs assistant)
  - Text input with Send button
  - SSE stream consumption with progressive token rendering
  - Loading state ("Sending…") during requests
  - dotenv support for `VITE_API_BASE_URL`

## How to run

**API:**
```bash
cd apps/api
npm i
npm run dev
```
Requires `apps/api/.env` with `GROQ_API_KEY=your_key`

**Web app:**
```bash
cd apps/web
npm i
npm run dev
```
Optional: `apps/web/.env` with `VITE_API_BASE_URL=http://localhost:3000`

## Known issues / TODO

- None currently

## Plan for day 2

- TBD
