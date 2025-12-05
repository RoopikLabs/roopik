/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Import Service (Main Process) - ORCHESTRATOR
 *
 * This is the main orchestrator for the Import Pipeline using the Adapter Pattern.
 * It coordinates between:
 * - ImportAdapterRegistry (manages available adapters)
 * - Individual adapters (LocalFileAdapter, GitHubAdapter, etc.)
 * - Export functionality
 *
 * Architecture:
 * ```
 * ImportService (Orchestrator)
 *      │
 *      ├── ImportAdapterRegistry
 *      │       ├── LocalFileAdapter
 *      │       ├── GitHubAdapter (future)
 *      │       ├── FigmaAdapter (future)
 *      │       └── UILibraryAdapter (future)
 *      │
 *      └── Export functionality
 * ```
 *
 * Key principle: Extension passes path, Core handles everything.
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ImportAdapterRegistry } from './importAdapterRegistry.js';
import { LocalFileAdapter } from './localFileAdapter.js';
import type {
	ImportRequest,
	ImportResult,
	ImportError,
	ComponentMeta,
	ComponentStatus,
	ExportRequest,
	ExportResult,
	IImportService,
	AdapterOptions,
	AdapterSourceType
} from '../../common/import/importTypes.js';

/**
 * Supported file extensions for import (used by export)
 */
const SUPPORTED_EXTENSIONS = ['.tsx', '.jsx', '.vue', '.svelte'];

/**
 * ImportService - Orchestrator using Adapter Pattern
 *
 * This service coordinates imports from various sources by delegating
 * to the appropriate adapter based on the source type.
 */
export class ImportService implements IImportService {
	private readonly registry: ImportAdapterRegistry;

	constructor(
		private readonly workspacePath: string,
		private readonly logService: ILogService
	) {
		// Initialize adapter registry
		this.registry = new ImportAdapterRegistry();

		// Register built-in adapters
		this.registerBuiltInAdapters();
	}

	/**
	 * Register built-in adapters
	 */
	private registerBuiltInAdapters(): void {
		// Register LocalFileAdapter
		this.registry.register(new LocalFileAdapter(this.workspacePath, this.logService));

		// Future adapters will be registered here:
		// this.registry.register(new GitHubAdapter(httpService, this.logService));
		// this.registry.register(new FigmaAdapter(figmaService, this.logService));
		// this.registry.register(new UILibraryAdapter(libraryService, this.logService));

		this.logService.info(`[ImportService] Registered ${this.registry.getAdapterIds().length} adapters`);
	}

	/**
	 * Get the adapter registry (for external registration)
	 */
	getRegistry(): ImportAdapterRegistry {
		return this.registry;
	}

	/**
	 * Get available import sources for UI (source picker)
	 */
	getAvailableSources(): { id: AdapterSourceType; displayName: string }[] {
		return this.registry.getAdapterDisplayNames();
	}

	/**
	 * Import a component from a source path/URL
	 *
	 * This method delegates to the appropriate adapter based on the source.
	 * The adapter handles all validation, file reading, dependency resolution,
	 * and staging.
	 */
	async importComponent(request: ImportRequest): Promise<ImportResult> {
		const { path: source, canvasId, position: _position } = request;
		const forceReplace = (request as ImportRequest & { forceReplace?: boolean }).forceReplace ?? false;

		this.logService.info(`[ImportService] Import request: ${source} -> canvas: ${canvasId}`);

		// Find adapter that can handle this source
		const adapter = this.registry.findAdapter(source);

		if (!adapter) {
			this.logService.warn(`[ImportService] No adapter found for: ${source}`);
			return this.error(
				'ADAPTER_NOT_FOUND',
				`No import adapter found for this source. Supported types: ${this.registry.getAllAdapters().flatMap(a => a.supportedTypes).join(', ')}`
			);
		}

		this.logService.info(`[ImportService] Using adapter: ${adapter.displayName} (${adapter.id})`);

		// Build adapter options
		const options: AdapterOptions = {
			canvasId,
			forceReplace
		};

		// Delegate to adapter
		const result = await adapter.import(source, options);

		if (result.success) {
			this.logService.info(`[ImportService] Import successful via ${adapter.id}: ${result.componentInput.id}`);
		} else {
			this.logService.warn(`[ImportService] Import failed via ${adapter.id}: ${result.code} - ${result.message}`);
		}

		return result;
	}

	/**
	 * Import with specific adapter (bypass auto-detection)
	 */
	async importWithAdapter(
		adapterId: AdapterSourceType,
		source: string,
		options?: AdapterOptions
	): Promise<ImportResult> {
		const adapter = this.registry.getAdapter(adapterId);

		if (!adapter) {
			return this.error('ADAPTER_NOT_FOUND', `Adapter not found: ${adapterId}`);
		}

		return adapter.import(source, options);
	}

	/**
	 * Check for duplicate before import
	 */
	async checkForDuplicate(source: string, canvasId: string): Promise<import('../../common/import/importTypes.js').DuplicateInfo | null> {
		const adapter = this.registry.findAdapter(source);

		if (!adapter || !adapter.checkForDuplicate) {
			return null;
		}

		return adapter.checkForDuplicate(canvasId, source);
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

	// Note: resolveDependency and copyToStaging are now in LocalFileAdapter
	// ImportService delegates import logic to adapters

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
