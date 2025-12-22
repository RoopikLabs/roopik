/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * MCP Server Channel
 *
 * IPC channel that routes calls from renderer process to McpServerService in main process.
 *
 * Flow:
 * Renderer -> IChannel.call() -> McpServerChannel.call() -> McpServerService.method()
 * McpServerService.event -> McpServerChannel.listen() -> IChannel.listen() -> Renderer
 */

import { Event } from '../../../../../base/common/event.js';
import { IServerChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import { McpServerService } from '../mcp/mcpServerService.js';

export class McpServerChannel implements IServerChannel {
	constructor(private readonly service: McpServerService) { }

	/**
	 * Handle event subscriptions from renderer
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	listen(_context: any, event: string): Event<any> {
		switch (event) {
			case 'onStatusChanged':
				return this.service.onStatusChanged;
			default:
				throw new Error(`[McpServerChannel] Unknown event: ${event}`);
		}
	}

	/**
	 * Handle method calls from renderer
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	call(_context: any, command: string): Promise<any> {
		switch (command) {
			case 'restart':
				return this.service.restart();
			case 'getStatus':
				return Promise.resolve(this.service.getStatus());
			case 'getPort':
				return Promise.resolve(this.service.getPort());
			default:
				throw new Error(`[McpServerChannel] Unknown command: ${command}`);
		}
	}
}
