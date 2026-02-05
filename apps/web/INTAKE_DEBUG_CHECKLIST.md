# Intake Form Debug Checklist

## Instrumentation Added

Temporary debug logs have been added with `DEBUG_INTAKE = true` guard in:
- `apps/web/src/widget/WidgetApp.tsx`
- `apps/web/src/widget/ui/ChatPanel.tsx`

## Log Tags

All logs are prefixed with `[INTAKE][TAG]` where TAG is one of:
- `[SEND]` - At start of handleSend() and after resets
- `[META]` - When onMeta callback receives metadata
- `[CHECK]` - Right before needsHuman gate computation
- `[OPEN]` - Inside setShowIntakeForm(true) gate (before/after)
- `[RENDER]` - In WidgetApp render path
- `[CHATPANEL]` - At conditional render in ChatPanel

## Where to Look - Diagnostic Flow

### 1. Meta Not Used Correctly
**Symptom:** `[INTAKE][META]` shows `needs_human: true` but `[INTAKE][CHECK]` shows `computedNeedsHuman: false`

**Meaning:** Metadata is arriving but not being resolved/used correctly in the needsHuman computation.

**Check:**
- Is `metaRef.current` being set in onMeta?
- Is `resolveMeta()` returning the correct meta?
- Are both `needs_human` and `needsHuman` being checked?

### 2. State Reset/Override After Open
**Symptom:** `[INTAKE][CHECK]` shows `computedNeedsHuman: true` and `[INTAKE][OPEN]` log appears, but `[INTAKE][RENDER]` shows `showIntakeForm: false`

**Meaning:** `setShowIntakeForm(true)` was called but state was reset/overridden before render.

**Check:**
- Look for other `setShowIntakeForm(false)` calls after the OPEN log
- Check if any useEffect is resetting state
- Verify no race conditions between state updates

### 3. Prop Wiring Issue
**Symptom:** `[INTAKE][RENDER]` shows `showIntakeFormProp: true` but `[INTAKE][CHATPANEL]` shows `showIntakeForm: false` or `willRender: false`

**Meaning:** Prop is being passed correctly but ChatPanel isn't receiving it or condition is failing.

**Check:**
- Verify `showIntakeForm && !intakeSubmitted` computation in WidgetApp render
- Check if `onIntakeSubmit` prop is being passed correctly
- Verify ChatPanel prop destructuring/defaults

### 4. Form Render Condition Deeper
**Symptom:** `[INTAKE][CHATPANEL]` shows `willRender: true` but form still not visible

**Meaning:** Conditional render logic passes but form component itself has issues.

**Check:**
- Verify TicketIntakeForm component is rendering
- Check for CSS/styling issues hiding the form
- Look for z-index or overflow issues
- Verify form component isn't throwing errors

## Expected Log Sequence (Success Case)

```
[INTAKE][SEND] { userMessage: "...", conversationId: "...", cityId: "...", intakeSubmitted_BEFORE: false, showIntakeForm_BEFORE: false }
[INTAKE][SEND] Resets applied: setShowIntakeForm(false), setIntakeSubmitted(false)
[INTAKE][META] { needs_human: true, needsHuman: undefined, top3: 3, fullMeta: {...} }
[INTAKE][CHECK] { meta: { needs_human: true, needsHuman: undefined }, computedNeedsHuman: true, intakeSubmitted: false }
[INTAKE][OPEN] calling setShowIntakeForm(true)
[INTAKE][OPEN] requested open (state update pending)
[INTAKE][RENDER] { showIntakeForm: true, intakeSubmitted: false, showIntakeFormProp: true }
[INTAKE][CHATPANEL] { showIntakeForm: true, hasOnIntakeSubmit: true, willRender: true }
```

## Removal

When done debugging, set `DEBUG_INTAKE = false` in both files, or remove all `DEBUG_INTAKE` blocks entirely.
