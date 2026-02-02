import { hashPassword } from '../src/auth/password.js';

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
function parseArgs(): { slug: string; adminPassword: string; inboxPassword: string; adminPasswordRaw: string; inboxPasswordRaw: string } {
  const args = process.argv.slice(2);
  let slug = '';
  let adminPassword = '';
  let inboxPassword = '';
  let adminPasswordRaw = '';
  let inboxPasswordRaw = '';

  for (const arg of args) {
    if (arg.startsWith('--slug=')) {
      slug = normalizeArg(arg.split('=')[1]);
    } else if (arg.startsWith('--adminPassword=')) {
      adminPasswordRaw = arg.split('=')[1];
      adminPassword = normalizeArg(adminPasswordRaw);
    } else if (arg.startsWith('--inboxPassword=')) {
      inboxPasswordRaw = arg.split('=')[1];
      inboxPassword = normalizeArg(inboxPasswordRaw);
    }
  }

  if (!slug || !adminPassword || !inboxPassword) {
    console.error('Error: Missing required arguments');
    console.error('Usage: npm run gen:city-passwords -- --slug=<slug> --adminPassword=<password> --inboxPassword=<password>');
    console.error('   or: tsx scripts/gen-city-passwords.ts --slug=<slug> --adminPassword=<password> --inboxPassword=<password>');
    process.exit(1);
  }

  return { slug, adminPassword, inboxPassword, adminPasswordRaw, inboxPasswordRaw };
}

/**
 * Main function
 */
async function main() {
  const { slug, adminPassword, inboxPassword, adminPasswordRaw, inboxPasswordRaw } = parseArgs();

  // Safe diagnostics: check if raw passwords started with quotes
  const adminStartsWithQuote = adminPasswordRaw.startsWith('"') || adminPasswordRaw.startsWith("'");
  const inboxStartsWithQuote = inboxPasswordRaw.startsWith('"') || inboxPasswordRaw.startsWith("'");
  const adminPasswordLen = adminPassword.length;
  const inboxPasswordLen = inboxPassword.length;

  console.log('Generating password hashes...\n');
  console.log(`Slug: ${slug}\n`);
  console.log('Safe Diagnostics:');
  console.log(`  Admin password length (after normalization): ${adminPasswordLen}`);
  console.log(`  Admin password started with quote: ${adminStartsWithQuote}`);
  console.log(`  Inbox password length (after normalization): ${inboxPasswordLen}`);
  console.log(`  Inbox password started with quote: ${inboxStartsWithQuote}\n`);

  // Generate hashes
  const adminHash = await hashPassword(adminPassword);
  const inboxHash = await hashPassword(inboxPassword);

  console.log('Generated hashes:');
  console.log('─'.repeat(80));
  console.log(`Admin hash: ${adminHash}`);
  console.log(`Inbox hash: ${inboxHash}`);
  console.log('─'.repeat(80));
  console.log('\nSQL Update Statement:');
  console.log('─'.repeat(80));
  console.log(`update public.cities`);
  console.log(`set admin_password_hash = '${adminHash}',`);
  console.log(`    inbox_password_hash = '${inboxHash}'`);
  console.log(`where slug = '${slug}';`);
  console.log('─'.repeat(80));
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
