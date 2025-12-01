/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Framework, ComponentInput, TransformedComponent } from './types.js';
import { ComponentParser } from './componentParser.js';

/**
 * Code Transformer Service
 *
 * Transforms component code using ESBuild:
 * - JSX → JavaScript
 * - Bare imports → CDN URLs
 * - Multi-file bundling
 * - Framework-specific transformations
 *
 * NOTE: This is a placeholder implementation.
 * ESBuild will be integrated in the actual implementation.
 */
export class CodeTransformer {

	constructor(
		private readonly parser: ComponentParser
	) { }

	/**
	 * Transform component code
	 *
	 * Steps:
	 * 1. Detect framework (if not provided)
	 * 2. Detect entry file (if not provided)
	 * 3. Transform with ESBuild
	 * 4. Replace bare imports with CDN URLs
	 * 5. Extract CDN URLs from bundled code
	 */
	async transform(input: ComponentInput): Promise<TransformedComponent> {
		const startTime = Date.now();

		// 1. Detect framework
		const framework = input.framework || this.parser.detectFramework(input.files);

		// 2. Detect entry file
		const entryFile = input.entryFile || this.parser.detectEntryFile(input.files, framework);
		const entryCode = input.files.get(entryFile);

		if (!entryCode) {
			throw new Error(`Entry file not found: ${entryFile}`);
		}

		// 3. Transform code
		// TODO: Integrate ESBuild here
		// For now, we'll do basic transformation
		const bundledCode = await this.transformCode(entryCode, framework, input.files);

		// 4. Extract CDN URLs
		const cdnUrls = this.extractCDNUrls(bundledCode, framework);

		return {
			id: input.id,
			framework,
			bundledCode,
			cdnUrls,
			metadata: {
				size: bundledCode.length,
				transformTime: Date.now() - startTime
			}
		};
	}

	/**
	 * Transform code (placeholder for ESBuild integration)
	 *
	 * TODO: Replace with actual ESBuild implementation
	 */
	private async transformCode(
		code: string,
		framework: Framework,
		files: Map<string, string>
	): Promise<string> {
		let transformed = code;

		// Basic transformations for now
		// This will be replaced with ESBuild

		// 1. Replace bare imports with CDN URLs
		transformed = this.replaceBareImports(transformed, framework);

		// 2. Remove export statements (for sandbox execution)
		transformed = this.removeExports(transformed);

		// 3. Add framework-specific wrapper
		transformed = this.addFrameworkWrapper(transformed, framework);

		return transformed;
	}

	/**
	 * Replace bare imports with CDN URLs
	 *
	 * Examples:
	 * - import React from 'react' → import React from 'https://esm.sh/react@18.2.0'
	 * - import { ref } from 'vue' → import { ref } from 'https://esm.sh/vue@3.3.4'
	 */
	private replaceBareImports(code: string, framework: Framework): string {
		const versionMap: Record<string, string> = {
			'react': '18.2.0',
			'react-dom': '18.2.0',
			'react-dom/client': '18.2.0',
			'vue': '3.3.4',
			'svelte': '4.0.0'
		};

		let transformed = code;

		// Replace each known package
		for (const [pkg, version] of Object.entries(versionMap)) {
			const importRegex = new RegExp(`from\\s+['"]${pkg}['"]`, 'g');
			transformed = transformed.replace(
				importRegex,
				`from 'https://esm.sh/${pkg}@${version}'`
			);
		}

		return transformed;
	}

	/**
	 * Remove export statements
	 *
	 * Converts:
	 * - export default function Component() → function Component()
	 * - export default Component → (remove)
	 * - export const foo = 'bar' → const foo = 'bar'
	 */
	private removeExports(code: string): string {
		let transformed = code;

		// Remove 'export default function'
		transformed = transformed.replace(/export\s+default\s+function\s+/g, 'function ');

		// Remove 'export default'
		transformed = transformed.replace(/export\s+default\s+/g, '');

		// Remove 'export' from named exports
		transformed = transformed.replace(/export\s+(const|let|var|function|class)\s+/g, '$1 ');

		return transformed;
	}

	/**
	 * Add framework-specific wrapper code
	 *
	 * This ensures the component renders correctly in the sandbox
	 */
	private addFrameworkWrapper(code: string, framework: Framework): string {
		switch (framework) {
			case 'react':
				return this.addReactWrapper(code);
			case 'vue':
				return this.addVueWrapper(code);
			case 'svelte':
				return this.addSvelteWrapper(code);
			case 'html':
				return code; // HTML doesn't need wrapper
			default:
				return code;
		}
	}

	/**
	 * Add React-specific wrapper
	 */
	private addReactWrapper(code: string): string {
		// Detect component name from code
		const componentName = this.detectComponentName(code) || 'Component';

		return `
${code}

// Auto-render
if (typeof ${componentName} !== 'undefined') {
	const root = ReactDOM.createRoot(document.getElementById('root'));
	root.render(React.createElement(${componentName}));
}
`;
	}

	/**
	 * Add Vue-specific wrapper
	 */
	private addVueWrapper(code: string): string {
		return `
${code}

// Auto-render
if (typeof Component !== 'undefined') {
	Vue.createApp(Component).mount('#root');
}
`;
	}

	/**
	 * Add Svelte-specific wrapper
	 */
	private addSvelteWrapper(code: string): string {
		return `
${code}

// Auto-render
if (typeof Component !== 'undefined') {
	new Component({ target: document.getElementById('root') });
}
`;
	}

	/**
	 * Detect component name from code
	 *
	 * Looks for:
	 * - function ComponentName()
	 * - const ComponentName =
	 * - class ComponentName
	 */
	private detectComponentName(code: string): string | null {
		// Try function declaration
		const functionMatch = code.match(/function\s+([A-Z][a-zA-Z0-9]*)\s*\(/);
		if (functionMatch) {
			return functionMatch[1];
		}

		// Try const/let/var declaration
		const constMatch = code.match(/(?:const|let|var)\s+([A-Z][a-zA-Z0-9]*)\s*=/);
		if (constMatch) {
			return constMatch[1];
		}

		// Try class declaration
		const classMatch = code.match(/class\s+([A-Z][a-zA-Z0-9]*)/);
		if (classMatch) {
			return classMatch[1];
		}

		return null;
	}

	/**
	 * Extract CDN URLs from bundled code
	 *
	 * Finds all esm.sh URLs in the code
	 */
	private extractCDNUrls(code: string, framework: Framework): string[] {
		const urls = new Set<string>();

		// Extract from import statements
		const importRegex = /from\s+['"]https:\/\/esm\.sh\/[^'"]+['"]/g;
		const matches = code.match(importRegex) || [];

		for (const match of matches) {
			const url = match.replace(/from\s+['"]/, '').replace(/['"]$/, '');
			urls.add(url);
		}

		// If no URLs found, add default CDNs for the framework
		if (urls.size === 0) {
			const config = this.parser.getFrameworkConfig(framework);
			config.defaultCDNs.forEach(url => urls.add(url));
		}

		return Array.from(urls);
	}
}
