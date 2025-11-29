/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Plugin Manager Module
 *
 * Creates and manages Vite plugins for Roopik features:
 * - Source tracking (data-roopik-source attributes)
 * - Click-to-source script injection
 * - CORS handling for dev server
 *
 * Design:
 * - Factory functions for each plugin type
 * - Framework-specific plugin selection
 * - Composable plugin chains
 */

// ============================================
// Click-to-Source Script
// ============================================

/**
 * The script injected into every page for click-to-source functionality
 * This runs in the browser context
 */
const CLICK_TO_SOURCE_SCRIPT = `
<script data-roopik-inject="click-to-source">
(function() {
	'use strict';

	// State
	let inspectMode = false;
	let highlightOverlay = null;
	let currentElement = null;

	// Create highlight overlay
	function createOverlay() {
		const overlay = document.createElement('div');
		overlay.id = '__roopik_highlight__';
		overlay.style.cssText = [
			'position: fixed',
			'pointer-events: none',
			'z-index: 999999',
			'border: 2px solid #3B82F6',
			'background: rgba(59, 130, 246, 0.1)',
			'transition: all 0.1s ease',
			'display: none'
		].join(';');
		document.body.appendChild(overlay);
		return overlay;
	}

	// Position overlay on element
	function highlightElement(el) {
		if (!highlightOverlay) {
			highlightOverlay = createOverlay();
		}

		const rect = el.getBoundingClientRect();
		highlightOverlay.style.top = rect.top + 'px';
		highlightOverlay.style.left = rect.left + 'px';
		highlightOverlay.style.width = rect.width + 'px';
		highlightOverlay.style.height = rect.height + 'px';
		highlightOverlay.style.display = 'block';
		currentElement = el;
	}

	// Hide overlay
	function hideOverlay() {
		if (highlightOverlay) {
			highlightOverlay.style.display = 'none';
		}
		currentElement = null;
	}

	// Enable inspect mode (called from VSCode)
	window.__roopik_enableInspect = function() {
		inspectMode = true;
		document.body.style.cursor = 'crosshair';
		console.log('[Roopik] Inspect mode enabled. Click an element to copy its HTML. Press ESC to cancel.');
	};

	// Disable inspect mode
	window.__roopik_disableInspect = function() {
		inspectMode = false;
		document.body.style.cursor = '';
		hideOverlay();
		console.log('[Roopik] Inspect mode disabled.');
	};

	// Check if inspect mode is active
	window.__roopik_isInspectActive = function() {
		return inspectMode;
	};

	// Get last inspected element HTML
	window.__roopik_getLastInspectedHtml = function() {
		return currentElement ? currentElement.outerHTML : null;
	};

	// Mouse move handler (highlight on hover)
	document.addEventListener('mousemove', function(e) {
		if (!inspectMode) return;

		const el = document.elementFromPoint(e.clientX, e.clientY);
		if (el && el !== highlightOverlay && el !== document.body && el !== document.documentElement) {
			highlightElement(el);
		}
	}, true);

	// Click handler (copy element)
	document.addEventListener('click', function(e) {
		if (!inspectMode) return;

		e.preventDefault();
		e.stopPropagation();
		e.stopImmediatePropagation();

		const el = currentElement || document.elementFromPoint(e.clientX, e.clientY);
		if (!el) return;

		// Get source info if available
		const sourceAttr = el.getAttribute('data-roopik-source');
		const html = el.outerHTML;

		// Build info object
		const info = {
			html: html,
			tagName: el.tagName.toLowerCase(),
			id: el.id || null,
			className: el.className || null,
			source: sourceAttr ? parseSourceAttr(sourceAttr) : null
		};

		// Copy HTML to clipboard
		navigator.clipboard.writeText(html).then(function() {
			console.log('[Roopik] Element copied:', info);

			// Show visual feedback
			showCopiedFeedback(el);
		}).catch(function(err) {
			console.error('[Roopik] Failed to copy:', err);
		});

		// Exit inspect mode
		window.__roopik_disableInspect();

		return false;
	}, true);

	// ESC key handler (cancel inspect)
	document.addEventListener('keydown', function(e) {
		if (e.key === 'Escape' && inspectMode) {
			window.__roopik_disableInspect();
		}
	}, true);

	// Parse source attribute (file:line:col)
	function parseSourceAttr(attr) {
		if (!attr) return null;
		const parts = attr.split(':');
		if (parts.length >= 2) {
			return {
				file: parts.slice(0, -2).join(':') || parts[0], // Handle Windows paths
				line: parseInt(parts[parts.length - 2], 10) || 1,
				column: parseInt(parts[parts.length - 1], 10) || 1
			};
		}
		return { file: attr, line: 1, column: 1 };
	}

	// Visual feedback when element is copied
	function showCopiedFeedback(el) {
		if (!highlightOverlay) return;

		highlightOverlay.style.background = 'rgba(34, 197, 94, 0.2)';
		highlightOverlay.style.borderColor = '#22C55E';

		setTimeout(function() {
			hideOverlay();
		}, 300);
	}

	// Expose for debugging
	window.__ROOPIK_INSPECT__ = {
		enable: window.__roopik_enableInspect,
		disable: window.__roopik_disableInspect,
		isActive: window.__roopik_isInspectActive
	};

	console.log('[Roopik] Click-to-source ready. Call __roopik_enableInspect() to start.');
})();
</script>
`;

// ============================================
// Plugin Factories
// ============================================

/**
 * Create the main Roopik inject plugin
 * Injects click-to-source script into HTML pages
 */
export function createInjectPlugin() {
	return {
		name: 'roopik:inject',
		enforce: 'post', // Run after other plugins

		transformIndexHtml(html) {
			// Inject before </body>
			if (html.includes('</body>')) {
				return html.replace('</body>', CLICK_TO_SOURCE_SCRIPT + '</body>');
			}
			// Fallback: append to end
			return html + CLICK_TO_SOURCE_SCRIPT;
		}
	};
}

/**
 * Create CORS plugin for development
 * Allows requests from Roopik's webview
 */
export function createCorsPlugin() {
	return {
		name: 'roopik:cors',
		configureServer(server) {
			server.middlewares.use((req, res, next) => {
				// Set CORS headers
				res.setHeader('Access-Control-Allow-Origin', '*');
				res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
				res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Roopik-Token');

				// Handle preflight
				if (req.method === 'OPTIONS') {
					res.statusCode = 204;
					res.end();
					return;
				}

				next();
			});
		}
	};
}

/**
 * Create a no-op plugin (placeholder)
 */
export function createNoopPlugin(name = 'roopik:noop') {
	return { name };
}

// ============================================
// Source Tracking Plugins (Framework-Specific)
// ============================================

/**
 * Create React source tracking plugin
 * Adds data-roopik-source to JSX elements during transformation
 *
 * Note: This is a simplified version. Full implementation would use
 * Babel AST transformation for accuracy. The regex approach works
 * for basic cases but may miss complex patterns.
 */
export function createReactSourcePlugin(options = {}) {
	const { verbose = false } = options;

	return {
		name: 'roopik:react-source',
		enforce: 'pre', // Run before other transforms

		transform(code, id) {
			// Only process JSX/TSX files
			if (!id.match(/\.(jsx|tsx)$/)) {
				return null;
			}

			// Skip node_modules
			if (id.includes('node_modules')) {
				return null;
			}

			// Simple regex approach: add data-roopik-source to opening tags
			// This is imperfect but works for common cases
			let hasChanges = false;

			// Match JSX elements: <Component or <div
			// Add source info to self-closing and opening tags
			const lines = code.split('\n');
			const transformedLines = lines.map((line, lineIndex) => {
				// Match opening tags: <TagName ...> or <TagName ... />
				return line.replace(
					/<([A-Z][a-zA-Z0-9]*|[a-z][a-z0-9-]*)(\s|>|\/>)/g,
					(match, tagName, suffix) => {
						hasChanges = true;
						const lineNum = lineIndex + 1;
						const source = `${id}:${lineNum}:1`;
						return `<${tagName} data-roopik-source="${source}"${suffix}`;
					}
				);
			});

			if (hasChanges) {
				if (verbose) {
					console.log(`[Roopik] Added source tracking to: ${id}`);
				}
				return {
					code: transformedLines.join('\n'),
					map: null // We could generate source map here
				};
			}

			return null;
		}
	};
}

/**
 * Create Vue source tracking plugin
 * Adds data-roopik-source to template elements
 */
export function createVueSourcePlugin(options = {}) {
	const { verbose = false } = options;

	return {
		name: 'roopik:vue-source',
		enforce: 'pre',

		transform(code, id) {
			// Only process Vue SFC files
			if (!id.endsWith('.vue')) {
				return null;
			}

			// Skip node_modules
			if (id.includes('node_modules')) {
				return null;
			}

			// Find <template> section and add source tracking
			const templateMatch = code.match(/<template>([\s\S]*?)<\/template>/);
			if (!templateMatch) {
				return null;
			}

			let template = templateMatch[1];
			let hasChanges = false;

			// Add source to HTML elements in template
			const lines = template.split('\n');
			const transformedLines = lines.map((line, lineIndex) => {
				return line.replace(
					/<([a-z][a-z0-9-]*)(\s|>)/gi,
					(match, tagName, suffix) => {
						// Skip script/style/template tags
						if (['script', 'style', 'template'].includes(tagName.toLowerCase())) {
							return match;
						}
						hasChanges = true;
						const lineNum = lineIndex + 1;
						const source = `${id}:${lineNum}:1`;
						return `<${tagName} data-roopik-source="${source}"${suffix}`;
					}
				);
			});

			if (hasChanges) {
				const newTemplate = transformedLines.join('\n');
				const newCode = code.replace(templateMatch[1], newTemplate);

				if (verbose) {
					console.log(`[Roopik] Added source tracking to: ${id}`);
				}

				return {
					code: newCode,
					map: null
				};
			}

			return null;
		}
	};
}

/**
 * Create HTML source tracking plugin
 * Adds data-roopik-source to HTML elements
 */
export function createHtmlSourcePlugin(options = {}) {
	const { verbose = false } = options;

	return {
		name: 'roopik:html-source',

		transformIndexHtml: {
			order: 'pre',
			handler(html, ctx) {
				const file = ctx.filename || 'index.html';
				let lineNum = 0;

				// Add source to HTML elements
				const transformed = html.replace(
					/<([a-z][a-z0-9-]*)(\s|>)/gi,
					(match, tagName, suffix, offset) => {
						// Count newlines before this match to get line number
						const before = html.substring(0, offset);
						lineNum = (before.match(/\n/g) || []).length + 1;

						// Skip script/style/html/head/body/meta/link tags
						const skipTags = ['script', 'style', 'html', 'head', 'body', 'meta', 'link', 'title', 'base'];
						if (skipTags.includes(tagName.toLowerCase())) {
							return match;
						}

						const source = `${file}:${lineNum}:1`;
						return `<${tagName} data-roopik-source="${source}"${suffix}`;
					}
				);

				if (verbose && transformed !== html) {
					console.log(`[Roopik] Added source tracking to: ${file}`);
				}

				return transformed;
			}
		}
	};
}

// ============================================
// Plugin Selection
// ============================================

/**
 * Get plugins for a specific framework
 * @param {string} frameworkId - Framework identifier
 * @param {Object} options - Plugin options
 * @returns {Array} Array of Vite plugins
 */
export function getPluginsForFramework(frameworkId, options = {}) {
	const plugins = [];

	// Always add inject plugin (click-to-source script)
	plugins.push(createInjectPlugin());

	// Always add CORS plugin
	plugins.push(createCorsPlugin());

	// Add framework-specific source tracking
	switch (frameworkId) {
		case 'react-vite':
			plugins.push(createReactSourcePlugin(options));
			break;

		case 'vue-vite':
			plugins.push(createVueSourcePlugin(options));
			break;

		case 'solid-vite':
			// SolidJS uses similar JSX syntax to React
			plugins.push(createReactSourcePlugin(options));
			break;

		case 'plain-html-vite':
			plugins.push(createHtmlSourcePlugin(options));
			break;

		case 'svelte-vite':
			// Svelte has its own compilation, source tracking needs different approach
			plugins.push(createNoopPlugin('roopik:svelte-source-todo'));
			break;

		default:
			plugins.push(createNoopPlugin('roopik:unknown-framework'));
	}

	return plugins;
}

/**
 * Check if framework supports source tracking
 */
export function supportsSourceTracking(frameworkId) {
	const supported = ['react-vite', 'vue-vite', 'solid-vite', 'plain-html-vite'];
	return supported.includes(frameworkId);
}
