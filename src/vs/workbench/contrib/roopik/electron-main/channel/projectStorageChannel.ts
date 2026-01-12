/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Project Storage Channel
 *
 * IPC channel that routes calls from renderer process to ProjectStorageService in main process.
 *
 * Flow:
 * Renderer -> IChannel.call() -> ProjectStorageChannel.call() -> ProjectStorageService.method()
 * ProjectStorageService.event -> ProjectStorageChannel.listen() -> IChannel.listen() -> Renderer
 */

import { Event } from '../../../../../base/common/event.js';
import { IServerChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import { ProjectStorageService } from '../projectStorage/projectStorageService.js';

export class ProjectStorageChannel implements IServerChannel {
	constructor(private readonly service: ProjectStorageService) { }

	/**
	 * Handle event subscriptions from renderer
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	listen(_context: any, event: string): Event<any> {
		switch (event) {
			case 'onDidInitialize':
				return this.service.onDidInitialize;
			case 'onProjectsChanged':
				return this.service.onProjectsChanged;
			default:
				throw new Error(`[ProjectStorageChannel] Unknown event: ${event}`);
		}
	}

	/**
	 * Handle method calls from renderer
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	call(_context: any, command: string, arg?: any): Promise<any> {
		switch (command) {
			// Lifecycle
			case 'initialize':
				return this.service.initialize(arg as string);
			case 'isInitialized':
				return Promise.resolve(this.service.isInitialized());

			// Project Operations
			case 'getRecentProjects':
				return this.service.getRecentProjects(arg as number | undefined);
			case 'upsertProject': {
				const { name, projectPath, framework, frameworkDisplayName } = arg as { name: string; projectPath: string; framework?: string; frameworkDisplayName?: string };
				return this.service.upsertProject(name, projectPath, framework, frameworkDisplayName);
			}
			case 'deleteProject':
				return this.service.deleteProject(arg as string);

			// Active Project Metadata
			case 'setActiveProject': {
				const { projectId, pid, port, url } = arg as { projectId: string; pid: number; port: number; url: string };
				return this.service.setActiveProject(projectId, pid, port, url);
			}
			case 'clearActiveProject':
				return this.service.clearActiveProject();
			case 'getActiveProject':
				return this.service.getActiveProject();

			default:
				throw new Error(`[ProjectStorageChannel] Unknown command: ${command}`);
		}
	}
}
