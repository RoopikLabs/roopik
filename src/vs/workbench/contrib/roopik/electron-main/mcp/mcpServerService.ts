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
import { IMcpServerService, McpServerStatus, AgentId, AgentStatus, McpIntegrationStatus } from '../../common/mcp/mcpServerService.js';
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

	private readonly _onAgentStatusChanged = this._register(new Emitter<AgentStatus[]>());
	readonly onAgentStatusChanged: Event<AgentStatus[]> = this._onAgentStatusChanged.event;

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
		// Initialize Tool Executor (unified execution layer) - shared by both transports
		if (!this.toolExecutor) {
			this.toolExecutor = new ToolExecutor(
				this.browserViewService,
				this.storageService,
				this.canvasService,
				this.componentService,
				this.devServerService
			);
		}

		// Check STDIO/WebSocket setting (primary transport)
		const wsEnabled = this.configurationService.getValue<boolean>('roopik.mcp.enabled') ?? true;
		if (wsEnabled && !this.wsServer) {
			await this.startWebSocketServer();
			// Initialize installer and register with external agents (requires WS)
			await this.initializeInstaller();
		}

		// Check HTTP setting (advanced transport)
		const httpEnabled = this.configurationService.getValue<boolean>('roopik.mcp.httpEnabled') ?? false;
		if (httpEnabled && !this.httpServer) {
			await this.startHttpServer();
		}

		// Listen for settings changes
		if (!this.settingsDisposable) {
			this.setupSettingsListener();
		}

		this._onStatusChanged.fire(await this.getStatus());
	}

	async stop(): Promise<void> {
		await this.stopWsServer();
		await this.stopHttpServer();

		// Dispose settings listener only if both servers are stopped
		if (!this.wsServer && !this.httpServer && this.settingsDisposable) {
			this.settingsDisposable.dispose();
			this.settingsDisposable = null;
		}

		this._onStatusChanged.fire(await this.getStatus());
	}

	private async stopWsServer(): Promise<void> {
		// Stop WebSocket server
		if (this.wsServer) {
			await this.wsServer.stop();
			this.wsServer = null;
			this.logger.info('WebSocket MCP server stopped');
		}

		// Cleanup installer (unregister from agents if configured)
		if (this.installer) {
			const cleanupOnExit = this.configurationService.getValue<boolean>('roopik.mcp.cleanupOnExit') ?? false;
			if (cleanupOnExit) {
				await this.installer.removeAllIntegrations();
			}
		}
	}

	private async stopHttpServer(): Promise<void> {
		// Stop HTTP server
		if (this.httpServer) {
			await new Promise<void>((resolve) => {
				this.httpServer!.close(() => {
					this.httpServer = null;
					resolve();
				});
			});
			this.logger.info('HTTP MCP server stopped');
		}
	}

	// ============================================================================
	// HTTP Server (StreamableHTTP Transport)
	// ============================================================================

	private async startHttpServer(): Promise<void> {
		const configuredPort = this.configurationService.getValue<number>('roopik.mcp.httpPort') || McpServerService.DEFAULT_HTTP_PORT;

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

		const configuredPort = this.configurationService.getValue<number>('roopik.mcp.port') || McpServerService.DEFAULT_WS_PORT;

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
			// Handle STDIO/WS switch changes
			if (e.affectsConfiguration('roopik.mcp.enabled')) {
				const enabled = this.configurationService.getValue<boolean>('roopik.mcp.enabled') ?? true;
				if (!enabled && this.wsServer) {
					this.logger.info('STDIO/WS disabled via settings');
					await this.setEnabled(false);
				} else if (enabled && !this.wsServer) {
					this.logger.info('STDIO/WS enabled via settings');
					await this.setEnabled(true);
				}
			}

			// Handle HTTP switch changes
			if (e.affectsConfiguration('roopik.mcp.httpEnabled')) {
				const enabled = this.configurationService.getValue<boolean>('roopik.mcp.httpEnabled') ?? false;
				if (!enabled && this.httpServer) {
					this.logger.info('HTTP MCP disabled via settings');
					await this.setHttpEnabled(false);
				} else if (enabled && !this.httpServer) {
					this.logger.info('HTTP MCP enabled via settings');
					await this.setHttpEnabled(true);
				}
			}

			// Handle agent settings changes
			if (e.affectsConfiguration('roopik.mcp.agents')) {
				this.logger.info('MCP agent settings changed, syncing registrations');
				if (this.installer) {
					const settings = this.getMcpIntegrationSettings();
					await this.installer.syncRegistrations(settings);
					this._onAgentStatusChanged.fire(await this.getAgentStatus());
				}
			}
		}) as Disposable;
	}

	// ============================================================================
	// Status
	// ============================================================================

	async getStatus(): Promise<McpServerStatus> {
		return {
			running: this.wsServer !== null,
			httpRunning: this.httpServer !== null,
			port: this.httpPort,
			wsPort: this.wsPort,
			url: `http://127.0.0.1:${this.httpPort}/mcp`
		};
	}

	async getPort(): Promise<number> {
		return this.httpPort;
	}

	async getWsPort(): Promise<number> {
		return this.wsPort;
	}

	getWebSocketPort(): number {
		return this.wsPort;
	}

	getInstaller(): McpInstaller | null {
		return this.installer;
	}

	// ============================================================================
	// STDIO/WebSocket Control (Primary)
	// ============================================================================

	async isEnabled(): Promise<boolean> {
		return this.configurationService.getValue<boolean>('roopik.mcp.enabled') ?? true;
	}

	async setEnabled(enabled: boolean): Promise<void> {
		// Update the setting
		await this.configurationService.updateValue('roopik.mcp.enabled', enabled);

		if (enabled) {
			// Start WebSocket if not running
			if (!this.wsServer) {
				// Initialize Tool Executor if needed
				if (!this.toolExecutor) {
					this.toolExecutor = new ToolExecutor(
						this.browserViewService,
						this.storageService,
						this.canvasService,
						this.componentService,
						this.devServerService
					);
				}
				await this.startWebSocketServer();
				await this.initializeInstaller();
				if (!this.settingsDisposable) {
					this.setupSettingsListener();
				}
			}
		} else {
			// Stop WebSocket and unregister all agents
			if (this.installer) {
				this.logger.info('STDIO/WS disabled - unregistering from all agents');
				await this.installer.removeAllIntegrations();
				this._onAgentStatusChanged.fire(await this.getAgentStatus());
			}
			await this.stopWsServer();
		}

		this._onStatusChanged.fire(await this.getStatus());
	}

	// ============================================================================
	// HTTP Control (Advanced)
	// ============================================================================

	async isHttpEnabled(): Promise<boolean> {
		return this.configurationService.getValue<boolean>('roopik.mcp.httpEnabled') ?? false;
	}

	async setHttpEnabled(enabled: boolean): Promise<void> {
		// Update the setting
		await this.configurationService.updateValue('roopik.mcp.httpEnabled', enabled);

		if (enabled) {
			// Start HTTP if not running
			if (!this.httpServer) {
				// Initialize Tool Executor if needed
				if (!this.toolExecutor) {
					this.toolExecutor = new ToolExecutor(
						this.browserViewService,
						this.storageService,
						this.canvasService,
						this.componentService,
						this.devServerService
					);
				}
				await this.startHttpServer();
				if (!this.settingsDisposable) {
					this.setupSettingsListener();
				}
			}
		} else {
			// Stop HTTP server
			await this.stopHttpServer();
		}

		this._onStatusChanged.fire(await this.getStatus());
	}

	// ============================================================================
	// Agent Control
	// ============================================================================

	async getAgentStatus(): Promise<AgentStatus[]> {
		if (!this.installer) {
			return [];
		}

		const status = await this.installer.getAgentStatus();
		return status.agents.map(agent => ({
			id: agent.id as AgentId,
			name: agent.name,
			installed: agent.installed,
			registered: agent.registered,
			registrationMethod: agent.registrationMethod === 'api' ? 'cli-command' : agent.registrationMethod
		}));
	}

	async getIntegrationStatus(): Promise<McpIntegrationStatus> {
		return {
			server: await this.getStatus(),
			agents: await this.getAgentStatus(),
			lastChecked: Date.now()
		};
	}

	async enableAgent(agentId: AgentId): Promise<void> {
		// Update setting
		const settingKey = this.agentIdToSettingKey(agentId);
		if (settingKey) {
			await this.configurationService.updateValue(settingKey, true);
		}

		// Register if master is enabled
		const masterEnabled = await this.isEnabled();
		if (masterEnabled && this.installer) {
			const result = await this.installer.register(agentId);
			if (result.success) {
				this.logger.info(`Enabled agent: ${agentId}`);
			} else {
				this.logger.warn(`Failed to enable agent: ${agentId}`, { error: result.error });
			}
			this._onAgentStatusChanged.fire(await this.getAgentStatus());
		}
	}

	async disableAgent(agentId: AgentId): Promise<void> {
		// Update setting
		const settingKey = this.agentIdToSettingKey(agentId);
		if (settingKey) {
			await this.configurationService.updateValue(settingKey, false);
		}

		// Unregister
		if (this.installer) {
			const result = await this.installer.unregister(agentId);
			if (result.success) {
				this.logger.info(`Disabled agent: ${agentId}`);
			} else {
				this.logger.warn(`Failed to disable agent: ${agentId}`, { error: result.error });
			}
			this._onAgentStatusChanged.fire(await this.getAgentStatus());
		}
	}

	async syncAgentRegistrations(): Promise<void> {
		if (!this.installer) {
			return;
		}

		const settings = this.getMcpIntegrationSettings();
		await this.installer.syncRegistrations(settings);
		this._onAgentStatusChanged.fire(await this.getAgentStatus());
	}

	private agentIdToSettingKey(agentId: AgentId): string | null {
		const map: Record<AgentId, string> = {
			'claude-code': 'roopik.mcp.agents.claudeCode',
			'claude-cli': 'roopik.mcp.agents.claudeCli',
			'codex': 'roopik.mcp.agents.codex',
			'codex-cli': 'roopik.mcp.agents.codexCli',
			'gemini': 'roopik.mcp.agents.gemini',
			'windsurf': 'roopik.mcp.agents.windsurf',
			'cursor': 'roopik.mcp.agents.cursor'
		};
		return map[agentId] || null;
	}
}
