/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * MCP Server Service
 *
 * Main process service that hosts MCP (Model Context Protocol) servers.
 *
 * Architecture:
 * - HTTP Server (port 3333): StreamableHTTP for direct agent connections
 * - WebSocket Server (port 9876): For STDIO binary connections from external agents
 * - Installer: Auto-registers with Claude Code, Codex, Gemini, Windsurf, Cursor
 * - Unified ToolExecutor: Both transports use same tool execution layer
 *
 * External Agent Flow:
 * 1. On startup, Installer registers Roopik STDIO binary with external agents
 * 2. When agent (e.g., Claude Code) starts, it spawns our STDIO binary
 * 3. STDIO binary connects to our WebSocket server
 * 4. Tool calls flow: Agent -> STDIO -> WebSocket -> ToolExecutor -> IDE Services
 */

import * as http from 'http';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
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

// Phase 5: Integration imports
import { ToolExecutor } from './executor/index.js';
import { McpWebSocketServer } from './websocket/index.js';
import { McpInstaller, type McpPlatformAdapter, type McpIntegrationSettings } from './installer/index.js';

// ============================================================================
// MCP Server Service Implementation
// ============================================================================

export class McpServerService extends Disposable implements IMcpServerService {
	readonly _serviceBrand: undefined;

	// Port configuration
	private static readonly DEFAULT_HTTP_PORT = 3333;
	private static readonly DEFAULT_WS_PORT = 9876;
	private static readonly MAX_PORT_ATTEMPTS = 10;

	private readonly logger;

	// Events
	private readonly _onStatusChanged = this._register(new Emitter<McpServerStatus>());
	readonly onStatusChanged: Event<McpServerStatus> = this._onStatusChanged.event;

	// HTTP Server (StreamableHTTP transport)
	private httpServer: http.Server | null = null;
	private httpPort: number = McpServerService.DEFAULT_HTTP_PORT;
	private mcpServer: any = null;

	// WebSocket Server (for STDIO binaries)
	private wsServer: McpWebSocketServer | null = null;
	private wsPort: number = McpServerService.DEFAULT_WS_PORT;

	// Unified Tool Executor
	private toolExecutor: ToolExecutor | null = null;

	// Installer (for external agent registration)
	private installer: McpInstaller | null = null;

	// Settings change listener
	private settingsDisposable: Disposable | null = null;

	constructor(
		@ILoggerService loggerService: ILoggerService,
		private readonly devServerService: DevServerService,
		private readonly browserViewService: BrowserViewService,
		private readonly componentService: ComponentService,
		private readonly canvasService: ICanvasService,
		private readonly storageService: IRoopikStorageService,
		private readonly configurationService: IConfigurationService
	) {
		super();
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

		// Initialize Tool Executor (unified execution layer)
		this.toolExecutor = new ToolExecutor(
			this.browserViewService,
			this.storageService,
			this.canvasService,
			this.componentService,
			this.devServerService
		);

		// Start HTTP server (StreamableHTTP)
		await this.startHttpServer();

		// Start WebSocket server (for STDIO binaries)
		await this.startWebSocketServer();

		// Initialize installer and register with external agents
		await this.initializeInstaller();

		// Listen for settings changes
		this.setupSettingsListener();

		this._onStatusChanged.fire(await this.getStatus());
	}

	async stop(): Promise<void> {
		// Stop WebSocket server
		if (this.wsServer) {
			await this.wsServer.stop();
			this.wsServer = null;
		}

		// Stop HTTP server
		if (this.httpServer) {
			await new Promise<void>((resolve) => {
				this.httpServer!.close(() => {
					this.httpServer = null;
					resolve();
				});
			});
		}

		// Cleanup installer (unregister from agents if configured)
		if (this.installer) {
			const cleanupOnExit = this.configurationService.getValue<boolean>('roopik.mcp.cleanupOnExit') ?? false;
			if (cleanupOnExit) {
				await this.installer.removeAllIntegrations();
			}
		}

		// Dispose settings listener
		if (this.settingsDisposable) {
			this.settingsDisposable.dispose();
			this.settingsDisposable = null;
		}

		this._onStatusChanged.fire(await this.getStatus());
	}

	// ============================================================================
	// HTTP Server (StreamableHTTP Transport)
	// ============================================================================

	private async startHttpServer(): Promise<void> {
		const configuredPort = this.configurationService.getValue<number>('roopik.mcp.port') || McpServerService.DEFAULT_HTTP_PORT;

		// Dynamic imports (bypass VSCode layering restrictions)
		const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
		const { StreamableHTTPServerTransport } = await import('@modelcontextprotocol/sdk/server/streamableHttp.js');
		const { z } = await import('zod');

		// Initialize MCP Server
		this.mcpServer = new McpServer({
			name: 'roopik-ide',
			version: '1.0.0',
		});

		// Register tools
		registerProjectTools(this.mcpServer, z, this.devServerService, this.browserViewService, this.storageService);
		registerBrowserTools(this.mcpServer, z, this.browserViewService, this.storageService);
		registerCanvasTools(this.mcpServer, z, this.canvasService, this.componentService);
		registerContextPrompts(this.mcpServer);

		// Start with retry logic
		this.httpPort = await this.listenWithRetry(configuredPort, StreamableHTTPServerTransport);
		this.logger.info('HTTP MCP server started', { port: this.httpPort });
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private async listenWithRetry(startPort: number, StreamableHTTPServerTransport: any, attempt: number = 0): Promise<number> {
		const currentPort = startPort + attempt;

		if (attempt >= McpServerService.MAX_PORT_ATTEMPTS) {
			throw new Error(`Could not find open port after ${McpServerService.MAX_PORT_ATTEMPTS} attempts`);
		}

		return new Promise((resolve, reject) => {
			this.httpServer = http.createServer(async (req, res) => {
				const sessionId = req.headers['mcp-session-id'] || 'new';

				// CORS headers
				res.setHeader('Access-Control-Allow-Origin', '*');
				res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
				res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id');
				res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');

				if (req.method === 'OPTIONS') {
					res.writeHead(204);
					res.end();
					return;
				}

				const url = new URL(req.url || '/', `http://localhost:${currentPort}`);

				if (url.pathname === '/mcp') {
					try {
						const transport = new StreamableHTTPServerTransport({});
						await this.mcpServer.connect(transport);
						await transport.handleRequest(req, res);
						if (!res.headersSent) {
							res.writeHead(500, { 'Content-Type': 'application/json' });
							res.end(JSON.stringify({ error: 'Internal Server Error' }));
						}
					} catch (error) {
						this.logger.error('Error handling MCP request', { sessionId, error });
						if (!res.headersSent) {
							res.writeHead(500, { 'Content-Type': 'application/json' });
							res.end(JSON.stringify({ error: 'Internal Server Error' }));
						}
					}
					return;
				}

				if (url.pathname === '/health' && req.method === 'GET') {
					res.writeHead(200, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({
						status: 'ok',
						server: 'roopik-mcp',
						version: '1.0.0',
						httpPort: this.httpPort,
						wsPort: this.wsPort
					}));
					return;
				}

				res.writeHead(404, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ error: 'Not found' }));
			});

			this.httpServer.on('error', (error: NodeJS.ErrnoException) => {
				if (error.code === 'EADDRINUSE') {
					this.logger.warn('HTTP port busy, trying next', { port: currentPort });
					this.httpServer?.close();
					this.httpServer = null;
					this.listenWithRetry(startPort, StreamableHTTPServerTransport, attempt + 1)
						.then(resolve)
						.catch(reject);
				} else {
					reject(error);
				}
			});

			this.httpServer.listen(currentPort, '127.0.0.1', () => resolve(currentPort));
		});
	}

	// ============================================================================
	// WebSocket Server (for STDIO Binary connections)
	// ============================================================================

	private async startWebSocketServer(): Promise<void> {
		if (!this.toolExecutor) {
			throw new Error('ToolExecutor not initialized');
		}

		const configuredPort = this.configurationService.getValue<number>('roopik.mcp.wsPort') || McpServerService.DEFAULT_WS_PORT;

		this.wsServer = new McpWebSocketServer(this.toolExecutor);
		const result = await this.wsServer.start({ port: configuredPort });
		this.wsPort = result.port;

		this.logger.info('WebSocket MCP server started', { port: this.wsPort });
	}

	// ============================================================================
	// Installer (External Agent Registration)
	// ============================================================================

	private async initializeInstaller(): Promise<void> {
		this.installer = new McpInstaller();
		this.installer.setWsPort(this.wsPort);

		// Create platform adapter for VS Code extension access
		const platformAdapter: McpPlatformAdapter = {
			getExternalExtensionPath: (extensionId: string) => {
				// In electron-main, we don't have direct access to vscode.extensions
				// This would need to be implemented via IPC if needed
				return undefined;
			},
			log: {
				info: (msg: string) => this.logger.info(msg),
				warn: (msg: string, err?: unknown) => this.logger.warn(msg, err),
				error: (msg: string, err?: unknown) => this.logger.error(msg, err),
			}
		};

		this.installer.setPlatformAdapter(platformAdapter);

		// Auto-register based on settings
		const autoRegister = this.configurationService.getValue<boolean>('roopik.mcp.autoRegister') ?? true;
		if (autoRegister) {
			await this.registerWithAgents();
		}
	}

	private async registerWithAgents(): Promise<void> {
		if (!this.installer) {
			return;
		}

		const settings = this.getMcpIntegrationSettings();
		const results = await this.installer.setupSelectiveIntegrations(settings);

		for (const result of results) {
			if (result.success) {
				this.logger.info(`Registered with ${result.agent}`);
			} else {
				this.logger.warn(`Failed to register with ${result.agent}`, { error: result.error });
			}
		}
	}

	private getMcpIntegrationSettings(): McpIntegrationSettings {
		return {
			claudeCode: this.configurationService.getValue<boolean>('roopik.mcp.agents.claudeCode') ?? true,
			claudeCli: this.configurationService.getValue<boolean>('roopik.mcp.agents.claudeCli') ?? true,
			codex: this.configurationService.getValue<boolean>('roopik.mcp.agents.codex') ?? false,
			codexCli: this.configurationService.getValue<boolean>('roopik.mcp.agents.codexCli') ?? false,
			gemini: this.configurationService.getValue<boolean>('roopik.mcp.agents.gemini') ?? false,
			windsurf: this.configurationService.getValue<boolean>('roopik.mcp.agents.windsurf') ?? false,
			cursor: this.configurationService.getValue<boolean>('roopik.mcp.agents.cursor') ?? false,
		};
	}

	// ============================================================================
	// Settings Change Listener
	// ============================================================================

	private setupSettingsListener(): void {
		this.settingsDisposable = this.configurationService.onDidChangeConfiguration(async (e) => {
			if (e.affectsConfiguration('roopik.mcp.agents')) {
				this.logger.info('MCP agent settings changed, syncing registrations');
				if (this.installer) {
					const settings = this.getMcpIntegrationSettings();
					await this.installer.syncRegistrations(settings);
				}
			}
		}) as Disposable;
	}

	// ============================================================================
	// Status
	// ============================================================================

	async getStatus(): Promise<McpServerStatus> {
		return {
			running: this.httpServer !== null,
			port: this.httpPort,
			url: `http://127.0.0.1:${this.httpPort}/mcp`
		};
	}

	async getPort(): Promise<number> {
		return this.httpPort;
	}

	getWebSocketPort(): number {
		return this.wsPort;
	}

	getInstaller(): McpInstaller | null {
		return this.installer;
	}
}
