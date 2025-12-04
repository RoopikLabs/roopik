/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * ImportHandler - Handles importing components from external files
 *
 * This is the extension-side import logic that:
 * - Validates file extensions
 * - Scans for dependencies
 * - Copies files to staging directory
 * - Creates ComponentInput for the sandbox pipeline
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import { Logger } from './Logger';
import type { ComponentInput, Framework } from '../types/pipeline';

// ============================================
// Types
// ============================================

export type ComponentStatus = 'imported' | 'modified' | 'exported';

export type ImportErrorCode =
	| 'UNSUPPORTED_FORMAT'
	| 'FOLDER_NOT_ALLOWED'
	| 'HAS_COMPONENT_DEPS'
	| 'MISSING_DEP'
	| 'PARSE_ERROR'
	| 'STAGING_ERROR'
	| 'FILE_NOT_FOUND'
	| 'DUPLICATE_COMPONENT';

export interface ComponentMeta {
	originalPath: string;
	importedAt: number;
	dependencies: string[];
	framework: Framework;
	status: ComponentStatus;
	canvasId: string;
	sandboxId?: string;
	exportedAt?: number;
	modifiedAt?: number;
}

export interface ImportRequest {
	path: string;
	canvasId: string;
	position?: { x: number; y: number };
}

export interface ImportSuccess {
	success: true;
	componentInput: ComponentInput;
	stagingPath: string;
	meta: ComponentMeta;
	/** If true, this import replaced an existing component */
	replaced?: boolean;
	/** Name of the component that was replaced */
	replacedName?: string;
}

export interface DuplicateInfo {
	isDuplicate: true;
	existingName: string;
	existingMeta: ComponentMeta;
}

export interface ImportError {
	success: false;
	code: ImportErrorCode;
	message: string;
	details?: unknown;
}

export interface ImportDuplicateError extends ImportError {
	code: 'DUPLICATE_COMPONENT';
	duplicateInfo: DuplicateInfo;
}

export type ImportResult = ImportSuccess | ImportError | ImportDuplicateError;

export interface CategorizedImports {
	css: string[];
	js: string[];
	components: string[];
	packages: string[];
}

// ============================================
// ImportHandler
// ============================================

const SUPPORTED_EXTENSIONS = ['.tsx', '.jsx', '.vue', '.svelte'];

export class ImportHandler {
	private readonly logger = Logger.getInstance().createScoped('ImportHandler');
	private workspacePath: string = '';

	/**
	 * Initialize with workspace path
	 */
	initialize(workspacePath: string): void {
		this.workspacePath = workspacePath;
		this.logger.info('Initialized', { workspacePath });
	}

	/**
	 * Check if a component from this path is already imported
	 */
	async checkForDuplicate(canvasId: string, originalPath: string): Promise<DuplicateInfo | null> {
		const componentsDir = path.join(this.getRoopikDir(), canvasId, 'components');

		if (!existsSync(componentsDir)) {
			return null;
		}

		try {
			const entries = await fs.readdir(componentsDir, { withFileTypes: true });

			for (const entry of entries) {
				if (entry.isDirectory()) {
					const metaPath = path.join(componentsDir, entry.name, '_meta.json');
					if (existsSync(metaPath)) {
						const metaContent = await fs.readFile(metaPath, 'utf-8');
						const meta = JSON.parse(metaContent) as ComponentMeta;

						// Check if same original path
						if (meta.originalPath === originalPath) {
							return {
								isDuplicate: true,
								existingName: entry.name,
								existingMeta: meta
							};
						}
					}
				}
			}
		} catch (err) {
			this.logger.warn(`Error checking for duplicates: ${(err as Error).message}`);
		}

		return null;
	}

	/**
	 * Import a component from a file path
	 * @param request Import request
	 * @param forceReplace If true, skip duplicate check and replace existing
	 */
	async importComponent(request: ImportRequest, forceReplace: boolean = false): Promise<ImportResult> {
		const { path: filePath, canvasId } = request;

		this.logger.info(`Importing component: ${filePath}`);

		// 1. Validate file exists
		if (!existsSync(filePath)) {
			return this.error('FILE_NOT_FOUND', `File not found: ${filePath}`);
		}

		// 2. Check for duplicate (unless forceReplace is true)
		if (!forceReplace) {
			const duplicate = await this.checkForDuplicate(canvasId, filePath);
			if (duplicate) {
				this.logger.info(`Duplicate found: ${duplicate.existingName}`);
				return {
					success: false,
					code: 'DUPLICATE_COMPONENT',
					message: `Component "${duplicate.existingName}" already imported from this file`,
					duplicateInfo: duplicate
				} as ImportDuplicateError;
			}
		}

		// 3. Validate extension
		const ext = path.extname(filePath).toLowerCase();
		if (!SUPPORTED_EXTENSIONS.includes(ext)) {
			return this.error(
				'UNSUPPORTED_FORMAT',
				`Only ${SUPPORTED_EXTENSIONS.join(', ')} files supported. Got: ${ext}`
			);
		}

		// 3. Read the file
		let code: string;
		try {
			code = await fs.readFile(filePath, 'utf-8');
		} catch (err) {
			return this.error('PARSE_ERROR', `Failed to read file: ${(err as Error).message}`);
		}

		// 4. Scan for imports
		const categorized = this.scanAndCategorize(code);

		// 5. Block if has component dependencies
		if (categorized.components.length > 0) {
			return this.error(
				'HAS_COMPONENT_DEPS',
				`Component imports other components: ${categorized.components.join(', ')}. Only self-contained components allowed.`,
				{ dependencies: categorized.components }
			);
		}

		// 6. Resolve local dependencies (.css, .js)
		const componentDir = path.dirname(filePath);
		const componentName = path.basename(filePath, ext);
		const files: Record<string, string> = {};

		// Add main file
		const mainFileName = path.basename(filePath);
		files[mainFileName] = code;

		// Resolve CSS dependencies
		for (const cssImport of categorized.css) {
			const result = await this.resolveDependency(componentDir, cssImport);
			if (!result.success) {
				return this.error('MISSING_DEP', result.error!);
			}
			files[cssImport] = result.content!;
		}

		// Resolve JS dependencies
		for (const jsImport of categorized.js) {
			const result = await this.resolveDependency(componentDir, jsImport);
			if (!result.success) {
				return this.error('MISSING_DEP', result.error!);
			}
			files[jsImport] = result.content!;
		}

		// 7. Detect framework
		const framework = this.detectFramework(files, ext);

		// 8. Copy to staging directory
		const stagingPath = await this.copyToStaging(canvasId, componentName, files);
		if (!stagingPath) {
			return this.error('STAGING_ERROR', 'Failed to copy files to staging directory');
		}

		// 9. Create and save metadata
		const meta: ComponentMeta = {
			originalPath: filePath,
			importedAt: Date.now(),
			dependencies: [...categorized.css, ...categorized.js],
			framework,
			status: 'imported',
			canvasId
		};

		await this.saveComponentMeta(canvasId, componentName, meta);

		// 10. Create ComponentInput for pipeline
		const componentInput: ComponentInput = {
			id: `import-${componentName}-${Date.now()}`,
			source: 'import',
			framework,
			files,
			entryFile: mainFileName
		};

		this.logger.info(`Import successful: ${componentName} (${framework})`);

		return {
			success: true,
			componentInput,
			stagingPath,
			meta
		};
	}

	/**
	 * Scan code for imports and categorize them
	 */
	private scanAndCategorize(code: string): CategorizedImports {
		const imports = this.scanImports(code);
		return this.categorizeImports(imports);
	}

	/**
	 * Scan for all import statements
	 */
	private scanImports(code: string): string[] {
		const imports: string[] = [];

		// ES6 import patterns
		const es6Pattern = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s*,?\s*)*\s*from\s*['"]([^'"]+)['"]/g;
		const sideEffectPattern = /import\s+['"]([^'"]+)['"]/g;
		const dynamicPattern = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

		// CommonJS require pattern
		const requirePattern = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

		// CSS @import pattern
		const cssImportPattern = /@import\s+['"]([^'"]+)['"]/g;

		// Collect all matches
		const patterns = [es6Pattern, sideEffectPattern, dynamicPattern, requirePattern, cssImportPattern];

		for (const pattern of patterns) {
			let match;
			while ((match = pattern.exec(code)) !== null) {
				const importPath = match[1];
				if (importPath && !imports.includes(importPath)) {
					imports.push(importPath);
				}
			}
		}

		return imports;
	}

	/**
	 * Categorize imports by type
	 */
	private categorizeImports(imports: string[]): CategorizedImports {
		const result: CategorizedImports = {
			css: [],
			js: [],
			components: [],
			packages: []
		};

		for (const imp of imports) {
			// Skip node: protocol
			if (imp.startsWith('node:')) {
				continue;
			}

			// Check if it's a relative import
			const isRelative = imp.startsWith('./') || imp.startsWith('../');

			if (!isRelative) {
				// Package import (npm)
				result.packages.push(imp);
				continue;
			}

			// Get extension
			const ext = path.extname(imp).toLowerCase();

			// Categorize by extension
			if (ext === '.css' || ext === '.scss' || ext === '.less') {
				result.css.push(imp);
			} else if (ext === '.tsx' || ext === '.jsx' || ext === '.vue' || ext === '.svelte') {
				result.components.push(imp);
			} else if (ext === '.js' || ext === '.ts' || ext === '.mjs') {
				result.js.push(imp);
			} else if (!ext) {
				// No extension - could be JS/TS or component
				// Check if it looks like a component (PascalCase)
				const basename = path.basename(imp);
				if (/^[A-Z]/.test(basename)) {
					result.components.push(imp);
				} else {
					result.js.push(imp);
				}
			}
		}

		return result;
	}

	/**
	 * Detect framework from files
	 */
	private detectFramework(files: Record<string, string>, mainExt: string): Framework {
		const mainCode = Object.values(files)[0] || '';

		// Vue single file component
		if (mainExt === '.vue') {
			return 'vue';
		}

		// Svelte component
		if (mainExt === '.svelte') {
			return 'svelte';
		}

		// React detection
		if (mainCode.includes('from \'react\'') || mainCode.includes('from "react"')) {
			return 'react';
		}

		// JSX/TSX default to React
		if (mainExt === '.tsx' || mainExt === '.jsx') {
			return 'react';
		}

		// Default
		return 'vanilla';
	}

	/**
	 * Resolve a local dependency file
	 */
	private async resolveDependency(
		baseDir: string,
		importPath: string
	): Promise<{ success: boolean; content?: string; error?: string }> {
		// Try direct path first
		let resolvedPath = path.resolve(baseDir, importPath);

		// If no extension, try common extensions
		if (!path.extname(importPath)) {
			const extensions = ['.ts', '.js', '.mjs'];
			for (const ext of extensions) {
				const tryPath = resolvedPath + ext;
				if (existsSync(tryPath)) {
					resolvedPath = tryPath;
					break;
				}
			}
		}

		try {
			if (!existsSync(resolvedPath)) {
				return { success: false, error: `Dependency not found: ${importPath}` };
			}

			const content = await fs.readFile(resolvedPath, 'utf-8');
			return { success: true, content };
		} catch (err) {
			return { success: false, error: `Failed to read dependency ${importPath}: ${(err as Error).message}` };
		}
	}

	/**
	 * Get .roopik directory path
	 */
	private getRoopikDir(): string {
		return path.join(this.workspacePath, '.roopik');
	}

	/**
	 * Get staging directory for a component
	 */
	private getStagingDir(canvasId: string, componentName: string): string {
		return path.join(this.getRoopikDir(), canvasId, 'components', componentName);
	}

	/**
	 * Copy files to staging directory
	 */
	private async copyToStaging(
		canvasId: string,
		componentName: string,
		files: Record<string, string>
	): Promise<string | null> {
		const stagingDir = this.getStagingDir(canvasId, componentName);

		try {
			// Create staging directory
			await fs.mkdir(stagingDir, { recursive: true });

			// Write each file
			for (const [filename, content] of Object.entries(files)) {
				const filePath = path.join(stagingDir, filename);
				// Ensure subdirectories exist
				await fs.mkdir(path.dirname(filePath), { recursive: true });
				await fs.writeFile(filePath, content, 'utf-8');
			}

			return stagingDir;
		} catch (err) {
			this.logger.error(`Failed to copy to staging: ${(err as Error).message}`);
			return null;
		}
	}

	/**
	 * Save component metadata
	 */
	private async saveComponentMeta(canvasId: string, componentName: string, meta: ComponentMeta): Promise<void> {
		const metaPath = path.join(this.getStagingDir(canvasId, componentName), '_meta.json');
		await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
	}

	/**
	 * Create an error result
	 */
	private error(code: ImportErrorCode, message: string, details?: unknown): ImportError {
		this.logger.warn(`${code}: ${message}`);
		return { success: false, code, message, details };
	}
}
