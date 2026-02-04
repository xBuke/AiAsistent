/**
 * Re-embed documents for city "ploce" using OpenAI embeddings
 * This script reads all documents for the city and updates their embeddings
 * 
 * Usage:
 *   tsx scripts/re-embed-ploce.ts
 * 
 * Requires:
 *   - OPENAI_API_KEY environment variable
 *   - SUPABASE_URL environment variable
 *   - SUPABASE_SERVICE_ROLE_KEY environment variable
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { embed } from '../src/embedding.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  process.exit(1);
}

if (!process.env.OPENAI_API_KEY) {
  console.error('Error: OPENAI_API_KEY must be set');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const CITY_SLUG = process.env.CITY_SLUG || 'ploce';
const CITY_CODE = process.env.CITY_CODE || 'PL';

async function findCity() {
  // Try by slug first
  let { data: city, error: cityError } = await supabase
    .from('cities')
    .select('id, code, slug, name')
    .eq('slug', CITY_SLUG)
    .single();

  if (!cityError && city) {
    return city;
  }

  // Fallback to code (case-insensitive)
  const { data: cities } = await supabase
    .from('cities')
    .select('id, code, slug, name');

  if (cities) {
    const cityByCode = cities.find(
      c => c.code?.toLowerCase() === CITY_CODE.toLowerCase()
    );
    if (cityByCode) {
      return cityByCode;
    }

    // If still not found, show available cities
    console.error(`Error: City not found with slug="${CITY_SLUG}" or code="${CITY_CODE}"`);
    console.error('\nAvailable cities:');
    cities.forEach(c => {
      console.error(`  - code: "${c.code}", slug: "${c.slug}", name: "${c.name}"`);
    });
  }

  return null;
}

async function reEmbedDocuments() {
  try {
    // Step 1: Resolve city
    const city = await findCity();

    if (!city) {
      return 1;
    }

    console.log(`Found city: ${city.name} (code: ${city.code}, slug: ${city.slug}) - ID: ${city.id}\n`);

    // Step 2: Fetch all documents for this city
    const { data: documents, error: docsError } = await supabase
      .from('documents')
      .select('id, title, content, content_hash')
      .eq('city_id', city.id);

    if (docsError) {
      console.error('Error fetching documents:', docsError);
      return 1;
    }

    if (!documents || documents.length === 0) {
      console.log(`No documents found for city "${city.name}"`);
      return 0;
    }

    console.log(`Found ${documents.length} document(s) to re-embed\n`);

    // Step 3: Re-embed each document
    let successCount = 0;
    let errorCount = 0;

    for (const doc of documents) {
      try {
        console.log(`Processing: "${doc.title || 'Untitled'}" (${doc.id})`);
        
        if (!doc.content) {
          console.warn(`  ⚠️  Skipping - no content`);
          continue;
        }

        // Generate new embedding using OpenAI
        const embedding = await embed(doc.content);
        console.log(`  ✓ Generated embedding (${embedding.length} dimensions)`);

        // Update document with new embedding
        const { error: updateError } = await supabase
          .from('documents')
          .update({ embedding })
          .eq('id', doc.id);

        if (updateError) {
          console.error(`  ✗ Failed to update: ${updateError.message}`);
          errorCount++;
        } else {
          console.log(`  ✓ Updated successfully\n`);
          successCount++;
        }
      } catch (error) {
        console.error(`  ✗ Error processing document:`, error);
        if (error instanceof Error) {
          console.error(`     ${error.message}`);
        }
        errorCount++;
        console.log('');
      }
    }

    // Step 4: Summary
    console.log('\n' + '='.repeat(50));
    console.log('Re-embedding Summary:');
    console.log(`  Total documents: ${documents.length}`);
    console.log(`  Successfully re-embedded: ${successCount}`);
    console.log(`  Errors: ${errorCount}`);
    console.log('='.repeat(50));

    return errorCount === 0 ? 0 : 1;
  } catch (error) {
    console.error('Fatal error:', error);
    if (error instanceof Error) {
      console.error(`  ${error.message}`);
      if (error.stack) {
        console.error(`  ${error.stack}`);
      }
    }
    return 1;
  }
}

async function main() {
  let exitCode = 0;
  try {
    exitCode = await reEmbedDocuments();
  } catch (error) {
    console.error('Unhandled error:', error);
    exitCode = 1;
  } finally {
    // Ensure all async operations complete before exiting
    await new Promise(resolve => setTimeout(resolve, 100));
    process.exit(exitCode);
  }
}

main();
