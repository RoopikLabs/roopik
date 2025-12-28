/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * MCP Server Service
 *
 * Main process service that hosts an MCP (Model Context Protocol) server.
 * Uses the official @modelcontextprotocol/sdk for proper protocol handling.
 *
 * Architecture:
 * - Uses McpServer from official SDK (handles protocol, versioning, errors)
 * - Uses Zod for type-safe tool parameter validation
 * - Uses DYNAMIC IMPORTS to bypass VSCode's layering restrictions
 * - Uses StreamableHTTPServerTransport (modern standard, replaces deprecated SSE)
 * - Single endpoint /mcp handles both SSE streaming and POST messages
 * - Multiple agents can connect simultaneously (shared IDE state)
 *
 * Reference: https://modelcontextprotocol.io/docs/develop/build-server
 */

import * as http from 'http';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { ILoggerService } from '../../../../../platform/log/common/log.js';
import { getRoopikLogger } from '../../common/roopikLogger.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IMcpServerService, McpServerStatus } from '../../common/mcp/mcpServerService.js';
import type { DevServerService } from '../projectMode/devServer/devServerService.js';
import type { BrowserViewService } from '../projectMode/browserViewService.js';
import type { ComponentService } from '../component/componentService.js';
import type { ICanvasService } from '../../common/canvas/canvasService.js';
import type { IRoopikStorageService } from '../../common/storage/storageService.js';
import { registerProjectTools } from './tools/projectTools.js';
import { registerBrowserTools } from './tools/browserTools.js';
import { registerCanvasTools } from './tools/canvasTools.js';
import { registerContextPrompts } from './tools/contextPrompts.js';

// ============================================================================
// Types
// ============================================================================

// ============================================================================
// MCP Server Service Implementation
// ============================================================================

export class McpServerService implements IMcpServerService {
	readonly _serviceBrand: undefined;

	private static readonly DEFAULT_PORT = 3333;
	private static readonly MAX_PORT_ATTEMPTS = 10;

	private readonly logger;

	// Events
	private readonly _onStatusChanged = new Emitter<McpServerStatus>();
	readonly onStatusChanged: Event<McpServerStatus> = this._onStatusChanged.event;

	// State
	private httpServer: http.Server | null = null;
	private actualPort: number = McpServerService.DEFAULT_PORT;

	// SDK instances (loaded dynamically via import())
	private mcpServer: any = null;

	constructor(
		@ILoggerService loggerService: ILoggerService,
		private readonly devServerService: DevServerService,
		private readonly browserViewService: BrowserViewService,
		private readonly componentService: ComponentService,
		private readonly canvasService: ICanvasService,
		private readonly storageService: IRoopikStorageService,
		private readonly configurationService: IConfigurationService
	) {
		this.logger = getRoopikLogger(loggerService, 'MCP');
	}

	// ============================================================================
	// Server Lifecycle
	// ============================================================================

	async restart(): Promise<void> {
		await this.stop();
		await this.start();
		this.logger.info('Server restarted');
	}

	async start(): Promise<void> {
		if (this.httpServer) {
			this.logger.warn('Server already running');
			return;
		}

		const configuredPort = this.configurationService.getValue<number>('roopik.mcp.port') || McpServerService.DEFAULT_PORT;

		// ------------------------------------------------------------------
		// DYNAMIC IMPORTS (Bypasses VSCode Layering Restrictions)
		// Using StreamableHTTPServerTransport (modern standard)
		// ------------------------------------------------------------------
		const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
		const { StreamableHTTPServerTransport } = await import('@modelcontextprotocol/sdk/server/streamableHttp.js');
		const { z } = await import('zod');

		// Initialize MCP Server using official SDK
		this.mcpServer = new McpServer({
			name: 'roopik-ide',
			version: '1.0.0',
		});

		// Register tools from modular tool files
		registerProjectTools(this.mcpServer, z, this.devServerService, this.browserViewService);
		registerBrowserTools(this.mcpServer, z, this.browserViewService, this.storageService);
		registerCanvasTools(this.mcpServer, z, this.canvasService, this.componentService);

		// Register contextual prompts (workflow guides)
		registerContextPrompts(this.mcpServer);

		// Start HTTP server with retry logic (auto-finds available port)
		this.actualPort = await this.listenWithRetry(configuredPort, StreamableHTTPServerTransport);
		this._onStatusChanged.fire(await this.getStatus());
	}

	// ============================================================================
	// HTTP Server with Streamable HTTP Transport + Retry Logic
	// Single endpoint /mcp handles both SSE streaming and POST messages
	// Automatically retries with next port if configured port is busy
	// ============================================================================

	/**
	 * Tries to listen on 'startPort'. If busy, tries 'startPort + 1', etc.
	 * Returns the port successfully bound to.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- StreamableHTTPServerTransport class from dynamic import
	private async listenWithRetry(startPort: number, StreamableHTTPServerTransport: any, attempt: number = 0): Promise<number> {
		const currentPort = startPort + attempt;

		if (attempt >= McpServerService.MAX_PORT_ATTEMPTS) {
			throw new Error(`Could not find an open port after ${McpServerService.MAX_PORT_ATTEMPTS} attempts (tried ${startPort}-${currentPort - 1})`);
		}

		return new Promise((resolve, reject) => {
			this.httpServer = http.createServer(async (req, res) => {
				// LOG: All incoming requests at the single entry point
				const timestamp = new Date().toISOString();
				const sessionId = req.headers['mcp-session-id'] || 'new';
				console.log(`[MCP] [${timestamp}] ${req.method} ${req.url} | Session: ${sessionId}`);

				// CORS headers (crucial for Streamable HTTP)
				res.setHeader('Access-Control-Allow-Origin', '*');
				res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
				res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id');
				res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');

				// Handle preflight
				if (req.method === 'OPTIONS') {
					console.log(`[MCP] [${timestamp}] Preflight response sent`);
					res.writeHead(204);
					res.end();
					return;
				}

				const url = new URL(req.url || '/', `http://localhost:${currentPort}`);

				// ------------------------------------------------------------------
				// SINGLE ENDPOINT: /mcp handles everything (SSE streaming + POST)
				// The SDK manages session lifecycle via Mcp-Session-Id header
				// ------------------------------------------------------------------
				if (url.pathname === '/mcp') {
					console.log(`[MCP] [${timestamp}] Processing /mcp endpoint | Method: ${req.method}`);

					try {
						// Create transport for this request
						// Stateless mode: sessionIdGenerator returns undefined
						const transport = new StreamableHTTPServerTransport({
							// sessionIdGenerator: () => undefined // Stateless mode
							// OR
							// Let the SDK generate UUIDs by default.
							// This allows the agent to maintain a persistent connection context.
						});

						// Connect transport to MCP server
						await this.mcpServer.connect(transport);
						console.log(`[MCP] [${timestamp}] Transport connected to MCP server`);

						// Log when connection closes
						res.on('close', () => {
							console.log(`[MCP] [${timestamp}] Connection closed | Session: ${sessionId}`);
						});

						res.on('error', (err) => {
							console.error(`[MCP] [${timestamp}] Response error | Session: ${sessionId}`, err);
						});

						await transport.handleRequest(req, res);
						if (!res.headersSent) {
							res.writeHead(500, { 'Content-Type': 'application/json' });
							res.end(JSON.stringify({ error: 'Internal Server Error' }));
						}
					} catch (error) {
						this.logger.error('Error handling MCP request', { sessionId, error });
						if (!res.headersSent) {
							res.writeHead(500, { 'Content-Type': 'application/json' });
							res.end(JSON.stringify({ error: 'Internal Server Error', message: error instanceof Error ? error.message : String(error) }));
						}
					}
					return;
				}

				// Health check endpoint
				if (url.pathname === '/health' && req.method === 'GET') {
					res.writeHead(200, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({
						status: 'ok',
						server: 'roopik-mcp',
						version: '1.0.0',
						protocol: 'streamable-http',
						endpoint: `http://127.0.0.1:${currentPort}/mcp`
					}));
					return;
				}

				// 404 for unknown routes
				res.writeHead(404, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({
					error: 'Not found',
					endpoints: {
						mcp: 'POST /mcp - MCP protocol endpoint (Streamable HTTP)',
						health: 'GET /health - Health check'
					}
				}));
			});

			this.httpServer.on('error', (error: NodeJS.ErrnoException) => {
				if (error.code === 'EADDRINUSE') {
					console.warn(`[MCP] Port ${currentPort} is busy, trying ${currentPort + 1}...`);
					this.httpServer?.close();
					this.httpServer = null;

					// Recursive retry with next port
					this.listenWithRetry(startPort, StreamableHTTPServerTransport, attempt + 1)
						.then(resolve)
						.catch(reject);
				} else {
					this.logger.error('Server error', error);
					reject(error);
				}
			});

			this.httpServer.listen(currentPort, '127.0.0.1', () => {
				this.logger.info('MCP server started', {
					port: currentPort,
					url: `http://127.0.0.1:${currentPort}/mcp`,
					portChanged: attempt > 0
				});
				resolve(currentPort);
			});
		});
	}

	async stop(): Promise<void> {
		if (!this.httpServer) {
			return;
		}

		return new Promise((resolve) => {
			this.httpServer!.close(async () => {
				this.httpServer = null;
				this._onStatusChanged.fire(await this.getStatus());
				resolve();
			});
		});
	}

	async getStatus(): Promise<McpServerStatus> {
		return {
			running: this.httpServer !== null,
			port: this.actualPort,
			url: `http://127.0.0.1:${this.actualPort}/mcp`
		};
	}

	async getPort(): Promise<number> {
		return this.actualPort;
	}
}
