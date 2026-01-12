/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Plugin Manager Module
 *
 * Creates and manages Vite plugins for Roopik features:
 * - Source tracking (data-roopik-source attributes) with multi-line support
 * - CORS handling for dev server
 * - CSS source maps for style resolution
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
 *
 * Note: Inspect mode is handled via runtime injection (not build-time)
 * to keep source code clean and avoid polluting user's HTML.
 */

// Import modular source tracking plugins
import { createReactSourcePlugin } from './reactSourcePlugin.mjs';
import { createVueSourcePlugin } from './vueSourcePlugin.mjs';
import { createHtmlSourcePlugin } from './htmlSourcePlugin.mjs';
import { createSvelteSourcePlugin } from './svelteSourcePlugin.mjs';
import { createSolidSourcePlugin } from './solidSourcePlugin.mjs';

// Re-export for external use
export {
	createReactSourcePlugin,
	createVueSourcePlugin,
	createHtmlSourcePlugin,
	createSvelteSourcePlugin,
	createSolidSourcePlugin
};

// ============================================
// Plugin Factories
// ============================================

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
 * @param {boolean} [options.enableCssSourceMaps=true] - Enable CSS source maps
 * @returns {Array} Array of Vite plugins
 */
export function getPluginsForFramework(frameworkId, options = {}) {
	console.log(`[Roopik Plugins] Getting plugins for framework: ${frameworkId}`);

	const plugins = [];

	// Always add inject plugin (click-to-source script)
	// plugins.push(createInjectPlugin()); // NOTE: Removed from build, now injected during runtime

	// Always add CORS plugin
	plugins.push(createCorsPlugin());

	// Always add CSS source maps plugin (for CSS source resolution)
	if (options.enableCssSourceMaps !== false) {
		plugins.push(createCssSourceMapsPlugin({
			verbose: options.verboseLogging
		}));
	}

	// Add framework-specific source tracking
	switch (frameworkId) {
		case 'react-vite':
		case 'preact-vite': // Preact also uses JSX, so we share the plugin
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
			// SolidJS - dedicated plugin that handles .js/.ts/.jsx/.tsx with JSX
			plugins.push(createSolidSourcePlugin({
				verboseLogging: options.verboseLogging
			}));
			break;

		case 'plain-html-vite':
			plugins.push(createHtmlSourcePlugin({
				verboseLogging: options.verboseLogging
			}));
			break;

		case 'svelte-vite':
			// Svelte - dedicated plugin for .svelte files
			plugins.push(createSvelteSourcePlugin({
				verboseLogging: options.verboseLogging
			}));
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
	const supported = ['react-vite', 'vue-vite', 'solid-vite', 'svelte-vite', 'plain-html-vite', 'preact-vite'];
	return supported.includes(frameworkId);
}

// ============================================
// CSS Source Maps Plugin
// ============================================

/**
 * Create CSS Source Maps plugin
 *
 * Automatically enables CSS source maps in development mode.
 * This is required for SCSS/LESS/PostCSS source resolution.
 *
 * When enabled, Vite generates source maps for:
 * - CSS files (with CSS preprocessors)
 * - SCSS/Sass files
 * - LESS files
 * - PostCSS transformations
 *
 * Source maps are embedded inline by default in development
 * and allow our SourceMapResolver to map compiled CSS locations
 * back to original source files.
 *
 * @param {Object} options - Plugin options
 * @param {boolean} [options.verbose=false] - Enable verbose logging
 * @returns {Object} Vite plugin
 */
export function createCssSourceMapsPlugin(options = {}) {
	const { verbose = false } = options;

	return {
		name: 'roopik:css-source-maps',

		// Modify Vite config to enable CSS source maps
		config(config, { mode }) {
			// Only enable in development mode
			if (mode !== 'development' && mode !== 'serve') {
				if (verbose) {
					console.log('[roopik:css-source-maps] Skipping - not in development mode');
				}
				return;
			}

			if (verbose) {
				console.log('[roopik:css-source-maps] Enabling CSS source maps for development');
			}

			return {
				css: {
					// Enable source maps in dev mode
					// This generates inline source maps for CSS files
					devSourcemap: true
				},
				// Also ensure build source maps are enabled (for edge cases)
				build: {
					sourcemap: config.build?.sourcemap ?? true
				}
			};
		},

		// Log when CSS modules are processed (debugging)
		transform(code, id) {
			if (verbose && (id.endsWith('.css') || id.endsWith('.scss') || id.endsWith('.less'))) {
				const hasSourceMap = code.includes('sourceMappingURL');
				console.log(`[roopik:css-source-maps] ${id} - sourceMap: ${hasSourceMap}`);
			}
			return null; // Don't modify code
		}
	};
}

/**
 * Create all CSS-related plugins
 *
 * Combines CSS source maps with any future CSS processing plugins.
 *
 * @param {Object} options - Plugin options
 * @returns {Array} Array of Vite plugins
 */
export function createCssPlugins(options = {}) {
	return [
		createCssSourceMapsPlugin(options)
	];
}
