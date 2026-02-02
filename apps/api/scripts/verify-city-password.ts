import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { verifyPassword } from '../src/auth/password.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Normalize command line argument by stripping one layer of surrounding quotes
 */
function normalizeArg(v: unknown): string {
  const s = String(v ?? "");
  // Strip ONE layer of surrounding quotes if present
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

/**
 * Parse command line arguments
 */
function parseArgs(): { slug: string; role: 'admin' | 'inbox'; password: string; passwordRaw: string } {
  const args = process.argv.slice(2);
  let slug = '';
  let role: 'admin' | 'inbox' = 'admin';
  let password = '';
  let passwordRaw = '';

  for (const arg of args) {
    if (arg.startsWith('--slug=')) {
      slug = normalizeArg(arg.split('=')[1]);
    } else if (arg.startsWith('--role=')) {
      const roleValue = normalizeArg(arg.split('=')[1]);
      if (roleValue === 'admin' || roleValue === 'inbox') {
        role = roleValue;
      }
    } else if (arg.startsWith('--password=')) {
      passwordRaw = arg.split('=')[1];
      password = normalizeArg(passwordRaw);
    }
  }

  if (!slug || !password) {
    console.error('Error: Missing required arguments');
    console.error('Usage: node --import tsx scripts/verify-city-password.ts --slug=<slug> --role=<admin|inbox> --password=<password>');
    process.exit(1);
  }

  return { slug, role, password, passwordRaw };
}

/**
 * Main function
 */
async function main() {
  const { slug, role, password, passwordRaw } = parseArgs();

  // Safe diagnostics: check if raw password started with quotes
  const passwordStartsWithQuote = passwordRaw.startsWith('"') || passwordRaw.startsWith("'");
  const passwordLen = password.length;

  try {
    // Fetch city by slug
    const { data: city, error: cityError } = await supabase
      .from('cities')
      .select('slug, admin_password_hash, inbox_password_hash')
      .eq('slug', slug)
      .single();

    if (cityError || !city) {
      console.error(`Error: City with slug "${slug}" not found`);
      process.exit(1);
    }

    // Choose hash by role
    const hashToCheck = role === 'admin' 
      ? city.admin_password_hash 
      : city.inbox_password_hash;

    if (!hashToCheck) {
      console.error(`Error: No ${role} password hash found for city "${slug}"`);
      process.exit(1);
    }

    // Verify password
    const match = await verifyPassword(password, hashToCheck);

    // Print results
    const hashPrefix = hashToCheck.slice(0, 4);
    const hashLen = hashToCheck.length;

    console.log('─'.repeat(80));
    console.log('Password Verification Result');
    console.log('─'.repeat(80));
    console.log(`Slug:        ${slug}`);
    console.log(`Role:        ${role}`);
    console.log(`Hash Prefix: ${hashPrefix}`);
    console.log(`Hash Length: ${hashLen}`);
    console.log(`Password Length (after normalization): ${passwordLen}`);
    console.log(`Password started with quote: ${passwordStartsWithQuote}`);
    console.log(`MATCH:       ${match}`);
    console.log('─'.repeat(80));
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
