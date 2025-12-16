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
	 * @returns The project ID
	 */
	upsertProject(name: string, projectPath: string): Promise<string>;

	/**
	 * Delete a project from registry
	 */
	deleteProject(projectId: string): Promise<void>;
}
