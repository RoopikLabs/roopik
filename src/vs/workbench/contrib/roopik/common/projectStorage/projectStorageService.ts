/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Project Storage Service Interface
 *
 * Manages recently opened projects for Project Mode (Mode 2).
 * Simple storage - just tracks project name, path, and last accessed time.
 *
 * Storage: .roopik/projects/projects.json
 */

import { Event } from '../../../../../base/common/event.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ProjectInfo } from '../storage/storageTypes.js';

// ============================================================================
// Service Decorator (for Dependency Injection)
// ============================================================================

export const IProjectStorageService = createDecorator<IProjectStorageService>('roopikProjectStorageService');

// ============================================================================
// IPC Channel Name
// ============================================================================

export const PROJECT_STORAGE_CHANNEL = 'roopikProjectStorage';

// ============================================================================
// Service Interface
// ============================================================================

export interface IProjectStorageService {
	readonly _serviceBrand: undefined;

	// ========================================================================
	// Events
	// ========================================================================

	/** Fired when the service is initialized and ready */
	readonly onDidInitialize: Event<void>;

	/** Fired when projects list changes (add/update/delete) */
	readonly onProjectsChanged: Event<void>;

	// ========================================================================
	// Lifecycle
	// ========================================================================

	/**
	 * Initialize the service with workspace path
	 */
	initialize(workspacePath: string): Promise<void>;

	/**
	 * Check if service is initialized
	 */
	isInitializedAsync(): Promise<boolean>;

	// ========================================================================
	// Project Operations
	// ========================================================================

	/**
	 * Get recent projects (sorted by updatedAt, most recent first)
	 * @param limit Max number of projects to return (default: 5)
	 */
	getRecentProjects(limit?: number): Promise<ProjectInfo[]>;

	/**
	 * Add or update a project in the registry
	 * If project with same path exists, updates updatedAt; otherwise creates new
	 * @param name Display name (e.g., folder name)
	 * @param projectPath Workspace-relative path to project root
	 * @param framework Optional framework identifier (e.g., "react-vite")
	 * @param frameworkDisplayName Optional human-readable framework name (e.g., "React + Vite")
	 * @returns The project ID
	 */
	upsertProject(name: string, projectPath: string, framework?: string, frameworkDisplayName?: string): Promise<string>;

	/**
	 * Delete a project from registry
	 */
	deleteProject(projectId: string): Promise<void>;

	// ========================================================================
	// Active Project Metadata (for session restoration & orphaned process cleanup)
	// ========================================================================

	/**
	 * Set active dev server metadata (called when server starts)
	 * @param projectId Project ID
	 * @param pid Process ID
	 * @param port Server port
	 * @param url Server URL
	 */
	setActiveProject(projectId: string, pid: number, port: number, url: string): Promise<void>;

	/**
	 * Clear active project metadata (called when server stops)
	 */
	clearActiveProject(): Promise<void>;

	/**
	 * Get active project metadata (returns undefined if no server running)
	 */
	getActiveProject(): Promise<import('../storage/storageTypes.js').ActiveProjectMetadata | undefined>;
}
