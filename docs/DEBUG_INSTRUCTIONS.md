# Debug Instructions for Ticket Form Regression

## What Was Added

Temporary debug logs (marked with `[DEBUG]` prefix) have been added at critical points in the flow to trace exactly where the ticket form opening logic breaks.

## Files Modified

1. **Frontend**: `apps/web/src/widget/WidgetApp.tsx`
   - Line ~478: State reset logging
   - Line ~431: Frontend gate check logging
   - Line ~693: Meta event received logging
   - Line ~815: Metadata resolution logging
   - Line ~882: Needs human check logging
   - Line ~906: Form open call logging

2. **Backend**: `apps/api/src/routes/chat.ts`
   - Line ~269: Backend keyword match logging
   - Line ~282: Meta emission logging

3. **Transport**: `apps/web/src/widget/transports/api.ts`
   - Line ~101: Meta event detection logging
   - Line ~118: onMeta callback invocation logging

## How to Test

1. **Open browser console** (F12 → Console tab)
2. **Send test messages**:
   - "Imam problem"
   - "Želim prijaviti problem"
   - "zelim prijaviti problem" (normalized version)
3. **Capture console logs** - Look for `[DEBUG]` prefixed logs
4. **Check backend logs** - Look for `[DEBUG][BACKEND_*]` logs

## Expected Log Sequence (Success Case)

When "Želim prijaviti problem" is sent and backend triggers:

```
[DEBUG][FRONTEND_GATE] Matched ticket intent... (if frontend catches it)
OR
[DEBUG][RESET] Resetting showIntakeForm to false (if frontend doesn't catch it)
[DEBUG][BACKEND_GATE] Ticket intent detected... (backend log)
[DEBUG][BACKEND_META] Emitting meta event with needs_human=true (backend log)
[DEBUG][TRANSPORT] Meta event detected (transport receives SSE)
[DEBUG][TRANSPORT] Calling onMeta callback (transport calls callback)
[DEBUG][META_RECEIVED] Meta event received (WidgetApp receives meta)
[DEBUG][RESOLVE_META] Resolved metadata (after streaming completes)
[DEBUG][NEEDS_HUMAN_CHECK] (checking if needs_human === true)
[DEBUG][FORM_OPEN] Calling setShowIntakeForm(true) (if check passes)
```

## What to Look For

### If Form Doesn't Open, Check:

1. **Does backend detect keyword?**
   - Look for `[DEBUG][BACKEND_GATE]` log
   - If missing → backend keyword patterns don't match

2. **Does backend emit meta?**
   - Look for `[DEBUG][BACKEND_META]` log
   - Check `needs_human` value in log

3. **Does transport receive meta?**
   - Look for `[DEBUG][TRANSPORT] Meta event detected`
   - Check if `parsed.needs_human` is `true`

4. **Does WidgetApp receive meta?**
   - Look for `[DEBUG][META_RECEIVED]`
   - Check if `needs_human` is `true`

5. **Is metadata resolved correctly?**
   - Look for `[DEBUG][RESOLVE_META]`
   - Check if `resolved.needs_human` is `true`
   - Compare `metaRef`, `transportMeta`, and `resolved` values

6. **Does needs_human check pass?**
   - Look for `[DEBUG][NEEDS_HUMAN_CHECK]`
   - Check `computedNeedsHuman` value
   - Check `willOpenForm` value
   - Check `intakeSubmitted` value (should be `false`)

7. **Is form open called?**
   - Look for `[DEBUG][FORM_OPEN]`
   - If missing → check failed at step 6

## Key Diagnostic Points

### Hypothesis #1: State Reset Race Condition
- **Check**: Compare timestamps between `[DEBUG][RESET]` and `[DEBUG][META_RECEIVED]`
- **If**: Reset happens AFTER meta received → state was cleared
- **Evidence**: `showIntakeFormBefore: false` in `[DEBUG][FORM_OPEN]` log

### Hypothesis #2: Metadata Resolution Failure
- **Check**: `[DEBUG][RESOLVE_META]` log
- **If**: `resolved` is `null` or `undefined` → resolution failed
- **If**: `metaRef` is `null` but `transportMeta` has value → onMeta callback didn't fire
- **Evidence**: `needs_human: undefined` in `[DEBUG][NEEDS_HUMAN_CHECK]`

### Hypothesis #3: Keyword Pattern Mismatch
- **Check**: `[DEBUG][FRONTEND_GATE]` log
- **If**: Missing → frontend gate didn't catch it
- **Check**: `[DEBUG][BACKEND_GATE]` log
- **If**: Missing → backend gate didn't catch it
- **Evidence**: Message goes through normal LLM path (check `model` field in meta)

### Hypothesis #4: intakeSubmitted Guard
- **Check**: `[DEBUG][NEEDS_HUMAN_CHECK]` log
- **If**: `intakeSubmitted: true` → form blocked by guard
- **Evidence**: `willOpenForm: false` despite `computedNeedsHuman: true`

## Next Steps After Diagnosis

Once logs are captured:

1. **Identify the break point** - Which log is missing or shows wrong value?
2. **Compare timestamps** - Are there race conditions?
3. **Check state values** - Are they what we expect?
4. **Verify metadata flow** - Is it preserved through the chain?

## Removing Debug Logs

After diagnosis is complete, search for `[DEBUG]` and `TEMPORARY DEBUG` comments and remove them.
