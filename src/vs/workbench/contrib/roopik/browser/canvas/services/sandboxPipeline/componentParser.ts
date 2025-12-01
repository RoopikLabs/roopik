/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Framework, ComponentInput, ValidationResult, FrameworkConfigMap } from './types.js';

/**
 * Component Parser Service
 *
 * Responsible for:
 * - Auto-detecting framework from component files
 * - Auto-detecting entry file
 * - Validating component structure
 */
export class ComponentParser {

	/**
	 * Framework configurations
	 */
	private readonly frameworkConfigs: FrameworkConfigMap = {
		react: {
			extensions: ['.jsx', '.tsx', '.js', '.ts'],
			loader: 'jsx',
			defaultCDNs: [
				'https://esm.sh/react@18.2.0',
				'https://esm.sh/react-dom@18.2.0'
			],
			entryFileNames: ['index', 'main', 'app', 'App', 'component', 'Component']
		},
		vue: {
			extensions: ['.vue'],
			loader: 'ts',
			defaultCDNs: [
				'https://esm.sh/vue@3.3.4'
			],
			entryFileNames: ['index', 'main', 'app', 'App', 'component', 'Component']
		},
		svelte: {
			extensions: ['.svelte'],
			loader: 'ts',
			defaultCDNs: [
				'https://esm.sh/svelte@4.0.0'
			],
			entryFileNames: ['index', 'main', 'app', 'App', 'component', 'Component']
		},
		html: {
			extensions: ['.html'],
			loader: 'js',
			defaultCDNs: [],
			entryFileNames: ['index', 'main']
		}
	};

	/**
	 * Auto-detect framework from component files
	 *
	 * Detection logic:
	 * 1. Check file extensions (.vue, .svelte, .html)
	 * 2. Check file content for framework-specific patterns
	 * 3. Default to React if ambiguous
	 */
	detectFramework(files: Map<string, string>): Framework {
		for (const [filename, code] of files) {
			// Vue SFC (Single File Component)
			if (filename.endsWith('.vue')) {
				return 'vue';
			}

			// Svelte
			if (filename.endsWith('.svelte')) {
				return 'svelte';
			}

			// HTML
			if (filename.endsWith('.html')) {
				return 'html';
			}

			// React (check for JSX/TSX or React imports)
			if (filename.endsWith('.jsx') || filename.endsWith('.tsx')) {
				return 'react';
			}

			// Check code content for React patterns
			if (code.includes('import React') ||
				code.includes('from "react"') ||
				code.includes("from 'react'") ||
				code.includes('React.createElement')) {
				return 'react';
			}
		}

		// Default to React if no clear framework detected
		return 'react';
	}

	/**
	 * Auto-detect entry file based on framework
	 *
	 * Detection logic:
	 * 1. Look for common entry file names (index, main, app, etc.)
	 * 2. Look for files with framework-specific extensions
	 * 3. Return first matching file
	 */
	detectEntryFile(files: Map<string, string>, framework: Framework): string {
		const config = this.frameworkConfigs[framework];

		// First, try common entry file names with framework extensions
		for (const name of config.entryFileNames) {
			for (const ext of config.extensions) {
				const filename = name + ext;
				if (files.has(filename)) {
					return filename;
				}

				// Also try capitalized versions
				const capitalizedFilename = name.charAt(0).toUpperCase() + name.slice(1) + ext;
				if (files.has(capitalizedFilename)) {
					return capitalizedFilename;
				}
			}
		}

		// Fallback: return first file with matching extension
		for (const [filename] of files) {
			if (config.extensions.some(ext => filename.endsWith(ext))) {
				return filename;
			}
		}

		// If still not found, throw error
		throw new Error(`No entry file found for framework: ${framework}. Expected extensions: ${config.extensions.join(', ')}`);
	}

	/**
	 * Validate component structure
	 *
	 * Checks:
	 * - At least one file provided
	 * - Entry file exists
	 * - Framework can be detected
	 */
	validate(input: ComponentInput): ValidationResult {
		const errors: string[] = [];
		const warnings: string[] = [];

		// Check if files are provided
		if (!input.files || input.files.size === 0) {
			errors.push('No files provided');
			return { valid: false, errors, warnings };
		}

		try {
			// Detect framework
			const framework = input.framework || this.detectFramework(input.files);

			// Detect entry file
			const entryFile = input.entryFile || this.detectEntryFile(input.files, framework);

			// Check if entry file exists
			if (!input.files.has(entryFile)) {
				errors.push(`Entry file not found: ${entryFile}`);
			}

			// Check file sizes (warn if too large)
			for (const [filename, code] of input.files) {
				const sizeKB = code.length / 1024;
				if (sizeKB > 500) {
					warnings.push(`File ${filename} is large (${sizeKB.toFixed(0)}KB). Consider splitting into smaller files.`);
				}
			}

			// Check total size
			const totalSize = Array.from(input.files.values()).reduce((sum, code) => sum + code.length, 0);
			const totalSizeKB = totalSize / 1024;
			if (totalSizeKB > 1000) {
				warnings.push(`Total component size is large (${totalSizeKB.toFixed(0)}KB). This may impact performance.`);
			}

		} catch (error) {
			errors.push((error as Error).message);
		}

		return {
			valid: errors.length === 0,
			errors,
			warnings
		};
	}

	/**
	 * Get framework configuration
	 */
	getFrameworkConfig(framework: Framework) {
		return this.frameworkConfigs[framework];
	}
}
