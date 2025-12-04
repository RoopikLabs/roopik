/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * LocalFileAdapter - Imports components from local filesystem
 *
 * This is the first adapter implementing IComponentImportAdapter.
 * Handles .tsx, .jsx, .vue, .svelte files from the local filesystem.
 *
 * Responsibilities:
 * - Validates file extensions
 * - Reads file content
 * - Scans for dependencies (.css, .js)
 * - Blocks component imports (must be self-contained)
 * - Resolves local dependencies
 * - Detects framework
 * - Copies to staging directory
 * - Manages _meta.json tracking
 * - Checks for duplicates
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ImportScanner } from '../../common/import/importScanner.js';
import { ComponentParser } from '../../common/sandboxPipeline/componentParser.js';
import type {
	IComponentImportAdapter,
	AdapterOptions,
	ImportResult,
	ImportSuccess,
	ImportError,
	ImportDuplicateError,
	ComponentMeta,
	DuplicateInfo
} from '../../common/import/importTypes.js';
import type { ComponentInput, Framework } from '../../common/sandboxPipeline/types.js';

/**
 * Supported file extensions for local file import
 */
const SUPPORTED_EXTENSIONS = ['.tsx', '.jsx', '.vue', '.svelte'];

/**
 * LocalFileAdapter - Implements IComponentImportAdapter for local files
 */
export class LocalFileAdapter implements IComponentImportAdapter {
	readonly id = 'local-file' as const;
	readonly displayName = 'Local Files';
	readonly supportedTypes = SUPPORTED_EXTENSIONS;

	private readonly scanner: ImportScanner;
	private readonly parser: ComponentParser;

	constructor(
		private readonly workspacePath: string,
		private readonly logService: ILogService
	) {
		this.scanner = new ImportScanner();
		this.parser = new ComponentParser();
	}

	/**
	 * Check if adapter can handle this source
	 */
	canHandle(source: string): boolean {
		// Local file adapter handles file paths with supported extensions
		const ext = path.extname(source).toLowerCase();
		return SUPPORTED_EXTENSIONS.includes(ext);
	}

	/**
	 * Check for duplicate import (same original path already imported)
	 */
	async checkForDuplicate(canvasId: string, source: string): Promise<DuplicateInfo | null> {
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
						if (meta.originalPath === source) {
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
			this.logService.warn(`[LocalFileAdapter] Error checking for duplicates: ${(err as Error).message}`);
		}

		return null;
	}

	/**
	 * Import a component from a local file path
	 */
	async import(source: string, options?: AdapterOptions): Promise<ImportResult> {
		const filePath = source;
		const canvasId = options?.canvasId;
		const forceReplace = options?.forceReplace ?? false;

		if (!canvasId) {
			return this.error('STAGING_ERROR', 'Canvas ID is required for import');
		}

		this.logService.info(`[LocalFileAdapter] Importing component: ${filePath}`);

		// 1. Validate file exists
		if (!existsSync(filePath)) {
			return this.error('FILE_NOT_FOUND', `File not found: ${filePath}`);
		}

		// 2. Check for duplicate (unless forceReplace is true)
		if (!forceReplace) {
			const duplicate = await this.checkForDuplicate(canvasId, filePath);
			if (duplicate) {
				this.logService.info(`[LocalFileAdapter] Duplicate found: ${duplicate.existingName}`);
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

		// 4. Read the file
		let code: string;
		try {
			code = await fs.readFile(filePath, 'utf-8');
		} catch (err) {
			return this.error('PARSE_ERROR', `Failed to read file: ${(err as Error).message}`);
		}

		// 5. Scan for imports
		const categorized = this.scanner.scanAndCategorize(code);

		// 6. Block if has component dependencies
		if (categorized.components.length > 0) {
			return this.error(
				'HAS_COMPONENT_DEPS',
				`Component imports other components: ${categorized.components.join(', ')}. Only self-contained components allowed.`,
				{ dependencies: categorized.components }
			);
		}

		// 7. Resolve local dependencies (.css, .js)
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

		// 8. Detect framework (use options override if provided)
		const framework: Framework = options?.framework ?? this.parser.detectFramework(files);

		// 9. Copy to staging directory
		const stagingPath = await this.copyToStaging(canvasId, componentName, files);
		if (!stagingPath) {
			return this.error('STAGING_ERROR', 'Failed to copy files to staging directory');
		}

		// 10. Create and save metadata
		const meta: ComponentMeta = {
			originalPath: filePath,
			importedAt: Date.now(),
			dependencies: [...categorized.css, ...categorized.js],
			framework,
			status: 'imported',
			canvasId
		};

		await this.saveComponentMeta(canvasId, componentName, meta);

		// 11. Create ComponentInput for pipeline
		const componentInput: ComponentInput = {
			id: `import-${componentName}-${Date.now()}`,
			source: 'import',
			framework,
			files,
			entryFile: options?.entryFile ?? mainFileName,
			dependencies: options?.dependencies
		};

		this.logService.info(`[LocalFileAdapter] Import successful: ${componentName} (${framework})`);

		const result: ImportSuccess = {
			success: true,
			componentInput,
			stagingPath,
			meta
		};

		// Add replace info if applicable
		if (forceReplace) {
			result.replaced = true;
			result.replacedName = componentName;
		}

		return result;
	}

	// ============================================
	// Private Helper Methods
	// ============================================

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
				// Ensure subdirectories exist (for imports like ./utils/helper.js)
				await fs.mkdir(path.dirname(filePath), { recursive: true });
				await fs.writeFile(filePath, content, 'utf-8');
			}

			return stagingDir;
		} catch (err) {
			this.logService.error(`[LocalFileAdapter] Failed to copy to staging: ${(err as Error).message}`);
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
	private error(code: ImportError['code'], message: string, details?: unknown): ImportError {
		this.logService.warn(`[LocalFileAdapter] ${code}: ${message}`);
		return { success: false, code, message, details };
	}
}
