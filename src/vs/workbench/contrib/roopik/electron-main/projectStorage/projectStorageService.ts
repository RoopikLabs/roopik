/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Project Storage Service Implementation
 *
 * Main process implementation of IProjectStorageService.
 * Manages recent projects registry for Project Mode.
 *
 * Storage: .roopik/projects/projects.json
 */

import { Emitter, Event } from '../../../../../base/common/event.js';
import { ILoggerService } from '../../../../../platform/log/common/log.js';
import { getRoopikLogger } from '../../common/roopikLogger.js';
import { IProjectStorageService } from '../../common/projectStorage/projectStorageService.js';
import type { ProjectInfo } from '../../common/storage/storageTypes.js';
import { WorkspaceStorage } from '../storage/workspaceStorage.js';

export class ProjectStorageService implements IProjectStorageService {
	readonly _serviceBrand: undefined;

	private readonly logger;
	private initialized: boolean = false;
	private storage: WorkspaceStorage | null = null;
	private _workspacePath: string | null = null;

	// ========================================================================
	// Events
	// ========================================================================

	private readonly _onDidInitialize = new Emitter<void>();
	readonly onDidInitialize: Event<void> = this._onDidInitialize.event;

	private readonly _onProjectsChanged = new Emitter<void>();
	readonly onProjectsChanged: Event<void> = this._onProjectsChanged.event;

	// ========================================================================
	// Constructor
	// ========================================================================

	constructor(@ILoggerService loggerService: ILoggerService) {
		this.logger = getRoopikLogger(loggerService, 'PROJECT_STORAGE');
	}

	// ========================================================================
	// Lifecycle
	// ========================================================================

	/**
	 * Initialize the service with workspace path
	 * Called from browser process when workspace is ready
	 */
	async initialize(workspacePath: string): Promise<void> {
		// Handle workspace change - reset state
		if (this.initialized && this._workspacePath !== workspacePath) {
			// this.logger.info('Workspace changed, re-initializing', {
			// 	oldPath: this._workspacePath,
			// 	newPath: workspacePath
			// });

			this.storage = null;
			this.initialized = false;
		}

		if (this.initialized) {
			this.logger.debug('Already initialized for this workspace');
			return;
		}

		this._workspacePath = workspacePath;

		this.storage = new WorkspaceStorage();
		await this.storage.initialize(workspacePath);

		this.initialized = true;
		this._onDidInitialize.fire();

		this.logger.info('Initialized', { workspacePath });
	}

	/**
	 * Check if service is initialized
	 */
	async isInitializedAsync(): Promise<boolean> {
		return this.initialized;
	}

	isInitialized(): boolean {
		return this.initialized;
	}

	/**
	 * Clear all project data (called when workspace is closed)
	 * Resets to uninitialized state
	 */
	async clear(): Promise<void> {
		// this.logger.info('Clearing project storage service (workspace closed)');

		this.storage = null;
		this._workspacePath = null;
		this.initialized = false;

		// Fire event so UI clears project list
		this._onProjectsChanged.fire();

		// Fire onDidInitialize to signal UI that service state changed (now uninitialized)
		this._onDidInitialize.fire();

		// this.logger.info('Project storage service cleared');
	}

	// ========================================================================
	// Project Operations
	// ========================================================================

	/**
	 * Get recent projects (sorted by updatedAt, most recent first)
	 */
	async getRecentProjects(limit: number = 5): Promise<ProjectInfo[]> {
		if (!this.storage || !this.initialized) {
			// this.logger.warn('Not initialized, returning empty list');
			return [];
		}

		return this.storage.getRecentProjects(limit);
	}

	/**
	 * Add or update a project in the registry
	 */
	async upsertProject(name: string, projectPath: string, framework?: string, frameworkDisplayName?: string): Promise<string> {
		if (!this.storage || !this.initialized) {
			throw new Error('[ProjectStorageService] Not initialized');
		}

		const projectId = await this.storage.upsertProject(name, projectPath, framework, frameworkDisplayName);
		this._onProjectsChanged.fire();

		this.logger.debug('Project upserted', { projectId, name, projectPath, framework });
		return projectId;
	}

	/**
	 * Delete a project from registry
	 */
	async deleteProject(projectId: string): Promise<void> {
		if (!this.storage || !this.initialized) {
			throw new Error('[ProjectStorageService] Not initialized');
		}

		await this.storage.deleteProject(projectId);
		this._onProjectsChanged.fire();

		this.logger.debug('Project deleted', { projectId });
	}

	// ========================================================================
	// Active Project Metadata (for session restoration & orphaned process cleanup)
	// ========================================================================

	/**
	 * Set active dev server metadata (called when server starts)
	 */
	async setActiveProject(projectId: string, pid: number, port: number, url: string): Promise<void> {
		if (!this.storage || !this.initialized) {
			throw new Error('[ProjectStorageService] Not initialized');
		}

		await this.storage.setActiveProject(projectId, pid, port, url);
		this.logger.debug('Active project set', { projectId, pid, port });
	}

	/**
	 * Clear active project metadata (called when server stops)
	 */
	async clearActiveProject(): Promise<void> {
		if (!this.storage || !this.initialized) {
			throw new Error('[ProjectStorageService] Not initialized');
		}

		await this.storage.clearActiveProject();
		this.logger.debug('Active project cleared');
	}

	/**
	 * Get active project metadata (returns undefined if no server running)
	 */
	async getActiveProject(): Promise<import('../../common/storage/storageTypes.js').ActiveProjectMetadata | undefined> {
		if (!this.storage || !this.initialized) {
			this.logger.warn('Not initialized, returning undefined');
			return undefined;
		}

		return this.storage.getActiveProject();
	}
}
