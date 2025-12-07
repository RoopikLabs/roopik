/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Plugin Manager Module
 *
 * Creates and manages Vite plugins for Roopik features:
 * - Source tracking (data-roopik-source attributes) with multi-line support
 * - Click-to-source script injection
 * - CORS handling for dev server
 *
 * Architecture:
 * - sourceTrackingCore.mjs: Shared regex logic for all frameworks
 * - reactSourcePlugin.mjs: React/JSX with Babel AST + regex fallback
 * - vueSourcePlugin.mjs: Vue SFC with template extraction + shared core
 * - htmlSourcePlugin.mjs: Plain HTML with skip tags + shared core
 *
 * Features:
 * - Multi-line element detection (startLine:startCol:endLine:endCol)
 * - Parent context metadata (ComponentName|tag>parent>grandparent)
 * - Component name tracking (data-roopik-component)
 * - String literal safety (skip tags inside strings/template literals)
 * - AST-based transformation with regex fallback
 */

// Import modular source tracking plugins
import { createReactSourcePlugin } from './reactSourcePlugin.mjs';
import { createVueSourcePlugin } from './vueSourcePlugin.mjs';
import { createHtmlSourcePlugin } from './htmlSourcePlugin.mjs';

// Re-export for external use
export { createReactSourcePlugin, createVueSourcePlugin, createHtmlSourcePlugin };

// ============================================
// Click-to-Source Script
// ============================================

/**
 * The script injected into every page for click-to-source functionality.
 * This runs in the browser context and provides:
 * - Inspect mode with element highlighting
 * - Click to copy element HTML
 * - Source location parsing (supports multi-line format)
 * - ESC to cancel
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

	// Get last inspected element info (including source, component, parent)
	window.__roopik_getLastInspectedInfo = function() {
		if (!currentElement) return null;

		return {
			html: currentElement.outerHTML,
			tagName: currentElement.tagName.toLowerCase(),
			id: currentElement.id || null,
			className: currentElement.className || null,
			source: parseSourceAttr(currentElement.getAttribute('data-roopik-source')),
			component: currentElement.getAttribute('data-roopik-component'),
			parent: currentElement.getAttribute('data-roopik-parent')
		};
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
		const componentAttr = el.getAttribute('data-roopik-component');
		const parentAttr = el.getAttribute('data-roopik-parent');
		const html = el.outerHTML;

		// Build info object
		const info = {
			html: html,
			tagName: el.tagName.toLowerCase(),
			id: el.id || null,
			className: el.className || null,
			source: sourceAttr ? parseSourceAttr(sourceAttr) : null,
			component: componentAttr || null,
			parent: parentAttr || null
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

	/**
	 * Parse source attribute
	 * Supports both formats:
	 * - Legacy: file:line:col
	 * - New: file:startLine:startCol:endLine:endCol
	 */
	function parseSourceAttr(attr) {
		if (!attr) return null;

		const parts = attr.split(':');

		// Handle Windows paths (C:/path/to/file.tsx:1:0:10:5)
		// Find where the path ends by looking for numeric parts
		let pathEndIndex = 0;
		for (let i = parts.length - 1; i >= 0; i--) {
			if (isNaN(parseInt(parts[i], 10))) {
				pathEndIndex = i;
				break;
			}
		}

		const filePath = parts.slice(0, pathEndIndex + 1).join(':');
		const numbers = parts.slice(pathEndIndex + 1).map(n => parseInt(n, 10));

		if (numbers.length >= 4) {
			// New format: startLine:startCol:endLine:endCol
			return {
				file: filePath,
				startLine: numbers[0] || 1,
				startColumn: numbers[1] || 0,
				endLine: numbers[2] || numbers[0] || 1,
				endColumn: numbers[3] || 0,
				// Legacy compatibility
				line: numbers[0] || 1,
				column: numbers[1] || 0
			};
		} else if (numbers.length >= 2) {
			// Legacy format: line:col
			return {
				file: filePath,
				line: numbers[0] || 1,
				column: numbers[1] || 0,
				startLine: numbers[0] || 1,
				startColumn: numbers[1] || 0,
				endLine: numbers[0] || 1,
				endColumn: numbers[1] || 0
			};
		}

		return { file: attr, line: 1, column: 0 };
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
		isActive: window.__roopik_isInspectActive,
		getLastInfo: window.__roopik_getLastInspectedInfo
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
 * Create a no-op plugin (placeholder for unsupported frameworks)
 */
export function createNoopPlugin(name = 'roopik:noop') {
	return { name };
}

// ============================================
// Plugin Selection
// ============================================

/**
 * Get plugins for a specific framework
 *
 * @param {string} frameworkId - Framework identifier
 * @param {Object} options - Plugin options
 * @param {boolean} [options.verboseLogging=false] - Enable verbose logging
 * @param {string} [options.babelPath] - Path to @babel/core (for React AST mode)
 * @param {string} [options.vueCompilerPath] - Path to @vue/compiler-sfc (for Vue AST mode)
 * @param {boolean} [options.forceRegexMode=false] - Force regex mode (skip AST)
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
			plugins.push(createReactSourcePlugin({
				babelPath: options.babelPath,
				forceRegexMode: options.forceRegexMode,
				verboseLogging: options.verboseLogging
			}));
			break;

		case 'vue-vite':
			plugins.push(createVueSourcePlugin({
				compilerPath: options.vueCompilerPath,
				forceRegexMode: options.forceRegexMode,
				verboseLogging: options.verboseLogging
			}));
			break;

		case 'solid-vite':
			// SolidJS uses similar JSX syntax to React
			plugins.push(createReactSourcePlugin({
				babelPath: options.babelPath,
				forceRegexMode: options.forceRegexMode,
				verboseLogging: options.verboseLogging
			}));
			break;

		case 'plain-html-vite':
			plugins.push(createHtmlSourcePlugin({
				verboseLogging: options.verboseLogging
			}));
			break;

		case 'svelte-vite':
			// Svelte has its own compilation, source tracking needs different approach
			// TODO: Implement Svelte source tracking
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
