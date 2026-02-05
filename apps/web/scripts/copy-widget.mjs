#!/usr/bin/env node

/**
 * Copy widget.js from dist-widget to dist after builds.
 * Cross-platform Node script (Windows-safe).
 */

import { copyFile, mkdir, access } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sourcePath = join(__dirname, '..', 'dist-widget', 'widget.js');
const destPath = join(__dirname, '..', 'dist', 'widget.js');
const destDir = join(__dirname, '..', 'dist');

async function main() {
  try {
    // Verify source file exists
    await access(sourcePath);
    console.log(`✓ Found source: ${sourcePath}`);

    // Ensure dist directory exists
    try {
      await access(destDir);
    } catch {
      await mkdir(destDir, { recursive: true });
      console.log(`✓ Created directory: ${destDir}`);
    }

    // Copy file
    await copyFile(sourcePath, destPath);
    console.log(`✓ Copied widget.js to ${destPath}`);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error(`❌ Error: Source file not found: ${sourcePath}`);
      console.error('   Make sure "npm run build:widget" completed successfully.');
      process.exit(1);
    }
    console.error(`❌ Error copying widget.js:`, error.message);
    process.exit(1);
  }
}

main();
