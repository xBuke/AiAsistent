# Widget cityId Configuration - Diagnosis Report

## All Places Where Widget cityId is Chosen

### 1. Primary Configuration Source (UPDATED)
**File:** `apps/web/src/widget/init.ts`
- **Lines 59-87:** NEW fallback logic for `cityId` determination:
  - **Line 67-71:** Check URL parameter `?city=X` (highest priority)
  - **Line 74-76:** Check `data-city` attribute on script tag (second priority)
  - **Line 79-81:** Default to `'demo'` if hostname is `gradai.mangai.hr` (third priority)
  - **Line 84-87:** Fail if still missing (backward compatibility)
- **Line 27-40:** Dev mode override via `overrideConfig.cityId` parameter (bypasses all above)

### 2. Usage in Chat Endpoint Construction
**File:** `apps/web/src/widget/transports/api.ts`
- **Line 15:** Receives `cityId` from `ChatSendInput`
- **Line 24:** Constructs URL: `${apiBaseUrl}/grad/${cityId}/chat`
- Uses `cityId` from config passed to `sendMessage()`

### 3. Usage Throughout Widget
**File:** `apps/web/src/widget/WidgetApp.tsx`
- Multiple references to `config.cityId` for:
  - Analytics events (lines 72, 410, 419, etc.)
  - Ticket operations (lines 79, 542, 546, etc.)
  - Event emissions (lines 100, 124, 149, etc.)
  - Conversation tracking (lines 72, 410)

### 4. Test/Demo Files
**File:** `apps/web/public/widget-test.html`
- **Line 78:** Hardcoded `cityId: "ploce"` for dev testing

### 5. Entry Point
**File:** `apps/web/src/widget/entry.ts`
- **Line 10:** Auto-initializes `initWidget()` in production mode
- **Line 5:** Exposes `GradWidgetDevInit` in dev mode

## Current Behavior
- Widget reads `cityId` from `data-city` attribute on script tag
- If missing, widget does not initialize
- No URL parameter support
- No hostname-based defaults
- No fallback logic

## Problem
- Production site (gradai.mangai.hr) likely has `data-city="ploce"` 
- Admin dashboard at `/admin/demo` expects `cityCode='demo'`
- Mismatch: chats go to `/grad/ploce/chat` but admin reads from `demo` city

## Solution
Modify `init.ts` to:
1. Check URL parameter `?city=X` first (highest priority)
2. Check `data-city` attribute second
3. Default to `'demo'` if hostname is `gradai.mangai.hr` (production demo landing)
4. Otherwise fail if missing (backward compatibility)
