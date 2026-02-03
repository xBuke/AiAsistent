/**
 * One-off script to set admin_password_hash for demo city
 * This script uses the existing bcrypt helper from apps/api/src/auth/password.ts
 * 
 * Usage:
 *   npm run tsx scripts/set-demo-password.ts
 *   or
 *   tsx scripts/set-demo-password.ts
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { hashPassword } from '../src/auth/password.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment variables');
  console.error('Please check your .env file in apps/api/.env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const DEMO_PASSWORD = 'demo';
const DEMO_SLUG = 'demo';
const DEMO_CODE = 'DEMO';

async function main() {
  console.log('Setting admin_password_hash for demo city...\n');

  // Step 1: Find demo city (try slug first, then code)
  let city = null;
  let matchType = '';

  // Try by slug
  const { data: cityBySlug, error: slugError } = await supabase
    .from('cities')
    .select('id, code, slug, name, admin_password_hash')
    .eq('slug', DEMO_SLUG)
    .single();

  if (!slugError && cityBySlug) {
    city = cityBySlug;
    matchType = 'slug';
  } else {
    // Try by code
    const { data: cityByCode, error: codeError } = await supabase
      .from('cities')
      .select('id, code, slug, name, admin_password_hash')
      .eq('code', DEMO_CODE)
      .single();

    if (!codeError && cityByCode) {
      city = cityByCode;
      matchType = 'code';
    }
  }

  if (!city) {
    console.error(`Error: Demo city not found (searched by slug='${DEMO_SLUG}' and code='${DEMO_CODE}')`);
    console.error('Please run the SQL script first: apps/api/scripts/setup-demo-city.sql');
    process.exit(1);
  }

  console.log(`Found demo city (matched by ${matchType}):`);
  console.log(`  ID: ${city.id}`);
  console.log(`  Code: ${city.code}`);
  console.log(`  Slug: ${city.slug || '(null)'}`);
  console.log(`  Name: ${city.name || '(null)'}`);
  console.log(`  Current admin_password_hash: ${city.admin_password_hash ? city.admin_password_hash.substring(0, 20) + '...' : '(null)'}\n`);

  // Step 2: Generate bcrypt hash
  console.log(`Generating bcrypt hash for password: "${DEMO_PASSWORD}"...`);
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  console.log(`Generated hash: ${passwordHash.substring(0, 20)}...\n`);

  // Step 3: Update the city
  console.log('Updating admin_password_hash...');
  const { error: updateError } = await supabase
    .from('cities')
    .update({ admin_password_hash: passwordHash })
    .eq('id', city.id);

  if (updateError) {
    console.error('Error updating password hash:', updateError);
    process.exit(1);
  }

  console.log('✓ Successfully updated admin_password_hash\n');

  // Step 4: Verify the update
  const { data: updatedCity, error: verifyError } = await supabase
    .from('cities')
    .select('id, code, slug, name, admin_password_hash')
    .eq('id', city.id)
    .single();

  if (verifyError) {
    console.error('Error verifying update:', verifyError);
    process.exit(1);
  }

  console.log('Verification:');
  console.log(`  City ID: ${updatedCity.id}`);
  console.log(`  Code: ${updatedCity.code}`);
  console.log(`  Slug: ${updatedCity.slug || '(null)'}`);
  console.log(`  Admin password hash set: ${updatedCity.admin_password_hash ? 'YES' : 'NO'}`);
  console.log(`  Hash prefix: ${updatedCity.admin_password_hash ? updatedCity.admin_password_hash.substring(0, 20) + '...' : '(null)'}\n`);

  console.log('✓ Demo city is ready!');
  console.log(`  Login with: cityCode="demo", password="demo", role="admin"`);
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
