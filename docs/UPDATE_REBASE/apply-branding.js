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
			if (product[key] !== value) {
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
