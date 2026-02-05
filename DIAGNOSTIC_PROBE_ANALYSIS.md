# Diagnostic Probe Analysis: Ticket Intake Form Regression

## Problem Statement
Sending "Želim prijaviti problem" returns SSE with `event: meta` containing `needs_human: true`, but frontend shows empty assistant bubble and no ticket form opens.

## Backend → Frontend Contract

### Expected SSE Response
```
event: meta
data: {"model":null,"needs_human":true,...}
data: [DONE]
```

**Backend Location**: `apps/api/src/routes/chat.ts:269-318`
- When `matchesTicketIntent(message)` is true:
  - Line 287: `writeSseEvent(reply.raw, 'meta', JSON.stringify(traceData))` where `traceData.needs_human = true`
  - Line 298: `reply.raw.write('data: [DONE]\n\n')`
  - Line 318: Returns early (no message tokens)

## Frontend Flow Analysis

### 1. Transport Layer (SSE Parsing)
**File**: `apps/web/src/widget/transports/api.ts`

**Flow**:
- Line 78-80: Detects `event: meta` → sets `currentEvent = 'meta'`
- Line 83-84: Detects `data: ` → extracts payload
- Line 101-147: When `currentEvent === 'meta'`:
  - Line 103: Parses JSON payload
  - Line 104: Stores in `this._metadata`
  - Line 136: Calls `onMeta(parsed)` callback if provided

**Diagnostic Probe**: `[DIAGNOSTIC_PROBE][TRANSPORT_META_RECEIVED]` at line 107
- Logs: parsed object, needs_human value, storage confirmation

**Potential Break Point A**: If `event: meta` is not detected or parsed incorrectly

### 2. WidgetApp onMeta Callback
**File**: `apps/web/src/widget/WidgetApp.tsx`

**Flow**:
- Line 705-739: `onMeta` callback handler:
  - Line 707: Stores in `metaRef.current = metaObj`
  - Line 712: Stores in state `setLastMeta(metaObj)` for UI debug

**Diagnostic Probe**: `[DIAGNOSTIC_PROBE][WIDGETAPP_ONMETA_CALLBACK]` at line 708
- Logs: metaObj received, needs_human value, storage confirmation

**Potential Break Point B**: If `onMeta` callback is not invoked or metaRef not set

### 3. Metadata Resolution After Stream
**File**: `apps/web/src/widget/WidgetApp.tsx`

**Flow**:
- Line 841: After stream loop completes, calls `resolveMeta(transport)`
- Line 63-66: `resolveMeta` function:
  ```typescript
  function resolveMeta(transport: ChatTransport, traceMetadata?: Record<string, any>): Record<string, any> | undefined {
    const tmeta = transport instanceof ApiTransport ? (transport.metadata || undefined) : undefined;
    return metaRef.current || tmeta || traceMetadata;
  }
  ```
  Priority: `metaRef.current` > `transport.metadata` > `traceMetadata`

**Diagnostic Probe**: `[DIAGNOSTIC_PROBE][WIDGETAPP_META_RESOLVED]` at line 844
- Logs: metaRef.current, transport.metadata, resolved meta, needs_human values

**Potential Break Point C**: If `resolveMeta` returns undefined/null or wrong source

### 4. Needs Human Check and Form Open Decision
**File**: `apps/web/src/widget/WidgetApp.tsx`

**Flow**:
- Line 920: Computes `needsHuman = meta?.needs_human === true || meta?.needsHuman === true`
- Line 951: If `needsHuman && !intakeSubmitted`, calls `setShowIntakeForm(true)`

**Diagnostic Probe**: `[DIAGNOSTIC_PROBE][WIDGETAPP_NEEDS_HUMAN_CHECK]` at line 923
- Logs: meta.needs_human (snake_case), meta.needsHuman (camelCase), computed needsHuman, decision

**Diagnostic Probe**: `[DIAGNOSTIC_PROBE][WIDGETAPP_FORM_OPEN]` at line 954 (if opening)
**Diagnostic Probe**: `[DIAGNOSTIC_PROBE][WIDGETAPP_FORM_NOT_OPEN]` at line 982 (if not opening)

**Potential Break Point D**: If `needs_human` check fails (wrong value/type) or `intakeSubmitted` is true

### 5. UI Rendering
**File**: `apps/web/src/widget/ui/ChatPanel.tsx`

**Flow**:
- Line 269: Conditionally renders `TicketIntakeForm` when `showIntakeForm && onIntakeSubmit`
- Line 1126: WidgetApp passes `showIntakeForm={showIntakeForm && !intakeSubmitted}`

**Potential Break Point E**: If state update doesn't propagate or rendering condition fails

## Diagnostic Probes Added

### Console Logs (Always Active)
1. `[DIAGNOSTIC_PROBE][TRANSPORT_META_RECEIVED]` - Transport receives meta event
2. `[DIAGNOSTIC_PROBE][TRANSPORT_CALLING_ONMETA]` - Transport calls onMeta callback
3. `[DIAGNOSTIC_PROBE][WIDGETAPP_ONMETA_CALLBACK]` - WidgetApp onMeta handler invoked
4. `[DIAGNOSTIC_PROBE][WIDGETAPP_META_RESOLVED]` - Metadata resolved after stream
5. `[DIAGNOSTIC_PROBE][WIDGETAPP_NEEDS_HUMAN_CHECK]` - Needs human check decision
6. `[DIAGNOSTIC_PROBE][WIDGETAPP_FORM_OPEN]` - Form open action
7. `[DIAGNOSTIC_PROBE][WIDGETAPP_FORM_NOT_OPEN]` - Form NOT opened (with reason)

### UI Debug Display (Query Param Flag)
- **Activation**: Add `?debugMeta=1` to URL
- **Location**: Fixed position bottom-left corner
- **Content**: Displays `lastMeta` state as JSON
- **File**: `apps/web/src/widget/WidgetApp.tsx:1155-1173`

## Expected Diagnostic Output Sequence

When "Želim prijaviti problem" is sent:

1. `[DIAGNOSTIC_PROBE][TRANSPORT_META_RECEIVED]` - Should show `needs_human: true`
2. `[DIAGNOSTIC_PROBE][TRANSPORT_CALLING_ONMETA]` - Should confirm callback called
3. `[DIAGNOSTIC_PROBE][WIDGETAPP_ONMETA_CALLBACK]` - Should show metaObj stored
4. `[DIAGNOSTIC_PROBE][WIDGETAPP_META_RESOLVED]` - Should show resolved meta with `needs_human: true`
5. `[DIAGNOSTIC_PROBE][WIDGETAPP_NEEDS_HUMAN_CHECK]` - Should show `computed_needsHuman: true`
6. `[DIAGNOSTIC_PROBE][WIDGETAPP_FORM_OPEN]` - Should show `setShowIntakeForm(true)` called

## Break Location Identification

Check console logs in order:
- **If probe 1 missing**: Transport not receiving SSE `event: meta` (Break Point A)
- **If probe 2 missing**: Transport not calling onMeta callback (Break Point A)
- **If probe 3 missing**: WidgetApp onMeta handler not invoked (Break Point B)
- **If probe 4 shows `resolved_meta: null`**: Metadata not resolved correctly (Break Point C)
- **If probe 5 shows `computed_needsHuman: false`**: Needs human check failing (Break Point D)
- **If probe 6 shows `WIDGETAPP_FORM_NOT_OPEN`**: Form open condition failing (Break Point D)
- **If probe 6 shows `WIDGETAPP_FORM_OPEN` but form doesn't render**: UI rendering issue (Break Point E)

## Files Modified

1. `apps/web/src/widget/transports/api.ts` - Added transport-level diagnostic probes
2. `apps/web/src/widget/WidgetApp.tsx` - Added WidgetApp-level diagnostic probes and UI debug display

## Next Steps

1. Deploy with diagnostic probes
2. Test with "Želim prijaviti problem"
3. Check console for `[DIAGNOSTIC_PROBE]` logs
4. Check UI debug display (if `?debugMeta=1` is in URL)
5. Identify exact break point from probe sequence
6. Fix the identified break point (NOT done in this task)
