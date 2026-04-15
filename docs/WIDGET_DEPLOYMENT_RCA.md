# Root Cause Analysis: Widget Code Not Present in Production Bundle

## Executive Summary

The widget code in `apps/web/src/widget/*` is **not included** in the deployed production bundle (`assets/index-*.js`) because:

1. **The widget is a separate build artifact** that is built independently from the main app
2. **The main app does not import widget code** anywhere in its entry chain
3. **Only the main app build is deployed**, not the widget build
4. **The widget is designed as a standalone embeddable bundle** (`widget.js`) that should be loaded separately

---

## Evidence: What is Deployed vs What Was Edited

### What is Deployed
- **File**: `assets/index-*.js` (served on production site)
- **Source**: Built from `apps/web/src/main.tsx` → `apps/web/src/App.tsx`
- **Build Command**: `npm run build` (uses `vite.config.ts`)
- **Output Directory**: `dist/` (per `docs/deploy-vercel.md` line 18)
- **Contains**: Admin app routes, landing pages, chat components embedded in `App.tsx`
- **Does NOT contain**: Any code from `apps/web/src/widget/*`

### What Was Edited
- **Files with DIAGNOSTIC_PROBE strings**:
  - `apps/web/src/widget/transports/api.ts` (lines 106, 140, 161)
  - `apps/web/src/widget/WidgetApp.tsx` (lines 710, 857, 950, 995, 1034, 1213, 1231)
- **Build Target**: These files are part of the **widget build**, not the main app build
- **Widget Build Output**: `dist-widget/widget.js` (per `vite.widget.config.ts` line 7)
- **Widget Build Command**: `npm run build:widget` (per `apps/web/package.json` line 8)

---

## Detailed Analysis

### 1. Entry Point Chain Analysis

#### Main App Entry Chain (What Gets Deployed)
```
apps/web/index.html (line 24)
  └─> /src/main.tsx (line 4)
      └─> ./App.tsx (line 4)
          └─> Routes, AdminApp, Landing Pages
          └─> NO widget imports
```

**File References:**
- `apps/web/index.html:24`: `<script type="module" src="/src/main.tsx"></script>`
- `apps/web/src/main.tsx:4`: `import App from './App';`
- `apps/web/src/App.tsx`: Contains `AdminApp`, `ChatPage`, `EnglishLandingPage` components
- **No imports from `./widget/*` or `../widget/*` anywhere in `App.tsx`**

#### Widget Entry Chain (Separate Build)
```
apps/web/src/widget/entry.ts (line 1)
  └─> ./init.ts (line 1)
      └─> ./WidgetApp.tsx (line 3)
          └─> Widget components, transports, etc.
```

**File References:**
- `apps/web/src/widget/entry.ts:1`: `import initWidget from './init';`
- `apps/web/vite.widget.config.ts:9`: `entry: 'src/widget/entry.ts'`
- **This is a completely separate build target**

### 2. Build Configuration Analysis

#### Main App Build (`vite.config.ts`)
```typescript
// apps/web/vite.config.ts
export default defineConfig({
  plugins: [
    react({
      include: /\.[jt]sx?$/,
      // Exclude widget directory from Fast Refresh
      exclude: /\/src\/widget\//,  // ← Widget explicitly excluded
    }),
  ],
  // No build.lib config → standard SPA build
  // Output: dist/assets/index-*.js
});
```

**Key Points:**
- **No `build.lib` configuration** → builds as standard SPA
- **Widget directory explicitly excluded** from React Fast Refresh (line 9)
- **Default output**: `dist/` directory with `assets/index-*.js`

#### Widget Build (`vite.widget.config.ts`)
```typescript
// apps/web/vite.widget.config.ts
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist-widget',           // ← Different output directory
    lib: {
      entry: 'src/widget/entry.ts',  // ← Widget entry point
      name: 'GradWidget',
      fileName: () => 'widget.js',   // ← Output: widget.js
      formats: ['iife'],             // ← IIFE format for embedding
    },
    // ...
  },
});
```

**Key Points:**
- **Library mode build** (`build.lib`) → creates embeddable bundle
- **Separate entry point**: `src/widget/entry.ts`
- **Different output directory**: `dist-widget/` (not `dist/`)
- **Output file**: `widget.js` (not `index-*.js`)

### 3. Build Scripts Analysis

#### Package.json Scripts
```json
// apps/web/package.json
{
  "scripts": {
    "build": "node ./node_modules/vite/bin/vite.js build",           // ← Main app
    "build:widget": "node ./node_modules/vite/bin/vite.js build -c vite.widget.config.ts"  // ← Widget
  }
}
```

**Key Points:**
- **`npm run build`**: Builds main app (uses default `vite.config.ts`)
- **`npm run build:widget`**: Builds widget separately (uses `vite.widget.config.ts`)
- **Two separate build commands** → two separate artifacts

### 4. Deployment Configuration Analysis

#### Vercel Configuration
```json
// apps/web/vercel.json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"  // ← SPA routing
    }
  ]
}
```

#### Deployment Documentation
```markdown
// docs/deploy-vercel.md (lines 17-18)
- **Build Command**: `npm run build` (runs `tsc && vite build`)
- **Output Directory**: `dist`
```

**Key Points:**
- **Vercel builds**: `npm run build` (main app only)
- **Vercel serves**: `dist/` directory (main app output)
- **Widget build** (`dist-widget/widget.js`) is **not deployed** because:
  1. Vercel only runs `npm run build` (not `npm run build:widget`)
  2. Vercel only serves `dist/` (not `dist-widget/`)
  3. Widget is not included in the main app bundle

### 5. Widget Architecture Intent

#### Widget Design Pattern
The widget is designed as a **standalone embeddable bundle**:

```typescript
// apps/web/src/widget/init.ts (lines 43-57)
// Otherwise, find the script tag that loaded widget.js
let scriptTag: HTMLScriptElement | null = null;
if (document.currentScript && document.currentScript instanceof HTMLScriptElement) {
  scriptTag = document.currentScript;
} else {
  scriptTag = document.querySelector('script[src*="widget.js"]') as HTMLScriptElement;
}
```

**Key Points:**
- Widget expects to be loaded via `<script src="widget.js">` tag
- Widget auto-initializes when loaded (per `entry.ts` line 10)
- Widget is **not meant to be imported** into the main app
- Widget is meant to be **embedded on external sites** (like `gradai.mangai.hr`)

---

## Root Cause: Definitive Explanation

### The Single Most Likely Cause

**The widget code does not appear in `assets/index-*.js` because:**

1. **Widget is not imported in the main app entry chain**
   - `apps/web/src/App.tsx` does not import anything from `widget/`
   - Vite only bundles code that is imported/reachable from the entry point
   - Since widget is not imported, it is tree-shaken out (or never included)

2. **Widget is built as a separate artifact**
   - Widget has its own build config (`vite.widget.config.ts`)
   - Widget builds to `dist-widget/widget.js` (separate from `dist/`)
   - Widget build command (`build:widget`) is separate from main build (`build`)

3. **Only the main app build is deployed**
   - Vercel runs `npm run build` (main app only)
   - Vercel serves `dist/` directory (main app output)
   - Widget build (`dist-widget/widget.js`) is never deployed

4. **Widget is designed as an embeddable bundle**
   - Widget is meant to be loaded separately via `<script>` tag
   - Widget is not part of the main SPA application
   - Widget should be deployed as a separate static asset (`widget.js`)

---

## File/Line References Summary

### Files That Are Built and Deployed
- `apps/web/index.html` (entry HTML)
- `apps/web/src/main.tsx` (main entry point)
- `apps/web/src/App.tsx` (app root component)
- `apps/web/src/admin/*` (admin components)
- **Output**: `dist/assets/index-*.js`

### Files That Are NOT Built/Deployed
- `apps/web/src/widget/entry.ts` (widget entry point)
- `apps/web/src/widget/WidgetApp.tsx` (widget component)
- `apps/web/src/widget/transports/api.ts` (widget transport)
- `apps/web/src/widget/**/*` (all widget code)
- **Output**: `dist-widget/widget.js` (exists locally but not deployed)

### Configuration Files
- `apps/web/vite.config.ts` (main app build config)
- `apps/web/vite.widget.config.ts` (widget build config, line 7: `outDir: 'dist-widget'`)
- `apps/web/package.json` (line 8: `"build:widget": ...`)
- `apps/web/vercel.json` (deployment config)
- `docs/deploy-vercel.md` (line 18: `Output Directory: dist`)

---

## Conclusion

**The widget code is missing from production because:**

- ✅ **Widget is a separate build target** (proven by `vite.widget.config.ts`)
- ✅ **Widget is not imported in main app** (proven by `App.tsx` having no widget imports)
- ✅ **Only main app build is deployed** (proven by Vercel config using `npm run build` and `dist/` output)
- ✅ **Widget build exists locally** (`dist-widget/widget.js`) but is **not deployed**

**The deployed bundle (`assets/index-*.js`) contains:**
- Main app routes (Admin, Landing Pages)
- Embedded chat components in `App.tsx` (FloatingChat, ChatPage)
- **NOT** the standalone widget code from `apps/web/src/widget/*`

**The widget code (`DIAGNOSTIC_PROBE` strings) exists in:**
- Local source files: `apps/web/src/widget/transports/api.ts`, `apps/web/src/widget/WidgetApp.tsx`
- Local build artifact: `apps/web/dist-widget/widget.js`
- **NOT** in the deployed `assets/index-*.js` bundle

---

## Next Steps (Not Implemented - Per Instructions)

This analysis identifies the root cause but does not propose fixes. The fix would involve either:
1. Deploying the widget build artifact separately, OR
2. Integrating widget into the main app build, OR
3. Ensuring both builds run during deployment
