/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Plain HTML Source Plugin
 * Adds source tracking to plain HTML files using regex-based transformation
 *
 * Features (matching React/Vue plugins):
 * - Multi-line element detection (start + end positions)
 * - Parent context metadata (component name + tag chain)
 * - Component name from source
 * - Reversed chain order (root → child)
 */

const path = require('path');

// Configuration: Parent Context Metadata
const MAX_PARENT_DEPTH = 3; // Maximum number of parent elements to track
const ENABLE_PARENT_METADATA = true; // Toggle to enable/disable parent metadata collection

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

					// Extract component name from filename (e.g., "index.html" → "index")
					const componentName = path.basename(id, path.extname(id));

					// Parse HTML to build element tree with positions
					const elements = parseHtmlElements(html, relPath, componentName);

					// Apply replacements in reverse order to maintain positions
					let modifiedCode = html;
					for (let i = elements.length - 1; i >= 0; i--) {
						const elem = elements[i];
						modifiedCode = modifiedCode.substring(0, elem.start) + elem.replacement + modifiedCode.substring(elem.end);
					}

					if (elements.length > 0 && verboseLogging) {
						console.log(`[Roopik HTML Plugin] ✓ Added source tracking to ${elements.length} elements in:`, id);
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
 * Parse HTML to find all elements with their positions and parent chains
 * Returns array of replacement operations
 */
function parseHtmlElements(html, relPath, componentName) {
	const replacements = [];
	const elementStack = []; // Stack to track parent elements

	// Match opening tags: <TagName (followed by space, /, or >)
	const tagRegex = /<([a-zA-Z][a-zA-Z0-9-]*)([\s\/>])/g;
	const closingTagRegex = /<\/([a-zA-Z][a-zA-Z0-9-]*)>/g;

	let match;
	const allMatches = [];

	// Collect all opening and closing tags with positions
	while ((match = tagRegex.exec(html)) !== null) {
		allMatches.push({
			type: 'opening',
			tagName: match[1],
			trailing: match[2],
			start: match.index,
			end: match.index + match[0].length,
			fullMatch: match[0]
		});
	}

	// Reset regex
	closingTagRegex.lastIndex = 0;

	while ((match = closingTagRegex.exec(html)) !== null) {
		allMatches.push({
			type: 'closing',
			tagName: match[1],
			start: match.index,
			end: match.index + match[0].length
		});
	}

	// Sort by position
	allMatches.sort((a, b) => a.start - b.start);

	// Skip meta tags, links, scripts, and other non-visual elements
	const skipTags = ['html', 'head', 'meta', 'title', 'link', 'script', 'style', 'base'];

	// Process matches to build element tree
	for (const item of allMatches) {
		if (item.type === 'opening') {
			const matchStart = item.start;
			const matchEnd = item.end;
			const tagName = item.tagName;
			const trailing = item.trailing;

			// Skip non-visual tags
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

			// Calculate start position
			const beforeMatch = html.substring(0, matchStart);
			const startLine = beforeMatch.split('\n').length;
			const lastNewline = beforeMatch.lastIndexOf('\n');
			const startColumn = matchStart - lastNewline - 1;

			// Check if this is a self-closing tag (ends with />)
			const isSelfClosing = trailing === '/';

			// Find matching closing tag to get end position
			let endLine = startLine;
			let endColumn = startColumn;

			if (!isSelfClosing) {
				// Find the matching closing tag
				const closingTag = findMatchingClosingTag(html, matchStart, tagName, allMatches);
				if (closingTag) {
					const beforeClosing = html.substring(0, closingTag.end);
					endLine = beforeClosing.split('\n').length;
					const closingLastNewline = beforeClosing.lastIndexOf('\n');
					endColumn = closingTag.end - closingLastNewline - 1;
				}
			} else {
				// Self-closing: end is same as opening tag end
				const beforeEnd = html.substring(0, matchEnd);
				endLine = beforeEnd.split('\n').length;
				const endLastNewline = beforeEnd.lastIndexOf('\n');
				endColumn = matchEnd - endLastNewline - 1;
			}

			// Build parent chain (root → child order, reversed)
			let parentChain = '';
			if (ENABLE_PARENT_METADATA) {
				const parents = elementStack.slice(-MAX_PARENT_DEPTH).map(p => p.tagName);
				parents.push(tagName); // Append clicked element
				parentChain = parents.join('>');
			}

			// Create attributes
			const sourceAttr = ` data-roopik-source="${relPath}:${startLine}:${startColumn}:${endLine}:${endColumn}"`;
			const componentAttr = ` data-roopik-component="${tagName}"`;
			const parentAttr = ENABLE_PARENT_METADATA ? ` data-roopik-parent="${componentName}|${parentChain}"` : '';

			const replacement = `<${tagName}${sourceAttr}${componentAttr}${parentAttr}${trailing}`;

			replacements.push({
				start: matchStart,
				end: matchEnd,
				original: item.fullMatch,
				replacement: replacement
			});

			// Push to stack if not self-closing
			if (!isSelfClosing) {
				elementStack.push({ tagName, startPos: matchStart });
			}
		} else if (item.type === 'closing') {
			// Pop from stack when closing tag found
			if (elementStack.length > 0 && elementStack[elementStack.length - 1].tagName === item.tagName) {
				elementStack.pop();
			}
		}
	}

	return replacements;
}

/**
 * Find matching closing tag for an opening tag
 */
function findMatchingClosingTag(html, openingPos, tagName, allMatches) {
	let depth = 1;
	let foundOpening = false;

	for (const match of allMatches) {
		if (match.start < openingPos) continue;
		if (match.start === openingPos && match.type === 'opening') {
			foundOpening = true;
			continue;
		}
		if (!foundOpening) continue;

		if (match.tagName === tagName) {
			if (match.type === 'opening') {
				depth++;
			} else if (match.type === 'closing') {
				depth--;
				if (depth === 0) {
					return match;
				}
			}
		}
	}

	return null;
}

/**
 * Plain HTML projects now support:
 * - ✅ Authentication (User-Agent + handshake)
 * - ✅ HTML injection (postMessage, navigation tracking)
 * - ✅ Click-to-source (regex-based HTML transformation)
 * - ✅ Multi-line element detection (full element span)
 * - ✅ Parent context metadata (component name + tag chain)
 * - ✅ Component name tracking
 *
 * How it works:
 * 1. Vite serves HTML files through the plugin transform pipeline
 * 2. We use regex to find all HTML opening and closing tags
 * 3. Skip meta/script/style tags (non-visual elements)
 * 4. Skip content inside <script> and <style> tags
 * 5. Find matching closing tags for multi-line element span
 * 6. Build parent context chain (root → child)
 * 7. Add data-roopik-source, data-roopik-component, data-roopik-parent attributes
 * 8. Calculate line numbers from original file position
 */

module.exports = { createPlainHtmlSourcePlugin };
