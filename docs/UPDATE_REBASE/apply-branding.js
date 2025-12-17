#!/usr/bin/env node

/**
 * ROOPIK IDE - Branding Application Script
 *
 * This script applies Roopik branding to the VS Code fork after rebasing with upstream.
 * It replaces icons, updates text references, and ensures consistent branding across the codebase.
 *
 * Usage: node docs/UPDATE_REBASE/apply-branding.js [--dry-run] [--skip-icons] [--init]
 *
 * Options:
 *   --dry-run    Show what would be changed without making changes
 *   --skip-icons Skip icon file replacements (useful if icons don't exist yet)
 *   --init       Create branding directory structure with placeholder files
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const ROOT_DIR = path.resolve(__dirname, '../..');
const BRANDING_DIR = path.join(ROOT_DIR, 'branding');
const BRANDING_ICONS_DIR = path.join(BRANDING_DIR, 'icons');
const CONFIG_FILE = path.join(__dirname, 'branding-config.json');
const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_ICONS = process.argv.includes('--skip-icons');
const INIT_MODE = process.argv.includes('--init');

// Color output helpers
const colors = {
	reset: '\x1b[0m',
	bright: '\x1b[1m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	red: '\x1b[31m',
	blue: '\x1b[34m',
	cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
	console.log(`${colors[color]}${message}${colors.reset}`);
}

function error(message) {
	log(`❌ ${message}`, 'red');
}

function success(message) {
	log(`✅ ${message}`, 'green');
}

function info(message) {
	log(`ℹ️  ${message}`, 'cyan');
}

function warning(message) {
	log(`⚠️  ${message}`, 'yellow');
}

// Load branding configuration
function loadConfig() {
	try {
		const configContent = fs.readFileSync(CONFIG_FILE, 'utf8');
		return JSON.parse(configContent);
	} catch (err) {
		error(`Failed to load branding config: ${CONFIG_FILE}`);
		error(`Error: ${err.message}`);
		process.exit(1);
	}
}

// File operations
function readFile(filePath) {
	try {
		return fs.readFileSync(filePath, 'utf8');
	} catch (err) {
		error(`Cannot read file: ${filePath}`);
		return null;
	}
}

function writeFile(filePath, content) {
	try {
		if (!DRY_RUN) {
			fs.writeFileSync(filePath, content, 'utf8');
		}
		return true;
	} catch (err) {
		error(`Cannot write file: ${filePath}: ${err.message}`);
		return false;
	}
}

function fileExists(filePath) {
	return fs.existsSync(filePath);
}

function copyFile(src, dest) {
	try {
		if (!DRY_RUN) {
			fs.copyFileSync(src, dest);
		}
		return true;
	} catch (err) {
		error(`Cannot copy ${src} to ${dest}: ${err.message}`);
		return false;
	}
}

function ensureDirectory(dirPath) {
	if (!fileExists(dirPath)) {
		if (!DRY_RUN) {
			fs.mkdirSync(dirPath, { recursive: true });
		}
		return true;
	}
	return false;
}

// Initialize branding directory structure
function initializeBrandingStructure(config) {
	log('\n' + '='.repeat(60), 'bright');
	log('ROOPIK IDE - Initializing Branding Structure', 'bright');
	log('='.repeat(60) + '\n', 'bright');

	const created = [];
	const skipped = [];

	// Create main branding directory
	if (ensureDirectory(BRANDING_DIR)) {
		created.push('branding/');
	} else {
		skipped.push('branding/ (already exists)');
	}

	// Create icon subdirectories and placeholder files
	const iconCategories = ['win32', 'darwin', 'linux', 'server', 'workbench', 'extensions'];

	for (const category of iconCategories) {
		const icons = config.icons[category] || [];

		if (icons.length > 0) {
			// Handle extensions category with subfolders
			if (category === 'extensions') {
				// Group icons by their source directory
				const iconGroups = {};
				for (const icon of icons) {
					const sourceDir = path.dirname(icon.source);
					if (!iconGroups[sourceDir]) {
						iconGroups[sourceDir] = [];
					}
					iconGroups[sourceDir].push(icon);
				}

				// Create subfolders for each extension
				for (const [sourceDir, groupIcons] of Object.entries(iconGroups)) {
					const subfolderName = path.basename(path.dirname(sourceDir)); // e.g., "github-authentication"
					const categoryDir = path.join(BRANDING_ICONS_DIR, category, subfolderName);

					if (ensureDirectory(categoryDir)) {
						created.push(`branding/icons/${category}/${subfolderName}/`);
					}

					// Create placeholder files
					for (const icon of groupIcons) {
						const placeholderPath = path.join(categoryDir, icon.target);

						if (fileExists(placeholderPath)) {
							skipped.push(`branding/icons/${category}/${subfolderName}/${icon.target} (already exists)`);
							continue;
						}

						const placeholderContent = `# PLACEHOLDER: ${icon.description}

This is a placeholder file. Replace this file with your actual ${icon.target} icon.

Requirements:
- Format: ${icon.format.toUpperCase()}
- Sizes: ${icon.sizes}
- Description: ${icon.description}

Source file: ${icon.source} (VS Code default)
Target file: ${icon.target} (Your Roopik icon)

Once you place your icon file here, run:
  node docs/UPDATE_REBASE/apply-branding.js

The script will automatically copy this icon to replace the VS Code default.
`;

						if (writeFile(placeholderPath, placeholderContent)) {
							created.push(`branding/icons/${category}/${subfolderName}/${icon.target} (placeholder)`);
						}
					}
				}
			} else {
				// Regular categories
				const categoryDir = path.join(BRANDING_ICONS_DIR, category);

				if (ensureDirectory(categoryDir)) {
					created.push(`branding/icons/${category}/`);
				}

				// Create placeholder files
				for (const icon of icons) {
					const placeholderPath = path.join(categoryDir, icon.target);

					if (fileExists(placeholderPath)) {
						skipped.push(`branding/icons/${category}/${icon.target} (already exists)`);
						continue;
					}

					const placeholderContent = `# PLACEHOLDER: ${icon.description}

This is a placeholder file. Replace this file with your actual ${icon.target} icon.

Requirements:
- Format: ${icon.format.toUpperCase()}
- Sizes: ${icon.sizes}
- Description: ${icon.description}

Source file: ${icon.source} (VS Code default)
Target file: ${icon.target} (Your Roopik icon)

Once you place your icon file here, run:
  node docs/UPDATE_REBASE/apply-branding.js

The script will automatically copy this icon to replace the VS Code default.
`;

					if (writeFile(placeholderPath, placeholderContent)) {
						created.push(`branding/icons/${category}/${icon.target} (placeholder)`);
					}
				}
			}
		}
	}

	// Summary
	log('\n' + '='.repeat(60), 'bright');
	log('Initialization Summary', 'bright');
	log('='.repeat(60), 'bright');

	if (created.length > 0) {
		success(`✓ Created ${created.length} item(s):`);
		created.forEach(item => log(`   • ${item}`, 'green'));
	}

	if (skipped.length > 0) {
		warning(`⚠ Skipped ${skipped.length} item(s) (already exist):`);
		skipped.forEach(item => log(`   • ${item}`, 'yellow'));
	}

	log('\n📝 Next Steps:', 'cyan');
	log('1. Replace placeholder files in branding/icons/ with your actual icon files', 'cyan');
	log('2. Run: node docs/UPDATE_REBASE/apply-branding.js', 'cyan');
	log('');
}

// Apply product.json updates
function updateProductJson(config) {
	const filePath = path.join(ROOT_DIR, 'product.json');

	if (!fileExists(filePath)) {
		warning('product.json not found (skipping)');
		return { updated: false, errors: 0 };
	}

	const content = readFile(filePath);
	if (!content) {
		return { updated: false, errors: 1 };
	}

	try {
		const product = JSON.parse(content);
		const productConfig = config.product;
		let needsUpdate = false;

		// Check and update each field
		for (const [key, value] of Object.entries(productConfig)) {
			// Handle arrays - deep compare
			if (Array.isArray(value) && Array.isArray(product[key])) {
				const arraysEqual = value.length === product[key].length &&
					value.every((item, index) => item === product[key][index]);
				if (!arraysEqual) {
					product[key] = value;
					needsUpdate = true;
				}
			} else if (product[key] !== value) {
				product[key] = value;
				needsUpdate = true;
			}
		}

		if (needsUpdate) {
			const updated = JSON.stringify(product, null, '\t') + '\n';
			if (writeFile(filePath, updated)) {
				success('product.json - Updated');
				return { updated: true, errors: 0 };
			} else {
				error('product.json - Failed to update');
				return { updated: false, errors: 1 };
			}
		} else {
			success('product.json - Already correct');
			return { updated: false, errors: 0 };
		}
	} catch (err) {
		error(`product.json - Parse error: ${err.message}`);
		return { updated: false, errors: 1 };
	}
}

// Apply package.json updates
function updatePackageJson(config) {
	const filePath = path.join(ROOT_DIR, 'package.json');

	if (!fileExists(filePath)) {
		warning('package.json not found (skipping)');
		return { updated: false, errors: 0 };
	}

	const content = readFile(filePath);
	if (!content) {
		return { updated: false, errors: 1 };
	}

	try {
		const pkg = JSON.parse(content);
		const pkgConfig = config.package;
		let needsUpdate = false;

		// Update name
		if (pkg.name !== pkgConfig.name) {
			pkg.name = pkgConfig.name;
			needsUpdate = true;
		}

		// Update author
		if (pkgConfig.author) {
			if (!pkg.author || pkg.author.name !== pkgConfig.author.name) {
				pkg.author = pkgConfig.author;
				needsUpdate = true;
			}
		}

		// Update repository (preserve existing fields like "type")
		if (pkgConfig.repository) {
			if (!pkg.repository) {
				pkg.repository = pkgConfig.repository;
				needsUpdate = true;
			} else {
				// Only update URL, preserve other fields like "type"
				if (pkg.repository.url !== pkgConfig.repository.url) {
					pkg.repository.url = pkgConfig.repository.url;
					needsUpdate = true;
				}
			}
		}

		// Update bugs
		if (pkgConfig.bugs) {
			if (!pkg.bugs || pkg.bugs.url !== pkgConfig.bugs.url) {
				pkg.bugs = pkgConfig.bugs;
				needsUpdate = true;
			}
		}

		if (needsUpdate) {
			const updated = JSON.stringify(pkg, null, 2) + '\n';
			if (writeFile(filePath, updated)) {
				success('package.json - Updated');
				return { updated: true, errors: 0 };
			} else {
				error('package.json - Failed to update');
				return { updated: false, errors: 1 };
			}
		} else {
			success('package.json - Already correct');
			return { updated: false, errors: 0 };
		}
	} catch (err) {
		error(`package.json - Parse error: ${err.message}`);
		return { updated: false, errors: 1 };
	}
}

// Apply text replacements
function applyTextReplacements(config) {
	let totalChanges = 0;
	let totalErrors = 0;

	for (const replacement of config.textReplacements || []) {
		const filePath = path.join(ROOT_DIR, replacement.file);

		if (!fileExists(filePath)) {
			warning(`${replacement.file} - Not found (skipping)`);
			continue;
		}

		let content = readFile(filePath);
		if (!content) {
			totalErrors++;
			continue;
		}

		let modified = false;
		for (const repl of replacement.replacements) {
			if (content.includes(repl.search)) {
				content = content.replace(repl.search, repl.replace);
				modified = true;
			}
		}

		if (modified) {
			if (writeFile(filePath, content)) {
				success(`${replacement.file} - Updated`);
				totalChanges++;
			} else {
				error(`${replacement.file} - Failed to update`);
				totalErrors++;
			}
		} else {
			success(`${replacement.file} - Already correct`);
		}
	}

	return { changes: totalChanges, errors: totalErrors };
}

// Apply eslint.config.js updates
function updateEslintConfig() {
	const filePath = path.join(ROOT_DIR, 'eslint.config.js');

	if (!fileExists(filePath)) {
		warning('eslint.config.js not found (skipping)');
		return { updated: false, errors: 0 };
	}

	const content = readFile(filePath);
	if (!content) {
		return { updated: false, errors: 1 };
	}

	// Check if override block already exists
	if (content.includes('// ROOPIK: Override header rule for roopik extension')) {
		success('eslint.config.js - Override block already exists');
		return { updated: false, errors: 0 };
	}

	// Find the final closing - just the ); at the end
	// Use a regex to handle different line ending styles
	const closingPattern = /\n\);\s*$/;

	if (!closingPattern.test(content)) {
		warning('eslint.config.js - Could not find closing ); anchor point');
		return { updated: false, errors: 0 };
	}

	// Insert the Roopik block before the final );
	const roopikBlock = `\t// ROOPIK: Override header rule for roopik extension
\t{
\t\tfiles: ['extensions/roopik/**/*.{ts,tsx,js,jsx}'],
\t\tplugins: { header: pluginHeader },
\t\trules: {
\t\t\t'header/header': [2, 'block', [
\t\t\t\t'---------------------------------------------------------------------------------------------',
\t\t\t\t' *  Copyright (c) Roopik. All rights reserved.',
\t\t\t\t' *  Licensed under the MIT License. See License.txt in the project root for license information.',
\t\t\t\t' *--------------------------------------------------------------------------------------------'
\t\t\t]]
\t\t}
\t},
`;

	const updatedContent = content.replace(closingPattern, '\n' + roopikBlock + ');');

	if (writeFile(filePath, updatedContent)) {
		success('eslint.config.js - Added roopik extension override block');
		return { updated: true, errors: 0 };
	} else {
		error('eslint.config.js - Failed to update');
		return { updated: false, errors: 1 };
	}
}

// Apply build/gulpfile.extensions.ts updates
function updateGulpfileExtensions() {
	const filePath = path.join(ROOT_DIR, 'build/gulpfile.extensions.ts');

	if (!fileExists(filePath)) {
		warning('build/gulpfile.extensions.ts not found (skipping)');
		return { updated: false, errors: 0 };
	}

	const content = readFile(filePath);
	if (!content) {
		return { updated: false, errors: 1 };
	}

	const roopikLine = "\t'extensions/roopik/tsconfig.json', // ROOPIK: Our canvas-first IDE extension";

	// Check if roopik extension already exists
	if (content.includes("'extensions/roopik/tsconfig.json'")) {
		success('build/gulpfile.extensions.ts - Roopik extension already registered');
		return { updated: false, errors: 0 };
	}

	// Find the compilations array
	const compilationsMatch = content.match(/const compilations = \[([\s\S]*?)\];/);
	if (!compilationsMatch) {
		warning('build/gulpfile.extensions.ts - Could not find compilations array');
		return { updated: false, errors: 0 };
	}

	// Find the opening bracket position
	const arrayStartIndex = content.indexOf('const compilations = [');
	if (arrayStartIndex === -1) {
		warning('build/gulpfile.extensions.ts - Could not find compilations array start');
		return { updated: false, errors: 0 };
	}

	// Find the first entry after the opening bracket
	const afterBracket = content.substring(arrayStartIndex + 'const compilations = ['.length);
	const firstEntryMatch = afterBracket.match(/^\s*['"]([^'"]+)['"]/);

	let updatedContent;
	if (firstEntryMatch) {
		// Insert before the first entry
		const insertIndex = arrayStartIndex + 'const compilations = ['.length;
		updatedContent = content.substring(0, insertIndex) +
			'\n' + roopikLine + ',' +
			content.substring(insertIndex);
	} else {
		// No entries yet, just add after opening bracket
		const insertIndex = arrayStartIndex + 'const compilations = ['.length;
		updatedContent = content.substring(0, insertIndex) +
			'\n' + roopikLine +
			content.substring(insertIndex);
	}

	if (writeFile(filePath, updatedContent)) {
		success('build/gulpfile.extensions.ts - Added roopik extension registration');
		return { updated: true, errors: 0 };
	} else {
		error('build/gulpfile.extensions.ts - Failed to update');
		return { updated: false, errors: 1 };
	}
}

// Apply build/hygiene.mjs or hygiene.ts updates
function updateHygieneMjs() {
	// Check for both .mjs and .ts versions
	const mjsPath = path.join(ROOT_DIR, 'build/hygiene.mjs');
	const tsPath = path.join(ROOT_DIR, 'build/hygiene.ts');

	let filePath;
	if (fileExists(mjsPath)) {
		filePath = mjsPath;
	} else if (fileExists(tsPath)) {
		filePath = tsPath;
	} else {
		warning('build/hygiene.mjs or build/hygiene.ts not found (skipping)');
		return { updated: false, errors: 0 };
	}

	let content = readFile(filePath);
	if (!content) {
		return { updated: false, errors: 1 };
	}

	let needsUpdate = false;

	// Step 1: Add roopikCopyrightHeaderLines constant after imports
	const roopikConstant = `// ROOPIK: Allow both Microsoft and Roopik copyright headers
const roopikCopyrightHeaderLines = [
	'/*---------------------------------------------------------------------------------------------',
	' *  Copyright (c) Roopik. All rights reserved.',
	' *  Licensed under the MIT License. See License.txt in the project root for license information.',
	' *--------------------------------------------------------------------------------------------*/',
];
`;

	if (!content.includes('const roopikCopyrightHeaderLines = [')) {
		// Find where to insert - after copyrightHeaderLines constant
		const copyrightHeaderMatch = content.match(/(const copyrightHeaderLines = \[[\s\S]*?\];)/);
		if (copyrightHeaderMatch) {
			const insertIndex = copyrightHeaderMatch.index + copyrightHeaderMatch[0].length;
			content = content.substring(0, insertIndex) + '\n' + roopikConstant + content.substring(insertIndex);
			needsUpdate = true;
		} else {
			const fileName = path.basename(filePath);
			warning(`build/${fileName} - Could not find copyrightHeaderLines constant`);
		}
	}

	// Step 2: Replace the copyrights function
	// Match function with optional TypeScript type annotation
	const oldFunctionPattern = /const copyrights = es\.through\(function\s*\([^)]*\)\s*\{[\s\S]*?this\.emit\('data', file\);\s*\}\);/;

	const newFunction = `const copyrights = es.through(function (file: VinylFileWithLines) {
		const lines = file.__lines;

		// ROOPIK: Check if file matches either Microsoft or Roopik copyright header
		let hasMicrosoftCopyright = true;
		let hasRoopikCopyright = true;
		for (let i = 0; i < copyrightHeaderLines.length; i++) {
			if (lines[i] !== copyrightHeaderLines[i]) {
				hasMicrosoftCopyright = false;
			}
			if (lines[i] !== roopikCopyrightHeaderLines[i]) {
				hasRoopikCopyright = false;
			}
		}

		if (!hasMicrosoftCopyright && !hasRoopikCopyright) {
			console.error(file.relative + ': Missing or bad copyright statement');
			errorCount++;
		}
		this.emit('data', file);
	});`;

	// Check if already updated
	if (content.includes('// ROOPIK: Check if file matches either Microsoft or Roopik copyright header')) {
		if (!needsUpdate) {
			const fileName = path.basename(filePath);
			success(`build/${fileName} - Already updated`);
			return { updated: false, errors: 0 };
		}
	} else {
		// Replace the function
		if (oldFunctionPattern.test(content)) {
			content = content.replace(oldFunctionPattern, newFunction);
			needsUpdate = true;
		} else {
			const fileName = path.basename(filePath);
			warning(`build/${fileName} - Could not find copyrights function to replace`);
		}
	}

	if (needsUpdate) {
		if (writeFile(filePath, content)) {
			const fileName = path.basename(filePath);
			success(`build/${fileName} - Added Roopik copyright support`);
			return { updated: true, errors: 0 };
		} else {
			const fileName = path.basename(filePath);
			error(`build/${fileName} - Failed to update`);
			return { updated: false, errors: 1 };
		}
	}

	return { updated: false, errors: 0 };
}

// Apply .mention-bot updates
function updateMentionBot() {
	const filePath = path.join(ROOT_DIR, '.mention-bot');

	if (!fileExists(filePath)) {
		warning('.mention-bot not found (skipping)');
		return { updated: false, errors: 0 };
	}

	let content = readFile(filePath);
	if (!content) {
		return { updated: false, errors: 1 };
	}

	// Check if already updated
	if (content.includes('"requiredOrgs": ["RoopikLabs"]')) {
		success('.mention-bot - Already updated');
		return { updated: false, errors: 0 };
	}

	// Replace Microsoft with RoopikLabs
	const updated = content.replace(/"requiredOrgs":\s*\["Microsoft"\]/, '"requiredOrgs": ["RoopikLabs"]');

	if (updated === content) {
		warning('.mention-bot - Could not find requiredOrgs field to update');
		return { updated: false, errors: 0 };
	}

	if (writeFile(filePath, updated)) {
		success('.mention-bot - Updated requiredOrgs to RoopikLabs');
		return { updated: true, errors: 0 };
	} else {
		error('.mention-bot - Failed to update');
		return { updated: false, errors: 1 };
	}
}

// Clear .mailmap file
function clearMailmap() {
	const filePath = path.join(ROOT_DIR, '.mailmap');

	if (!fileExists(filePath)) {
		warning('.mailmap not found (skipping)');
		return { updated: false, errors: 0 };
	}

	// Check if already empty
	const content = readFile(filePath);
	if (!content || content.trim() === '') {
		success('.mailmap - Already cleared');
		return { updated: false, errors: 0 };
	}

	// Clear the file
	if (writeFile(filePath, '')) {
		success('.mailmap - Cleared');
		return { updated: true, errors: 0 };
	} else {
		error('.mailmap - Failed to clear');
		return { updated: false, errors: 1 };
	}
}

// Install Roopik dependencies
function installRoopikDependencies(config) {
	const filePath = path.join(ROOT_DIR, 'package.json');

	if (!fileExists(filePath)) {
		warning('package.json not found (skipping dependencies)');
		return { updated: false, errors: 0 };
	}

	if (!config.dependencies || !config.dependencies.packages) {
		info('No dependencies configured in branding-config.json');
		return { updated: false, errors: 0 };
	}

	const content = readFile(filePath);
	if (!content) {
		return { updated: false, errors: 1 };
	}

	try {
		const pkg = JSON.parse(content);
		const packagesToInstall = [];
		const alreadyInstalled = [];
		let needsUpdate = false;

		// Check which packages need to be added
		for (const dep of config.dependencies.packages) {
			if (!pkg.dependencies || !pkg.dependencies[dep.name]) {
				packagesToInstall.push(dep.name);
				needsUpdate = true;
			} else {
				alreadyInstalled.push(dep.name);
			}
		}

		if (packagesToInstall.length === 0) {
			success('Roopik dependencies - All already installed');
			return { updated: false, errors: 0 };
		}

		info(`\nInstalling ${packagesToInstall.length} Roopik dependencies...`);
		packagesToInstall.forEach(name => info(`  - ${name}`));

		if (alreadyInstalled.length > 0) {
			info(`\nAlready installed (${alreadyInstalled.length}):`);
			alreadyInstalled.forEach(name => info(`  ✓ ${name}`));
		}

		if (DRY_RUN) {
			info('\n[DRY-RUN] Would run: npm install ' + packagesToInstall.join(' '));
			return { updated: false, errors: 0 };
		}

		// Install packages using npm (gets latest versions)
		info('\nRunning npm install (this may take a moment)...');

		try {
			const command = `npm install ${packagesToInstall.join(' ')}`;

			execSync(command, {
				cwd: ROOT_DIR,
				stdio: 'inherit'
			});

			success(`\n✓ Successfully installed ${packagesToInstall.length} dependencies`);
			return { updated: true, errors: 0 };
		} catch (err) {
			error(`\nFailed to install dependencies: ${err.message}`);
			error('You may need to manually run: npm install ' + packagesToInstall.join(' '));
			return { updated: false, errors: 1 };
		}

	} catch (err) {
		error(`package.json - Parse error: ${err.message}`);
		return { updated: false, errors: 1 };
	}
}

// ============================================================================
// MANUAL CODE CHANGES (Core Integration)
// ============================================================================

// Update workbench.common.main.ts - Add Roopik contribution import
function updateWorkbenchCommonMain() {
	const filePath = path.join(ROOT_DIR, 'src/vs/workbench/workbench.common.main.ts');

	if (!fileExists(filePath)) {
		warning('src/vs/workbench/workbench.common.main.ts not found (skipping)');
		return { updated: false, errors: 0 };
	}

	const content = readFile(filePath);
	if (!content) {
		return { updated: false, errors: 1 };
	}

	// Check if Roopik import already exists
	if (content.includes("import './contrib/roopik/browser/roopik.contribution.js';")) {
		success('workbench.common.main.ts - Roopik contribution already imported');
		return { updated: false, errors: 0 };
	}

	// Find and replace just the Speech import line (not the comment)
	const oldImport = `import './contrib/speech/browser/speech.contribution.js';`;

	const newImport = `import './contrib/speech/browser/speech.contribution.js';

// Roopik Design IDE
import './contrib/roopik/browser/roopik.contribution.js';`;

	if (!content.includes(oldImport)) {
		warning('workbench.common.main.ts - Could not find Speech import to anchor Roopik import');
		return { updated: false, errors: 0 };
	}

	const updatedContent = content.replace(oldImport, newImport);

	if (writeFile(filePath, updatedContent)) {
		success('workbench.common.main.ts - Added Roopik contribution import');
		return { updated: true, errors: 0 };
	} else {
		error('workbench.common.main.ts - Failed to update');
		return { updated: false, errors: 1 };
	}
}

// Apply server manifest updates
function updateServerManifest(config) {
	const filePath = path.join(ROOT_DIR, 'resources/server/manifest.json');

	if (!fileExists(filePath)) {
		warning('resources/server/manifest.json not found (skipping)');
		return { updated: false, errors: 0 };
	}

	const content = readFile(filePath);
	if (!content) {
		return { updated: false, errors: 1 };
	}

	try {
		const manifest = JSON.parse(content);
		const manifestConfig = config.server.manifest;
		let needsUpdate = false;

		if (manifest.name !== manifestConfig.name) {
			manifest.name = manifestConfig.name;
			needsUpdate = true;
		}

		if (manifest.short_name !== manifestConfig.shortName) {
			manifest.short_name = manifestConfig.shortName;
			needsUpdate = true;
		}

		if (needsUpdate) {
			const updated = JSON.stringify(manifest, null, '\t') + '\n';
			if (writeFile(filePath, updated)) {
				success('resources/server/manifest.json - Updated');
				return { updated: true, errors: 0 };
			} else {
				error('resources/server/manifest.json - Failed to update');
				return { updated: false, errors: 1 };
			}
		} else {
			success('resources/server/manifest.json - Already correct');
			return { updated: false, errors: 0 };
		}
	} catch (err) {
		error(`resources/server/manifest.json - Parse error: ${err.message}`);
		return { updated: false, errors: 1 };
	}
}

// Update windows.ts - Enable webview tag for Roopik browser preview
function updateWindowsTs() {
	const filePath = path.join(ROOT_DIR, 'src/vs/platform/windows/electron-main/windows.ts');

	if (!fileExists(filePath)) {
		warning('src/vs/platform/windows/electron-main/windows.ts not found (skipping)');
		return { updated: false, errors: 0 };
	}

	const content = readFile(filePath);
	if (!content) {
		return { updated: false, errors: 1 };
	}

	// Check if webviewTag already exists
	if (content.includes('webviewTag: true')) {
		success('windows.ts - webviewTag already enabled');
		return { updated: false, errors: 0 };
	}

	// Find the anchor point - use a simpler search that works with any line endings
	const searchPattern = '...webPreferences,';
	const searchIndex = content.indexOf(searchPattern);

	if (searchIndex === -1) {
		warning('windows.ts - Could not find webPreferences spread operator');
		return { updated: false, errors: 0 };
	}

	// Find the next line after the spread operator (enableWebSQL line)
	const afterSpread = content.indexOf('enableWebSQL: false,', searchIndex);

	if (afterSpread === -1) {
		warning('windows.ts - Could not find enableWebSQL line');
		return { updated: false, errors: 0 };
	}

	// Insert webviewTag line before enableWebSQL
	// Extract the indentation from the enableWebSQL line
	const lineStart = content.lastIndexOf('\n', afterSpread) + 1;
	const enableWebSQLLine = content.substring(lineStart, afterSpread);
	const indent = enableWebSQLLine.match(/^\s*/)[0];

	// Build the replacement - insert webviewTag between spread and enableWebSQL
	const insertionPoint = content.indexOf('\n', searchIndex) + 1;
	const before = content.substring(0, insertionPoint);
	const after = content.substring(insertionPoint);

	const webviewTagLine = `${indent}// ROOPIK: Enable webview tag for Roopik browser preview\n${indent}webviewTag: true,\n`;
	const updatedContent = before + webviewTagLine + after;

	if (writeFile(filePath, updatedContent)) {
		success('windows.ts - Added webviewTag: true');
		return { updated: true, errors: 0 };
	} else {
		error('windows.ts - Failed to update');
		return { updated: false, errors: 1 };
	}
}

// Update CSP in workbench HTML files - Allow localhost for Roopik browser preview
function updateWorkbenchCSP() {
	const files = [
		'src/vs/code/electron-browser/workbench/workbench.html',
		'src/vs/code/electron-browser/workbench/workbench-dev.html'
	];

	let totalUpdated = 0;
	let totalErrors = 0;

	for (const file of files) {
		const filePath = path.join(ROOT_DIR, file);

		if (!fileExists(filePath)) {
			warning(`${file} not found (skipping)`);
			continue;
		}

		const content = readFile(filePath);
		if (!content) {
			totalErrors++;
			continue;
		}

		// Check if localhost CSP entries already exist
		if (content.includes('http://127.0.0.1:*') && content.includes('http://localhost:*')) {
			success(`${file} - CSP localhost entries already present`);
			continue;
		}

		// Find the img-src section and add localhost entries
		const imgSrcPattern = /(img-src\s+[^;]+https:)\s*/;
		const match = content.match(imgSrcPattern);

		if (!match) {
			warning(`${file} - Could not find img-src directive`);
			continue;
		}

		// Add localhost entries after https: (no extra blank line)
		const updatedContent = content.replace(
			imgSrcPattern,
			`$1\n\t\t\t\t\thttp://127.0.0.1:*\n\t\t\t\t\thttp://localhost:*\n\t\t\t\t`
		);

		if (writeFile(filePath, updatedContent)) {
			success(`${file} - Added localhost CSP entries`);
			totalUpdated++;
		} else {
			error(`${file} - Failed to update`);
			totalErrors++;
		}
	}

	return { updated: totalUpdated > 0, errors: totalErrors };
}

// Process icon replacements
function processIconReplacements(config) {
	let totalChanges = 0;
	let totalErrors = 0;

	// Check if branding directory exists
	const brandingExists = fileExists(BRANDING_DIR);
	if (brandingExists) {
		info(`Using branding directory: ${BRANDING_DIR}`);
	} else {
		warning(`Branding directory not found: ${BRANDING_DIR}`);
		info('Will check fallback locations instead\n');
	}

	// Process each icon category
	const iconCategories = ['win32', 'darwin', 'linux', 'server', 'workbench', 'extensions'];

	for (const category of iconCategories) {
		const icons = config.icons[category] || [];

		for (const icon of icons) {
			// Determine paths
			let vsCodePath, brandingPath, fallbackPath;

			if (category === 'workbench') {
				const vsCodeDir = 'src/vs/workbench/browser/media';
				vsCodePath = path.join(ROOT_DIR, vsCodeDir, icon.source);
				brandingPath = path.join(BRANDING_ICONS_DIR, category, icon.target);
				fallbackPath = path.join(ROOT_DIR, vsCodeDir, icon.target);
			} else if (category === 'extensions') {
				// Extension icons have full paths in source (e.g., "extensions/github-authentication/media/favicon.ico")
				vsCodePath = path.join(ROOT_DIR, icon.source);
				// Extract the extension name from source path (e.g., "github-authentication" from "extensions/github-authentication/media/...")
				const sourceDir = path.dirname(icon.source); // e.g., "extensions/github-authentication/media"
				const extensionName = path.basename(path.dirname(sourceDir)); // e.g., "github-authentication"
				brandingPath = path.join(BRANDING_ICONS_DIR, category, extensionName, icon.target);
				fallbackPath = path.join(ROOT_DIR, sourceDir, icon.target);
			} else {
				const vsCodeDir = `resources/${category}`;
				vsCodePath = path.join(ROOT_DIR, vsCodeDir, icon.source);
				brandingPath = path.join(BRANDING_ICONS_DIR, category, icon.target);
				fallbackPath = path.join(ROOT_DIR, vsCodeDir, icon.target);
			}

			// Determine source icon location
			let sourceIconPath = null;
			let sourceLocation = '';

			if (fileExists(brandingPath)) {
				sourceIconPath = brandingPath;
				sourceLocation = 'branding directory';
			} else if (fileExists(fallbackPath)) {
				sourceIconPath = fallbackPath;
				sourceLocation = 'fallback location';
			}

			// Check if VS Code icon exists
			const vsCodeIconExists = fileExists(vsCodePath);

			if (!sourceIconPath) {
				warning(`${icon.description} - Roopik icon not found`);
				info(`   Expected: branding/icons/${category}/${icon.target}`);
				if (vsCodeIconExists) {
					info(`   VS Code icon still exists at: ${icon.source}`);
				}
				continue;
			}

			// Replace or copy icon
			if (vsCodeIconExists || sourceIconPath !== vsCodePath) {
				if (DRY_RUN) {
					info(`Would copy ${sourceLocation === 'branding directory' ? `branding/icons/${category}/${icon.target}` : icon.target} → ${icon.source}`);
				} else {
					// Ensure directory exists
					const targetDir = path.dirname(vsCodePath);
					ensureDirectory(targetDir);

					if (copyFile(sourceIconPath, vsCodePath)) {
						success(`${icon.description} - Replaced (from ${sourceLocation})`);
						totalChanges++;
					} else {
						error(`${icon.description} - Failed to replace`);
						totalErrors++;
					}
				}
			} else {
				success(`${icon.description} - Already replaced`);
			}
		}
	}

	return { changes: totalChanges, errors: totalErrors };
}

// Main execution
function main() {
	const config = loadConfig();

	if (INIT_MODE) {
		initializeBrandingStructure(config);
		return 0;
	}

	log('\n' + '='.repeat(60), 'bright');
	log('ROOPIK IDE - Branding Application Script', 'bright');
	log('='.repeat(60) + '\n', 'bright');

	if (DRY_RUN) {
		warning('DRY RUN MODE - No files will be modified\n');
	}

	if (SKIP_ICONS) {
		warning('SKIPPING ICON REPLACEMENTS\n');
	}

	let totalChanges = 0;
	let totalErrors = 0;

	// Process file replacements
	log('📝 Processing file replacements...\n', 'cyan');

	const productResult = updateProductJson(config);
	if (productResult.updated) {
		totalChanges++;
	}
	totalErrors += productResult.errors;

	const packageResult = updatePackageJson(config);
	if (packageResult.updated) {
		totalChanges++;
	}
	totalErrors += packageResult.errors;

	const serverResult = updateServerManifest(config);
	if (serverResult.updated) {
		totalChanges++;
	}
	totalErrors += serverResult.errors;

	const textResult = applyTextReplacements(config);
	totalChanges += textResult.changes;
	totalErrors += textResult.errors;

	const eslintResult = updateEslintConfig();
	if (eslintResult.updated) {
		totalChanges++;
	}
	totalErrors += eslintResult.errors;

	const gulpfileResult = updateGulpfileExtensions();
	if (gulpfileResult.updated) {
		totalChanges++;
	}
	totalErrors += gulpfileResult.errors;

	const hygieneResult = updateHygieneMjs();
	if (hygieneResult.updated) {
		totalChanges++;
	}
	totalErrors += hygieneResult.errors;

	const mentionBotResult = updateMentionBot();
	if (mentionBotResult.updated) {
		totalChanges++;
	}
	totalErrors += mentionBotResult.errors;

	const mailmapResult = clearMailmap();
	if (mailmapResult.updated) {
		totalChanges++;
	}
	totalErrors += mailmapResult.errors;

	// ============================================================================
	// Manual Code Changes - Core Integration
	// ============================================================================
	log('\n🔧 Applying manual code changes (Core Integration)...\n', 'cyan');

	const workbenchResult = updateWorkbenchCommonMain();
	if (workbenchResult.updated) {
		totalChanges++;
	}
	totalErrors += workbenchResult.errors;

	const windowsResult = updateWindowsTs();
	if (windowsResult.updated) {
		totalChanges++;
	}
	totalErrors += windowsResult.errors;

	const cspResult = updateWorkbenchCSP();
	if (cspResult.updated) {
		totalChanges++;
	}
	totalErrors += cspResult.errors;

	// Install Roopik dependencies
	log('\n📦 Installing Roopik dependencies...\n', 'cyan');
	const depsResult = installRoopikDependencies(config);
	if (depsResult.updated) {
		totalChanges++;
	}
	totalErrors += depsResult.errors;

	// Process icon replacements
	if (!SKIP_ICONS) {
		log('\n🎨 Processing icon replacements...\n', 'cyan');
		const iconResult = processIconReplacements(config);
		totalChanges += iconResult.changes;
		totalErrors += iconResult.errors;
	}

	// Summary
	log('\n' + '='.repeat(60), 'bright');
	log('Summary', 'bright');
	log('='.repeat(60), 'bright');

	if (totalChanges > 0) {
		success(`✓ ${totalChanges} file(s) updated`);
	}

	if (totalErrors > 0) {
		error(`✗ ${totalErrors} error(s) occurred`);
	}

	if (totalChanges === 0 && totalErrors === 0) {
		info('No changes needed - branding is already applied!');
	}

	if (DRY_RUN) {
		log('\n⚠️  This was a dry run. Run without --dry-run to apply changes.', 'yellow');
	}

	log('');

	return totalErrors === 0 ? 0 : 1;
}

// Run script
process.exit(main());
