/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * MCP Server Service Client
 *
 * Browser-side client that communicates with McpServerService in main process via IPC.
 */

import { Event } from '../../../../base/common/event.js';
import { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { IMcpServerService, McpServerStatus, MCP_SERVER_CHANNEL } from '../common/mcp/index.js';

export class McpServerServiceClient implements IMcpServerService {
	readonly _serviceBrand: undefined;

	private readonly channel: IChannel;

	constructor(@IMainProcessService mainProcessService: IMainProcessService) {
		this.channel = mainProcessService.getChannel(MCP_SERVER_CHANNEL);
	}

	get onStatusChanged(): Event<McpServerStatus> {
		return this.channel.listen<McpServerStatus>('onStatusChanged');
	}

	async restart(): Promise<void> {
		return this.channel.call('restart');
	}

	async getStatus(): Promise<McpServerStatus> {
		return this.channel.call('getStatus');
	}

	async getPort(): Promise<number> {
		return this.channel.call('getPort');
	}
}
