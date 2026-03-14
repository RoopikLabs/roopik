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
 *
 * IMPORTANT: Uses module-level state so ALL instances share the same data.
 * This ensures both Claude Code and Dio agent see the same console logs/errors.
 *
 * SELF-HEALING ARCHITECTURE:
 * - Auto-clears on Page.loadEventFired (page reload/HMR) to prevent "ghost" errors
 * - Filters HMR/Vite/WDS noise at capture time to save tokens
 * - Classifies network requests as 'static' vs 'api' for compression
 */

import type { IBrowserBackend } from '../projectMode/browserBackend.js';

// ============================================================================
// Noise Filtering Patterns
// ============================================================================

/**
 * Console messages matching these patterns are dev-tool noise with no debugging value.
 * Filtering at capture time saves tokens and prevents agent confusion.
 */
const NOISE_PATTERNS = [
	/^\[HMR\]/,              // Webpack Hot Module Replacement
	/^\[WDS\]/,              // Webpack Dev Server
	/^\[vite\]/,             // Vite dev server
	/React DevTools/,        // React DevTools promotion
	/Download the React/,    // React DevTools banner
	/Fast Refresh/,          // React Fast Refresh
	/hot updated/i,          // Generic HMR messages
	/Compiled successfully/, // CRA/Next.js compile messages
	/webpack.*compiled/i,    // Webpack compiled messages
];

/**
 * Static asset file extensions - these requests are noise for debugging.
 * API calls and failures are signal; static assets are noise.
 */
const STATIC_ASSET_REGEX = /\.(js|mjs|cjs|jsx|ts|tsx|css|scss|sass|less|png|jpg|jpeg|gif|webp|ico|svg|woff|woff2|ttf|eot|otf|map|json)(\?.*)?$/i;

// ============================================================================
// Module-Level Shared State
// ============================================================================

/**
 * Shared monitors map - all CDPMonitorService instances operate on this.
 * This ensures console logs captured by one agent are visible to all agents.
 */
const sharedMonitors = new Map<number, CDPMonitor>();

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
	/** Classification: 'static' for JS/CSS/images, 'api' for API calls */
	type: 'static' | 'api';
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
// Exported Cleanup Function
// ============================================================================

/**
 * Cleanup CDP monitoring for a specific browser view.
 * Exported for use by BrowserViewService when destroying browser views.
 *
 * This is a module-level function that operates on the shared state,
 * so it works regardless of which CDPMonitorService instance was used.
 */
export function cleanupCDPMonitoring(browserViewId: number): void {
	const monitor = sharedMonitors.get(browserViewId);
	if (monitor) {
		for (const cleanup of monitor.cleanupFunctions) {
			try {
				cleanup();
			} catch {
				// Ignore cleanup errors
			}
		}
		sharedMonitors.delete(browserViewId);
	}
}

// ============================================================================
// CDP Monitor Service
// ============================================================================

export class CDPMonitorService {
	constructor(
		private readonly browserViewService: IBrowserBackend
	) {
		// Auto-initialize CDP monitoring for ALL browser views
		// This ensures monitoring works regardless of how browser was opened (tool, manual, etc.)
		this.browserViewService.onBrowserViewCreated(({ browserViewId }) => {
			// Initialize asynchronously, don't block browser creation
			this.ensureMonitoring(browserViewId).catch(err => {
				console.error('[CDP] Failed to initialize monitoring for browserViewId:', browserViewId, err);
			});
		});

		// Optional: Explicit cleanup on destroy (though cleanup already happens in destroyBrowserView)
		this.browserViewService.onBrowserViewDestroyed(({ browserViewId }) => {
			this.cleanup(browserViewId);
		});
	}

	// ==========================================================================
	// Public API
	// ==========================================================================

	/**
	 * Ensure CDP monitoring is active for a browser view.
	 * Safe to call multiple times - only sets up once per browserViewId.
	 */
	async ensureMonitoring(browserViewId: number): Promise<void> {
		// Cleanup stale monitors from other browser views
		for (const [monitoredId] of sharedMonitors) {
			if (monitoredId !== browserViewId) {
				this.cleanup(monitoredId);
			}
		}

		if (sharedMonitors.has(browserViewId)) {
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
		} catch (err) {
			// Log the actual error instead of silently failing
			console.error('[CDP] Failed to attach debugger to browserViewId:', browserViewId, err);
			// Don't throw - CDP monitoring is optional, browser should still work
			return;
		}

		// Enable CDP domains in parallel for efficiency
		await Promise.all([
			this.browserViewService.sendCDPCommand(browserViewId, 'Runtime.enable', {}),
			this.browserViewService.sendCDPCommand(browserViewId, 'Network.enable', {}),
			this.browserViewService.sendCDPCommand(browserViewId, 'Page.enable', {}),  // NEW: Lifecycle events
		]);

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
				case 'Page.loadEventFired':
					// AUTO-CLEAR: Page reloaded (manual refresh or HMR)
					// Previous errors are now stale - clear for fresh state
					this.clearMonitorData(monitor);
					break;
			}
		});
		monitor.cleanupFunctions.push(cdpCleanup);

		sharedMonitors.set(browserViewId, monitor);
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
		const monitor = sharedMonitors.get(browserViewId);
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
		const monitor = sharedMonitors.get(browserViewId);
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
					message: response.status === 0 ? 'Request failed' : (response.statusText || `HTTP ${response.status}`),
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
		includeStaticAssets?: boolean;
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
		const monitor = sharedMonitors.get(browserViewId);
		if (!monitor) {
			return [];
		}

		// Join requests with responses, including request type for filtering
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
				responseHeaders: response?.headers,
				_type: req.type  // Internal: used for filtering
			};
		});

		// Filter static assets unless includeStaticAssets is true
		if (!options?.includeStaticAssets) {
			requests = requests.filter(r => {
				// Always show API requests
				if (r._type === 'api') {
					return true;
				}
				// Always show localhost/127.0.0.1 (project assets)
				if (this.isLocalhost(r.url)) {
					return true;
				}
				// Hide external static assets
				return false;
			});
		}

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
		const limitedRequests = requests.slice(-limit);

		// Remove internal _type field before returning
		return limitedRequests.map(({ _type, ...rest }) => rest);
	}

	/**
	 * Cleanup CDP monitoring for a browser view.
	 * Delegates to the module-level function for consistency.
	 */
	cleanup(browserViewId: number): void {
		cleanupCDPMonitoring(browserViewId);
	}

	/**
	 * Check if monitoring is active for a browser view.
	 */
	isMonitoring(browserViewId: number): boolean {
		return sharedMonitors.has(browserViewId);
	}

	/**
	 * Manually clear all CDP data for a browser view.
	 * Useful for agent to reset state before specific actions.
	 */
	clearAllData(browserViewId: number): void {
		const monitor = sharedMonitors.get(browserViewId);
		if (monitor) {
			this.clearMonitorData(monitor);
		}
	}

	/**
	 * Get compressed network summary optimized for self-healing agents.
	 * API requests shown individually, static assets summarized.
	 */
	getNetworkSummary(browserViewId: number): {
		apiRequests: Array<{ method: string; url: string; status?: number; statusText?: string; duration?: number }>;
		failures: Array<{ method: string; url: string; status: number; statusText: string; error?: string }>;
		staticAssetsSummary: { loaded: number; failed: number };
	} {
		const monitor = sharedMonitors.get(browserViewId);
		if (!monitor) {
			return { apiRequests: [], failures: [], staticAssetsSummary: { loaded: 0, failed: 0 } };
		}

		const apiRequests: Array<{ method: string; url: string; status?: number; statusText?: string; duration?: number }> = [];
		const failures: Array<{ method: string; url: string; status: number; statusText: string; error?: string }> = [];
		let staticLoaded = 0;
		let staticFailed = 0;

		for (const req of monitor.networkRequests) {
			const response = monitor.networkResponses.find(r => r.requestId === req.requestId);
			const status = response?.status ?? 0;

			if (req.type === 'static') {
				// Static assets: just count them
				if (status >= 200 && status < 400) {
					staticLoaded++;
				} else if (status >= 400 || status === 0) {
					staticFailed++;
				}
			} else {
				// API request: include full details
				if (status >= 400 || status === 0) {
					failures.push({
						method: req.method,
						url: req.url,
						status,
						statusText: response?.statusText || 'Failed',
						error: status === 0 ? 'Request failed' : undefined
					});
				} else if (response) {
					apiRequests.push({
						method: req.method,
						url: req.url,
						status: response.status,
						statusText: response.statusText,
						duration: response.duration
					});
				}
			}
		}

		return {
			apiRequests,
			failures,
			staticAssetsSummary: { loaded: staticLoaded, failed: staticFailed }
		};
	}

	// ==========================================================================
	// Internal Helpers
	// ==========================================================================

	/**
	 * Clear console logs only (called on Page.loadEventFired).
	 * Console logs are cleared to remove HMR noise after page reload.
	 * Network requests are KEPT so agents can analyze them after page load completes.
	 */
	private clearMonitorData(monitor: CDPMonitor): void {
		// Only clear console logs - they're noisy with HMR/Vite spam
		monitor.consoleLogs = [];
		// Keep network requests - agents need these after page loads!
		// Network requests will accumulate until browser is closed or manually cleared
	}

	/**
	 * Check if a console message is HMR/dev-tool noise.
	 */
	private isNoisyLog(message: string): boolean {
		return NOISE_PATTERNS.some(pattern => pattern.test(message));
	}

	/**
	 * Check if a URL is for a static asset.
	 */
	private isStaticAsset(url: string): boolean {
		try {
			const pathname = new URL(url).pathname;
			return STATIC_ASSET_REGEX.test(pathname);
		} catch {
			return STATIC_ASSET_REGEX.test(url);
		}
	}

	/**
	 * Check if a URL is from localhost/127.0.0.1 (project assets).
	 * Project assets should always be visible for debugging.
	 */
	private isLocalhost(url: string): boolean {
		try {
			const urlObj = new URL(url);
			const hostname = urlObj.hostname.toLowerCase();
			return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
		} catch {
			return false;
		}
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

		const fullMessage = messages.join(' ');

		// NOISE FILTER: Drop HMR/Vite/WDS messages at capture time
		// These waste tokens and have no debugging value for agents
		if (this.isNoisyLog(fullMessage)) {
			return;
		}

		const log: ConsoleLog = {
			id: `console-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
			timestamp: timestamp * 1000,
			type: type as ConsoleLog['type'],
			message: fullMessage,
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

		// CLASSIFY: static assets vs API calls
		// Static assets will be summarized, API calls shown in full
		const requestType = this.isStaticAsset(request.url) ? 'static' : 'api';

		const networkRequest: NetworkRequest = {
			id: `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
			requestId,
			timestamp: timestamp * 1000,
			method: request.method,
			url: request.url,
			headers: request.headers || {},
			postData: request.postData,
			type: requestType
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
