/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Canvas Channel
 *
 * IPC channel that routes calls from renderer process to CanvasService in main process.
 * This is the main-process side of the IPC bridge for canvas operations.
 *
 * Flow:
 * Renderer -> IChannel.call() -> CanvasChannel.call() -> CanvasService.method()
 * CanvasService.event -> CanvasChannel.listen() -> IChannel.listen() -> Renderer
 */

import { Event } from '../../../../../base/common/event.js';
import { IServerChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import { ICanvasService } from '../../common/canvas/canvasService.js';
import { ListCanvasOptions } from '../../common/canvas/types.js';

export class CanvasChannel implements IServerChannel {
	constructor(private readonly service: ICanvasService) { }

	/**
	 * Handle event subscriptions from renderer
	 */
	listen(_context: unknown, event: string): Event<any> {
		switch (event) {
			case 'onCanvasCreated':
				return this.service.onCanvasCreated;
			case 'onCanvasDeleted':
				return this.service.onCanvasDeleted;
			case 'onCanvasUpdated':
				return this.service.onCanvasUpdated;
			case 'onCanvasFocusChanged':
				return this.service.onCanvasFocusChanged;
			default:
				throw new Error(`[CanvasChannel] Unknown event: ${event}`);
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
			// Canvas CRUD
			// ================================================================
			case 'createCanvas':
				return this.service.createCanvas(arg as string);
			case 'getCanvas':
				return this.service.getCanvasAsync(arg as string);
			case 'listCanvases':
				return this.service.listCanvasesAsync(arg as ListCanvasOptions | undefined);
			case 'updateCanvas': {
				const { canvasId, updates } = arg as { canvasId: string; updates: any };
				return this.service.updateCanvas(canvasId, updates);
			}
			case 'deleteCanvas':
				return this.service.deleteCanvas(arg as string);

			// ================================================================
			// Panel State Tracking
			// ================================================================
			case 'registerPanelOpen':
				this.service.registerPanelOpen(arg as string);
				return Promise.resolve();
			case 'registerPanelClosed':
				this.service.registerPanelClosed(arg as string);
				return Promise.resolve();
			case 'registerPanelFocused':
				this.service.registerPanelFocused(arg as string);
				return Promise.resolve();
			case 'getFocusedCanvasId':
				return this.service.getFocusedCanvasIdAsync();
			case 'isPanelOpen':
				return Promise.resolve(this.service.isPanelOpen(arg as string));
			case 'getOpenPanels':
				return Promise.resolve(this.service.getOpenPanels());

			// ================================================================
			// Utilities
			// ================================================================
			case 'nameToId':
				return Promise.resolve(this.service.nameToId(arg as string));
			case 'canvasExists':
				return Promise.resolve(this.service.canvasExists(arg as string));
			case 'updateComponentCount': {
				const { canvasId, count } = arg as { canvasId: string; count: number };
				return this.service.updateComponentCount(canvasId, count);
			}

			default:
				throw new Error(`[CanvasChannel] Unknown command: ${command}`);
		}
	}
}
