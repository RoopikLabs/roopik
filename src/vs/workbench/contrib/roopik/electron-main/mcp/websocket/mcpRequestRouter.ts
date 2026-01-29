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
	) {}

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
	// ==========================================================================

	private getToolDefinitions(): Array<{
		name: string;
		description: string;
		inputSchema: Record<string, unknown>;
	}> {
		return [
			// ================================================================
			// Browser Tools (12)
			// ================================================================
			{
				name: 'browser_open',
				description: 'Open the browser view. Optionally navigate to a URL.',
				inputSchema: {
					type: 'object',
					properties: {
						url: { type: 'string', description: 'Optional URL to navigate to' }
					}
				}
			},
			{
				name: 'browser_close',
				description: 'Close the browser view.',
				inputSchema: { type: 'object', properties: {} }
			},
			{
				name: 'browser_screenshot',
				description: 'Take a screenshot of the current browser view.',
				inputSchema: { type: 'object', properties: {} }
			},
			{
				name: 'browser_navigate',
				description: 'Navigate to a URL in the browser.',
				inputSchema: {
					type: 'object',
					properties: {
						url: { type: 'string', description: 'URL to navigate to' }
					},
					required: ['url']
				}
			},
			{
				name: 'browser_reload',
				description: 'Reload the current page.',
				inputSchema: {
					type: 'object',
					properties: {
						ignoreCache: { type: 'boolean', description: 'Whether to ignore cache when reloading' }
					}
				}
			},
			{
				name: 'browser_action_input',
				description: 'Perform browser input actions (click, type, scroll, etc.).',
				inputSchema: {
					type: 'object',
					properties: {
						action: {
							type: 'string',
							enum: ['click', 'right_click', 'double_click', 'hover', 'drag', 'type', 'press', 'scroll'],
							description: 'The action to perform'
						},
						coordinate: { type: 'string', description: 'Coordinates in "x,y" format for click/hover actions' },
						text: { type: 'string', description: 'Text to type (for type action)' },
						key: { type: 'string', description: 'Key to press (for press action)' },
						modifiers: {
							type: 'array',
							items: { type: 'string' },
							description: 'Modifier keys (ctrl, alt, shift, meta)'
						},
						deltaX: { type: 'number', description: 'Horizontal scroll delta' },
						deltaY: { type: 'number', description: 'Vertical scroll delta' }
					},
					required: ['action']
				}
			},
			{
				name: 'browser_execute_script',
				description: 'Execute JavaScript in the browser context.',
				inputSchema: {
					type: 'object',
					properties: {
						script: { type: 'string', description: 'JavaScript code to execute' }
					},
					required: ['script']
				}
			},
			{
				name: 'browser_inspect_element',
				description: 'Inspect CSS styles of an element with source file resolution. THE MOAT capability.',
				inputSchema: {
					type: 'object',
					properties: {
						selector: { type: 'string', description: 'CSS selector for the element' },
						includeInherited: { type: 'boolean', description: 'Include inherited styles' }
					},
					required: ['selector']
				}
			},
			{
				name: 'browser_get_errors',
				description: 'Get combined console errors and network failures.',
				inputSchema: {
					type: 'object',
					properties: {
						limit: { type: 'number', description: 'Maximum number of errors to return' }
					}
				}
			},
			{
				name: 'browser_get_console_logs',
				description: 'Get browser console logs.',
				inputSchema: {
					type: 'object',
					properties: {
						types: {
							type: 'array',
							items: { type: 'string' },
							description: 'Filter by log types (log, warn, error, etc.)'
						},
						since: { type: 'number', description: 'Get logs since timestamp' },
						limit: { type: 'number', description: 'Maximum number of logs' },
						clear: { type: 'boolean', description: 'Clear logs after getting' }
					}
				}
			},
			{
				name: 'browser_get_performance',
				description: 'Get browser performance metrics (Web Vitals, runtime metrics).',
				inputSchema: { type: 'object', properties: {} }
			},
			{
				name: 'browser_get_cdp_info',
				description: 'Get browser state information.',
				inputSchema: { type: 'object', properties: {} }
			},

			// ================================================================
			// Canvas Tools (3)
			// ================================================================
			{
				name: 'canvas_list',
				description: 'List all canvases.',
				inputSchema: {
					type: 'object',
					properties: {
						nameFilter: { type: 'string', description: 'Filter by name' },
						sortBy: {
							type: 'string',
							enum: ['name', 'updatedAt', 'createdAt', 'componentCount'],
							description: 'Sort field'
						},
						sortDirection: {
							type: 'string',
							enum: ['asc', 'desc'],
							description: 'Sort direction'
						}
					}
				}
			},
			{
				name: 'canvas_get_active',
				description: 'Get the currently active/focused canvas.',
				inputSchema: { type: 'object', properties: {} }
			},
			{
				name: 'canvas_create',
				description: 'Create a new canvas or get existing one with same name.',
				inputSchema: {
					type: 'object',
					properties: {
						name: { type: 'string', description: 'Canvas name' }
					},
					required: ['name']
				}
			},

			// ================================================================
			// Component Tools (6)
			// ================================================================
			{
				name: 'component_add',
				description: 'Add a component to a canvas for live preview.',
				inputSchema: {
					type: 'object',
					properties: {
						canvasId: { type: 'string', description: 'Target canvas ID (uses active if not provided)' },
						folderPath: { type: 'string', description: 'Path to component folder' },
						name: { type: 'string', description: 'Component name (auto-detected if not provided)' },
						entryFile: { type: 'string', description: 'Entry file (auto-detected if not provided)' },
						framework: {
							type: 'string',
							enum: ['react', 'vue', 'svelte', 'solid', 'preact', 'html'],
							description: 'Framework (auto-detected if not provided)'
						}
					},
					required: ['folderPath']
				}
			},
			{
				name: 'component_add_batch',
				description: 'Add multiple components at once.',
				inputSchema: {
					type: 'object',
					properties: {
						components: {
							type: 'array',
							items: {
								type: 'object',
								properties: {
									canvasId: { type: 'string' },
									folderPath: { type: 'string' },
									name: { type: 'string' },
									entryFile: { type: 'string' },
									framework: { type: 'string' }
								},
								required: ['folderPath']
							},
							description: 'Array of components to add'
						}
					},
					required: ['components']
				}
			},
			{
				name: 'component_remove',
				description: 'Remove a component from canvas.',
				inputSchema: {
					type: 'object',
					properties: {
						componentId: { type: 'string', description: 'Component ID' },
						deleteSourceCode: { type: 'boolean', description: 'Also delete source files' }
					},
					required: ['componentId']
				}
			},
			{
				name: 'component_get_info',
				description: 'Get detailed component information including build state.',
				inputSchema: {
					type: 'object',
					properties: {
						componentId: { type: 'string', description: 'Component ID' }
					},
					required: ['componentId']
				}
			},
			{
				name: 'component_list',
				description: 'List all components in a canvas.',
				inputSchema: {
					type: 'object',
					properties: {
						canvasId: { type: 'string', description: 'Canvas ID' }
					},
					required: ['canvasId']
				}
			},
			{
				name: 'component_rebuild',
				description: 'Trigger rebuild of a component.',
				inputSchema: {
					type: 'object',
					properties: {
						componentId: { type: 'string', description: 'Component ID' }
					},
					required: ['componentId']
				}
			},

			// ================================================================
			// Project Tools (3)
			// ================================================================
			{
				name: 'project_get_active',
				description: 'Check if a dev server is running and get its info.',
				inputSchema: { type: 'object', properties: {} }
			},
			{
				name: 'project_start',
				description: 'Start a development server for a project.',
				inputSchema: {
					type: 'object',
					properties: {
						projectPath: { type: 'string', description: 'Path to project (relative or absolute)' },
						port: { type: 'number', description: 'Optional port number' }
					},
					required: ['projectPath']
				}
			},
			{
				name: 'project_stop',
				description: 'Stop the running development server.',
				inputSchema: { type: 'object', properties: {} }
			}
		];
	}
}
