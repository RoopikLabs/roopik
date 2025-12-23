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
import * as path from 'path';
import { Framework } from '../../common/storage/storageTypes.js';

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

		console.log(`[Detector] Found ${supportedFiles.length} supported files in ${folderPath}`);

		// ================================================================
		// PRIORITY 1: Single supported file → use it directly!
		// ================================================================
		// This is the simplest and most common case
		if (supportedFiles.length === 1) {
			console.log(`[Detector] ✅ Single file detected: ${supportedFiles[0]}`);
			return supportedFiles[0];
		}

		// ================================================================
		// PRIORITY 2: Check for index files
		// ================================================================
		const indexCandidates = ['index.tsx', 'index.ts', 'index.jsx', 'index.js'];
		for (const candidate of indexCandidates) {
			if (supportedFiles.includes(candidate)) {
				console.log(`[Detector] ✅ Found index file: ${candidate}`);
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
				console.log(`[Detector] ✅ Found folder-named file: ${candidate}`);
				return candidate;
			}
		}

		// ================================================================
		// PRIORITY 4: Single .vue or .svelte file
		// ================================================================
		const vueFiles = supportedFiles.filter(f => f.endsWith('.vue'));
		if (vueFiles.length === 1) {
			console.log(`[Detector] ✅ Found single Vue file: ${vueFiles[0]}`);
			return vueFiles[0];
		}

		const svelteFiles = supportedFiles.filter(f => f.endsWith('.svelte'));
		if (svelteFiles.length === 1) {
			console.log(`[Detector] ✅ Found single Svelte file: ${svelteFiles[0]}`);
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
 * Auto-detect framework from entry file imports
 *
 * Reads the file and looks for framework-specific imports:
 * - 'react' or 'react-dom' → 'react'
 * - 'vue' → 'vue'
 * - 'svelte' → 'svelte'
 * - 'solid-js' → 'solid'
 * - 'preact' → 'preact'
 * - else → 'unknown'
 *
 * @param entryFilePath Absolute path to entry file (e.g., /src/Button/Button.tsx)
 * @returns Detected framework
 */
export async function detectFramework(entryFilePath: string): Promise<Framework> {
	try {
		// Read file content
		const content = await readFile(entryFilePath);

		// Extract all imports using regex
		// Matches: import ... from 'package' or import ... from "package"
		const importRegex = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
		const imports: string[] = [];

		let match;
		while ((match = importRegex.exec(content)) !== null) {
			imports.push(match[1]);
		}

		console.log(`[Detector] Detected imports:`, imports);

		// Check for framework-specific imports
		if (imports.some(imp => imp === 'react' || imp === 'react-dom')) {
			console.log(`[Detector] Framework detected: react`);
			return 'react';
		}

		if (imports.some(imp => imp === 'vue')) {
			console.log(`[Detector] Framework detected: vue`);
			return 'vue';
		}

		if (imports.some(imp => imp === 'svelte')) {
			console.log(`[Detector] Framework detected: svelte`);
			return 'svelte';
		}

		if (imports.some(imp => imp === 'solid-js' || imp === 'solid-js/web')) {
			console.log(`[Detector] Framework detected: solid`);
			return 'solid';
		}

		if (imports.some(imp => imp === 'preact')) {
			console.log(`[Detector] Framework detected: preact`);
			return 'preact';
		}

		// Default to unknown
		console.log(`[Detector] Framework not detected, defaulting to 'unknown'`);
		return 'unknown';
	} catch (error) {
		console.error(`[Detector] Framework detection failed:`, error);
		// Return unknown on error instead of throwing
		return 'unknown';
	}
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Read file content
 */
async function readFile(filePath: string): Promise<string> {
	return fs.readFile(filePath, 'utf-8');
}
