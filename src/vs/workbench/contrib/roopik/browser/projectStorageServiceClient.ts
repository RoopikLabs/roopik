/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Project Storage Service Client
 *
 * Renderer-side proxy that communicates with ProjectStorageService in main process via IPC.
 * Implements the same IProjectStorageService interface, so callers can use it identically.
 *
 * Flow:
 * Browser UI -> ProjectStorageServiceClient.method() -> IPC -> ProjectStorageChannel -> ProjectStorageService
 * ProjectStorageService events -> IPC -> ProjectStorageServiceClient.onXxx -> Browser UI
 */

import { Event } from '../../../../base/common/event.js';
import { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { IProjectStorageService, PROJECT_STORAGE_CHANNEL } from '../common/projectStorage/index.js';
import { ProjectInfo } from '../common/storage/storageTypes.js';

export class ProjectStorageServiceClient implements IProjectStorageService {
	readonly _serviceBrand: undefined;

	private readonly channel: IChannel;

	// ========================================================================
	// Events (proxied from main process)
	// ========================================================================

	readonly onDidInitialize: Event<void>;
	readonly onProjectsChanged: Event<void>;

	// ========================================================================
	// Constructor
	// ========================================================================

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService
	) {
		this.channel = mainProcessService.getChannel(PROJECT_STORAGE_CHANNEL);

		// Subscribe to events from main process
		this.onDidInitialize = this.channel.listen<void>('onDidInitialize');
		this.onProjectsChanged = this.channel.listen<void>('onProjectsChanged');
	}

	// ========================================================================
	// Lifecycle
	// ========================================================================

	async initialize(workspacePath: string): Promise<void> {
		return this.channel.call('initialize', workspacePath);
	}

	async isInitializedAsync(): Promise<boolean> {
		return this.channel.call('isInitialized');
	}

	// ========================================================================
	// Project Operations
	// ========================================================================

	async getRecentProjects(limit: number = 5): Promise<ProjectInfo[]> {
		return this.channel.call('getRecentProjects', limit);
	}

	async upsertProject(name: string, projectPath: string): Promise<string> {
		return this.channel.call('upsertProject', { name, projectPath });
	}

	async deleteProject(projectId: string): Promise<void> {
		return this.channel.call('deleteProject', projectId);
	}
}
