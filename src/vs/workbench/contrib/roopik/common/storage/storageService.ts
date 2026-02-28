/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import {
	WorkspaceConfig,
	CanvasInfo,
	CanvasFile,
	ComponentReference
} from './storageTypes.js';
import { CanvasMeta } from '../canvas/types.js';

// ============================================================================
// Service Interface
// ============================================================================

export const IRoopikStorageService = createDecorator<IRoopikStorageService>('roopikStorageService');

/**
 * Storage Service Interface
 *
 * Manages all file storage for the component pipeline:
 * - Workspace storage (.roopik/): Source code, metadata, canvas layouts
 * - App data storage: Build cache, bundled code
 *
 * Design principles:
 * - All methods are async (file I/O)
 * - Clear separation between workspace and cache
 * - Minimal API surface
 */
export interface IRoopikStorageService {
	readonly _serviceBrand: undefined;

	// ========================================================================
	// Initialization
	// ========================================================================

	/**
	 * Initialize storage for a workspace
	 * Creates .roopik/ folder structure if it doesn't exist
	 * @param workspacePath Absolute path to workspace root
	 */
	initialize(workspacePath: string): Promise<void>;

	/**
	 * Check if storage is initialized for current workspace
	 */
	isInitialized(): boolean;

	// ========================================================================
	// Workspace Config
	// ========================================================================

	/**
	 * Get workspace configuration
	 */
	getConfig(): Promise<WorkspaceConfig>;

	/**
	 * Update workspace configuration
	 */
	updateConfig(updates: Partial<WorkspaceConfig>): Promise<void>;

	// ========================================================================
	// Canvas Operations
	// ========================================================================

	/**
	 * Create a new canvas
	 * @returns Canvas ID
	 */
	createCanvas(id: string, name: string): Promise<void>;

	/**
	 * Get all canvases
	 */
	getCanvases(): Promise<CanvasInfo[]>;

	/**
	 * Delete a canvas and all its components
	 */
	deleteCanvas(canvasId: string): Promise<void>;

	/**
	 * List all canvas IDs
	 */
	listCanvases(): Promise<string[]>;

	/**
	 * Load canvas metadata
	 */
	loadCanvasMeta(canvasId: string): Promise<CanvasMeta | null>;

	/**
	 * Save canvas metadata
	 */
	saveCanvasMeta(canvasId: string, meta: CanvasMeta): Promise<void>;

	// ========================================================================
	// Canvas File Operations (Metadata-Only Architecture)
	// ========================================================================

	/**
	 * Load canvas file with all component references
	 * Atomic read of entire canvas state
	 */
	loadCanvasFile(canvasId: string): Promise<CanvasFile | null>;

	/**
	 * Save canvas file with all component references
	 * Atomic write of entire canvas state
	 */
	saveCanvasFile(canvasFile: CanvasFile): Promise<void>;

	/**
	 * Add component reference to canvas (NO copying files!)
	 * Just stores metadata pointing to original location
	 */
	addComponentReference(
		canvasId: string,
		componentId: string,
		reference: ComponentReference
	): Promise<void>;

	/**
	 * Remove component reference from canvas
	 */
	removeComponentReference(canvasId: string, componentId: string): Promise<void>;

	/**
	 * Get single component reference
	 */
	getComponentReference(canvasId: string, componentId: string): Promise<ComponentReference | null>;

	/**
	 * List all component references in a canvas
	 */
	listCanvasComponents(canvasId: string): Promise<Array<{ id: string; reference: ComponentReference }>>;

	/**
	 * Update component reference (after build, when buildState/contentHash change)
	 */
	updateComponentReference(
		canvasId: string,
		componentId: string,
		updates: Partial<ComponentReference>
	): Promise<void>;

	/**
	 * Delete a component (removes reference from canvas file + Cache)
	 */
	deleteComponent(canvasId: string, componentId: string): Promise<void>;

	// ========================================================================
	// Build Cache (App Data Storage)
	// ========================================================================

	/**
	 * Save bundled code and build metadata to cache
	 */
	saveBundleCache(
		canvasId: string,
		componentId: string,
		bundle: { bundledCode: string; buildMeta: any }
	): Promise<void>;

	/**
	 * Load bundled code from cache
	 */
	loadBundleCache(
		canvasId: string,
		componentId: string
	): Promise<{ bundledCode: string; buildMeta: any } | null>;

	// ========================================================================
	// Active Canvas (for agents and UI)
	// ========================================================================

	/**
	 * Get the currently active/focused canvas ID
	 * Returns null if no canvas is open
	 */
	getActiveCanvasId(): Promise<string | null>;

	/**
	 * Set the active canvas ID in canvases.json
	 */
	setActiveCanvasId(canvasId: string | null): Promise<void>;

	// ========================================================================
	// Paths (for external use)
	// ========================================================================

	/**
	 * Get the actual workspace root path (where user's project lives)
	 * Use this for resolving relative paths from AI agents
	 */
	getWorkspaceRootPath(): string;

	/**
	 * Get workspace storage path (.roopik/)
	 */
	getWorkspacePath(): string;

	/**
	 * Get app data path (cache)
	 */
	getAppDataPath(): string;

	/**
	 * Get absolute path to component cache folder
	 */
	getCachePath(canvasId: string, componentId: string): string;
}
