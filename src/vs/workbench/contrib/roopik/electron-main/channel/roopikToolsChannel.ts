/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Roopik Tools Channel
 *
 * IPC channel that exposes Roopik IDE tools to extensions (agent-dio).
 * This provides a persistent, timeout-free connection for AI agent tool calls.
 *
 * Architecture:
 * - Extension (agent-dio) → IChannel.call() → RoopikToolsChannel.call() → Services
 * - Replaces HTTP-based MCP for internal agent communication
 * - Same tools as MCP but via direct IPC (faster, no timeouts)
 *
 * Tool Categories:
 * - Browser Tools (7): browser_open, browser_get_performance, screenshot, navigate, reload, executeScript, inspectElement
 * - CDP Tools (2): getErrors, getConsoleLogs
 * - Project Tools (3): getActiveProject, startProject, stopProject
 * - Workspace Tools (3): listCanvases, getActiveCanvas, createCanvas
 * - Component Tools (6): addComponent, addComponents, removeComponent, getComponentInfo, listComponents, rebuildComponent
 */

import { BrowserWindow } from 'electron';
import { Event } from '../../../../../base/common/event.js';
import { IServerChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import type { BrowserViewService } from '../projectMode/browserViewService.js';
import type { DevServerService } from '../projectMode/devServer/devServerService.js';
import type { ComponentService } from '../component/componentService.js';
import type { ICanvasService } from '../../common/canvas/canvasService.js';
import type { IRoopikStorageService } from '../../common/storage/storageService.js';

// Channel name for IPC registration
export const ROOPIK_TOOLS_CHANNEL_NAME = 'roopik.tools';

/**
 * Standard result format for all tool calls
 */
export interface RoopikToolResult<T = unknown> {
	success: boolean;
	data?: T;
	error?: string;
}

/**
 * RoopikToolsChannel - IPC handler for Roopik IDE tools
 *
 * Provides direct IPC access to all Roopik IDE capabilities for extensions.
 * This is the core-side handler that receives calls from agent-dio.
 */
export class RoopikToolsChannel implements IServerChannel {

	constructor(
		private readonly browserViewService: BrowserViewService,
		private readonly devServerService: DevServerService,
		private readonly componentService: ComponentService,
		private readonly canvasService: ICanvasService,
		private readonly storageService: IRoopikStorageService
	) { }

	/**
	 * Handle event subscriptions from extensions
	 * Future: Can expose events like onComponentBuilt, onProjectStarted, etc.
	 */
	listen(_context: unknown, event: string): Event<unknown> {
		throw new Error(`[RoopikToolsChannel] Unknown event: ${event}`);
	}

	/**
	 * Handle tool calls from extensions
	 */
	async call(_context: unknown, command: string, arg?: unknown): Promise<RoopikToolResult> {
		try {
			switch (command) {
				// ============================================================
				// Browser Tools (6)
				// ============================================================
				case 'browser_open':
					return this.handleBrowserOpen(arg as { url?: string });

				case 'browser_get_performance':
					return this.handleBrowserGetPerformance();

				case 'rpk_screenshot':
					return this.handleScreenshot();

				case 'rpk_navigate':
					return this.handleNavigate(arg as { url: string });

				case 'rpk_reload':
					return this.handleReload(arg as { ignoreCache?: boolean });

				case 'rpk_executeScript':
					return this.handleExecuteScript(arg as { script: string });

				case 'rpk_inspectElement':
					return this.handleInspectElement(arg as { selector: string; includeInherited?: boolean });

				// ============================================================
				// CDP Tools (2)
				// ============================================================
				case 'rpk_getErrors':
					return this.handleGetErrors(arg as { limit?: number });

				case 'rpk_getConsoleLogs':
					return this.handleGetConsoleLogs(arg as { limit?: number; type?: string });

				// ============================================================
				// Project Tools (3)
				// ============================================================
				case 'rpk_getActiveProject':
					return this.handleGetActiveProject();

				case 'rpk_startProject':
					return this.handleStartProject(arg as { projectPath: string; port?: number });

				case 'rpk_stopProject':
					return this.handleStopProject();

				// ============================================================
				// Workspace/Canvas Tools (3)
				// ============================================================
				case 'rpk_listCanvases':
					return this.handleListCanvases(arg as { nameFilter?: string; sortBy?: string; sortDirection?: string });

				case 'rpk_getActiveCanvas':
					return this.handleGetActiveCanvas();

				case 'rpk_createCanvas':
					return this.handleCreateCanvas(arg as { name: string });

				// ============================================================
				// Component Tools (6)
				// ============================================================
				case 'rpk_addComponent':
					return this.handleAddComponent(arg as {
						folderPath: string;
						canvasId?: string;
						name?: string;
						entryFile?: string;
						framework?: string;
					});

				case 'rpk_addComponents':
					return this.handleAddComponents(arg as {
						components: Array<{
							folderPath: string;
							canvasId?: string;
							name?: string;
							entryFile?: string;
							framework?: string;
						}>;
					});

				case 'rpk_removeComponent':
					return this.handleRemoveComponent(arg as { componentId: string });

				case 'rpk_getComponentInfo':
					return this.handleGetComponentInfo(arg as { componentId: string });

				case 'rpk_listComponents':
					return this.handleListComponents(arg as { canvasId: string });

				case 'rpk_rebuildComponent':
					return this.handleRebuildComponent(arg as { componentId: string });

				default:
					return {
						success: false,
						error: `Unknown Roopik tool: ${command}`
					};
			}
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error)
			};
		}
	}

	// ========================================================================
	// Browser Tool Handlers
	// ========================================================================

	/**
	 * Open a browser view without requiring a project.
	 * If URL is provided, navigates to that URL after opening.
	 * If no URL is provided, opens an empty browser (about:blank).
	 *
	 * This is the primary way for agents to get browser access without needing
	 * to start a dev server first.
	 */
	private async handleBrowserOpen(args: { url?: string }): Promise<RoopikToolResult> {
		// Check if browser is already open
		const existingBrowserViewId = this.browserViewService.getActiveBrowserViewId();
		if (existingBrowserViewId !== undefined) {
			// Browser already open - just navigate if URL provided
			if (args.url) {
				await this.browserViewService.navigate(existingBrowserViewId, args.url);
				return {
					success: true,
					data: {
						browserViewId: existingBrowserViewId,
						url: args.url,
						message: `Navigated existing browser to ${args.url}`
					}
				};
			}
			return {
				success: true,
				data: {
					browserViewId: existingBrowserViewId,
					message: 'Browser is already open'
				}
			};
		}

		// Get the focused window to attach the browser view to
		const focusedWindow = BrowserWindow.getFocusedWindow();
		if (!focusedWindow) {
			// Try to get any window
			const allWindows = BrowserWindow.getAllWindows().filter(w => !w.isDestroyed());
			if (allWindows.length === 0) {
				return {
					success: false,
					error: 'No window available to open browser in'
				};
			}
			// Use the first available window
			const windowId = allWindows[0].id;
			const result = await this.browserViewService.createBrowserView(windowId);

			// Navigate to URL or about:blank
			const targetUrl = args.url || 'about:blank';
			await this.browserViewService.navigate(result.browserViewId, targetUrl);

			return {
				success: true,
				data: {
					browserViewId: result.browserViewId,
					url: targetUrl,
					message: args.url ? `Browser opened at ${args.url}` : 'Empty browser opened'
				}
			};
		}

		// Create browser view in focused window
		const result = await this.browserViewService.createBrowserView(focusedWindow.id);

		// Navigate to URL or about:blank
		const targetUrl = args.url || 'about:blank';
		await this.browserViewService.navigate(result.browserViewId, targetUrl);

		return {
			success: true,
			data: {
				browserViewId: result.browserViewId,
				url: targetUrl,
				message: args.url ? `Browser opened at ${args.url}` : 'Empty browser opened'
			}
		};
	}

	/**
	 * Get performance metrics from the browser including Web Vitals.
	 * Returns LCP (Largest Contentful Paint), CLS (Cumulative Layout Shift),
	 * FID (First Input Delay), and other performance metrics.
	 */
	private async handleBrowserGetPerformance(): Promise<RoopikToolResult> {
		const browserViewId = this.browserViewService.getActiveBrowserViewId();
		if (browserViewId === undefined) {
			return {
				success: false,
				error: 'No browser is open. Use browser_open first.'
			};
		}

		try {
			// Attach debugger if not already attached
			await this.browserViewService.attachDebugger(browserViewId);

			// Enable Performance domain
			await this.browserViewService.sendCDPCommand(browserViewId, 'Performance.enable');

			// Get CDP performance metrics
			const cdpMetrics = await this.browserViewService.sendCDPCommand(browserViewId, 'Performance.getMetrics');

			// Execute JavaScript to get Web Vitals and Navigation Timing API data
			const webVitalsScript = `
				(function() {
					const result = {
						navigationTiming: {},
						webVitals: {},
						resources: []
					};

					// Navigation Timing API
					if (performance.timing) {
						const t = performance.timing;
						result.navigationTiming = {
							dns: t.domainLookupEnd - t.domainLookupStart,
							tcp: t.connectEnd - t.connectStart,
							ttfb: t.responseStart - t.requestStart,
							domContentLoaded: t.domContentLoadedEventEnd - t.navigationStart,
							domComplete: t.domComplete - t.navigationStart,
							loadComplete: t.loadEventEnd - t.navigationStart
						};
					}

					// Performance Navigation Timing (newer API)
					const navEntries = performance.getEntriesByType('navigation');
					if (navEntries.length > 0) {
						const nav = navEntries[0];
						result.navigationTiming.transferSize = nav.transferSize;
						result.navigationTiming.encodedBodySize = nav.encodedBodySize;
						result.navigationTiming.decodedBodySize = nav.decodedBodySize;
					}

					// Largest Contentful Paint (LCP)
					const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
					if (lcpEntries.length > 0) {
						const lcp = lcpEntries[lcpEntries.length - 1];
						result.webVitals.lcp = {
							value: Math.round(lcp.startTime),
							element: lcp.element ? lcp.element.tagName : null,
							url: lcp.url || null,
							size: lcp.size
						};
					}

					// First Contentful Paint (FCP)
					const fcpEntries = performance.getEntriesByType('paint');
					const fcp = fcpEntries.find(e => e.name === 'first-contentful-paint');
					if (fcp) {
						result.webVitals.fcp = Math.round(fcp.startTime);
					}
					const fp = fcpEntries.find(e => e.name === 'first-paint');
					if (fp) {
						result.webVitals.fp = Math.round(fp.startTime);
					}

					// Cumulative Layout Shift (CLS) - if PerformanceObserver was used
					const layoutShiftEntries = performance.getEntriesByType('layout-shift');
					if (layoutShiftEntries.length > 0) {
						let cls = 0;
						layoutShiftEntries.forEach(entry => {
							if (!entry.hadRecentInput) {
								cls += entry.value;
							}
						});
						result.webVitals.cls = Math.round(cls * 1000) / 1000;
					}

					// Resource timing (top 10 slowest resources)
					const resources = performance.getEntriesByType('resource');
					result.resources = resources
						.map(r => ({
							name: r.name.split('/').pop().split('?')[0],
							type: r.initiatorType,
							duration: Math.round(r.duration),
							size: r.transferSize || 0
						}))
						.sort((a, b) => b.duration - a.duration)
						.slice(0, 10);

					// Memory info (if available, Chrome only)
					if (performance.memory) {
						result.memory = {
							usedJSHeapSize: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
							totalJSHeapSize: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024)
						};
					}

					return result;
				})();
			`;

			const webVitals = await this.browserViewService.executeScript(browserViewId, webVitalsScript);

			// Format CDP metrics into a more readable object
			const metricsMap: Record<string, number> = {};
			if (cdpMetrics && cdpMetrics.metrics) {
				for (const metric of cdpMetrics.metrics) {
					metricsMap[metric.name] = metric.value;
				}
			}

			return {
				success: true,
				data: {
					cdpMetrics: metricsMap,
					navigationTiming: webVitals?.navigationTiming || {},
					webVitals: webVitals?.webVitals || {},
					slowestResources: webVitals?.resources || [],
					memory: webVitals?.memory || null,
					summary: {
						lcp: webVitals?.webVitals?.lcp?.value ? `${webVitals.webVitals.lcp.value}ms` : 'N/A',
						fcp: webVitals?.webVitals?.fcp ? `${webVitals.webVitals.fcp}ms` : 'N/A',
						cls: webVitals?.webVitals?.cls !== undefined ? webVitals.webVitals.cls : 'N/A',
						ttfb: webVitals?.navigationTiming?.ttfb ? `${webVitals.navigationTiming.ttfb}ms` : 'N/A',
						domComplete: webVitals?.navigationTiming?.domComplete ? `${webVitals.navigationTiming.domComplete}ms` : 'N/A'
					}
				}
			};
		} catch (error) {
			return {
				success: false,
				error: `Failed to get performance metrics: ${error instanceof Error ? error.message : String(error)}`
			};
		}
	}

	private async handleScreenshot(): Promise<RoopikToolResult> {
		const browserViewId = this.browserViewService.getActiveBrowserViewId();
		if (browserViewId === undefined) {
			return {
				success: false,
				error: 'No browser is open. Start a project first with rpk_startProject.'
			};
		}

		const image = await this.browserViewService.takeScreenshot(browserViewId);
		return {
			success: true,
			data: { image, format: 'data-url' }
		};
	}

	private async handleNavigate(args: { url: string }): Promise<RoopikToolResult> {
		const browserViewId = this.browserViewService.getActiveBrowserViewId();
		if (browserViewId === undefined) {
			return {
				success: false,
				error: 'No browser is open. Start a project first with rpk_startProject.'
			};
		}

		await this.browserViewService.navigate(browserViewId, args.url);
		return {
			success: true,
			data: { url: args.url, message: `Navigated to ${args.url}` }
		};
	}

	private async handleReload(args: { ignoreCache?: boolean }): Promise<RoopikToolResult> {
		const browserViewId = this.browserViewService.getActiveBrowserViewId();
		if (browserViewId === undefined) {
			return {
				success: false,
				error: 'No browser is open. Start a project first with rpk_startProject.'
			};
		}

		await this.browserViewService.reload(browserViewId, args.ignoreCache);
		return {
			success: true,
			data: {
				hardReload: args.ignoreCache || false,
				message: args.ignoreCache ? 'Page hard-reloaded (cache cleared)' : 'Page reloaded'
			}
		};
	}

	private async handleExecuteScript(args: { script: string }): Promise<RoopikToolResult> {
		const browserViewId = this.browserViewService.getActiveBrowserViewId();
		if (browserViewId === undefined) {
			return {
				success: false,
				error: 'No browser is open. Start a project first with rpk_startProject.'
			};
		}

		const result = await this.browserViewService.executeScript(browserViewId, args.script);
		return {
			success: true,
			data: { result }
		};
	}

	private async handleInspectElement(args: { selector: string; includeInherited?: boolean }): Promise<RoopikToolResult> {
		const browserViewId = this.browserViewService.getActiveBrowserViewId();
		if (browserViewId === undefined) {
			return {
				success: false,
				error: 'No browser is open. Start a project first with rpk_startProject.'
			};
		}

		const workspacePath = this.storageService.getWorkspacePath();
		const result = await this.browserViewService.getElementStyles({
			browserViewId,
			target: args.selector,
			projectRoot: workspacePath,
			includeUserAgent: false,
			includeInherited: args.includeInherited ?? true
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
				selector: args.selector,
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
	}

	// ========================================================================
	// CDP Tool Handlers
	// ========================================================================

	private async handleGetErrors(args: { limit?: number }): Promise<RoopikToolResult> {
		// CDP monitoring is handled via the existing MCP infrastructure
		// For IPC, we delegate to the same underlying service
		// This will be connected once we wire up CDP monitoring to the channel
		return {
			success: false,
			error: 'CDP tools require browser to be open with monitoring enabled. Use rpk_startProject first.'
		};
	}

	private async handleGetConsoleLogs(args: { limit?: number; type?: string }): Promise<RoopikToolResult> {
		return {
			success: false,
			error: 'CDP tools require browser to be open with monitoring enabled. Use rpk_startProject first.'
		};
	}

	// ========================================================================
	// Project Tool Handlers
	// ========================================================================

	private async handleGetActiveProject(): Promise<RoopikToolResult> {
		const runningServer = await this.devServerService.getRunningServer();

		if (!runningServer) {
			return {
				success: true,
				data: {
					hasActiveProject: false,
					message: 'No project is currently running. Use rpk_startProject to start one.'
				}
			};
		}

		return {
			success: true,
			data: {
				hasActiveProject: true,
				projectPath: runningServer.projectRoot,
				url: runningServer.url,
				port: runningServer.port,
				state: runningServer.state,
				framework: runningServer.framework,
				frameworkDisplayName: runningServer.frameworkDisplayName
			}
		};
	}

	private async handleStartProject(args: { projectPath: string; port?: number }): Promise<RoopikToolResult> {
		const url = await this.devServerService.startServer({
			projectRoot: args.projectPath,
			port: args.port
		});

		return {
			success: true,
			data: {
				url,
				projectPath: args.projectPath,
				message: `Dev server started at ${url}. Browser is now showing the project.`
			}
		};
	}

	private async handleStopProject(): Promise<RoopikToolResult> {
		const runningServer = await this.devServerService.getRunningServer();

		if (!runningServer) {
			return {
				success: true,
				data: { message: 'No project is currently running' }
			};
		}

		const projectPath = runningServer.projectRoot;
		await this.devServerService.stopServer(projectPath);

		return {
			success: true,
			data: {
				projectPath,
				message: 'Dev server stopped successfully'
			}
		};
	}

	// ========================================================================
	// Workspace/Canvas Tool Handlers
	// ========================================================================

	private async handleListCanvases(args: { nameFilter?: string; sortBy?: string; sortDirection?: string }): Promise<RoopikToolResult> {
		const canvases = await this.canvasService.listCanvasesAsync({
			nameFilter: args.nameFilter,
			sortBy: args.sortBy as any,
			sortDirection: args.sortDirection as any
		});

		return {
			success: true,
			data: {
				canvases: canvases.map(c => ({
					id: c.id,
					name: c.name,
					componentCount: c.componentCount,
					description: c.description,
					icon: c.icon,
					color: c.color,
					createdAt: c.createdAt,
					updatedAt: c.updatedAt
				})),
				count: canvases.length
			}
		};
	}

	private async handleGetActiveCanvas(): Promise<RoopikToolResult> {
		const focusedCanvasId = await this.canvasService.getFocusedCanvasIdAsync();

		if (!focusedCanvasId) {
			return {
				success: true,
				data: {
					activeCanvas: null,
					message: 'No canvas is currently focused'
				}
			};
		}

		const canvas = await this.canvasService.getCanvasAsync(focusedCanvasId);
		if (!canvas) {
			return {
				success: true,
				data: {
					activeCanvas: null,
					message: 'Focused canvas not found'
				}
			};
		}

		return {
			success: true,
			data: {
				activeCanvas: {
					id: canvas.id,
					name: canvas.name,
					componentCount: canvas.componentCount,
					description: canvas.description,
					icon: canvas.icon,
					color: canvas.color,
					createdAt: canvas.createdAt,
					updatedAt: canvas.updatedAt,
					isOpen: canvas.isOpen,
					isFocused: canvas.isFocused
				}
			}
		};
	}

	private async handleCreateCanvas(args: { name: string }): Promise<RoopikToolResult> {
		const result = await this.canvasService.createCanvas(args.name);

		return {
			success: true,
			data: {
				canvasId: result.canvasId,
				isNew: result.isNew,
				canvas: {
					id: result.canvas.id,
					name: result.canvas.name,
					componentCount: result.canvas.componentCount,
					description: result.canvas.description,
					icon: result.canvas.icon,
					color: result.canvas.color,
					createdAt: result.canvas.createdAt,
					updatedAt: result.canvas.updatedAt
				},
				message: result.isNew ? 'Canvas created successfully' : 'Canvas already exists with this name'
			}
		};
	}

	// ========================================================================
	// Component Tool Handlers
	// ========================================================================

	private async handleAddComponent(args: {
		folderPath: string;
		canvasId?: string;
		name?: string;
		entryFile?: string;
		framework?: string;
	}): Promise<RoopikToolResult> {
		const component = await this.componentService.addComponent({
			folderPath: args.folderPath,
			canvasId: args.canvasId,
			componentName: args.name,
			entryFile: args.entryFile,
			framework: args.framework as any,
			origin: 'ai'
		});

		return {
			success: true,
			data: {
				component: {
					id: component.id,
					canvasId: component.canvasId,
					folderPath: component.folderPath,
					entryFile: component.entryFile,
					framework: component.framework,
					buildState: component.buildState,
					contentHash: component.contentHash,
					componentName: component.componentName,
					origin: component.origin,
					createdAt: component.createdAt,
					updatedAt: component.updatedAt
				}
			}
		};
	}

	private async handleAddComponents(args: {
		components: Array<{
			folderPath: string;
			canvasId?: string;
			name?: string;
			entryFile?: string;
			framework?: string;
		}>;
	}): Promise<RoopikToolResult> {
		const requests = args.components.map(c => ({
			folderPath: c.folderPath,
			canvasId: c.canvasId,
			componentName: c.name,
			entryFile: c.entryFile,
			framework: c.framework as any,
			origin: 'ai' as const
		}));

		const created = await this.componentService.addComponents(requests);

		return {
			success: true,
			data: {
				count: created.length,
				components: created.map(c => ({
					id: c.id,
					canvasId: c.canvasId,
					componentName: c.componentName,
					folderPath: c.folderPath,
					framework: c.framework,
					buildState: c.buildState
				}))
			}
		};
	}

	private async handleRemoveComponent(args: { componentId: string }): Promise<RoopikToolResult> {
		await this.componentService.deleteComponent(args.componentId);

		return {
			success: true,
			data: { componentId: args.componentId }
		};
	}

	private async handleGetComponentInfo(args: { componentId: string }): Promise<RoopikToolResult> {
		const info = await this.componentService.getComponentInfo(args.componentId);

		return {
			success: true,
			data: { component: info }
		};
	}

	private async handleListComponents(args: { canvasId: string }): Promise<RoopikToolResult> {
		const components = this.componentService.getComponentsForCanvas(args.canvasId);

		return {
			success: true,
			data: {
				canvasId: args.canvasId,
				components: components.map(c => ({
					id: c.id,
					componentName: c.componentName,
					framework: c.framework,
					entryFile: c.entryFile,
					buildState: c.buildState
				}))
			}
		};
	}

	private async handleRebuildComponent(args: { componentId: string }): Promise<RoopikToolResult> {
		await this.componentService.rebuildComponent(args.componentId);

		return {
			success: true,
			data: {
				componentId: args.componentId,
				message: 'Rebuild queued - use rpk_getComponentInfo to check build state'
			}
		};
	}
}
