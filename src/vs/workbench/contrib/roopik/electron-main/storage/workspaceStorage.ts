/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import {
	SourceFiles,
	ComponentMeta,
	CanvasInfo,
	CanvasIndex,
	ComponentIndex,
	ComponentIndexEntry,
	WorkspaceConfig,
	DEFAULT_WORKSPACE_CONFIG
} from '../../common/storage/storageTypes.js';
import {
	getWorkspaceRoopikPath,
	getConfigPath,
	getCanvasesFolderPath,
	getCanvasIndexPath,
	getCanvasPath,
	getComponentsFolderPath,
	getComponentIndexPath,
	getComponentPath,
	getComponentMetaPath
	// CANVAS_INDEX_FILE - TODO: Use when needed for direct file path construction
} from './paths.js';

/**
 * Workspace Storage
 *
 * Handles all file operations in the .roopik/ folder:
 * - config.json: Workspace configuration
 * - canvases/index.json: Canvas registry
 * - canvases/{id}/components/: Component source files
 * - canvases/{id}/components/index.json: Component registry
 * - canvases/{id}/components/{id}/meta.json: Component metadata
 * - canvases/{id}/components/{id}/*.tsx, *.css: Source files
 */
export class WorkspaceStorage {
	private workspacePath: string = '';
	private initialized: boolean = false;

	// ========================================================================
	// Initialization
	// ========================================================================

	/**
	 * Initialize workspace storage
	 * Creates .roopik/ folder structure if it doesn't exist
	 */
	async initialize(workspacePath: string): Promise<void> {
		this.workspacePath = workspacePath;

		// Create .roopik folder if it doesn't exist
		const roopikPath = getWorkspaceRoopikPath(workspacePath);
		await this.ensureDir(roopikPath);

		// Create config.json if it doesn't exist
		const configPath = getConfigPath(workspacePath);
		if (!await this.fileExists(configPath)) {
			await this.writeJson(configPath, DEFAULT_WORKSPACE_CONFIG);
		}

		// Create canvases folder if it doesn't exist
		const canvasesPath = getCanvasesFolderPath(workspacePath);
		await this.ensureDir(canvasesPath);

		// Create canvases/index.json if it doesn't exist
		const canvasIndexPath = getCanvasIndexPath(workspacePath);
		if (!await this.fileExists(canvasIndexPath)) {
			const emptyIndex: CanvasIndex = { canvases: [] };
			await this.writeJson(canvasIndexPath, emptyIndex);
		}

		this.initialized = true;
	}

	/**
	 * Check if storage is initialized
	 */
	isInitialized(): boolean {
		return this.initialized;
	}

	/**
	 * Get workspace path
	 */
	getWorkspacePath(): string {
		return this.workspacePath;
	}

	// ========================================================================
	// Config Operations
	// ========================================================================

	/**
	 * Read workspace configuration
	 */
	async getConfig(): Promise<WorkspaceConfig> {
		this.ensureInitialized();

		const configPath = getConfigPath(this.workspacePath);
		try {
			const config = await this.readJson<WorkspaceConfig>(configPath);
			// Merge with defaults to handle missing fields
			return { ...DEFAULT_WORKSPACE_CONFIG, ...config };
		} catch {
			return { ...DEFAULT_WORKSPACE_CONFIG };
		}
	}

	/**
	 * Update workspace configuration
	 */
	async updateConfig(updates: Partial<WorkspaceConfig>): Promise<void> {
		this.ensureInitialized();

		const configPath = getConfigPath(this.workspacePath);
		const currentConfig = await this.getConfig();
		const newConfig = { ...currentConfig, ...updates };
		await this.writeJson(configPath, newConfig);
	}

	// ========================================================================
	// Canvas Operations
	// ========================================================================

	/**
	 * Create a new canvas
	 */
	async createCanvas(id: string, name: string): Promise<void> {
		this.ensureInitialized();

		// Create canvas folder
		const canvasPath = getCanvasPath(this.workspacePath, id);
		await this.ensureDir(canvasPath);

		// Create components folder
		const componentsPath = getComponentsFolderPath(this.workspacePath, id);
		await this.ensureDir(componentsPath);

		// Create components/index.json
		const componentIndexPath = getComponentIndexPath(this.workspacePath, id);
		const emptyIndex: ComponentIndex = { components: {} };
		await this.writeJson(componentIndexPath, emptyIndex);

		// Update canvas index
		const canvasIndex = await this.getCanvasIndex();
		const canvasInfo: CanvasInfo = {
			id,
			name,
			createdAt: Date.now()
		};
		canvasIndex.canvases.push(canvasInfo);
		await this.writeJson(getCanvasIndexPath(this.workspacePath), canvasIndex);
	}

	/**
	 * Get all canvases
	 */
	async getCanvases(): Promise<CanvasInfo[]> {
		this.ensureInitialized();

		const canvasIndex = await this.getCanvasIndex();
		return canvasIndex.canvases;
	}

	/**
	 * Delete a canvas and all its contents
	 */
	async deleteCanvas(canvasId: string): Promise<void> {
		this.ensureInitialized();

		// Delete canvas folder recursively
		const canvasPath = getCanvasPath(this.workspacePath, canvasId);
		await this.removeDir(canvasPath);

		// Update canvas index
		const canvasIndex = await this.getCanvasIndex();
		canvasIndex.canvases = canvasIndex.canvases.filter(c => c.id !== canvasId);
		await this.writeJson(getCanvasIndexPath(this.workspacePath), canvasIndex);
	}

	// ========================================================================
	// Component Source Operations
	// ========================================================================

	/**
	 * Save component source files
	 */
	async saveComponentSource(
		canvasId: string,
		componentId: string,
		files: SourceFiles
	): Promise<string> {
		this.ensureInitialized();

		// Ensure component folder exists
		const componentPath = getComponentPath(this.workspacePath, canvasId, componentId);
		await this.ensureDir(componentPath);

		// Write each file
		for (const [filename, content] of Object.entries(files)) {
			const filePath = path.join(componentPath, filename);
			await this.writeFile(filePath, content);
		}

		return componentPath;
	}

	/**
	 * Load component source files
	 */
	async loadComponentSource(
		canvasId: string,
		componentId: string
	): Promise<SourceFiles> {
		this.ensureInitialized();

		const componentPath = getComponentPath(this.workspacePath, canvasId, componentId);

		// Check if folder exists
		if (!await this.dirExists(componentPath)) {
			return {};
		}

		// Read all files in the folder (except meta.json)
		const files: SourceFiles = {};
		const entries = await fs.promises.readdir(componentPath, { withFileTypes: true });

		for (const entry of entries) {
			if (entry.isFile() && entry.name !== 'meta.json') {
				const filePath = path.join(componentPath, entry.name);
				const content = await this.readFile(filePath);
				files[entry.name] = content;
			}
		}

		return files;
	}

	/**
	 * Save component metadata
	 */
	async saveComponentMeta(
		canvasId: string,
		componentId: string,
		meta: ComponentMeta
	): Promise<void> {
		this.ensureInitialized();

		const metaPath = getComponentMetaPath(this.workspacePath, canvasId, componentId);
		await this.writeJson(metaPath, meta);
	}

	/**
	 * Load component metadata
	 */
	async loadComponentMeta(
		canvasId: string,
		componentId: string
	): Promise<ComponentMeta | null> {
		this.ensureInitialized();

		const metaPath = getComponentMetaPath(this.workspacePath, canvasId, componentId);
		try {
			return await this.readJson<ComponentMeta>(metaPath);
		} catch {
			return null;
		}
	}

	/**
	 * Delete a component
	 */
	async deleteComponent(canvasId: string, componentId: string): Promise<void> {
		this.ensureInitialized();

		// Delete component folder
		const componentPath = getComponentPath(this.workspacePath, canvasId, componentId);
		await this.removeDir(componentPath);
	}

	// ========================================================================
	// Component Index Operations
	// ========================================================================

	/**
	 * Get component index for a canvas
	 */
	async getComponentIndex(canvasId: string): Promise<ComponentIndex> {
		this.ensureInitialized();

		const indexPath = getComponentIndexPath(this.workspacePath, canvasId);
		try {
			return await this.readJson<ComponentIndex>(indexPath);
		} catch {
			return { components: {} };
		}
	}

	/**
	 * Update a component in the index
	 */
	async updateComponentIndex(
		canvasId: string,
		componentId: string,
		entry: ComponentIndexEntry
	): Promise<void> {
		this.ensureInitialized();

		const index = await this.getComponentIndex(canvasId);
		index.components[componentId] = entry;

		const indexPath = getComponentIndexPath(this.workspacePath, canvasId);
		await this.writeJson(indexPath, index);
	}

	/**
	 * Remove a component from the index
	 */
	async removeFromComponentIndex(canvasId: string, componentId: string): Promise<void> {
		this.ensureInitialized();

		const index = await this.getComponentIndex(canvasId);
		delete index.components[componentId];

		const indexPath = getComponentIndexPath(this.workspacePath, canvasId);
		await this.writeJson(indexPath, index);
	}

	// ========================================================================
	// Private Helpers
	// ========================================================================

	private ensureInitialized(): void {
		if (!this.initialized) {
			throw new Error('WorkspaceStorage not initialized. Call initialize() first.');
		}
	}

	private async getCanvasIndex(): Promise<CanvasIndex> {
		const indexPath = getCanvasIndexPath(this.workspacePath);
		try {
			return await this.readJson<CanvasIndex>(indexPath);
		} catch {
			return { canvases: [] };
		}
	}

	private async ensureDir(dirPath: string): Promise<void> {
		await fs.promises.mkdir(dirPath, { recursive: true });
	}

	private async removeDir(dirPath: string): Promise<void> {
		try {
			await fs.promises.rm(dirPath, { recursive: true, force: true });
		} catch {
			// Ignore if already deleted
		}
	}

	private async fileExists(filePath: string): Promise<boolean> {
		try {
			await fs.promises.access(filePath, fs.constants.F_OK);
			return true;
		} catch {
			return false;
		}
	}

	private async dirExists(dirPath: string): Promise<boolean> {
		try {
			const stat = await fs.promises.stat(dirPath);
			return stat.isDirectory();
		} catch {
			return false;
		}
	}

	private async readFile(filePath: string): Promise<string> {
		return fs.promises.readFile(filePath, 'utf-8');
	}

	private async writeFile(filePath: string, content: string): Promise<void> {
		// Ensure parent directory exists
		await this.ensureDir(path.dirname(filePath));
		await fs.promises.writeFile(filePath, content, 'utf-8');
	}

	private async readJson<T>(filePath: string): Promise<T> {
		const content = await this.readFile(filePath);
		return JSON.parse(content) as T;
	}

	private async writeJson<T>(filePath: string, data: T): Promise<void> {
		const content = JSON.stringify(data, null, 2);
		await this.writeFile(filePath, content);
	}
}
