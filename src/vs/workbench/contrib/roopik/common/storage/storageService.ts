/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import {
	SourceFiles,
	ComponentMeta,
	BundledOutput,
	CanvasInfo,
	ComponentIndex,
	ComponentIndexEntry,
	WorkspaceConfig
} from './storageTypes.js';

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

	// ========================================================================
	// Component Source (Workspace)
	// ========================================================================

	/**
	 * Save component source files to workspace
	 * Creates component folder if it doesn't exist
	 * @returns Absolute path to component folder
	 */
	saveComponentSource(
		canvasId: string,
		componentId: string,
		files: SourceFiles
	): Promise<string>;

	/**
	 * Load component source files from workspace
	 */
	loadComponentSource(
		canvasId: string,
		componentId: string
	): Promise<SourceFiles>;

	/**
	 * Save component metadata
	 */
	saveComponentMeta(
		canvasId: string,
		componentId: string,
		meta: ComponentMeta
	): Promise<void>;

	/**
	 * Load component metadata
	 */
	loadComponentMeta(
		canvasId: string,
		componentId: string
	): Promise<ComponentMeta | null>;

	/**
	 * Delete a component (workspace + cache)
	 */
	deleteComponent(canvasId: string, componentId: string): Promise<void>;

	// ========================================================================
	// Component Index (Fast Lookup)
	// ========================================================================

	/**
	 * Get component index for a canvas
	 */
	getComponentIndex(canvasId: string): Promise<ComponentIndex>;

	/**
	 * Update a component in the index
	 */
	updateComponentIndex(
		canvasId: string,
		componentId: string,
		entry: ComponentIndexEntry
	): Promise<void>;

	/**
	 * Remove a component from the index
	 */
	removeFromComponentIndex(canvasId: string, componentId: string): Promise<void>;

	// ========================================================================
	// Build Cache (App Data)
	// ========================================================================

	/**
	 * Save bundled code to cache
	 */
	saveBundleCache(
		canvasId: string,
		componentId: string,
		bundle: BundledOutput
	): Promise<void>;

	/**
	 * Load bundled code from cache
	 * @returns null if cache doesn't exist or is invalid
	 */
	loadBundleCache(
		canvasId: string,
		componentId: string
	): Promise<BundledOutput | null>;

	/**
	 * Check if cache is valid for given source hash
	 */
	isCacheValid(
		canvasId: string,
		componentId: string,
		sourceHash: string
	): Promise<boolean>;

	/**
	 * Invalidate cache for a component
	 */
	invalidateCache(canvasId: string, componentId: string): Promise<void>;

	// ========================================================================
	// Active Canvas (for agents and UI)
	// ========================================================================

	/**
	 * Get the currently active/focused canvas ID
	 * Returns null if no canvas is open
	 */
	getActiveCanvasId(): Promise<string | null>;

	/**
	 * Set the active canvas ID (called by Extension when focus changes)
	 */
	setActiveCanvasId(canvasId: string | null): void;

	// ========================================================================
	// Paths (for external use)
	// ========================================================================

	/**
	 * Get workspace root path (.roopik/)
	 */
	getWorkspacePath(): string;

	/**
	 * Get app data path (cache)
	 */
	getAppDataPath(): string;

	/**
	 * Get absolute path to component folder in workspace
	 */
	getComponentPath(canvasId: string, componentId: string): string;

	/**
	 * Get absolute path to component cache folder
	 */
	getCachePath(canvasId: string, componentId: string): string;
}
