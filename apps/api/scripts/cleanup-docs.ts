import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { readdir } from 'fs/promises';
import { join, extname, basename as pathBasename } from 'path';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const DOCS_DIR = join(process.cwd(), 'data', 'docs');

/**
 * Removes file extension and normalizes title for comparison
 */
function normalizeTitle(filename: string): string {
  const ext = extname(filename);
  return pathBasename(filename, ext).toLowerCase().trim();
}

/**
 * Main cleanup function
 */
async function cleanup() {
  const args = process.argv.slice(2);
  const deleteFromDb = args.includes('--delete-db');
  const deleteFiles = args.includes('--delete-files');
  const dryRun = !deleteFromDb && !deleteFiles;

  try {
    // Get all files in data/docs
    const files = await readdir(DOCS_DIR);
    const txtAndMdFiles = files.filter(
      (file) => extname(file).toLowerCase() === '.txt' || extname(file).toLowerCase() === '.md'
    );

    console.log(`Found ${txtAndMdFiles.length} file(s) in data/docs\n`);

    // Get all documents from database
    const { data: dbDocuments, error: fetchError } = await supabase
      .from('documents')
      .select('id, title');

    if (fetchError) {
      console.error('Error fetching documents from database:', fetchError);
      process.exit(1);
    }

    if (!dbDocuments) {
      console.log('No documents found in database');
      return;
    }

    console.log(`Found ${dbDocuments.length} document(s) in database\n`);

    // Create a set of normalized file titles for quick lookup
    const fileTitles = new Set(txtAndMdFiles.map(f => normalizeTitle(f)));

    // Find documents in DB that don't have corresponding files
    const orphanedDocs = dbDocuments.filter(doc => {
      const normalizedTitle = normalizeTitle(doc.title || '');
      return !fileTitles.has(normalizedTitle);
    });

    // Find files that don't have corresponding documents in DB
    const missingDocs = txtAndMdFiles.filter(file => {
      const normalizedFileTitle = normalizeTitle(file);
      return !dbDocuments.some(doc => normalizeTitle(doc.title || '') === normalizedFileTitle);
    });

    if (dryRun) {
      console.log('🔍 DRY RUN MODE - No changes will be made\n');
    } else {
      console.log('⚠️  APPLY MODE - Changes will be applied\n');
    }

    // Report orphaned documents (in DB but not in files)
    if (orphanedDocs.length > 0) {
      console.log('📋 Documents in database without corresponding files:');
      console.log('─'.repeat(80));
      orphanedDocs.forEach(doc => {
        console.log(`  - ${doc.title} (ID: ${doc.id})`);
      });
      console.log('─'.repeat(80));
      console.log(`Total: ${orphanedDocs.length} document(s)\n`);

      if (deleteFromDb) {
        console.log('Deleting orphaned documents from database...\n');
        for (const doc of orphanedDocs) {
          const { error } = await supabase
            .from('documents')
            .delete()
            .eq('id', doc.id);

          if (error) {
            console.error(`✗ Error deleting ${doc.title}:`, error.message);
          } else {
            console.log(`✓ Deleted: ${doc.title}`);
          }
        }
        console.log('\n✓ Database cleanup complete');
      } else if (!dryRun) {
        console.log('💡 To delete these documents from database, run with --delete-db flag\n');
      }
    } else {
      console.log('✓ All database documents have corresponding files\n');
    }

    // Report missing documents (in files but not in DB)
    if (missingDocs.length > 0) {
      console.log('📋 Files without corresponding documents in database:');
      console.log('─'.repeat(80));
      missingDocs.forEach(file => {
        console.log(`  - ${file}`);
      });
      console.log('─'.repeat(80));
      console.log(`Total: ${missingDocs.length} file(s)\n`);
      console.log('💡 Run "npm run ingest" to add these files to the database\n');
    } else {
      console.log('✓ All files have corresponding documents in database\n');
    }

    // Option to delete files
    if (deleteFiles && orphanedDocs.length > 0) {
      console.log('⚠️  Note: --delete-files flag is for deleting files from filesystem.');
      console.log('   This is typically not needed as you should manually manage files.\n');
    }

  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

cleanup();
