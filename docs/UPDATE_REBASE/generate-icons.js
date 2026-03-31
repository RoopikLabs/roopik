#!/usr/bin/env node
/**
 * Icon Generator Script
 *
 * Generates all required icon formats from a single source image.
 * Preserves transparency and creates all sizes needed.
 *
 * Usage:
 *   node generate-icons.js                    # Uses mylogo.png in current directory
 *   node generate-icons.js path/to/icon.png   # Uses custom path
 *
 * Configuration:
 *   Change BRAND_NAME constant at the top to customize icon file names
 *
 * Requirements:
 *   npm install sharp to-ico
 *
 * Source image: Should be at least 512x512 (1024x1024 recommended) with transparency
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// CONFIGURATION - Change this to customize brand name
// ============================================================================
const BRAND_NAME = 'roopik';  // Change this to your brand name (lowercase)

// ============================================================================

// Get current working directory (where script is run from)
const CWD = process.cwd();
const OUTPUT_DIR = path.join(CWD, 'output_icons');

// Icon definitions (uses BRAND_NAME constant)
const iconSpecs = {
  win32: [
    { name: `${BRAND_NAME}.ico`, sizes: [16, 32, 48, 256], format: 'ico' },
    { name: `${BRAND_NAME}_150x150.png`, size: 150, format: 'png' },
    { name: `${BRAND_NAME}_70x70.png`, size: 70, format: 'png' }
  ],
  darwin: [
    { name: `${BRAND_NAME}.icns`, sizes: [16, 32, 64, 128, 256, 512, 1024], format: 'icns' }
  ],
  linux: [
    { name: `${BRAND_NAME}.png`, size: 512, format: 'png' }
  ],
  server: [
    { name: `${BRAND_NAME}-192.png`, size: 192, format: 'png' },
    { name: `${BRAND_NAME}-512.png`, size: 512, format: 'png' },
    { name: `${BRAND_NAME}-favicon.ico`, sizes: [16, 32], format: 'ico' }
  ],
  workbench: [
    { name: `${BRAND_NAME}-icon.svg`, format: 'svg' }
  ],
  extensions: [
    { name: `${BRAND_NAME}-favicon.ico`, sizes: [16, 32], format: 'ico', subfolder: 'github-authentication' },
    { name: `${BRAND_NAME}-favicon.ico`, sizes: [16, 32], format: 'ico', subfolder: 'microsoft-authentication' }
  ]
};

// Colors for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function findSourceImage() {
  // If path provided as argument, use it
  if (process.argv[2]) {
    const providedPath = process.argv[2];
    // Handle relative and absolute paths
    const fullPath = path.isAbsolute(providedPath)
      ? providedPath
      : path.join(CWD, providedPath);

    if (fs.existsSync(fullPath)) {
      return fullPath;
    } else {
      log(`❌ Error: Provided image not found: ${providedPath}`, 'red');
      return null;
    }
  }

  // Default: look for mylogo.png in current directory
  const defaultPath = path.join(CWD, 'mylogo.png');
  if (fs.existsSync(defaultPath)) {
    return defaultPath;
  }

  // Also check common variations
  const variations = [
    'mylogo.PNG',
    'logo.png',
    'logo.PNG',
    'icon.png',
    'icon.PNG'
  ];

  for (const variation of variations) {
    const variantPath = path.join(CWD, variation);
    if (fs.existsSync(variantPath)) {
      log(`ℹ️  Found: ${variation} (using as source)`, 'cyan');
      return variantPath;
    }
  }

  return null;
}

async function generatePNG(sourceImage, outputPath, size) {
  const sharp = (await import('sharp')).default;
  await sharp(sourceImage)
    .resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 } // Transparent background
    })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(outputPath);
}

async function generateICO(sourceImage, outputPath, sizes) {
  const sharp = (await import('sharp')).default;
  const toIco = (await import('to-ico')).default;
  const buffers = [];

  for (const size of sizes) {
    const buffer = await sharp(sourceImage)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toBuffer();
    buffers.push(buffer);
  }

  const icoBuffer = await toIco(buffers);
  fs.writeFileSync(outputPath, icoBuffer);
}

async function generateICNS(sourceImage, outputDir, name) {
	// ICNS is macOS-specific and complex. Generate PNGs in temp folder for conversion.
	const sharp = (await import('sharp')).default;
	const sizes = [16, 32, 64, 128, 256, 512, 1024];

	// Use system temp directory instead of output folder
	const os = await import('os');
	const tempDir = path.join(os.tmpdir(), 'roopik-icns-temp');
	ensureDir(tempDir);

	log(`  Generating PNGs for ICNS conversion...`, 'cyan');

	for (const size of sizes) {
		const pngPath = path.join(tempDir, `icon_${size}x${size}.png`);
		await generatePNG(sourceImage, pngPath, size);
	}

	log(`  ⚠️  ICNS requires macOS tools. PNGs generated in: ${tempDir}`, 'yellow');
	log(`  Convert using: iconutil -c icns ${tempDir} -o ${path.join(outputDir, name)}`, 'yellow');
	log(`  Or use online tool: https://cloudconvert.com/png-to-icns`, 'yellow');
	log(`  Note: Temp folder will be cleaned up automatically`, 'cyan');
}

async function copySVG(sourceImage, outputPath) {
  if (path.extname(sourceImage).toLowerCase() === '.svg') {
    fs.copyFileSync(sourceImage, outputPath);
    return true;
  }
  return false;
}

async function main() {
  const sourceImage = findSourceImage();

  if (!sourceImage) {
    log('❌ Error: Source image not found', 'red');
    log('', 'reset');
    log('Usage:', 'cyan');
    log('  node generate-icons.js                    # Uses mylogo.png in current directory', 'cyan');
    log('  node generate-icons.js path/to/icon.png     # Uses custom path', 'cyan');
    log('', 'reset');
    log('Looking for:', 'yellow');
    log('  - mylogo.png (default)', 'yellow');
    log('  - logo.png', 'yellow');
    log('  - icon.png', 'yellow');
    log('  - Or provide path as argument', 'yellow');
    process.exit(1);
  }

  // Check if sharp is available
  let sharp, toIco;
  try {
    sharp = (await import('sharp')).default;
    toIco = (await import('to-ico')).default;
  } catch (err) {
    log('❌ Error: Required packages not installed', 'red');
    log('Install with: npm install sharp to-ico', 'yellow');
    process.exit(1);
  }

  log('\n' + '='.repeat(60), 'cyan');
  log(`${BRAND_NAME.toUpperCase()} IDE - Icon Generator`, 'cyan');
  log('='.repeat(60) + '\n', 'cyan');

  log(`Source: ${path.relative(CWD, sourceImage)}`, 'cyan');
  log(`Output: ${path.relative(CWD, OUTPUT_DIR)}\n`, 'cyan');

  // Create output directory structure
  ensureDir(OUTPUT_DIR);
  for (const category of Object.keys(iconSpecs)) {
    if (category === 'extensions') {
      // Extensions have subfolders
      ensureDir(path.join(OUTPUT_DIR, category, 'github-authentication'));
      ensureDir(path.join(OUTPUT_DIR, category, 'microsoft-authentication'));
    } else {
      ensureDir(path.join(OUTPUT_DIR, category));
    }
  }

  let totalGenerated = 0;
  let totalSkipped = 0;

  // Generate icons
  for (const [category, icons] of Object.entries(iconSpecs)) {
    log(`📁 ${category}/`, 'cyan');

    for (const icon of icons) {
      // Handle extension subfolders
      let outputPath;
      if (category === 'extensions' && icon.subfolder) {
        outputPath = path.join(OUTPUT_DIR, category, icon.subfolder, icon.name);
      } else {
        outputPath = path.join(OUTPUT_DIR, category, icon.name);
      }

      try {
        if (icon.format === 'png' && icon.size) {
          await generatePNG(sourceImage, outputPath, icon.size);
          log(`  ✅ ${icon.name} (${icon.size}x${icon.size})`, 'green');
          totalGenerated++;
        } else if (icon.format === 'ico' && icon.sizes) {
          await generateICO(sourceImage, outputPath, icon.sizes);
          log(`  ✅ ${icon.name} (${icon.sizes.join(', ')}px)`, 'green');
          totalGenerated++;
        } else if (icon.format === 'icns') {
          await generateICNS(sourceImage, path.join(OUTPUT_DIR, category), icon.name);
          totalSkipped++; // ICNS needs manual conversion
        } else if (icon.format === 'svg') {
          if (await copySVG(sourceImage, outputPath)) {
            log(`  ✅ ${icon.name} (copied)`, 'green');
            totalGenerated++;
          } else {
            log(`  ⚠️  ${icon.name} - Source is not SVG, please provide SVG separately`, 'yellow');
            totalSkipped++;
          }
        }
      } catch (err) {
        log(`  ❌ ${icon.name} - Error: ${err.message}`, 'red');
        totalSkipped++;
      }
    }

    log('');
  }

  // Summary
  log('='.repeat(60), 'cyan');
  log('Summary', 'cyan');
  log('='.repeat(60), 'cyan');
  log(`✅ Generated: ${totalGenerated} icon(s)`, 'green');
  if (totalSkipped > 0) {
    log(`⚠️  Skipped: ${totalSkipped} icon(s) (see notes above)`, 'yellow');
  }
  log(`\n📁 All icons saved to: ${path.relative(CWD, OUTPUT_DIR)}`, 'cyan');
  log('📋 Next: Copy icons from output_icons/ to branding/icons/', 'cyan');
  log('');
}

main().catch(err => {
  log(`❌ Fatal error: ${err.message}`, 'red');
  if (err.stack) {
    log(err.stack, 'red');
  }
  process.exit(1);
});

