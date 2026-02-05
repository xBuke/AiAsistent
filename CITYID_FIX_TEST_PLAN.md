# Widget cityId Fix - Manual Test Plan

## Summary of Changes

**File Modified:** `apps/web/src/widget/init.ts`

**Change:** Added fallback logic for `cityId` determination:
1. **Priority 1:** URL parameter `?city=X` (highest priority)
2. **Priority 2:** `data-city` attribute on script tag
3. **Priority 3:** Default to `'demo'` if hostname is `gradai.mangai.hr`
4. **Priority 4:** Fail if still missing (backward compatibility)

## Test Plan

### Test 1: Production Demo Landing (gradai.mangai.hr)
**Goal:** Verify widget uses `cityId='demo'` by default on production landing page.

**Steps:**
1. Navigate to `https://gradai.mangai.hr` (or `https://gradai.mangai.hr/`)
2. Open browser DevTools → Network tab
3. Open the widget chat panel
4. Send a test message (e.g., "Hello")
5. **Verify:** Network request shows `POST /grad/demo/chat` (not `/grad/ploce/chat`)
6. **Verify:** Request URL contains `cityId='demo'` in the path

**Expected Result:**
- Widget initializes successfully
- Chat endpoint: `POST https://<api-base>/grad/demo/chat`
- Message is sent successfully

---

### Test 2: URL Parameter Override
**Goal:** Verify URL parameter `?city=X` takes highest priority.

**Steps:**
1. Navigate to `https://gradai.mangai.hr?city=ploce`
2. Open browser DevTools → Network tab
3. Open the widget chat panel
4. Send a test message
5. **Verify:** Network request shows `POST /grad/ploce/chat` (overrides default)

**Expected Result:**
- Widget uses `cityId='ploce'` from URL parameter
- Chat endpoint: `POST https://<api-base>/grad/ploce/chat`

**Additional Test:**
- Navigate to `https://gradai.mangai.hr?city=demo`
- **Verify:** Still uses `cityId='demo'` (explicit override)

---

### Test 3: Data-City Attribute (Backward Compatibility)
**Goal:** Verify `data-city` attribute still works and takes priority over hostname default.

**Steps:**
1. On a test page, embed widget with: `<script src="widget.js" data-city="ploce" data-api-base="..."></script>`
2. Navigate to the page (even if hostname is `gradai.mangai.hr`)
3. Open browser DevTools → Network tab
4. Open the widget chat panel
5. Send a test message
6. **Verify:** Network request shows `POST /grad/ploce/chat` (data-city takes priority)

**Expected Result:**
- Widget uses `cityId='ploce'` from `data-city` attribute
- Hostname default is ignored when `data-city` is present

---

### Test 4: URL Parameter vs Data-City Priority
**Goal:** Verify URL parameter takes priority over `data-city` attribute.

**Steps:**
1. On a test page, embed widget with: `<script src="widget.js" data-city="ploce" data-api-base="..."></script>`
2. Navigate to the page with URL: `?city=demo`
3. Open browser DevTools → Network tab
4. Open the widget chat panel
5. Send a test message
6. **Verify:** Network request shows `POST /grad/demo/chat` (URL param wins)

**Expected Result:**
- Widget uses `cityId='demo'` from URL parameter
- `data-city` attribute is ignored when URL parameter is present

---

### Test 5: Admin Dashboard Verification
**Goal:** Verify new chats/tickets appear in admin demo dashboard.

**Steps:**
1. Send a message via widget on `https://gradai.mangai.hr` (should use `cityId='demo'`)
2. Wait a few seconds for backend processing
3. Navigate to `https://gradai.mangai.hr/admin/demo`
4. Login with demo credentials (`cityCode="demo"`, `password="demo"`)
5. Navigate to **Inbox** or **Tickets** tab
6. **Verify:** The conversation/ticket from step 1 appears in the list

**Expected Result:**
- New conversation created with `city_id` matching demo city
- Ticket (if form submitted) appears in admin inbox
- Admin dashboard shows the conversation/ticket

---

### Test 6: Other Hostnames (Backward Compatibility)
**Goal:** Verify other hostnames still require `data-city` attribute.

**Steps:**
1. Deploy widget to a different hostname (e.g., `example.com`)
2. Embed widget WITHOUT `data-city` attribute
3. Navigate to the page
4. **Verify:** Widget does NOT initialize (console warning shown)
5. **Verify:** No widget appears on page

**Expected Result:**
- Widget fails gracefully with console warning
- No widget mounted (backward compatibility maintained)

---

### Test 7: Dev Mode (Override Config)
**Goal:** Verify dev mode override still works.

**Steps:**
1. In dev environment, use `GradWidgetDevInit({ cityId: 'test', ... })`
2. **Verify:** Widget uses `cityId='test'` from override config
3. **Verify:** URL params and data-city are ignored in dev override mode

**Expected Result:**
- Dev override config takes precedence
- Widget initializes with provided config

---

## Verification Checklist

- [ ] Widget on `gradai.mangai.hr` uses `cityId='demo'` by default
- [ ] Widget calls `POST /grad/demo/chat` (not `/grad/ploce/chat`)
- [ ] URL parameter `?city=X` overrides default
- [ ] `data-city` attribute still works (backward compatible)
- [ ] URL parameter takes priority over `data-city`
- [ ] Admin dashboard at `/admin/demo` shows new conversations/tickets
- [ ] Other hostnames still require `data-city` (backward compatible)
- [ ] Dev mode override config still works

## Network Request Verification

When testing, check the Network tab for:
- **Request URL:** Should be `POST https://<api-base>/grad/demo/chat` (or specified cityId)
- **Request Payload:** Should contain `{ message: "...", conversationId?: "...", messageId?: "..." }`
- **Response:** Should be SSE stream or JSON response

## Console Verification

Check browser console for:
- **No errors** during widget initialization
- **Warning only if:** cityId is missing AND hostname is not `gradai.mangai.hr`
- **No warnings** on `gradai.mangai.hr` (should use default 'demo')

## Admin Dashboard Verification

After sending a message via widget:
1. Check `/admin/demo/inbox` - ticket should appear if intake form was submitted
2. Check `/admin/demo/tickets` - conversation should appear if `needs_human=true` or `fallback_count>0`
3. Check `/admin/demo/conversations` - conversation should appear in list
4. Verify `city_id` in database matches demo city ID (not ploce city ID)
