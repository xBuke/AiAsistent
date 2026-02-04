# Production Test Steps - Embedding Migration

## Pre-Deployment Checklist

- [ ] `OPENAI_API_KEY` is set in Vercel environment variables
- [ ] Database migration has been applied (choose Option A or B below)
- [ ] Documents have been re-embedded (if using Option B)

## Database Migration Options

### Option A: Flexible Vector Dimensions (Recommended for Demo)
**File**: `apps/api/db/migrations/2026-02-04_flexible_vector_dimensions.sql`

**Advantages**:
- Works with both old (384-dim) and new (512-dim) embeddings
- No need to re-embed existing documents immediately
- Can migrate gradually

**Steps**:
1. Run the migration SQL in your Supabase SQL editor
2. Re-embed documents when convenient (use `scripts/re-embed-ploce.ts`)

### Option B: Fixed 512 Dimensions
**File**: `apps/api/db/migrations/2026-02-04_fixed_512_dimensions.sql`

**Advantages**:
- Consistent dimension across all documents
- Better index performance

**Steps**:
1. Run the migration SQL in your Supabase SQL editor
2. **MUST** run re-embed script immediately: `tsx scripts/re-embed-ploce.ts`

## Re-Embedding Documents

For city "ploce":
```bash
cd apps/api
tsx scripts/re-embed-ploce.ts
```

This script will:
1. Find all documents for city code "PLOCE"
2. Generate new OpenAI embeddings (512 dimensions)
3. Update the documents table

## Production Test Steps

### 1. Verify No Sharp Errors
**Check**: Vercel function logs after deployment

**Expected**: No errors containing "sharp" or "sharp-linux-x64.node"

**Command** (if using Vercel CLI):
```bash
vercel logs --follow
```

**Look for**:
- ✅ No "Error installing sharp" messages
- ✅ No "cannot find sharp-linux-x64.node" errors
- ✅ Chat requests complete successfully

### 2. Verify Retrieval Works
**Test**: POST request to `/grad/ploce/chat`

**Request**:
```bash
curl -X POST https://your-api.vercel.app/grad/ploce/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Koje su radne sate gradske uprave?",
    "conversationId": "test-123"
  }'
```

**Check logs for**:
- ✅ `[DEMO_MODE] Retrieval debug` logs appear (if DEMO_MODE=true)
- ✅ `retrieved_sources_count > 0`
- ✅ No embedding errors

**Expected Response**:
- SSE stream with actual content (not generic fallback)
- Meta event with `retrieved_docs_count > 0`

### 3. Verify Working Hours Question
**Test**: Ask about working hours

**Request**:
```bash
curl -X POST https://your-api.vercel.app/grad/ploce/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Kada je gradski ured otvoren?",
    "conversationId": "test-hours-123"
  }'
```

**Expected**:
- ✅ Response includes actual working hours from documents
- ✅ No placeholder text like "od:00 do:00"
- ✅ Specific times mentioned (e.g., "07:30 – 15:30")

**Check logs**:
- ✅ `retrieved_docs_top3` shows relevant documents
- ✅ Document titles match working hours content

### 4. Verify Error Handling
**Test**: Temporarily break embedding (e.g., invalid API key)

**Expected**:
- ✅ HTTP 500 response (not 200 with empty array)
- ✅ Error logged with full context
- ✅ Error message includes "Embedding or retrieval service unavailable"

## Troubleshooting

### Issue: Still seeing sharp errors
**Solution**:
1. Verify `@xenova/transformers` and `sharp` are removed from `package.json`
2. Clear Vercel build cache
3. Redeploy

### Issue: Retrieval returns empty array
**Check**:
1. `OPENAI_API_KEY` is set correctly in Vercel
2. Database migration was applied
3. Documents have embeddings (check: `SELECT id, title, embedding IS NOT NULL FROM documents WHERE city_id = '...'`)
4. Check logs for embedding errors

### Issue: Dimension mismatch errors
**Solution**:
- If using Option A: Ensure migration was applied (flexible vector type)
- If using Option B: Ensure all documents were re-embedded

### Issue: DEMO_MODE logs not appearing
**Check**:
1. `DEMO_MODE=true` is set in Vercel environment variables
2. Retrieval is actually being called (check for other logs)
3. No errors preventing code from reaching logging statements

## Success Criteria

✅ **No sharp errors** in production logs  
✅ **retrieved_sources_count > 0** in DEMO_MODE logs  
✅ **Working hours questions** return specific times from documents  
✅ **No generic placeholder** responses like "od:00 do:00"  
✅ **HTTP 500** returned on embedding failures (not silent empty array)
