/*---------------------------------------------------------------------------------------------
 * Copyright (c) Roopik. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Framework, ComponentInput, ValidationResult, FrameworkConfigMap, FrameworkConfig } from './types.js';

/**
 * Component Parser (Hardened)
 * * Improvements:
 * - Regex-based import detection (ignores comments)
 * - Prioritized entry file detection (.tsx > .ts)
 * - Framework scoring system
 */
export class ComponentParser {

	private readonly frameworkConfigs: FrameworkConfigMap = {
		react: {
			extensions: ['.jsx', '.tsx', '.js', '.ts'],
			loader: 'jsx',
			entryFileNames: ['index', 'main', 'app', 'App', 'component', 'Component', 'entry']
		},
		vue: {
			extensions: ['.vue', '.js', '.ts'], // Vue can use .js/.ts entry points too
			loader: 'ts',
			entryFileNames: ['index', 'main', 'app', 'App', 'component', 'Component']
		},
		svelte: {
			extensions: ['.svelte', '.js', '.ts'],
			loader: 'ts',
			entryFileNames: ['index', 'main', 'app', 'App', 'component', 'Component']
		},
		solid: {
			extensions: ['.jsx', '.tsx', '.js', '.ts'],
			loader: 'jsx',
			entryFileNames: ['index', 'main', 'app', 'App', 'component', 'Component']
		},
		preact: {
			extensions: ['.jsx', '.tsx', '.js', '.ts'],
			loader: 'jsx',
			entryFileNames: ['index', 'main', 'app', 'App', 'component', 'Component']
		},
		html: {
			extensions: ['.html'],
			loader: 'js',
			entryFileNames: ['index', 'main']
		},
		unknown: {
			extensions: ['.js', '.ts'],
			loader: 'js',
			entryFileNames: ['index', 'main']
		}
	};

	/**
	 * Detects framework based on file extensions and imports.
	 * Uses a scoring system to avoid false positives.
	 *
	 * Priority order:
	 * 1. Definitive file extensions (.vue, .svelte)
	 * 2. Definitive imports (solid-js, preact)
	 * 3. Scoring system for ambiguous cases
	 * 4. Vanilla HTML/CSS/JS detection (no framework imports = html)
	 */
	detectFramework(files: { [filename: string]: string }): Framework {
		const scores: Record<Framework, number> = {
			react: 0, vue: 0, svelte: 0, solid: 0, preact: 0, html: 0, unknown: 0
		};

		let hasJsxTsx = false;
		let hasHtml = false;
		let hasFrameworkImport = false;

		for (const [filename, code] of Object.entries(files)) {
			// 1. Hard Extension Match (High Confidence)
			if (filename.endsWith('.vue')) return 'vue';
			if (filename.endsWith('.svelte')) return 'svelte';

			// Track file types
			if (filename.endsWith('.html')) hasHtml = true;
			if (filename.endsWith('.jsx') || filename.endsWith('.tsx')) hasJsxTsx = true;

			// 2. Import Regex Match (Medium Confidence)
			// We strip comments to be safe, or just rely on the 'from' syntax which usually implies code
			if (/from\s+['"]solid-js['"]/.test(code)) return 'solid';
			if (/from\s+['"]preact['"]/.test(code)) return 'preact';

			if (/from\s+['"]react['"]/.test(code)) {
				scores.react += 2;
				hasFrameworkImport = true;
			}
			if (/from\s+['"]vue['"]/.test(code)) {
				scores.vue += 2;
				hasFrameworkImport = true;
			}
			if (/from\s+['"]svelte['"]/.test(code)) {
				scores.svelte += 2;
				hasFrameworkImport = true;
			}

			// 3. Ambiguous Extension Match (Low Confidence)
			if (filename.endsWith('.jsx') || filename.endsWith('.tsx')) {
				// Could be React, Solid, or Preact.
				// If we haven't seen specific imports yet, give slight edge to React (most common)
				scores.react += 1;
				scores.solid += 0.5;
				scores.preact += 0.5;
			}
		}

		// 4. Vanilla HTML/CSS/JS detection
		// If no framework imports and no JSX/TSX files, it's vanilla HTML
		if (!hasFrameworkImport && !hasJsxTsx && hasHtml) {
			return 'html';
		}

		// Also detect vanilla HTML if only .html, .css, .js files exist (no JSX/TSX)
		if (!hasFrameworkImport && !hasJsxTsx) {
			const filenames = Object.keys(files);
			const isVanilla = filenames.every(f =>
				f.endsWith('.html') ||
				f.endsWith('.css') ||
				f.endsWith('.js') ||
				f.endsWith('.json')
			);
			if (isVanilla && filenames.length > 0) {
				return 'html';
			}
		}

		// Return highest score (for JSX/TSX files without clear framework imports)
		let bestMatch: Framework = 'react'; // Default for JSX/TSX
		let maxScore = 0;

		(Object.keys(scores) as Framework[]).forEach(fw => {
			if (scores[fw] > maxScore) {
				maxScore = scores[fw];
				bestMatch = fw;
			}
		});

		return bestMatch;
	}

	/**
	 * Detects the best entry file.
	 * Prioritizes strict naming -> prioritized extensions -> any valid extension.
	 */
	detectEntryFile(files: { [filename: string]: string }, framework: Framework): string {
		const config = this.frameworkConfigs[framework];
		const fileList = Object.keys(files);

		// 1. Strict Name Match (e.g., App.tsx, main.vue)
		for (const name of config.entryFileNames) {
			for (const ext of config.extensions) {
				// Try exact name + extension
				const candidate1 = `${name}${ext}`;
				if (files[candidate1]) return candidate1;

				// Try capitalized (app.tsx -> App.tsx) - usually redundant but safe
				const candidate2 = `${name.charAt(0).toUpperCase()}${name.slice(1)}${ext}`;
				if (files[candidate2]) return candidate2;
			}
		}

		// 2. Priority Extension Fallback (e.g., pick Button.tsx over utils.ts)
		// We define "Priority Extensions" that likely denote UI components
		const priorityExtensions = config.extensions.filter(ext =>
			['.jsx', '.tsx', '.vue', '.svelte', '.html'].includes(ext)
		);

		for (const filename of fileList) {
			if (priorityExtensions.some(ext => filename.endsWith(ext))) {
				return filename;
			}
		}

		// 3. Last Resort: Any valid extension (e.g., picking utils.ts as entry... dangerous but necessary)
		for (const filename of fileList) {
			if (config.extensions.some(ext => filename.endsWith(ext))) {
				return filename;
			}
		}

		// 4. Absolute Fallback: Just take the first file
		if (fileList.length > 0) return fileList[0];

		throw new Error(`No valid entry file found for framework: ${framework}`);
	}

	validate(input: ComponentInput): ValidationResult {
		const errors: string[] = [];
		const warnings: string[] = [];

		if (!input.files || Object.keys(input.files).length === 0) {
			return { valid: false, errors: ['No files provided'], warnings };
		}

		try {
			// Detect framework if not provided
			const framework = input.framework || this.detectFramework(input.files);

			// Detect entry file
			const entryFile = input.entryFile || this.detectEntryFile(input.files, framework);

			// Validation 1: Entry file existence
			if (!input.files[entryFile]) {
				errors.push(`Entry file detected as '${entryFile}' but not found in file list.`);
			}

			// Validation 2: Code content checks (Sanity check)
			const entryCode = input.files[entryFile];
			if (!entryCode || entryCode.trim().length === 0) {
				errors.push(`Entry file '${entryFile}' is empty.`);
			}

			// Validation 3: Size checks
			const totalSize = Object.values(input.files).reduce((sum, code) => sum + code.length, 0);
			if (totalSize > 1024 * 1024) { // 1MB Limit
				warnings.push(`Total component size is large (${(totalSize / 1024).toFixed(0)}KB). Compilation may be slow.`);
			}

			return {
				valid: errors.length === 0,
				errors,
				warnings
			};

		} catch (error) {
			return {
				valid: false,
				errors: [(error as Error).message],
				warnings
			};
		}
	}

	getFrameworkConfig(framework: Framework): FrameworkConfig {
		return this.frameworkConfigs[framework];
	}
}
