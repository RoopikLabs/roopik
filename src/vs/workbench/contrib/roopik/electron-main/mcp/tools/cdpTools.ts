/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * CDP (Chrome DevTools Protocol) Tools
 *
 * MCP tools for capturing browser errors and network issues.
 * CDP is auto-attached when first tool is used - agents don't need to manage it.
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
	requestStartTimes: Map<string, number>;
	cleanupFunctions: Array<() => void>;
}

// ============================================================================
// CDP Monitoring State
// ============================================================================

const cdpMonitors = new Map<number, CDPMonitor>();

async function ensureCDPMonitoring(
	browserViewId: number,
	browserViewService: BrowserViewService
): Promise<void> {
	// Clean up stale monitors
	for (const [monitoredId] of cdpMonitors) {
		if (monitoredId !== browserViewId) {
			cleanupCDPMonitoring(monitoredId);
		}
	}

	if (cdpMonitors.has(browserViewId)) {
		return;
	}

	const monitor: CDPMonitor = {
		browserViewId,
		consoleLogs: [],
		networkRequests: [],
		networkResponses: [],
		requestStartTimes: new Map(),
		cleanupFunctions: []
	};

	await browserViewService.attachDebugger(browserViewId);
	await browserViewService.sendCDPCommand(browserViewId, 'Runtime.enable');
	await browserViewService.sendCDPCommand(browserViewId, 'Network.enable');
	await browserViewService.sendCDPCommand(browserViewId, 'Page.enable');

	// Console logging
	const consoleCleanup = browserViewService.onCDPEvent(browserViewId, (method, params) => {
		if (method === 'Runtime.consoleAPICalled') {
			handleConsoleMessage(monitor, params as any);
		} else if (method === 'Runtime.exceptionThrown') {
			handleException(monitor, params as any);
		}
	});
	monitor.cleanupFunctions.push(consoleCleanup);

	// Network monitoring
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
}

function handleConsoleMessage(monitor: CDPMonitor, params: {
	type: string;
	args: Array<{ type: string; value?: any; unserializableValue?: string; description?: string }>;
	timestamp: number;
	stackTrace?: { callFrames: Array<{ url: string; lineNumber: number; columnNumber: number; functionName: string }> };
}): void {
	const { type, args, timestamp, stackTrace } = params;

	const messages = args.map(arg => {
		if (arg.value !== undefined) {
			return typeof arg.value === 'object' ? JSON.stringify(arg.value) : String(arg.value);
		}
		if (arg.unserializableValue) return arg.unserializableValue;
		if (arg.description) return arg.description;
		return '[Object]';
	});

	const location = stackTrace?.callFrames?.[0]
		? `${stackTrace.callFrames[0].url}:${stackTrace.callFrames[0].lineNumber}:${stackTrace.callFrames[0].columnNumber}`
		: undefined;

	const log: ConsoleLog = {
		id: `console-${Date.now()}-${Math.random()}`,
		timestamp: timestamp * 1000,
		type: type as ConsoleLog['type'],
		message: messages.join(' '),
		args: args.map(arg => arg.value),
		location,
		stackTrace
	};

	monitor.consoleLogs.push(log);
	if (monitor.consoleLogs.length > 1000) {
		monitor.consoleLogs.shift();
	}
}

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

function handleNetworkRequest(monitor: CDPMonitor, params: {
	requestId: string;
	request: { url: string; method: string; headers: Record<string, string>; postData?: string };
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

	if (monitor.networkRequests.length > 500) {
		monitor.networkRequests.shift();
	}
}

function handleNetworkResponse(monitor: CDPMonitor, params: {
	requestId: string;
	response: { url: string; status: number; statusText: string; headers: Record<string, string>; mimeType?: string };
	timestamp: number;
}): void {
	const { requestId, response, timestamp } = params;

	const startTime = monitor.requestStartTimes.get(requestId);
	const duration = startTime ? (timestamp - startTime) * 1000 : undefined;

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
	if (monitor.networkResponses.length > 500) {
		monitor.networkResponses.shift();
	}
}

function handleNetworkFailure(monitor: CDPMonitor, params: {
	requestId: string;
	timestamp: number;
	errorText: string;
}): void {
	const { requestId, timestamp, errorText } = params;

	const networkResponse: NetworkResponse = {
		id: `fail-${Date.now()}-${Math.random()}`,
		requestId,
		timestamp: timestamp * 1000,
		status: 0,
		statusText: errorText,
		url: '',
		headers: {}
	};

	monitor.networkResponses.push(networkResponse);
	if (monitor.networkResponses.length > 500) {
		monitor.networkResponses.shift();
	}
}

function getMonitorOrThrow(browserViewId: number | undefined): CDPMonitor {
	if (browserViewId === undefined) {
		throw new Error('No browser is open. Start a project first with rpk_startProject.');
	}

	const monitor = cdpMonitors.get(browserViewId);
	if (!monitor) {
		throw new Error('CDP monitoring not initialized. Try running the command again.');
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

	// --------------------------------------------------------------
	// TOOL: Get Errors (Unified - Console + Network)
	// --------------------------------------------------------------
	server.tool(
		'rpk_getErrors',
		'[Roopik IDE] Get all errors from the browser: console errors (JavaScript exceptions, console.error) AND failed network requests (4xx, 5xx, network failures). This is the primary debugging tool - shows what is broken.',
		{
			limit: z.number().optional().describe('Maximum errors to return (default: 50)')
		},
		async ({ limit }: { limit?: number }) => {
			try {
				const browserViewId = browserViewService.getActiveBrowserViewId();
				await ensureCDPMonitoring(browserViewId!, browserViewService);

				const monitor = getMonitorOrThrow(browserViewId);
				const maxErrors = Math.min(limit || 50, 200);

				// Get console errors (error type only)
				const consoleErrors = monitor.consoleLogs
					.filter(log => log.type === 'error')
					.slice(-maxErrors)
					.map(log => ({
						source: 'console',
						type: 'error',
						message: log.message,
						location: log.location,
						timestamp: log.timestamp
					}));

				// Get failed network requests (4xx, 5xx, or status 0)
				const networkErrors = monitor.networkResponses
					.filter(res => res.status >= 400 || res.status === 0)
					.slice(-maxErrors)
					.map(res => {
						const request = monitor.networkRequests.find(req => req.requestId === res.requestId);
						return {
							source: 'network',
							type: res.status === 0 ? 'network_failure' : `http_${res.status}`,
							message: res.status === 0 ? res.statusText : `${res.status} ${res.statusText}`,
							url: res.url || request?.url,
							method: request?.method,
							timestamp: res.timestamp
						};
					});

				// Combine and sort by timestamp (most recent first)
				const allErrors = [...consoleErrors, ...networkErrors]
					.sort((a, b) => b.timestamp - a.timestamp)
					.slice(0, maxErrors);

				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: true,
							errorCount: allErrors.length,
							consoleErrorCount: consoleErrors.length,
							networkErrorCount: networkErrors.length,
							errors: allErrors
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
	// TOOL: Get Console Logs (All types)
	// --------------------------------------------------------------
	server.tool(
		'rpk_getConsoleLogs',
		'[Roopik IDE] Get console output from the browser (console.log, warn, error, etc.). Use type filter to focus on specific log types. For errors only, prefer rpk_getErrors.',
		{
			limit: z.number().optional().describe('Maximum logs to return (default: 50)'),
			type: z.enum(['log', 'debug', 'info', 'warn', 'error']).optional().describe('Filter by log type')
		},
		async ({ limit, type }: { limit?: number; type?: ConsoleLog['type'] }) => {
			try {
				const browserViewId = browserViewService.getActiveBrowserViewId();
				await ensureCDPMonitoring(browserViewId!, browserViewService);

				const monitor = getMonitorOrThrow(browserViewId);

				let logs = monitor.consoleLogs;
				if (type) {
					logs = logs.filter(log => log.type === type);
				}

				const maxLogs = Math.min(limit || 50, 500);
				const result = logs.slice(-maxLogs).reverse();

				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: true,
							count: result.length,
							total: logs.length,
							logs: result.map(log => ({
								type: log.type,
								message: log.message,
								location: log.location,
								timestamp: log.timestamp
							}))
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

	console.log('[MCP] Registered 2 CDP tools: rpk_getErrors, rpk_getConsoleLogs');
}

// ============================================================================
// Cleanup
// ============================================================================

export function cleanupCDPMonitoring(browserViewId: number): void {
	const monitor = cdpMonitors.get(browserViewId);
	if (monitor) {
		for (const cleanup of monitor.cleanupFunctions) {
			try {
				cleanup();
			} catch (e) {
				console.error('[CDP Tools] Error during cleanup:', e);
			}
		}
		cdpMonitors.delete(browserViewId);
	}
}
