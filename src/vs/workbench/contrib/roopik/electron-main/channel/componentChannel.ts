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
import type { AddComponentRequest, RuntimeError } from '../../common/component/types.js';

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
			case 'onScreenshotRequested':
				return this.service.onScreenshotRequested;
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
			case 'clear':
				return this.service.clear();

			// ================================================================
			// Create
			// ================================================================
			case 'addComponent':
				return this.service.addComponent(arg as AddComponentRequest);
			case 'addComponents':
				return this.service.addComponents(arg as AddComponentRequest[]);

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
			// Component Info (Unified API)
			// ================================================================
			case 'getComponentInfo':
				return this.service.getComponentInfo(arg as string);

			// ================================================================
			// Code Access
			// ================================================================
			case 'getComponentSource':
				return this.service.getComponentSource(arg as string);
			case 'getBundledCode':
				return this.service.getBundledCode(arg as string);

			// ================================================================
			// Update
			// ================================================================
			case 'updateComponentName': {
				const { id, componentName } = arg as { id: string; componentName: string };
				return this.service.updateComponentName(id, componentName);
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
			case 'deleteComponent': {
				const { id, deleteSourceCode } = arg as { id: string; deleteSourceCode?: boolean };
				return this.service.deleteComponent(id, deleteSourceCode);
			}

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

			// ================================================================
			// Runtime Error Reporting (from canvas)
			// ================================================================
			case 'reportRuntimeError': {
				const { componentId, error } = arg as { componentId: string; error: RuntimeError };
				this.service.reportRuntimeError(componentId, error);
				return Promise.resolve();
			}
			case 'clearRuntimeError':
				this.service.clearRuntimeError(arg as string);
				return Promise.resolve();

			// ================================================================
			// Screenshot (Bidirectional IPC)
			// ================================================================
			case 'requestComponentScreenshot':
				return this.service.requestComponentScreenshot(arg as string);
			case 'deliverComponentScreenshot': {
				const { requestId, screenshot, error } = arg as { requestId: string; screenshot: string | null; error?: string };
				this.service.deliverComponentScreenshot(requestId, screenshot, error);
				return Promise.resolve();
			}

			default:
				throw new Error(`[ComponentChannel] Unknown command: ${command}`);
		}
	}
}
