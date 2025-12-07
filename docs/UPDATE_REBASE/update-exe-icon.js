#!/usr/bin/env node
/**
 * Update Electron Executable Icon
 * 
 * Updates the icon embedded in the Electron executable (.exe file)
 * This is needed for the taskbar icon to show correctly when running from source.
 * 
 * Usage: node docs/UPDATE_REBASE/update-exe-icon.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ROOT_DIR = path.resolve(__dirname, '../..');
const ICON_PATH = path.join(ROOT_DIR, 'resources/win32/code.ico');
const PRODUCT_JSON = path.join(ROOT_DIR, 'product.json');

// Get executable name from product.json
const product = JSON.parse(fs.readFileSync(PRODUCT_JSON, 'utf8'));
const exeName = `${product.nameShort}.exe`;
const EXE_PATH = path.join(ROOT_DIR, '.build/electron', exeName);

console.log('='.repeat(60));
console.log('Updating Electron Executable Icon');
console.log('='.repeat(60));
console.log(`Icon: ${ICON_PATH}`);
console.log(`Executable: ${EXE_PATH}`);
console.log('');

// Check if files exist
if (!fs.existsSync(ICON_PATH)) {
  console.error(`❌ Icon not found: ${ICON_PATH}`);
  process.exit(1);
}

if (!fs.existsSync(EXE_PATH)) {
  console.error(`❌ Executable not found: ${EXE_PATH}`);
  console.error('Run: node build/lib/preLaunch.js (or .\\scripts\\code.bat once) to build Electron');
  process.exit(1);
}

// Update icon using rcedit
try {
  const rcedit = (await import('rcedit')).default;
  
  console.log('Updating executable icon...');
  await rcedit(EXE_PATH, { icon: ICON_PATH });
  
  console.log('✅ Icon updated successfully!');
  console.log('');
  console.log('Next steps:');
  console.log('1. Close all VS Code windows');
  console.log('2. Restart VS Code: .\\scripts\\code.bat');
  console.log('3. Clear Windows icon cache if needed:');
  console.log('   taskkill /f /im explorer.exe && start explorer.exe');
  
} catch (err) {
  console.error('❌ Error updating icon:', err.message);
  console.error('');
  console.error('Make sure rcedit is installed:');
  console.error('  npm install rcedit');
  process.exit(1);
}

