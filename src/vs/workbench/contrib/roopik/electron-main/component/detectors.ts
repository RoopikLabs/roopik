/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Component Auto-Detection Utilities
 *
 * Plugin-based detectors for:
 * - Entry file detection (index.tsx, index.ts, {folderName}.tsx, etc.)
 * - Framework detection (react, vue, svelte, solid, preact, unknown)
 *
 * These run during addComponent ingestion when optional fields are missing.
 */

import { promises as fs } from 'fs';
import * as path from '../../../../../base/common/path.js';
import type { Framework } from '../../common/storage/storageTypes.js';
import { detectFrameworkFromFile } from '../../common/build/componentParser.js';

// ============================================================================
// Entry File Detector
// ============================================================================

/**
 * Supported component file extensions
 */
const SUPPORTED_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js', '.vue', '.svelte'];

/**
 * Auto-detect entry file in component folder
 *
 * Detection priority:
 * 1. SINGLE FILE: If folder has exactly one supported file → use it (simple case!)
 * 2. index.tsx / index.ts / index.jsx / index.js
 * 3. {folderName}.tsx / {folderName}.ts / {folderName}.jsx / {folderName}.js
 * 4. Any single .vue or .svelte file
 *
 * @param folderPath Absolute path to component folder
 * @returns Entry file name (e.g., "Button.tsx")
 * @throws Error if no entry file found
 */
export async function detectEntryFile(folderPath: string): Promise<string> {
	try {
		// Get all files in folder
		const entries = await fs.readdir(folderPath, { withFileTypes: true });
		const files = entries
			.filter(e => e.isFile())
			.map(e => e.name);

		// Filter to only supported component files
		const supportedFiles = files.filter(f => {
			const ext = path.extname(f).toLowerCase();
			return SUPPORTED_EXTENSIONS.includes(ext);
		});


		// ================================================================
		// PRIORITY 1: Single supported file → use it directly!
		// ================================================================
		// This is the simplest and most common case
		if (supportedFiles.length === 1) {
			return supportedFiles[0];
		}

		// ================================================================
		// PRIORITY 2: Check for index files
		// ================================================================
		const indexCandidates = ['index.tsx', 'index.ts', 'index.jsx', 'index.js'];
		for (const candidate of indexCandidates) {
			if (supportedFiles.includes(candidate)) {
				return candidate;
			}
		}

		// ================================================================
		// PRIORITY 3: Check for {folderName}.ext files
		// ================================================================
		const folderName = path.basename(folderPath);
		const folderNameCandidates = [
			`${folderName}.tsx`,
			`${folderName}.ts`,
			`${folderName}.jsx`,
			`${folderName}.js`
		];
		for (const candidate of folderNameCandidates) {
			if (supportedFiles.includes(candidate)) {
				return candidate;
			}
		}

		// ================================================================
		// PRIORITY 4: Single .vue or .svelte file
		// ================================================================
		const vueFiles = supportedFiles.filter(f => f.endsWith('.vue'));
		if (vueFiles.length === 1) {
			return vueFiles[0];
		}

		const svelteFiles = supportedFiles.filter(f => f.endsWith('.svelte'));
		if (svelteFiles.length === 1) {
			return svelteFiles[0];
		}

		// ================================================================
		// FALLBACK: No clear entry file found
		// ================================================================
		throw new Error(
			`Could not determine entry file in ${folderPath}. ` +
			`Found ${supportedFiles.length} files: ${supportedFiles.join(', ')}. ` +
			`Expected: single file, index.*, or ${folderName}.*`
		);
	} catch (error) {
		console.error(`[Detector] Entry file detection failed:`, error);
		throw error;
	}
}

// ============================================================================
// Framework Detector
// ============================================================================

/**
 * Detect framework from entry file
 *
 * NOTE: Thin wrapper around ComponentParser.detectFrameworkFromFile()
 * @param entryFilePath Absolute path to entry file (e.g., /src/Button/Button.tsx)
 * @returns Detected framework
 */
export async function detectFramework(entryFilePath: string): Promise<Framework> {
	return detectFrameworkFromFile(entryFilePath);
}

