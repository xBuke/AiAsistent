import { readdir, rename, access } from 'fs/promises';
import { join, extname, basename } from 'path';

const DOCS_DIR = join(process.cwd(), 'data', 'docs');

// Technical prefixes to remove
const TECHNICAL_PREFIXES = [
  'city_budget_',
  'city_office_info_',
  'forms_',
  'contacts_',
];

/**
 * Removes leading year prefixes (e.g., "2017_", "2018_")
 */
function removeLeadingYearPrefix(filename: string): string {
  const yearPrefixMatch = filename.match(/^(\d{4})_/);
  if (yearPrefixMatch) {
    return filename.substring(yearPrefixMatch[0].length);
  }
  return filename;
}

/**
 * Removes technical prefixes from filename
 */
function removeTechnicalPrefixes(filename: string): string {
  let result = filename;
  for (const prefix of TECHNICAL_PREFIXES) {
    if (result.startsWith(prefix)) {
      result = result.substring(prefix.length);
    }
  }
  return result;
}

/**
 * Extracts the most relevant year from filename
 * Prefers explicit years like 2024, 2023, 2022
 * Ignores 2017 if it's only a prefix (already removed)
 */
function extractYear(filename: string): string | null {
  // Find all 4-digit years in the filename
  const yearMatches = filename.match(/\b(19|20)\d{2}\b/g);
  if (!yearMatches || yearMatches.length === 0) {
    return null;
  }
  
  // Filter out 2017 if it appears (likely noise from prefix)
  const relevantYears = yearMatches.filter(y => y !== '2017');
  
  if (relevantYears.length > 0) {
    // Return the most recent year found
    return relevantYears.sort().reverse()[0];
  }
  
  // If only 2017 found, return null (don't include it)
  return null;
}

/**
 * Normalizes filename:
 * - Converts kebab-case to Title Case words
 * - Replaces _ and multiple - with single -
 * - Removes .txt extension for processing
 */
function normalizeName(filename: string): string {
  // Remove extension
  const nameWithoutExt = basename(filename, extname(filename));
  
  // Replace underscores and multiple dashes with single dash
  let normalized = nameWithoutExt
    .replace(/_/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing dashes
  
  // Convert kebab-case to Title Case
  const words = normalized.split('-');
  const titleCaseWords = words.map(word => {
    if (word.length === 0) return '';
    // Handle special cases like "hr" at the end
    if (word.toLowerCase() === 'hr' || word.toLowerCase() === 'plocehr') {
      return '';
    }
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).filter(word => word.length > 0);
  
  return titleCaseWords.join('-');
}

/**
 * Checks if filename already matches clean convention
 * (no leading year prefix, no technical prefixes)
 */
function isAlreadyClean(filename: string): boolean {
  // Check if it starts with a year prefix
  if (/^\d{4}_/.test(filename)) {
    return false;
  }
  
  // Check if it starts with any technical prefix
  for (const prefix of TECHNICAL_PREFIXES) {
    if (filename.startsWith(prefix)) {
      return false;
    }
  }
  
  return true;
}

/**
 * Removes year from normalized name if present
 */
function removeYearFromName(normalized: string, year: string | null): string {
  if (!year) return normalized;
  
  // Remove year if it appears at the end (with or without dash)
  let result = normalized.replace(new RegExp(`-${year}$`), '');
  if (result === normalized) {
    // Try without dash
    result = normalized.replace(new RegExp(`${year}$`), '');
  }
  
  // Also remove year if it appears in the middle (e.g., "Za-2021" -> "Za")
  result = result.replace(new RegExp(`-${year}-`, 'g'), '-');
  
  // Clean up any double dashes or trailing dashes
  result = result.replace(/-+/g, '-').replace(/^-+|-+$/g, '');
  
  return result;
}

/**
 * Generates the final filename
 */
function generateNewFilename(oldFilename: string): string {
  // Step 1: Extract year first (before normalization)
  const year = extractYear(oldFilename);
  
  // Step 2: Remove leading year prefix
  let processed = removeLeadingYearPrefix(oldFilename);
  
  // Step 3: Remove technical prefixes
  processed = removeTechnicalPrefixes(processed);
  
  // Step 4: Normalize the name
  let normalized = normalizeName(processed);
  
  // Step 5: Remove year from normalized name if it's already there
  normalized = removeYearFromName(normalized, year);
  
  // Step 6: Construct final filename
  let finalName = normalized;
  if (year) {
    finalName = `${normalized}-${year}`;
  }
  
  // Add .txt extension
  return `${finalName}.txt`;
}

/**
 * Checks if a file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Generates a unique filename if target already exists
 */
async function getUniqueFilename(targetDir: string, baseFilename: string): Promise<string> {
  const basePath = join(targetDir, baseFilename);
  
  if (!(await fileExists(basePath))) {
    return baseFilename;
  }
  
  const ext = extname(baseFilename);
  const nameWithoutExt = basename(baseFilename, ext);
  
  let counter = 2;
  let candidate: string;
  do {
    candidate = `${nameWithoutExt}-${counter}${ext}`;
    counter++;
  } while (await fileExists(join(targetDir, candidate)));
  
  return candidate;
}

interface RenamePlan {
  oldName: string;
  newName: string;
}

/**
 * Main function to process files
 */
async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const dryRun = !apply;
  
  try {
    const files = await readdir(DOCS_DIR);
    const txtFiles = files.filter(
      (file) => extname(file).toLowerCase() === '.txt'
    );
    
    if (txtFiles.length === 0) {
      console.log('No .txt files found in data/docs');
      return;
    }
    
    console.log(`Found ${txtFiles.length} .txt file(s) to process...\n`);
    
    if (dryRun) {
      console.log('🔍 DRY RUN MODE - No files will be renamed\n');
    } else {
      console.log('⚠️  APPLY MODE - Files will be renamed\n');
    }
    
    const renamePlans: RenamePlan[] = [];
    
    // Generate rename plans
    for (const file of txtFiles) {
      // Skip files that already match clean convention
      if (isAlreadyClean(file)) {
        continue;
      }
      
      const newFilename = generateNewFilename(file);
      const uniqueNewFilename = await getUniqueFilename(DOCS_DIR, newFilename);
      
      if (file !== uniqueNewFilename) {
        renamePlans.push({
          oldName: file,
          newName: uniqueNewFilename,
        });
      }
    }
    
    if (renamePlans.length === 0) {
      console.log('✓ No files need renaming');
      return;
    }
    
    // Print table header
    console.log('Planned renames:');
    console.log('─'.repeat(80));
    console.log(`${'OLD NAME'.padEnd(50)} -> ${'NEW NAME'}`);
    console.log('─'.repeat(80));
    
    // Print rename plans
    for (const plan of renamePlans) {
      console.log(`${plan.oldName.padEnd(50)} -> ${plan.newName}`);
    }
    
    console.log('─'.repeat(80));
    console.log(`\nTotal: ${renamePlans.length} file(s) to rename\n`);
    
    // Apply renames if not dry run
    if (apply) {
      console.log('Applying renames...\n');
      for (const plan of renamePlans) {
        const oldPath = join(DOCS_DIR, plan.oldName);
        const newPath = join(DOCS_DIR, plan.newName);
        try {
          await rename(oldPath, newPath);
          console.log(`✓ Renamed: ${plan.oldName} -> ${plan.newName}`);
        } catch (error) {
          console.error(`✗ Error renaming ${plan.oldName}:`, error);
        }
      }
      console.log('\n✓ Rename operation complete');
    } else {
      console.log('💡 To apply these renames, run with --apply flag');
    }
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

main();
