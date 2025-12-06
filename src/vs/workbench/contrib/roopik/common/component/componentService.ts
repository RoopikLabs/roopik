/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { Component, CreateComponentRequest } from './types.js';

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
 * - Coordinate ImportService, BuildService, StorageService
 * - Maintain in-memory component registry
 * - Handle component lifecycle (create → build → ready)
 * - React to file changes (via FileWatcher)
 */
export interface IComponentService {
	readonly _serviceBrand: undefined;

	// ========================================================================
	// Create
	// ========================================================================

	/**
	 * Create a new component from any source
	 *
	 * Flow:
	 * 1. Get canvasId (from request or active canvas)
	 * 2. Import files via ImportService
	 * 3. Save to workspace via StorageService
	 * 4. Build via BuildService
	 * 5. Return Component
	 */
	createComponent(request: CreateComponentRequest): Promise<Component>;

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
	 */
	getBundledCode(id: string): Promise<string>;

	// ========================================================================
	// Update
	// ========================================================================

	/**
	 * Update component source code
	 * Writes to workspace, triggers rebuild
	 */
	updateComponentSource(id: string, files: Record<string, string>): Promise<void>;

	/**
	 * Update component metadata (name only)
	 */
	updateComponentMeta(id: string, updates: { name?: string }): Promise<void>;

	// ========================================================================
	// Build
	// ========================================================================

	/**
	 * Force rebuild a component (clears cache)
	 */
	rebuildComponent(id: string): Promise<void>;

	// ========================================================================
	// Delete
	// ========================================================================

	/**
	 * Delete a component (workspace + cache)
	 */
	deleteComponent(id: string): Promise<void>;
}
