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
	listen(_context: unknown, event: string): Event<any> {
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
	call(_context: unknown, command: string, arg?: any): Promise<any> {
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

			default:
				throw new Error(`[ProjectStorageChannel] Unknown command: ${command}`);
		}
	}
}
