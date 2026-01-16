# Deploy to Vercel

This guide explains how to deploy both `apps/web` (Vite frontend) and `apps/api` (Express backend) to Vercel.

## Prerequisites

- Vercel account ([vercel.com](https://vercel.com))
- Vercel CLI installed: `npm i -g vercel`
- Environment variables ready (see sections below)

---

## 1. Deploy `apps/web` (Frontend)

### Framework Details
- **Framework**: Vite
- **Build Command**: `npm run build` (runs `tsc && vite build`)
- **Output Directory**: `dist`
- **Node Version**: 18.x or higher (set in Vercel project settings)

### Deployment Steps

#### Option A: Vercel CLI
```bash
cd apps/web
vercel
```

#### Option B: Vercel Dashboard
1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your Git repository
3. Set **Root Directory** to `apps/web`
4. Configure build settings:
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`

### Required Environment Variables

Set these in Vercel project settings (Settings → Environment Variables):

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_API_BASE_URL` | Full URL of your deployed API | `https://your-api.vercel.app` |

**Important**: `VITE_API_BASE_URL` must be set at build time. After adding it, redeploy the web app.

---

## 2. Deploy `apps/api` (Backend)

### Framework Details
- **Runtime**: Node.js (Express server)
- **Build Command**: `npm run build` (runs `tsc`)
- **Start Command**: `node dist/index.js`
- **Node Version**: 18.x or higher

### Deployment Steps

#### Option A: Vercel CLI (Serverless)
```bash
cd apps/api
vercel
```

**Note**: For Express on Vercel serverless functions, create `api/index.js` (or see minimal config below).

#### Option B: Vercel Dashboard
1. Create a new Vercel project
2. Set **Root Directory** to `apps/api`
3. Configure build settings:
   - **Framework Preset**: Other
   - **Build Command**: `npm run build`
   - **Output Directory**: `.` (not used for serverless)
   - **Install Command**: `npm install`

### Required Environment Variables

Set these in Vercel project settings:

| Variable | Description | Required |
|----------|-------------|----------|
| `GROQ_API_KEY` | Groq API key for LLM | Yes |
| `SUPABASE_URL` | Supabase project URL | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | Yes |
| `ADMIN_PASSWORD` | Password for `/admin/messages` endpoint | Yes |
| `GROQ_STREAMING` | Enable streaming (`'true'` or `'false'`) | No (defaults to `'true'`) |
| `PORT` | Server port (Vercel sets this automatically) | No |

#### Setting `GROQ_STREAMING`

- **Enable streaming** (default): Set `GROQ_STREAMING=true` or omit the variable
- **Disable streaming**: Set `GROQ_STREAMING=false`

The API will use Server-Sent Events (SSE) when streaming is enabled, or return JSON when disabled.

### Minimal Vercel Configuration

For Express apps on Vercel, the `apps/api/vercel.json` file is provided (see project root).

**Important Note**: Express apps using `app.listen()` typically need to export the app handler for Vercel serverless functions. If you encounter issues, you may need to modify `apps/api/src/index.ts` to export the app instead of calling `app.listen()`:

```typescript
// At the end of index.ts, replace app.listen() with:
export default app;
// Or for serverless compatibility:
// module.exports = app;
```

However, try deployment first with the provided `vercel.json` - Vercel's Node.js runtime may handle it automatically.

---

## 3. Connect Web to API

### Step-by-Step

1. **Deploy the API first** to get its URL:
   - Example: `https://your-api-project.vercel.app`

2. **Set `VITE_API_BASE_URL` in the web project**:
   - Go to Vercel project settings → Environment Variables
   - Add: `VITE_API_BASE_URL=https://your-api-project.vercel.app`
   - **Important**: Vite env vars must be prefixed with `VITE_` and are embedded at build time

3. **Redeploy the web app** after adding the env var (trigger a new build)

### Verify Connection

The web app uses `VITE_API_BASE_URL` in `apps/web/src/App.tsx`:
```typescript
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
```

After deployment, check the browser console to ensure API calls go to the correct URL.

---

## 4. CORS Configuration

The API already has CORS middleware configured in `apps/api/src/index.ts`:

```typescript
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-admin-password');
  // ...
});
```

**For production**, consider restricting `Access-Control-Allow-Origin` to your web app's domain:
- Change `'*'` to your web app URL: `'https://your-web-app.vercel.app'`

---

## 5. Common Deployment Pitfalls

### ❌ Web App Can't Connect to API

**Symptoms**: Network errors, CORS errors, or API calls failing

**Solutions**:
1. Verify `VITE_API_BASE_URL` is set correctly in Vercel (with `VITE_` prefix)
2. Redeploy the web app after adding the env var (env vars are embedded at build time)
3. Check API URL is accessible: `curl https://your-api.vercel.app/health`
4. Verify CORS headers on the API allow your web domain

### ❌ API Build Fails

**Symptoms**: Build errors during deployment

**Solutions**:
1. Ensure TypeScript compiles: `cd apps/api && npm run build` locally
2. Check all dependencies are in `package.json` (not just `devDependencies`)
3. Verify Node version in Vercel matches local (18.x recommended)

### ❌ API Returns 500 Errors or Times Out

**Symptoms**: API deploys but requests fail or timeout

**Solutions**:
1. Check all required env vars are set in Vercel project settings
2. Verify `GROQ_API_KEY`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` are correct
3. Check Vercel function logs: Project → Deployments → Select deployment → Functions tab
4. **Express on Serverless**: If using `app.listen()`, Vercel serverless functions may require exporting the app instead. See the "Minimal Vercel Configuration" section above for details.

### ❌ Streaming Not Working

**Symptoms**: SSE not working, responses are JSON instead of streaming

**Solutions**:
1. Verify `GROQ_STREAMING` is set to `'true'` (or omitted, which defaults to true)
2. Check browser console for SSE connection errors
3. Verify API response headers include `Content-Type: text/event-stream`

### ❌ TypeScript Build Errors

**Symptoms**: `tsc` fails during build

**Solutions**:
1. Run `npm run build` locally to catch TypeScript errors
2. Ensure `tsconfig.json` has correct paths and includes
3. Check for missing type definitions: `npm install --save-dev @types/node`

### ❌ Missing Files in Deployment

**Symptoms**: `dist/` folder missing or incomplete

**Solutions**:
1. Verify `npm run build` completes successfully locally
2. Check `.vercelignore` doesn't exclude `dist/`
3. Ensure build command runs before deployment

---

## Deployment Checklist

### Before Deployment

- [ ] All environment variables documented and ready
- [ ] Local builds work: `cd apps/web && npm run build`
- [ ] Local builds work: `cd apps/api && npm run build`
- [ ] API starts locally: `cd apps/api && npm start`
- [ ] Web preview works locally: `cd apps/web && npm run preview`

### Deploy API

- [ ] Create Vercel project for API
- [ ] Set root directory to `apps/api`
- [ ] Set all required environment variables
- [ ] Deploy and get API URL
- [ ] Test API health endpoint: `curl https://your-api.vercel.app/health`

### Deploy Web

- [ ] Create Vercel project for web
- [ ] Set root directory to `apps/web`
- [ ] Set `VITE_API_BASE_URL` to API URL
- [ ] Deploy web app
- [ ] Verify web app loads

### After Deployment

- [ ] Web app loads without errors
- [ ] Web app can make requests to API (check browser network tab)
- [ ] Chat functionality works
- [ ] Admin page works (with correct password)
- [ ] Streaming responses work (if enabled)
- [ ] CORS headers allow web app domain

---

## Testing Locally Before Deployment

1. **Start API**:
   ```bash
   cd apps/api
   npm install
   npm run build
   npm start
   ```

2. **Start Web** (in another terminal):
   ```bash
   cd apps/web
   npm install
   # Set VITE_API_BASE_URL=http://localhost:3000 in .env or export it
   npm run dev
   ```

3. **Test**: Open `http://localhost:5173` (or Vite's default port) and verify it connects to the API.

---

## URLs After Deployment

After successful deployment, you'll have:

- **Web App**: `https://your-web-project.vercel.app`
- **API**: `https://your-api-project.vercel.app`

Replace `your-web-project` and `your-api-project` with your actual Vercel project names.
