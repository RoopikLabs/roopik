/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Canvas Service Interface
 *
 * Manages canvas lifecycle, metadata, and panel state tracking.
 * This is the source of truth for all canvas operations.
 *
 * Key Responsibilities:
 * - Create/delete canvases with persistent IDs
 * - Track open/focused canvas panels
 * - Provide canvas listing for activity pane and welcome screen
 * - Prevent duplicate canvas tabs
 */

import { Event } from '../../../../../base/common/event.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import type { CanvasMeta, Canvas, CreateCanvasResult, ListCanvasOptions, CanvasPanelState } from './types.js';

// ============================================================================
// Service Decorator (for Dependency Injection)
// ============================================================================

export const ICanvasService = createDecorator<ICanvasService>('roopikCanvasService');

// ============================================================================
// Events
// ============================================================================

/**
 * Event fired when a canvas is created
 */
export interface CanvasCreatedEvent {
	canvasId: string;
	canvas: CanvasMeta;
}

/**
 * Event fired when a canvas is deleted
 */
export interface CanvasDeletedEvent {
	canvasId: string;
}

/**
 * Event fired when canvas metadata is updated
 */
export interface CanvasUpdatedEvent {
	canvasId: string;
	changes: (keyof CanvasMeta)[];
	canvas: CanvasMeta;
}

/**
 * Event fired when the focused canvas changes
 */
export interface CanvasFocusChangedEvent {
	/** Previously focused canvas (null if none) */
	previousCanvasId: string | null;

	/** Currently focused canvas (null if none) */
	currentCanvasId: string | null;
}

// ============================================================================
// Service Interface
// ============================================================================

export interface ICanvasService {
	readonly _serviceBrand: undefined;

	// ========================================================================
	// Events
	// ========================================================================

	/** Fired when the service is initialized and ready */
	readonly onDidInitialize: Event<void>;

	/** Fired when a canvas is created */
	readonly onCanvasCreated: Event<CanvasCreatedEvent>;

	/** Fired when a canvas is deleted */
	readonly onCanvasDeleted: Event<CanvasDeletedEvent>;

	/** Fired when canvas metadata is updated */
	readonly onCanvasUpdated: Event<CanvasUpdatedEvent>;

	/** Fired when the focused canvas changes */
	readonly onCanvasFocusChanged: Event<CanvasFocusChangedEvent>;

	// ========================================================================
	// Lifecycle
	// ========================================================================

	/**
	 * Initialize the canvas service
	 * Scans storage for existing canvases
	 */
	initialize(workspacePath: string): Promise<void>;

	/**
	 * Check if the service is initialized (sync - main process only)
	 */
	isInitialized(): boolean;

	/**
	 * Check if the service is initialized (async - works over IPC)
	 */
	isInitializedAsync(): Promise<boolean>;

	/**
	 * Dispose the service
	 */
	dispose(): void;

	/**
	 * Clear all canvas data (called when workspace is closed)
	 * This resets the service to uninitialized state without a workspace
	 */
	clear(): Promise<void>;

	/**
	 * Get the workspace path (stored during initialization)
	 */
	getWorkspacePath(): string;

	// ========================================================================
	// Canvas CRUD
	// ========================================================================

	/**
	 * Create a canvas or get existing one if name already exists
	 *
	 * @param name - Display name (e.g., "Login Components")
	 * @returns Canvas ID and whether it's new
	 *
	 * Flow:
	 * 1. Convert name to slug ID ("login-components")
	 * 2. Check if canvas with this ID exists
	 * 3. If exists: return existing canvas, isNew = false
	 * 4. If new: create folder, save meta, return canvas, isNew = true
	 */
	createCanvas(name: string): Promise<CreateCanvasResult>;

	/**
	 * Get a canvas by ID
	 */
	getCanvas(canvasId: string): Canvas | undefined;

	/**
	 * Get a canvas by ID (async for IPC)
	 */
	getCanvasAsync(canvasId: string): Promise<Canvas | undefined>;

	/**
	 * List all canvases
	 */
	listCanvases(options?: ListCanvasOptions): CanvasMeta[];

	/**
	 * List all canvases (async for IPC)
	 */
	listCanvasesAsync(options?: ListCanvasOptions): Promise<CanvasMeta[]>;

	/**
	 * Update canvas metadata
	 */
	updateCanvas(canvasId: string, updates: Partial<Pick<CanvasMeta, 'name' | 'description' | 'icon' | 'color'>>): Promise<void>;

	/**
	 * Delete a canvas and all its components
	 */
	deleteCanvas(canvasId: string): Promise<void>;

	// ========================================================================
	// Panel State Tracking
	// ========================================================================

	/**
	 * Register a canvas panel as open
	 * Called by extension when a panel is created
	 */
	registerPanelOpen(canvasId: string): void;

	/**
	 * Unregister a canvas panel as closed
	 * Called by extension when a panel is disposed
	 */
	registerPanelClosed(canvasId: string): void;

	/**
	 * Register a canvas panel as focused
	 * Called by extension when a panel gains focus
	 */
	registerPanelFocused(canvasId: string): void;

	/**
	 * Get the currently focused canvas ID
	 * Returns null if no canvas is focused
	 */
	getFocusedCanvasId(): string | null;

	/**
	 * Get the currently focused canvas ID (async for IPC)
	 */
	getFocusedCanvasIdAsync(): Promise<string | null>;

	/**
	 * Check if a canvas panel is open
	 */
	isPanelOpen(canvasId: string): boolean;

	/**
	 * Get all open canvas panel states
	 */
	getOpenPanels(): CanvasPanelState[];

	// ========================================================================
	// Utilities
	// ========================================================================

	/**
	 * Convert a name to a canvas ID (slug format)
	 * "Login Components" -> "login-components"
	 */
	nameToId(name: string): string;

	/**
	 * Check if a canvas ID already exists
	 */
	canvasExists(canvasId: string): boolean;

	/**
	 * Update component count for a canvas
	 * Called by ComponentService when components are added/removed
	 */
	updateComponentCount(canvasId: string, count: number): Promise<void>;
}
