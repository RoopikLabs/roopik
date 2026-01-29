/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * MCP WebSocket Server
 *
 * WebSocket server running INSIDE Roopik (electron-main process).
 * Accepts connections from external STDIO binaries.
 *
 * Key responsibilities:
 * - Start server on an available port
 * - Accept multiple concurrent connections
 * - Route messages to McpRequestRouter
 * - Handle connection lifecycle
 *
 * Note: Uses dynamic import for 'ws' to bypass VS Code layering rules.
 */

import { createServer, Server as HttpServer } from 'http';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { McpRequestRouter, McpRequest, McpResponse, MCP_ERROR_CODES } from './mcpRequestRouter.js';
import type { ToolExecutor } from '../executor/index.js';

// ============================================================================
// Types
// ============================================================================

export interface McpWebSocketServerOptions {
	/** Port to listen on. If 0, auto-assigns an available port. */
	port?: number;
	/** Host to bind to. Defaults to localhost for security. */
	host?: string;
}

export interface McpConnectionInfo {
	id: string;
	connectedAt: number;
	clientInfo?: {
		name?: string;
		version?: string;
	};
}

export interface McpServerStatus {
	running: boolean;
	port?: number;
	host?: string;
	connections: McpConnectionInfo[];
}

// WebSocket types (from 'ws' package, used with dynamic import)
interface WsWebSocket {
	readyState: number;
	send(data: string): void;
	close(code?: number, reason?: string): void;
	on(event: 'message', listener: (data: unknown) => void): void;
	on(event: 'close', listener: (code: number, reason: Buffer) => void): void;
	on(event: 'error', listener: (error: Error) => void): void;
}

interface WsWebSocketServer {
	on(event: 'connection', listener: (ws: WsWebSocket, req: unknown) => void): void;
	close(callback?: () => void): void;
}

// WebSocket ready states
const WS_OPEN = 1;

// ============================================================================
// MCP WebSocket Server
// ============================================================================

export class McpWebSocketServer extends Disposable {
	private httpServer: HttpServer | null = null;
	private wss: WsWebSocketServer | null = null;
	private readonly router: McpRequestRouter;
	private readonly connections = new Map<string, { ws: WsWebSocket; info: McpConnectionInfo }>();
	private connectionCounter = 0;

	private _port: number | undefined;
	private _host: string = 'localhost';

	// Events
	private readonly _onServerStarted = this._register(new Emitter<{ port: number; host: string }>());
	readonly onServerStarted: Event<{ port: number; host: string }> = this._onServerStarted.event;

	private readonly _onServerStopped = this._register(new Emitter<void>());
	readonly onServerStopped: Event<void> = this._onServerStopped.event;

	private readonly _onClientConnected = this._register(new Emitter<McpConnectionInfo>());
	readonly onClientConnected: Event<McpConnectionInfo> = this._onClientConnected.event;

	private readonly _onClientDisconnected = this._register(new Emitter<string>());
	readonly onClientDisconnected: Event<string> = this._onClientDisconnected.event;

	constructor(toolExecutor: ToolExecutor) {
		super();
		this.router = new McpRequestRouter(toolExecutor);
	}

	/**
	 * Start the WebSocket server
	 */
	async start(options: McpWebSocketServerOptions = {}): Promise<{ port: number; host: string }> {
		if (this.wss) {
			throw new Error('WebSocket server is already running');
		}

		this._host = options.host ?? 'localhost';
		const requestedPort = options.port ?? 0;  // 0 = auto-assign

		// Dynamic import of 'ws' to bypass VS Code layering
		const { WebSocketServer } = await import('ws');

		return new Promise((resolve, reject) => {
			try {
				// Create HTTP server
				this.httpServer = createServer();

				// Create WebSocket server attached to HTTP server
				this.wss = new WebSocketServer({
					server: this.httpServer,
					path: '/mcp'
				}) as unknown as WsWebSocketServer;

				// Handle WebSocket connections
				this.wss.on('connection', (ws: WsWebSocket, req: unknown) => {
					this.handleConnection(ws, req);
				});

				// Handle server errors
				this.httpServer.on('error', (error) => {
					console.error('[MCP WebSocket] Server error:', error);
					reject(error);
				});

				// Start listening
				this.httpServer.listen(requestedPort, this._host, () => {
					const address = this.httpServer!.address();
					if (address && typeof address === 'object') {
						this._port = address.port;
						console.log(`[MCP WebSocket] Server started on ws://${this._host}:${this._port}/mcp`);
						this._onServerStarted.fire({ port: this._port, host: this._host });
						resolve({ port: this._port, host: this._host });
					} else {
						reject(new Error('Failed to get server address'));
					}
				});
			} catch (error) {
				reject(error);
			}
		});
	}

	/**
	 * Stop the WebSocket server
	 */
	async stop(): Promise<void> {
		if (!this.wss) {
			return;
		}

		return new Promise((resolve) => {
			// Close all connections
			for (const [id, conn] of this.connections) {
				try {
					conn.ws.close(1001, 'Server shutting down');
				} catch {
					// Ignore close errors
				}
				this.connections.delete(id);
			}

			// Close WebSocket server
			this.wss?.close(() => {
				this.wss = null;

				// Close HTTP server
				this.httpServer?.close(() => {
					this.httpServer = null;
					this._port = undefined;
					console.log('[MCP WebSocket] Server stopped');
					this._onServerStopped.fire();
					resolve();
				});
			});
		});
	}

	/**
	 * Get server status
	 */
	getStatus(): McpServerStatus {
		return {
			running: this.wss !== null,
			port: this._port,
			host: this._host,
			connections: Array.from(this.connections.values()).map(c => c.info)
		};
	}

	/**
	 * Get the server URL for clients to connect to
	 */
	getServerUrl(): string | undefined {
		if (!this._port) {
			return undefined;
		}
		return `ws://${this._host}:${this._port}/mcp`;
	}

	// ==========================================================================
	// Connection Handling
	// ==========================================================================

	private handleConnection(ws: WsWebSocket, _req: unknown): void {
		const connectionId = `conn_${++this.connectionCounter}_${Date.now()}`;

		const connectionInfo: McpConnectionInfo = {
			id: connectionId,
			connectedAt: Date.now()
		};

		this.connections.set(connectionId, { ws, info: connectionInfo });
		console.log(`[MCP WebSocket] Client connected: ${connectionId}`);
		this._onClientConnected.fire(connectionInfo);

		// Handle incoming messages
		ws.on('message', async (data: unknown) => {
			await this.handleMessage(connectionId, ws, data);
		});

		// Handle close
		ws.on('close', (code: number, _reason: Buffer) => {
			console.log(`[MCP WebSocket] Client disconnected: ${connectionId} (code: ${code})`);
			this.connections.delete(connectionId);
			this._onClientDisconnected.fire(connectionId);
		});

		// Handle errors
		ws.on('error', (error: Error) => {
			console.error(`[MCP WebSocket] Connection error for ${connectionId}:`, error);
		});
	}

	private async handleMessage(connectionId: string, ws: WsWebSocket, data: unknown): Promise<void> {
		let request: McpRequest;

		try {
			// Parse message
			const messageStr = data instanceof Buffer ? data.toString('utf-8') : String(data);
			request = JSON.parse(messageStr) as McpRequest;

			// Validate JSON-RPC format
			if (request.jsonrpc !== '2.0' || !request.method) {
				this.sendError(ws, request?.id ?? null, MCP_ERROR_CODES.INVALID_REQUEST, 'Invalid JSON-RPC request');
				return;
			}
		} catch {
			this.sendError(ws, null, MCP_ERROR_CODES.PARSE_ERROR, 'Failed to parse JSON');
			return;
		}

		// Route the request
		const response = await this.router.route(request);

		// Update client info if this was an initialize request
		if (request.method === 'initialize' && request.params) {
			const conn = this.connections.get(connectionId);
			if (conn) {
				conn.info.clientInfo = {
					name: (request.params as { clientInfo?: { name?: string } }).clientInfo?.name,
					version: (request.params as { clientInfo?: { version?: string } }).clientInfo?.version
				};
			}
		}

		// Send response
		this.send(ws, response);
	}

	private send(ws: WsWebSocket, response: McpResponse): void {
		try {
			if (ws.readyState === WS_OPEN) {
				ws.send(JSON.stringify(response));
			}
		} catch (error) {
			console.error('[MCP WebSocket] Failed to send response:', error);
		}
	}

	private sendError(ws: WsWebSocket, id: string | number | null, code: number, message: string): void {
		const response: McpResponse = {
			jsonrpc: '2.0',
			id: id ?? 0,
			error: { code, message }
		};
		this.send(ws, response);
	}

	// ==========================================================================
	// Lifecycle
	// ==========================================================================

	override dispose(): void {
		this.stop().catch(console.error);
		super.dispose();
	}
}
