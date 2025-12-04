/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Plain HTML Source Tracking Plugin
 *
 * Adds data-roopik-source attributes to HTML elements.
 *
 * Strategy:
 * - Regex-based transformation using shared sourceTrackingCore
 * - Skip non-visual elements (html, head, meta, script, style, etc.)
 * - Skip content inside <script> and <style> tags
 *
 * Features:
 * - Multi-line element detection (startLine:startCol:endLine:endCol)
 * - Parent context metadata (ComponentName|tag>parent>grandparent)
 * - Safe handling of embedded scripts and styles
 */

import { transformCode } from './sourceTrackingCore.mjs';

/**
 * Tags to skip for HTML files (non-visual elements)
 */
const HTML_SKIP_TAGS = [
	'html',
	'head',
	'meta',
	'title',
	'link',
	'script',
	'style',
	'base',
	'noscript'
];

/**
 * Create plain HTML source plugin for Vite
 *
 * @param {Object} options - Plugin options
 * @param {boolean} [options.verboseLogging=false] - Enable verbose logging
 * @param {string[]} [options.additionalSkipTags=[]] - Additional tags to skip
 * @returns {Object} Vite plugin
 */
export function createHtmlSourcePlugin(options = {}) {
	const {
		verboseLogging = false,
		additionalSkipTags = []
	} = options;

	// Merge skip tags
	const skipTags = [...HTML_SKIP_TAGS, ...additionalSkipTags];

	return {
		name: 'roopik:html-source',
		enforce: 'pre',

		// Use transformIndexHtml for HTML files (Vite-specific hook)
		transformIndexHtml: {
			order: 'pre',
			handler(html, ctx) {
				try {
					const id = ctx.filename || ctx.path || 'index.html';

					if (verboseLogging) {
						console.log('[Roopik HTML Plugin] Processing:', id);
					}

					// Transform HTML using shared core
					const result = transformCode(html, {
						filePath: id,
						baseLineOffset: 0,
						skipTags: skipTags,
						checkScriptStyle: true // Important: skip content inside <script>/<style>
					});

					if (result.count > 0) {
						if (verboseLogging) {
							console.log(`[Roopik HTML Plugin] ✓ Added source tracking to ${result.count} elements in:`, id);
						}
						return result.code;
					}

					return html;

				} catch (error) {
					console.error('[Roopik HTML Plugin] Error processing:', error);
					return html;
				}
			}
		}
	};
}
