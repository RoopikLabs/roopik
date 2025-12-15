/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * SolidJS Source Tracking Plugin
 *
 * Adds data-roopik-source attributes to SolidJS components.
 *
 * IMPORTANT: SolidJS compiles JSX into template literals at build time.
 * By the time a normal Vite transform runs, the JSX is already converted to:
 *   var _tmpl$ = _$template(`<div>...</div>`);
 *
 * To inject our attributes, we must read the ORIGINAL source file
 * before any transformation happens.
 *
 * Strategy:
 * - Read the original .jsx/.tsx file from disk
 * - Transform the raw JSX source
 * - Return the transformed code (Solid plugin will then compile it)
 *
 * Features:
 * - Multi-line element detection (startLine:startCol:endLine:endCol)
 * - Parent context metadata (ComponentName|tag>parent>grandparent)
 * - Handles both .jsx/.tsx and .js/.ts files with JSX
 */

import { readFileSync } from 'fs';
import { transformCode } from './sourceTrackingCore.mjs';

/**
 * Create SolidJS source plugin for Vite
 *
 * @param {Object} options - Plugin options
 * @param {boolean} [options.verboseLogging=false] - Enable verbose logging
 * @returns {Object} Vite plugin
 */
export function createSolidSourcePlugin(options = {}) {
	const {
		verboseLogging = false
	} = options;

	// Log plugin creation
	console.log('[Roopik Solid Plugin] ✓ Plugin created');

	return {
		name: 'roopik:solid-source',
		enforce: 'pre', // Run BEFORE vite-plugin-solid

		// Use load hook instead of transform to get original source
		load(id) {
			// Process .jsx, .tsx files (Solid's primary JSX files)
			if (!/\.[jt]sx$/.test(id)) {
				return null;
			}

			// Skip node_modules
			if (id.includes('node_modules')) {
				return null;
			}

			console.log('[Roopik Solid Plugin] Loading:', id);

			try {
				// Read the ORIGINAL source file from disk
				const originalCode = readFileSync(id, 'utf-8');

				// Check if it contains JSX
				if (!containsJSX(originalCode)) {
					console.log('[Roopik Solid Plugin] No JSX found, skipping:', id);
					return null;
				}

				const result = transformSolidFile(originalCode, id, verboseLogging);
				if (result) {
					console.log('[Roopik Solid Plugin] ✓ Transformed:', id);
					return result.code;
				} else {
					console.log('[Roopik Solid Plugin] ⚠ No elements found:', id);
					return null;
				}

			} catch (error) {
				console.error('[Roopik Solid Plugin] Error processing:', id, error);
				return null;
			}
		}
	};
}

/**
 * Check if code contains JSX syntax
 *
 * Simple heuristic checks:
 * - Opening JSX tags: <ComponentName or <tag-name
 * - Self-closing tags: <Component />
 * - JSX expressions: {expression}
 *
 * @param {string} code - Source code
 * @returns {boolean}
 */
function containsJSX(code) {
	// Look for JSX patterns:
	// 1. <Component (capital letter = component)
	// 2. <tag followed by space, >, or /
	// 3. Closing tags </
	// 4. Self-closing />

	// Must have an opening tag AND either closing tag or self-closing
	const hasOpeningTag = /<[A-Za-z][A-Za-z0-9.-]*[\s/>]/.test(code);
	const hasClosingOrSelfClose = /<\/[A-Za-z]|\/>/.test(code);

	return hasOpeningTag && hasClosingOrSelfClose;
}

/**
 * Transform SolidJS file
 *
 * @param {string} code - Source code
 * @param {string} id - File path
 * @param {boolean} verboseLogging - Enable verbose logging
 * @returns {{ code: string, map: null } | null}
 */
function transformSolidFile(code, id, verboseLogging) {
	const result = transformCode(code, {
		filePath: id,
		baseLineOffset: 0,
		skipTags: [], // No skip tags for JSX
		checkScriptStyle: false
	});

	if (result.count > 0) {
		return {
			code: result.code,
			map: null
		};
	}

	return null;
}
