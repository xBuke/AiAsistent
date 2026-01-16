# Grad Ploče

## Running the API

```bash
cd apps/api
npm i
npm run dev
```

API runs on http://localhost:3000 (or PORT env var)

## Running the Web App

```bash
cd apps/web
npm i
npm run dev
```

Web app runs on http://localhost:5173 (Vite default)

Optionally set `VITE_API_BASE_URL` in `.env` file (defaults to `http://localhost:3000`):
```
VITE_API_BASE_URL=http://localhost:3000
```
