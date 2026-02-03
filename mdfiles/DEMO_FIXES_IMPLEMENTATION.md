# Demo Fixes - Implementation Guide

## Fix 1: Add Citations Display (30 min)

### Step 1: Update Message Type
**File:** `apps/web/src/widget/ui/MessageList.tsx`

Add metadata to Message interface:
```typescript
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: Record<string, any>; // ADD THIS LINE
}
```

### Step 2: Display Citations
**File:** `apps/web/src/widget/ui/MessageList.tsx`

In the message rendering section (around line 45-77), add after message content:

```typescript
{message.role === 'assistant' && message.metadata?.retrieved_docs_top3?.length > 0 && (
  <div style={{
    marginTop: '8px',
    padding: '8px 12px',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    fontSize: '12px',
    border: '1px solid #e0e0e0'
  }}>
    <div style={{ fontWeight: 500, marginBottom: '6px', color: '#666' }}>
      Izvori:
    </div>
    {message.metadata.retrieved_docs_top3.map((doc: any, idx: number) => (
      <div key={idx} style={{ marginBottom: '4px' }}>
        <a
          href={doc.source || '#'}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.preventDefault();
            // Simple alert for demo - can be replaced with modal
            const snippet = doc.content?.substring(0, 300) || 'Nema dostupnog sadržaja';
            alert(`${doc.title || 'Izvor ' + (idx + 1)}\n\nRelevantan odlomak:\n${snippet}...`);
          }}
          style={{
            color: '#0b3a6e',
            textDecoration: 'underline',
            cursor: 'pointer'
          }}
        >
          {doc.title || `Izvor ${idx + 1}`}
        </a>
        <span style={{ color: '#999', marginLeft: '8px' }}>
          ({(doc.score * 100).toFixed(0)}% relevantnost)
        </span>
      </div>
    ))}
  </div>
)}
```

### Step 3: Pass Metadata to Messages
**File:** `apps/web/src/widget/WidgetApp.tsx`

Around line 600-640, when creating assistant message, include metadata:

```typescript
// After streaming completes
const assistantMessage: Message = {
  id: assistantMessageId,
  role: 'assistant',
  content: finalAnswerContent,
  metadata: traceMetadata, // ADD THIS LINE
};

setMessages((prev) =>
  prev.map((msg) =>
    msg.id === assistantMessageId
      ? assistantMessage
      : msg
  )
);
```

**Test:** Ask a question, verify citations appear below answer.

---

## Fix 2: Add Deterministic Guardrail (20 min)

### Step 1: Add Guardrail Check
**File:** `apps/api/src/routes/chat.ts`

After line 217 (after `const context = buildContext(documents);`), add:

```typescript
// Deterministic guardrail (demo mode only)
if (process.env.DEMO_MODE === 'true') {
  const GUARDRAIL_PATTERNS = [
    /koliko.*košta.*gradonačelnik/i,
    /plaća.*gradonačelnik/i,
    /koliko.*zaradi.*gradonačelnik/i,
    /privatni.*podaci.*gradonačelnik/i,
    /koliko.*zarađuje.*gradonačelnik/i,
  ];

  const shouldRefuse = GUARDRAIL_PATTERNS.some(pattern => pattern.test(message));

  if (shouldRefuse) {
    const refusalMessage = 'Ne mogu odgovoriti na to pitanje bez eksplicitne dozvole gradske uprave. Molimo kontaktirajte službu za informacije.';
    
    // Stream refusal
    reply.raw.write(`data: ${refusalMessage}\n\n`);
    reply.raw.write('data: [DONE]\n\n');
    
    // Emit meta
    const traceData = {
      model,
      latency_ms: Date.now() - traceStartTime,
      retrieved_docs_count: documents.length,
      retrieved_docs_top3: retrievedDocs,
      used_fallback: false,
      needs_human: false,
      guardrail_triggered: true,
    };
    reply.raw.write(`event: meta\ndata: ${JSON.stringify(traceData)}\n\n`);
    
    // Log assistant message
    if (conversationUuid) {
      const assistantMessageUuid = randomUUID();
      const externalMessageId = messageId 
        ? `assistant:${messageId}` 
        : `assistant:${randomUUID()}`;
      
      await supabase.from('messages').upsert({
        id: assistantMessageUuid,
        conversation_id: conversationUuid,
        external_id: externalMessageId,
        role: 'assistant',
        content_redacted: refusalMessage,
        created_at: now,
        metadata: { guardrail_triggered: true },
      }, { onConflict: 'conversation_id,external_id' });
    }
    
    reply.raw.end();
    return;
  }
}
```

**Test:** Ask "Koliko košta gradonačelnik?" - should get deterministic refusal.

---

## Fix 3: Create Ticket Reference RPC (15 min)

**✅ VERIFIED:** This RPC function correctly uses `public.tickets` table (line 185). No `ticket_intakes` references.

### Step 1: Create Migration File
**File:** `apps/api/db/migrations/add_ticket_ref_rpc.sql` (NEW FILE)

```sql
-- Function to generate sequential ticket references per city/year
-- Format: CITYCODE-YYYY-NNN (e.g., PL-2026-001)
-- Uses public.tickets table (single source of truth)

CREATE OR REPLACE FUNCTION next_ticket_ref(
  p_city_id UUID,
  p_city_code TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_year INTEGER;
  v_seq INTEGER;
  v_ref TEXT;
BEGIN
  v_year := EXTRACT(YEAR FROM NOW());
  
  -- Get next sequence number for this city/year from tickets table
  SELECT COALESCE(MAX(CAST(SPLIT_PART(ticket_ref, '-', 3) AS INTEGER)), 0) + 1
  INTO v_seq
  FROM tickets
  WHERE city_id = p_city_id
    AND ticket_ref LIKE p_city_code || '-' || v_year || '-%';
  
  -- Format: CITYCODE-YYYY-NNN (e.g., PL-2026-001)
  v_ref := p_city_code || '-' || v_year || '-' || LPAD(v_seq::TEXT, 3, '0');
  
  RETURN v_ref;
END;
$$;
```

### Step 2: Run Migration
```bash
cd apps/api
# Connect to your Supabase/PostgreSQL database
psql $DATABASE_URL -f db/migrations/add_ticket_ref_rpc.sql
```

**Test:** Submit ticket intake form, verify ticket_ref is generated.

---

## Fix 4: Pass Metadata to Message Component (10 min)

### Step 1: Update Message Creation
**File:** `apps/web/src/widget/WidgetApp.tsx`

Find where assistant messages are created (around line 600-640) and ensure metadata is included:

```typescript
// After streaming completes, when setting final message
const assistantMessage: Message = {
  id: assistantMessageId,
  role: 'assistant',
  content: finalAnswerContent,
  metadata: traceMetadata, // Ensure this is set
};
```

### Step 2: Verify Metadata Flow
Check that `traceMetadata` is populated from `transport.metadata`:

```typescript
// Around line 675-678
let traceMetadata: Record<string, any> | undefined = undefined;
if (config.apiBaseUrl && transport instanceof ApiTransport) {
  traceMetadata = transport.metadata || undefined;
}
```

**Test:** Check browser console - `CHAT_RESPONSE` log should show metadata.

---

## Quick Verification Checklist

After applying all fixes:

- [ ] Citations appear below assistant messages
- [ ] Clicking citation shows source snippet
- [ ] Guardrail triggers on "Koliko košta gradonačelnik?"
- [ ] Ticket reference is generated (e.g., "PL-2026-001")
- [ ] Ticket reference appears in widget confirmation
- [ ] Admin dashboard shows ticket with reference
- [ ] Metadata is visible in browser console logs

---

## Environment Variables

Ensure these are set in `apps/api/.env`:

```bash
DEMO_MODE=true
GROQ_API_KEY=your_key_here
DATABASE_URL=your_supabase_url
```

---

## Rollback Plan

If fixes cause issues:

1. **Citations:** Remove citation rendering block in `MessageList.tsx`
2. **Guardrail:** Comment out guardrail check in `chat.ts`
3. **Ticket Ref:** Use fallback: `ticket_ref = 'PL-DEMO-' + Date.now()`
4. **Metadata:** Remove metadata from Message interface

All fixes are behind `DEMO_MODE=true` flag or isolated to UI components.
