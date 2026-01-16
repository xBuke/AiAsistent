import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { readdir, readFile } from 'fs/promises';
import { join, extname, basename } from 'path';
import { createHash } from 'crypto';
import { embed } from '../src/embedding.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const DOCS_DIR = join(process.cwd(), 'data', 'docs');
const MAX_EMBED_CHARS = 12000;

async function parseSourceUrl(content: string): Promise<string> {
  const lines = content.split('\n');
  for (const line of lines) {
    if (line.startsWith('SOURCE:')) {
      const url = line.replace(/^SOURCE:\s*/i, '').trim();
      return url;
    }
  }
  return '';
}

function extractContentForEmbedding(content: string): string {
  const lines = content.split('\n');
  const contentLines: string[] = [];
  let foundSeparator = false;
  
  for (const line of lines) {
    // Skip metadata lines at the start
    if (!foundSeparator) {
      if (line.match(/^(TITLE|TYPE|DATE|SOURCE):/i)) {
        continue;
      }
      if (line.trim() === '---') {
        foundSeparator = true;
        continue;
      }
    }
    
    // After separator or if no separator found, include the line
    if (foundSeparator || contentLines.length > 0 || line.trim() !== '') {
      contentLines.push(line);
    }
  }
  
  const extracted = contentLines.join('\n');
  return extracted.length > MAX_EMBED_CHARS 
    ? extracted.substring(0, MAX_EMBED_CHARS) 
    : extracted;
}

async function ingestFile(filePath: string): Promise<void> {
  try {
    const content = await readFile(filePath, 'utf-8');
    const contentHash = createHash('sha256').update(content).digest('hex');
    
    const filename = basename(filePath);
    const ext = extname(filename);
    const title = basename(filename, ext);
    
    const sourceUrl = await parseSourceUrl(content);
    
    // Extract content for embedding and compute embedding
    let embedding: number[] | null = null;
    try {
      const contentForEmbedding = extractContentForEmbedding(content);
      embedding = await embed(contentForEmbedding);
    } catch (error) {
      console.warn(`Warning: Failed to generate embedding for ${filename}:`, error);
    }
    
    const { error } = await supabase
      .from('documents')
      .upsert(
        {
          title,
          source_url: sourceUrl,
          content,
          content_hash: contentHash,
          embedding: embedding || null,
        },
        {
          onConflict: 'content_hash',
        }
      );
    
    if (error) {
      console.error(`Error upserting ${filename}:`, error.message);
    } else {
      console.log(`✓ Processed: ${filename}${embedding ? ' (with embedding)' : ' (without embedding)'}`);
    }
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error);
  }
}

async function main() {
  try {
    const files = await readdir(DOCS_DIR);
    const txtAndMdFiles = files.filter(
      (file) => extname(file).toLowerCase() === '.txt' || extname(file).toLowerCase() === '.md'
    );
    
    if (txtAndMdFiles.length === 0) {
      console.log('No .txt or .md files found in data/docs');
      return;
    }
    
    console.log(`Found ${txtAndMdFiles.length} file(s) to process...\n`);
    
    for (const file of txtAndMdFiles) {
      const filePath = join(DOCS_DIR, file);
      await ingestFile(filePath);
    }
    
    console.log('\n✓ Ingestion complete');
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

main();
