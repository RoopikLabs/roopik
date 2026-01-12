/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Svelte Source Tracking Plugin
 *
 * Adds data-roopik-source attributes to Svelte components.
 *
 * IMPORTANT: Svelte compiles .svelte files at build time.
 * By the time a normal Vite transform runs, the template is already compiled.
 * To inject our attributes, we must read the ORIGINAL source file
 * before any transformation happens.
 *
 * Strategy:
 * - Read the original .svelte file from disk (using load hook)
 * - Extract HTML template sections from .svelte files
 * - Apply regex-based transformation using shared sourceTrackingCore
 * - Preserve <script> and <style> sections untouched
 *
 * Svelte file structure:
 * - <script> (optional) - JavaScript/TypeScript logic
 * - <style> (optional) - Component styles
 * - HTML template (the rest) - Markup with Svelte syntax
 *
 * Features:
 * - Multi-line element detection (startLine:startCol:endLine:endCol)
 * - Parent context metadata (ComponentName|tag>parent>grandparent)
 * - Handles Svelte-specific syntax ({#if}, {#each}, etc.)
 * - Preserves script and style blocks
 */

import { readFileSync } from 'fs';
import { basename } from 'path';
import { transformCode } from './sourceTrackingCore.mjs';

/**
 * Create Svelte source plugin for Vite
 *
 * @param {Object} options - Plugin options
 * @param {boolean} [options.verboseLogging=false] - Enable verbose logging
 * @returns {Object} Vite plugin
 */
export function createSvelteSourcePlugin(options = {}) {
	const {
		verboseLogging = false
	} = options;

	// Log plugin creation
	console.log('[Roopik Svelte Plugin] ✓ Plugin created');

	return {
		name: 'roopik:svelte-source',
		enforce: 'pre', // Run BEFORE @sveltejs/vite-plugin-svelte

		// Use load hook instead of transform to get original source
		load(id) {
			// Only process .svelte files
			if (!id.endsWith('.svelte')) {
				return null;
			}

			// Skip node_modules
			if (id.includes('node_modules')) {
				return null;
			}

			console.log('[Roopik Svelte Plugin] Loading:', id);

			try {
				// Read the ORIGINAL source file from disk
				const originalCode = readFileSync(id, 'utf-8');

				const result = transformSvelteFile(originalCode, id, verboseLogging);
				if (result) {
					console.log('[Roopik Svelte Plugin] ✓ Transformed:', id);
					return result.code;
				} else {
					console.log('[Roopik Svelte Plugin] ⚠ No elements found:', id);
					return null;
				}

			} catch (error) {
				console.error('[Roopik Svelte Plugin] Error processing:', id, error);
				return null;
			}
		}
	};
}

/**
 * Transform Svelte file
 *
 * Svelte files have a unique structure:
 * - <script> block (optional, can have context="module")
 * - <style> block (optional)
 * - HTML template (everything else)
 *
 * We need to:
 * 1. Identify and preserve <script> and <style> blocks
 * 2. Extract the HTML template portion
 * 3. Transform only the HTML template
 * 4. Reconstruct the file
 *
 * IMPORTANT: When replacing blocks with placeholders, we MUST preserve
 * the same number of lines to keep line number calculations correct!
 *
 * @param {string} code - Source code
 * @param {string} id - File path
 * @param {boolean} verboseLogging - Enable verbose logging
 * @returns {{ code: string, map: null } | null}
 */
function transformSvelteFile(code, id, verboseLogging) {
	// Extract component name from .svelte filename
	const componentName = basename(id, '.svelte');

	// Find all script and style blocks to preserve them
	const scriptBlocks = extractBlocks(code, 'script');
	const styleBlocks = extractBlocks(code, 'style');

	// Create a working copy of the code
	let workingCode = code;

	// Replace script and style blocks with LINE-PRESERVING placeholders
	// CRITICAL: We must preserve the same number of lines to keep line numbers correct!
	const placeholders = [];
	let placeholderIndex = 0;

	// Replace script blocks with line-preserving placeholders
	for (const block of scriptBlocks) {
		const placeholder = createLinePreservingPlaceholder(block.full, placeholderIndex);
		workingCode = workingCode.replace(block.full, placeholder);
		placeholders.push({ placeholder, content: block.full });
		placeholderIndex++;
	}

	// Replace style blocks with line-preserving placeholders
	for (const block of styleBlocks) {
		const placeholder = createLinePreservingPlaceholder(block.full, placeholderIndex);
		workingCode = workingCode.replace(block.full, placeholder);
		placeholders.push({ placeholder, content: block.full });
		placeholderIndex++;
	}

	// Now workingCode contains only the HTML template (with line-preserving placeholders)
	// Line numbers are preserved because placeholders have same line count as original blocks

	const result = transformCode(workingCode, {
		filePath: id,
		baseLineOffset: 0,
		skipTags: [], // Svelte handles its own special tags
		checkScriptStyle: false, // We already extracted them
		componentName
	});

	if (result.count > 0) {
		// Restore placeholders
		let finalCode = result.code;
		for (const { placeholder, content } of placeholders) {
			finalCode = finalCode.replace(placeholder, content);
		}

		console.log(`[Roopik Svelte Plugin] ✓ Added source tracking to ${result.count} elements in:`, id);

		return {
			code: finalCode,
			map: null
		};
	}

	return null;
}

/**
 * Create a placeholder that preserves the same number of lines as the original content
 *
 * This is CRITICAL for correct line number calculation. If we replace a 10-line
 * <script> block with a single-line placeholder, all subsequent line numbers
 * would be off by 9!
 *
 * @param {string} content - Original block content
 * @param {number} index - Placeholder index
 * @returns {string} Placeholder with same line count
 */
function createLinePreservingPlaceholder(content, index) {
	// Count newlines in original content
	const lineCount = (content.match(/\n/g) || []).length;

	// Create placeholder that spans same number of lines
	// First line: marker, remaining lines: empty (just newlines)
	const marker = `__ROOPIK_PLACEHOLDER_${index}__`;

	if (lineCount === 0) {
		return marker;
	}

	// Create placeholder: marker + (lineCount) newlines
	return marker + '\n'.repeat(lineCount);
}

/**
 * Extract script or style blocks from Svelte code
 *
 * @param {string} code - Svelte source code
 * @param {string} tagName - 'script' or 'style'
 * @returns {Array<{full: string, content: string, start: number, end: number}>}
 */
function extractBlocks(code, tagName) {
	const blocks = [];

	// Match <script> or <script context="module"> or <script lang="ts"> etc.
	// Match <style> or <style lang="scss"> etc.
	const regex = new RegExp(`<${tagName}[^>]*>[\\s\\S]*?<\\/${tagName}>`, 'gi');

	let match;
	while ((match = regex.exec(code)) !== null) {
		blocks.push({
			full: match[0],
			start: match.index,
			end: match.index + match[0].length
		});
	}

	return blocks;
}
