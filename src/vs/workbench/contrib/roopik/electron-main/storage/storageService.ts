/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import {
	IRoopikStorageService
} from '../../common/storage/storageService.js';
import type { BundledOutput, CanvasInfo, WorkspaceConfig } from '../../common/storage/storageTypes.js';
import type { CanvasMeta } from '../../common/canvas/types.js';
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
		// Delete from cache
		await this.invalidateCache(canvasId, componentId);
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

	/**
	 * Check if cache is valid for given source hash
	 */
	async isCacheValid(
		canvasId: string,
		componentId: string,
		contentHash: string
	): Promise<boolean> {
		return this.appDataStorage.isCacheValid(canvasId, componentId, contentHash);
	}

	/**
	 * Invalidate cache for a component
	 */
	async invalidateCache(canvasId: string, componentId: string): Promise<void> {
		return this.appDataStorage.invalidateCache(canvasId, componentId);
	}

	// ========================================================================
	// Active Canvas
	// ========================================================================

	/**
	 * Get the active canvas ID from canvases.json
	 */
	async getActiveCanvasId(): Promise<string | null> {
		return this.workspaceStorage.getActiveCanvasId();
	}

	/**
	 * Set the active canvas ID in canvases.json (called by Extension when focus changes)
	 */
	async setActiveCanvasId(canvasId: string | null): Promise<void> {
		return this.workspaceStorage.setActiveCanvasId(canvasId);
	}

	// ========================================================================
	// Paths
	// ========================================================================

	getWorkspaceRootPath(): string {
		return this.workspacePath;
	}

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
