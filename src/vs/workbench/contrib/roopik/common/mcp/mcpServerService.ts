/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * MCP Server Service Interface
 *
 * Common interface shared between main process (McpServerService) and renderer (client).
 */

import { Event } from '../../../../../base/common/event.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';

export const IMcpServerService = createDecorator<IMcpServerService>('mcpServerService');

export interface McpServerStatus {
	running: boolean;
	port: number;
	url: string;
	error?: string;
}

export interface IMcpServerService {
	readonly _serviceBrand: undefined;

	/** Event fired when MCP server status changes */
	readonly onStatusChanged: Event<McpServerStatus>;

	/** Restart the MCP server (stop + start) */
	restart(): Promise<void>;

	/** Get current server status */
	getStatus(): Promise<McpServerStatus>;

	/** Get the port the server is running on */
	getPort(): Promise<number>;
}
