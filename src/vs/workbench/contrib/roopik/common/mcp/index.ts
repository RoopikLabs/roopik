/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * MCP Server Module - Public API
 */

export {
	IMcpServerService,
	McpServerStatus,
	AgentId,
	AgentStatus,
	McpIntegrationStatus
} from './mcpServerService.js';

export const MCP_SERVER_CHANNEL = 'roopik:mcpServer';
