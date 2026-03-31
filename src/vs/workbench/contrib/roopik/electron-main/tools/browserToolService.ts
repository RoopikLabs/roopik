/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Browser Tool Service
 *
 * Unified implementation of all browser tools.
 * Single source of truth - used by both WebSocket MCP and Native IPC.
 *
 * Multi-tab: All methods accept optional tabId. Omit = active tab.
 * The resolveTarget() helper translates tabId → browserViewId via the backend.
 */

import type { IBrowserBackend } from '../projectMode/browserBackend.js';
import type { CDPMonitorService } from './cdpMonitorService.js';
import {
	waitForActionable,
	waitForReadyState,
	querySelector,
	waitForSelector,
	type EvaluateJS,
} from '../projectMode/browserActionability.js';
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
	/** Tracks emulated viewport overrides per browserViewId (set by setViewport, cleared on reset) */
	private readonly viewportOverrides = new Map<number, { width: number; height: number }>();

	constructor(
		private readonly browserViewService: IBrowserBackend,
		private readonly cdpMonitorService: CDPMonitorService
	) { }

	// ==========================================================================
	// Tab Resolution Helper
	// ==========================================================================

	/**
	 * Resolve an optional tabId to a browserViewId.
	 * If tabId is provided, resolves it. Otherwise uses active tab.
	 * Returns { browserViewId, tabId } for including in responses.
	 */
	private resolveTarget(tabId?: number): { browserViewId: number; tabId: number } {
		if (tabId !== undefined) {
			const browserViewId = this.browserViewService.resolveTabId(tabId);
			return { browserViewId, tabId };
		}
		const activeTabId = this.browserViewService.getActiveTabId();
		if (activeTabId === undefined) {
			throw new Error('No browser tab is open. Use browser_open first.');
		}
		return {
			browserViewId: this.browserViewService.resolveTabId(activeTabId),
			tabId: activeTabId,
		};
	}

	// ==========================================================================
	// Evaluate JS Helper (used by actionability layer)
	// ==========================================================================

	/**
	 * Get an evaluate function bound to a specific browser view.
	 * Works for both embedded (executeJavaScript) and external (Runtime.evaluate) modes.
	 */
	private getEvaluator(browserViewId: number): EvaluateJS {
		return (script: string) => this.browserViewService.executeScript(browserViewId, script);
	}

	// ==========================================================================
	// Browser Open/Close
	// ==========================================================================

	async open(args?: { url?: string }): Promise<ToolResult<BrowserOpenResult>> {
		try {
			const url = args?.url;
			const browserViewId = this.browserViewService.getActiveBrowserViewId();

			// Try to open a new tab
			let newTabId: number;
			let warning: string | undefined;
			try {
				newTabId = await this.browserViewService.openNewTab(url);
			} catch (e) {
				// Tab limit reached — navigate in the active tab instead
				const activeTabId = this.browserViewService.getActiveTabId();
				if (activeTabId === undefined) {
					throw e; // No active tab at all — re-throw
				}
				if (url) {
					const viewId = this.browserViewService.resolveTabId(activeTabId);
					await this.browserViewService.navigate(viewId, url);
				}
				const maxTabs = this.browserViewService.listTabs().length;
				warning = `Tab limit reached (max ${maxTabs}). ${url ? `Navigated existing tab ${activeTabId} to ${url} instead.` : 'No new tab opened.'} Close a tab first or increase the limit in Settings → Roopik → Browser → Max Tabs.`;
				newTabId = activeTabId;
			}

			if (url && !warning) {
				const viewId = this.browserViewService.resolveTabId(newTabId);
				this.cdpMonitorService.ensureMonitoring(viewId).catch(() => { });
			}

			return {
				success: true,
				data: {
					message: warning
						? warning
						: browserViewId === undefined
							? (url ? `Browser opened at ${url}` : 'Browser opened')
							: (url ? `New tab opened at ${url}` : 'New tab opened'),
					url: url || undefined,
					tabId: newTabId
				}
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Failed to open browser'
			};
		}
	}

	/**
	 * Close browser tabs.
	 * - With tabId: closes that specific tab
	 * - Without tabId: closes ALL open browser tabs
	 *
	 * Flow: Backend destroys view + CDP cleanup, then fires renderer event
	 * to close editor tab. The renderer close triggers dispose() which is
	 * a no-op since the backend view is already destroyed.
	 */
	async close(tabId?: number): Promise<ToolResult<{ message: string }>> {
		try {
			if (tabId !== undefined) {
				// Close specific tab — validate it exists first
				const browserViewId = this.browserViewService.resolveTabId(tabId);
				this.cdpMonitorService.cleanup(browserViewId);
				this.viewportOverrides.delete(browserViewId);
				await this.browserViewService.closeTab(tabId);
				// Tell renderer to close the editor tab (triggers dispose which is safe)
				this.browserViewService.requestBrowserClose(tabId);
				return {
					success: true,
					data: { message: `Tab ${tabId} closed` }
				};
			}

			// Close ALL tabs — snapshot the list first, then close each
			const tabs = this.browserViewService.listTabs();
			if (tabs.length === 0) {
				return {
					success: true,
					data: { message: 'No browser tabs are open' }
				};
			}

			// Clean up CDP monitors for all tabs
			for (const tab of tabs) {
				try {
					const browserViewId = this.browserViewService.resolveTabId(tab.tabId);
					this.cdpMonitorService.cleanup(browserViewId);
				} catch { /* tab may already be gone */ }
			}

			// Destroy all backend views
			this.viewportOverrides.clear();
			for (const tab of tabs) {
				try {
					await this.browserViewService.closeTab(tab.tabId);
				} catch { /* tab may already be gone */ }
			}

			// Tell renderer to close ALL editor tabs in one shot
			this.browserViewService.requestBrowserClose();

			return {
				success: true,
				data: { message: `Closed ${tabs.length} browser tab(s)` }
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

	async screenshot(tabId?: number): Promise<ToolResult<BrowserScreenshotResult>> {
		try {
			const target = this.resolveTarget(tabId);

			const screenshot = await this.browserViewService.takeScreenshotWithMetadata(target.browserViewId);

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
					},
					tabId: target.tabId
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

	async navigate(url: string, tabId?: number, waitUntil?: 'load' | 'domcontentloaded' | 'networkidle'): Promise<ToolResult<BrowserNavigateResult>> {
		try {
			const target = this.resolveTarget(tabId);

			await this.browserViewService.navigate(target.browserViewId, url);
			await this.cdpMonitorService.ensureMonitoring(target.browserViewId).catch(() => { });

			// Wait for page readiness — authoritative, reports actual state
			const waitState = waitUntil || 'load';
			let waitResult: { ready: boolean; detail: string } = { ready: true, detail: '' };

			if (waitState === 'networkidle') {
				const result = await this.cdpMonitorService.waitForNetworkIdle(target.browserViewId, 10000);
				waitResult = {
					ready: result.idle,
					detail: result.idle ? 'network idle' : `network still active (${result.inflightCount} inflight requests)`
				};
			} else {
				const targetReadyState = waitState === 'domcontentloaded' ? 'interactive' as const : 'complete' as const;
				try {
					const evaluate = this.getEvaluator(target.browserViewId);
					const result = await waitForReadyState(evaluate, targetReadyState, 10000);
					waitResult = {
						ready: result.ready,
						detail: result.ready ? waitState : `${waitState} timeout (readyState: ${result.readyState})`
					};
				} catch {
					waitResult = { ready: false, detail: `${waitState} check failed (page may have redirected)` };
				}
			}

			return {
				success: true,
				data: {
					url,
					message: `Navigated to ${url}`,
					...(waitResult.detail ? { waitStatus: waitResult.detail } : {}),
					...(waitResult.ready ? {} : { warning: `Page did not reach '${waitState}' state: ${waitResult.detail}` }),
					tabId: target.tabId
				}
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Failed to navigate'
			};
		}
	}

	async reload(ignoreCache?: boolean, tabId?: number, waitUntil?: 'load' | 'domcontentloaded' | 'networkidle'): Promise<ToolResult<BrowserNavigateResult>> {
		try {
			const target = this.resolveTarget(tabId);

			await this.browserViewService.reload(target.browserViewId, ignoreCache);
			await this.cdpMonitorService.ensureMonitoring(target.browserViewId).catch(() => { });

			// Wait for page readiness — authoritative, reports actual state
			const waitState = waitUntil || 'load';
			let waitResult: { ready: boolean; detail: string } = { ready: true, detail: '' };

			if (waitState === 'networkidle') {
				const result = await this.cdpMonitorService.waitForNetworkIdle(target.browserViewId, 10000);
				waitResult = {
					ready: result.idle,
					detail: result.idle ? 'network idle' : `network still active (${result.inflightCount} inflight requests)`
				};
			} else {
				const targetReadyState = waitState === 'domcontentloaded' ? 'interactive' as const : 'complete' as const;
				try {
					const evaluate = this.getEvaluator(target.browserViewId);
					const result = await waitForReadyState(evaluate, targetReadyState, 10000);
					waitResult = {
						ready: result.ready,
						detail: result.ready ? waitState : `${waitState} timeout (readyState: ${result.readyState})`
					};
				} catch {
					waitResult = { ready: false, detail: `${waitState} check failed` };
				}
			}

			const navState = await this.browserViewService.getNavigationState(target.browserViewId);
			const currentUrl = navState.url || 'unknown';

			return {
				success: true,
				data: {
					url: currentUrl,
					message: `Reloaded page${ignoreCache ? ' (cache ignored)' : ''}`,
					...(waitResult.detail ? { waitStatus: waitResult.detail } : {}),
					...(waitResult.ready ? {} : { warning: `Page did not reach '${waitState}' state: ${waitResult.detail}` }),
					tabId: target.tabId
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
		selector?: string;
		text?: string;
		key?: string;
		modifiers?: string[];
		deltaX?: number;
		deltaY?: number;
		tabId?: number;
	}): Promise<ToolResult<BrowserActionResult>> {
		try {
			const target = this.resolveTarget(params.tabId);

			const { action, coordinate, selector, text, key, modifiers, deltaX, deltaY } = params;
			const actionTimeout = 30000; // Match Playwright's default actionTimeout
			const evaluate = this.getEvaluator(target.browserViewId);

			// Resolve coordinates: from selector (re-resolved at action time) or from coordinate string
			let x: number | undefined;
			let y: number | undefined;
			let autoWaitInfo = '';

			if (selector && ['click', 'right_click', 'double_click', 'hover'].includes(action)) {
				// Selector-based action — Playwright's locator model: re-resolve right before action.
				// This prevents stale coordinates from layout shifts between findElements() and actionInput().
				const selectorResult = await querySelector(evaluate, selector, 1);
				if (!selectorResult.found || selectorResult.elements.length === 0) {
					return { success: false, error: `Element not found: ${selector}` };
				}
				const el = selectorResult.elements[0];
				x = el.centerX;
				y = el.centerY;
				autoWaitInfo = ` on <${el.tag}>${el.id ? '#' + el.id : ''}`;
			} else if (coordinate) {
				const parts = coordinate.split(',').map(p => parseFloat(p.trim()));
				if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
					[x, y] = parts;
				}
			}

			// Auto-wait: For coordinate-based actions, verify element is actionable.
			// This is authoritative — if the element is not actionable, the action FAILS.
			// Playwright does the same: wait → check → fail if not ready.
			if (x !== undefined && y !== undefined && ['click', 'right_click', 'double_click', 'hover'].includes(action)) {
				const result = await waitForActionable(evaluate, x, y, { timeout: actionTimeout });
				if (!result.actionable) {
					return {
						success: false,
						error: `Element not actionable: ${result.message || result.reason || 'unknown'}${result.obscuredBy ? ` (obscured by ${result.obscuredBy})` : ''}`
					};
				}
				if (result.tag && !autoWaitInfo) {
					autoWaitInfo = ` on <${result.tag}>`;
				}
			}

			// Execute action based on type
			switch (action) {
				case 'click':
				case 'right_click':
				case 'double_click':
				case 'hover':
					if (x === undefined || y === undefined) {
						return { success: false, error: `${action} requires coordinate or selector parameter` };
					}
					await this.browserViewService.sendMouseEvent(target.browserViewId, action, x, y);
					break;

				case 'type':
					if (!text) {
						return { success: false, error: 'type action requires text parameter' };
					}
					await this.browserViewService.sendTypeEvent(target.browserViewId, text);
					break;

				case 'press':
					if (!key) {
						return { success: false, error: 'press action requires key parameter' };
					}
					await this.browserViewService.sendKeyEvent(target.browserViewId, key, modifiers);
					break;

				case 'scroll':
					await this.browserViewService.sendScrollEvent(target.browserViewId, deltaX || 0, deltaY || 0, x, y);
					break;

				case 'drag':
					return { success: false, error: 'drag action not yet implemented' };

				default:
					return { success: false, error: `Unknown action: ${action}` };
			}

			return {
				success: true,
				data: {
					action,
					message: `Executed ${action} action${autoWaitInfo}`,
					tabId: target.tabId
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

	async executeScript(script: string, tabId?: number): Promise<ToolResult<ScriptExecutionResult>> {
		try {
			const target = this.resolveTarget(tabId);

			const result = await this.browserViewService.executeScript(target.browserViewId, script);

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

	async inspectElement(selector: string, includeInherited?: boolean, projectRoot?: string, tabId?: number): Promise<ToolResult<ElementInspectionResult>> {
		try {
			const target = this.resolveTarget(tabId);

			const result = await this.browserViewService.getElementStyles({
				browserViewId: target.browserViewId,
				target: selector,
				projectRoot: projectRoot ?? '',
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
		tabId?: number;
	}): Promise<ToolResult<BrowserConsoleLogsResult>> {
		try {
			const target = this.resolveTarget(options?.tabId);

			await this.cdpMonitorService.ensureMonitoring(target.browserViewId);

			const logs = this.cdpMonitorService.getConsoleLogs(target.browserViewId, options);

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

	async getErrors(limit?: number, tabId?: number): Promise<ToolResult<BrowserErrorsResult>> {
		try {
			const target = this.resolveTarget(tabId);

			await this.cdpMonitorService.ensureMonitoring(target.browserViewId);

			const errors = this.cdpMonitorService.getErrors(target.browserViewId, limit);

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
		tabId?: number;
	}): Promise<ToolResult<BrowserNetworkRequestsResult>> {
		try {
			const target = this.resolveTarget(options?.tabId);

			await this.cdpMonitorService.ensureMonitoring(target.browserViewId);

			const requests = this.cdpMonitorService.getNetworkRequests(target.browserViewId, options);

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

	async getPerformance(tabId?: number): Promise<ToolResult<BrowserPerformanceResult>> {
		try {
			const target = this.resolveTarget(tabId);

			// Get performance metrics via JavaScript
			const webVitals = await this.browserViewService.executeScript(target.browserViewId, `
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
			const runtimeMetrics: Record<string, number> = {};

			try {
				await this.browserViewService.attachDebugger(target.browserViewId);
				const result = await this.browserViewService.sendCDPCommand(target.browserViewId, 'Performance.getMetrics', {});
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

	async getState(tabId?: number): Promise<ToolResult<BrowserStateResult>> {
		try {
			const devServerRunning = false;
			const allTabs = this.browserViewService.listTabs();
			const activeTabId = this.browserViewService.getActiveTabId();

			if (allTabs.length === 0) {
				return {
					success: true,
					data: {
						browserOpen: false,
						devServerRunning,
						tabCount: 0,
						tabs: [],
					}
				};
			}

			// If tabId provided, only return that tab's info
			const tabsToQuery = tabId !== undefined
				? allTabs.filter(t => t.tabId === tabId)
				: allTabs;

			return {
				success: true,
				data: {
					browserOpen: true,
					devServerRunning,
					activeTabId,
					tabCount: allTabs.length,
					tabs: await Promise.all(tabsToQuery.map(async t => {
						const viewId = this.browserViewService.resolveTabId(t.tabId);
						const nav = await this.browserViewService.getNavigationState(viewId).catch(() => null);
						const override = this.viewportOverrides.get(viewId);
						const vp = override ?? this.browserViewService.getViewportSize(viewId);
						return {
							tabId: t.tabId,
							url: nav?.url ?? t.url,
							title: nav?.title ?? t.title,
							isActive: t.isActive,
							isLoading: nav?.isLoading ?? false,
							...(vp ? { viewport: { width: vp.width, height: vp.height } } : {}),
						};
					})),
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
		tabId?: number;
	}): Promise<ToolResult<BrowserViewportResult>> {
		try {
			const target = this.resolveTarget(params?.tabId);

			// Attach debugger for CDP commands
			try {
				await this.browserViewService.attachDebugger(target.browserViewId);
			} catch {
				// May already be attached
			}

			// If no params or no width/height, clear the override
			if (!params || (params.width === undefined && params.height === undefined)) {
				await this.browserViewService.sendCDPCommand(target.browserViewId, 'Emulation.clearDeviceMetricsOverride', {});
				this.viewportOverrides.delete(target.browserViewId);

				const size = this.browserViewService.getViewportSize(target.browserViewId);

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

			const width = params.width || 1280;
			const height = params.height || 720;
			const deviceScaleFactor = params.deviceScaleFactor || 1;
			const mobile = params.mobile || false;

			await this.browserViewService.sendCDPCommand(target.browserViewId, 'Emulation.setDeviceMetricsOverride', {
				width,
				height,
				deviceScaleFactor,
				mobile
			});
			this.viewportOverrides.set(target.browserViewId, { width, height });

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

	// ==========================================================================
	// Smart Selectors (text=, role=, css=, xpath=, id=, data-testid=)
	// ==========================================================================

	/**
	 * Find elements using smart selectors with shadow DOM piercing.
	 * Supports: css=, text=, role=, xpath=, id=, data-testid= prefixes.
	 * Default (no prefix) = CSS selector.
	 */
	async findElements(selector: string, tabId?: number): Promise<ToolResult<{
		found: boolean;
		count: number;
		elements: Array<{
			tag: string;
			id?: string;
			className?: string;
			text: string;
			rect: { x: number; y: number; width: number; height: number };
			centerX: number;
			centerY: number;
		}>;
	}>> {
		try {
			const target = this.resolveTarget(tabId);
			const evaluate = this.getEvaluator(target.browserViewId);
			const result = await querySelector(evaluate, selector);
			return { success: true, data: result };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Failed to find elements'
			};
		}
	}

	/**
	 * Wait for a selector to appear in the DOM and become visible.
	 */
	async waitForElement(selector: string, timeoutMs?: number, tabId?: number): Promise<ToolResult<{
		found: boolean;
		tag?: string;
		rect?: { x: number; y: number; width: number; height: number };
		centerX?: number;
		centerY?: number;
		reason?: string;
	}>> {
		try {
			const target = this.resolveTarget(tabId);
			const evaluate = this.getEvaluator(target.browserViewId);
			const result = await waitForSelector(evaluate, selector, timeoutMs);
			return { success: true, data: result };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Failed to wait for element'
			};
		}
	}

	// ==========================================================================
	// Network Idle
	// ==========================================================================

	/**
	 * Wait for network to become idle (no inflight requests for 500ms).
	 */
	async waitForNetworkIdle(tabId?: number, timeoutMs: number = 10000): Promise<ToolResult<{ idle: boolean; inflightCount: number }>> {
		try {
			const target = this.resolveTarget(tabId);
			const result = await this.cdpMonitorService.waitForNetworkIdle(target.browserViewId, timeoutMs);
			return { success: true, data: result };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Failed to wait for network idle'
			};
		}
	}
}
