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
import { IProjectStorageService } from '../../common/projectStorage/projectStorageService.js';
import { ProjectInfo } from '../../common/storage/storageTypes.js';
import { WorkspaceStorage } from '../storage/workspaceStorage.js';

export class ProjectStorageService implements IProjectStorageService {
	readonly _serviceBrand: undefined;

	// ========================================================================
	// State
	// ========================================================================

	private initialized: boolean = false;
	private storage: WorkspaceStorage | null = null;

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

	constructor() {
		console.log('[ProjectStorageService] Created');
	}

	// ========================================================================
	// Lifecycle
	// ========================================================================

	/**
	 * Initialize the service with workspace path
	 * Called from browser process when workspace is ready
	 */
	async initialize(workspacePath: string): Promise<void> {
		if (this.initialized) {
			console.log('[ProjectStorageService] Already initialized');
			return;
		}

		console.log('[ProjectStorageService] Initializing with workspace:', workspacePath);

		this.storage = new WorkspaceStorage();
		await this.storage.initialize(workspacePath);

		this.initialized = true;
		this._onDidInitialize.fire();

		console.log('[ProjectStorageService] Initialized');
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

	// ========================================================================
	// Project Operations
	// ========================================================================

	/**
	 * Get recent projects (sorted by updatedAt, most recent first)
	 */
	async getRecentProjects(limit: number = 5): Promise<ProjectInfo[]> {
		if (!this.storage || !this.initialized) {
			console.warn('[ProjectStorageService] Not initialized, returning empty list');
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

		console.log(`[ProjectStorageService] Upserted project: ${name} at ${projectPath}` + (framework ? ` (${frameworkDisplayName || framework})` : ''));
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

		console.log(`[ProjectStorageService] Deleted project: ${projectId}`);
	}
}
