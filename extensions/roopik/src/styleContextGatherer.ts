/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Style Context Gatherer
 * Finds related CSS/style files for AI context enhancement
 *
 * Philosophy:
 * - Modular strategy-based design
 * - High-to-low probability ordering
 * - Easy to add/remove/reorder strategies
 * - VS Code API for remote workspace compatibility
 * - Let LLM do the heavy lifting of understanding patterns
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { Logger } from './logger';

/**
 * Related file found during context gathering
 */
export interface RelatedStyleFile {
	path: string;
	relativePath: string;
	language: string;
	content: string;
	type: 'inline' | 'css-module' | 'stylesheet' | 'scss' | 'sass' | 'less' | 'config' | 'framework-hint';
	strategy: string; // Which strategy found this file (for debugging)
}

/**
 * Style context for AI
 */
export interface StyleContext {
	relatedFiles: RelatedStyleFile[];
}

/**
 * Options for style context gathering
 */
export interface StyleContextOptions {
	enabled: boolean;
	maxFileSize?: number;  // Max file size in bytes (default: 100KB)
	maxFiles?: number;     // Max number of files to include (default: 5)
}

/**
 * Strategy function type
 * Returns array of file URIs to include
 */
type GatherStrategy = (componentUri: vscode.Uri, workspaceRoot: vscode.Uri) => Promise<vscode.Uri[]>;

/**
 * Style Context Gatherer
 * Uses modular strategies to find related style files
 */
export class StyleContextGatherer {
	private workspaceRoot: vscode.Uri;
	private logger: ReturnType<typeof Logger.prototype.createScoped>;

	/**
	 * Gathering strategies (HIGH to LOW probability)
	 *
	 * ORDER MATTERS! Reorder these to change priority.
	 * Comment out a strategy to disable it.
	 * Add new strategies at appropriate priority level.
	 */
	private strategies: Array<{ name: string; fn: GatherStrategy }> = [
		// Strategy 1: Co-located CSS Module (HIGHEST PROBABILITY)
		// Example: Button.tsx → Button.module.css
		{ name: 'co-located-css-module', fn: this.findCoLocatedCSSModule.bind(this) },

		// Strategy 2: Co-located Stylesheet (HIGH PROBABILITY)
		// Example: Button.tsx → Button.css, Button.scss
		{ name: 'co-located-stylesheet', fn: this.findCoLocatedStylesheet.bind(this) },

		// Strategy 3: Common directory-level styles (MEDIUM PROBABILITY)
		// Example: index.css, styles.css in same directory
		{ name: 'common-directory-styles', fn: this.findCommonDirectoryStyles.bind(this) },

		// Strategy 4: Parent directory global styles (MEDIUM PROBABILITY)
		// Example: ../global.css, ../App.css
		{ name: 'parent-global-styles', fn: this.findParentGlobalStyles.bind(this) },

		// Strategy 5: Tailwind config (FRAMEWORK SPECIFIC)
		// Example: tailwind.config.js at workspace root
		{ name: 'tailwind-config', fn: this.findTailwindConfig.bind(this) },

		// Strategy 6: MUI/Theme config (FRAMEWORK SPECIFIC)
		// Example: src/theme.ts, src/theme/index.ts
		{ name: 'theme-config', fn: this.findThemeConfig.bind(this) },

		// Strategy 7: Root-level global CSS (LOW PROBABILITY, but common)
		// Example: src/index.css, src/globals.css
		{ name: 'root-global-css', fn: this.findRootGlobalCSS.bind(this) },

		// Strategy 8: Package.json framework hints (METADATA)
		// Not a file, but provides hints about frameworks used
		{ name: 'package-json-hints', fn: this.findPackageJsonHints.bind(this) }
	];

	constructor(workspaceRoot: vscode.Uri, logger?: Logger) {
		this.workspaceRoot = workspaceRoot;
		// Create scoped logger for this component
		const loggerInstance = logger || Logger.getInstance();
		this.logger = loggerInstance.createScoped('StyleContext');
	}

	/**
	 * MAIN ENTRY POINT
	 * Gather style context for a clicked element
	 *
	 * @param componentFilePath - Absolute path to component file (e.g., /workspace/src/Button.tsx)
	 * @param options - Gathering options (from config)
	 * @returns Style context with related files
	 */
	public async gatherContext(
		componentFilePath: string,
		options: StyleContextOptions = { enabled: true }
	): Promise<StyleContext> {
		// If disabled, return empty context
		if (!options.enabled) {
			this.logger.info('Disabled, skipping context gathering');
			return { relatedFiles: [] };
		}

		const maxFileSize = options.maxFileSize || 100 * 1024; // 100KB
		const maxFiles = options.maxFiles || 5;

		this.logger.info(`Gathering context for: ${componentFilePath}`);

		const componentUri = vscode.Uri.file(componentFilePath);
		const foundUris = new Set<string>(); // Deduplication
		const relatedFiles: RelatedStyleFile[] = [];

		// Execute strategies in order (high to low probability)
		for (const strategy of this.strategies) {
			// Stop if we've gathered enough files
			if (relatedFiles.length >= maxFiles) {
				this.logger.debug(`Reached maxFiles limit (${maxFiles}), stopping`);
				break;
			}

			try {
				this.logger.debug(`Executing strategy: ${strategy.name}`);
				const uris = await strategy.fn(componentUri, this.workspaceRoot);

				for (const uri of uris) {
					// Deduplication check
					if (foundUris.has(uri.fsPath)) {
						this.logger.trace(`Skipping duplicate: ${uri.fsPath}`);
						continue;
					}

					// Stop if reached max files
					if (relatedFiles.length >= maxFiles) break;

					// Read and validate file
					const fileInfo = await this.readStyleFile(uri, componentUri, maxFileSize, strategy.name);
					if (fileInfo) {
						foundUris.add(uri.fsPath);
						relatedFiles.push(fileInfo);
						this.logger.info(`✓ Found via ${strategy.name}: ${fileInfo.relativePath}`);
					}
				}
			} catch (error) {
				this.logger.error(`Strategy ${strategy.name} failed`, error);
				// Continue with next strategy
			}
		}

		this.logger.info(`Gathered ${relatedFiles.length} related files`);
		return { relatedFiles };
	}

	// ========================================================================
	// STRATEGY IMPLEMENTATIONS
	// ========================================================================

	/**
	 * Strategy 1: Co-located CSS Module
	 * Button.tsx → Button.module.css, Button.module.scss
	 */
	private async findCoLocatedCSSModule(componentUri: vscode.Uri): Promise<vscode.Uri[]> {
		const dir = vscode.Uri.joinPath(componentUri, '..');
		const baseName = path.basename(componentUri.fsPath, path.extname(componentUri.fsPath));

		const candidates = [
			vscode.Uri.joinPath(dir, `${baseName}.module.css`),
			vscode.Uri.joinPath(dir, `${baseName}.module.scss`),
			vscode.Uri.joinPath(dir, `${baseName}.module.sass`),
			vscode.Uri.joinPath(dir, `${baseName}.module.less`)
		];

		return this.filterExistingFiles(candidates);
	}

	/**
	 * Strategy 2: Co-located Stylesheet
	 * Button.tsx → Button.css, Button.scss
	 */
	private async findCoLocatedStylesheet(componentUri: vscode.Uri): Promise<vscode.Uri[]> {
		const dir = vscode.Uri.joinPath(componentUri, '..');
		const baseName = path.basename(componentUri.fsPath, path.extname(componentUri.fsPath));

		const candidates = [
			vscode.Uri.joinPath(dir, `${baseName}.css`),
			vscode.Uri.joinPath(dir, `${baseName}.scss`),
			vscode.Uri.joinPath(dir, `${baseName}.sass`),
			vscode.Uri.joinPath(dir, `${baseName}.less`)
		];

		return this.filterExistingFiles(candidates);
	}

	/**
	 * Strategy 3: Common directory-level styles
	 * index.css, styles.css in same directory
	 */
	private async findCommonDirectoryStyles(componentUri: vscode.Uri): Promise<vscode.Uri[]> {
		const dir = vscode.Uri.joinPath(componentUri, '..');

		const candidates = [
			vscode.Uri.joinPath(dir, 'index.css'),
			vscode.Uri.joinPath(dir, 'index.scss'),
			vscode.Uri.joinPath(dir, 'styles.css'),
			vscode.Uri.joinPath(dir, 'styles.scss'),
			vscode.Uri.joinPath(dir, 'style.css'),
			vscode.Uri.joinPath(dir, 'style.scss')
		];

		return this.filterExistingFiles(candidates);
	}

	/**
	 * Strategy 4: Parent directory global styles
	 * ../global.css, ../App.css
	 */
	private async findParentGlobalStyles(componentUri: vscode.Uri): Promise<vscode.Uri[]> {
		const parentDir = vscode.Uri.joinPath(componentUri, '..', '..');

		const candidates = [
			vscode.Uri.joinPath(parentDir, 'global.css'),
			vscode.Uri.joinPath(parentDir, 'globals.css'),
			vscode.Uri.joinPath(parentDir, 'App.css'),
			vscode.Uri.joinPath(parentDir, 'app.css'),
			vscode.Uri.joinPath(parentDir, 'main.css')
		];

		return this.filterExistingFiles(candidates);
	}

	/**
	 * Strategy 5: Tailwind config
	 * tailwind.config.js at workspace root
	 */
	private async findTailwindConfig(_componentUri: vscode.Uri, workspaceRoot: vscode.Uri): Promise<vscode.Uri[]> {
		const candidates = [
			vscode.Uri.joinPath(workspaceRoot, 'tailwind.config.js'),
			vscode.Uri.joinPath(workspaceRoot, 'tailwind.config.ts'),
			vscode.Uri.joinPath(workspaceRoot, 'tailwind.config.cjs')
		];

		return this.filterExistingFiles(candidates);
	}

	/**
	 * Strategy 6: MUI/Theme config
	 * src/theme.ts, src/theme/index.ts
	 */
	private async findThemeConfig(_componentUri: vscode.Uri, workspaceRoot: vscode.Uri): Promise<vscode.Uri[]> {
		const candidates = [
			vscode.Uri.joinPath(workspaceRoot, 'src', 'theme.ts'),
			vscode.Uri.joinPath(workspaceRoot, 'src', 'theme.js'),
			vscode.Uri.joinPath(workspaceRoot, 'src', 'theme', 'index.ts'),
			vscode.Uri.joinPath(workspaceRoot, 'src', 'theme', 'index.js')
		];

		// Only include ONE theme file (avoid duplicates)
		for (const candidate of candidates) {
			try {
				await vscode.workspace.fs.stat(candidate);
				return [candidate]; // Return first found
			} catch {
				// File doesn't exist, continue
			}
		}

		return [];
	}

	/**
	 * Strategy 7: Root-level global CSS
	 * src/index.css, src/globals.css, src/App.css
	 */
	private async findRootGlobalCSS(_componentUri: vscode.Uri, workspaceRoot: vscode.Uri): Promise<vscode.Uri[]> {
		const candidates = [
			vscode.Uri.joinPath(workspaceRoot, 'src', 'index.css'),
			vscode.Uri.joinPath(workspaceRoot, 'src', 'globals.css'),
			vscode.Uri.joinPath(workspaceRoot, 'src', 'global.css'),
			vscode.Uri.joinPath(workspaceRoot, 'src', 'App.css'),
			vscode.Uri.joinPath(workspaceRoot, 'src', 'app.css'),
			vscode.Uri.joinPath(workspaceRoot, 'src', 'main.css')
		];

		return this.filterExistingFiles(candidates);
	}

	/**
	 * Strategy 8: Package.json framework hints
	 * Returns virtual file with framework/styling metadata
	 */
	private async findPackageJsonHints(_componentUri: vscode.Uri, workspaceRoot: vscode.Uri): Promise<vscode.Uri[]> {
		// This strategy returns a special "virtual file" with hints
		// It's handled specially in readStyleFile()
		const packageJsonUri = vscode.Uri.joinPath(workspaceRoot, 'package.json');

		try {
			await vscode.workspace.fs.stat(packageJsonUri);
			return [packageJsonUri]; // Return package.json URI (special handling below)
		} catch {
			return [];
		}
	}

	// ========================================================================
	// HELPER METHODS
	// ========================================================================

	/**
	 * Filter list of URIs to only existing files
	 */
	private async filterExistingFiles(uris: vscode.Uri[]): Promise<vscode.Uri[]> {
		const existing: vscode.Uri[] = [];

		for (const uri of uris) {
			try {
				await vscode.workspace.fs.stat(uri);
				existing.push(uri);
			} catch {
				// File doesn't exist, skip
			}
		}

		return existing;
	}

	/**
	 * Read style file and create RelatedStyleFile object
	 * Uses VS Code API for remote workspace compatibility
	 */
	private async readStyleFile(
		fileUri: vscode.Uri,
		componentUri: vscode.Uri,
		maxFileSize: number,
		strategyName: string
	): Promise<RelatedStyleFile | null> {
		try {
			// Special handling for package.json (framework hints)
			if (fileUri.fsPath.endsWith('package.json')) {
				return this.createFrameworkHintsFile(fileUri, componentUri, strategyName);
			}

			// Check file size (VS Code API)
			const stat = await vscode.workspace.fs.stat(fileUri);
			if (stat.size > maxFileSize) {
				this.logger.warn(`File too large, skipping: ${fileUri.fsPath} (${stat.size} bytes)`);
				return null;
			}

			// Read content (VS Code API)
			const contentBytes = await vscode.workspace.fs.readFile(fileUri);
			const content = Buffer.from(contentBytes).toString('utf8');

			// Determine file type and language
			const ext = path.extname(fileUri.fsPath);
			let type: RelatedStyleFile['type'];
			let language: string;

			if (fileUri.fsPath.includes('.module.')) {
				type = 'css-module';
				language = ext === '.scss' || ext === '.sass' ? 'scss' : 'css';
			} else if (fileUri.fsPath.includes('tailwind.config') || fileUri.fsPath.includes('theme')) {
				type = 'config';
				language = ext === '.ts' ? 'typescript' : 'javascript';
			} else {
				type = 'stylesheet';
				language = ext === '.scss' ? 'scss' : ext === '.sass' ? 'sass' : ext === '.less' ? 'less' : 'css';
			}

			// Calculate relative path (for display)
			const componentDir = vscode.Uri.joinPath(componentUri, '..');
			const relativePath = path.relative(componentDir.fsPath, fileUri.fsPath);

			return {
				path: fileUri.fsPath,
				relativePath,
				language,
				content,
				type,
				strategy: strategyName
			};
		} catch (error) {
			this.logger.error(`Error reading file: ${fileUri.fsPath}`, error);
			return null;
		}
	}

	/**
	 * Create a special "framework hints" file from package.json analysis
	 */
	private async createFrameworkHintsFile(
		packageJsonUri: vscode.Uri,
		_componentUri: vscode.Uri,
		strategyName: string
	): Promise<RelatedStyleFile | null> {
		try {
			// Read package.json
			const contentBytes = await vscode.workspace.fs.readFile(packageJsonUri);
			const packageJson = JSON.parse(Buffer.from(contentBytes).toString('utf8'));

			const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

			// Detect frameworks
			const frameworks: string[] = [];
			if (deps['react']) frameworks.push('react');
			if (deps['vue']) frameworks.push('vue');
			if (deps['@angular/core']) frameworks.push('angular');
			if (deps['svelte']) frameworks.push('svelte');
			if (deps['solid-js']) frameworks.push('solid');
			if (deps['vite']) frameworks.push('vite');
			if (deps['next']) frameworks.push('next');

			// Detect styling approaches
			const styling: string[] = [];
			if (deps['tailwindcss']) styling.push('tailwind');
			if (deps['@mui/material']) styling.push('mui');
			if (deps['@chakra-ui/react']) styling.push('chakra');
			if (deps['styled-components']) styling.push('styled-components');
			if (deps['@emotion/react']) styling.push('emotion');
			if (deps['sass'] || deps['node-sass']) styling.push('sass');
			if (deps['less']) styling.push('less');

			// Check TypeScript
			const isTypeScript = !!(deps['typescript'] || packageJson.devDependencies?.['typescript']);

			// Create hint content as JSON
			const hintContent = JSON.stringify({
				frameworks,
				styling,
				isTypeScript
			}, null, 2);

			return {
				path: packageJsonUri.fsPath,
				relativePath: 'package.json',
				language: 'json',
				content: hintContent,
				type: 'framework-hint',
				strategy: strategyName
			};
		} catch (error) {
			this.logger.error('Error reading package.json', error);
			return null;
		}
	}
}
