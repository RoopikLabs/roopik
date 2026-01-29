/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * MCP WebSocket Module
 *
 * Exports WebSocket server infrastructure for MCP communication.
 * This server runs INSIDE Roopik and accepts connections from external STDIO binaries.
 */

// Server
export { McpWebSocketServer } from './mcpWebSocketServer.js';
export type { McpWebSocketServerOptions, McpConnectionInfo, McpServerStatus } from './mcpWebSocketServer.js';

// Router
export { McpRequestRouter, MCP_ERROR_CODES } from './mcpRequestRouter.js';
export type { McpRequest, McpResponse, McpNotification } from './mcpRequestRouter.js';
