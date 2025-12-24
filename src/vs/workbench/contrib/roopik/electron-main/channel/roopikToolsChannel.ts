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
 * Tool Naming Convention: category_action (e.g., browser_navigate, component_add)
 *
 * Tool Categories:
 * - Browser Tools (10): browser_open, browser_navigate, browser_reload, browser_screenshot,
 *                       browser_execute_script, browser_inspect_element, browser_get_errors,
 *                       browser_get_console_logs, browser_get_performance, browser_get_cdp_info
 * - Project Tools (3): project_get_active, project_start, project_stop
 * - Canvas Tools (3): canvas_list, canvas_get_active, canvas_create
 * - Component Tools (6): component_add, component_add_batch, component_remove,
 *                        component_get_info, component_list, component_rebuild
 */

import { Event } from '../../../../../base/common/event.js';
import { IServerChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import type { BrowserViewService } from '../projectMode/browserViewService.js';
import type { DevServerService } from '../projectMode/devServer/devServerService.js';
import type { ComponentService } from '../component/componentService.js';
import type { ICanvasService } from '../../common/canvas/canvasService.js';
import type { IRoopikStorageService } from '../../common/storage/storageService.js';
import { ROOPIK_TOOLS_CHANNEL_NAME, RoopikToolResult } from '../../common/tools/types.js';

// Re-export for backwards compatibility with app.ts import
export { ROOPIK_TOOLS_CHANNEL_NAME, RoopikToolResult };

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

				case 'browser_get_cdp_info':
					return this.handleBrowserGetCdpInfo();

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
				// Canvas Tools (3)
				// ============================================================
				case 'canvas_list':
					return this.handleListCanvases(arg as { nameFilter?: string; sortBy?: string; sortDirection?: string });

				case 'canvas_get_active':
					return this.handleGetActiveCanvas();

				case 'canvas_create':
					return this.handleCreateCanvas(arg as { name: string });

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
	 * Get CDP connection info for external agents to connect to the browser.
	 *
	 * Returns information about the current browser state and how external
	 * agents (Claude Code, Copilot, etc.) can interact with it.
	 *
	 * Note: Electron's BrowserView doesn't expose a WebSocket server by default.
	 * External agents should use Roopik's IPC tools instead of direct CDP connection.
	 * This tool provides context about what's available.
	 */
	private async handleBrowserGetCdpInfo(): Promise<RoopikToolResult> {
		const browserViewId = this.browserViewService.getActiveBrowserViewId();

		// Get dev server info if running
		const runningServer = await this.devServerService.getRunningServer();

		const availableTools = [
			// Browser tools
			'browser_open',
			'browser_navigate',
			'browser_reload',
			'browser_screenshot',
			'browser_execute_script',
			'browser_inspect_element',
			'browser_get_errors',
			'browser_get_console_logs',
			'browser_get_performance',
			'browser_get_cdp_info',
			// Project tools
			'project_get_active',
			'project_start',
			'project_stop',
			// Canvas tools
			'canvas_list',
			'canvas_get_active',
			'canvas_create',
			// Component tools
			'component_add',
			'component_add_batch',
			'component_remove',
			'component_get_info',
			'component_list',
			'component_rebuild'
		];

		if (browserViewId === undefined) {
			return {
				success: true,
				data: {
					browserOpen: false,
					devServer: runningServer ? {
						running: true,
						url: runningServer.url,
						projectRoot: runningServer.projectRoot,
						port: runningServer.port,
						framework: runningServer.framework
					} : null,
					cdpAccess: {
						// Electron BrowserView uses in-process debugger, not WebSocket
						type: 'internal',
						note: 'Roopik uses Electron in-process CDP. External agents should use Roopik IPC tools.',
						availableTools
					},
					message: 'No browser open. Use browser_open to open a browser.'
				}
			};
		}

		// Get navigation state (includes current URL)
		const navState = await this.browserViewService.getNavigationState(browserViewId);

		return {
			success: true,
			data: {
				browserOpen: true,
				browserViewId,
				currentUrl: navState.url,
				title: navState.title,
				isLoading: navState.isLoading,
				devServer: runningServer ? {
					running: true,
					url: runningServer.url,
					projectRoot: runningServer.projectRoot,
					port: runningServer.port,
					framework: runningServer.framework
				} : null,
				cdpAccess: {
					// Electron BrowserView uses in-process debugger
					type: 'internal',
					note: 'Roopik uses Electron in-process CDP. External agents should use Roopik IPC tools instead of WebSocket CDP.',
					availableTools,
					// For future: If we want to expose remote debugging, we'd need to:
					// 1. Start Chromium with --remote-debugging-port
					// 2. Or use a CDP proxy that exposes WebSocket
					remoteDebugging: {
						enabled: false,
						reason: 'Electron BrowserView does not expose WebSocket CDP by default. Use Roopik IPC tools for full CDP access.'
					}
				},
				message: `Browser open at ${navState.url}. Use Roopik tools for CDP operations.`
			}
		};
	}

	private async handleScreenshot(): Promise<RoopikToolResult> {
		const browserViewId = this.browserViewService.getActiveBrowserViewId();
		if (browserViewId === undefined) {
			return {
				success: false,
				error: 'No browser is open. Use browser_open or project_start first.'
			};
		}

		// Use takeScreenshotWithMetadata to include viewport dimensions for pixel-perfect clicking
		const result = await this.browserViewService.takeScreenshotWithMetadata(browserViewId);
		return {
			success: true,
			data: {
				image: result.image,
				format: 'data-url',
				// Viewport metadata for coordinate scaling
				viewport: {
					width: result.width,
					height: result.height,
					devicePixelRatio: result.devicePixelRatio
				}
			}
		};
	}

	/**
	 * Close the browser view
	 */
	private async handleBrowserClose(): Promise<RoopikToolResult> {
		const browserViewId = this.browserViewService.getActiveBrowserViewId();
		if (browserViewId === undefined) {
			return {
				success: true,
				data: { message: 'No browser is open' }
			};
		}

		await this.browserViewService.destroyBrowserView(browserViewId);
		return {
			success: true,
			data: { message: 'Browser closed' }
		};
	}

	/**
	 * Perform browser input actions (click, type, press, scroll, hover, drag)
	 *
	 * Coordinate format: 'x,y@WIDTHxHEIGHT' (e.g., '450,203@900x600')
	 * The coordinates are automatically scaled to the actual viewport size.
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
		const browserViewId = this.browserViewService.getActiveBrowserViewId();
		if (browserViewId === undefined) {
			return {
				success: false,
				error: 'No browser is open. Use browser_open or project_start first.'
			};
		}

		const { action, coordinate, text, key, modifiers, deltaX, deltaY } = args;

		try {
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
					return {
						success: true,
						data: { action, coordinate, message: `${action} at (${x}, ${y})` }
					};

				case 'drag':
					// For drag, coordinate is start, and we need end coordinates
					// Format: coordinate='startX,startY@WIDTHxHEIGHT', deltaX/deltaY for end offset
					if (!coordinate || deltaX === undefined || deltaY === undefined) {
						return { success: false, error: "'drag' requires 'coordinate' (start) and 'deltaX'/'deltaY' (offset)" };
					}
					await this.browserViewService.sendDragEvent(
						browserViewId,
						x, y, x + deltaX, y + deltaY,
						refWidth, refHeight
					);
					return {
						success: true,
						data: { action, from: { x, y }, to: { x: x + deltaX, y: y + deltaY }, message: 'Drag completed' }
					};

				case 'type':
					if (!text) {
						return { success: false, error: "'type' requires 'text' parameter" };
					}
					await this.browserViewService.sendTypeEvent(browserViewId, text);
					return {
						success: true,
						data: { action, text, message: `Typed ${text.length} characters` }
					};

				case 'press':
					if (!key) {
						return { success: false, error: "'press' requires 'key' parameter" };
					}
					await this.browserViewService.sendKeyEvent(browserViewId, key, modifiers);
					return {
						success: true,
						data: { action, key, modifiers, message: `Pressed ${key}` }
					};

				case 'scroll':
					if (deltaX === undefined && deltaY === undefined) {
						return { success: false, error: "'scroll' requires 'deltaX' and/or 'deltaY' parameters" };
					}
					await this.browserViewService.sendScrollEvent(
						browserViewId,
						deltaX ?? 0,
						deltaY ?? 0,
						coordinate ? x : undefined,
						coordinate ? y : undefined
					);
					return {
						success: true,
						data: { action, deltaX: deltaX ?? 0, deltaY: deltaY ?? 0, message: 'Scrolled' }
					};

				default:
					return {
						success: false,
						error: `Unknown action: '${action}'. Valid actions: click, right_click, double_click, hover, drag, type, press, scroll`
					};
			}
		} catch (error) {
			return {
				success: false,
				error: `Browser action failed: ${error instanceof Error ? error.message : String(error)}`
			};
		}
	}

	private async handleNavigate(args: { url: string }): Promise<RoopikToolResult> {
		const browserViewId = this.browserViewService.getActiveBrowserViewId();
		if (browserViewId === undefined) {
			return {
				success: false,
				error: 'No browser is open. Use browser_open or project_start first.'
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
				error: 'No browser is open. Use browser_open or project_start first.'
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
				error: 'No browser is open. Use browser_open or project_start first.'
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
				error: 'No browser is open. Use browser_open or project_start first.'
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
			error: 'CDP tools require browser to be open with monitoring enabled. Use project_start first.'
		};
	}

	private async handleGetConsoleLogs(args: { limit?: number; type?: string }): Promise<RoopikToolResult> {
		return {
			success: false,
			error: 'CDP tools require browser to be open with monitoring enabled. Use project_start first.'
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
					message: 'No project is currently running. Use project_start to start one.'
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
				message: 'Rebuild queued - use component_get_info to check build state'
			}
		};
	}
}
