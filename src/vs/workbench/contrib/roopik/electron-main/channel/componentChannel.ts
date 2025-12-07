/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Component Channel
 *
 * IPC channel that routes calls from renderer process to ComponentService in main process.
 * This is the main-process side of the IPC bridge.
 *
 * Flow:
 * Renderer → IChannel.call() → ComponentChannel.call() → ComponentService.method()
 * ComponentService.event → ComponentChannel.listen() → IChannel.listen() → Renderer
 */

import { Event } from '../../../../../base/common/event.js';
import { IServerChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import { IComponentService } from '../../common/component/componentService.js';
import { CreateComponentRequest } from '../../common/component/types.js';

export class ComponentChannel implements IServerChannel {
	constructor(private readonly service: IComponentService) { }

	/**
	 * Handle event subscriptions from renderer
	 */
	listen(_context: unknown, event: string): Event<any> {
		switch (event) {
			case 'onComponentCreated':
				return this.service.onComponentCreated;
			case 'onComponentBuilt':
				return this.service.onComponentBuilt;
			case 'onComponentDeleted':
				return this.service.onComponentDeleted;
			case 'onComponentUpdated':
				return this.service.onComponentUpdated;
			default:
				throw new Error(`[ComponentChannel] Unknown event: ${event}`);
		}
	}

	/**
	 * Handle method calls from renderer
	 */
	call(_context: unknown, command: string, arg?: any): Promise<any> {
		switch (command) {
			// ================================================================
			// Lifecycle
			// ================================================================
			case 'initialize':
				return this.service.initialize(arg as string);
			case 'isInitialized':
				return Promise.resolve(this.service.isInitialized());

			// ================================================================
			// Create
			// ================================================================
			case 'createComponent':
				return this.service.createComponent(arg as CreateComponentRequest);

			// ================================================================
			// Read
			// ================================================================
			case 'getComponent':
				return Promise.resolve(this.service.getComponent(arg as string));
			case 'getComponentsForCanvas':
				return Promise.resolve(this.service.getComponentsForCanvas(arg as string));
			case 'getAllComponents':
				return Promise.resolve(this.service.getAllComponents());

			// ================================================================
			// Code Access
			// ================================================================
			case 'getComponentSource':
				return this.service.getComponentSource(arg as string);
			case 'getBundledCode':
				return this.service.getBundledCode(arg as string);
			case 'getCdnUrls':
				return this.service.getCdnUrls(arg as string);

			// ================================================================
			// Update
			// ================================================================
			case 'updateComponentSource': {
				const { id, files } = arg as { id: string; files: Record<string, string> };
				return this.service.updateComponentSource(id, files);
			}
			case 'updateComponentMeta': {
				const { id, updates } = arg as { id: string; updates: { name?: string } };
				return this.service.updateComponentMeta(id, updates);
			}

			// ================================================================
			// Build
			// ================================================================
			case 'rebuildComponent':
				return this.service.rebuildComponent(arg as string);
			case 'rebuildAllInCanvas':
				return this.service.rebuildAllInCanvas(arg as string);
			case 'isBuilding':
				return Promise.resolve(this.service.isBuilding(arg as string));
			case 'getBuildQueueSize':
				return Promise.resolve(this.service.getBuildQueueSize());

			// ================================================================
			// Delete
			// ================================================================
			case 'deleteComponent':
				return this.service.deleteComponent(arg as string);

			// ================================================================
			// File Watcher Control
			// ================================================================
			case 'pauseFileWatcher':
				this.service.pauseFileWatcher();
				return Promise.resolve();
			case 'resumeFileWatcher':
				this.service.resumeFileWatcher();
				return Promise.resolve();
			case 'ignoreComponentFileChanges':
				this.service.ignoreComponentFileChanges(arg as string);
				return Promise.resolve();
			case 'unignoreComponentFileChanges':
				this.service.unignoreComponentFileChanges(arg as string);
				return Promise.resolve();

			default:
				throw new Error(`[ComponentChannel] Unknown command: ${command}`);
		}
	}
}
