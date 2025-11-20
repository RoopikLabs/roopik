/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Plain HTML Source Plugin
 * Adds source tracking to plain HTML files using regex-based transformation
 */

/**
 * Check if a position in HTML is inside a string literal (script/style tags)
 * @param {string} html - The HTML code
 * @param {number} position - Character position to check
 * @returns {boolean} - True if inside script/style tag or HTML attribute value
 */
function isInsideStringOrScript(html, position) {
	// Track context by scanning character by character
	let inScript = false;
	let inStyle = false;
	let inSingleQuote = false;
	let inDoubleQuote = false;
	let prevChar = '';

	for (let i = 0; i < position; i++) {
		const char = html[i];
		const remaining = html.substring(i, Math.min(i + 20, html.length));

		// Skip escaped characters
		if (prevChar === '\\') {
			prevChar = char;
			continue;
		}

		// Check for script/style tag boundaries
		if (remaining.startsWith('<script')) {
			inScript = true;
		} else if (remaining.startsWith('</script>')) {
			inScript = false;
		} else if (remaining.startsWith('<style')) {
			inStyle = true;
		} else if (remaining.startsWith('</style>')) {
			inStyle = false;
		}

		// Track quote context (for attribute values)
		if (!inScript && !inStyle) {
			if (char === "'" && !inDoubleQuote) {
				inSingleQuote = !inSingleQuote;
			} else if (char === '"' && !inSingleQuote) {
				inDoubleQuote = !inDoubleQuote;
			}
		}

		prevChar = char;
	}

	return inScript || inStyle || inSingleQuote || inDoubleQuote;
}

/**
 * Create plain HTML source plugin
 * Adds data-roopik-source attributes to HTML elements
 * @param {Object} pluginConfig - Plugin configuration {verboseLogging}
 * @returns {Object} Vite plugin
 */
function createPlainHtmlSourcePlugin(pluginConfig = {}) {
	const { verboseLogging = true } = pluginConfig;

	return {
		name: 'roopik-plain-html-source',
		enforce: 'pre',

		// Use transformIndexHtml for HTML files (Vite-specific hook)
		transformIndexHtml: {
			order: 'pre',
			handler(html, ctx) {
				try {
					const id = ctx.filename || ctx.path || 'index.html';

					if (verboseLogging) {
						console.log('[Roopik HTML Plugin] Processing HTML file:', id);
					}

					const relPath = id.replace(/\\/g, '/');

					// Process HTML with global regex to handle all tags
					const tagRegex = /<([a-zA-Z][a-zA-Z0-9-]*)([\s\/>])/g;

					let modifiedCode = html;
					let match;
					const replacements = [];

					// Find all tag matches with their positions
					while ((match = tagRegex.exec(html)) !== null) {
						const tagName = match[1];
						const trailing = match[2];
						const matchStart = match.index;
						const matchEnd = matchStart + match[0].length;

						// Skip meta tags, links, scripts, and other non-visual elements
						const skipTags = ['html', 'head', 'meta', 'title', 'link', 'script', 'style', 'base'];
						if (skipTags.includes(tagName.toLowerCase())) {
							continue;
						}

						// Skip if already has data-roopik-source
						const surroundingCode = html.substring(matchStart, Math.min(matchEnd + 100, html.length));
						if (surroundingCode.includes('data-roopik-source')) {
							continue;
						}

						// SECURITY: Skip if inside script/style tag or attribute value
						if (isInsideStringOrScript(html, matchStart)) {
							continue;
						}

						// Calculate line and column number
						const beforeMatch = html.substring(0, matchStart);
						const lineNumber = beforeMatch.split('\n').length;
						const lastNewline = beforeMatch.lastIndexOf('\n');
						const columnNumber = matchStart - lastNewline - 1;

						// Create replacement
						const sourceAttr = ` data-roopik-source="${relPath}:${lineNumber}:${columnNumber}"`;
						const replacement = `<${tagName}${sourceAttr}${trailing}`;

						replacements.push({
							start: matchStart,
							end: matchEnd,
							original: match[0],
							replacement: replacement
						});
					}

					// Apply replacements in reverse order to maintain positions
					for (let i = replacements.length - 1; i >= 0; i--) {
						const r = replacements[i];
						modifiedCode = modifiedCode.substring(0, r.start) + r.replacement + modifiedCode.substring(r.end);
					}

					if (replacements.length > 0 && verboseLogging) {
						console.log(`[Roopik HTML Plugin] ✓ Added source tracking to ${replacements.length} elements in:`, id);
					}

					return modifiedCode;
				} catch (error) {
					console.error('[Roopik HTML Plugin] Error processing:', error);
					return html;
				}
			}
		}
	};
}

/**
 * Plain HTML projects now support:
 * - ✅ Authentication (User-Agent + handshake)
 * - ✅ HTML injection (postMessage, navigation tracking)
 * - ✅ Click-to-source (regex-based HTML transformation)
 *
 * How it works:
 * 1. Vite serves HTML files through the plugin transform pipeline
 * 2. We use regex to find all HTML opening tags
 * 3. Skip meta/script/style tags (non-visual elements)
 * 4. Skip content inside <script> and <style> tags
 * 5. Add data-roopik-source to body, div, p, h1, etc.
 * 6. Calculate line numbers from original file position
 */

module.exports = { createPlainHtmlSourcePlugin };
