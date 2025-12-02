/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as esbuild from 'esbuild';
import sveltePlugin from 'esbuild-svelte';
import vuePlugin from 'esbuild-plugin-vue3';
import { Framework, ComponentInput, TransformedComponent } from '../../common/sandboxPipeline/types.js';
import { ComponentParser } from '../../common/sandboxPipeline/componentParser.js';

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
	'vue': '3.4.0',
	'@vue/compiler-sfc': '3.4.0',
	'vue-router': '4.2.5',
	'pinia': '2.1.7',

	// Svelte ecosystem
	'svelte': '4.2.8',

	// Solid ecosystem
	'solid-js': '1.8.7',

	// Preact ecosystem
	'preact': '10.19.3',

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
 * Get CDN URL for a package
 */
function getCDNUrl(packageName: string, version?: string, subpath?: string): string {
	const cdn = CDN_TEMPLATES[CDN_PROVIDER];

	if (subpath) {
		return version
			? cdn.withSubpath(packageName, version, subpath)
			: cdn.withSubpathNoVersion(packageName, subpath);
	}

	return version
		? cdn.withVersion(packageName, version)
		: cdn.withoutVersion(packageName);
}

/**
 * Get stable fallback version for a package
 */
function getStableVersion(packageName: string): string | undefined {
	return STABLE_VERSIONS[packageName];
}


/**
 * ESBuild Code Transformer (Refactored)
 *
 * Key improvements:
 * - Dynamic dependency resolution (AI controls versions)
 * - Synthetic entry points (proper ESM, no globals)
 * - Metafile-based URL extraction (reliable)
 * - Graceful fallbacks
 */
export class ESBuildTransformer {

	constructor(
		private readonly parser: ComponentParser
	) { }

	async transform(input: ComponentInput): Promise<TransformedComponent> {
		const startTime = Date.now();

		// 1. Detect framework
		const framework = input.framework || this.parser.detectFramework(input.files);

		// 2. Detect entry file
		const userEntryFile = input.entryFile || this.parser.detectEntryFile(input.files, framework);

		// 3. Create synthetic entry point
		const syntheticEntryPath = 'roopik-main-entry.js';
		const syntheticEntryCode = this.generateSyntheticEntry(framework, userEntryFile);

		// 4. Combine user files + synthetic entry
		const allFiles = {
			...input.files,
			[syntheticEntryPath]: syntheticEntryCode
		};

		// 5. Transform with ESBuild
		const { code, metafile } = await this.transformWithESBuild(
			syntheticEntryPath,
			framework,
			allFiles,
			input.dependencies || {}
		);

		return {
			id: input.id,
			framework,
			bundledCode: code,
			cdnUrls: this.extractImportsFromMeta(metafile),
			metadata: {
				size: code.length,
				transformTime: Date.now() - startTime
			}
		};
	}

	/**
	 * Transform code with ESBuild
	 */
	private async transformWithESBuild(
		entryPath: string,
		framework: Framework,
		files: { [filename: string]: string },
		dependencies: Record<string, string>
	): Promise<{ code: string; metafile: esbuild.Metafile }> {
		try {
			const result = await esbuild.build({
				entryPoints: [entryPath],
				bundle: true,
				format: 'esm',
				write: false,
				metafile: true, // Get accurate import graph
				target: 'es2022',
				outfile: 'bundle.js',
				plugins: [
					...this.getFrameworkPlugins(framework),
					this.createVirtualFSPlugin(files),
					this.createCDNResolverPlugin(dependencies)
				]
			});

			// CRITICAL FIX: Handle CSS output files
			// ESBuild may generate separate CSS files for:
			// - Imported .css files
			// - Vue/Svelte <style> tags
			// - CSS-in-JS libraries
			let jsCode = '';
			let cssCode = '';

			for (const file of result.outputFiles) {
				console.log('[ESBuildTransformer] Output file:', file.path, 'Size:', file.text.length);
				if (file.path.endsWith('.css')) {
					cssCode += file.text;
				} else if (file.path.endsWith('.js')) {
					jsCode += file.text;
				}
			}

			// If CSS was generated, inject it into the JS bundle
			// We can't send separate CSS files via postMessage, so we
			// create a <style> tag dynamically in the iframe
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

		} catch (error) {
			throw new Error(`ESBuild transformation failed: ${(error as Error).message}`);
		}
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
			return `
import { createApp } from 'vue';
import UserComponent from '${importPath}';

const app = createApp(UserComponent.default || UserComponent);
app.mount('#root');
`;
		}

		if (framework === 'svelte') {
			return `
import UserComponent from '${importPath}';

const Component = UserComponent.default || UserComponent;
new Component({ target: document.getElementById('root') });
`;
		}

		if (framework === 'solid') {
			return `
import { render } from 'solid-js/web';
import UserComponent from '${importPath}';

const Component = UserComponent.default || UserComponent;
render(() => Component(), document.getElementById('root'));
`;
		}

		if (framework === 'preact') {
			return `
import { render } from 'preact';
import UserComponent from '${importPath}';

const Component = UserComponent.default || UserComponent;
render(Component(), document.getElementById('root'));
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
	 * 4. Otherwise let CDN resolve to latest
	 *
	 * Uses configurable CDN_PROVIDER (esm.sh, unpkg, skypack, jsdelivr)
	 */
	private createCDNResolverPlugin(dependencies: Record<string, string>): esbuild.Plugin {
		// Normalize and validate dependencies before processing
		const normalizedDeps = this.normalizeAndValidateDependencies(dependencies);

		return {
			name: 'cdn-resolver',
			setup(build) {
				build.onResolve({ filter: /^[^.\/]/ }, args => {
					const packagePath = args.path;

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

					// Get version from normalized dependencies or fallback to stable
					const version = normalizedDeps[mainPkg] || getStableVersion(mainPkg);

					// Generate CDN URL using configurable provider
					const url = getCDNUrl(mainPkg, version, subpath || undefined);

					console.log(`[CDN] ${packagePath} -> ${url}`);

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
						console.warn(
							`[CDN] Version mismatch: ${dependent}@${normalized[dependent]} ` +
							`should match ${primary}@${primaryVersion}. Auto-fixing.`
						);
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
					if (key.endsWith('.tsx')) loader = 'tsx';
					else if (key.endsWith('.ts')) loader = 'ts';
					else if (key.endsWith('.jsx')) loader = 'jsx';
					else if (key.endsWith('.css')) loader = 'css';
					else if (key.endsWith('.json')) loader = 'json';

					return { contents: content, loader };
				});
			}
		};
	}


	/**
	 * Get framework-specific plugins
	 */
	private getFrameworkPlugins(framework: Framework): esbuild.Plugin[] {
		const plugins: esbuild.Plugin[] = [];

		if (framework === 'vue') {
			plugins.push(vuePlugin());
		} else if (framework === 'svelte') {
			plugins.push((sveltePlugin as any).default ? (sveltePlugin as any).default() : (sveltePlugin as any)());
		}
		// Solid, Preact, React use built-in JSX

		return plugins;
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
}
