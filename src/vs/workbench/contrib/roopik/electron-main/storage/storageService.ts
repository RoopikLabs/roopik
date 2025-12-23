/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import {
	IRoopikStorageService
} from '../../common/storage/storageService.js';
import {
	BundledOutput,
	CanvasInfo,
	WorkspaceConfig
} from '../../common/storage/storageTypes.js';
import { CanvasMeta } from '../../common/canvas/types.js';
import { WorkspaceStorage } from './workspaceStorage.js';
import { AppDataStorage } from './appDataStorage.js';
import {
	getWorkspaceRoopikPath,
	getWorkspaceAppDataPath,
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

	async listCanvases(): Promise<string[]> {
		return this.workspaceStorage.listCanvases();
	}

	async loadCanvasMeta(canvasId: string): Promise<CanvasMeta | null> {
		return this.workspaceStorage.loadCanvasMeta(canvasId);
	}

	async saveCanvasMeta(canvasId: string, meta: CanvasMeta): Promise<void> {
		return this.workspaceStorage.saveCanvasMeta(canvasId, meta);
	}

	// ========================================================================
	// Canvas File Operations (Metadata-Only Architecture)
	// ========================================================================

	async loadCanvasFile(canvasId: string) {
		return this.workspaceStorage.loadCanvasFile(canvasId);
	}

	async saveCanvasFile(canvasFile: any): Promise<void> {
		return this.workspaceStorage.saveCanvasFile(canvasFile);
	}

	async addComponentReference(canvasId: string, componentId: string, reference: any): Promise<void> {
		return this.workspaceStorage.addComponentReference(canvasId, componentId, reference);
	}

	async removeComponentReference(canvasId: string, componentId: string): Promise<void> {
		return this.workspaceStorage.removeComponentReference(canvasId, componentId);
	}

	async getComponentReference(canvasId: string, componentId: string) {
		return this.workspaceStorage.getComponentReference(canvasId, componentId);
	}

	async listCanvasComponents(canvasId: string) {
		return this.workspaceStorage.listCanvasComponents(canvasId);
	}

	async updateComponentReference(canvasId: string, componentId: string, updates: any): Promise<void> {
		return this.workspaceStorage.updateComponentReference(canvasId, componentId, updates);
	}

	async deleteComponent(canvasId: string, componentId: string): Promise<void> {
		return this.workspaceStorage.deleteComponent(canvasId, componentId);
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

	getCachePath(canvasId: string, componentId: string): string {
		return getCacheComponentPath(this.workspacePath, canvasId, componentId);
	}
}
