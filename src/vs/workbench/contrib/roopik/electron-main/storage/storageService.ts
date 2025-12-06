/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import {
	IRoopikStorageService
} from '../../common/storage/storageService.js';
import {
	SourceFiles,
	ComponentMeta,
	BundledOutput,
	CanvasInfo,
	ComponentIndex,
	ComponentIndexEntry,
	WorkspaceConfig
} from '../../common/storage/storageTypes.js';
import { WorkspaceStorage } from './workspaceStorage.js';
import { AppDataStorage } from './appDataStorage.js';
import {
	getWorkspaceRoopikPath,
	getWorkspaceAppDataPath,
	getComponentPath,
	getCacheComponentPath
} from './paths.js';

/**
 * Roopik Storage Service
 *
 * Main service that combines workspace storage and app data storage.
 * Implements IRoopikStorageService interface.
 *
 * Responsibilities:
 * - Coordinate between workspace and cache storage
 * - Ensure both storages are in sync
 * - Provide unified API for all storage operations
 * - Track active canvas for agents and UI
 */
export class RoopikStorageService implements IRoopikStorageService {
	declare readonly _serviceBrand: undefined;

	private readonly workspaceStorage: WorkspaceStorage;
	private readonly appDataStorage: AppDataStorage;
	private workspacePath: string = '';

	// Active canvas tracking
	private _activeCanvasId: string | null = null;

	constructor() {
		this.workspaceStorage = new WorkspaceStorage();
		this.appDataStorage = new AppDataStorage();
	}

	// ========================================================================
	// Initialization
	// ========================================================================

	async initialize(workspacePath: string): Promise<void> {
		this.workspacePath = workspacePath;

		// Initialize both storages
		await this.workspaceStorage.initialize(workspacePath);
		await this.appDataStorage.initialize(workspacePath);
	}

	isInitialized(): boolean {
		return this.workspaceStorage.isInitialized() && this.appDataStorage.isInitialized();
	}

	// ========================================================================
	// Workspace Config
	// ========================================================================

	async getConfig(): Promise<WorkspaceConfig> {
		return this.workspaceStorage.getConfig();
	}

	async updateConfig(updates: Partial<WorkspaceConfig>): Promise<void> {
		return this.workspaceStorage.updateConfig(updates);
	}

	// ========================================================================
	// Canvas Operations
	// ========================================================================

	async createCanvas(id: string, name: string): Promise<void> {
		// Create in workspace
		await this.workspaceStorage.createCanvas(id, name);

		// Create cache folder
		await this.appDataStorage.ensureCanvasCache(id);
	}

	async getCanvases(): Promise<CanvasInfo[]> {
		return this.workspaceStorage.getCanvases();
	}

	async deleteCanvas(canvasId: string): Promise<void> {
		// Delete from workspace
		await this.workspaceStorage.deleteCanvas(canvasId);

		// Delete from cache
		await this.appDataStorage.deleteCanvasCache(canvasId);
	}

	// ========================================================================
	// Component Source (Workspace)
	// ========================================================================

	async saveComponentSource(
		canvasId: string,
		componentId: string,
		files: SourceFiles
	): Promise<string> {
		return this.workspaceStorage.saveComponentSource(canvasId, componentId, files);
	}

	async loadComponentSource(
		canvasId: string,
		componentId: string
	): Promise<SourceFiles> {
		return this.workspaceStorage.loadComponentSource(canvasId, componentId);
	}

	async saveComponentMeta(
		canvasId: string,
		componentId: string,
		meta: ComponentMeta
	): Promise<void> {
		return this.workspaceStorage.saveComponentMeta(canvasId, componentId, meta);
	}

	async loadComponentMeta(
		canvasId: string,
		componentId: string
	): Promise<ComponentMeta | null> {
		return this.workspaceStorage.loadComponentMeta(canvasId, componentId);
	}

	async deleteComponent(canvasId: string, componentId: string): Promise<void> {
		// Delete from workspace
		await this.workspaceStorage.deleteComponent(canvasId, componentId);

		// Remove from index
		await this.workspaceStorage.removeFromComponentIndex(canvasId, componentId);

		// Delete from cache
		await this.appDataStorage.invalidateCache(canvasId, componentId);
	}

	// ========================================================================
	// Component Index
	// ========================================================================

	async getComponentIndex(canvasId: string): Promise<ComponentIndex> {
		return this.workspaceStorage.getComponentIndex(canvasId);
	}

	async updateComponentIndex(
		canvasId: string,
		componentId: string,
		entry: ComponentIndexEntry
	): Promise<void> {
		return this.workspaceStorage.updateComponentIndex(canvasId, componentId, entry);
	}

	async removeFromComponentIndex(canvasId: string, componentId: string): Promise<void> {
		return this.workspaceStorage.removeFromComponentIndex(canvasId, componentId);
	}

	// ========================================================================
	// Build Cache (App Data)
	// ========================================================================

	async saveBundleCache(
		canvasId: string,
		componentId: string,
		bundle: BundledOutput
	): Promise<void> {
		return this.appDataStorage.saveBundleCache(canvasId, componentId, bundle);
	}

	async loadBundleCache(
		canvasId: string,
		componentId: string
	): Promise<BundledOutput | null> {
		return this.appDataStorage.loadBundleCache(canvasId, componentId);
	}

	async isCacheValid(
		canvasId: string,
		componentId: string,
		sourceHash: string
	): Promise<boolean> {
		return this.appDataStorage.isCacheValid(canvasId, componentId, sourceHash);
	}

	async invalidateCache(canvasId: string, componentId: string): Promise<void> {
		return this.appDataStorage.invalidateCache(canvasId, componentId);
	}

	// ========================================================================
	// Active Canvas
	// ========================================================================

	async getActiveCanvasId(): Promise<string | null> {
		// TODO: In Phase 7 (Browser Client), this will call:
		// await vscode.commands.executeCommand('roopik.canvas.getActive')
		// For now, return cached value
		return this._activeCanvasId;
	}

	setActiveCanvasId(canvasId: string | null): void {
		// TODO: Later, whenver any canvas is created or deleted or focused, this will be called to update the cached value
		this._activeCanvasId = canvasId;
	}

	// ========================================================================
	// Paths
	// ========================================================================

	getWorkspacePath(): string {
		return getWorkspaceRoopikPath(this.workspacePath);
	}

	getAppDataPath(): string {
		return getWorkspaceAppDataPath(this.workspacePath);
	}

	getComponentPath(canvasId: string, componentId: string): string {
		return getComponentPath(this.workspacePath, canvasId, componentId);
	}

	getCachePath(canvasId: string, componentId: string): string {
		return getCacheComponentPath(this.workspacePath, canvasId, componentId);
	}
}
