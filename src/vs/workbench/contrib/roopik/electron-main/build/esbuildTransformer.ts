/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as esbuild from 'esbuild';
import sveltePlugin from 'esbuild-svelte';
import vuePlugin from 'esbuild-plugin-vue3';
import { solidPlugin } from 'esbuild-plugin-solid';
import * as fs from 'fs';
import * as path from '../../../../../base/common/path.js';
import * as os from 'os';
import { fileURLToPath } from 'url';
import { Framework } from '../../common/build/types.js';
import type { ComponentInput, TransformedComponent } from '../../common/build/types.js';
import { ComponentParser } from '../../common/build/componentParser.js';
import { createSourceTrackingTransform } from './injectors/sourceTrackingInjector.js';
import { ILoggerService } from '../../../../../platform/log/common/log.js';
import { getRoopikLogger } from '../../common/roopikLogger.js';

// ============================================
// CDN Configuration
// ============================================

/**
 * Supported CDN Providers (ESM-compatible only)
 *
 * - esm.sh: RECOMMENDED - Best ESM support, auto-converts CJS, supports React 18+, handles module deduplication
 * - skypack: Good fallback for non-React packages (stuck on React 17.x, see github.com/skypackjs/skypack-cdn/issues/88)
 * - jsdelivr: Fast but has React hooks issues due to multiple React instances (no module deduplication)
 */
export type CDNProvider = 'esm.sh' | 'skypack' | 'jsdelivr';

/**
 * CHANGE THIS to switch CDN providers globally
 * Default: 'esm.sh' (recommended - best ESM support, only reliable CDN for React 18+)
 */
const CDN_PROVIDER: CDNProvider = 'esm.sh';

/**
 * CDN URL Templates
 *
 * Each provider has slightly different URL formats:
 * - withVersion: When AI/user specifies exact version
 * - withoutVersion: Fallback to latest stable
 * - withSubpath: For deep imports like 'react-dom/client'
 */
const CDN_TEMPLATES: Record<CDNProvider, {
	withVersion: (pkg: string, version: string) => string;
	withoutVersion: (pkg: string) => string;
	withSubpath: (pkg: string, version: string, subpath: string) => string;
	withSubpathNoVersion: (pkg: string, subpath: string) => string;
}> = {
	'esm.sh': {
		// Best ESM support, ?dev enables development mode (better errors)
		// Only CDN that properly supports React 18+ and react-dom/client
		withVersion: (pkg, version) => `https://esm.sh/${pkg}@${version}?dev`,
		withoutVersion: (pkg) => `https://esm.sh/${pkg}?dev`,
		withSubpath: (pkg, version, subpath) => `https://esm.sh/${pkg}@${version}${subpath}?dev`,
		withSubpathNoVersion: (pkg, subpath) => `https://esm.sh/${pkg}${subpath}?dev`
	},
	'skypack': {
		// Good for non-React packages. React issues: stuck on 17.x, react-dom/client returns 404
		withVersion: (pkg, version) => `https://cdn.skypack.dev/${pkg}@${version}?min`,
		withoutVersion: (pkg) => `https://cdn.skypack.dev/${pkg}?min`,
		withSubpath: (pkg, version, subpath) => `https://cdn.skypack.dev/${pkg}@${version}${subpath}?min`,
		withSubpathNoVersion: (pkg, subpath) => `https://cdn.skypack.dev/${pkg}${subpath}?min`
	},
	'jsdelivr': {
		// Fast CDN but React hooks fail due to multiple React instances (no module deduplication)
		withVersion: (pkg, version) => `https://cdn.jsdelivr.net/npm/${pkg}@${version}/+esm`,
		withoutVersion: (pkg) => `https://cdn.jsdelivr.net/npm/${pkg}/+esm`,
		withSubpath: (pkg, version, subpath) => `https://cdn.jsdelivr.net/npm/${pkg}@${version}${subpath}/+esm`,
		withSubpathNoVersion: (pkg, subpath) => `https://cdn.jsdelivr.net/npm/${pkg}${subpath}/+esm`
	}
};

/**
 * Stable versions for common packages
 * Used as fallback when AI provides invalid/hallucinated versions
 */
const STABLE_VERSIONS: Record<string, string> = {
	// React ecosystem
	'react': '18.2.0',
	'react-dom': '18.2.0',
	'react-router': '6.20.0',
	'react-router-dom': '6.20.0',

	// Vue ecosystem
	'vue': '3.5.26',
	'@vue/compiler-sfc': '3.5.26',
	'vue-router': '4.5.0',
	'pinia': '3.0.2',

	// Svelte ecosystem (Svelte 5 for esbuild-svelte@0.9.x compatibility)
	'svelte': '5.46.1',

	// Solid ecosystem
	'solid-js': '1.9.10',

	// Preact ecosystem
	'preact': '10.28.1',

	// UI Libraries
	'@mui/material': '5.15.0',
	'@mui/icons-material': '5.15.0',
	'@emotion/react': '11.11.0',
	'@emotion/styled': '11.11.0',
	'antd': '5.12.0',
	'@chakra-ui/react': '2.8.2',

	// Utilities
	'lodash': '4.17.21',
	'axios': '1.6.2',
	'date-fns': '3.0.0',
	'dayjs': '1.11.10'
};

/**
 * Package pairs that MUST have matching versions
 * If react is 18.x, react-dom MUST also be 18.x
 */
const VERSION_PAIRS: Record<string, string[]> = {
	'react': ['react-dom'],
	'vue': ['@vue/compiler-sfc'],
	'@mui/material': ['@mui/icons-material']
};

/**
 * Framework Core Dependencies
 *
 * These are the core runtime packages for each framework.
 * When building for a framework, we need to ensure ALL packages
 * that internally import these dependencies use the SAME version.
 *
 * This prevents the "multiple React instances" problem where:
 * - Your app imports react@18.2.0
 * - framer-motion internally imports its own react (different instance)
 * - useContext fails because contexts are tied to the React instance
 *
 * Solution: Add `deps=react@18.2.0,react-dom@18.2.0` to esm.sh URLs
 * for all non-core packages, forcing them to use our React version.
 */
const FRAMEWORK_CORE_DEPS: Record<Framework, string[]> = {
	'react': ['react', 'react-dom'],
	'preact': ['preact'],  // Note: preact/hooks is a subpath, not separate package
	'vue': ['vue'],
	'solid': ['solid-js'],
	'svelte': [],  // Svelte compiles away - no runtime singleton issues
	'html': [],
	'unknown': []
};

/**
 * Build the deps parameter string for esm.sh
 * Returns empty string if no deps needed, or "&deps=react@18.2.0,react-dom@18.2.0" format
 */
function buildDepsParam(frameworkDeps: Record<string, string> | undefined): string {
	if (!frameworkDeps || Object.keys(frameworkDeps).length === 0) {
		return '';
	}

	const depsArray = Object.entries(frameworkDeps)
		.map(([pkg, version]) => `${pkg}@${version}`)
		.join(',');

	return `&deps=${depsArray}`;
}

/**
 * Get CDN URL for a package
 *
 * @param packageName - The npm package name
 * @param version - Optional specific version
 * @param subpath - Optional subpath (e.g., '/client' for react-dom/client)
 * @param frameworkDeps - Optional map of framework core deps (e.g., { react: '18.2.0' })
 * @param isCoreDep - Whether this package IS a core dependency (shouldn't get deps param)
 */
function getCDNUrl(
	packageName: string,
	version?: string,
	subpath?: string,
	frameworkDeps?: Record<string, string>,
	isCoreDep: boolean = false
): string {
	const cdn = CDN_TEMPLATES[CDN_PROVIDER];

	// Build base URL
	let url: string;
	if (subpath) {
		url = version
			? cdn.withSubpath(packageName, version, subpath)
			: cdn.withSubpathNoVersion(packageName, subpath);
	} else {
		url = version
			? cdn.withVersion(packageName, version)
			: cdn.withoutVersion(packageName);
	}

	// Add deps parameter for non-core packages (only on esm.sh)
	// This forces libraries like framer-motion to use OUR React instead of their own
	if (!isCoreDep && CDN_PROVIDER === 'esm.sh') {
		url += buildDepsParam(frameworkDeps);
	}

	return url;
}




/**
 * Framework build modes
 *
 * - 'virtual': Use in-memory virtual FS (fast, works for JSX/TSX frameworks)
 * - 'disk': Write to temp directory (required for frameworks with custom file formats)
 */
type BuildMode = 'virtual' | 'disk';

/**
 * Framework configuration for build process
 */
interface FrameworkBuildConfig {
	mode: BuildMode;
	getPlugins: () => esbuild.Plugin[];
}

/**
 * Framework build configurations
 *
 * Add new frameworks here with their build requirements
 */
const FRAMEWORK_BUILD_CONFIGS: Record<Framework, FrameworkBuildConfig> = {
	react: {
		mode: 'virtual',
		getPlugins: () => []
	},
	solid: {
		mode: 'disk', // Solid plugin (Babel-based) requires disk access
		getPlugins: () => [solidPlugin({ solid: { generate: 'dom' } })]
	},
	preact: {
		mode: 'virtual',
		getPlugins: () => []
	},
	vue: {
		mode: 'disk', // Vue plugin requires disk access for .vue files
		getPlugins: () => [vuePlugin()]
	},
	svelte: {
		mode: 'disk', // Svelte plugin requires disk access for .svelte files
		getPlugins: () => {
			// esbuild-svelte with Svelte 5 compiler options
			// eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
			const pluginFn = (sveltePlugin as any).default || sveltePlugin;
			const plugin = pluginFn({
				compilerOptions: {
					// Generate client-side code (not SSR)
					generate: 'client',
					// Use dev mode for better error messages
					dev: true,
					// Enable compatibility mode for Svelte 4 style components (onMount, etc.)
					// This allows components using the old API to work in Svelte 5
					compatibility: {
						componentApi: 4
					}
				}
			});
			return [plugin];
		}
	},
	html: {
		mode: 'virtual',
		getPlugins: () => []
	},
	unknown: {
		mode: 'virtual',
		getPlugins: () => []
	}
};

/**
 * JSX Import Source per framework
 *
 * Used for React 17+ automatic JSX transform.
 * Tells esbuild where to import jsx-runtime from.
 */
const JSX_IMPORT_SOURCES: Partial<Record<Framework, string>> = {
	'react': 'react',
	'preact': 'preact'
	// Solid.js uses a different JSX transform (needs babel-preset-solid)
	// Vue and Svelte use their own syntax, not JSX
	// html/unknown don't use JSX
};

/**
 * ESBuild Code Transformer (Refactored)
 *
 * Key improvements:
 * - Dynamic dependency resolution (AI controls versions)
 * - Synthetic entry points (proper ESM, no globals)
 * - Metafile-based URL extraction (reliable)
 * - Graceful fallbacks
 * - Disk-based builds for frameworks that need it (Vue, Svelte)
 */
export class ESBuildTransformer {

	private readonly logger;
	private stableVersionsCache: Record<string, string> | null = null;

	constructor(
		@ILoggerService loggerService: ILoggerService,
		private readonly parser: ComponentParser
	) {
		this.logger = getRoopikLogger(loggerService, 'BUILD_TRANSFORMER');
	}

	/**
	 * Get stable versions with lazy loading and caching
	 *
	 * Priority:
	 * 1. In-memory cache (if already loaded)
	 * 2. External JSON file (user-editable)
	 * 3. Hardcoded fallback (STABLE_VERSIONS constant)
	 */
	private async getStableVersions(): Promise<Record<string, string>> {
		// Return cached if available
		if (this.stableVersionsCache) {
			// this.logger.info('Using cached stable versions');
			return this.stableVersionsCache;
		}

		try {
			// Try loading from external JSON
			// Path differs between dev (out-build) and production builds
			// From: electron-main/build/ -> resources/
			// In compiled output: __dirname = out-build/vs/workbench/contrib/roopik/electron-main/build
			// In production: same relative structure

			// Use import.meta.url to get current file path (ESM-compatible)
			// fileURLToPath handles Windows paths correctly (file:///C:/... -> C:\...)
			const currentFilePath = fileURLToPath(import.meta.url);
			const currentDir = path.dirname(currentFilePath);

			// Try production path first (relative to compiled output)
			let jsonPath = path.join(currentDir, '../../resources/stable-versions.json');

			// Check if file exists, if not try source path (for dev mode with source maps)
			if (!fs.existsSync(jsonPath)) {
				// Dev fallback: look relative to workspace root
				// currentDir in dev: [workspace]/out-build/vs/workbench/contrib/roopik/electron-main/build
				// We need:          [workspace]/src/vs/workbench/contrib/roopik/resources/stable-versions.json
				const workspaceRoot = path.join(currentDir, '../../../../../../../..');
				jsonPath = path.join(workspaceRoot, 'src/vs/workbench/contrib/roopik/resources/stable-versions.json');
			}

			const content = await fs.promises.readFile(jsonPath, 'utf-8');
			this.stableVersionsCache = JSON.parse(content);
			// this.logger.info('Loaded stable versions from file', { path: jsonPath });
			this.logger.info('Loaded stable versions');
			return this.stableVersionsCache!;
		} catch (error) {
			// Fallback to hardcoded
			this.logger.warn('Failed to load stable versions file, using hardcoded fallback', { error });
			this.stableVersionsCache = STABLE_VERSIONS;
			return this.stableVersionsCache!;
		}
	}

	async transform(input: ComponentInput): Promise<TransformedComponent> {
		const startTime = Date.now();

		// 1. Detect framework
		// Always re-detect if framework is 'unknown' to allow fixing incorrect detections
		const framework = (input.framework && input.framework !== 'unknown')
			? input.framework
			: this.parser.detectFramework(input.files);

		// 2. Detect entry file
		const userEntryFile = input.entryFile || this.parser.detectEntryFile(input.files, framework);

		// 3. Apply source tracking to user files (adds data-roopik-source attributes)
		const trackedFiles = this.applySourceTracking(input.files, framework, input.id);

		// 4. Create synthetic entry point
		const syntheticEntryPath = 'roopik-main-entry.js';
		const syntheticEntryCode = this.generateSyntheticEntry(framework, userEntryFile);

		// 5. Combine tracked user files + synthetic entry
		const allFiles = {
			...trackedFiles,
			[syntheticEntryPath]: syntheticEntryCode
		};

		// 5. Get framework build config
		const buildConfig = FRAMEWORK_BUILD_CONFIGS[framework];

		// 6. Handle HTML framework specially (no ESBuild needed)
		if (framework === 'html') {
			const result = this.transformHTML(input.files);
			return {
				id: input.id,
				framework,
				bundledCode: result.code,
				cdnUrls: [],
				resolvedDependencies: {}, // No dependencies for vanilla HTML
				metadata: {
					size: result.code.length,
					transformTime: Date.now() - startTime
				}
			};
		}

		// 7. Normalize and track resolved dependencies
		const resolvedDeps: Record<string, string> = {};
		const normalizedDeps = this.normalizeAndValidateDependencies(input.dependencies || {});

		// 8. Build framework core deps for dependency aliasing
		// This prevents "multiple React instances" issues with libraries like framer-motion
		const stableVersions = await this.getStableVersions();
		const frameworkCorePkgs = FRAMEWORK_CORE_DEPS[framework] || [];
		const frameworkDeps: Record<string, string> = {};
		for (const pkg of frameworkCorePkgs) {
			// Get the version - prefer normalized deps, then stable fallback
			const version = normalizedDeps[pkg] || stableVersions[pkg];
			if (version) {
				frameworkDeps[pkg] = version;
			}
		}

		// 9. Transform with ESBuild (disk-based or virtual)
		let result: { code: string; metafile: esbuild.Metafile };

		if (buildConfig.mode === 'disk') {
			result = await this.transformWithDiskBuild(
				syntheticEntryPath,
				allFiles,
				normalizedDeps,
				buildConfig,
				resolvedDeps,
				frameworkDeps,
				framework,
				stableVersions
			);
		} else {
			result = await this.transformWithVirtualBuild(
				syntheticEntryPath,
				allFiles,
				normalizedDeps,
				buildConfig,
				resolvedDeps,
				frameworkDeps,
				framework,
				stableVersions
			);
		}

		return {
			id: input.id,
			framework,
			bundledCode: result.code,
			cdnUrls: this.extractImportsFromMeta(result.metafile),
			resolvedDependencies: resolvedDeps,
			metadata: {
				size: result.code.length,
				transformTime: Date.now() - startTime
			}
		};
	}

	/**
	 * Transform HTML/CSS/JS (vanilla) - no ESBuild needed
	 *
	 * For vanilla HTML, we inject the content directly into the DOM.
	 * This handles:
	 * - HTML content -> injected into #root
	 * - CSS content -> injected as <style> tag
	 * - JS content -> executed directly
	 */
	private transformHTML(files: { [filename: string]: string }): { code: string } {
		let htmlContent = '';
		let cssContent = '';
		let jsContent = '';

		for (const [filename, content] of Object.entries(files)) {
			if (filename.endsWith('.html')) {
				htmlContent += content;
			} else if (filename.endsWith('.css')) {
				cssContent += content;
			} else if (filename.endsWith('.js')) {
				jsContent += content;
			}
		}

		// Generate code that injects HTML, CSS, and runs JS
		const code = `
// Vanilla HTML/CSS/JS bundle
(function() {
	// Inject CSS
	${cssContent ? `
	const style = document.createElement('style');
	style.textContent = ${JSON.stringify(cssContent)};
	document.head.appendChild(style);
	` : ''}

	// Inject HTML into #root
	${htmlContent ? `
	const root = document.getElementById('root');
	if (root) {
		root.innerHTML = ${JSON.stringify(htmlContent)};
	}
	` : ''}

	// Execute JS
	${jsContent}
})();
`;

		return { code };
	}

	/**
	 * Disk-based build for frameworks that require file system access
	 *
	 * Writes files to a temp directory, runs ESBuild, then cleans up.
	 * Required for Vue, Svelte, and other frameworks with custom file formats.
	 */
	private async transformWithDiskBuild(
		entryPath: string,
		files: { [filename: string]: string },
		dependencies: Record<string, string>,
		buildConfig: FrameworkBuildConfig,
		resolvedDeps: Record<string, string>,
		frameworkDeps: Record<string, string>,
		framework: Framework,
		stableVersions: Record<string, string>
	): Promise<{ code: string; metafile: esbuild.Metafile }> {
		// Create temp directory
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roopik-sandbox-'));

		// Track local files so CDN resolver doesn't intercept them
		const localFiles = new Set(Object.keys(files));

		try {
			// Write all files to temp directory
			for (const [filename, content] of Object.entries(files)) {
				const filePath = path.join(tempDir, filename);
				const fileDir = path.dirname(filePath);

				// Create subdirectories if needed
				if (!fs.existsSync(fileDir)) {
					fs.mkdirSync(fileDir, { recursive: true });
				}

				fs.writeFileSync(filePath, content, 'utf-8');
			}

			this.logger.debug('Disk build started', { tempDir, localFilesCount: localFiles.size });

			// Get JSX import source for this framework (React, Preact, Solid use JSX)
			const jsxImportSource = JSX_IMPORT_SOURCES[framework];

			// Run ESBuild with disk-based entry point
			const result = await esbuild.build({
				entryPoints: [path.join(tempDir, entryPath)],
				bundle: true,
				format: 'esm',
				write: false,
				metafile: true,
				target: 'es2022',
				outfile: 'bundle.js',
				absWorkingDir: tempDir,
				// Use automatic JSX transform (React 17+) if framework supports JSX
				...(jsxImportSource ? {
					jsx: 'automatic',
					jsxImportSource
				} : {}),
				plugins: [
					...buildConfig.getPlugins(),
					this.createCDNResolverPlugin(dependencies, resolvedDeps, frameworkDeps, stableVersions, localFiles)
				]
			});

			return this.processESBuildResult(result);

		} finally {
			// Clean up temp directory
			try {
				fs.rmSync(tempDir, { recursive: true, force: true });
			} catch (cleanupError) {
				this.logger.warn('Failed to clean up temp dir', { tempDir, error: cleanupError });
			}
		}
	}

	/**
	 * Virtual FS build for simple frameworks (React, Solid, Preact)
	 *
	 * Uses in-memory virtual file system - faster, no disk I/O.
	 */
	private async transformWithVirtualBuild(
		entryPath: string,
		files: { [filename: string]: string },
		dependencies: Record<string, string>,
		buildConfig: FrameworkBuildConfig,
		resolvedDeps: Record<string, string>,
		frameworkDeps: Record<string, string>,
		framework: Framework,
		stableVersions: Record<string, string>
	): Promise<{ code: string; metafile: esbuild.Metafile }> {
		// Get JSX import source for this framework (React, Preact, Solid use JSX)
		const jsxImportSource = JSX_IMPORT_SOURCES[framework];

		const result = await esbuild.build({
			entryPoints: [entryPath],
			bundle: true,
			format: 'esm',
			write: false,
			metafile: true,
			target: 'es2022',
			outfile: 'bundle.js',
			// Use automatic JSX transform (React 17+) if framework supports JSX
			...(jsxImportSource ? {
				jsx: 'automatic',
				jsxImportSource
			} : {}),
			plugins: [
				...buildConfig.getPlugins(),
				this.createVirtualFSPlugin(files),
				this.createCDNResolverPlugin(dependencies, resolvedDeps, frameworkDeps, stableVersions)
			]
		});

		return this.processESBuildResult(result);
	}

	/**
	 * Process ESBuild result - extract JS and CSS, combine into single bundle
	 */
	private processESBuildResult(result: esbuild.BuildResult): { code: string; metafile: esbuild.Metafile } {
		let jsCode = '';
		let cssCode = '';

		for (const file of result.outputFiles || []) {
			this.logger.debug('Output file processed', { path: file.path, size: file.text.length });
			if (file.path.endsWith('.css')) {
				cssCode += file.text;
			} else if (file.path.endsWith('.js')) {
				jsCode += file.text;
			}
		}

		// Prepend Vue feature flags (suppress warnings for CDN-loaded Vue)
		const vueGlobals = `// Vue feature flags (for CDN-loaded Vue)
globalThis.__VUE_OPTIONS_API__ = true;
globalThis.__VUE_PROD_DEVTOOLS__ = false;
globalThis.__VUE_PROD_HYDRATION_MISMATCH_DETAILS__ = false;
`;
		jsCode = vueGlobals + jsCode;

		// If CSS was generated, inject it into the JS bundle
		if (cssCode) {
			const escapedCss = JSON.stringify(cssCode);
			jsCode += `\n
// Auto-injected CSS from ESBuild
(function() {
	const style = document.createElement('style');
	style.textContent = ${escapedCss};
	document.head.appendChild(style);
})();`;
		}

		return {
			code: jsCode,
			metafile: result.metafile!
		};
	}

	/**
	 * Generate synthetic entry point for framework
	 *
	 * This creates a proper ESM bootstrap file that:
	 * - Imports the user's component
	 * - Handles default exports
	 * - Renders to #root
	 */
	private generateSyntheticEntry(framework: Framework, userEntry: string): string {
		const importPath = `./${userEntry}`;

		if (framework === 'react') {
			return `
import React from 'react';
import { createRoot } from 'react-dom/client';
import UserComponent from '${importPath}';

const root = createRoot(document.getElementById('root'));
const ToRender = UserComponent.default || UserComponent;
root.render(React.createElement(ToRender));
`;
		}

		if (framework === 'vue') {
			// Vue's mount() should replace content, but clear as safety
			return `
import { createApp } from 'vue';
import UserComponent from '${importPath}';

// Clear loading placeholder before mounting
document.getElementById('root').innerHTML = '';
const app = createApp(UserComponent.default || UserComponent);
app.mount('#root');
`;
		}

		if (framework === 'svelte') {
			// Svelte 5 with legacy componentApi mode - use traditional new Component() style
			// This is compatible with Svelte 4 components using onMount, etc.
			// IMPORTANT: Clear the target first since Svelte appends rather than replaces
			return `
import UserComponent from '${importPath}';

const target = document.getElementById('root');
// Clear loading placeholder - Svelte appends to target rather than replacing
target.innerHTML = '';
const Component = UserComponent.default || UserComponent;

// Svelte 5 legacy mode: use new Component() constructor
new Component({ target });
`;
		}

		if (framework === 'solid') {
			return `
import { render } from 'solid-js/web';
import UserComponent from '${importPath}';

// Clear loading placeholder before mounting
const root = document.getElementById('root');
root.innerHTML = '';
const Component = UserComponent.default || UserComponent;
render(() => Component(), root);
`;
		}

		if (framework === 'preact') {
			return `
import { h, render } from 'preact';
import UserComponent from '${importPath}';

// Clear loading placeholder before mounting
const root = document.getElementById('root');
root.innerHTML = '';
const Component = UserComponent.default || UserComponent;
render(h(Component), root);
`;
		}

		// HTML/vanilla JS - just import it
		return `import '${importPath}';`;
	}

	/**
	 * Dynamic CDN Resolver with Graceful Fallbacks & Version Validation
	 *
	 * Strategy:
	 * 1. Use AI-provided version if exists
	 * 2. Validate version pairs (react must match react-dom)
	 * 3. Fallback to stable version if available
	 * 4. Otherwise let CDN resolve to latest (marked as 'latest' in resolvedDeps)
	 *
	 * Uses configurable CDN_PROVIDER (esm.sh, unpkg, skypack, jsdelivr)
	 *
	 * @param dependencies Input dependencies (may be empty or partial)
	 * @param resolvedDeps Output object - will be populated with actual versions used
	 * @param frameworkDeps Framework core deps for aliasing (e.g., { react: '18.2.0' })
	 * @param localFiles Optional set of local files to skip (for disk builds)
	 */
	private createCDNResolverPlugin(
		dependencies: Record<string, string>,
		resolvedDeps: Record<string, string>,
		frameworkDeps: Record<string, string>,
		stableVersions: Record<string, string>,
		localFiles?: Set<string>
	): esbuild.Plugin {
		// Capture logger for use in plugin callbacks
		const logger = this.logger;

		// Helper to check if path is absolute (works on both Windows and Unix)
		const isAbsolutePath = (p: string): boolean => {
			// Windows: C:\, D:\, etc. or \\network\path
			// Unix: /path
			return /^([A-Za-z]:|\\\\|\/)/i.test(p);
		};

		return {
			name: 'cdn-resolver',
			setup(build) {
				build.onResolve({ filter: /^[^.\/]/ }, args => {
					const packagePath = args.path;

					// Skip absolute paths (Windows: C:\..., Unix: /...)
					// These are local files, not npm packages
					if (isAbsolutePath(packagePath)) {
						return null;
					}

					// Skip our synthetic entry point and local files
					if (packagePath === 'roopik-main-entry.js' || packagePath.startsWith('roopik-')) {
						return null; // Let other resolvers handle it
					}

					// Skip files that exist locally (for disk-based builds)
					if (localFiles?.has(packagePath)) {
						return null;
					}

					// Parse package name and subpath
					// Examples:
					//   'react' -> mainPkg: 'react', subpath: ''
					//   'react-dom/client' -> mainPkg: 'react-dom', subpath: '/client'
					//   '@mui/material' -> mainPkg: '@mui/material', subpath: ''
					//   '@mui/material/Button' -> mainPkg: '@mui/material', subpath: '/Button'

					const parts = packagePath.split('/');
					let mainPkg: string;
					let subpath: string;

					if (packagePath.startsWith('@')) {
						// Scoped package: @scope/name or @scope/name/subpath
						mainPkg = `${parts[0]}/${parts[1]}`;
						subpath = parts.length > 2 ? '/' + parts.slice(2).join('/') : '';
					} else {
						// Regular package: name or name/subpath
						mainPkg = parts[0];
						subpath = parts.length > 1 ? '/' + parts.slice(1).join('/') : '';
					}

					// Get version: input deps -> stable fallback -> 'latest'
					let version: string | undefined = dependencies[mainPkg];
					let versionSource = 'input';

					if (!version) {
						version = stableVersions[mainPkg];
						versionSource = version ? 'stable-fallback' : 'latest';
					}

					// Track the resolved version (only track main package, not subpaths)
					if (!resolvedDeps[mainPkg]) {
						resolvedDeps[mainPkg] = version || 'latest';
						logger.debug('CDN package resolved', { package: mainPkg, version: resolvedDeps[mainPkg], source: versionSource });
					}

					// Check if this package IS a core framework dependency
					const isCoreDep = frameworkDeps.hasOwnProperty(mainPkg);

					// Generate CDN URL using configurable provider
					// Non-core packages get `&deps=react@18.2.0,...` to prevent multiple instances
					const url = getCDNUrl(mainPkg, version, subpath || undefined, frameworkDeps, isCoreDep);

					logger.debug('CDN URL mapped', { packagePath, url });

					return { path: url, external: true };
				});
			}
		};
	}

	/**
	 * Normalize and validate dependencies
	 *
	 * - Ensures version pairs match (react & react-dom same version)
	 * - Falls back to stable versions for invalid/missing versions
	 */
	private normalizeAndValidateDependencies(deps: Record<string, string>): Record<string, string> {
		const normalized: Record<string, string> = { ...deps };

		// Validate version pairs
		for (const [primary, dependents] of Object.entries(VERSION_PAIRS)) {
			if (normalized[primary]) {
				const primaryVersion = normalized[primary];

				for (const dependent of dependents) {
					if (normalized[dependent] && normalized[dependent] !== primaryVersion) {
						// Version mismatch - force to match primary
						this.logger.warn('Version mismatch auto-fixed', {
							dependent,
							oldVersion: normalized[dependent],
							primary,
							newVersion: primaryVersion
						});
						normalized[dependent] = primaryVersion;
					} else if (!normalized[dependent]) {
						// Dependent not specified - inherit from primary
						normalized[dependent] = primaryVersion;
					}
				}
			}
		}

		return normalized;
	}

	/**
	 * Virtual FS Plugin
	 *
	 * Loads files from memory (user files + synthetic entry)
	 */
	private createVirtualFSPlugin(files: Record<string, string>): esbuild.Plugin {
		return {
			name: 'virtual-fs',
			setup: (build) => {
				// 1. Resolve files (Tell esbuild "I have this file!")
				build.onResolve({ filter: /.*/ }, args => {
					// Only claim files we actually have in memory
					if (files[args.path]) {
						return { path: args.path, namespace: 'vfs' };
					}

					// Only claim relative imports (./App.jsx, ./utils.ts)
					if (args.path.startsWith('.')) {
						return { path: args.path, namespace: 'vfs' };
					}

					// Let other plugins handle it (CDN resolver for 'react', 'vue', etc.)
					return null;
				});

				// 2. Load files (Give esbuild the content)
				build.onLoad({ filter: /.*/, namespace: 'vfs' }, args => {
					// Strip local prefix if present
					const key = args.path.replace(/^\.\//, '');

					// Try exact match first, then auto-resolve extensions
					const content = files[key]
						|| files[key + '.js']
						|| files[key + '.jsx']
						|| files[key + '.ts']
						|| files[key + '.tsx']
						|| files[key + '.css']
						|| files[key + '.json'];

					if (content === undefined) {
						// If we claimed it in Resolve but can't find it here, return null
						// to let other plugins (like http-loader) try, or throw error.
						// For a strictly local sandbox, throwing is usually better debugging.
						throw new Error(`[VirtualFS] File not found: ${key}`);
					}

					// Determine loader based on extension
					let loader: esbuild.Loader = 'js';
					if (key.endsWith('.tsx')) {
						loader = 'tsx';
					} else if (key.endsWith('.ts')) {
						loader = 'ts';
					} else if (key.endsWith('.jsx')) {
						loader = 'jsx';
					} else if (key.endsWith('.css')) {
						loader = 'css';
					} else if (key.endsWith('.json')) {
						loader = 'json';
					}

					return { contents: content, loader };
				});
			}
		};
	}


	/**
	 * Extract CDN URLs from ESBuild metafile
	 *
	 * This is MUCH more reliable than regex parsing!
	 */
	private extractImportsFromMeta(meta: esbuild.Metafile): string[] {
		const urls = new Set<string>();

		Object.values(meta.outputs).forEach(output => {
			output.imports.forEach(imp => {
				if (imp.path.startsWith('http')) {
					urls.add(imp.path);
				}
			});
		});

		return Array.from(urls);
	}

	/**
	 * Apply source tracking to user files
	 *
	 * Adds data-roopik-source attributes to JSX/HTML elements.
	 * This enables click-to-source functionality in the canvas sandbox.
	 *
	 * Works with all frameworks: React, Vue, Svelte, Solid, Preact, HTML
	 *
	 * @param files - User source files
	 * @param framework - Detected framework
	 * @param componentId - Component ID for tracking
	 * @returns Files with source tracking attributes injected
	 */
	private applySourceTracking(
		files: Record<string, string>,
		framework: Framework,
		componentId: string
	): Record<string, string> {
		const transform = createSourceTrackingTransform(framework, this.logger);
		const trackedFiles: Record<string, string> = {};

		for (const [filename, content] of Object.entries(files)) {
			try {
				// Apply source tracking transformation
				const transformedContent = transform(content, filename, componentId);
				trackedFiles[filename] = transformedContent;
			} catch (error) {
				// Gracefully handle errors - use original content
				this.logger.warn('[SOURCE_TRACKING] Transformation error', { filename, error });
				trackedFiles[filename] = content;
			}
		}

		return trackedFiles;
	}
}
