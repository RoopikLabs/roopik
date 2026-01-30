/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * MCP Server Service Client
 *
 * Browser-side client that communicates with McpServerService in main process via IPC.
 *
 * Provides:
 * - Server lifecycle: restart, getStatus, getPort, getWsPort
 * - Master control: isEnabled, setEnabled
 * - Agent control: getAgentStatus, getIntegrationStatus, enableAgent, disableAgent, syncAgentRegistrations
 */

import { Event } from '../../../../base/common/event.js';
import { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import {
	IMcpServerService,
	McpServerStatus,
	AgentId,
	AgentStatus,
	McpIntegrationStatus,
	MCP_SERVER_CHANNEL
} from '../common/mcp/index.js';

export class McpServerServiceClient implements IMcpServerService {
	readonly _serviceBrand: undefined;

	private readonly channel: IChannel;

	constructor(@IMainProcessService mainProcessService: IMainProcessService) {
		this.channel = mainProcessService.getChannel(MCP_SERVER_CHANNEL);
	}

	// ========================================
	// Events
	// ========================================

	get onStatusChanged(): Event<McpServerStatus> {
		return this.channel.listen<McpServerStatus>('onStatusChanged');
	}

	get onAgentStatusChanged(): Event<AgentStatus[]> {
		return this.channel.listen<AgentStatus[]>('onAgentStatusChanged');
	}

	// ========================================
	// Server Lifecycle
	// ========================================

	async restart(): Promise<void> {
		return this.channel.call('restart');
	}

	async getStatus(): Promise<McpServerStatus> {
		return this.channel.call('getStatus');
	}

	async getPort(): Promise<number> {
		return this.channel.call('getPort');
	}

	async getWsPort(): Promise<number> {
		return this.channel.call('getWsPort');
	}

	// ========================================
	// STDIO/WebSocket Control
	// ========================================

	async isEnabled(): Promise<boolean> {
		return this.channel.call('isEnabled');
	}

	async setEnabled(enabled: boolean): Promise<void> {
		return this.channel.call('setEnabled', [enabled]);
	}

	// ========================================
	// HTTP Control
	// ========================================

	async isHttpEnabled(): Promise<boolean> {
		return this.channel.call('isHttpEnabled');
	}

	async setHttpEnabled(enabled: boolean): Promise<void> {
		return this.channel.call('setHttpEnabled', [enabled]);
	}

	// ========================================
	// Agent Control
	// ========================================

	async getAgentStatus(): Promise<AgentStatus[]> {
		return this.channel.call('getAgentStatus');
	}

	async getIntegrationStatus(): Promise<McpIntegrationStatus> {
		return this.channel.call('getIntegrationStatus');
	}

	async enableAgent(agentId: AgentId): Promise<void> {
		return this.channel.call('enableAgent', [agentId]);
	}

	async disableAgent(agentId: AgentId): Promise<void> {
		return this.channel.call('disableAgent', [agentId]);
	}

	async syncAgentRegistrations(): Promise<void> {
		return this.channel.call('syncAgentRegistrations');
	}
}
