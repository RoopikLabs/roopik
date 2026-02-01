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
 *
 * Supports:
 * - Server lifecycle: restart, getStatus, getPort, getWsPort
 * - Master control: isEnabled, setEnabled
 * - Agent control: getAgentStatus, getIntegrationStatus, enableAgent, disableAgent, syncAgentRegistrations
 */

import { Event } from '../../../../../base/common/event.js';
import { IServerChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import { McpServerService } from '../mcp/mcpServerService.js';
import type { AgentId } from '../../common/mcp/mcpServerService.js';

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
			case 'onAgentStatusChanged':
				return this.service.onAgentStatusChanged;
			default:
				throw new Error(`[McpServerChannel] Unknown event: ${event}`);
		}
	}

	/**
	 * Handle method calls from renderer
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	call(_context: any, command: string, args?: any[]): Promise<any> {
		switch (command) {
			// Server lifecycle
			case 'restart':
				return this.service.restart();
			case 'getStatus':
				return this.service.getStatus();
			case 'getWsPort':
				return this.service.getWsPort();

			// Server control
			case 'isEnabled':
				return this.service.isEnabled();
			case 'setEnabled':
				return this.service.setEnabled(args?.[0] ?? true);

			// Agent control
			case 'getAgentStatus':
				return this.service.getAgentStatus();
			case 'getIntegrationStatus':
				return this.service.getIntegrationStatus();
			case 'enableAgent':
				return this.service.enableAgent(args?.[0] as AgentId);
			case 'disableAgent':
				return this.service.disableAgent(args?.[0] as AgentId);
			case 'syncAgentRegistrations':
				return this.service.syncAgentRegistrations();

			// Connection info (for external IDEs)
			case 'getConnectionInfo':
				return this.service.getConnectionInfo();

			default:
				throw new Error(`[McpServerChannel] Unknown command: ${command}`);
		}
	}
}
