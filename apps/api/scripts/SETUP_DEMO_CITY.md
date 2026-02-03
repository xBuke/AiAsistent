# Setup Demo City - Instructions

This guide provides SQL and a Node.js script to set up a demo city that can be used for testing login with `cityCode="demo"` and `password="demo"`.

## Overview

The backend uses **bcrypt** (with SALT_ROUNDS=10) for password hashing, which cannot be generated in pure SQL. Therefore, we use a two-step approach:

1. **SQL script** - Ensures the demo city exists (without password hash)
2. **Node.js script** - Sets the bcrypt password hash

## Step 1: Run SQL Script

Run the SQL script in your Supabase SQL editor:

**File:** `apps/api/scripts/setup-demo-city.sql`

This script:
- ✅ Detects if `slug` and/or `code` columns exist
- ✅ Adds `slug` column if missing
- ✅ Ensures demo city exists with:
  - `slug = 'demo'` (if slug column exists)
  - `code = 'DEMO'` (if code column exists)
- ✅ Sets a temporary placeholder for `admin_password_hash` (will be updated by script)
- ✅ Is **idempotent** (safe to run multiple times)
- ✅ Does **NOT** modify or delete existing cities

### Verification Queries

After running the SQL, you should see verification queries that show:
- Demo city exists by slug
- Demo city exists by code
- Password hash status (should show `NEEDS_PASSWORD_HASH`)

## Step 2: Run Node.js Script

After the SQL script completes, run the Node.js script to set the bcrypt password hash:

**File:** `apps/api/scripts/set-demo-password.ts`

### How to Run

From the `apps/api` directory:

```bash
# Option 1: Using npm script (if added to package.json)
npm run tsx scripts/set-demo-password.ts

# Option 2: Direct tsx command
tsx scripts/set-demo-password.ts

# Option 3: Using npx
npx tsx scripts/set-demo-password.ts
```

### What It Does

1. Finds the demo city (by slug='demo' or code='DEMO')
2. Generates bcrypt hash for password "demo"
3. Updates `admin_password_hash` in the database
4. Verifies the update was successful

### Prerequisites

- Node.js installed
- Dependencies installed (`npm install` in `apps/api`)
- `.env` file configured with:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`

## Step 3: Verify Login

After both scripts complete, you should be able to login with:

```json
POST /admin/login
{
  "cityCode": "demo",
  "password": "demo",
  "role": "admin"
}
```

The backend will:
1. Try to resolve city by `slug='demo'` first
2. Fallback to `code='DEMO'` if slug doesn't match
3. Verify password against `admin_password_hash` using bcrypt

## Troubleshooting

### "Demo city not found" error

- Make sure you ran the SQL script first
- Check that the city exists: `SELECT * FROM cities WHERE slug = 'demo' OR code = 'DEMO';`

### "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"

- Check your `apps/api/.env` file
- Ensure the file is in the correct location
- Restart your terminal/IDE after adding environment variables

### Password hash not updating

- Check that you're using `SUPABASE_SERVICE_ROLE_KEY` (not `SUPABASE_ANON_KEY`)
- Verify the script has write permissions to the cities table
- Check Supabase RLS (Row Level Security) policies

## Files Created

- `apps/api/scripts/setup-demo-city.sql` - SQL script for Supabase
- `apps/api/scripts/set-demo-password.ts` - Node.js script to set password hash
- `apps/api/scripts/SETUP_DEMO_CITY.md` - This documentation
