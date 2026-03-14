/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Roopik Tools Channel
 *
 * IPC channel that exposes Roopik IDE tools to extensions (agent roopik-dio).
 * This provides a persistent, timeout-free connection for AI agent tool calls.
 *
 * Architecture :
 * - Extension (agent roopik-dio) -> IChannel.call() -> RoopikToolsChannel.call() -> Unified Services
 * - Uses unified tool services from electron-main/tools/ (single source of truth)
 * - Channel acts as thin orchestration layer: path resolution, workspace context, seamless UX
 * - Same services used by external agents (Claude Code, Cursor, Codex) via WebSocket MCP
 *
 * Tool Naming Convention: category_action (e.g., browser_navigate, component_add)
 *
 * Tool Categories:
 * - Browser Tools (14): browser_open, browser_close, browser_navigate, browser_reload, browser_screenshot,
 *                       browser_action_input, browser_execute_script, browser_inspect_element, browser_get_errors,
 *                       browser_get_console_logs, browser_get_performance, browser_get_state,
 *                       browser_set_viewport, browser_get_network_requests
 * - Project Tools (3): project_get_active, project_start, project_stop
 * - Canvas Tools (4): canvas_list, canvas_get_active, canvas_create, canvas_open
 * - Component Tools (7): component_add, component_add_batch, component_remove,
 *                        component_get_info, component_list, component_rebuild, canvas_validate_components
 */

import { Event } from '../../../../../base/common/event.js';
import { IServerChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import { resolve, normalize } from '../../../../../base/common/path.js';
import type { BrowserViewService } from '../projectMode/browserViewService.js';
import type { DevServerService } from '../projectMode/devServer/devServerService.js';
import type { ComponentService } from '../component/componentService.js';
import type { AddComponentRequest } from '../../common/component/types.js';
import type { ICanvasService } from '../../common/canvas/canvasService.js';
import type { IRoopikStorageService } from '../../common/storage/storageService.js';
import { ROOPIK_TOOLS_CHANNEL_NAME } from '../../common/tools/types.js';
import type { RoopikToolResult } from '../../common/tools/types.js';

// Import unified tool services (Phase 4 migration)
import { CDPMonitorService } from '../tools/cdpMonitorService.js';
import { BrowserToolService } from '../tools/browserToolService.js';
import { CanvasToolService } from '../tools/canvasToolService.js';
import { ComponentToolService } from '../tools/componentToolService.js';
import { ProjectToolService } from '../tools/projectToolService.js';

// Re-export for backwards compatibility with app.ts import
export { ROOPIK_TOOLS_CHANNEL_NAME, RoopikToolResult };

/**
 * RoopikToolsChannel - IPC handler for Roopik IDE tools
 *
 * Provides direct IPC access to all Roopik IDE capabilities for extensions.
 * This is the core-side handler that receives calls from agent roopik-dio.
 *
 * Architecture:
 * - Unified tool services handle all tool logic (single source of truth)
 * - Channel provides orchestration: path resolution, workspace context, seamless UX
 * - Same implementation powers both internal (Dio) and external (Claude, Cursor) agents
 */
export class RoopikToolsChannel implements IServerChannel {

	// Unified tool services (Phase 4 migration - same as ToolExecutor)
	private readonly cdpMonitorService: CDPMonitorService;
	private readonly browserToolService: BrowserToolService;
	private readonly canvasToolService: CanvasToolService;
	private readonly componentToolService: ComponentToolService;
	private readonly projectToolService: ProjectToolService;

	constructor(
		private readonly browserViewService: BrowserViewService,
		private readonly devServerService: DevServerService,
		private readonly componentService: ComponentService,
		private readonly canvasService: ICanvasService,
		private readonly storageService: IRoopikStorageService
	) {
		// Create CDPMonitorService first (used by BrowserToolService)
		this.cdpMonitorService = new CDPMonitorService(browserViewService);

		// Create unified tool services
		this.browserToolService = new BrowserToolService(browserViewService, this.cdpMonitorService);
		this.canvasToolService = new CanvasToolService(canvasService, componentService);
		this.componentToolService = new ComponentToolService(componentService, canvasService);
		this.projectToolService = new ProjectToolService(devServerService, storageService, browserViewService);
	}

	/**
	 * Handle event subscriptions from extensions
	 * Future: Can expose events like onComponentBuilt, onProjectStarted, etc.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- IServerChannel interface requires any
	listen(_context: unknown, event: string): Event<any> {
		throw new Error(`[RoopikToolsChannel] Unknown event: ${event}`);
	}

	/**
	 * Handle tool calls from extensions
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- IServerChannel interface requires any
	async call(_context: unknown, command: string, arg?: any): Promise<any> {
		try {
			switch (command) {
				// ============================================================
				// Browser Tools (14)
				// ============================================================
				case 'browser_open':
					return this.handleBrowserOpen(arg as { url?: string });

				case 'browser_close':
					return this.handleBrowserClose();

				case 'browser_navigate':
					return this.handleNavigate(arg as { url: string });

				case 'browser_reload':
					return this.handleReload(arg as { ignoreCache?: boolean });

				case 'browser_screenshot':
					return this.handleScreenshot();

				case 'browser_action_input':
					return this.handleBrowserAction(arg as {
						action: string;
						coordinate?: string;
						text?: string;
						key?: string;
						modifiers?: string[];
						deltaX?: number;
						deltaY?: number;
					});

				case 'browser_execute_script':
					return this.handleExecuteScript(arg as { script: string });

				case 'browser_inspect_element':
					return this.handleInspectElement(arg as { selector: string; includeInherited?: boolean });

				case 'browser_get_errors':
					return this.handleGetErrors(arg as { limit?: number });

				case 'browser_get_console_logs':
					return this.handleGetConsoleLogs(arg as { limit?: number; type?: string });

				case 'browser_get_performance':
					return this.handleBrowserGetPerformance();

				case 'browser_get_state':
					return this.handleBrowserGetState();

				case 'browser_set_viewport':
					return this.handleSetViewport(arg as { width?: number; height?: number; deviceScaleFactor?: number; mobile?: boolean } | undefined);

				case 'browser_get_network_requests':
					return this.handleGetNetworkRequests(arg as { urlFilter?: string; method?: string; statusFilter?: string; limit?: number });

				// ============================================================
				// Project Tools (3)
				// ============================================================
				case 'project_get_active':
					return this.handleGetActiveProject();

				case 'project_start':
					return this.handleStartProject(arg as { projectPath: string; port?: number });

				case 'project_stop':
					return this.handleStopProject();

				// ============================================================
				// Canvas Tools (4)
				// ============================================================
				case 'canvas_list':
					return this.handleListCanvases(arg as { nameFilter?: string; sortBy?: string; sortDirection?: string });

				case 'canvas_get_active':
					return this.handleGetActiveCanvas();

				case 'canvas_create':
					return this.handleCreateCanvas(arg as { name: string });

				case 'canvas_open':
					return this.handleOpenCanvas(arg as { canvasId?: string; name?: string });

				// ============================================================
				// Component Tools (6)
				// ============================================================
				case 'component_add':
					return this.handleAddComponent(arg as {
						folderPath: string;
						canvasId?: string;
						name?: string;
						entryFile?: string;
						framework?: string;
					});

				case 'component_add_batch':
					return this.handleAddComponents(arg as {
						components: Array<{
							folderPath: string;
							canvasId?: string;
							name?: string;
							entryFile?: string;
							framework?: string;
						}>;
					});

				case 'component_remove':
					return this.handleRemoveComponent(arg as { componentId: string });

				case 'component_get_info':
					return this.handleGetComponentInfo(arg as { componentId: string });

				case 'component_list':
					return this.handleListComponents(arg as { canvasId: string });

				case 'component_rebuild':
					return this.handleRebuildComponent(arg as { componentId: string });

				case 'canvas_validate_components':
					return this.handleValidateComponents(arg as { canvasId?: string });

				// TODO: Feature pending - race condition with webview init
				// case 'component_screenshot':
				// 	return this.handleComponentScreenshot(arg as { componentId: string; canvasId: string });

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
	 *
	 * NOTE: This handler is kept for backwards compatibility but browser_open
	 * should be handled in the renderer process (roopikToolsCommands.ts) to
	 * properly open the editor tab. Direct IPC calls here only create the
	 * BrowserView without the editor UI.
	 *
	 * If browser is already open, this will work correctly for navigation.
	 * If browser is not open, this will return an error directing to use
	 * the proper command.
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
						url: args.url,
						message: `Navigated existing browser to ${args.url}`
					}
				};
			}
			return {
				success: true,
				data: {
					message: 'Browser is already open'
				}
			};
		}

		// Browser not open - this should be handled via the renderer command
		// which properly opens the editor tab
		return {
			success: false,
			error: 'Browser is not open. Use the roopik.tools.browserOpen command (not direct IPC) to open the browser with proper UI.'
		};
	}

	/**
	 * Get performance metrics from the browser including Web Vitals.
	 * Uses CDP's PerformanceTimeline domain for LCP, CLS data,
	 * and Performance domain for runtime metrics.
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

			// Enable Performance domain for runtime metrics
			await this.browserViewService.sendCDPCommand(browserViewId, 'Performance.enable');

			// Get CDP runtime performance metrics (JSHeap, Nodes, Layouts, etc.)
			const cdpMetrics = await this.browserViewService.sendCDPCommand(browserViewId, 'Performance.getMetrics');

			// Enable PerformanceTimeline domain for Web Vitals (LCP, LayoutShift)
			// Note: This returns buffered events from page load
			interface TimelineEvent {
				type: string;
				lcpDetails?: { renderTime?: number; loadTime?: number; size?: number; nodeId?: number };
				layoutShiftDetails?: { value?: number; hadRecentInput?: boolean };
			}
			let timelineEvents: TimelineEvent[] = [];
			try {
				const timelineResult = await this.browserViewService.sendCDPCommand(
					browserViewId,
					'PerformanceTimeline.enable',
					{ eventTypes: ['largest-contentful-paint', 'layout-shift', 'first-contentful-paint'] }
				);
				if (timelineResult && timelineResult.timelineEvents) {
					timelineEvents = timelineResult.timelineEvents;
				}
			} catch (e) {
				// PerformanceTimeline may not be available in all Chromium versions
				console.warn('[RoopikTools] PerformanceTimeline not available:', e);
			}

			// Process timeline events for Web Vitals
			let lcp: { renderTime?: number; loadTime?: number; size?: number; nodeId?: number } | null = null;
			let cls = 0;
			const layoutShifts: TimelineEvent['layoutShiftDetails'][] = [];

			for (const event of timelineEvents) {
				if (event.type === 'LargestContentfulPaint' && event.lcpDetails) {
					lcp = event.lcpDetails;
				} else if (event.type === 'LayoutShift' && event.layoutShiftDetails) {
					const shift = event.layoutShiftDetails;
					if (!shift.hadRecentInput) {
						cls += shift.value || 0;
					}
					layoutShifts.push(shift);
				}
			}

			// Format CDP runtime metrics into a more readable object
			const metricsMap: Record<string, number> = {};
			if (cdpMetrics && cdpMetrics.metrics) {
				for (const metric of cdpMetrics.metrics) {
					metricsMap[metric.name] = metric.value;
				}
			}

			// Extract key metrics from CDP Performance.getMetrics
			const jsHeapUsedMB = metricsMap['JSHeapUsedSize'] ? Math.round(metricsMap['JSHeapUsedSize'] / 1024 / 1024) : null;
			const jsHeapTotalMB = metricsMap['JSHeapTotalSize'] ? Math.round(metricsMap['JSHeapTotalSize'] / 1024 / 1024) : null;

			return {
				success: true,
				data: {
					// Web Vitals from CDP PerformanceTimeline
					webVitals: {
						lcp: lcp ? {
							renderTime: lcp.renderTime,
							loadTime: lcp.loadTime,
							size: lcp.size
						} : null,
						cls: Math.round(cls * 1000) / 1000,
						layoutShiftCount: layoutShifts.length
					},
					// Runtime metrics from CDP Performance.getMetrics
					runtime: {
						jsHeapUsedMB,
						jsHeapTotalMB,
						documents: metricsMap['Documents'],
						frames: metricsMap['Frames'],
						nodes: metricsMap['Nodes'],
						layoutCount: metricsMap['LayoutCount'],
						recalcStyleCount: metricsMap['RecalcStyleCount'],
						scriptDuration: metricsMap['ScriptDuration'] ? Math.round(metricsMap['ScriptDuration'] * 1000) : null,
						layoutDuration: metricsMap['LayoutDuration'] ? Math.round(metricsMap['LayoutDuration'] * 1000) : null,
						taskDuration: metricsMap['TaskDuration'] ? Math.round(metricsMap['TaskDuration'] * 1000) : null
					},
					// Full CDP metrics for advanced users
					cdpMetrics: metricsMap,
					// Human-readable summary
					summary: {
						lcp: lcp?.renderTime ? `${Math.round(lcp.renderTime)}ms` : (lcp?.loadTime ? `${Math.round(lcp.loadTime)}ms` : 'N/A'),
						cls: Math.round(cls * 1000) / 1000,
						jsHeap: jsHeapUsedMB ? `${jsHeapUsedMB}MB / ${jsHeapTotalMB}MB` : 'N/A',
						domNodes: metricsMap['Nodes'] || 'N/A',
						layoutCount: metricsMap['LayoutCount'] || 'N/A'
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

	/**
	 * Get browser state information.
	 *
	 * Returns the current browser status including URL, title, loading state,
	 * and dev server info if running.
	 *
	 * Note: Use tools/list for available tools, not this method.
	 */
	private async handleBrowserGetState(): Promise<RoopikToolResult> {
		const browserViewId = this.browserViewService.getActiveBrowserViewId();

		// Get dev server info if running
		const runningServer = await this.devServerService.getRunningServer();

		if (browserViewId === undefined) {
			return {
				success: true,
				data: {
					browserOpen: false,
					devServerRunning: !!runningServer,
					devServer: runningServer ? {
						url: runningServer.url,
						projectRoot: runningServer.projectRoot,
						port: runningServer.port,
						framework: runningServer.framework
					} : null,
					message: 'No browser open. Use browser_open or project_start to open a browser.'
				}
			};
		}

		// Get navigation state (includes current URL)
		const navState = await this.browserViewService.getNavigationState(browserViewId);

		return {
			success: true,
			data: {
				browserOpen: true,
				currentUrl: navState.url,
				title: navState.title,
				isLoading: navState.isLoading,
				devServerRunning: !!runningServer,
				devServer: runningServer ? {
					url: runningServer.url,
					projectRoot: runningServer.projectRoot,
					port: runningServer.port,
					framework: runningServer.framework
				} : null,
				message: `Browser open at ${navState.url}`
			}
		};
	}

	private async handleScreenshot(): Promise<RoopikToolResult> {
		// Delegate to unified BrowserToolService
		return this.browserToolService.screenshot();
	}

	/**
	 * Close the browser view
	 * Delegates to unified BrowserToolService which handles event-based cleanup
	 */
	private async handleBrowserClose(): Promise<RoopikToolResult> {
		// Delegate to unified BrowserToolService
		return this.browserToolService.close();
	}

	/**
	 * Perform browser input actions (click, type, press, scroll, hover, drag)
	 * Delegates to unified BrowserToolService.
	 */
	private async handleBrowserAction(args: {
		action: string;
		coordinate?: string;
		text?: string;
		key?: string;
		modifiers?: string[];
		deltaX?: number;
		deltaY?: number;
	}): Promise<RoopikToolResult> {
		// Delegate to unified BrowserToolService
		return this.browserToolService.actionInput({
			action: args.action as 'click' | 'right_click' | 'double_click' | 'hover' | 'drag' | 'type' | 'press' | 'scroll',
			coordinate: args.coordinate,
			text: args.text,
			key: args.key,
			modifiers: args.modifiers,
			deltaX: args.deltaX,
			deltaY: args.deltaY
		});
	}

	private async handleNavigate(args: { url: string }): Promise<RoopikToolResult> {
		// Delegate to unified BrowserToolService
		return this.browserToolService.navigate(args.url);
	}

	private async handleReload(args: { ignoreCache?: boolean }): Promise<RoopikToolResult> {
		// Delegate to unified BrowserToolService
		return this.browserToolService.reload(args.ignoreCache);
	}

	private async handleExecuteScript(args: { script: string }): Promise<RoopikToolResult> {
		// Delegate to unified BrowserToolService
		return this.browserToolService.executeScript(args.script);
	}

	private async handleInspectElement(args: { selector: string; includeInherited?: boolean }): Promise<RoopikToolResult> {
		// Delegate to unified BrowserToolService with workspace path for CSS source resolution
		const workspacePath = this.storageService.getWorkspacePath();
		return this.browserToolService.inspectElement(
			args.selector,
			args.includeInherited ?? true,
			workspacePath
		);
	}

	// ========================================================================
	// CDP Tool Handlers (Phase 4: Now using unified CDPMonitorService!)
	// ========================================================================

	private async handleGetErrors(args: { limit?: number }): Promise<RoopikToolResult> {
		// Delegate to unified BrowserToolService which uses CDPMonitorService
		// This now works! Same CDP monitoring shared with external agents (Claude Code, Cursor)
		return this.browserToolService.getErrors(args.limit);
	}

	private async handleGetConsoleLogs(args: { limit?: number; types?: string[]; since?: number; clear?: boolean }): Promise<RoopikToolResult> {
		// Delegate to unified BrowserToolService which uses CDPMonitorService
		return this.browserToolService.getConsoleLogs({
			limit: args.limit,
			types: args.types,
			since: args.since,
			clear: args.clear
		});
	}

	/**
	 * Set or clear browser viewport override.
	 * Delegates to unified BrowserToolService.
	 */
	private async handleSetViewport(args?: {
		width?: number;
		height?: number;
		deviceScaleFactor?: number;
		mobile?: boolean;
	}): Promise<RoopikToolResult> {
		// Delegate to unified BrowserToolService
		// Pass undefined to clear viewport, or object with dimensions to set
		return this.browserToolService.setViewport(
			args && (args.width || args.height) ? args : undefined
		);
	}

	/**
	 * Get network requests captured by CDP.
	 * Phase 4: Now delegates to unified BrowserToolService which uses CDPMonitorService.
	 */
	private async handleGetNetworkRequests(args: {
		urlFilter?: string;
		method?: string;
		statusFilter?: string;
		limit?: number;
	}): Promise<RoopikToolResult> {
		// Delegate to unified BrowserToolService which uses CDPMonitorService
		// This now works! Same CDP monitoring shared with external agents (Claude Code, Cursor)
		return this.browserToolService.getNetworkRequests({
			urlFilter: args.urlFilter,
			method: args.method,
			statusFilter: args.statusFilter as 'success' | 'error' | 'all' | undefined,
			limit: args.limit
		});
	}

	// ========================================================================
	// Project Tool Handlers
	// ========================================================================

	private async handleGetActiveProject(): Promise<RoopikToolResult> {
		// Delegate to unified ProjectToolService, adapt response for Dio agent format
		const result = await this.projectToolService.getActive();

		if (!result.success) {
			return result;
		}

		if (!result.data) {
			return {
				success: true,
				data: {
					hasActiveProject: false,
					message: 'No project is currently running. Use project_start to start one.'
				}
			};
		}

		return {
			success: true,
			data: {
				hasActiveProject: true,
				projectPath: result.data.projectRoot,
				url: result.data.url,
				port: result.data.port,
				state: result.data.status,
				framework: result.data.framework
			}
		};
	}

	private async handleStartProject(args: { projectPath: string; port?: number }): Promise<RoopikToolResult> {
		// Resolve relative paths against workspace
		// AI agents may pass relative paths like "." or "./frontend"
		let inputPath = args.projectPath;

		// On non-Windows platforms, convert backslashes to forward slashes
		if (process.platform !== 'win32') {
			inputPath = inputPath.replace(/\\/g, '/');
		}

		const workspacePath = this.storageService.getWorkspaceRootPath();
		const resolvedPath = resolve(workspacePath, normalize(inputPath));

		const url = await this.devServerService.startServer({
			projectRoot: resolvedPath,
			port: args.port
		});

		return {
			success: true,
			data: {
				url,
				projectPath: resolvedPath,
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

		// Close browser editor UI (fires event to renderer process)
		this.browserViewService.requestBrowserClose();

		return {
			success: true,
			data: {
				projectPath,
				message: 'Dev server stopped and browser closed'
			}
		};
	}

	// ========================================================================
	// Workspace/Canvas Tool Handlers (Phase 4: Using unified CanvasToolService)
	// ========================================================================

	private async handleListCanvases(args: { nameFilter?: string; sortBy?: string; sortDirection?: string }): Promise<RoopikToolResult> {
		// Delegate to unified CanvasToolService
		return this.canvasToolService.list({
			nameFilter: args.nameFilter,
			sortBy: args.sortBy as 'name' | 'updatedAt' | 'createdAt' | 'componentCount' | undefined,
			sortDirection: args.sortDirection as 'asc' | 'desc' | undefined
		});
	}

	private async handleGetActiveCanvas(): Promise<RoopikToolResult> {
		// Delegate to unified CanvasToolService, wrap response for Dio agent format
		const result = await this.canvasToolService.getActive();

		if (!result.success) {
			return result;
		}

		return {
			success: true,
			data: {
				activeCanvas: result.data,
				message: result.data ? undefined : 'No canvas is currently focused'
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

	private async handleOpenCanvas(args: { canvasId?: string; name?: string }): Promise<RoopikToolResult> {
		// Delegate to CanvasToolService which handles lookup by ID or name
		return this.canvasToolService.open(args);
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
		const request: AddComponentRequest = {
			folderPath: args.folderPath,
			canvasId: args.canvasId,
			componentName: args.name,
			entryFile: args.entryFile,
			framework: args.framework,
			origin: 'ai'
		};
		const component = await this.componentService.addComponent(request);

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
		const requests: AddComponentRequest[] = args.components.map(c => ({
			folderPath: c.folderPath,
			canvasId: c.canvasId,
			componentName: c.name,
			entryFile: c.entryFile,
			framework: c.framework,
			origin: 'ai'
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

	private async handleRemoveComponent(args: { componentId: string; deleteSourceCode?: boolean }): Promise<RoopikToolResult> {
		// Delegate to unified ComponentToolService
		return this.componentToolService.remove(args.componentId, args.deleteSourceCode);
	}

	private async handleGetComponentInfo(args: { componentId: string }): Promise<RoopikToolResult> {
		// Delegate to unified ComponentToolService
		return this.componentToolService.getInfo(args.componentId);
	}

	private async handleListComponents(args: { canvasId: string }): Promise<RoopikToolResult> {
		// Delegate to unified ComponentToolService
		return this.componentToolService.list(args.canvasId);
	}

	private async handleRebuildComponent(args: { componentId: string }): Promise<RoopikToolResult> {
		// Delegate to unified ComponentToolService
		return this.componentToolService.rebuild(args.componentId);
	}

	private async handleValidateComponents(args: { canvasId?: string }): Promise<RoopikToolResult> {
		// Delegate to unified ComponentToolService
		return this.componentToolService.validateComponents(args.canvasId);
	}

	// TODO: Feature pending - race condition with webview init
	// private async handleComponentScreenshot(args: { componentId: string; canvasId: string }): Promise<RoopikToolResult> {
	// 	return this.componentToolService.screenshot(args.componentId, args.canvasId);
	// }
}
