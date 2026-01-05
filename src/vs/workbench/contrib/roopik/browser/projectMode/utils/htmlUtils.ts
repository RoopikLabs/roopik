/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * HTML Utility Functions
 *
 * Shared utilities for HTML manipulation across browser preview features.
 * These functions are used by both context menu and inspect mode to ensure consistency.
 */

/**
 * Extract metadata from element BEFORE stripping
 *
 * Gets source tracking metadata from data-roopik-* attributes.
 * Call this BEFORE stripRoopikMetadata() to preserve the information.
 *
 * @param element - DOM element to extract metadata from
 * @returns Metadata object with optional fields
 *
 * @example
 * const metadata = extractRoopikMetadata(element);
 * // { source: "file.jsx:1:2:3:4", component: "Link" }
 */
export function extractRoopikMetadata(element: Element): { source: string | null; component: string | null } {
	return {
		source: element.getAttribute('data-roopik-source'),
		component: element.getAttribute('data-roopik-component')
	};
}

/**
 * Strip all data-roopik-* attributes from HTML string
 *
 * Removes ALL metadata attributes injected during build:
 * - data-roopik-source (file:line:col)
 * - data-roopik-component (tag name)
 * - data-roopik-parent (parent chain) [deprecated]
 * - Any future data-roopik-* attributes
 *
 * IMPORTANT: Extract metadata FIRST using extractRoopikMetadata() if you need it!
 *
 * IMPORTANT: This is the SINGLE SOURCE OF TRUTH for stripping metadata.
 * Used by:
 * - Context menu "Attach Element to Context"
 * - Inspect mode "Attach" button
 * - Inspect mode inline chat
 *
 * @param html - Raw HTML string with metadata attributes
 * @returns Cleaned HTML string without data-roopik-* attributes
 *
 * @example
 * // Input:
 * <a data-roopik-source="file.jsx:1:2:3:4" data-roopik-component="Link" class="btn">Text</a>
 *
 * // Output:
 * <a class="btn">Text</a>
 */
export function stripRoopikMetadata(html: string): string {
	// Pattern explanation:
	// \s+             - one or more whitespace (space before attribute)
	// data-roopik-    - literal prefix
	// [a-z-]+         - attribute name (lowercase letters and hyphens)
	// \s*=\s*         - equals sign with optional spaces
	// "[^"]*"         - double-quoted value (anything except quotes)
	// IMPORTANT: Must have space BEFORE attribute to avoid matching inside attribute values
	return html
		.replace(/\s+data-roopik-[a-z-]+\s*=\s*"[^"]*"/gi, '')
		.replace(/\s+/g, ' ') // Normalize multiple spaces to single space
		.trim();
}

/**
 * Get unique CSS selector path for an element (from root to element)
 *
 * Generates a full CSS selector path that uniquely identifies an element:
 * - Uses IDs when available (stops traversal at ID)
 * - Includes class names for specificity
 * - Adds :nth-of-type() for disambiguation between siblings
 * - Traverses up to root (or until ID is found)
 *
 * IMPORTANT: This is the SINGLE SOURCE OF TRUTH for selector generation.
 * Used by:
 * - Context menu "Attach Element to Context"
 * - Inspect mode element selection
 * - Inspect mode drag & drop
 *
 * @param el - DOM element to generate selector for
 * @returns CSS selector string (e.g., "#root > div.app > main.content > a.btn:nth-of-type(1)")
 *
 * @example
 * const button = document.querySelector('.my-button');
 * const selector = getElementSelector(button);
 * // Result: "#root > div.container > button.my-button:nth-of-type(2)"
 */
export function getElementSelector(el: Element | null): string | null {
	if (!el || el === document.body || el === document.documentElement) {
		return null;
	}

	const parts: string[] = [];
	let current: Element | null = el;

	while (current && current !== document.body && current !== document.documentElement) {
		let selector = current.tagName.toLowerCase();

		// If element has ID, use it and stop (IDs are unique)
		if (current.id) {
			parts.unshift('#' + CSS.escape(current.id));
			break;
		}

		// Add class names for specificity
		if (current.className && typeof current.className === 'string') {
			const classes = current.className.trim().split(/\s+/).filter(c => c);
			if (classes.length > 0) {
				selector += '.' + classes.map(c => CSS.escape(c)).join('.');
			}
		}

		// Add nth-of-type if there are multiple siblings with same tag
		const parent: Element | null = current.parentElement;
		if (parent) {
			const siblings = Array.from(parent.children).filter((s): s is Element => s.tagName === current!.tagName);
			if (siblings.length > 1) {
				const index = siblings.indexOf(current) + 1;
				selector += ':nth-of-type(' + index + ')';
			}
		}

		parts.unshift(selector);
		current = parent;
	}

	return parts.join(' > ');
}

/**
 * Generate JavaScript code for extracting and stripping metadata (for injection)
 *
 * Returns function definitions for both extracting metadata and stripping it from HTML.
 * Used in injected scripts that need to preserve source information.
 *
 * CRITICAL: When copying to template literals (like INSPECT_MODE_SCRIPT),
 * backslashes must be DOUBLE-ESCAPED: /\s+/ becomes /\\s+/
 * Otherwise \s becomes just 's' and matches the letter 's' instead of whitespace!
 *
 * @returns JavaScript function definitions as string
 */
export function getMetadataUtilsScriptSource(): string {
	// NOTE: Backslashes are double-escaped here because this returns a string
	return `
		function extractRoopikMetadata(element) {
			return {
				source: element.getAttribute('data-roopik-source'),
				component: element.getAttribute('data-roopik-component')
			};
		}

		function stripRoopikMetadata(html) {
			return html
				.replace(/\\s+data-roopik-[a-z-]+\\s*=\\s*"[^"]*"/gi, '')
				.replace(/\\s+/g, ' ')
				.trim();
		}
	`;
}

/**
 * Generate JavaScript code for selector generation (for injection into page context)
 *
 * Returns a string containing the getElementSelector function definition
 * that can be injected into page scripts or executed via executeJavaScript.
 *
 * IMPORTANT: This ensures injected scripts use the SAME selector logic.
 *
 * CRITICAL: When copying to template literals (like INSPECT_MODE_SCRIPT),
 * backslashes must be DOUBLE-ESCAPED: /\s+/ becomes /\\s+/
 * Otherwise \s becomes just 's' and matches the letter 's' instead of whitespace!
 *
 * @returns JavaScript function definition as string
 */
export function getElementSelectorScriptSource(): string {
	// NOTE: Backslashes are double-escaped here because this returns a string
	return `
		function getElementSelector(el) {
			if (!el || el === document.body || el === document.documentElement) return null;
			var parts = [];
			var current = el;
			while (current && current !== document.body && current !== document.documentElement) {
				var selector = current.tagName.toLowerCase();
				if (current.id) {
					parts.unshift('#' + CSS.escape(current.id));
					break;
				}
				if (current.className && typeof current.className === 'string') {
					var classes = current.className.trim().split(/\\s+/).filter(function(c) { return c; });
					if (classes.length > 0) {
						selector += '.' + classes.map(function(c) { return CSS.escape(c); }).join('.');
					}
				}
				var parent = current.parentElement;
				if (parent) {
					var siblings = Array.from(parent.children).filter(function(s) { return s.tagName === current.tagName; });
					if (siblings.length > 1) {
						var index = siblings.indexOf(current) + 1;
						selector += ':nth-of-type(' + index + ')';
					}
				}
				parts.unshift(selector);
				current = parent;
			}
			return parts.join(' > ');
		}
	`;
}
