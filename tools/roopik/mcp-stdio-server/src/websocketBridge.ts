/**
 * WebSocket Bridge
 *
 * WebSocket CLIENT that connects to Roopik IDE's WebSocket server.
 * Bridges STDIO MCP requests to the IDE.
 *
 * Flow:
 * 1. AI Agent → STDIN → MCP SDK → WebSocketBridge → Roopik WebSocket Server
 * 2. Roopik WebSocket Server → WebSocketBridge → MCP SDK → STDOUT → AI Agent
 *
 * Authentication:
 * - Reads ROOPIK_MCP_TOKEN from environment (set by Roopik IDE main process)
 * - Sends auth message immediately on connect
 * - External IDEs won't have this token, so connections are rejected
 */

import WebSocket from 'ws';

// ============================================================================
// Types
// ============================================================================

export interface BridgeOptions {
	/** WebSocket server URL (e.g., ws://localhost:9876/mcp) */
	serverUrl: string;
	/** Authentication token (CLI arg for external IDEs, falls back to env var for internal) */
	token?: string;
	/** Connection timeout in ms */
	timeout?: number;
	/** Auto-reconnect on disconnect */
	autoReconnect?: boolean;
	/** Reconnect delay in ms */
	reconnectDelay?: number;
	/** Max reconnect attempts (0 = infinite) */
	maxReconnectAttempts?: number;
}

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

type ResponseCallback = (response: McpResponse) => void;

// ============================================================================
// WebSocket Bridge Class
// ============================================================================

export class WebSocketBridge {
	private ws: WebSocket | null = null;
	private readonly pendingRequests = new Map<string | number, ResponseCallback>();
	private reconnectAttempts = 0;
	private isConnecting = false;
	private isClosed = false;
	private isAuthenticated = false;

	private readonly options: Required<Omit<BridgeOptions, 'token'>>;
	private readonly authToken: string;

	constructor(options: BridgeOptions) {
		this.options = {
			serverUrl: options.serverUrl,
			timeout: options.timeout ?? 30000,
			autoReconnect: options.autoReconnect ?? true,
			reconnectDelay: options.reconnectDelay ?? 1000,
			maxReconnectAttempts: options.maxReconnectAttempts ?? 10,
		};
		// Token priority: CLI arg (for external IDEs) > env var (for internal agents)
		this.authToken = options.token || process.env.ROOPIK_MCP_TOKEN || '';
	}

	/**
	 * Connect to the Roopik WebSocket server
	 * Authentication: CLI --token arg (external IDEs) or ROOPIK_MCP_TOKEN env var (internal agents)
	 */
	async connect(): Promise<void> {
		// Check for auth token BEFORE attempting to connect
		if (!this.authToken) {
			console.error('[STDIO Bridge] ERROR: No authentication token found');
			console.error('[STDIO Bridge] External IDEs need --token argument');
			console.error('[STDIO Bridge] Internal agents use ROOPIK_MCP_TOKEN env var');
			console.error('[STDIO Bridge] Get your token from Roopik IDE: Settings > MCP > Show Connection Info');
			throw new Error('No authentication token - use --token argument or run from Roopik IDE');
		}

		if (this.ws?.readyState === WebSocket.OPEN && this.isAuthenticated) {
			return;
		}

		if (this.isConnecting) {
			// Wait for existing connection attempt
			return new Promise((resolve, reject) => {
				const checkConnection = setInterval(() => {
					if (this.ws?.readyState === WebSocket.OPEN && this.isAuthenticated) {
						clearInterval(checkConnection);
						resolve();
					} else if (!this.isConnecting) {
						clearInterval(checkConnection);
						reject(new Error('Connection failed'));
					}
				}, 100);
			});
		}

		this.isConnecting = true;
		this.isClosed = false;
		this.isAuthenticated = false;

		return new Promise((resolve, reject) => {
			const timeoutId = setTimeout(() => {
				this.isConnecting = false;
				reject(new Error(`Connection timeout after ${this.options.timeout}ms`));
			}, this.options.timeout);

			try {
				this.ws = new WebSocket(this.options.serverUrl);

				this.ws.on('open', () => {
					console.error('[STDIO Bridge] Connected to Roopik, authenticating...');
					// Send auth message immediately
					this.ws!.send(JSON.stringify({
						type: 'auth',
						token: this.authToken
					}));
				});

				this.ws.on('message', (data) => {
					// Check for auth response first
					if (!this.isAuthenticated) {
						try {
							const message = JSON.parse(data.toString());
							if (message.result?.type === 'auth_success') {
								this.isAuthenticated = true;
								this.isConnecting = false;
								this.reconnectAttempts = 0;
								clearTimeout(timeoutId);
								console.error('[STDIO Bridge] Authenticated with Roopik');
								resolve();
								return;
							}
						} catch {
							// Not an auth response, ignore
						}
					}

					// Normal message handling
					this.handleMessage(data);
				});

				this.ws.on('close', (code, reason) => {
					const reasonStr = reason?.toString() || '';

					// Handle auth rejection codes
					if (code === 4001) {
						console.error('[STDIO Bridge] Authentication timeout - Roopik rejected connection');
					} else if (code === 4002) {
						console.error('[STDIO Bridge] Authentication required - must send auth first');
					} else if (code === 4003) {
						console.error('[STDIO Bridge] Invalid token - not running in Roopik IDE');
						console.error('[STDIO Bridge] This MCP server only works within Roopik IDE');
					} else {
						console.error(`[STDIO Bridge] Disconnected (code: ${code}, reason: ${reasonStr})`);
					}

					this.ws = null;
					this.isAuthenticated = false;

					// If auth failed, don't reconnect - exit cleanly
					if (code === 4001 || code === 4002 || code === 4003) {
						clearTimeout(timeoutId);
						this.isConnecting = false;
						reject(new Error(`Authentication failed (code: ${code})`));
						return;
					}

					this.handleDisconnect();
				});

				this.ws.on('error', (error) => {
					console.error('[STDIO Bridge] WebSocket error:', error.message);
					clearTimeout(timeoutId);
					this.isConnecting = false;

					if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
						reject(error);
					}
				});
			} catch (error) {
				clearTimeout(timeoutId);
				this.isConnecting = false;
				reject(error);
			}
		});
	}

	/**
	 * Send a request to Roopik and wait for response
	 */
	async send(request: McpRequest): Promise<McpResponse> {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			// Try to connect first
			await this.connect();
		}

		return new Promise((resolve, reject) => {
			const timeoutId = setTimeout(() => {
				this.pendingRequests.delete(request.id);
				reject(new Error(`Request timeout for ${request.method}`));
			}, this.options.timeout);

			this.pendingRequests.set(request.id, (response) => {
				clearTimeout(timeoutId);
				resolve(response);
			});

			try {
				this.ws!.send(JSON.stringify(request));
			} catch (error) {
				clearTimeout(timeoutId);
				this.pendingRequests.delete(request.id);
				reject(error);
			}
		});
	}

	/**
	 * Close the connection
	 */
	close(): void {
		this.isClosed = true;
		this.isAuthenticated = false;
		if (this.ws) {
			this.ws.close(1000, 'Client closing');
			this.ws = null;
		}

		// Reject all pending requests
		for (const [id, callback] of this.pendingRequests) {
			callback({
				jsonrpc: '2.0',
				id,
				error: { code: -32603, message: 'Connection closed' }
			});
		}
		this.pendingRequests.clear();
	}

	/**
	 * Check if connected and authenticated
	 */
	isConnected(): boolean {
		return this.ws?.readyState === WebSocket.OPEN && this.isAuthenticated;
	}

	// ==========================================================================
	// Private Methods
	// ==========================================================================

	private handleMessage(data: WebSocket.RawData): void {
		try {
			const message = JSON.parse(data.toString()) as McpResponse;

			if (message.id !== undefined) {
				const callback = this.pendingRequests.get(message.id);
				if (callback) {
					this.pendingRequests.delete(message.id);
					callback(message);
				}
			}
		} catch (error) {
			console.error('[STDIO Bridge] Failed to parse message:', error);
		}
	}

	private handleDisconnect(): void {
		this.isAuthenticated = false;

		if (this.isClosed || !this.options.autoReconnect) {
			// Graceful close - exit the process
			console.error('[STDIO Bridge] Connection closed, exiting...');
			process.exit(0);
		}

		if (this.options.maxReconnectAttempts > 0 &&
			this.reconnectAttempts >= this.options.maxReconnectAttempts) {
			console.error('[STDIO Bridge] Max reconnect attempts reached, exiting...');
			console.error('[STDIO Bridge] Roopik IDE may have been closed.');
			// Reject all pending requests
			for (const [id, callback] of this.pendingRequests) {
				callback({
					jsonrpc: '2.0',
					id,
					error: { code: -32603, message: 'Connection lost' }
				});
			}
			this.pendingRequests.clear();
			// EXIT THE PROCESS - don't hang around!
			process.exit(1);
		}

		this.reconnectAttempts++;
		const delay = this.options.reconnectDelay * Math.min(this.reconnectAttempts, 5);
		console.error(`[STDIO Bridge] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

		setTimeout(() => {
			this.connect().catch((error) => {
				console.error('[STDIO Bridge] Reconnect failed:', error.message);
			});
		}, delay);
	}
}

// ============================================================================
// Helper: Discover Roopik Server
// ============================================================================

/**
 * Try to discover Roopik's WebSocket server.
 * First tries environment variable, then default port.
 */
export async function discoverRoopikServer(): Promise<string> {
	// 1. Check environment variable (set by installer)
	const envUrl = process.env.ROOPIK_MCP_WS_URL;
	if (envUrl) {
		return envUrl;
	}

	// 2. Try default ports
	const defaultPorts = [9876, 9877, 9878, 9879, 9880];

	for (const port of defaultPorts) {
		const url = `ws://localhost:${port}/mcp`;
		if (await testConnection(url)) {
			return url;
		}
	}

	throw new Error('Could not find Roopik MCP server. Is Roopik IDE running?');
}

async function testConnection(url: string): Promise<boolean> {
	return new Promise((resolve) => {
		const ws = new WebSocket(url);
		const timeout = setTimeout(() => {
			ws.close();
			resolve(false);
		}, 1000);

		ws.on('open', () => {
			clearTimeout(timeout);
			ws.close();
			resolve(true);
		});

		ws.on('error', () => {
			clearTimeout(timeout);
			resolve(false);
		});
	});
}
