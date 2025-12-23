/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * CDP (Chrome DevTools Protocol) Monitoring Tools
 *
 * Provides debugging and monitoring capabilities via CDP:
 * - Console logs capture (log, warn, error, etc.)
 * - Network request/response monitoring
 * - Performance metrics
 * - Debugging statistics
 *
 * CDP is auto-attached transparently when first tool is used.
 * Agents don't need to know about attach/detach - it's handled internally.
 *
 * Architecture:
 * - BrowserViewService handles CDP connection (auto-attach)
 * - This module stores captured data in memory
 * - Events are captured via CDP event listeners
 * - Data is cleared on browser close or manually
 *
 * Reference: https://chromedevtools.github.io/devtools-protocol/
 */

import type { BrowserViewService } from '../../projectMode/browserViewService.js';

// ============================================================================
// Types
// ============================================================================

interface ConsoleLog {
	id: string;
	timestamp: number;
	type: 'log' | 'debug' | 'info' | 'warn' | 'error' | 'dir' | 'dirxml' | 'table' | 'trace' | 'clear' | 'assert';
	message: string;
	args?: unknown[];
	location?: string;
	stackTrace?: { callFrames: Array<{ url: string; lineNumber: number; columnNumber: number; functionName: string }> };
}

interface NetworkRequest {
	id: string;
	requestId: string;
	timestamp: number;
	method: string;
	url: string;
	headers: Record<string, string>;
	postData?: string;
}

interface NetworkResponse {
	id: string;
	requestId: string;
	timestamp: number;
	status: number;
	statusText: string;
	url: string;
	headers: Record<string, string>;
	mimeType?: string;
	duration?: number;
}

interface CDPMonitor {
	browserViewId: number;
	consoleLogs: ConsoleLog[];
	networkRequests: NetworkRequest[];
	networkResponses: NetworkResponse[];
	requestStartTimes: Map<string, number>; // requestId -> timestamp
	cleanupFunctions: Array<() => void>;
}

// ============================================================================
// CDP Monitoring State
// ============================================================================

/**
 * Global CDP monitors - one per browser view
 */
const cdpMonitors = new Map<number, CDPMonitor>();

/**
 * Ensure CDP monitoring is active for a browser view
 * Auto-attaches debugger and enables necessary domains
 */
async function ensureCDPMonitoring(
	browserViewId: number,
	browserViewService: BrowserViewService
): Promise<void> {
	// Clean up any stale monitors (from previous browsers that weren't properly cleaned up)
	for (const [monitoredId] of cdpMonitors) {
		if (monitoredId !== browserViewId) {
			console.log('[CDP Tools] Cleaning up stale monitor for old browser', monitoredId);
			cleanupCDPMonitoring(monitoredId);
		}
	}

	// Already monitoring this specific browser?
	if (cdpMonitors.has(browserViewId)) {
		return;
	}

	console.log('[CDP Tools] Initializing CDP monitoring for browser', browserViewId);

	// Create monitor
	const monitor: CDPMonitor = {
		browserViewId,
		consoleLogs: [],
		networkRequests: [],
		networkResponses: [],
		requestStartTimes: new Map(),
		cleanupFunctions: []
	};

	// Attach debugger (auto-handled by browserViewService)
	// This is transparent - agent doesn't need to know
	await browserViewService.attachDebugger(browserViewId);

	// Enable Runtime domain for console messages
	await browserViewService.sendCDPCommand(browserViewId, 'Runtime.enable');

	// Enable Network domain for request/response tracking
	await browserViewService.sendCDPCommand(browserViewId, 'Network.enable');

	// Enable Page domain (for general page events)
	await browserViewService.sendCDPCommand(browserViewId, 'Page.enable');

	// Setup console logging event listener
	const consoleCleanup = browserViewService.onCDPEvent(browserViewId, (method, params) => {
		if (method === 'Runtime.consoleAPICalled') {
			handleConsoleMessage(monitor, params as any);
		} else if (method === 'Runtime.exceptionThrown') {
			handleException(monitor, params as any);
		}
	});
	monitor.cleanupFunctions.push(consoleCleanup);

	// Setup network monitoring event listeners
	const networkCleanup = browserViewService.onCDPEvent(browserViewId, (method, params) => {
		if (method === 'Network.requestWillBeSent') {
			handleNetworkRequest(monitor, params as any);
		} else if (method === 'Network.responseReceived') {
			handleNetworkResponse(monitor, params as any);
		} else if (method === 'Network.loadingFailed') {
			handleNetworkFailure(monitor, params as any);
		}
	});
	monitor.cleanupFunctions.push(networkCleanup);

	cdpMonitors.set(browserViewId, monitor);
	console.log('[CDP Tools] CDP monitoring initialized successfully');
}

/**
 * Handle console API calls (console.log, console.warn, etc.)
 */
function handleConsoleMessage(monitor: CDPMonitor, params: {
	type: string;
	args: Array<{ type: string; value?: any; unserializableValue?: string; description?: string }>;
	timestamp: number;
	stackTrace?: { callFrames: Array<{ url: string; lineNumber: number; columnNumber: number; functionName: string }> };
}): void {
	const { type, args, timestamp, stackTrace } = params;

	// Convert args to readable messages
	const messages = args.map(arg => {
		if (arg.value !== undefined) {
			return typeof arg.value === 'object' ? JSON.stringify(arg.value) : String(arg.value);
		}
		if (arg.unserializableValue) {
			return arg.unserializableValue;
		}
		if (arg.description) {
			return arg.description;
		}
		return '[Object]';
	});

	const location = stackTrace?.callFrames?.[0]
		? `${stackTrace.callFrames[0].url}:${stackTrace.callFrames[0].lineNumber}:${stackTrace.callFrames[0].columnNumber}`
		: undefined;

	const log: ConsoleLog = {
		id: `console-${Date.now()}-${Math.random()}`,
		timestamp: timestamp * 1000, // Convert to ms
		type: type as ConsoleLog['type'],
		message: messages.join(' '),
		args: args.map(arg => arg.value),
		location,
		stackTrace
	};

	monitor.consoleLogs.push(log);

	// Keep only last 1000 console logs to prevent memory bloat
	if (monitor.consoleLogs.length > 1000) {
		monitor.consoleLogs.shift();
	}
}

/**
 * Handle exceptions (uncaught errors)
 */
function handleException(monitor: CDPMonitor, params: {
	timestamp: number;
	exceptionDetails: {
		text: string;
		lineNumber?: number;
		columnNumber?: number;
		url?: string;
		stackTrace?: { callFrames: Array<{ url: string; lineNumber: number; columnNumber: number; functionName: string }> };
	};
}): void {
	const { timestamp, exceptionDetails } = params;

	const location = exceptionDetails.url && exceptionDetails.lineNumber !== undefined
		? `${exceptionDetails.url}:${exceptionDetails.lineNumber}:${exceptionDetails.columnNumber}`
		: undefined;

	const log: ConsoleLog = {
		id: `exception-${Date.now()}-${Math.random()}`,
		timestamp: timestamp * 1000,
		type: 'error',
		message: exceptionDetails.text,
		location,
		stackTrace: exceptionDetails.stackTrace
	};

	monitor.consoleLogs.push(log);

	if (monitor.consoleLogs.length > 1000) {
		monitor.consoleLogs.shift();
	}
}

/**
 * Handle network request start
 */
function handleNetworkRequest(monitor: CDPMonitor, params: {
	requestId: string;
	request: {
		url: string;
		method: string;
		headers: Record<string, string>;
		postData?: string;
	};
	timestamp: number;
}): void {
	const { requestId, request, timestamp } = params;

	const networkRequest: NetworkRequest = {
		id: `req-${Date.now()}-${Math.random()}`,
		requestId,
		timestamp: timestamp * 1000,
		method: request.method,
		url: request.url,
		headers: request.headers || {},
		postData: request.postData
	};

	monitor.networkRequests.push(networkRequest);
	monitor.requestStartTimes.set(requestId, timestamp);

	// Keep only last 500 requests
	if (monitor.networkRequests.length > 500) {
		monitor.networkRequests.shift();
	}
}

/**
 * Handle network response received
 */
function handleNetworkResponse(monitor: CDPMonitor, params: {
	requestId: string;
	response: {
		url: string;
		status: number;
		statusText: string;
		headers: Record<string, string>;
		mimeType?: string;
	};
	timestamp: number;
}): void {
	const { requestId, response, timestamp } = params;

	const startTime = monitor.requestStartTimes.get(requestId);
	const duration = startTime ? (timestamp - startTime) * 1000 : undefined; // Convert to ms

	const networkResponse: NetworkResponse = {
		id: `res-${Date.now()}-${Math.random()}`,
		requestId,
		timestamp: timestamp * 1000,
		status: response.status,
		statusText: response.statusText,
		url: response.url,
		headers: response.headers || {},
		mimeType: response.mimeType,
		duration
	};

	monitor.networkResponses.push(networkResponse);

	// Keep only last 500 responses
	if (monitor.networkResponses.length > 500) {
		monitor.networkResponses.shift();
	}
}

/**
 * Handle network loading failure
 */
function handleNetworkFailure(monitor: CDPMonitor, params: {
	requestId: string;
	timestamp: number;
	errorText: string;
}): void {
	const { requestId, timestamp, errorText } = params;

	// Record as a failed response (status 0)
	const networkResponse: NetworkResponse = {
		id: `fail-${Date.now()}-${Math.random()}`,
		requestId,
		timestamp: timestamp * 1000,
		status: 0,
		statusText: errorText,
		url: '', // URL is in the original request
		headers: {}
	};

	monitor.networkResponses.push(networkResponse);

	if (monitor.networkResponses.length > 500) {
		monitor.networkResponses.shift();
	}
}

/**
 * Get or throw if browser not open
 */
function getMonitorOrThrow(browserViewId: number | undefined): CDPMonitor {
	if (browserViewId === undefined) {
		throw new Error('No browser is currently open. Start a project first with roopik_startProject.');
	}

	const monitor = cdpMonitors.get(browserViewId);
	if (!monitor) {
		// This can happen if browser was recreated with new ID but CDP wasn't re-initialized
		throw new Error('CDP monitoring not initialized. The browser may have restarted. Try running the command again.');
	}

	return monitor;
}

// ============================================================================
// Tool Registration
// ============================================================================

export function registerCDPTools(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	server: any,
	browserViewService: BrowserViewService,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	z: any
): void {
	console.log('[MCP] Registering CDP monitoring tools...');

	// --------------------------------------------------------------
	// TOOL: Get Console Logs
	// --------------------------------------------------------------
	server.tool(
		'roopik_getConsoleLogs',
		'Get console logs (console.log, warn, error, etc.) from the browser. Useful for debugging JavaScript errors and application behavior.',
		{
			limit: z.number().optional().describe('Maximum number of logs to return (default: 50, max: 500)'),
			type: z.enum(['log', 'debug', 'info', 'warn', 'error', 'dir', 'dirxml', 'table', 'trace', 'clear', 'assert']).optional().describe('Filter by log type')
		},
		async ({ limit, type }: { limit?: number; type?: ConsoleLog['type'] }) => {
			try {
				const browserViewId = browserViewService.getActiveBrowserViewId();
				await ensureCDPMonitoring(browserViewId!, browserViewService);

				const monitor = getMonitorOrThrow(browserViewId);

				let logs = monitor.consoleLogs;

				// Filter by type if specified
				if (type) {
					logs = logs.filter(log => log.type === type);
				}

				// Apply limit (default 50, max 500)
				const maxLogs = Math.min(limit || 50, 500);
				const result = logs.slice(-maxLogs).reverse(); // Most recent first

				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: true,
							count: result.length,
							total: logs.length,
							logs: result
						}, null, 2)
					}]
				};
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : 'Unknown error';
				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: false,
							isError: true,
							error: errorMessage
						})
					}],
					isError: true
				};
			}
		}
	);

	// --------------------------------------------------------------
	// TOOL: Get Network Requests
	// --------------------------------------------------------------
	server.tool(
		'roopik_getNetworkRequests',
		'Get network requests and responses. Shows HTTP requests with status codes, timing, and headers. Useful for debugging API calls and performance.',
		{
			limit: z.number().optional().describe('Maximum number of requests to return (default: 50, max: 500)'),
			method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']).optional().describe('Filter by HTTP method'),
			urlPattern: z.string().optional().describe('Filter by URL pattern (regex)')
		},
		async ({ limit, method, urlPattern }: { limit?: number; method?: string; urlPattern?: string }) => {
			try {
				const browserViewId = browserViewService.getActiveBrowserViewId();
				await ensureCDPMonitoring(browserViewId!, browserViewService);

				const monitor = getMonitorOrThrow(browserViewId);

				// Match requests with responses
				const pairs = monitor.networkResponses.map(response => {
					const request = monitor.networkRequests.find(req => req.requestId === response.requestId);
					return {
						request,
						response,
						duration: response.duration
					};
				}).filter(pair => pair.request); // Only pairs with both request and response

				let filtered = pairs;

				// Filter by method
				if (method) {
					filtered = filtered.filter(pair => pair.request?.method === method.toUpperCase());
				}

				// Filter by URL pattern
				if (urlPattern) {
					try {
						const regex = new RegExp(urlPattern, 'i');
						filtered = filtered.filter(pair => pair.response && regex.test(pair.response.url));
					} catch {
						// Invalid regex, ignore filter
					}
				}

				// Apply limit
				const maxRequests = Math.min(limit || 50, 500);
				const result = filtered.slice(-maxRequests).reverse();

				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: true,
							count: result.length,
							total: filtered.length,
							requests: result
						}, null, 2)
					}]
				};
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : 'Unknown error';
				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: false,
							isError: true,
							error: errorMessage
						})
					}],
					isError: true
				};
			}
		}
	);

	// --------------------------------------------------------------
	// TOOL: Get Failed Network Requests
	// --------------------------------------------------------------
	server.tool(
		'roopik_getFailedRequests',
		'Get network requests that failed (4xx, 5xx status codes). Useful for debugging API errors and connectivity issues.',
		{
			limit: z.number().optional().describe('Maximum number of failed requests to return (default: 20, max: 200)'),
			statusCode: z.number().optional().describe('Filter by specific status code (e.g., 404, 500)')
		},
		async ({ limit, statusCode }: { limit?: number; statusCode?: number }) => {
			try {
				const browserViewId = browserViewService.getActiveBrowserViewId();
				await ensureCDPMonitoring(browserViewId!, browserViewService);

				const monitor = getMonitorOrThrow(browserViewId);

				// Get responses with 4xx or 5xx status, or status 0 (network failure)
				let failed = monitor.networkResponses.filter(res => res.status >= 400 || res.status === 0);

				// Filter by status code if specified
				if (statusCode !== undefined) {
					failed = failed.filter(res => res.status === statusCode);
				}

				// Apply limit
				const maxFailed = Math.min(limit || 20, 200);
				const result = failed.slice(-maxFailed).reverse();

				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: true,
							count: result.length,
							total: failed.length,
							failedRequests: result
						}, null, 2)
					}]
				};
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : 'Unknown error';
				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: false,
							isError: true,
							error: errorMessage
						})
					}],
					isError: true
				};
			}
		}
	);

	// --------------------------------------------------------------
	// TOOL: Get CDP Statistics
	// --------------------------------------------------------------
	server.tool(
		'roopik_getCdpStats',
		'Get statistics about captured CDP data (console logs, network requests, etc.). Useful for understanding application activity and debugging patterns.',
		{},
		async () => {
			try {
				const browserViewId = browserViewService.getActiveBrowserViewId();
				await ensureCDPMonitoring(browserViewId!, browserViewService);

				const monitor = getMonitorOrThrow(browserViewId);

				// Calculate statistics
				const logsByType: Record<string, number> = {};
				for (const log of monitor.consoleLogs) {
					logsByType[log.type] = (logsByType[log.type] || 0) + 1;
				}

				const requestsByMethod: Record<string, number> = {};
				for (const req of monitor.networkRequests) {
					requestsByMethod[req.method] = (requestsByMethod[req.method] || 0) + 1;
				}

				const responsesByStatus: Record<string, number> = {};
				for (const res of monitor.networkResponses) {
					const statusRange = res.status === 0 ? 'Failed' :
						res.status < 200 ? '1xx' :
							res.status < 300 ? '2xx' :
								res.status < 400 ? '3xx' :
									res.status < 500 ? '4xx' : '5xx';
					responsesByStatus[statusRange] = (responsesByStatus[statusRange] || 0) + 1;
				}

				const stats = {
					cdpMonitoring: true,
					browserViewId: monitor.browserViewId,
					consoleLogs: {
						total: monitor.consoleLogs.length,
						byType: logsByType
					},
					networkRequests: {
						total: monitor.networkRequests.length,
						byMethod: requestsByMethod
					},
					networkResponses: {
						total: monitor.networkResponses.length,
						byStatus: responsesByStatus
					}
				};

				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: true,
							stats
						}, null, 2)
					}]
				};
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : 'Unknown error';
				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: false,
							isError: true,
							error: errorMessage
						})
					}],
					isError: true
				};
			}
		}
	);

	// --------------------------------------------------------------
	// TOOL: Clear CDP Data
	// --------------------------------------------------------------
	server.tool(
		'roopik_clearCdpData',
		'Clear all stored console logs and network data. Useful for starting fresh debugging session or reducing memory usage.',
		{},
		async () => {
			try {
				const browserViewId = browserViewService.getActiveBrowserViewId();

				if (browserViewId === undefined) {
					return {
						content: [{
							type: 'text' as const,
							text: JSON.stringify({
								success: false,
								isError: true,
								error: 'No browser is currently open. Start a project first with roopik_startProject.'
							})
						}],
						isError: true
					};
				}

				const monitor = cdpMonitors.get(browserViewId);
				if (!monitor) {
					return {
						content: [{
							type: 'text' as const,
							text: JSON.stringify({
								success: true,
								message: 'No CDP data to clear (monitoring not initialized yet)'
							})
						}]
					};
				}

				const beforeStats = {
					consoleLogs: monitor.consoleLogs.length,
					networkRequests: monitor.networkRequests.length,
					networkResponses: monitor.networkResponses.length
				};

				// Clear all data
				monitor.consoleLogs = [];
				monitor.networkRequests = [];
				monitor.networkResponses = [];
				monitor.requestStartTimes.clear();

				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: true,
							message: 'CDP data cleared successfully',
							clearedCount: beforeStats
						})
					}]
				};
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : 'Unknown error';
				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: false,
							isError: true,
							error: errorMessage
						})
					}],
					isError: true
				};
			}
		}
	);

	console.log('[MCP] Registered 5 CDP monitoring tools: getConsoleLogs, getNetworkRequests, getFailedRequests, getCdpStats, clearCdpData');
}

// ============================================================================
// Cleanup on Browser Close
// ============================================================================

/**
 * Call this when a browser view is destroyed to cleanup CDP monitoring
 */
export function cleanupCDPMonitoring(browserViewId: number): void {
	const monitor = cdpMonitors.get(browserViewId);
	if (monitor) {
		// Call all cleanup functions (event listener removals)
		for (const cleanup of monitor.cleanupFunctions) {
			try {
				cleanup();
			} catch (e) {
				console.error('[CDP Tools] Error during cleanup:', e);
			}
		}

		cdpMonitors.delete(browserViewId);
		console.log('[CDP Tools] Cleaned up CDP monitoring for browser', browserViewId);
	}
}
