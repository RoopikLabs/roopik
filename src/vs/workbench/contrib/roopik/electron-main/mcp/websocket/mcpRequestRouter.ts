/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * MCP Request Router
 *
 * Routes incoming WebSocket requests to the appropriate tool executor.
 * Handles JSON-RPC style messages from STDIO binaries.
 */

import type { ToolExecutor, ToolCallResult } from '../executor/index.js';
import type { McpPrompt } from '../prompts/index.js';
import { MCP_PROMPTS } from '../prompts/index.js';
import { getToolDefinitionsAsJsonSchema } from '../toolSchemas.js';

// ============================================================================
// Message Types (JSON-RPC style for MCP)
// ============================================================================

export interface McpRequest {
	jsonrpc: '2.0';
	id: string | number;
	method: string;
	params?: Record<string, unknown>;
}

export interface McpResponse {
	jsonrpc: '2.0';
	id: string | number;
	result?: unknown;
	error?: {
		code: number;
		message: string;
		data?: unknown;
	};
}

export interface McpNotification {
	jsonrpc: '2.0';
	method: string;
	params?: Record<string, unknown>;
}

// MCP Error Codes
export const MCP_ERROR_CODES = {
	PARSE_ERROR: -32700,
	INVALID_REQUEST: -32600,
	METHOD_NOT_FOUND: -32601,
	INVALID_PARAMS: -32602,
	INTERNAL_ERROR: -32603,
	TOOL_ERROR: -32000,
} as const;

// ============================================================================
// MCP Request Router
// ============================================================================

export class McpRequestRouter {
	constructor(
		private readonly toolExecutor: ToolExecutor
	) { }

	/**
	 * Route an incoming MCP request and return a response
	 */
	async route(request: McpRequest): Promise<McpResponse> {
		const { id, method, params } = request;

		try {
			switch (method) {
				// ============================================================
				// MCP Lifecycle Methods
				// ============================================================
				case 'initialize':
					return this.handleInitialize(id, params);

				case 'shutdown':
					return this.handleShutdown(id);

				case 'ping':
					return this.createSuccessResponse(id, { pong: true });

				// ============================================================
				// MCP Discovery Methods
				// ============================================================
				case 'tools/list':
					return this.handleToolsList(id);

				case 'prompts/list':
					return this.handlePromptsList(id);

				case 'prompts/get':
					return this.handlePromptsGet(id, params);

				// ============================================================
				// MCP Tool Execution
				// ============================================================
				case 'tools/call':
					return this.handleToolCall(id, params);

				// ============================================================
				// Unknown Method
				// ============================================================
				default:
					return this.createErrorResponse(
						id,
						MCP_ERROR_CODES.METHOD_NOT_FOUND,
						`Unknown method: ${method}`
					);
			}
		} catch (error) {
			return this.createErrorResponse(
				id,
				MCP_ERROR_CODES.INTERNAL_ERROR,
				error instanceof Error ? error.message : 'Internal error'
			);
		}
	}

	// ==========================================================================
	// MCP Lifecycle Handlers
	// ==========================================================================

	private handleInitialize(id: string | number, params?: Record<string, unknown>): McpResponse {
		// Return server capabilities
		return this.createSuccessResponse(id, {
			protocolVersion: '2024-11-05',
			capabilities: {
				tools: { listChanged: false },
				prompts: { listChanged: false },
			},
			serverInfo: {
				name: 'roopik-mcp',
				version: '1.0.0',
				description: 'Roopik IDE MCP Server - Frontend development tools with live browser control'
			}
		});
	}

	private handleShutdown(id: string | number): McpResponse {
		// Acknowledge shutdown
		return this.createSuccessResponse(id, { success: true });
	}

	// ==========================================================================
	// MCP Discovery Handlers
	// ==========================================================================

	private handleToolsList(id: string | number): McpResponse {
		// Return all available tools with their schemas
		const tools = this.getToolDefinitions();
		return this.createSuccessResponse(id, { tools });
	}

	private handlePromptsList(id: string | number): McpResponse {
		// Return all available prompts
		const prompts = MCP_PROMPTS.map((p: McpPrompt) => ({
			name: p.name,
			description: p.description
		}));
		return this.createSuccessResponse(id, { prompts });
	}

	private handlePromptsGet(id: string | number, params?: Record<string, unknown>): McpResponse {
		const name = params?.name as string;
		if (!name) {
			return this.createErrorResponse(id, MCP_ERROR_CODES.INVALID_PARAMS, 'Missing prompt name');
		}

		const prompt = MCP_PROMPTS.find((p: McpPrompt) => p.name === name);
		if (!prompt) {
			return this.createErrorResponse(id, MCP_ERROR_CODES.INVALID_PARAMS, `Unknown prompt: ${name}`);
		}

		return this.createSuccessResponse(id, {
			messages: [{
				role: 'user',
				content: {
					type: 'text',
					text: prompt.content
				}
			}]
		});
	}

	// ==========================================================================
	// MCP Tool Execution Handler
	// ==========================================================================

	private async handleToolCall(id: string | number, params?: Record<string, unknown>): Promise<McpResponse> {
		const toolName = params?.name as string;
		const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;

		if (!toolName) {
			return this.createErrorResponse(id, MCP_ERROR_CODES.INVALID_PARAMS, 'Missing tool name');
		}

		// Execute via unified tool executor
		const result: ToolCallResult = await this.toolExecutor.execute({
			tool: toolName,
			params: toolArgs
		});

		if (result.success) {
			// Return tool result in MCP format
			const contentType = this.getContentType(result.data);
			let contentItem: { type: string; text?: string; data?: string; mimeType?: string };

			if (contentType === 'image') {
				// Extract raw base64 from data-url format (strip "data:image/png;base64," prefix)
				const imageData = (result.data as { image: string }).image;
				const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
				contentItem = { type: 'image', data: base64Data, mimeType: 'image/png' };
			} else {
				contentItem = { type: 'text', text: JSON.stringify(result.data, null, 2) };
			}

			return this.createSuccessResponse(id, {
				content: [contentItem],
				isError: false
			});
		} else {
			// Return error in MCP format
			return this.createSuccessResponse(id, {
				content: [{
					type: 'text',
					text: result.error ?? 'Unknown error'
				}],
				isError: true
			});
		}
	}

	// ==========================================================================
	// Helper Methods
	// ==========================================================================

	private createSuccessResponse(id: string | number, result: unknown): McpResponse {
		return {
			jsonrpc: '2.0',
			id,
			result
		};
	}

	private createErrorResponse(id: string | number, code: number, message: string, data?: unknown): McpResponse {
		return {
			jsonrpc: '2.0',
			id,
			error: { code, message, data }
		};
	}

	private getContentType(data: unknown): 'text' | 'image' {
		// Check if this is an image result (screenshot)
		if (data && typeof data === 'object' && 'image' in data) {
			return 'image';
		}
		return 'text';
	}

	// ==========================================================================
	// Tool Definitions (for tools/list response)
	// Uses shared toolSchemas.ts - Single Source of Truth (DRY)
	// ==========================================================================

	private getToolDefinitions(): Array<{
		name: string;
		description: string;
		inputSchema: Record<string, unknown>;
	}> {
		// Use Zod v4 native .toJsonSchema() via shared definitions
		return getToolDefinitionsAsJsonSchema();
	}
}
