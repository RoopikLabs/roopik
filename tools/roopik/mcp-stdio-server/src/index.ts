#!/usr/bin/env node
/**
 * Roopik MCP STDIO Server
 *
 * Entry point for the standalone MCP server binary.
 * This binary is spawned by external AI agents (Claude Code, Codex, Gemini, etc.)
 *
 * Architecture:
 * ┌──────────────┐     STDIO      ┌──────────────────┐     WebSocket     ┌─────────────┐
 * │   AI Agent   │ ◄────────────► │ This STDIO Server │ ◄───────────────► │ Roopik IDE  │
 * │ (Claude Code)│                │  (roopik-mcp.exe) │                   │ (WebSocket) │
 * └──────────────┘                └──────────────────┘                   └─────────────┘
 *
 * Flow:
 * 1. AI Agent spawns this binary
 * 2. Binary connects to Roopik's WebSocket server
 * 3. STDIO requests are forwarded to Roopik via WebSocket
 * 4. Responses are returned via STDIO
 *
 * Usage:
 *   roopik-mcp [--ws-port <port>] [--ws-url <url>]
 *
 * Options:
 *   --ws-port <port>  WebSocket port to connect to (default: auto-discover)
 *   --ws-url <url>    Full WebSocket URL (overrides --ws-port)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { WebSocketBridge, discoverRoopikServer } from './websocketBridge.js';
import { TOOL_DEFINITIONS, PROMPT_DEFINITIONS, MCP_INSTRUCTIONS } from './tools.js';

// ============================================================================
// CLI Argument Parsing
// ============================================================================

interface CliArgs {
	wsPort?: number;
	wsUrl?: string;
	token?: string;
}

function parseArgs(): CliArgs {
	const args = process.argv.slice(2);
	const result: CliArgs = {};

	for (let i = 0; i < args.length; i++) {
		if (args[i] === '--ws-port' && args[i + 1]) {
			result.wsPort = parseInt(args[i + 1], 10);
			i++;
		} else if (args[i] === '--ws-url' && args[i + 1]) {
			result.wsUrl = args[i + 1];
			i++;
		} else if (args[i] === '--token' && args[i + 1]) {
			result.token = args[i + 1];
			i++;
		}
	}

	return result;
}

// ============================================================================
// Global State
// ============================================================================

let bridge: WebSocketBridge | null = null;
let requestId = 0;

// ============================================================================
// Main Entry Point
// ============================================================================

async function main(): Promise<void> {
	console.error('[Roopik MCP] Starting STDIO server...');

	try {
		// 1. Parse CLI arguments
		const cliArgs = parseArgs();

		// 2. Determine WebSocket URL (CLI > env var > auto-discover)
		let serverUrl: string;
		if (cliArgs.wsUrl) {
			serverUrl = cliArgs.wsUrl;
			console.error(`[Roopik MCP] Using URL from --ws-url: ${serverUrl}`);
		} else if (cliArgs.wsPort) {
			serverUrl = `ws://localhost:${cliArgs.wsPort}/mcp`;
			console.error(`[Roopik MCP] Using port from --ws-port: ${serverUrl}`);
		} else {
			serverUrl = await discoverRoopikServer();
			console.error(`[Roopik MCP] Auto-discovered Roopik at ${serverUrl}`);
		}

		bridge = new WebSocketBridge({ serverUrl, token: cliArgs.token });
		await bridge.connect();
		console.error('[Roopik MCP] Connected to Roopik IDE');

		// 2. Initialize MCP STDIO server with instructions (sent once during initialization)
		const server = new McpServer(
			{ name: 'roopik-mcp', version: '1.0.0' },
			{ instructions: MCP_INSTRUCTIONS }
		);

		// 3. Register all tools
		for (const tool of TOOL_DEFINITIONS) {
			const schemaShape = (tool.schema as { shape?: z.ZodRawShape } | undefined)?.shape;
			if (!schemaShape) {
				throw new Error(`[Roopik MCP] Tool '${tool.name}' schema has no shape — tools.ts and index.ts are using different zod versions (run sync-schemas)`);
			}

			server.tool(
				tool.name,
				tool.description,
				schemaShape,
				async (params: Record<string, unknown>) => {
					return await executeToolViaWebSocket(tool.name, params);
				}
			);
		}

		// 4. Register all prompts
		for (const prompt of PROMPT_DEFINITIONS) {
			server.prompt(
				prompt.name,
				prompt.description,
				async () => ({
					messages: [{
						role: 'user' as const,
						content: {
							type: 'text' as const,
							text: prompt.content
						}
					}]
				})
			);
		}

		// 5. Start STDIO transport
		const transport = new StdioServerTransport();
		await server.connect(transport);

		console.error('[Roopik MCP] STDIO server ready');

		// 6. Handle shutdown
		process.on('SIGINT', () => {
			console.error('[Roopik MCP] Shutting down...');
			bridge?.close();
			process.exit(0);
		});

		process.on('SIGTERM', () => {
			console.error('[Roopik MCP] Shutting down...');
			bridge?.close();
			process.exit(0);
		});

	} catch (error) {
		console.error('[Roopik MCP] Failed to start:', error instanceof Error ? error.message : error);
		process.exit(1);
	}
}

// ============================================================================
// Tool Execution via WebSocket
// ============================================================================

async function executeToolViaWebSocket(
	toolName: string,
	params: Record<string, unknown>
): Promise<{ content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }>; isError?: boolean }> {
	if (!bridge || !bridge.isConnected()) {
		return {
			content: [{ type: 'text', text: 'Error: Not connected to Roopik IDE. Is Roopik running?' }],
			isError: true
		};
	}

	try {
		// Send tool call to Roopik via WebSocket
		const response = await bridge.send({
			jsonrpc: '2.0',
			id: ++requestId,
			method: 'tools/call',
			params: {
				name: toolName,
				arguments: params
			}
		});

		// Handle error response
		if (response.error) {
			return {
				content: [{ type: 'text', text: `Error: ${response.error.message}` }],
				isError: true
			};
		}

		// Extract result from MCP response format
		const result = response.result as {
			content?: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
			isError?: boolean;
		};

		if (!result || !result.content) {
			return {
				content: [{ type: 'text', text: 'No result from tool' }],
				isError: true
			};
		}

		// Return the content directly
		return {
			content: result.content.map(c => {
				if (c.type === 'image' && c.data) {
					return { type: 'image' as const, data: c.data, mimeType: c.mimeType || 'image/png' };
				}
				return { type: 'text' as const, text: c.text || '' };
			}),
			isError: result.isError
		};

	} catch (error) {
		return {
			content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
			isError: true
		};
	}
}

// ============================================================================
// Run
// ============================================================================

main().catch((error) => {
	console.error('[Roopik MCP] Fatal error:', error);
	process.exit(1);
});
