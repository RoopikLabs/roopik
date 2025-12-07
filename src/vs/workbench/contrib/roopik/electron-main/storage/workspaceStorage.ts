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
import { CanvasMeta } from '../../common/canvas/types.js';
import {
	getWorkspaceRoopikPath,
	getConfigPath,
	getCanvasesFolderPath,
	getCanvasRegistryPath,
	getCanvasPath,
	getComponentsFolderPath,
	getComponentIndexPath,
	getComponentPath,
	getComponentMetaPath
} from './paths.js';

/**
 * Workspace Storage
 *
 * Handles all file operations in the .roopik/ folder:
 * - config.json: Workspace configuration
 * - canvases/canvases.json: Canvas registry
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
		console.log('[WorkspaceStorage] Initializing with workspace:', workspacePath);
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
		console.log('[WorkspaceStorage] Canvases folder path:', canvasesPath);
		await this.ensureDir(canvasesPath);

		// Create canvases/canvases.json if it doesn't exist
		const canvasRegistryPath = getCanvasRegistryPath(workspacePath);
		if (!await this.fileExists(canvasRegistryPath)) {
			const emptyIndex: CanvasIndex = { canvases: [] };
			await this.writeJson(canvasRegistryPath, emptyIndex);
		}

		this.initialized = true;
		console.log('[WorkspaceStorage] Initialized successfully');
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

		// Update canvas registry
		const canvasIndex = await this.getCanvasIndex();
		const now = Date.now();
		const canvasInfo: CanvasInfo = {
			id,
			name,
			createdAt: now,
			updatedAt: now
		};
		canvasIndex.canvases.push(canvasInfo);
		await this.writeJson(getCanvasRegistryPath(this.workspacePath), canvasIndex);
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

		// Update canvas registry
		const canvasIndex = await this.getCanvasIndex();
		canvasIndex.canvases = canvasIndex.canvases.filter(c => c.id !== canvasId);
		await this.writeJson(getCanvasRegistryPath(this.workspacePath), canvasIndex);
	}

	/**
	 * Update a canvas entry in the registry (canvases.json)
	 * Used when canvas name changes or any canvas update occurs
	 * Always updates the updatedAt timestamp
	 */
	async updateCanvasInRegistry(canvasId: string, updates: Partial<CanvasInfo>): Promise<void> {
		this.ensureInitialized();

		console.log('[WorkspaceStorage] updateCanvasInRegistry: updating canvas', canvasId, 'with', updates);

		const canvasIndex = await this.getCanvasIndex();
		const canvasEntry = canvasIndex.canvases.find(c => c.id === canvasId);

		if (canvasEntry) {
			// Update the entry with new values
			if (updates.name !== undefined) {
				canvasEntry.name = updates.name;
			}
			// Always update the updatedAt timestamp when any update occurs
			canvasEntry.updatedAt = Date.now();

			await this.writeJson(getCanvasRegistryPath(this.workspacePath), canvasIndex);
			console.log('[WorkspaceStorage] updateCanvasInRegistry: registry updated successfully');
		} else {
			console.log('[WorkspaceStorage] updateCanvasInRegistry: canvas not found in registry:', canvasId);
		}
	}

	/**
	 * List all canvas IDs from the canvas registry (canvases.json)
	 */
	async listCanvases(): Promise<string[]> {
		this.ensureInitialized();

		console.log('[WorkspaceStorage] listCanvases: reading from canvases.json');
		const canvasIndex = await this.getCanvasIndex();
		const canvasIds = canvasIndex.canvases.map(c => c.id);
		console.log('[WorkspaceStorage] listCanvases: found canvas IDs:', canvasIds);
		return canvasIds;
	}

	/**
	 * Load canvas metadata from meta.json
	 */
	async loadCanvasMeta(canvasId: string): Promise<CanvasMeta | null> {
		this.ensureInitialized();

		const canvasPath = getCanvasPath(this.workspacePath, canvasId);
		const metaPath = path.join(canvasPath, 'meta.json');
		console.log('[WorkspaceStorage] loadCanvasMeta: loading from', metaPath);

		try {
			const meta = await this.readJson<CanvasMeta>(metaPath);
			console.log('[WorkspaceStorage] loadCanvasMeta: loaded meta:', meta);
			return meta;
		} catch (err) {
			console.log('[WorkspaceStorage] loadCanvasMeta: meta.json not found, trying canvas index');
			// If meta.json doesn't exist, try to construct from canvas index
			const canvasIndex = await this.getCanvasIndex();
			const info = canvasIndex.canvases.find(c => c.id === canvasId);
			if (info) {
				// Create a minimal CanvasMeta from CanvasInfo
				const meta: CanvasMeta = {
					id: info.id,
					name: info.name,
					createdAt: info.createdAt,
					updatedAt: info.updatedAt || info.createdAt,
					componentCount: 0
				};
				console.log('[WorkspaceStorage] loadCanvasMeta: created meta from index:', meta);
				// Save it for future use
				await this.saveCanvasMeta(canvasId, meta);
				return meta;
			}
			console.log('[WorkspaceStorage] loadCanvasMeta: canvas not found in index');
			return null;
		}
	}

	/**
	 * Save canvas metadata to meta.json
	 * Also updates the canvas registry (canvases.json) to keep name in sync
	 */
	async saveCanvasMeta(canvasId: string, meta: CanvasMeta): Promise<void> {
		this.ensureInitialized();

		const canvasPath = getCanvasPath(this.workspacePath, canvasId);
		await this.ensureDir(canvasPath);

		const metaPath = path.join(canvasPath, 'meta.json');
		await this.writeJson(metaPath, meta);

		// Also update the canvas registry to keep names in sync
		await this.updateCanvasInRegistry(canvasId, { name: meta.name });
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
		const registryPath = getCanvasRegistryPath(this.workspacePath);
		console.log('[WorkspaceStorage] getCanvasIndex: reading from path:', registryPath);
		console.log('[WorkspaceStorage] getCanvasIndex: workspacePath is:', this.workspacePath);
		try {
			const content = await this.readFile(registryPath);
			console.log('[WorkspaceStorage] getCanvasIndex: raw file content:', content);
			const index = JSON.parse(content) as CanvasIndex;
			console.log('[WorkspaceStorage] getCanvasIndex: parsed index:', JSON.stringify(index));
			return index;
		} catch (err) {
			console.log('[WorkspaceStorage] getCanvasIndex: failed to read canvases.json, error:', err);
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
