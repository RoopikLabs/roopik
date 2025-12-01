/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as esbuild from 'esbuild';
import sveltePlugin from 'esbuild-svelte';
import vuePlugin from 'esbuild-plugin-vue3';
import { Framework, ComponentInput, TransformedComponent } from '../../common/sandboxPipeline/types.js';
import { ComponentParser } from '../../common/sandboxPipeline/componentParser.js';

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
	 * Dynamic CDN Resolver with Graceful Fallbacks
	 *
	 * Strategy:
	 * 1. Use AI-provided version if exists
	 * 2. Fallback to esm.sh (resolves to latest stable)
	 * 3. ESBuild will error if package doesn't exist
	 */
	private createCDNResolverPlugin(dependencies: Record<string, string>): esbuild.Plugin {
		return {
			name: 'cdn-resolver',
			setup(build) {
				build.onResolve({ filter: /^[^.\/]/ }, args => {
					const packageName = args.path;

					let url: string;

					const parts = packageName.split('/');
					const mainPkg = packageName.startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];

					if (dependencies[mainPkg]) {
						const version = dependencies[mainPkg];
						if (packageName === mainPkg) {
							url = `https://esm.sh/${packageName}@${version}?dev`;
						} else {
							// Handle subpath: package@version/subpath
							const subpath = packageName.substring(mainPkg.length);
							url = `https://esm.sh/${mainPkg}@${version}${subpath}?dev`;
						}
					} else {
						// No version - let esm.sh resolve to latest stable
						url = `https://esm.sh/${packageName}?dev`;
					}

					return { path: url, external: true };
				});
			}
		};
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
