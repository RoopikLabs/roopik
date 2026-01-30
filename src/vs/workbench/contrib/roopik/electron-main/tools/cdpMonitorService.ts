/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * CDP Monitor Service
 *
 * Centralized Chrome DevTools Protocol monitoring.
 * Single source of truth for console logs, errors, and network requests.
 *
 * Used by both WebSocket MCP (external agents) and Native IPC (Dio agent).
 */

import type { BrowserViewService } from '../projectMode/browserViewService.js';

// ============================================================================
// CDP Monitor Types
// ============================================================================

export interface ConsoleLog {
	id: string;
	timestamp: number;
	type: 'log' | 'debug' | 'info' | 'warn' | 'error' | 'dir' | 'dirxml' | 'table' | 'trace' | 'clear' | 'assert';
	message: string;
	args?: unknown[];
	location?: string;
	stackTrace?: { callFrames: Array<{ url: string; lineNumber: number; columnNumber: number; functionName: string }> };
}

export interface NetworkRequest {
	id: string;
	requestId: string;
	timestamp: number;
	method: string;
	url: string;
	headers: Record<string, string>;
	postData?: string;
}

export interface NetworkResponse {
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
// CDP Monitor Service
// ============================================================================

export class CDPMonitorService {
	private readonly monitors = new Map<number, CDPMonitor>();

	constructor(
		private readonly browserViewService: BrowserViewService
	) {}

	// ==========================================================================
	// Public API
	// ==========================================================================

	/**
	 * Ensure CDP monitoring is active for a browser view.
	 * Safe to call multiple times - only sets up once per browserViewId.
	 */
	async ensureMonitoring(browserViewId: number): Promise<void> {
		// Cleanup stale monitors from other browser views
		for (const [monitoredId] of this.monitors) {
			if (monitoredId !== browserViewId) {
				this.cleanup(monitoredId);
			}
		}

		if (this.monitors.has(browserViewId)) {
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

		// Attach debugger (throws on failure)
		try {
			await this.browserViewService.attachDebugger(browserViewId);
		} catch {
			return;
		}

		// Enable Runtime domain for console
		await this.browserViewService.sendCDPCommand(browserViewId, 'Runtime.enable', {});

		// Register CDP event listener - single listener handles all events
		const cdpCleanup = this.browserViewService.onCDPEvent(browserViewId, (method, params) => {
			switch (method) {
				case 'Runtime.consoleAPICalled':
					this.handleConsoleMessage(monitor, params as Parameters<CDPMonitorService['handleConsoleMessage']>[1]);
					break;
				case 'Network.requestWillBeSent':
					this.handleNetworkRequest(monitor, params as Parameters<CDPMonitorService['handleNetworkRequest']>[1]);
					break;
				case 'Network.responseReceived':
					this.handleNetworkResponse(monitor, params as Parameters<CDPMonitorService['handleNetworkResponse']>[1]);
					break;
				case 'Network.loadingFailed':
					this.handleNetworkFailed(monitor, params as Parameters<CDPMonitorService['handleNetworkFailed']>[1]);
					break;
			}
		});
		monitor.cleanupFunctions.push(cdpCleanup);

		// Enable Network domain for requests
		await this.browserViewService.sendCDPCommand(browserViewId, 'Network.enable', {});

		this.monitors.set(browserViewId, monitor);
	}

	/**
	 * Get console logs for a browser view.
	 */
	getConsoleLogs(browserViewId: number, options?: {
		types?: string[];
		since?: number;
		limit?: number;
		clear?: boolean;
	}): ConsoleLog[] {
		const monitor = this.monitors.get(browserViewId);
		if (!monitor) {
			return [];
		}

		let logs = monitor.consoleLogs;

		// Filter by types
		if (options?.types && options.types.length > 0) {
			logs = logs.filter(log => options.types!.includes(log.type));
		}

		// Filter by timestamp
		if (options?.since) {
			logs = logs.filter(log => log.timestamp >= options.since!);
		}

		// Limit results
		if (options?.limit && options.limit > 0) {
			logs = logs.slice(-options.limit);
		}

		// Clear after reading if requested
		if (options?.clear) {
			monitor.consoleLogs = [];
		}

		return logs;
	}

	/**
	 * Get errors (console errors + network failures) for a browser view.
	 */
	getErrors(browserViewId: number, limit?: number): Array<{
		id: string;
		timestamp: number;
		source: 'console' | 'network';
		type: string;
		message: string;
		location?: string;
		url?: string;
		method?: string;
	}> {
		const monitor = this.monitors.get(browserViewId);
		if (!monitor) {
			return [];
		}

		const errors: Array<{
			id: string;
			timestamp: number;
			source: 'console' | 'network';
			type: string;
			message: string;
			location?: string;
			url?: string;
			method?: string;
		}> = [];

		// Console errors
		for (const log of monitor.consoleLogs) {
			if (log.type === 'error') {
				errors.push({
					id: log.id,
					timestamp: log.timestamp,
					source: 'console',
					type: 'error',
					message: log.message,
					location: log.location
				});
			}
		}

		// Network failures (4xx, 5xx, or failed)
		for (const response of monitor.networkResponses) {
			if (response.status >= 400 || response.status === 0) {
				const request = monitor.networkRequests.find(r => r.requestId === response.requestId);
				errors.push({
					id: response.id,
					timestamp: response.timestamp,
					source: 'network',
					type: response.status === 0 ? 'failed' : `${response.status}`,
					message: response.status === 0 ? 'Request failed' : response.statusText,
					url: response.url,
					method: request?.method
				});
			}
		}

		// Sort by timestamp
		errors.sort((a, b) => a.timestamp - b.timestamp);

		// Apply limit
		if (limit && limit > 0) {
			return errors.slice(-limit);
		}

		return errors;
	}

	/**
	 * Get network requests for a browser view.
	 */
	getNetworkRequests(browserViewId: number, options?: {
		urlFilter?: string;
		method?: string;
		statusFilter?: 'success' | 'error' | 'all';
		limit?: number;
	}): Array<{
		id: string;
		method: string;
		url: string;
		status?: number;
		statusText?: string;
		mimeType?: string;
		duration?: number;
		timestamp: number;
		requestHeaders?: Record<string, string>;
		responseHeaders?: Record<string, string>;
	}> {
		const monitor = this.monitors.get(browserViewId);
		if (!monitor) {
			return [];
		}

		// Join requests with responses
		let requests = monitor.networkRequests.map(req => {
			const response = monitor.networkResponses.find(r => r.requestId === req.requestId);
			return {
				id: req.id,
				method: req.method,
				url: req.url,
				status: response?.status,
				statusText: response?.statusText,
				mimeType: response?.mimeType,
				duration: response?.duration,
				timestamp: req.timestamp,
				requestHeaders: req.headers,
				responseHeaders: response?.headers
			};
		});

		// Filter by URL
		if (options?.urlFilter) {
			const filter = options.urlFilter.toLowerCase();
			requests = requests.filter(r => r.url.toLowerCase().includes(filter));
		}

		// Filter by method
		if (options?.method) {
			const method = options.method.toUpperCase();
			requests = requests.filter(r => r.method === method);
		}

		// Filter by status
		if (options?.statusFilter && options.statusFilter !== 'all') {
			if (options.statusFilter === 'success') {
				requests = requests.filter(r => r.status && r.status >= 200 && r.status < 400);
			} else if (options.statusFilter === 'error') {
				requests = requests.filter(r => !r.status || r.status >= 400);
			}
		}

		// Apply limit (max 500)
		const limit = Math.min(options?.limit || 100, 500);
		return requests.slice(-limit);
	}

	/**
	 * Cleanup CDP monitoring for a browser view.
	 */
	cleanup(browserViewId: number): void {
		const monitor = this.monitors.get(browserViewId);
		if (monitor) {
			for (const cleanup of monitor.cleanupFunctions) {
				try {
					cleanup();
				} catch {
					// Ignore cleanup errors
				}
			}
			this.monitors.delete(browserViewId);
		}
	}

	/**
	 * Check if monitoring is active for a browser view.
	 */
	isMonitoring(browserViewId: number): boolean {
		return this.monitors.has(browserViewId);
	}

	// ==========================================================================
	// Internal Handlers
	// ==========================================================================

	private handleConsoleMessage(monitor: CDPMonitor, params: {
		type: string;
		args: Array<{ type: string; value?: unknown; unserializableValue?: string; description?: string }>;
		timestamp: number;
		stackTrace?: { callFrames: Array<{ url: string; lineNumber: number; columnNumber: number; functionName: string }> };
	}): void {
		const { type, args, timestamp, stackTrace } = params;

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
			return '[object]';
		});

		const log: ConsoleLog = {
			id: `console-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
			timestamp: timestamp * 1000,
			type: type as ConsoleLog['type'],
			message: messages.join(' '),
			args: args.map(a => a.value),
			stackTrace
		};

		if (stackTrace?.callFrames?.[0]) {
			const frame = stackTrace.callFrames[0];
			log.location = `${frame.url}:${frame.lineNumber + 1}:${frame.columnNumber + 1}`;
		}

		monitor.consoleLogs.push(log);

		// Keep max 1000 logs
		if (monitor.consoleLogs.length > 1000) {
			monitor.consoleLogs.shift();
		}
	}

	private handleNetworkRequest(monitor: CDPMonitor, params: {
		requestId: string;
		request: { url: string; method: string; headers: Record<string, string>; postData?: string };
		timestamp: number;
	}): void {
		const { requestId, request, timestamp } = params;

		monitor.requestStartTimes.set(requestId, timestamp);

		const networkRequest: NetworkRequest = {
			id: `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
			requestId,
			timestamp: timestamp * 1000,
			method: request.method,
			url: request.url,
			headers: request.headers || {},
			postData: request.postData
		};

		monitor.networkRequests.push(networkRequest);

		// Keep max 500 requests
		if (monitor.networkRequests.length > 500) {
			monitor.networkRequests.shift();
		}
	}

	private handleNetworkResponse(monitor: CDPMonitor, params: {
		requestId: string;
		response: { url: string; status: number; statusText: string; headers: Record<string, string>; mimeType?: string };
		timestamp: number;
	}): void {
		const { requestId, response, timestamp } = params;

		const startTime = monitor.requestStartTimes.get(requestId);
		const duration = startTime ? (timestamp - startTime) * 1000 : undefined;

		const networkResponse: NetworkResponse = {
			id: `res-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
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

		// Keep max 500 responses
		if (monitor.networkResponses.length > 500) {
			monitor.networkResponses.shift();
		}
	}

	private handleNetworkFailed(monitor: CDPMonitor, params: {
		requestId: string;
		timestamp: number;
		errorText?: string;
	}): void {
		const { requestId, timestamp } = params;

		const request = monitor.networkRequests.find(r => r.requestId === requestId);

		const networkResponse: NetworkResponse = {
			id: `res-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
			requestId,
			timestamp: timestamp * 1000,
			status: 0,
			statusText: 'Failed',
			url: request?.url || 'unknown',
			headers: {}
		};

		monitor.networkResponses.push(networkResponse);

		if (monitor.networkResponses.length > 500) {
			monitor.networkResponses.shift();
		}
	}
}
