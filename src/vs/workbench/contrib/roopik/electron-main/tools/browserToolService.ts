/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Browser Tool Service
 *
 * Unified implementation of all browser tools.
 * Single source of truth - used by both WebSocket MCP and Native IPC.
 */

import type { BrowserViewService } from '../projectMode/browserViewService.js';
import type { CDPMonitorService } from './cdpMonitorService.js';
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
} from '../mcp/executor/types.js';

// ============================================================================
// Browser Tool Service
// ============================================================================

export class BrowserToolService {
	constructor(
		private readonly browserViewService: BrowserViewService,
		private readonly cdpMonitorService: CDPMonitorService
	) {}

	// ==========================================================================
	// Browser Open/Close
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
				// Enable CDP monitoring proactively
				await this.cdpMonitorService.ensureMonitoring(browserViewId);
				return {
					success: true,
					data: {
						browserViewId,
						url,
						message: `Navigated to ${url}`
					}
				};
			}

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
				error: error instanceof Error ? error.message : 'Failed to open browser'
			};
		}
	}

	async close(): Promise<ToolResult<{ message: string }>> {
		try {
			const browserViewId = this.browserViewService.getActiveBrowserViewId();

			if (browserViewId === undefined) {
				return {
					success: true,
					data: { message: 'Browser is not open' }
				};
			}

			// Cleanup CDP monitoring
			this.cdpMonitorService.cleanup(browserViewId);

			// Close browser using event-based approach
			this.browserViewService.requestBrowserClose();

			return {
				success: true,
				data: { message: 'Browser close request sent' }
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Failed to close browser'
			};
		}
	}

	// ==========================================================================
	// Screenshot
	// ==========================================================================

	async screenshot(): Promise<ToolResult<BrowserScreenshotResult>> {
		try {
			const browserViewId = this.browserViewService.getActiveBrowserViewId();

			if (browserViewId === undefined) {
				return { success: false, error: 'No browser is open. Use browser_open first.' };
			}

			// takeScreenshotWithMetadata returns {image: dataUrl, width, height, devicePixelRatio}
			const screenshot = await this.browserViewService.takeScreenshotWithMetadata(browserViewId);

			return {
				success: true,
				data: {
					image: screenshot.image,
					format: 'data-url',
					width: screenshot.width,
					height: screenshot.height,
					devicePixelRatio: screenshot.devicePixelRatio,
					viewport: {
						width: screenshot.width,
						height: screenshot.height,
						devicePixelRatio: screenshot.devicePixelRatio
					}
				}
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Failed to take screenshot'
			};
		}
	}

	// ==========================================================================
	// Navigation
	// ==========================================================================

	async navigate(url: string): Promise<ToolResult<BrowserNavigateResult>> {
		try {
			const browserViewId = this.browserViewService.getActiveBrowserViewId();

			if (browserViewId === undefined) {
				return { success: false, error: 'No browser is open. Use browser_open first.' };
			}

			await this.browserViewService.navigate(browserViewId, url);

			// Enable CDP monitoring proactively
			await this.cdpMonitorService.ensureMonitoring(browserViewId);

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
				error: error instanceof Error ? error.message : 'Failed to navigate'
			};
		}
	}

	async reload(ignoreCache?: boolean): Promise<ToolResult<BrowserNavigateResult>> {
		try {
			const browserViewId = this.browserViewService.getActiveBrowserViewId();

			if (browserViewId === undefined) {
				return { success: false, error: 'No browser is open. Use browser_open first.' };
			}

			await this.browserViewService.reload(browserViewId, ignoreCache);

			// Enable CDP monitoring proactively
			await this.cdpMonitorService.ensureMonitoring(browserViewId);

			// Get current URL from navigation state
			const navState = await this.browserViewService.getNavigationState(browserViewId);
			const currentUrl = navState.url || 'unknown';

			return {
				success: true,
				data: {
					browserViewId,
					url: currentUrl,
					message: `Reloaded page${ignoreCache ? ' (cache ignored)' : ''}`
				}
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Failed to reload'
			};
		}
	}

	// ==========================================================================
	// Input Actions
	// ==========================================================================

	async actionInput(params: {
		action: 'click' | 'right_click' | 'double_click' | 'hover' | 'drag' | 'type' | 'press' | 'scroll';
		coordinate?: string;
		text?: string;
		key?: string;
		modifiers?: string[];
		deltaX?: number;
		deltaY?: number;
	}): Promise<ToolResult<BrowserActionResult>> {
		try {
			const browserViewId = this.browserViewService.getActiveBrowserViewId();

			if (browserViewId === undefined) {
				return { success: false, error: 'No browser is open. Use browser_open first.' };
			}

			const { action, coordinate, text, key, modifiers, deltaX, deltaY } = params;

			// Parse coordinates if provided
			let x: number | undefined;
			let y: number | undefined;
			if (coordinate) {
				const parts = coordinate.split(',').map(p => parseFloat(p.trim()));
				if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
					[x, y] = parts;
				}
			}

			// Execute action based on type
			switch (action) {
				case 'click':
				case 'right_click':
				case 'double_click':
				case 'hover':
					if (x === undefined || y === undefined) {
						return { success: false, error: `${action} requires coordinate parameter (e.g., "100,200")` };
					}
					await this.browserViewService.sendMouseEvent(browserViewId, action, x, y);
					break;

				case 'type':
					if (!text) {
						return { success: false, error: 'type action requires text parameter' };
					}
					await this.browserViewService.sendTypeEvent(browserViewId, text);
					break;

				case 'press':
					if (!key) {
						return { success: false, error: 'press action requires key parameter' };
					}
					await this.browserViewService.sendKeyEvent(browserViewId, key, modifiers);
					break;

				case 'scroll':
					await this.browserViewService.sendScrollEvent(browserViewId, deltaX || 0, deltaY || 0, x, y);
					break;

				case 'drag':
					return { success: false, error: 'drag action not yet implemented' };

				default:
					return { success: false, error: `Unknown action: ${action}` };
			}

			return {
				success: true,
				data: {
					browserViewId,
					action,
					success: true,
					message: `Executed ${action} action`
				}
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Failed to execute action'
			};
		}
	}

	// ==========================================================================
	// Script Execution
	// ==========================================================================

	async executeScript(script: string): Promise<ToolResult<ScriptExecutionResult>> {
		try {
			const browserViewId = this.browserViewService.getActiveBrowserViewId();

			if (browserViewId === undefined) {
				return { success: false, error: 'No browser is open. Use browser_open first.' };
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
				error: error instanceof Error ? error.message : 'Failed to execute script'
			};
		}
	}

	// ==========================================================================
	// Element Inspection
	// ==========================================================================

	async inspectElement(selector: string, includeInherited?: boolean): Promise<ToolResult<ElementInspectionResult>> {
		try {
			const browserViewId = this.browserViewService.getActiveBrowserViewId();

			if (browserViewId === undefined) {
				return { success: false, error: 'No browser is open. Use browser_open first.' };
			}

			// Get project root - for now use empty string (CSS source resolution still works)
			// TODO: Add DevServerService dependency to get actual project root
			const projectRoot = '';

			const result = await this.browserViewService.getElementStyles({
				browserViewId,
				target: selector,
				projectRoot,
				includeInherited: includeInherited ?? false,
				includeUserAgent: false
			});

			if (!result.success || !result.data) {
				return {
					success: false,
					error: result.error || 'Failed to get element styles'
				};
			}

			const styleInfo = result.data;

			return {
				success: true,
				data: {
					selector,
					element: {
						tag: styleInfo.tagName,
						classes: styleInfo.classes,
						componentName: styleInfo.componentName,
						componentSource: styleInfo.htmlSource?.file
					},
					matchedRules: styleInfo.matchedRules,
					inlineStyles: styleInfo.inlineStyles,
					inheritedStyles: styleInfo.inheritedStyles,
					properties: styleInfo.computedStyles as unknown[] | undefined,
					cssInJs: styleInfo.cssInJs
				}
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Failed to inspect element'
			};
		}
	}

	// ==========================================================================
	// CDP Monitoring - Console Logs, Errors, Network
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
				return { success: false, error: 'No browser is open. Use browser_open first.' };
			}

			// Ensure monitoring is active
			await this.cdpMonitorService.ensureMonitoring(browserViewId);

			const logs = this.cdpMonitorService.getConsoleLogs(browserViewId, options);

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
				error: error instanceof Error ? error.message : 'Failed to get console logs'
			};
		}
	}

	async getErrors(limit?: number): Promise<ToolResult<BrowserErrorsResult>> {
		try {
			const browserViewId = this.browserViewService.getActiveBrowserViewId();

			if (browserViewId === undefined) {
				return { success: false, error: 'No browser is open. Use browser_open first.' };
			}

			// Ensure monitoring is active
			await this.cdpMonitorService.ensureMonitoring(browserViewId);

			const errors = this.cdpMonitorService.getErrors(browserViewId, limit);

			return {
				success: true,
				data: {
					errors,
					count: errors.length
				}
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Failed to get errors'
			};
		}
	}

	async getNetworkRequests(options?: {
		urlFilter?: string;
		method?: string;
		statusFilter?: 'success' | 'error' | 'all';
		limit?: number;
	}): Promise<ToolResult<BrowserNetworkRequestsResult>> {
		try {
			const browserViewId = this.browserViewService.getActiveBrowserViewId();

			if (browserViewId === undefined) {
				return { success: false, error: 'No browser is open. Use browser_open first.' };
			}

			// Ensure monitoring is active
			await this.cdpMonitorService.ensureMonitoring(browserViewId);

			const requests = this.cdpMonitorService.getNetworkRequests(browserViewId, options);

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
				error: error instanceof Error ? error.message : 'Failed to get network requests'
			};
		}
	}

	// ==========================================================================
	// Performance
	// ==========================================================================

	async getPerformance(): Promise<ToolResult<BrowserPerformanceResult>> {
		try {
			const browserViewId = this.browserViewService.getActiveBrowserViewId();

			if (browserViewId === undefined) {
				return { success: false, error: 'No browser is open. Use browser_open first.' };
			}

			// Get performance metrics via JavaScript
			const webVitals = await this.browserViewService.executeScript(browserViewId, `
				(function() {
					const timing = performance.timing || {};
					const entries = performance.getEntriesByType?.('navigation')?.[0] || {};
					const paint = performance.getEntriesByType?.('paint') || [];

					return {
						lcp: entries.largestContentfulPaint,
						fcp: paint.find(p => p.name === 'first-contentful-paint')?.startTime,
						ttfb: entries.responseStart - entries.requestStart,
						domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart,
						load: timing.loadEventEnd - timing.navigationStart
					};
				})()
			`) as Record<string, number | undefined>;

			// Get runtime metrics via CDP
			let runtimeMetrics: Record<string, number> = {};

			try {
				await this.browserViewService.attachDebugger(browserViewId);
				const result = await this.browserViewService.sendCDPCommand(browserViewId, 'Performance.getMetrics', {});
				const metrics = result.metrics as Array<{ name: string; value: number }>;
				for (const metric of metrics) {
					runtimeMetrics[metric.name] = metric.value;
				}
			} catch {
				// Performance metrics not available
			}

			return {
				success: true,
				data: {
					webVitals: {
						lcp: webVitals?.lcp,
						fcp: webVitals?.fcp,
						ttfb: webVitals?.ttfb,
						domContentLoaded: webVitals?.domContentLoaded,
						load: webVitals?.load
					},
					runtimeMetrics: {
						jsHeapUsedSize: runtimeMetrics.JSHeapUsedSize,
						jsHeapTotalSize: runtimeMetrics.JSHeapTotalSize,
						domNodes: runtimeMetrics.Nodes,
						layoutCount: runtimeMetrics.LayoutCount,
						recalcStyleCount: runtimeMetrics.RecalcStyleCount,
						layoutDuration: runtimeMetrics.LayoutDuration,
						recalcStyleDuration: runtimeMetrics.RecalcStyleDuration,
						scriptDuration: runtimeMetrics.ScriptDuration,
						taskDuration: runtimeMetrics.TaskDuration
					}
				}
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Failed to get performance metrics'
			};
		}
	}

	// ==========================================================================
	// Browser State
	// ==========================================================================

	async getState(): Promise<ToolResult<BrowserStateResult>> {
		try {
			const browserViewId = this.browserViewService.getActiveBrowserViewId();
			// Note: devServerRunning state would need to be passed via different means
			// For now, return false - actual dev server status should be checked via project_get_active
			const devServerRunning = false;

			if (browserViewId === undefined) {
				return {
					success: true,
					data: {
						browserOpen: false,
						devServerRunning,
						message: 'Browser is not open'
					}
				};
			}

			// Get navigation state which includes url, title, isLoading
			const navState = await this.browserViewService.getNavigationState(browserViewId);

			return {
				success: true,
				data: {
					browserOpen: true,
					browserViewId,
					currentUrl: navState.url,
					title: navState.title,
					isLoading: navState.isLoading,
					devServerRunning,
					message: 'Browser is open'
				}
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Failed to get browser state'
			};
		}
	}

	// ==========================================================================
	// Viewport
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
				return { success: false, error: 'No browser is open. Use browser_open first.' };
			}

			// Attach debugger for CDP commands
			try {
				await this.browserViewService.attachDebugger(browserViewId);
			} catch {
				// May already be attached
			}

			// If no params or no width/height, clear the override
			if (!params || (params.width === undefined && params.height === undefined)) {
				// Clear device metrics override via CDP
				await this.browserViewService.sendCDPCommand(browserViewId, 'Emulation.clearDeviceMetricsOverride', {});

				// Get actual viewport size
				const size = this.browserViewService.getViewportSize(browserViewId);

				return {
					success: true,
					data: {
						width: size?.width || 0,
						height: size?.height || 0,
						deviceScaleFactor: 1,
						mobile: false,
						message: 'Viewport override cleared, using natural browser size'
					}
				};
			}

			// Set viewport override via CDP
			const width = params.width || 1280;
			const height = params.height || 720;
			const deviceScaleFactor = params.deviceScaleFactor || 1;
			const mobile = params.mobile || false;

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
					message: `Viewport set to ${width}x${height}${mobile ? ' (mobile)' : ''}`
				}
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Failed to set viewport'
			};
		}
	}
}
