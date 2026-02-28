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
const BRANDING_DIR = path.join(__dirname, 'branding');
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

// Apply product.json enhancements from external JSON file
function applyProductEnhancements() {
	const enhancementsFile = path.join(__dirname, 'product-enhancements.json');
	const productFile = path.join(ROOT_DIR, 'product.json');

	if (!fileExists(enhancementsFile)) {
		warning('product-enhancements.json not found (skipping enhancements)');
		return { updated: false, errors: 0 };
	}

	if (!fileExists(productFile)) {
		warning('product.json not found (skipping enhancements)');
		return { updated: false, errors: 0 };
	}

	try {
		// Load enhancements
		const enhancementsContent = readFile(enhancementsFile);
		if (!enhancementsContent) {
			return { updated: false, errors: 1 };
		}
		const enhancements = JSON.parse(enhancementsContent);

		// Load product.json
		const productContent = readFile(productFile);
		if (!productContent) {
			return { updated: false, errors: 1 };
		}
		const product = JSON.parse(productContent);

		let needsUpdate = false;
		const addedFields = [];
		const updatedFields = [];

		// Deep merge function for objects
		function deepMerge(target, source) {
			for (const key in source) {
				if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
					if (!target[key]) {
						target[key] = {};
					}
					deepMerge(target[key], source[key]);
				} else {
					target[key] = source[key];
				}
			}
		}

		// Apply each enhancement
		for (const [key, value] of Object.entries(enhancements)) {
			// Skip schema field
			if (key === '$schema' || key === 'description') {
				continue;
			}

			const existed = product.hasOwnProperty(key);

			// SPECIAL CASE: builtInExtensions - Merge instead of replace
			if (key === 'builtInExtensions' && Array.isArray(value) && Array.isArray(product[key])) {
				const beforeCount = product[key].length;
				for (const ext of value) {
					if (!product[key].some(e => e.name === ext.name)) {
						product[key].push(ext);
						addedFields.push(`${key}:${ext.name}`);
					}
				}
				if (product[key].length > beforeCount) {
					needsUpdate = true;
				}
				continue;
			}

			// Handle different types
			if (Array.isArray(value)) {
				// For arrays, replace entirely
				if (!existed || JSON.stringify(product[key]) !== JSON.stringify(value)) {
					product[key] = value;
					needsUpdate = true;
					if (existed) {
						updatedFields.push(key);
					} else {
						addedFields.push(key);
					}
				}
			} else if (value && typeof value === 'object') {
				// For objects, deep merge
				if (!existed) {
					product[key] = value;
					needsUpdate = true;
					addedFields.push(key);
				} else {
					const before = JSON.stringify(product[key]);
					deepMerge(product[key], value);
					const after = JSON.stringify(product[key]);
					if (before !== after) {
						needsUpdate = true;
						updatedFields.push(key);
					}
				}
			} else {
				// For primitives, replace
				if (!existed || product[key] !== value) {
					product[key] = value;
					needsUpdate = true;
					if (existed) {
						updatedFields.push(key);
					} else {
						addedFields.push(key);
					}
				}
			}
		}

		if (needsUpdate) {
			const updated = JSON.stringify(product, null, '\t') + '\n';
			if (writeFile(productFile, updated)) {
				if (addedFields.length > 0) {
					success(`product.json - Added ${addedFields.length} enhancement(s): ${addedFields.join(', ')}`);
				}
				if (updatedFields.length > 0) {
					success(`product.json - Updated ${updatedFields.length} enhancement(s): ${updatedFields.join(', ')}`);
				}
				return { updated: true, errors: 0 };
			} else {
				error('product.json - Failed to apply enhancements');
				return { updated: false, errors: 1 };
			}
		} else {
			success('product.json - All enhancements already applied');
			return { updated: false, errors: 0 };
		}
	} catch (err) {
		error(`product.json enhancements - Error: ${err.message}`);
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

	let updatedContent = content;
	let didUpdate = false;

	// ROOPIK CUSTOM LIBRARIES - Ensure these 4 are always in hasNode allow list
	const roopikLibraries = [
		"'zod'",
		"'esbuild'",
		"'esbuild-svelte'",
		"'esbuild-plugin-vue3'",
		"'esbuild-plugin-solid'",
		"'@modelcontextprotocol/sdk'",
		"'@modelcontextprotocol/sdk/server/mcp.js'",
		"'@modelcontextprotocol/sdk/server/sse.js'",
	];

	// Find the hasNode section
	const hasNodeMarker = "'when': 'hasNode'";
	const hasNodeIndex = updatedContent.indexOf(hasNodeMarker);

	if (hasNodeIndex !== -1) {
		// Find the 'allow': [ after hasNode
		const allowMarkerStart = updatedContent.indexOf("'allow': [", hasNodeIndex);
		if (allowMarkerStart !== -1) {
			const allowArrayStart = allowMarkerStart + "'allow': [".length;
			const allowArrayEnd = updatedContent.indexOf(']', allowArrayStart);

			if (allowArrayEnd !== -1) {
				const allowArrayContent = updatedContent.substring(allowArrayStart, allowArrayEnd);
				let updatedAllowArray = allowArrayContent;
				let addedLibraries = [];

				// Check and add each Roopik library
				for (const lib of roopikLibraries) {
					if (!updatedAllowArray.includes(lib)) {
						// Find insertion point - after existing MCP entries or at start
						const lastMcpIndex = updatedAllowArray.lastIndexOf("'@modelcontextprotocol");
						let insertionPoint;

						if (lastMcpIndex !== -1) {
							// Find end of that line
							insertionPoint = updatedAllowArray.indexOf('\n', lastMcpIndex);
							if (insertionPoint === -1) {
								insertionPoint = updatedAllowArray.indexOf(',', lastMcpIndex);
								if (insertionPoint === -1) {
									insertionPoint = updatedAllowArray.length;
								}
							}
						} else {
							// No MCP entries, insert near beginning after initial newline
							insertionPoint = updatedAllowArray.indexOf('\n');
							if (insertionPoint === -1) {
								insertionPoint = 0;
							}
						}

						// Build insertion string with proper indentation
						const precedingText = updatedAllowArray.substring(0, insertionPoint);
						const lastNewlineIndex = precedingText.lastIndexOf('\n');
						const indentation = lastNewlineIndex !== -1
							? precedingText.substring(lastNewlineIndex + 1).match(/^\s*/)[0]
							: '';

						const insertionString = `\n${indentation}${lib},`;
						updatedAllowArray = updatedAllowArray.substring(0, insertionPoint) + insertionString + updatedAllowArray.substring(insertionPoint);
						addedLibraries.push(lib);
					}
				}

				if (addedLibraries.length > 0) {
					// Replace the allow array in the content
					updatedContent = updatedContent.substring(0, allowArrayStart) +
						updatedAllowArray +
						updatedContent.substring(allowArrayEnd);
					didUpdate = true;
					success(`eslint.config.js - Added ${addedLibraries.length} Roopik library exception(s) to hasNode allow list`);
				} else {
					success('eslint.config.js - All Roopik libraries already in hasNode allow list');
				}
			} else {
				warning('eslint.config.js - Could not find closing bracket for allow array');
			}
		} else {
			warning('eslint.config.js - Could not find allow array in hasNode section');
		}
	} else {
		warning('eslint.config.js - Could not find hasNode section');
	}

	// 1) Ensure Roopik header override exists (extension + core)
	if (updatedContent.includes('// ROOPIK: Override header rule for roopik files (extension + core)')) {
		success('eslint.config.js - Override block already exists');
	} else {
		// Find the final closing - just the ); at the end
		// Use a regex to handle different line ending styles
		const closingPattern = /\n\);\s*$/;
		if (!closingPattern.test(updatedContent)) {
			warning('eslint.config.js - Could not find closing ); anchor point');
			return { updated: didUpdate, errors: 0 };
		}

		// Insert the Roopik block before the final );
		const roopikBlock = `\t// ROOPIK: Override header rule for roopik files (extension + core)
\t{
\t\tfiles: [
\t\t\t'extensions/roopik/**/*.{ts,tsx,js,jsx}',
\t\t\t'src/vs/workbench/contrib/roopik/**/*.{ts,tsx,js,jsx}'
\t\t],
\t\tplugins: { header: pluginHeader },
\t\trules: {
\t\t\t'header/header': [2, 'block', [
\t\t\t\t'---------------------------------------------------------------------------------------------',
\t\t\t\t' *  Copyright (c) Roopik. All rights reserved.',
\t\t\t\t' *  Licensed under the MIT License.',
\t\t\t\t' *--------------------------------------------------------------------------------------------'
\t\t\t]]
\t\t}
\t},
`;

		updatedContent = updatedContent.replace(closingPattern, '\n' + roopikBlock + ');');
		success('eslint.config.js - Added roopik header override block');
		didUpdate = true;
	}

	// 2) Ensure Roopik import-pattern exception exists for src/vs/code/** in electron layers
	if (updatedContent.includes("'pattern': 'vs/workbench/contrib/roopik/~'")) {
		success('eslint.config.js - code-import-patterns exception already exists');
	} else {
		const targetMarker = "'target': 'src/vs/code/~'";
		const targetIndex = updatedContent.indexOf(targetMarker);
		if (targetIndex === -1) {
			warning('eslint.config.js - Could not find src/vs/code/~ rule block');
		} else {
			const vsCodeRestriction = "'vs/code/~',";
			const vsCodeRestrictionIndex = updatedContent.indexOf(vsCodeRestriction, targetIndex);
			if (vsCodeRestrictionIndex === -1) {
				warning('eslint.config.js - Could not find vs/code/~ restriction inside src/vs/code/~ block');
			} else {
				const insertAfterLineEnd = updatedContent.indexOf('\n', vsCodeRestrictionIndex);
				if (insertAfterLineEnd === -1) {
					warning('eslint.config.js - Could not determine insertion point for src/vs/code/~ block');
				} else {
					const roopikImportException =
						"\t\t\t\t\t\t// Roopik fork: allow bridging from code/electron-main into our\n" +
						"\t\t\t\t\t\t// workbench contrib area for custom services while keeping\n" +
						"\t\t\t\t\t\t// other layering rules intact.\n" +
						"\t\t\t\t\t\t{\n" +
						"\t\t\t\t\t\t\t'when': 'hasElectron',\n" +
						"\t\t\t\t\t\t\t'pattern': 'vs/workbench/contrib/roopik/~'\n" +
						"\t\t\t\t\t\t},\n";

					const insertPos = insertAfterLineEnd + 1;
					updatedContent = updatedContent.slice(0, insertPos) + roopikImportException + updatedContent.slice(insertPos);
					success('eslint.config.js - Added code-import-patterns exception for Roopik');
					didUpdate = true;
				}
			}
		}
	}

	if (didUpdate) {
		if (writeFile(filePath, updatedContent)) {
			return { updated: true, errors: 0 };
		}
		error('eslint.config.js - Failed to update');
		return { updated: false, errors: 1 };
	}

	return { updated: false, errors: 0 };
}

// Add Roopik extensions to build/npm/dirs.ts so npm install covers them
function updateNpmDirs() {
	const filePath = path.join(ROOT_DIR, 'build/npm/dirs.ts');

	if (!fileExists(filePath)) {
		warning('build/npm/dirs.ts not found (skipping)');
		return { updated: false, errors: 0 };
	}

	let content = fs.readFileSync(filePath, 'utf8');
	const extensionsToAdd = ['extensions/roopik', 'extensions/roopik-roo'];
	let modified = false;

	for (const ext of extensionsToAdd) {
		if (content.includes(`'${ext}'`)) {
			info(`${ext} already in dirs.ts`);
			continue;
		}

		// Insert before the closing '];' of the dirs array
		const closingBracket = /^(\];)/m;
		if (closingBracket.test(content)) {
			content = content.replace(closingBracket, `\t'${ext}',\n$1`);
			modified = true;
			success(`Added '${ext}' to dirs.ts`);
		} else {
			warning(`Could not find closing bracket in dirs.ts for ${ext}`);
		}
	}

	if (modified) {
		writeFile(filePath, content);
		return { updated: true, errors: 0 };
	}

	return { updated: false, errors: 0 };
}

// Apply build/gulpfile.extensions.ts updates
function updateGulpfileExtensions() {
	const filePath = path.join(ROOT_DIR, 'build/gulpfile.extensions.ts');

	if (!fileExists(filePath)) {
		warning('build/gulpfile.extensions.ts not found (skipping)');
		return { updated: false, errors: 0 };
	}

	let content = readFile(filePath);
	if (!content) {
		return { updated: false, errors: 1 };
	}

	const roopikLine = "\t'extensions/roopik/tsconfig.json', // ROOPIK: Our canvas-first IDE extension,";
	const roopikDioLine = "\t'extensions/roopik-roo/tsconfig.json', // ROOPIK DIO: AI agent integration";

	// Check which extensions need to be added
	const hasRoopik = content.includes("'extensions/roopik/tsconfig.json'");
	const hasRoopikDio = content.includes("'extensions/roopik-roo/tsconfig.json'");

	if (hasRoopik && hasRoopikDio) {
		success('build/gulpfile.extensions.ts - Both Roopik extensions already registered');
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

	// Build the lines to insert
	let linesToInsert = '';
	const addedExtensions = [];

	if (!hasRoopik) {
		linesToInsert += '\n' + roopikLine;
		addedExtensions.push('roopik');
	}
	if (!hasRoopikDio) {
		linesToInsert += '\n' + roopikDioLine + ',';
		addedExtensions.push('roopik-dio');
	}

	// Find the first entry after the opening bracket
	const afterBracket = content.substring(arrayStartIndex + 'const compilations = ['.length);
	const firstEntryMatch = afterBracket.match(/^\s*['"]([^'"]+)['"]/);

	let updatedContent;
	if (firstEntryMatch) {
		// Insert before the first entry
		const insertIndex = arrayStartIndex + 'const compilations = ['.length;
		updatedContent = content.substring(0, insertIndex) +
			linesToInsert +
			content.substring(insertIndex);
	} else {
		// No entries yet, just add after opening bracket
		const insertIndex = arrayStartIndex + 'const compilations = ['.length;
		updatedContent = content.substring(0, insertIndex) +
			linesToInsert +
			content.substring(insertIndex);
	}

	if (writeFile(filePath, updatedContent)) {
		success(`build/gulpfile.extensions.ts - Added ${addedExtensions.join(' and ')} extension registration`);
		return { updated: true, errors: 0 };
	} else {
		error('build/gulpfile.extensions.ts - Failed to update');
		return { updated: false, errors: 1 };
	}
}

// Apply build/gulpfile.vscode.ts updates
function updateGulpfileVscode() {
	const filePath = path.join(ROOT_DIR, 'build/gulpfile.vscode.ts');

	if (!fileExists(filePath)) {
		warning('build/gulpfile.vscode.ts not found (skipping)');
		return { updated: false, errors: 0 };
	}

	let content = readFile(filePath);
	if (!content) {
		return { updated: false, errors: 1 };
	}

	const roopikEntries = [
		"out-build/vs/workbench/contrib/roopik/browser/media/*.{svg,png}",
		"out-build/vs/workbench/contrib/roopik/resources/*.json",
		"out-build/vs/workbench/contrib/roopik/electron-main/projectMode/devServer/**/*.mjs",
	];

	const missingEntries = roopikEntries.filter(entry => !content.includes(`'${entry}'`));

	if (missingEntries.length === 0) {
		success('build/gulpfile.vscode.ts - Roopik resource entries already present');
		return { updated: false, errors: 0 };
	}

	const arrayMarker = 'const vscodeResourceIncludes = [';
	const arrayStart = content.indexOf(arrayMarker);
	if (arrayStart === -1) {
		warning('build/gulpfile.vscode.ts - Could not find vscodeResourceIncludes array');
		return { updated: false, errors: 0 };
	}

	const afterArrayStart = content.substring(arrayStart + arrayMarker.length);
	const indentMatch = afterArrayStart.match(/\n(\s*)['"]/);
	const defaultIndent = indentMatch ? indentMatch[1] : '\t';

	const roopikComment = '// Roopik';
	const roopikIndex = content.indexOf(roopikComment, arrayStart);

	const missingLines = missingEntries.map(entry => `${defaultIndent}'${entry}',`).join('\n');
	let updatedContent = content;

	if (roopikIndex !== -1) {
		const lineEnd = content.indexOf('\n', roopikIndex);
		if (lineEnd === -1) {
			warning('build/gulpfile.vscode.ts - Could not determine insertion point for Roopik block');
			return { updated: false, errors: 0 };
		}

		const insertPoint = lineEnd + 1;
		const insertText = `${missingLines}\n`;
		updatedContent = content.slice(0, insertPoint) + insertText + content.slice(insertPoint);
	} else {
		const webviewIndex = content.indexOf('// Webview', arrayStart);
		let insertPoint = -1;
		let indent = defaultIndent;

		if (webviewIndex !== -1) {
			insertPoint = content.lastIndexOf('\n', webviewIndex) + 1;
			const lineStart = content.lastIndexOf('\n', webviewIndex) + 1;
			const lineText = content.substring(lineStart, webviewIndex);
			const indentMatch = lineText.match(/^\s*/);
			if (indentMatch) {
				indent = indentMatch[0];
			}
		} else {
			const arrayEnd = content.indexOf('];', arrayStart);
			if (arrayEnd !== -1) {
				insertPoint = arrayEnd;
			}
		}

		if (insertPoint === -1) {
			warning('build/gulpfile.vscode.ts - Could not find insertion point for Roopik block');
			return { updated: false, errors: 0 };
		}

		const blockLines = [
			`${indent}// Roopik`,
			...missingEntries.map(entry => `${indent}'${entry}',`),
			''
		].join('\n');

		updatedContent = content.slice(0, insertPoint) + blockLines + content.slice(insertPoint);
	}

	if (writeFile(filePath, updatedContent)) {
		success(`build/gulpfile.vscode.ts - Added ${missingEntries.length} Roopik resource entry(s)`);
		return { updated: true, errors: 0 };
	}

	error('build/gulpfile.vscode.ts - Failed to update');
	return { updated: false, errors: 1 };
}

// Apply build/gulpfile.vscode.ts updates - Add MCP STDIO binaries to build
function updateGulpfileMcpBinaries() {
	const filePath = path.join(ROOT_DIR, 'build/gulpfile.vscode.ts');

	if (!fileExists(filePath)) {
		warning('build/gulpfile.vscode.ts not found (skipping MCP binaries)');
		return { updated: false, errors: 0 };
	}

	let content = readFile(filePath);
	if (!content) {
		return { updated: false, errors: 1 };
	}

	// Check if MCP binaries already added
	if (content.includes('const mcpBinaries = gulp.src([')) {
		success('build/gulpfile.vscode.ts - MCP binaries already present');
		return { updated: false, errors: 0 };
	}

	// MCP binaries declaration to inject (with proper two-tab indentation)
	const mcpBinariesDecl =
		'\t\t// MCP STDIO binaries - include all platforms, only existing ones will be bundled\n' +
		"\t\tconst mcpBinaries = gulp.src([\n" +
		"\t\t\t'resources/mcp-binaries/roopik-mcp-win-x64.exe',\n" +
		"\t\t\t'resources/mcp-binaries/roopik-mcp-linux-x64',\n" +
		"\t\t\t'resources/mcp-binaries/roopik-mcp-macos-arm64'\n" +
		"\t\t], { base: '.', allowEmpty: true });\n\n";

	// Strategy A (new upstream): mergeStreams array pattern
	//   const mergeStreams = [ ... deps ];  →  add mcpBinaries to array
	const mergeStreamsPattern = /(\t\tconst mergeStreams = \[[\s\S]*?\tdeps)\n(\t\t\];)/;
	// Strategy B (old upstream): inline es.merge() pattern
	const inlineMergePattern = /(\t\tlet all = es\.merge\(\n\t\t\tpackageJsonStream,)/;

	if (mergeStreamsPattern.test(content)) {
		// New pattern: inject declaration before mergeStreams array, add mcpBinaries to array
		content = content.replace(mergeStreamsPattern, (match, before, closing) => {
			return mcpBinariesDecl + before + ',\n\t\t\tmcpBinaries\n' + closing;
		});
	} else if (inlineMergePattern.test(content)) {
		// Old pattern: inject declaration before es.merge, add mcpBinaries to inline merge
		content = content.replace(inlineMergePattern, mcpBinariesDecl + '$1');
		const depsPattern = /(\t\t\tdeps)\n(\t\t\);)/;
		if (depsPattern.test(content)) {
			content = content.replace(depsPattern, '$1,\n\t\t\tmcpBinaries\n$2');
		} else {
			warning('build/gulpfile.vscode.ts - Could not find "deps" in merge to add mcpBinaries');
			return { updated: false, errors: 0 };
		}
	} else {
		warning('build/gulpfile.vscode.ts - Could not find mergeStreams array or es.merge() anchor for MCP binaries');
		return { updated: false, errors: 0 };
	}

	if (writeFile(filePath, content)) {
		success('build/gulpfile.vscode.ts - Added MCP STDIO binaries to build');
		return { updated: true, errors: 0 };
	}

	error('build/gulpfile.vscode.ts - Failed to add MCP binaries');
	return { updated: false, errors: 1 };
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
	' *  Licensed under the MIT License.',
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

// Apply build/filters.ts updates - Exclude docs folder and roopik-dio from hygiene checks
function updateFiltersTs() {
	const filePath = path.join(ROOT_DIR, 'build/filters.ts');

	if (!fileExists(filePath)) {
		warning('build/filters.ts not found (skipping)');
		return { updated: false, errors: 0 };
	}

	let content = readFile(filePath);
	if (!content) {
		return { updated: false, errors: 1 };
	}

	let needsUpdate = false;
	let updatedContent = content;

	// Check 1: Add docs folder exclusion
	if (!content.includes("'!docs/**/*',")) {
		// Find the 'all' export and add !docs/**/* exclusion before !cli/**/*
		const allExportPattern = /export const all = Object\.freeze<string\[\]>\(\[([\s\S]*?)'!cli\/\*\*\/\*',/;
		const match = updatedContent.match(allExportPattern);

		if (match) {
			updatedContent = updatedContent.replace(
				"'!cli/**/*',",
				"'!docs/**/*',\n\t'!cli/**/*',"
			);
			success('build/filters.ts - Added docs folder exclusion');
			needsUpdate = true;
		} else {
			warning('build/filters.ts - Could not find all export array for docs exclusion');
		}
	} else {
		success('build/filters.ts - docs folder already excluded');
	}

	// Check 2: Add roopik-dio agent extension exclusion
	if (!updatedContent.includes("'!extensions/roopik-roo/**',")) {
		// Insert after !extensions/**/out*/**
		const outPattern = "'!extensions/**/out*/**',";
		if (updatedContent.includes(outPattern)) {
			updatedContent = updatedContent.replace(
				outPattern,
				outPattern + "\n\t'!extensions/roopik-roo/**',"
			);
			success('build/filters.ts - Added roopik-dio extension exclusion');
			needsUpdate = true;
		} else {
			warning('build/filters.ts - Could not find extensions out pattern for roopik-dio agent exclusion');
		}
	} else {
		success('build/filters.ts - roopik-dio already excluded');
	}

	if (needsUpdate) {
		if (writeFile(filePath, updatedContent)) {
			success('build/filters.ts - Updated hygiene check exclusions');
			return { updated: true, errors: 0 };
		} else {
			error('build/filters.ts - Failed to update');
			return { updated: false, errors: 1 };
		}
	}

	return { updated: false, errors: 0 };
}

// Apply .eslint-ignore updates - Exclude roopik-dio from eslint checks
function updateEslintIgnore() {
	const filePath = path.join(ROOT_DIR, '.eslint-ignore');

	if (!fileExists(filePath)) {
		warning('.eslint-ignore not found (skipping)');
		return { updated: false, errors: 0 };
	}

	let content = readFile(filePath);
	if (!content) {
		return { updated: false, errors: 1 };
	}

	// Check if roopik-dio already excluded
	if (content.includes('**/extensions/roopik-roo/**')) {
		success('.eslint-ignore - roopik-dio already excluded');
		return { updated: false, errors: 0 };
	}

	// Find insertion point - after notebook-renderers line
	const notebookRenderersLine = '**/extensions/notebook-renderers/renderer-out/index.js';
	if (!content.includes(notebookRenderersLine)) {
		warning('.eslint-ignore - Could not find insertion point (notebook-renderers)');
		return { updated: false, errors: 0 };
	}

	// Insert roopik-dio exclusion after notebook-renderers
	const updatedContent = content.replace(
		notebookRenderersLine,
		notebookRenderersLine + '\n**/extensions/roopik-roo/**'
	);

	if (writeFile(filePath, updatedContent)) {
		success('.eslint-ignore - Added roopik-dio exclusion');
		return { updated: true, errors: 0 };
	} else {
		error('.eslint-ignore - Failed to update');
		return { updated: false, errors: 1 };
	}
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

// Remove product.overrides.json from .gitignore - Roopik needs this file tracked in git
function removeProductOverridesFromGitignore() {
	const filePath = path.join(ROOT_DIR, '.gitignore');

	if (!fileExists(filePath)) {
		warning('.gitignore not found (skipping product.overrides.json removal)');
		return { updated: false, errors: 0 };
	}

	let content = readFile(filePath);
	if (!content) {
		return { updated: false, errors: 1 };
	}

	// Check if product.overrides.json is in .gitignore
	if (!content.includes('product.overrides.json')) {
		success('.gitignore - product.overrides.json already not ignored');
		return { updated: false, errors: 0 };
	}

	// Remove the line containing product.overrides.json
	const lines = content.split('\n');
	const filteredLines = lines.filter(line => !line.trim().includes('product.overrides.json'));
	const updatedContent = filteredLines.join('\n');

	if (writeFile(filePath, updatedContent)) {
		success('.gitignore - Removed product.overrides.json from ignore list');
		return { updated: true, errors: 0 };
	} else {
		error('.gitignore - Failed to remove product.overrides.json');
		return { updated: false, errors: 1 };
	}
}

// Update .gitignore - Add Microsoft-specific CI/CD ignores
function updateGitignore() {
	const filePath = path.join(ROOT_DIR, '.gitignore');

	if (!fileExists(filePath)) {
		warning('.gitignore not found (skipping)');
		return { updated: false, errors: 0 };
	}

	let content = readFile(filePath);
	if (!content) {
		return { updated: false, errors: 1 };
	}

	// Check if Microsoft ignores already exist
	if (content.includes('# Microsoft-specific CI/CD and automation (not needed for Roopik fork)')) {
		success('.gitignore - Microsoft ignores already added');
		return { updated: false, errors: 0 };
	}

	// Add Microsoft-specific ignores at the end
	const microsoftIgnores = `
# Microsoft-specific CI/CD and automation (not needed for Roopik fork)
.github/workflows/
.github/endgame/
.github/CODEOWNERS
.github/dependabot.yml
.github/similarity.yml
.github/classifier.json
.github/CODENOTIFY
.github/commands/
.github/commands.json
`;

	// Ensure file ends with newline before appending
	if (!content.endsWith('\n')) {
		content += '\n';
	}

	const updatedContent = content + microsoftIgnores;

	if (writeFile(filePath, updatedContent)) {
		success('.gitignore - Added Microsoft-specific CI/CD ignores');
		return { updated: true, errors: 0 };
	} else {
		error('.gitignore - Failed to update');
		return { updated: false, errors: 1 };
	}
}

// Update .gitattributes - Ensure patch files use LF line endings
function updateGitAttributes() {
	const filePath = path.join(ROOT_DIR, '.gitattributes');

	if (!fileExists(filePath)) {
		warning('.gitattributes not found (skipping)');
		return { updated: false, errors: 0 };
	}

	const content = readFile(filePath);
	if (!content) {
		return { updated: false, errors: 1 };
	}

	// Check if *.patch eol=lf rule already exists
	if (content.includes('*.patch eol=lf')) {
		success('.gitattributes - Patch LF rule already present');
		return { updated: false, errors: 0 };
	}

	// Add the rule after *.sh eol=lf
	const newContent = content.replace(
		/(\*\.sh eol=lf\n)/,
		'$1*.patch eol=lf\n'
	);

	if (newContent !== content && writeFile(filePath, newContent)) {
		success('.gitattributes - Added *.patch eol=lf rule');
		return { updated: true, errors: 0 };
	} else if (newContent === content) {
		// Fallback: append at end if pattern not found
		const appendedContent = content.trimEnd() + '\n*.patch eol=lf\n';
		if (writeFile(filePath, appendedContent)) {
			success('.gitattributes - Added *.patch eol=lf rule (appended)');
			return { updated: true, errors: 0 };
		}
	}

	error('.gitattributes - Failed to update');
	return { updated: false, errors: 1 };
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
		const devPackagesToInstall = [];
		const alreadyInstalled = [];
		let needsUpdate = false;

		// Check which regular packages need to be added
		if (config.dependencies && config.dependencies.packages) {
			for (const dep of config.dependencies.packages) {
				if (!pkg.dependencies || !pkg.dependencies[dep.name]) {
					packagesToInstall.push(dep.name);
					needsUpdate = true;
				} else {
					alreadyInstalled.push(dep.name);
				}
			}
		}

		// Check which dev packages need to be added
		if (config.devDependencies && config.devDependencies.packages) {
			for (const dep of config.devDependencies.packages) {
				if (!pkg.devDependencies || !pkg.devDependencies[dep.name]) {
					devPackagesToInstall.push(dep.name);
					needsUpdate = true;
				} else {
					alreadyInstalled.push(dep.name);
				}
			}
		}

		if (packagesToInstall.length === 0 && devPackagesToInstall.length === 0) {
			success('Roopik dependencies - All already installed');
			return { updated: false, errors: 0 };
		}

		const totalToInstall = packagesToInstall.length + devPackagesToInstall.length;
		info(`\nInstalling ${totalToInstall} Roopik dependencies...`);
		if (packagesToInstall.length > 0) {
			info('  Regular dependencies:');
			packagesToInstall.forEach(name => info(`    - ${name}`));
		}
		if (devPackagesToInstall.length > 0) {
			info('  Dev dependencies:');
			devPackagesToInstall.forEach(name => info(`    - ${name}`));
		}

		if (alreadyInstalled.length > 0) {
			info(`\nAlready installed (${alreadyInstalled.length}):`);
			alreadyInstalled.forEach(name => info(`  ✓ ${name}`));
		}

		if (DRY_RUN) {
			if (packagesToInstall.length > 0) {
				info('\n[DRY-RUN] Would run: npm install ' + packagesToInstall.join(' '));
			}
			if (devPackagesToInstall.length > 0) {
				info('[DRY-RUN] Would run: npm install --save-dev ' + devPackagesToInstall.join(' '));
			}
			return { updated: false, errors: 0 };
		}

		// Install packages using npm (gets latest versions)
		info('\nRunning npm install (this may take a moment)...');

		try {
			if (packagesToInstall.length > 0) {
				const command = `npm install ${packagesToInstall.join(' ')}`;
				execSync(command, {
					cwd: ROOT_DIR,
					stdio: 'inherit'
				});
			}

			if (devPackagesToInstall.length > 0) {
				const command = `npm install --save-dev ${devPackagesToInstall.join(' ')}`;
				execSync(command, {
					cwd: ROOT_DIR,
					stdio: 'inherit'
				});
			}

			success(`\n✓ Successfully installed ${totalToInstall} dependencies`);
			return { updated: true, errors: 0 };
		} catch (err) {
			error(`\nFailed to install dependencies: ${err.message}`);
			if (packagesToInstall.length > 0) {
				error('You may need to manually run: npm install ' + packagesToInstall.join(' '));
			}
			if (devPackagesToInstall.length > 0) {
				error('You may need to manually run: npm install --save-dev ' + devPackagesToInstall.join(' '));
			}
			return { updated: false, errors: 1 };
		}

	} catch (err) {
		error(`package.json - Parse error: ${err.message}`);
		return { updated: false, errors: 1 };
	}
}

// Add Roopik npm scripts to package.json
function addPackageJsonScripts(config) {
	const filePath = path.join(ROOT_DIR, 'package.json');

	if (!fileExists(filePath)) {
		warning('package.json not found (skipping scripts)');
		return { updated: false, errors: 0 };
	}

	if (!config.scripts || !config.scripts.entries) {
		info('No scripts configured in branding-config.json');
		return { updated: false, errors: 0 };
	}

	const content = readFile(filePath);
	if (!content) {
		return { updated: false, errors: 1 };
	}

	try {
		const pkg = JSON.parse(content);
		const scriptsToAdd = [];

		// Ensure scripts object exists
		if (!pkg.scripts) {
			pkg.scripts = {};
		}

		// Check which scripts need to be added
		for (const script of config.scripts.entries) {
			if (!pkg.scripts[script.name]) {
				pkg.scripts[script.name] = script.command;
				scriptsToAdd.push(script.name);
			} else if (pkg.scripts[script.name] !== script.command) {
				// Script exists but with different command - update it
				pkg.scripts[script.name] = script.command;
				scriptsToAdd.push(`${script.name} (updated)`);
			}
			// Skip if script already exists with same command
		}

		if (scriptsToAdd.length === 0) {
			success('package.json scripts - All Roopik scripts already present');
			return { updated: false, errors: 0 };
		}

		if (DRY_RUN) {
			info(`[DRY-RUN] Would add ${scriptsToAdd.length} script(s): ${scriptsToAdd.join(', ')}`);
			return { updated: false, errors: 0 };
		}

		const updated = JSON.stringify(pkg, null, 2) + '\n';
		if (writeFile(filePath, updated)) {
			success(`package.json scripts - Added ${scriptsToAdd.length} script(s): ${scriptsToAdd.join(', ')}`);
			return { updated: true, errors: 0 };
		} else {
			error('package.json scripts - Failed to update');
			return { updated: false, errors: 1 };
		}

	} catch (err) {
		error(`package.json scripts - Parse error: ${err.message}`);
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

	let content = readFile(filePath);
	if (!content) {
		return { updated: false, errors: 1 };
	}

	let needsUpdate = false;
	let updatedContent = content;

	// Check 1: Add Roopik main contribution import
	if (content.includes("import './contrib/roopik/browser/roopik.contribution.js';")) {
		success('workbench.common.main.ts - Roopik contribution already imported');
	} else {
		// Find and replace just the Speech import line (not the comment)
		const oldImport = `import './contrib/speech/browser/speech.contribution.js';`;

		const newImport = `import './contrib/speech/browser/speech.contribution.js';

// Roopik Design IDE
import './contrib/roopik/browser/roopik.contribution.js';`;

		if (!updatedContent.includes(oldImport)) {
			warning('workbench.common.main.ts - Could not find Speech import to anchor Roopik import');
			return { updated: false, errors: 0 };
		}

		updatedContent = updatedContent.replace(oldImport, newImport);
		success('workbench.common.main.ts - Added Roopik contribution import');
		needsUpdate = true;
	}

	// Check 2: Add Roopik agent chat actions import
	if (updatedContent.includes("import './contrib/roopik/browser/roodioChatActions.js';")) {
		success('workbench.common.main.ts - Roopik chat actions already imported');
	} else {
		// Find the roopik.contribution import and add chat actions after it
		const roopikContribImport = `import './contrib/roopik/browser/roopik.contribution.js';`;

		if (updatedContent.includes(roopikContribImport)) {
			const chatActionsImport = `import './contrib/roopik/browser/roopik.contribution.js';
import './contrib/roopik/browser/roodioChatActions.js';  // ROOPIK AGENT CHAT ICON`;

			updatedContent = updatedContent.replace(roopikContribImport, chatActionsImport);
			success('workbench.common.main.ts - Added Roopik chat actions import');
			needsUpdate = true;
		} else {
			warning('workbench.common.main.ts - Could not find Roopik contribution import to anchor chat actions');
		}
	}

	if (needsUpdate) {
		if (writeFile(filePath, updatedContent)) {
			success('workbench.common.main.ts - Updated successfully');
			return { updated: true, errors: 0 };
		} else {
			error('workbench.common.main.ts - Failed to update');
			return { updated: false, errors: 1 };
		}
	}

	return { updated: false, errors: 0 };
}

// Update chat.contribution.ts - Add Roopik agent chat icon setting
function updateChatContribution() {
	const filePath = path.join(ROOT_DIR, 'src/vs/workbench/contrib/chat/browser/chat.contribution.ts');

	if (!fileExists(filePath)) {
		warning('src/vs/workbench/contrib/chat/browser/chat.contribution.ts not found (skipping)');
		return { updated: false, errors: 0 };
	}

	const content = readFile(filePath);
	if (!content) {
		return { updated: false, errors: 1 };
	}

	// Check if roodio.titleBarIcon.enabled already exists
	if (content.includes("'roodio.titleBarIcon.enabled':")) {
		success('chat.contribution.ts - roodio.titleBarIcon.enabled setting already exists');
		return { updated: false, errors: 0 };
	}

	// Find a reliable anchor point - look for 'chat.editor.lineHeight' setting
	// Match the entire setting block including its closing brace and comma
	const anchorPattern = /'chat\.editor\.lineHeight':\s*\{[\s\S]*?\n\s*\},/;
	const match = content.match(anchorPattern);

	if (!match) {
		warning('chat.contribution.ts - Could not find chat.editor.lineHeight setting as anchor');
		return { updated: false, errors: 0 };
	}

	// Extract indentation from the matched setting by looking at the line it's on
	const settingStart = content.lastIndexOf('\n', match.index) + 1;
	const settingLine = content.substring(settingStart, match.index);
	const indent = settingLine.match(/^\s*/)[0];

	// Build the new setting with proper indentation
	const newSetting = `${indent}'roodio.titleBarIcon.enabled': {
${indent}\ttype: 'boolean',
${indent}\tdescription: nls.localize('roodio.titleBarIcon.enabled', "Controls whether the Roo Dio chat icon is shown in the title bar."),
${indent}\tdefault: true
${indent}},
`;

	// Insert the new setting right after the anchor
	const insertIndex = match.index + match[0].length;
	const updatedContent = content.substring(0, insertIndex) + '\n' + newSetting + content.substring(insertIndex);

	if (writeFile(filePath, updatedContent)) {
		success('chat.contribution.ts - Added roodio.titleBarIcon.enabled setting');
		return { updated: true, errors: 0 };
	} else {
		error('chat.contribution.ts - Failed to update');
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

// Update titlebarPart.ts - Add menubar focus state change events for Roopik
function updateTitlebarPart() {
	const filePath = path.join(ROOT_DIR, 'src/vs/workbench/browser/parts/titlebar/titlebarPart.ts');

	if (!fileExists(filePath)) {
		warning('src/vs/workbench/browser/parts/titlebar/titlebarPart.ts not found (skipping)');
		return { updated: false, errors: 0 };
	}

	const titlebarPartPath = filePath;
	const content = readFile(filePath);
	if (!content) {
		return { updated: false, errors: 1 };
	}

	// Check if already updated
	if (content.includes('readonly onMenubarFocusStateChange: Event<boolean>')) {
		success('titlebarPart.ts - Roopik menubar focus state changes already present');
		return { updated: false, errors: 0 };
	}

	let updatedContent = content;
	let changesMade = 0;
	let changesFailed = 0;

	// ========================================================================
	// Change 1: Add onMenubarFocusStateChange to ITitlebarPart interface
	// ========================================================================
	const change1Search = 'readonly onMenubarVisibilityChange: Event<boolean>;';
	if (updatedContent.includes(change1Search)) {
		const change1Pattern = /(readonly onMenubarVisibilityChange: Event<boolean>;)/;
		const change1Replacement = `$1

	/**
	 * // ROOPIK
	 * An event when the menubar focus state changes (e.g., when a menu is opened/closed).
	 * Fires true when a menu is opened (focused), false when closed.
	 */
	readonly onMenubarFocusStateChange: Event<boolean>;`;

		if (change1Pattern.test(updatedContent)) {
			updatedContent = updatedContent.replace(change1Pattern, change1Replacement);
			info('titlebarPart.ts - [1/5] Added onMenubarFocusStateChange to ITitlebarPart interface');
			changesMade++;
		} else {
			warning('titlebarPart.ts - [1/5] Could not add to ITitlebarPart interface');
			changesFailed++;
		}
	} else {
		warning('titlebarPart.ts - [1/5] Could not find anchor text for ITitlebarPart interface');
		changesFailed++;
	}

	// ========================================================================
	// Change 2: Add onMenubarFocusStateChange assignment in BrowserTitleService constructor
	// ========================================================================
	const change2Search = 'this.onMenubarVisibilityChange = this.mainPart.onMenubarVisibilityChange;';
	if (updatedContent.includes(change2Search)) {
		const change2Pattern = /(this\.onMenubarVisibilityChange = this\.mainPart\.onMenubarVisibilityChange;)/;
		const change2Replacement = `$1
		this.onMenubarFocusStateChange = this.mainPart.onMenubarFocusStateChange; // ROOPIK`;

		if (change2Pattern.test(updatedContent)) {
			updatedContent = updatedContent.replace(change2Pattern, change2Replacement);
			info('titlebarPart.ts - [2/5] Added onMenubarFocusStateChange assignment in BrowserTitleService');
			changesMade++;
		} else {
			warning('titlebarPart.ts - [2/5] Could not add assignment in BrowserTitleService');
			changesFailed++;
		}
	} else {
		warning('titlebarPart.ts - [2/5] Could not find anchor text in BrowserTitleService constructor');
		changesFailed++;
	}

	// ========================================================================
	// Change 3: Add onMenubarFocusStateChange declaration in BrowserTitleService
	// ========================================================================
	const change3Search = 'readonly onMenubarVisibilityChange: Event<boolean>;';
	// We need to find the second occurrence (in BrowserTitleService class)
	const firstOccurrence = updatedContent.indexOf(change3Search);
	if (firstOccurrence !== -1) {
		const secondOccurrence = updatedContent.indexOf(change3Search, firstOccurrence + change3Search.length);
		if (secondOccurrence !== -1) {
			const before = updatedContent.substring(0, secondOccurrence + change3Search.length);
			const after = updatedContent.substring(secondOccurrence + change3Search.length);
			updatedContent = before + '\n\n\t// ROOPIK\n\treadonly onMenubarFocusStateChange: Event<boolean>;' + after;
			info('titlebarPart.ts - [3/5] Added onMenubarFocusStateChange declaration in BrowserTitleService');
			changesMade++;
		} else {
			warning('titlebarPart.ts - [3/5] Could not find second onMenubarVisibilityChange declaration');
			changesFailed++;
		}
	} else {
		warning('titlebarPart.ts - [3/5] Could not find anchor text for BrowserTitleService declaration');
		changesFailed++;
	}

	// ========================================================================
	// Change 4: Add emitter and event in BrowserTitlebarPart
	// ========================================================================
	const change4Search = 'readonly onMenubarVisibilityChange = this._onMenubarVisibilityChange.event;';

	if (updatedContent.includes(change4Search)) {
		const change4Pattern = /(readonly onMenubarVisibilityChange = this\._onMenubarVisibilityChange\.event;)/;
		const change4Replacement = `$1

	// ROOPIK
	private _onMenubarFocusStateChange = this._register(new Emitter<boolean>());
	readonly onMenubarFocusStateChange = this._onMenubarFocusStateChange.event;`;

		if (change4Pattern.test(updatedContent)) {
			updatedContent = updatedContent.replace(change4Pattern, change4Replacement);
			info('titlebarPart.ts - [4/5] Added emitter and event in BrowserTitlebarPart');
			changesMade++;
		} else {
			warning('titlebarPart.ts - [4/5] Could not add emitter in BrowserTitlebarPart');
			changesFailed++;
		}
	} else {
		warning('titlebarPart.ts - [4/5] Could not find anchor text in BrowserTitlebarPart');
		changesFailed++;
	}

	// ========================================================================
	// Change 5: Add listener in installMenubar() method
	// ========================================================================
	const change5Search = 'this._register(this.customMenubar.value.onVisibilityChange(e => this.onMenubarVisibilityChanged(e)));';

	if (updatedContent.includes(change5Search)) {
		const change5Pattern = /(this\._register\(this\.customMenubar\.value\.onVisibilityChange\(e => this\.onMenubarVisibilityChanged\(e\)\)\);)/;
		const change5Replacement = `$1

		// ROOPIK: Fire event when menubar focus state changes (menu opened/closed)
		this._register(this.customMenubar.value.onFocusStateChange(focused => this._onMenubarFocusStateChange.fire(focused)));`;

		if (change5Pattern.test(updatedContent)) {
			updatedContent = updatedContent.replace(change5Pattern, change5Replacement);
			info('titlebarPart.ts - [5/5] Added listener in installMenubar() method');
			changesMade++;
		} else {
			warning('titlebarPart.ts - [5/5] Could not add listener in installMenubar()');
			changesFailed++;
		}
	} else {
		warning('titlebarPart.ts - [5/5] Could not find anchor text in installMenubar()');
		changesFailed++;
	}

	// ========================================================================
	// Write file and report results
	// ========================================================================
	if (changesMade > 0) {
		const writeSuccess = writeFile(titlebarPartPath, updatedContent);
		if (writeSuccess) {
			info(`titlebarPart.ts - Applied ${changesMade}/5 changes`);
			if (changesFailed > 0) {
				warning(`titlebarPart.ts - ${changesFailed} change(s) failed to apply`);
			}
			return { updated: true, errors: changesFailed };
		} else {
			error('titlebarPart.ts - Failed to write file');
			return { updated: false, errors: 1 };
		}
	} else if (changesFailed > 0) {
		error(`titlebarPart.ts - All ${changesFailed} changes failed to apply`);
		return { updated: false, errors: changesFailed };
	}

	return { updated: false, errors: 0 };
}

// Update Dio tab positioning in auxiliary bar (make Dio appear before GitHub Copilot Chat)
function updateDioTabPositioning() {
	let totalUpdated = 0;
	let totalErrors = 0;

	// Change 1: viewsExtensionPoint.ts - Extensions start at order 1
	const viewsExtPath = path.join(ROOT_DIR, 'src/vs/workbench/api/browser/viewsExtensionPoint.ts');
	if (fileExists(viewsExtPath)) {
		let content = readFile(viewsExtPath);
		if (content) {
			const alreadyApplied = content.includes('let auxiliaryBarOrder = 1 + viewContainersRegistry');
			const needsUpdate = content.includes('let auxiliaryBarOrder = 100 + viewContainersRegistry');

			if (alreadyApplied) {
				success('viewsExtensionPoint.ts - Dio tab positioning already applied');
			} else if (needsUpdate) {
				content = content.replace(
					/let auxiliaryBarOrder = 100 \+ viewContainersRegistry\.all\.filter\(v => !!v\.extensionId && viewContainersRegistry\.getViewContainerLocation\(v\) === ViewContainerLocation\.AuxiliaryBar\)\.length \+ 1;/,
					'let auxiliaryBarOrder = 1 + viewContainersRegistry.all.filter(v => !!v.extensionId && viewContainersRegistry.getViewContainerLocation(v) === ViewContainerLocation.AuxiliaryBar).length;'
				);
				if (writeFile(viewsExtPath, content)) {
					success('viewsExtensionPoint.ts - Updated auxiliaryBarOrder (100 → 1)');
					totalUpdated++;
				} else {
					error('viewsExtensionPoint.ts - Failed to update');
					totalErrors++;
				}
			} else {
				warning('viewsExtensionPoint.ts - Could not find auxiliaryBarOrder line to update');
			}
		}
	} else {
		warning('viewsExtensionPoint.ts not found (skipping)');
	}

	// Change 2: chatParticipant.contribution.ts - Chat order 2, isDefault false
	const chatPartPath = path.join(ROOT_DIR, 'src/vs/workbench/contrib/chat/browser/chatParticipant.contribution.ts');
	if (fileExists(chatPartPath)) {
		let content = readFile(chatPartPath);
		if (content) {
			const alreadyApplied = content.includes('order: 2,') && content.includes('isDefault: false');
			const needsUpdate = content.includes('order: 1,') && content.includes('isDefault: true');

			if (alreadyApplied) {
				success('chatParticipant.contribution.ts - Dio tab positioning already applied');
			} else if (needsUpdate) {
				content = content.replace(/order: 1,/, 'order: 2,');
				content = content.replace(/isDefault: true,/, 'isDefault: false,');
				if (writeFile(chatPartPath, content)) {
					success('chatParticipant.contribution.ts - Updated Chat order (1 → 2) and isDefault (true → false)');
					totalUpdated++;
				} else {
					error('chatParticipant.contribution.ts - Failed to update');
					totalErrors++;
				}
			} else {
				warning('chatParticipant.contribution.ts - Could not find Chat registration to update');
			}
		}
	} else {
		warning('chatParticipant.contribution.ts not found (skipping)');
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

// Copy devtools-extensions from docs to resources and extract zips
function copyAndExtractDevtoolsExtensions() {
	const SOURCE_DIR = path.join(__dirname, 'resources', 'devtools-extensions');
	const TARGET_DIR = path.join(ROOT_DIR, 'resources', 'devtools-extensions');

	info('📦 Copying and extracting devtools-extensions...');

	// Check if source exists
	if (!fs.existsSync(SOURCE_DIR)) {
		warning(`Source not found: ${SOURCE_DIR}`);
		return { updated: false, errors: 0 };
	}

	let copiedCount = 0;
	let extractedCount = 0;
	let errorCount = 0;

	// Copy entire devtools-extensions folder recursively
	function copyRecursive(src, dest) {
		if (!fs.existsSync(dest)) {
			fs.mkdirSync(dest, { recursive: true });
		}

		const entries = fs.readdirSync(src, { withFileTypes: true });
		for (const entry of entries) {
			const srcPath = path.join(src, entry.name);
			const destPath = path.join(dest, entry.name);

			if (entry.isDirectory()) {
				copyRecursive(srcPath, destPath);
			} else {
				fs.copyFileSync(srcPath, destPath);
				copiedCount++;
			}
		}
	}

	if (DRY_RUN) {
		info('[DRY RUN] Would copy devtools-extensions folder');
		return { updated: true, errors: 0 };
	}

	// Copy the folder
	copyRecursive(SOURCE_DIR, TARGET_DIR);
	info(`Copied ${copiedCount} files to resources/devtools-extensions/`);

	// Get subdirectories and extract zips
	const entries = fs.readdirSync(TARGET_DIR, { withFileTypes: true });
	const subDirs = entries.filter(e => e.isDirectory()).map(e => e.name);

	for (const subDir of subDirs) {
		const subDirPath = path.join(TARGET_DIR, subDir);
		const files = fs.readdirSync(subDirPath);
		const zipFiles = files.filter(f => f.endsWith('.zip'));
		const nonZipFiles = files.filter(f => !f.endsWith('.zip') && f !== '.gitkeep');

		// Skip if already extracted (has non-zip files and no zips remaining from a previous run)
		if (zipFiles.length === 0 && nonZipFiles.length > 1) {
			success(`${subDir} - Already extracted`);
			continue;
		}

		for (const zipFile of zipFiles) {
			const zipPath = path.join(subDirPath, zipFile);

			// Extract zip using unzip (available in Git Bash on Windows)
			// Note: CRX files (Chrome extensions) have extra header bytes, unzip warns but extracts anyway
			const zipPathUnix = zipPath.replace(/\\/g, '/');
			const destPathUnix = subDirPath.replace(/\\/g, '/');
			try {
				execSync(`unzip -o "${zipPathUnix}" -d "${destPathUnix}"`, {
					stdio: 'pipe'
				});
			} catch (err) {
				// unzip may return non-zero for warnings but still extract successfully
				// We'll verify by checking if files exist after
			}

			// Verify extraction worked - check if there are extracted files (beyond .gitkeep and the zip)
			const filesAfter = fs.readdirSync(subDirPath).filter(f => !f.endsWith('.zip') && f !== '.gitkeep');
			if (filesAfter.length > 1) {
				success(`Extracted: ${subDir}/${zipFile}`);
				extractedCount++;

				// Delete the zip file after successful extraction
				fs.unlinkSync(zipPath);
				info(`Deleted: ${subDir}/${zipFile}`);
			} else {
				error(`Extraction failed for ${subDir}/${zipFile} - no files found after extraction`);
				errorCount++;
			}
		}
	}

	if (copiedCount > 0 || extractedCount > 0) {
		success(`✓ Devtools: ${copiedCount} files copied, ${extractedCount} zips extracted`);
		return { updated: true, errors: errorCount };
	}

	return { updated: false, errors: errorCount };
}

// Apply app.ts patch
function applyAppTsPatch() {
	const patchPath = path.join(__dirname, 'patches', 'app.ts.patch');

	if (!fileExists(patchPath)) {
		warning('app.ts.patch not found - skipping');
		info(`Expected location: ${patchPath}`);
		return { updated: false, errors: 0 };
	}

	info('Applying app.ts patch...');

	if (DRY_RUN) {
		info('[DRY RUN] Would apply: git apply docs/UPDATE_REBASE/patches/app.ts.patch');
		return { updated: true, errors: 0 };
	}

	try {
		execSync('git apply docs/UPDATE_REBASE/patches/app.ts.patch', {
			cwd: ROOT_DIR,
			stdio: 'pipe'
		});
		success('✓ Applied app.ts patch successfully');
		return { updated: true, errors: 0 };
	} catch (err) {
		// Check if patch was already applied
		try {
			execSync('git apply --check docs/UPDATE_REBASE/patches/app.ts.patch', {
				cwd: ROOT_DIR,
				stdio: 'pipe'
			});
			// If check passes, patch wasn't applied yet, so the error is real
			error(`Failed to apply app.ts patch: ${err.message}`);
			return { updated: false, errors: 1 };
		} catch (checkErr) {
			// Check failed, likely because patch is already applied
			success('✓ app.ts patch already applied');
			return { updated: false, errors: 0 };
		}
	}
}

// Normalize line endings in patch files (CRLF -> LF)
function normalizePatchLineEndings(patchPath) {
	try {
		const content = fs.readFileSync(patchPath, 'utf8');
		if (content.includes('\r\n')) {
			const normalized = content.replace(/\r\n/g, '\n');
			fs.writeFileSync(patchPath, normalized, 'utf8');
			return true; // Was normalized
		}
		return false; // Already LF
	} catch (err) {
		warning(`Could not normalize line endings for ${patchPath}: ${err.message}`);
		return false;
	}
}

function applyAppxPatches() {
	const patches = [
		'disable-appx-gulpfile-vscode.patch',
		'disable-appx-gulpfile-win32.patch',
		'fix-macos-bypass-keychain-prompts-fix-strict-build.patch',
		'settingsLayout-roopik-settings.patch'
	];

	let appliedCount = 0;
	let errorCount = 0;

	for (const patchFile of patches) {
		const patchPath = path.join(__dirname, 'patches', patchFile);

		if (!fileExists(patchPath)) {
			warning(`${patchFile} not found - skipping`);
			info(`Expected location: ${patchPath}`);
			continue;
		}

		// Normalize line endings before applying (CRLF -> LF)
		normalizePatchLineEndings(patchPath);

		info(`Applying ${patchFile}...`);

		if (DRY_RUN) {
			info(`[DRY RUN] Would apply: git apply docs/UPDATE_REBASE/patches/${patchFile}`);
			appliedCount++;
			continue;
		}

		// First check if patch is already applied using reverse check
		try {
			execSync(`git apply --reverse --check docs/UPDATE_REBASE/patches/${patchFile}`, {
				cwd: ROOT_DIR,
				stdio: 'pipe'
			});
			// Reverse check passed - patch is already applied
			success(`✓ ${patchFile} already applied`);
			continue;
		} catch (reverseErr) {
			// Patch not yet applied, try to apply it
		}

		try {
			execSync(`git apply docs/UPDATE_REBASE/patches/${patchFile}`, {
				cwd: ROOT_DIR,
				stdio: 'pipe'
			});
			success(`✓ Applied ${patchFile} successfully`);
			appliedCount++;
		} catch (err) {
			// Check if patch can be applied with 3-way merge
			try {
				execSync(`git apply --3way docs/UPDATE_REBASE/patches/${patchFile}`, {
					cwd: ROOT_DIR,
					stdio: 'pipe'
				});
				success(`✓ Applied ${patchFile} with 3-way merge`);
				appliedCount++;
			} catch (threeWayErr) {
				error(`Failed to apply ${patchFile}: ${err.message}`);
				info(`Patch may need manual update due to upstream changes`);
				errorCount++;
			}
		}
	}

	return { updated: appliedCount > 0, errors: errorCount };
}


// Bypass signature verification directly in code
function bypassSignatureVerification() {
	const targetFile = 'src/vs/platform/extensionManagement/node/extensionManagementService.ts';
	const fullPath = path.join(ROOT_DIR, targetFile);

	info(''); // Add newline
	info('🔧 Bypassing Extension Signature Verification...');

	if (!fileExists(fullPath)) {
		error(`${targetFile} not found!`);
		return { updated: false, errors: 1 };
	}

	const content = readFile(fullPath);

	// Check if already modified
	if (content.includes('verifySignature = false; // Roopik: Disable signature verification')) {
		success('✓ Signature verification already bypassed');
		return { updated: false, errors: 0 };
	}

	// Pattern to find matches the structure in extensionManagementService.ts
	const searchPattern = /if\s*\(verifySignature\)\s*\{\s*const\s+value\s*=\s*this\.configurationService\.getValue\(VerifyExtensionSignatureConfigKey\);\s*verifySignature\s*=\s*isBoolean\(value\)\s*\?\s*value\s*:\s*true;\s*\}/;

	const replacement = `if (verifySignature) {
			this.logService.trace(\`Roopik: Bypassing signature verification for \${extension.identifier.id}. Original config key: \${VerifyExtensionSignatureConfigKey}. Configuration service available: \${!!this.configurationService}\`);
			// const value = this.configurationService.getValue(VerifyExtensionSignatureConfigKey);
			// verifySignature = isBoolean(value) ? value : true;
			verifySignature = false; // Roopik: Disable signature verification
		}`;

	if (!searchPattern.test(content)) {
		// Fallback: search for the inner lines if block matching fails
		const innerPattern = /const\s+value\s*=\s*this\.configurationService\.getValue\(VerifyExtensionSignatureConfigKey\);\s*verifySignature\s*=\s*isBoolean\(value\)\s*\?\s*value\s*:\s*true;/;

		if (innerPattern.test(content)) {
			const replacementInner = `this.logService.trace(\`Roopik: Bypassing signature verification for \${extension.identifier.id}. Original config key: \${VerifyExtensionSignatureConfigKey}. Configuration service available: \${!!this.configurationService}\`);
			// const value = this.configurationService.getValue(VerifyExtensionSignatureConfigKey);
			// verifySignature = isBoolean(value) ? value : true;
			verifySignature = false; // Roopik: Disable signature verification`;

			if (DRY_RUN) {
				info('[DRY RUN] Would bypass signature verification in code (inner match).');
				return { updated: false, errors: 0 };
			}

			const newContent = content.replace(innerPattern, replacementInner);
			writeFile(fullPath, newContent);
			success('✓ Bypassed signature verification (inner match)');
			return { updated: true, errors: 0 };
		}

		error('Could not locate the signature verification code block to replace.');
		return { updated: false, errors: 1 };
	}

	if (DRY_RUN) {
		info(`[DRY RUN] Would replace code in ${targetFile}`);
		return { updated: false, errors: 0 };
	}

	const newContent = content.replace(searchPattern, replacement);
	writeFile(fullPath, newContent);
	success(`✓ Bypassed signature verification in ${targetFile}`);
	return { updated: true, errors: 0 };
}

// Update Linux package branding (DEB, RPM, Snap, AppData)
function updateLinuxPackageBranding() {
	const linuxBrandingUpdates = [
		{
			file: 'resources/linux/debian/control.template',
			replacements: [
				{ search: /Maintainer: Microsoft Corporation <vscode-linux@microsoft\.com>/g, replace: 'Maintainer: Roopik Labs <support@roopik.com>' },
				{ search: /Homepage: https:\/\/code\.visualstudio\.com\//g, replace: 'Homepage: https://roopik.com/' },
				{ search: /Description: Code editing\. Redefined\./g, replace: 'Description: AI-Native Canvas-First IDE' },
				{ search: /Visual Studio Code is a new choice of tool[\s\S]*?instructions and FAQ\./g, replace: 'Roopik is an AI-native, canvas-first IDE built for modern development.\n See https://roopik.com for installation instructions and FAQ.' }
			]
		},
		{
			file: 'resources/linux/snap/snapcraft.yaml',
			replacements: [
				{ search: /summary: Code editing\. Redefined\./g, replace: 'summary: AI-Native Canvas-First IDE' },
				{ search: /description: \|[\s\S]*?edit-build-debug cycle\./g, replace: 'description: |\n  Roopik is an AI-native, canvas-first IDE built for modern development.' }
			]
		},
		{
			file: 'resources/linux/rpm/code.spec.template',
			replacements: [
				{ search: /Summary:\s+Code editing\. Redefined\./g, replace: 'Summary:  AI-Native Canvas-First IDE' },
				{ search: /Vendor:\s+Microsoft Corporation/g, replace: 'Vendor:   Roopik Labs' },
				{ search: /Packager: Visual Studio Code Team <vscode-linux@microsoft\.com>/g, replace: 'Packager: Roopik Labs <support@roopik.com>' },
				{ search: /URL:\s+https:\/\/code\.visualstudio\.com\//g, replace: 'URL:      https://roopik.com/' },
				{ search: /Visual Studio Code is a new choice of tool[\s\S]*?instructions and FAQ\./g, replace: 'Roopik is an AI-native, canvas-first IDE built for modern development. See https://roopik.com for installation instructions and FAQ.' }
			]
		},
		{
			file: 'resources/linux/code.appdata.xml',
			replacements: [
				{ search: /<url type="homepage">https:\/\/code\.visualstudio\.com<\/url>/g, replace: '<url type="homepage">https://roopik.com</url>' },
				{ search: /<summary>Visual Studio Code\. Code editing\. Redefined\.<\/summary>/g, replace: '<summary>Roopik. AI-Native Canvas-First IDE.</summary>' },
				{ search: /<p>Visual Studio Code is a new choice[\s\S]*?instructions and FAQ\.<\/p>/g, replace: '<p>Roopik is an AI-native, canvas-first IDE built for modern development. See https://roopik.com for installation instructions and FAQ.</p>' },
				{ search: /<image>https:\/\/code\.visualstudio\.com\/home\/home-screenshot-linux-lg\.png<\/image>/g, replace: '<image>https://roopik.com/screenshot.png</image>' },
				{ search: /<caption>Editing TypeScript and searching for extensions<\/caption>/g, replace: '<caption>Roopik IDE interface</caption>' }
			]
		}
	];

	let updated = false;
	const errors = 0;

	for (const { file, replacements } of linuxBrandingUpdates) {
		const fullPath = path.join(ROOT_DIR, file);
		if (!fileExists(fullPath)) {
			continue; // Skip if file doesn't exist
		}

		let content = readFile(fullPath);
		let modified = false;

		for (const { search, replace } of replacements) {
			if (search.test(content)) {
				content = content.replace(search, replace);
				modified = true;
			}
		}

		if (modified) {
			if (DRY_RUN) {
				info(`[DRY-RUN] Would update ${file}`);
			} else {
				writeFile(fullPath, content);
				success(`${file} - Updated Linux package branding`);
				updated = true;
			}
		} else {
			success(`${file} - Already branded`);
		}
	}

	return { updated, errors };
}

// Generate installer images using Python script
function generateInstallerImages() {
	const pythonScript = path.join(__dirname, 'generate_installer_images.py');
	const logoPath = path.join(__dirname, 'roopik-logo.png');

	if (!fileExists(pythonScript)) {
		warning('generate_installer_images.py not found (skipping installer images)');
		return { updated: false, errors: 0 };
	}

	if (!fileExists(logoPath)) {
		warning('roopik-logo.png not found (skipping installer images)');
		return { updated: false, errors: 0 };
	}

	if (DRY_RUN) {
		info('[DRY-RUN] Would generate installer images');
		return { updated: false, errors: 0 };
	}

	try {
		info('Generating installer images (BMP files for Inno Setup)...');
		execSync(`python "${pythonScript}" "${logoPath}"`, { cwd: ROOT_DIR, stdio: 'inherit' });
		success('Installer images generated successfully');
		return { updated: true, errors: 0 };
	} catch (err) {
		warning(`Failed to generate installer images: ${err.message}`);
		info('Make sure Python and Pillow are installed: pip install Pillow');
		return { updated: false, errors: 0 }; // Non-fatal error
	}
}

// Copy Roopik build scripts to VS Code build folder
function copyRoopikBuildScripts() {
	const scriptsToSync = [
		{
			source: 'docs/UPDATE_REBASE/roopik/build/scripts/generateDOMWhitelist.mjs',
			dest: 'build/scripts/generateDOMWhitelist.mjs',
			description: 'DOM Whitelist Generator script'
		}
	];

	let updated = false;
	let errors = 0;

	for (const script of scriptsToSync) {
		const sourcePath = path.join(ROOT_DIR, script.source);
		const destPath = path.join(ROOT_DIR, script.dest);
		const destDir = path.dirname(destPath);

		// Check if source exists
		if (!fileExists(sourcePath)) {
			warning(`${script.description} - Source not found: ${script.source}`);
			continue;
		}

		// Create destination directory if needed
		if (!fs.existsSync(destDir)) {
			if (!DRY_RUN) {
				fs.mkdirSync(destDir, { recursive: true });
			}
		}

		// Check if already identical
		if (fileExists(destPath)) {
			const sourceContent = readFile(sourcePath);
			const destContent = readFile(destPath);
			if (sourceContent === destContent) {
				success(`${script.description} - Already up to date`);
				continue;
			}
		}

		if (DRY_RUN) {
			info(`[DRY-RUN] Would copy ${script.source} → ${script.dest}`);
			continue;
		}

		if (copyFile(sourcePath, destPath)) {
			success(`${script.description} - Copied to ${script.dest}`);
			updated = true;
		} else {
			error(`${script.description} - Failed to copy`);
			errors++;
		}
	}

	return { updated, errors };
}

/**
 * Clean up Microsoft-specific files from .github folder
 * These files are internal to VS Code/Microsoft and not needed for the Roopik fork
 */
function cleanupGitHubFiles() {
	log('\n🧹 Cleaning up Microsoft-specific .github files...\n', 'cyan');

	// Files and folders to remove (Microsoft internal, not needed for fork)
	const itemsToRemove = [
		// Microsoft internal files
		'.github/CODENOTIFY',
		'.github/CODEOWNERS',
		'.github/classifier.json',
		'.github/commands.json',
		'.github/similarity.yml',
		'.github/insiders.yml',

		// Microsoft internal folders
		'.github/commands',
		'.github/endgame',
		'.github/agents',
		'.github/instructions',
		'.github/prompts',

		// Microsoft-specific workflows
		'.github/workflows/copilot-setup-steps.yml',
		'.github/workflows/monaco-editor.yml',
		'.github/workflows/no-engineering-system-changes.yml',
		'.github/workflows/no-package-lock-changes.yml',
		'.github/workflows/pr.yml',
		'.github/workflows/pr-darwin-test.yml',
		'.github/workflows/pr-linux-cli-test.yml',
		'.github/workflows/pr-linux-test.yml',
		'.github/workflows/pr-node-modules.yml',
		'.github/workflows/pr-win32-test.yml',
		'.github/workflows/telemetry.yml',
	];

	let removedCount = 0;
	let errors = 0;

	for (const item of itemsToRemove) {
		const fullPath = path.join(ROOT_DIR, item);

		try {
			if (fs.existsSync(fullPath)) {
				const stat = fs.statSync(fullPath);

				if (DRY_RUN) {
					info(`Would remove: ${item}`);
					removedCount++;
				} else {
					if (stat.isDirectory()) {
						fs.rmSync(fullPath, { recursive: true, force: true });
					} else {
						fs.unlinkSync(fullPath);
					}
					success(`Removed: ${item}`);
					removedCount++;
				}
			}
			// If file doesn't exist, silently skip (graceful handling)
		} catch (err) {
			warning(`Could not remove ${item}: ${err.message}`);
			errors++;
		}
	}

	if (removedCount > 0) {
		log(`\n   Cleaned up ${removedCount} Microsoft-specific items`, 'green');
	} else {
		info('No Microsoft-specific items to clean up (already removed or not present)');
	}

	return { updated: removedCount > 0, errors, removedCount };
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

	// Apply product enhancements from external JSON file
	const enhancementsResult = applyProductEnhancements();
	if (enhancementsResult.updated) {
		totalChanges++;
	}
	totalErrors += enhancementsResult.errors;

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

	const npmDirsResult = updateNpmDirs();
	if (npmDirsResult.updated) {
		totalChanges++;
	}
	totalErrors += npmDirsResult.errors;

	const gulpfileResult = updateGulpfileExtensions();
	if (gulpfileResult.updated) {
		totalChanges++;
	}
	totalErrors += gulpfileResult.errors;

	const gulpfileVscodeResult = updateGulpfileVscode();
	if (gulpfileVscodeResult.updated) {
		totalChanges++;
	}
	totalErrors += gulpfileVscodeResult.errors;

	const gulpfileMcpResult = updateGulpfileMcpBinaries();
	if (gulpfileMcpResult.updated) {
		totalChanges++;
	}
	totalErrors += gulpfileMcpResult.errors;

	const hygieneResult = updateHygieneMjs();
	if (hygieneResult.updated) {
		totalChanges++;
	}
	totalErrors += hygieneResult.errors;

	const filtersResult = updateFiltersTs();
	if (filtersResult.updated) {
		totalChanges++;
	}
	totalErrors += filtersResult.errors;

	const eslintIgnoreResult = updateEslintIgnore();
	if (eslintIgnoreResult.updated) {
		totalChanges++;
	}
	totalErrors += eslintIgnoreResult.errors;

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

	const productOverridesResult = removeProductOverridesFromGitignore();
	if (productOverridesResult.updated) {
		totalChanges++;
	}
	totalErrors += productOverridesResult.errors;

	const gitignoreResult = updateGitignore();
	if (gitignoreResult.updated) {
		totalChanges++;
	}
	totalErrors += gitignoreResult.errors;

	const gitattributesResult = updateGitAttributes();
	if (gitattributesResult.updated) {
		totalChanges++;
	}
	totalErrors += gitattributesResult.errors;

	// Clean up Microsoft-specific .github files
	const githubCleanupResult = cleanupGitHubFiles();
	if (githubCleanupResult.updated) {
		totalChanges += githubCleanupResult.removedCount;
	}
	totalErrors += githubCleanupResult.errors;

	// ============================================================================
	// Manual Code Changes - Core Integration
	// ============================================================================
	log('\n🔧 Applying manual code changes (Core Integration)...\n', 'cyan');

	const workbenchResult = updateWorkbenchCommonMain();
	if (workbenchResult.updated) {
		totalChanges++;
	}
	totalErrors += workbenchResult.errors;

	const chatContribResult = updateChatContribution();
	if (chatContribResult.updated) {
		totalChanges++;
	}
	totalErrors += chatContribResult.errors;

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

	const titlebarResult = updateTitlebarPart();
	if (titlebarResult.updated) {
		totalChanges++;
	}
	totalErrors += titlebarResult.errors;

	const dioTabResult = updateDioTabPositioning();
	if (dioTabResult.updated) {
		totalChanges++;
	}
	totalErrors += dioTabResult.errors;

	// Install Roopik dependencies
	log('\n📦 Installing Roopik dependencies...\n', 'cyan');
	const depsResult = installRoopikDependencies(config);
	if (depsResult.updated) {
		totalChanges++;
	}
	totalErrors += depsResult.errors;

	// Add Roopik npm scripts
	log('\n📜 Adding Roopik npm scripts...\n', 'cyan');
	const scriptsResult = addPackageJsonScripts(config);
	if (scriptsResult.updated) {
		totalChanges++;
	}
	totalErrors += scriptsResult.errors;

	// Process icon replacements
	if (!SKIP_ICONS) {
		log('\n🎨 Processing icon replacements...\n', 'cyan');
		const iconResult = processIconReplacements(config);
		totalChanges += iconResult.changes;
		totalErrors += iconResult.errors;
	}

	// Apply app.ts patch
	log('\n🔧 Applying app.ts patch...\n', 'cyan');
	const patchResult = applyAppTsPatch();
	if (patchResult.updated) {
		totalChanges++;
	}
	totalErrors += patchResult.errors;

	// Apply AppX patches
	log('\n🔧 Applying AppX patches...\n', 'cyan');
	const appxPatchResult = applyAppxPatches();
	if (appxPatchResult.updated) {
		totalChanges++;
	}
	totalErrors += appxPatchResult.errors;

	const signatureResult = bypassSignatureVerification();
	if (signatureResult.updated) {
		totalChanges++;
	}
	totalErrors += signatureResult.errors;

	// Copy Roopik build scripts
	log('\n📜 Copying Roopik build scripts...\n', 'cyan');
	const buildScriptsResult = copyRoopikBuildScripts();
	if (buildScriptsResult.updated) {
		totalChanges++;
	}
	totalErrors += buildScriptsResult.errors;

	// Update Linux package branding
	log('\n🐧 Updating Linux package branding...\n', 'cyan');
	const linuxBrandingResult = updateLinuxPackageBranding();
	if (linuxBrandingResult.updated) {
		totalChanges++;
	}
	totalErrors += linuxBrandingResult.errors;

	// Generate installer images
	if (!SKIP_ICONS) {
		log('\n🖼️  Generating installer images...\n', 'cyan');
		const installerImagesResult = generateInstallerImages();
		if (installerImagesResult.updated) {
			totalChanges++;
		}
		totalErrors += installerImagesResult.errors;
	}

	// Copy and extract devtools-extensions from RoopikDocs
	log('\n🔧 Copying devtools-extensions...\n', 'cyan');
	const devtoolsResult = copyAndExtractDevtoolsExtensions();
	if (devtoolsResult.updated) {
		totalChanges++;
	}
	totalErrors += devtoolsResult.errors;

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
