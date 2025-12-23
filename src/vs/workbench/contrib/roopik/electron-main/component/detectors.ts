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
 * Auto-detect entry file in component folder
 *
 * Priority order:
 * 1. index.tsx
 * 2. index.ts
 * 3. {folderName}.tsx
 * 4. {folderName}.ts
 *
 * @param folderPath Absolute path to component folder
 * @returns Entry file name (e.g., "Button.tsx")
 * @throws Error if no entry file found
 */
export async function detectEntryFile(folderPath: string): Promise<string> {
	try {
		// Get folder name for {folderName}.tsx pattern
		const folderName = path.basename(folderPath);

		// Check each candidate in priority order
		const candidates = [
			'index.tsx',
			'index.ts',
			`${folderName}.tsx`,
			`${folderName}.ts`
		];

		for (const candidate of candidates) {
			const filePath = path.join(folderPath, candidate);
			const exists = await fileExists(filePath);
			if (exists) {
				console.log(`[Detector] Found entry file: ${candidate}`);
				return candidate;
			}
		}

		// No entry file found
		throw new Error(
			`Could not find entry file in ${folderPath}. ` +
			`Looked for: ${candidates.join(', ')}`
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

		// Check for JSX/TSX without explicit imports (might be plain HTML or Vue template)
		if (entryFilePath.endsWith('.html')) {
			console.log(`[Detector] Framework detected: html`);
			return 'html';
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
 * Check if file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

/**
 * Read file content
 */
async function readFile(filePath: string): Promise<string> {
	return fs.readFile(filePath, 'utf-8');
}
