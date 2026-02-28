/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { Component, AddComponentRequest, BuildResult, BuildErrorInfo, ComponentInfo, RuntimeError } from './types.js';

// ============================================================================
// Event Types
// ============================================================================

/**
 * Event fired when a component is created
 */
export interface ComponentCreatedEvent {
	component: Component;
}

/**
 * Event fired when a component build completes (success or failure)
 *
 * On success: `success=true`, `result` contains build metadata
 * On failure: `success=false`, `errorInfo` contains structured error details
 *
 * Note: `result.bundledCode` is NOT included in the event (too large).
 * Use `componentService.getBundledCode(id)` to get the actual code.
 */
export interface ComponentBuildEvent {
	componentId: string;
	canvasId: string;
	success: boolean;

	/** Build result (success case) - bundledCode omitted, use getBundledCode() */
	result?: Omit<BuildResult, 'bundledCode'>;

	/** Structured error info (failure case) */
	errorInfo?: BuildErrorInfo;

	/** Build triggered by: 'create' | 'update' | 'rebuild' | 'file-change' */
	trigger: 'create' | 'update' | 'rebuild' | 'file-change';
}

/**
 * Event fired when a component is deleted
 */
export interface ComponentDeletedEvent {
	componentId: string;
	canvasId: string;
}

/**
 * Event fired when component metadata changes
 */
export interface ComponentUpdatedEvent {
	component: Component;
	changes: ('componentName' | 'source')[];
}

/**
 * Event fired when a component screenshot is requested (bidirectional IPC)
 * Browser process should listen to this event, call extension command, and deliver result via deliverScreenshot()
 */
export interface ComponentScreenshotRequestEvent {
	requestId: string;
	componentId: string;
}

// ============================================================================
// Service Interface
// ============================================================================

export const IComponentService = createDecorator<IComponentService>('roopikComponentService');

/**
 * Component Service Interface
 *
 * Main orchestrator for component operations. This is the primary interface
 * that agents and UI will use to create, build, and manage components.
 *
 * Responsibilities:
 * - Coordinate BuildService, StorageService, FileWatcher
 * - Maintain in-memory component registry
 * - Handle component lifecycle (create → build → ready)
 * - React to file changes (via FileWatcher)
 * - Queue and deduplicate build requests
 *
 * Build Queue Behavior:
 * - Builds are async and queued
 * - Same component = coalesced (only latest request runs)
 * - Concurrency limited (3-5 parallel builds)
 * - Results delivered via events (onComponentBuilt)
 *
 * Usage:
 * ```typescript
 * // Create component
 * const component = await componentService.createComponent({...});
 *
 * // Listen for build results
 * componentService.onComponentBuilt(event => {
 *   if (event.success) {
 *     console.log('Build succeeded', event.result);
 *   } else {
 *     console.error('Build failed', event.error);
 *   }
 * });
 *
 * // Force rebuild (result via event)
 * await componentService.rebuildComponent(id);
 * ```
 */
export interface IComponentService {
	readonly _serviceBrand: undefined;

	// ========================================================================
	// Lifecycle
	// ========================================================================

	/**
	 * Initialize the component service
	 * - Loads all components from storage
	 * - Starts file watcher
	 * - Must be called before other methods
	 */
	initialize(workspacePath: string): Promise<void>;

	/**
	 * Check if service is initialized
	 */
	isInitialized(): boolean;

	/**
	 * Clear all component data (called when workspace is closed)
	 * Resets to uninitialized state
	 */
	clear(): Promise<void>;

	/**
	 * Dispose resources (stops file watcher, clears state)
	 */
	dispose(): void;

	// ========================================================================
	// Create/Add Component
	// ========================================================================

	/**
	 * Add component to canvas by reference (metadata-only architecture)
	 *
	 * Simple workflow:
	 * 1. Validate folder exists
	 * 2. Auto-detect entryFile if not provided (index.tsx → index.ts → {folderName}.tsx)
	 * 3. Auto-detect framework from imports (react/vue/svelte/unknown)
	 * 4. Save reference to .roopik/canvases/{canvas-id}.json (NO copying!)
	 * 5. Register folder watcher on original folderPath
	 * 6. Queue build (reads from original location)
	 * 7. Return Component (with buildState: 'building')
	 *
	 * The returned component may still be building. Listen to onComponentAdded/onComponentBuilt
	 * for the final result.
	 *
	 * @param request AddComponentRequest with name, folderPath, optional entryFile/origin
	 * @returns Component with populated id, canvasId, folderPath, framework
	 */
	addComponent(request: AddComponentRequest): Promise<Component>;

	/**
	 * Add multiple components in batch (for AI agents generating multiple variants)
	 *
	 * More efficient than calling addComponent() in a loop:
	 * - Single canvas file write (not N writes)
	 * - Builds are queued together
	 * - Returns all components with their IDs
	 *
	 * @param requests Array of AddComponentRequest
	 * @returns Array of created Components (in same order as requests)
	 */
	addComponents(requests: AddComponentRequest[]): Promise<Component[]>;

	// ========================================================================
	// Read
	// ========================================================================

	/**
	 * Get component by ID (from memory)
	 */
	getComponent(id: string): Component | undefined;

	/**
	 * Get all components for a canvas
	 */
	getComponentsForCanvas(canvasId: string): Component[];

	/**
	 * Get all components
	 */
	getAllComponents(): Component[];

	// ========================================================================
	// Component Info (Unified API for AI agents)
	// ========================================================================

	/**
	 * Get comprehensive component info in a single call
	 *
	 * Returns everything an AI agent needs:
	 * - Component metadata (name, path, framework)
	 * - Build status (building/ready/error)
	 * - Error details if build failed
	 * - Cache validity
	 * - CDN URLs and build stats
	 *
	 * This is the primary API for AI agents to understand component state.
	 */
	getComponentInfo(id: string): Promise<ComponentInfo>;

	// ========================================================================
	// Code Access
	// ========================================================================

	/**
	 * Get source code for editing
	 * Reads from workspace on-demand
	 */
	getComponentSource(id: string): Promise<Record<string, string>>;

	/**
	 * Get bundled code for rendering
	 * Reads from cache on-demand
	 *
	 * @throws Error if component not found or not built
	 */
	getBundledCode(id: string): Promise<string>;

	// ========================================================================
	// Update
	// ========================================================================

	/**
	 * Update component display name
	 * NOTE: Source code is edited directly via VS Code, FileWatcher triggers rebuild
	 */
	updateComponentName(id: string, componentName: string): Promise<void>;

	// ========================================================================
	// Build
	// ========================================================================

	/**
	 * Force rebuild a component (clears cache)
	 * Build is async - result delivered via onComponentBuilt event
	 */
	rebuildComponent(id: string): Promise<void>;

	/**
	 * Rebuild all components in a canvas
	 */
	rebuildAllInCanvas(canvasId: string): Promise<void>;

	/**
	 * Check if a component is currently building
	 */
	isBuilding(id: string): boolean;

	/**
	 * Get current build queue size
	 */
	getBuildQueueSize(): number;

	// ========================================================================
	// Delete
	// ========================================================================

	/**
	 * Delete a component (workspace + cache)
	 * Cancels any pending builds for this component
	 * @param id Component ID to delete
	 * @param deleteSourceCode If true, also delete the source code files from disk (default: false)
	 */
	deleteComponent(id: string, deleteSourceCode?: boolean): Promise<void>;

	// ========================================================================
	// File Watcher Control
	// ========================================================================

	/**
	 * Pause file watching (use during batch operations)
	 * Changes are queued and processed on resume
	 */
	pauseFileWatcher(): void;

	/**
	 * Resume file watching
	 * Processes any queued changes
	 */
	resumeFileWatcher(): void;

	/**
	 * Ignore file changes for a specific component
	 * Use when programmatically writing files
	 */
	ignoreComponentFileChanges(id: string): void;

	/**
	 * Stop ignoring file changes for a component
	 */
	unignoreComponentFileChanges(id: string): void;

	// ========================================================================
	// Runtime Error Reporting
	// ========================================================================

	/**
	 * Report a runtime error from canvas rendering.
	 * Called by the extension when a component crashes at runtime in the sandbox.
	 * The error is stored in component state and exposed via getComponentInfo().
	 *
	 * @param componentId - The component that crashed
	 * @param error - The runtime error details
	 */
	reportRuntimeError(componentId: string, error: RuntimeError): void;

	/**
	 * Clear runtime error for a component.
	 * Called automatically after a successful rebuild.
	 *
	 * @param componentId - The component to clear error for
	 */
	clearRuntimeError(componentId: string): void;

	// ========================================================================
	// Events
	// ========================================================================

	/**
	 * Fired when a component is created
	 */
	readonly onComponentCreated: Event<ComponentCreatedEvent>;

	/**
	 * Fired when a component build completes (success or failure)
	 * This is the primary way to get build results
	 */
	readonly onComponentBuilt: Event<ComponentBuildEvent>;

	/**
	 * Fired when a component is deleted
	 */
	readonly onComponentDeleted: Event<ComponentDeletedEvent>;

	/**
	 * Fired when component metadata changes (name, etc.)
	 */
	readonly onComponentUpdated: Event<ComponentUpdatedEvent>;

	/**
	 * Fired when a screenshot is requested (bidirectional IPC pattern)
	 * Browser process should listen and deliver result via deliverScreenshot()
	 */
	readonly onScreenshotRequested: Event<ComponentScreenshotRequestEvent>;

	// ========================================================================
	// Screenshot (Bidirectional IPC)
	// ========================================================================

	/**
	 * Request a component screenshot (used by tools)
	 * Returns a promise that resolves when browser delivers the screenshot via deliverScreenshot()
	 *
	 * @param componentId - Component to screenshot
	 * @returns Promise<string> - Base64 data URL of screenshot
	 */
	requestComponentScreenshot(componentId: string): Promise<string>;

	/**
	 * Deliver screenshot result (called by browser process after extension captures it)
	 * Resolves the pending promise created by requestComponentScreenshot()
	 *
	 * @param requestId - Request ID from ComponentScreenshotRequestEvent
	 * @param screenshot - Base64 data URL or null if failed
	 * @param error - Error message if screenshot failed
	 */
	deliverComponentScreenshot(requestId: string, screenshot: string | null, error?: string): void;
}
