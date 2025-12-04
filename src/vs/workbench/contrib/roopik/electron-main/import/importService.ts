/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Import Service (Main Process)
 *
 * Handles importing components from external files into the Canvas staging area.
 * - Validates file extensions
 * - Scans for dependencies
 * - Copies files to staging directory
 * - Manages _meta.json tracking
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ImportScanner } from '../../common/import/importScanner.js';
import { ComponentParser } from '../../common/sandboxPipeline/componentParser.js';
import type {
	ImportRequest,
	ImportResult,
	ImportSuccess,
	ImportError,
	ComponentMeta,
	ComponentStatus,
	ExportRequest,
	ExportResult,
	IImportService
} from '../../common/import/importTypes.js';
import type { ComponentInput, Framework } from '../../common/sandboxPipeline/types.js';

/**
 * Supported file extensions for import
 */
const SUPPORTED_EXTENSIONS = ['.tsx', '.jsx', '.vue', '.svelte'];

/**
 * ImportService implementation for main process
 */
export class ImportService implements IImportService {
	private readonly scanner: ImportScanner;
	private readonly parser: ComponentParser;

	constructor(
		private readonly workspacePath: string,
		@ILogService private readonly logService: ILogService
	) {
		this.scanner = new ImportScanner();
		this.parser = new ComponentParser();
	}

	/**
	 * Import a component from a file path
	 */
	async importComponent(request: ImportRequest): Promise<ImportResult> {
		const { path: filePath, canvasId } = request;

		this.logService.info(`[ImportService] Importing component: ${filePath}`);

		// 1. Validate file exists
		if (!existsSync(filePath)) {
			return this.error('FILE_NOT_FOUND', `File not found: ${filePath}`);
		}

		// 2. Validate extension
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
		const categorized = this.scanner.scanAndCategorize(code);

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
		const framework = this.parser.detectFramework(files);

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

		this.logService.info(`[ImportService] Import successful: ${componentName} (${framework})`);

		return {
			success: true,
			componentInput,
			stagingPath,
			meta
		};
	}

	/**
	 * Export a component from staging
	 */
	async exportComponent(request: ExportRequest): Promise<ExportResult> {
		const { canvasId, componentName, mode, targetPath } = request;

		const stagingDir = this.getStagingDir(canvasId, componentName);
		if (!existsSync(stagingDir)) {
			return { success: false, message: `Component not found in staging: ${componentName}` };
		}

		const meta = await this.getComponentMeta(canvasId, componentName);
		if (!meta) {
			return { success: false, message: `Component metadata not found: ${componentName}` };
		}

		try {
			switch (mode) {
				case 'replace': {
					// Copy back to original location
					const destPath = meta.originalPath;
					await this.copyFromStaging(canvasId, componentName, path.dirname(destPath));
					await this.updateComponentStatus(canvasId, componentName, 'exported');
					return { success: true, message: `Exported to ${destPath}`, path: destPath };
				}

				case 'saveas': {
					if (!targetPath) {
						return { success: false, message: 'Target path required for saveas mode' };
					}
					await this.copyFromStaging(canvasId, componentName, targetPath);
					await this.updateComponentStatus(canvasId, componentName, 'exported');
					return { success: true, message: `Saved to ${targetPath}`, path: targetPath };
				}

				case 'clipboard': {
					// Read main file content
					const mainFile = await this.getMainFileContent(canvasId, componentName);
					if (!mainFile) {
						return { success: false, message: 'Failed to read main file' };
					}
					// Note: Actual clipboard copy happens in browser process
					return { success: true, message: 'Code copied to clipboard' };
				}

				default:
					return { success: false, message: `Unknown export mode: ${mode}` };
			}
		} catch (err) {
			return { success: false, message: `Export failed: ${(err as Error).message}` };
		}
	}

	/**
	 * Update component status
	 */
	async updateComponentStatus(canvasId: string, componentName: string, status: ComponentStatus): Promise<void> {
		const meta = await this.getComponentMeta(canvasId, componentName);
		if (!meta) {
			return;
		}

		meta.status = status;
		if (status === 'modified') {
			meta.modifiedAt = Date.now();
		} else if (status === 'exported') {
			meta.exportedAt = Date.now();
		}

		await this.saveComponentMeta(canvasId, componentName, meta);
	}

	/**
	 * Get component metadata
	 */
	async getComponentMeta(canvasId: string, componentName: string): Promise<ComponentMeta | null> {
		const metaPath = path.join(this.getStagingDir(canvasId, componentName), '_meta.json');

		try {
			const content = await fs.readFile(metaPath, 'utf-8');
			return JSON.parse(content) as ComponentMeta;
		} catch {
			return null;
		}
	}

	/**
	 * List all components in staging
	 */
	async listStagedComponents(canvasId: string): Promise<ComponentMeta[]> {
		const componentsDir = path.join(this.getRoopikDir(), canvasId, 'components');

		if (!existsSync(componentsDir)) {
			return [];
		}

		const metas: ComponentMeta[] = [];

		try {
			const entries = await fs.readdir(componentsDir, { withFileTypes: true });

			for (const entry of entries) {
				if (entry.isDirectory()) {
					const meta = await this.getComponentMeta(canvasId, entry.name);
					if (meta) {
						metas.push(meta);
					}
				}
			}
		} catch {
			// Directory doesn't exist or can't be read
		}

		return metas;
	}

	/**
	 * Delete a staged component
	 */
	async deleteStagedComponent(canvasId: string, componentName: string): Promise<boolean> {
		const stagingDir = this.getStagingDir(canvasId, componentName);

		try {
			await fs.rm(stagingDir, { recursive: true, force: true });
			return true;
		} catch {
			return false;
		}
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
			this.logService.error(`[ImportService] Failed to copy to staging: ${(err as Error).message}`);
			return null;
		}
	}

	/**
	 * Copy files from staging to target directory
	 */
	private async copyFromStaging(canvasId: string, componentName: string, targetDir: string): Promise<void> {
		const stagingDir = this.getStagingDir(canvasId, componentName);

		const entries = await fs.readdir(stagingDir, { withFileTypes: true });

		for (const entry of entries) {
			// Skip _meta.json
			if (entry.name === '_meta.json') {
				continue;
			}

			const srcPath = path.join(stagingDir, entry.name);
			const destPath = path.join(targetDir, entry.name);

			if (entry.isDirectory()) {
				await fs.cp(srcPath, destPath, { recursive: true });
			} else {
				await fs.copyFile(srcPath, destPath);
			}
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
	 * Get main file content from staging
	 */
	private async getMainFileContent(canvasId: string, componentName: string): Promise<string | null> {
		const stagingDir = this.getStagingDir(canvasId, componentName);

		try {
			const entries = await fs.readdir(stagingDir);

			// Find main component file (not _meta.json, not .css/.js support files)
			const mainFile = entries.find(f =>
				SUPPORTED_EXTENSIONS.some(ext => f.endsWith(ext))
			);

			if (!mainFile) {
				return null;
			}

			return await fs.readFile(path.join(stagingDir, mainFile), 'utf-8');
		} catch {
			return null;
		}
	}

	/**
	 * Create an error result
	 */
	private error(code: ImportError['code'], message: string, details?: unknown): ImportError {
		this.logService.warn(`[ImportService] ${code}: ${message}`);
		return { success: false, code, message, details };
	}
}
