/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Vue Source Tracking Plugin
 *
 * Adds data-roopik-source attributes to Vue Single File Components (SFC).
 *
 * Strategy:
 * 1. PRIMARY: @vue/compiler-sfc to parse SFC and extract <template>
 * 2. FALLBACK: Regex to extract <template> section
 * 3. SHARED: Use sourceTrackingCore for element transformation
 *
 * Features:
 * - Multi-line element detection (startLine:startCol:endLine:endCol)
 * - Parent context metadata (ComponentName|tag>parent>grandparent)
 * - Proper line offset calculation (template section offset)
 * - Vue SFC structure preservation
 */

import { basename } from 'path';
import { transformCode } from './sourceTrackingCore.mjs';

/**
 * Create Vue source plugin for Vite
 *
 * @param {Object} options - Plugin options
 * @param {string} [options.compilerPath] - Path to @vue/compiler-sfc (optional, for AST parsing)
 * @param {boolean} [options.forceRegexMode=false] - Force regex mode (skip AST)
 * @param {boolean} [options.verboseLogging=false] - Enable verbose logging
 * @returns {Object} Vite plugin
 */
export function createVueSourcePlugin(options = {}) {
	const {
		compilerPath,
		forceRegexMode = false,
		verboseLogging = false
	} = options;

	return {
		name: 'roopik:vue-source',
		enforce: 'pre', // Run BEFORE @vitejs/plugin-vue

		transform(code, id) {
			// Only process .vue files
			if (!id.endsWith('.vue')) {
				return null;
			}

			// Skip node_modules
			if (id.includes('node_modules')) {
				return null;
			}

			try {
				if (verboseLogging) {
					console.log('[Roopik Vue Plugin] Processing:', id);
				}

				// Check if regex mode is forced
				if (forceRegexMode) {
					if (verboseLogging) {
						console.log('[Roopik Vue Plugin] Using forced regex mode');
					}
					return transformWithRegex(code, id, verboseLogging);
				}

				// Try AST parsing first (if compilerPath provided)
				if (compilerPath) {
					try {
						const result = transformWithAST(code, id, compilerPath, verboseLogging);
						if (result) {
							if (verboseLogging) {
								console.log('[Roopik Vue Plugin] ✓ AST transformation successful:', id);
							}
							return result;
						}
					} catch (astError) {
						if (verboseLogging) {
							console.warn('[Roopik Vue Plugin] AST failed, falling back to regex:', astError.message);
						}
					}
				}

				// Fallback to regex
				return transformWithRegex(code, id, verboseLogging);

			} catch (error) {
				console.error('[Roopik Vue Plugin] Error processing:', id, error);
				return null;
			}
		}
	};
}

/**
 * Transform Vue SFC using @vue/compiler-sfc (PRIMARY METHOD)
 *
 * Uses the Vue compiler to properly parse the SFC structure,
 * then applies regex-based transformation to the template section.
 *
 * @param {string} code - Source code
 * @param {string} id - File path
 * @param {string} compilerPath - Path to @vue/compiler-sfc
 * @param {boolean} verboseLogging - Enable verbose logging
 * @returns {{ code: string, map: null } | null}
 */
function transformWithAST(code, id, compilerPath, verboseLogging) {
	// Dynamic import of @vue/compiler-sfc
	const { parse } = require(compilerPath);

	// Parse .vue file into SFC descriptor
	const { descriptor, errors } = parse(code, { filename: id });

	if (errors && errors.length > 0) {
		if (verboseLogging) {
			console.warn('[Roopik Vue Plugin] Parse errors:', errors);
		}
		return null;
	}

	if (!descriptor.template || !descriptor.template.content) {
		if (verboseLogging) {
			console.log('[Roopik Vue Plugin] No template section found');
		}
		return null;
	}

	// Get template content and its location
	const templateContent = descriptor.template.content;
	const templateLoc = descriptor.template.loc;
	const templateStartLine = templateLoc.start.line; // 1-based line number

	// Extract component name from .vue filename
	const componentName = basename(id, '.vue');

	// Transform template using shared core
	const result = transformCode(templateContent, {
		filePath: id,
		baseLineOffset: templateStartLine - 1, // Convert to 0-based for calculation
		skipTags: [],
		checkScriptStyle: false,
		componentName
	});

	if (result.count > 0) {
		// Replace template in original code
		const transformedCode = code.replace(
			descriptor.template.content,
			result.code
		);

		if (verboseLogging) {
			console.log(`[Roopik Vue Plugin] ✓ AST: Added source tracking to ${result.count} elements`);
		}

		return {
			code: transformedCode,
			map: null
		};
	}

	return null;
}

/**
 * Transform Vue SFC using regex (FALLBACK METHOD)
 *
 * Extracts <template> section using regex, then applies transformation.
 *
 * @param {string} code - Source code
 * @param {string} id - File path
 * @param {boolean} verboseLogging - Enable verbose logging
 * @returns {{ code: string, map: null } | null}
 */
function transformWithRegex(code, id, verboseLogging) {
	// Extract <template> section
	const templateMatch = code.match(/<template>([\s\S]*?)<\/template>/);

	if (!templateMatch) {
		if (verboseLogging) {
			console.log('[Roopik Vue Plugin] No <template> section found in:', id);
		}
		return null;
	}

	const templateContent = templateMatch[1];

	// Count lines before template to get correct line offset
	const beforeTemplate = code.substring(0, templateMatch.index);
	const linesBeforeTemplate = beforeTemplate.split('\n').length;

	// Extract component name from .vue filename
	const componentName = basename(id, '.vue');

	// Transform template using shared core
	const result = transformCode(templateContent, {
		filePath: id,
		baseLineOffset: linesBeforeTemplate, // Lines before <template> tag
		skipTags: [],
		checkScriptStyle: false,
		componentName
	});

	if (result.count > 0) {
		// Replace template in original code
		const transformedCode = code.replace(
			/<template>([\s\S]*?)<\/template>/,
			`<template>${result.code}</template>`
		);

		if (verboseLogging) {
			console.log(`[Roopik Vue Plugin] ✓ Regex: Added source tracking to ${result.count} elements in:`, id);
		}

		return {
			code: transformedCode,
			map: null
		};
	}

	return null;
}
