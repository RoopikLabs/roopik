/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Browser Tool Executor
 *
 * Unified execution logic for browser tools.
 * Called by both HTTP MCP transport and WebSocket transport.
 */

import type { BrowserViewService } from '../../projectMode/browserViewService.js';
import type { IRoopikStorageService } from '../../../common/storage/storageService.js';
import type {
	ToolResult,
	BrowserOpenResult,
	BrowserScreenshotResult,
	BrowserNavigateResult,
	BrowserActionResult,
	BrowserConsoleLogsResult,
	BrowserErrorsResult,
	BrowserPerformanceResult,
	BrowserStateResult,
	ElementInspectionResult,
	ScriptExecutionResult,
	BrowserViewportResult,
	BrowserNetworkRequestsResult,
} from './types.js';

// ============================================================================
// CDP Monitoring State (shared across all calls)
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

const cdpMonitors = new Map<number, CDPMonitor>();

/**
 * Cleanup CDP monitoring for a specific browser view.
 * Exported for use by BrowserViewService when closing views.
 */
export function cleanupCDPMonitoring(browserViewId: number): void {
	const monitor = cdpMonitors.get(browserViewId);
	if (monitor) {
		for (const cleanup of monitor.cleanupFunctions) {
			try {
				cleanup();
			} catch {
				// Ignore cleanup errors
			}
		}
		cdpMonitors.delete(browserViewId);
	}
}

// ============================================================================
// Browser Executor Class
// ============================================================================

export class BrowserExecutor {
	constructor(
		private readonly browserViewService: BrowserViewService,
		private readonly storageService: IRoopikStorageService
	) {}

	// ==========================================================================
	// Browser Open
	// ==========================================================================

	async open(url?: string): Promise<ToolResult<BrowserOpenResult>> {
		try {
			const browserViewId = this.browserViewService.getActiveBrowserViewId();

			if (browserViewId === undefined) {
				// Browser not open - fire event for renderer to open it
				this.browserViewService.requestBrowserOpen(url);

				return {
					success: true,
					data: {
						message: 'Browser open request sent. The browser will open shortly.',
						url: url || undefined
					}
				};
			}

			// Browser is already open - navigate if URL provided
			if (url) {
				await this.browserViewService.navigate(browserViewId, url);
				// Enable CDP monitoring proactively to capture errors from page load
				await this.ensureCDPMonitoring(browserViewId);
				return {
					success: true,
					data: {
						browserViewId,
						url,
						message: `Navigated to ${url}`
					}
				};
			}

			// Enable CDP monitoring even if not navigating (browser already open)
			await this.ensureCDPMonitoring(browserViewId);

			return {
				success: true,
				data: {
					browserViewId,
					message: 'Browser is already open'
				}
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	// ==========================================================================
	// Browser Screenshot
	// ==========================================================================

	async screenshot(): Promise<ToolResult<BrowserScreenshotResult>> {
		try {
			const browserViewId = this.browserViewService.getActiveBrowserViewId();
			if (browserViewId === undefined) {
				return {
					success: false,
					error: 'No browser is open. Start a project first with project_start.'
				};
			}

			const result = await this.browserViewService.takeScreenshotWithMetadata(browserViewId);

			return {
				success: true,
				data: {
					image: result.image,
					format: 'data-url',
					viewport: {
						width: result.width,
						height: result.height,
						devicePixelRatio: result.devicePixelRatio
					}
				}
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	// ==========================================================================
	// Browser Navigate
	// ==========================================================================

	async navigate(url: string): Promise<ToolResult<BrowserNavigateResult>> {
		try {
			const browserViewId = this.browserViewService.getActiveBrowserViewId();
			if (browserViewId === undefined) {
				return {
					success: false,
					error: 'No browser is open. Use browser_open first.'
				};
			}

			await this.browserViewService.navigate(browserViewId, url);

			// Enable CDP monitoring proactively to capture errors from page load
			await this.ensureCDPMonitoring(browserViewId);

			return {
				success: true,
				data: {
					browserViewId,
					url,
					message: `Navigated to ${url}`
				}
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	// ==========================================================================
	// Browser Reload
	// ==========================================================================

	async reload(hardReload?: boolean): Promise<ToolResult<{ message: string }>> {
		try {
			const browserViewId = this.browserViewService.getActiveBrowserViewId();
			if (browserViewId === undefined) {
				return {
					success: false,
					error: 'No browser is open.'
				};
			}

			await this.browserViewService.reload(browserViewId, hardReload);

			// Enable CDP monitoring proactively to capture errors from reload
			await this.ensureCDPMonitoring(browserViewId);

			return {
				success: true,
				data: {
					message: hardReload ? 'Hard reload completed' : 'Reload completed'
				}
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	// ==========================================================================
	// Browser Action Input (click, type, scroll, etc.)
	// ==========================================================================

	async actionInput(params: {
		action: 'click' | 'right_click' | 'double_click' | 'hover' | 'drag' | 'type' | 'press' | 'scroll';
		coordinate?: string;  // 'x,y' or 'x,y@WIDTHxHEIGHT'
		text?: string;
		key?: string;
		modifiers?: string[];
		deltaX?: number;
		deltaY?: number;
	}): Promise<ToolResult<BrowserActionResult>> {
		try {
			const browserViewId = this.browserViewService.getActiveBrowserViewId();
			if (browserViewId === undefined) {
				return {
					success: false,
					error: 'No browser is open.'
				};
			}

			const { action, coordinate, text, key, modifiers, deltaX, deltaY } = params;

			// Parse coordinate string: 'x,y@WIDTHxHEIGHT'
			let x = 0, y = 0, refWidth: number | undefined, refHeight: number | undefined;

			if (coordinate) {
				const match = coordinate.match(/^(\d+),(\d+)(?:@(\d+)x(\d+))?$/);
				if (!match) {
					return {
						success: false,
						error: `Invalid coordinate format: '${coordinate}'. Expected 'x,y' or 'x,y@WIDTHxHEIGHT'`
					};
				}
				x = parseInt(match[1], 10);
				y = parseInt(match[2], 10);
				if (match[3] && match[4]) {
					refWidth = parseInt(match[3], 10);
					refHeight = parseInt(match[4], 10);
				}
			}

			let message = '';

			switch (action) {
				case 'click':
				case 'right_click':
				case 'double_click':
				case 'hover':
					if (!coordinate) {
						return { success: false, error: `'${action}' requires 'coordinate' parameter` };
					}
					await this.browserViewService.sendMouseEvent(
						browserViewId,
						action as 'click' | 'right_click' | 'double_click' | 'hover',
						x, y, refWidth, refHeight
					);
					message = `${action} at (${x}, ${y})`;
					break;

				case 'drag':
					if (!coordinate || deltaX === undefined || deltaY === undefined) {
						return { success: false, error: "'drag' requires 'coordinate' and 'deltaX'/'deltaY'" };
					}
					await this.browserViewService.sendDragEvent(
						browserViewId,
						x, y, x + deltaX, y + deltaY,
						refWidth, refHeight
					);
					message = 'Drag completed';
					break;

				case 'type':
					if (!text) {
						return { success: false, error: "'type' requires 'text' parameter" };
					}
					await this.browserViewService.sendTypeEvent(browserViewId, text);
					message = `Typed ${text.length} characters`;
					break;

				case 'press':
					if (!key) {
						return { success: false, error: "'press' requires 'key' parameter" };
					}
					await this.browserViewService.sendKeyEvent(browserViewId, key, modifiers);
					message = `Pressed ${key}`;
					break;

				case 'scroll':
					if (deltaX === undefined && deltaY === undefined) {
						return { success: false, error: "'scroll' requires 'deltaX' and/or 'deltaY'" };
					}
					await this.browserViewService.sendScrollEvent(
						browserViewId,
						deltaX ?? 0,
						deltaY ?? 0,
						coordinate ? x : undefined,
						coordinate ? y : undefined
					);
					message = 'Scrolled';
					break;

				default:
					return { success: false, error: `Unknown action: ${action}` };
			}

			return {
				success: true,
				data: {
					browserViewId,
					action,
					success: true,
					message
				}
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	// ==========================================================================
	// Browser Execute Script
	// ==========================================================================

	async executeScript(script: string): Promise<ToolResult<ScriptExecutionResult>> {
		try {
			const browserViewId = this.browserViewService.getActiveBrowserViewId();
			if (browserViewId === undefined) {
				return {
					success: false,
					error: 'No browser is open.'
				};
			}

			const result = await this.browserViewService.executeScript(browserViewId, script);

			return {
				success: true,
				data: {
					result,
					type: typeof result
				}
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	// ==========================================================================
	// Browser Inspect Element
	// ==========================================================================

	async inspectElement(params: {
		selector: string;
		includeInherited?: boolean;
	}): Promise<ToolResult<ElementInspectionResult>> {
		try {
			const browserViewId = this.browserViewService.getActiveBrowserViewId();
			if (browserViewId === undefined) {
				return {
					success: false,
					error: 'No browser is open.'
				};
			}

			const workspacePath = this.storageService.getWorkspacePath();

			const result = await this.browserViewService.getElementStyles({
				browserViewId,
				target: params.selector,
				projectRoot: workspacePath,
				includeUserAgent: false,
				includeInherited: params.includeInherited ?? true
			});

			if (!result.success || !result.data) {
				return {
					success: false,
					error: result.error || 'Element not found'
				};
			}

			const data = result.data;

			return {
				success: true,
				data: {
					selector: params.selector,
					element: {
						tag: data.tagName,
						classes: data.classes,
						componentName: data.componentName,
						componentSource: data.htmlSource
					},
					matchedRules: data.matchedRules?.map((rule: any) => ({
						selector: rule.selector,
						file: rule.file,
						location: rule.location,
						properties: rule.properties,
						specificity: rule.specificity,
						origin: rule.origin
					})),
					inlineStyles: data.inlineStyles,
					inheritedStyles: data.inheritedStyles,
					properties: data.properties,
					cssInJs: data.cssInJs
				}
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	// ==========================================================================
	// Browser Get Console Logs (requires CDP)
	// ==========================================================================

	async getConsoleLogs(options?: {
		types?: string[];
		since?: number;
		limit?: number;
		clear?: boolean;
	}): Promise<ToolResult<BrowserConsoleLogsResult>> {
		try {
			const browserViewId = this.browserViewService.getActiveBrowserViewId();
			if (browserViewId === undefined) {
				return {
					success: false,
					error: 'No browser is open.'
				};
			}

			await this.ensureCDPMonitoring(browserViewId);
			const monitor = cdpMonitors.get(browserViewId);

			if (!monitor) {
				return {
					success: false,
					error: 'CDP monitoring not initialized.'
				};
			}

			let logs = [...monitor.consoleLogs];

			// Filter by types
			if (options?.types && options.types.length > 0) {
				logs = logs.filter(log => options.types!.includes(log.type));
			}

			// Filter by timestamp
			if (options?.since) {
				logs = logs.filter(log => log.timestamp >= options.since!);
			}

			// Apply limit
			if (options?.limit) {
				logs = logs.slice(-options.limit);
			}

			// Clear if requested
			if (options?.clear) {
				monitor.consoleLogs = [];
			}

			return {
				success: true,
				data: {
					logs: logs.map(log => ({
						id: log.id,
						timestamp: log.timestamp,
						type: log.type,
						message: log.message,
						args: log.args,
						location: log.location
					})),
					count: logs.length
				}
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	// ==========================================================================
	// Browser Get Errors (requires CDP) - Console errors + Network failures
	// ==========================================================================

	async getErrors(limit?: number): Promise<ToolResult<BrowserErrorsResult>> {
		try {
			const browserViewId = this.browserViewService.getActiveBrowserViewId();
			if (browserViewId === undefined) {
				return {
					success: false,
					error: 'No browser is open.'
				};
			}

			await this.ensureCDPMonitoring(browserViewId);
			const monitor = cdpMonitors.get(browserViewId);

			if (!monitor) {
				return {
					success: false,
					error: 'CDP monitoring not initialized.'
				};
			}

			const maxErrors = Math.min(limit || 50, 200);

			// Get console errors (error type only)
			const consoleErrors = monitor.consoleLogs
				.filter(log => log.type === 'error')
				.slice(-maxErrors)
				.map(log => ({
					id: log.id,
					timestamp: log.timestamp,
					source: 'console' as const,
					type: 'error' as const,
					message: log.message,
					location: log.location
				}));

			// Get failed network requests (4xx, 5xx, or status 0)
			const networkErrors = monitor.networkResponses
				.filter(res => res.status >= 400 || res.status === 0)
				.slice(-maxErrors)
				.map(res => {
					const request = monitor.networkRequests.find(req => req.requestId === res.requestId);
					return {
						id: res.id,
						timestamp: res.timestamp,
						source: 'network' as const,
						type: res.status === 0 ? 'network_failure' : `http_${res.status}`,
						message: res.status === 0 ? res.statusText : `${res.status} ${res.statusText}`,
						url: res.url || request?.url,
						method: request?.method
					};
				});

			// Combine and sort by timestamp (most recent first)
			const allErrors = [...consoleErrors, ...networkErrors]
				.sort((a, b) => b.timestamp - a.timestamp)
				.slice(0, maxErrors);

			return {
				success: true,
				data: {
					errors: allErrors,
					count: allErrors.length
				}
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	// ==========================================================================
	// Browser Close
	// ==========================================================================

	async close(): Promise<ToolResult<{ message: string }>> {
		try {
			const browserViewId = this.browserViewService.getActiveBrowserViewId();
			if (browserViewId === undefined) {
				return {
					success: true,
					data: { message: 'No browser was open' }
				};
			}

			// Cleanup CDP monitoring
			this.cleanupCDPMonitoring(browserViewId);

			// Close browser using event-based approach (renderer handles UI cleanup)
			this.browserViewService.requestBrowserClose();

			return {
				success: true,
				data: { message: 'Browser close request sent' }
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	// ==========================================================================
	// Browser Get Performance Metrics
	// ==========================================================================

	async getPerformance(): Promise<ToolResult<BrowserPerformanceResult>> {
		try {
			const browserViewId = this.browserViewService.getActiveBrowserViewId();
			if (browserViewId === undefined) {
				return {
					success: false,
					error: 'No browser is open.'
				};
			}

			// Ensure CDP is attached
			await this.browserViewService.attachDebugger(browserViewId);

			// Get performance metrics via CDP
			const metricsResult = await this.browserViewService.sendCDPCommand(browserViewId, 'Performance.getMetrics') as { metrics: Array<{ name: string; value: number }> };

			// Get Web Vitals via script injection
			const webVitalsScript = `
				(function() {
					const result = {};

					// LCP (Largest Contentful Paint)
					if (window.PerformanceObserver) {
						const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
						if (lcpEntries.length > 0) {
							result.lcp = lcpEntries[lcpEntries.length - 1].startTime;
						}
					}

					// CLS (Cumulative Layout Shift)
					const layoutShiftEntries = performance.getEntriesByType('layout-shift');
					if (layoutShiftEntries.length > 0) {
						result.cls = layoutShiftEntries.reduce((sum, entry) => sum + (entry.hadRecentInput ? 0 : entry.value), 0);
					}

					// FCP (First Contentful Paint)
					const fcpEntries = performance.getEntriesByType('paint').filter(e => e.name === 'first-contentful-paint');
					if (fcpEntries.length > 0) {
						result.fcp = fcpEntries[0].startTime;
					}

					// Navigation timing
					const nav = performance.getEntriesByType('navigation')[0];
					if (nav) {
						result.ttfb = nav.responseStart;
						result.domContentLoaded = nav.domContentLoadedEventEnd;
						result.load = nav.loadEventEnd;
					}

					return result;
				})()
			`;

			const webVitals = await this.browserViewService.executeScript(browserViewId, webVitalsScript) as Record<string, number>;

			// Format metrics
			const metrics: Record<string, number> = {};
			if (metricsResult?.metrics) {
				for (const metric of metricsResult.metrics) {
					metrics[metric.name] = metric.value;
				}
			}

			return {
				success: true,
				data: {
					webVitals: webVitals || {},
					runtimeMetrics: {
						jsHeapUsedSize: metrics['JSHeapUsedSize'],
						jsHeapTotalSize: metrics['JSHeapTotalSize'],
						domNodes: metrics['Nodes'],
						layoutCount: metrics['LayoutCount'],
						recalcStyleCount: metrics['RecalcStyleCount'],
						layoutDuration: metrics['LayoutDuration'],
						recalcStyleDuration: metrics['RecalcStyleDuration'],
						scriptDuration: metrics['ScriptDuration'],
						taskDuration: metrics['TaskDuration']
					}
				}
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	// ==========================================================================
	// Browser Set Viewport (requires CDP)
	// Smart design: omit width/height to clear/reset viewport override
	// ==========================================================================

	async setViewport(params?: {
		width?: number;
		height?: number;
		deviceScaleFactor?: number;
		mobile?: boolean;
	}): Promise<ToolResult<BrowserViewportResult>> {
		try {
			const browserViewId = this.browserViewService.getActiveBrowserViewId();
			if (browserViewId === undefined) {
				return {
					success: false,
					error: 'No browser is open.'
				};
			}

			// Ensure CDP is attached
			await this.browserViewService.attachDebugger(browserViewId);

			// If width/height not provided, clear the viewport override (restore to natural size)
			if (!params?.width || !params?.height) {
				await this.browserViewService.sendCDPCommand(browserViewId, 'Emulation.clearDeviceMetricsOverride');

				return {
					success: true,
					data: {
						width: 0,
						height: 0,
						deviceScaleFactor: 1,
						mobile: false,
						message: 'Viewport override cleared - restored to natural browser size'
					}
				};
			}

			const { width, height, deviceScaleFactor = 1, mobile = false } = params;

			// Set viewport via CDP Emulation
			await this.browserViewService.sendCDPCommand(browserViewId, 'Emulation.setDeviceMetricsOverride', {
				width,
				height,
				deviceScaleFactor,
				mobile
			});

			return {
				success: true,
				data: {
					width,
					height,
					deviceScaleFactor,
					mobile,
					message: `Viewport set to ${width}x${height} (scale: ${deviceScaleFactor}, mobile: ${mobile})`
				}
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	// ==========================================================================
	// Browser Get Network Requests (requires CDP)
	// ==========================================================================

	async getNetworkRequests(options?: {
		urlFilter?: string;
		method?: string;
		statusFilter?: 'success' | 'error' | 'all';
		limit?: number;
	}): Promise<ToolResult<BrowserNetworkRequestsResult>> {
		try {
			const browserViewId = this.browserViewService.getActiveBrowserViewId();
			if (browserViewId === undefined) {
				return {
					success: false,
					error: 'No browser is open.'
				};
			}

			await this.ensureCDPMonitoring(browserViewId);
			const monitor = cdpMonitors.get(browserViewId);

			if (!monitor) {
				return {
					success: false,
					error: 'CDP monitoring not initialized.'
				};
			}

			// Combine requests and responses
			let requests = monitor.networkRequests.map(req => {
				const response = monitor.networkResponses.find(res => res.requestId === req.requestId);
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

			// Apply URL filter
			if (options?.urlFilter) {
				const filter = options.urlFilter.toLowerCase();
				requests = requests.filter(r => r.url.toLowerCase().includes(filter));
			}

			// Apply method filter
			if (options?.method) {
				const method = options.method.toUpperCase();
				requests = requests.filter(r => r.method.toUpperCase() === method);
			}

			// Apply status filter
			if (options?.statusFilter && options.statusFilter !== 'all') {
				if (options.statusFilter === 'success') {
					requests = requests.filter(r => r.status && r.status >= 200 && r.status < 400);
				} else if (options.statusFilter === 'error') {
					requests = requests.filter(r => !r.status || r.status >= 400 || r.status === 0);
				}
			}

			// Apply limit
			const limit = Math.min(options?.limit || 100, 500);
			requests = requests.slice(-limit);

			return {
				success: true,
				data: {
					requests,
					count: requests.length
				}
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	// ==========================================================================
	// Browser Get State
	// ==========================================================================

	async getState(): Promise<ToolResult<BrowserStateResult>> {
		try {
			const browserViewId = this.browserViewService.getActiveBrowserViewId();

			// Get browser state if open
			let currentUrl: string | undefined;
			let title: string | undefined;
			let isLoading = false;
			let devServerRunning = false;

			if (browserViewId !== undefined) {
				// Get URL and title via script execution
				const stateScript = `({ url: window.location.href, title: document.title })`;
				const state = await this.browserViewService.executeScript(browserViewId, stateScript) as { url: string; title: string };
				currentUrl = state?.url;
				title = state?.title;
				devServerRunning = true;
			}

			return {
				success: true,
				data: {
					browserOpen: browserViewId !== undefined,
					browserViewId,
					currentUrl,
					title,
					isLoading,
					devServerRunning,
					message: browserViewId !== undefined
						? `Browser is open at ${currentUrl}`
						: 'No browser is currently open. Use browser_open or project_start to open one.'
				}
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	// ==========================================================================
	// CDP Monitoring Helpers
	// ==========================================================================

	private async ensureCDPMonitoring(browserViewId: number): Promise<void> {
		// Clean up stale monitors
		for (const [monitoredId] of cdpMonitors) {
			if (monitoredId !== browserViewId) {
				this.cleanupCDPMonitoring(monitoredId);
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

		await this.browserViewService.attachDebugger(browserViewId);
		await this.browserViewService.sendCDPCommand(browserViewId, 'Runtime.enable');
		await this.browserViewService.sendCDPCommand(browserViewId, 'Network.enable');
		await this.browserViewService.sendCDPCommand(browserViewId, 'Page.enable');

		// Console logging
		const consoleCleanup = this.browserViewService.onCDPEvent(browserViewId, (method: string, params: unknown) => {
			if (method === 'Runtime.consoleAPICalled') {
				this.handleConsoleMessage(monitor, params as any);
			} else if (method === 'Runtime.exceptionThrown') {
				this.handleException(monitor, params as any);
			}
		});
		monitor.cleanupFunctions.push(consoleCleanup);

		// Network monitoring
		const networkCleanup = this.browserViewService.onCDPEvent(browserViewId, (method: string, params: unknown) => {
			if (method === 'Network.requestWillBeSent') {
				this.handleNetworkRequest(monitor, params as any);
			} else if (method === 'Network.responseReceived') {
				this.handleNetworkResponse(monitor, params as any);
			} else if (method === 'Network.loadingFailed') {
				this.handleNetworkFailure(monitor, params as any);
			}
		});
		monitor.cleanupFunctions.push(networkCleanup);

		cdpMonitors.set(browserViewId, monitor);
	}

	private cleanupCDPMonitoring(browserViewId: number): void {
		const monitor = cdpMonitors.get(browserViewId);
		if (monitor) {
			for (const cleanup of monitor.cleanupFunctions) {
				try {
					cleanup();
				} catch {
					// Ignore cleanup errors
				}
			}
			cdpMonitors.delete(browserViewId);
		}
	}

	private handleConsoleMessage(monitor: CDPMonitor, params: {
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
			args: args.map(a => a.value),
			location,
			stackTrace
		};

		monitor.consoleLogs.push(log);
		if (monitor.consoleLogs.length > 1000) {
			monitor.consoleLogs.shift();
		}
	}

	private handleException(monitor: CDPMonitor, params: {
		timestamp: number;
		exceptionDetails: {
			text: string;
			url?: string;
			lineNumber?: number;
			columnNumber?: number;
			stackTrace?: { callFrames: Array<{ url: string; lineNumber: number; columnNumber: number; functionName: string }> };
		};
	}): void {
		const { timestamp, exceptionDetails } = params;

		const location = exceptionDetails.url && exceptionDetails.lineNumber !== undefined
			? `${exceptionDetails.url}:${exceptionDetails.lineNumber}:${exceptionDetails.columnNumber}`
			: undefined;

		// Log exceptions as console errors (matches browserTools.ts behavior)
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

	private handleNetworkRequest(monitor: CDPMonitor, params: {
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

	private handleNetworkResponse(monitor: CDPMonitor, params: {
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

	private handleNetworkFailure(monitor: CDPMonitor, params: {
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
}
