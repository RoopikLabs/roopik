#!/usr/bin/env node

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Asset Copy Script
 *
 * TypeScript compiler only handles .ts files. This script copies additional assets
 * (.js, .json, etc.) from src/ to out/ maintaining directory structure.
 *
 * Industry standard approach for mixed TypeScript/JavaScript projects.
 */

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..', 'src');
const OUT_DIR = path.join(__dirname, '..', 'out');

/**
 * File patterns to copy (non-TypeScript assets)
 */
const COPY_PATTERNS = [
	'**/*.js',     // JavaScript files (serverWorker.js, plugins, etc.)
	'**/*.html',   // HTML templates (projectPreviewTemplate.html, etc.)
];

/**
 * Directories to exclude from copying
 */
const EXCLUDE_PATTERNS = [
	'node_modules',
	'.git',
	'test',
	'tests',
	'__tests__',
];

/**
 * Check if path matches any exclude pattern
 */
function shouldExclude(filePath) {
	return EXCLUDE_PATTERNS.some(pattern => filePath.includes(path.sep + pattern + path.sep));
}

/**
 * Check if file matches copy patterns
 */
function shouldCopy(fileName) {
	return COPY_PATTERNS.some(pattern => {
		const regex = pattern.replace('**/', '').replace('*', '.*');
		return new RegExp(regex).test(fileName);
	});
}

/**
 * Recursively copy assets from src to out
 */
function copyAssets(srcDir, outDir) {
	let copiedCount = 0;

	function walk(currentSrcDir, currentOutDir) {
		// Ensure output directory exists
		if (!fs.existsSync(currentOutDir)) {
			fs.mkdirSync(currentOutDir, { recursive: true });
		}

		const entries = fs.readdirSync(currentSrcDir, { withFileTypes: true });

		for (const entry of entries) {
			const srcPath = path.join(currentSrcDir, entry.name);
			const outPath = path.join(currentOutDir, entry.name);

			// Skip excluded directories
			if (shouldExclude(srcPath)) {
				continue;
			}

			if (entry.isDirectory()) {
				// Recurse into subdirectory
				walk(srcPath, outPath);
			} else if (entry.isFile() && shouldCopy(entry.name)) {
				// Copy file
				fs.copyFileSync(srcPath, outPath);
				console.log(`  ✓ Copied: ${path.relative(SRC_DIR, srcPath)} → ${path.relative(OUT_DIR, outPath)}`);
				copiedCount++;
			}
		}
	}

	walk(srcDir, outDir);
	return copiedCount;
}

/**
 * Main execution
 */
function main() {
	console.log('[Roopik Build] Copying assets from src/ to out/...');
	console.log(`[Roopik Build] Source: ${SRC_DIR}`);
	console.log(`[Roopik Build] Output: ${OUT_DIR}`);
	console.log('');

	try {
		const copiedCount = copyAssets(SRC_DIR, OUT_DIR);
		console.log('');
		console.log(`[Roopik Build] ✓ Successfully copied ${copiedCount} asset file(s)`);
		process.exit(0);
	} catch (error) {
		console.error('[Roopik Build] ✗ Error copying assets:', error);
		process.exit(1);
	}
}

main();
