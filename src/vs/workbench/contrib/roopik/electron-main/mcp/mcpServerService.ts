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
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IMcpServerService, McpServerStatus } from '../../common/mcp/mcpServerService.js';
import type { DevServerService } from '../projectMode/devServer/devServerService.js';
import type { ProjectStorageService } from '../projectStorage/projectStorageService.js';

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

	// Events
	private readonly _onStatusChanged = new Emitter<McpServerStatus>();
	readonly onStatusChanged: Event<McpServerStatus> = this._onStatusChanged.event;

	// State
	private httpServer: http.Server | null = null;
	private actualPort: number = McpServerService.DEFAULT_PORT; // Track the port we successfully bound to

	// SDK instances (loaded dynamically via import())
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- McpServer type from dynamic import
	private mcpServer: any = null;

	constructor(
		private readonly devServerService: DevServerService,
		private readonly projectStorageService: ProjectStorageService,
		private readonly configurationService: IConfigurationService
	) {
		// We do NOT initialize in constructor to keep startup fast
		// SDK is loaded dynamically in start()
	}

	// ============================================================================
	// Server Lifecycle
	// ============================================================================

	async restart(): Promise<void> {
		console.log('[MCP] Restarting server...');
		await this.stop();
		await this.start();
		console.log('[MCP] Server restarted successfully');
	}

	async start(): Promise<void> {
		if (this.httpServer) {
			console.log('[MCP] Server already running');
			return;
		}

		console.log('[MCP] Initializing MCP Server...');

		// Get configured port from user settings (default: 3333)
		const configuredPort = this.configurationService.getValue<number>('roopik.mcp.port') || McpServerService.DEFAULT_PORT;
		console.log(`[MCP] Configured port: ${configuredPort}`);

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

		// Register tools with SDK + Zod validation
		await this.registerTools(z);

		// Start HTTP server with retry logic (auto-finds available port)
		this.actualPort = await this.listenWithRetry(configuredPort, StreamableHTTPServerTransport);
		this._onStatusChanged.fire(this.getStatus());
	}

	// ============================================================================
	// Tool Registration (Using SDK + Zod)
	// ============================================================================

	private async registerTools(z: typeof import('zod').z): Promise<void> {
		// ------------------------------------------------------------------
		// TOOL 1: Ping (health check)
		// ------------------------------------------------------------------
		this.mcpServer.tool(
			'roopik_ping',
			'Health check - verifies MCP server is running and responsive',
			{},
			async () => {
				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: true,
							message: 'Roopik MCP Server is running',
							timestamp: new Date().toISOString(),
							version: '1.0.0'
						})
					}]
				};
			}
		);

		// ------------------------------------------------------------------
		// TOOL 2: Get Project Status
		// ------------------------------------------------------------------
		this.mcpServer.tool(
			'roopik_getProjectStatus',
			'Get the status of a dev server for a project. Returns running state, URL, port, and framework.',
			{
				projectPath: z.string().describe('Absolute path to the project folder')
			},
			async ({ projectPath }: { projectPath: string }) => {
				try {
					const serverInfo = await this.devServerService.getServerInfo(projectPath);

					if (!serverInfo) {
						return {
							content: [{
								type: 'text' as const,
								text: JSON.stringify({
									success: true,
									projectPath,
									running: false,
									message: 'No dev server running for this project'
								})
							}]
						};
					}

					return {
						content: [{
							type: 'text' as const,
							text: JSON.stringify({
								success: true,
								projectPath,
								running: serverInfo.state === 'running',
								state: serverInfo.state,
								url: serverInfo.url,
								port: serverInfo.port,
								framework: serverInfo.framework
							})
						}]
					};
				} catch (error: unknown) {
					const message = error instanceof Error ? error.message : String(error);
					return {
						content: [{
							type: 'text' as const,
							text: JSON.stringify({
								success: false,
								error: message,
								projectPath
							})
						}],
						isError: true
					};
				}
			}
		);

		// ------------------------------------------------------------------
		// TOOL 3: Get Active Project
		// ------------------------------------------------------------------
		this.mcpServer.tool(
			'roopik_getActiveProject',
			'Get the currently active/running project in Roopik IDE. Returns project info including URL if running.',
			{},
			async () => {
				try {
					const activeProject = await this.projectStorageService.getActiveProject();

					if (!activeProject) {
						return {
							content: [{
								type: 'text' as const,
								text: JSON.stringify({
									success: true,
									hasActiveProject: false,
									message: 'No project is currently running'
								})
							}]
						};
					}

					return {
						content: [{
							type: 'text' as const,
							text: JSON.stringify({
								success: true,
								hasActiveProject: true,
								...activeProject
							})
						}]
					};
				} catch (error: unknown) {
					const message = error instanceof Error ? error.message : String(error);
					return {
						content: [{
							type: 'text' as const,
							text: JSON.stringify({
								success: false,
								error: message
							})
						}],
						isError: true
					};
				}
			}
		);

		console.log('[MCP] Registered 3 tools: roopik_ping, roopik_getProjectStatus, roopik_getActiveProject');
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
				// CORS headers (crucial for Streamable HTTP)
				res.setHeader('Access-Control-Allow-Origin', '*');
				res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
				res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id');
				res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');

				// Handle preflight
				if (req.method === 'OPTIONS') {
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

						// Hand off request to transport - it handles SSE/POST internally
						await transport.handleRequest(req, res);

					} catch (err) {
						console.error('[MCP] Transport Error:', err);
						if (!res.headersSent) {
							res.writeHead(500, { 'Content-Type': 'application/json' });
							res.end(JSON.stringify({ error: 'Internal Server Error' }));
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
					console.error('[MCP] Server error:', error);
					reject(error);
				}
			});

			this.httpServer.listen(currentPort, '127.0.0.1', () => {
				console.log(`[MCP]    Server running at http://127.0.0.1:${currentPort}/mcp`);
				console.log(`[MCP]    Health check: http://127.0.0.1:${currentPort}/health`);
				console.log(`[MCP]    Protocol: Streamable HTTP (modern)`);
				if (attempt > 0) {
					console.log(`[MCP]    Note: Started on port ${currentPort} (configured port ${startPort} was busy)`);
				}
				resolve(currentPort); // Return the actual port we bound to
			});
		});
	}

	async stop(): Promise<void> {
		if (!this.httpServer) {
			return;
		}

		return new Promise((resolve) => {
			this.httpServer!.close(() => {
				console.log('[MCP] Server stopped');
				this.httpServer = null;
				this._onStatusChanged.fire(this.getStatus());
				resolve();
			});
		});
	}

	getStatus(): McpServerStatus {
		return {
			running: this.httpServer !== null,
			port: this.actualPort,
			url: `http://127.0.0.1:${this.actualPort}/mcp`
		};
	}

	getPort(): number {
		return this.actualPort;
	}
}
