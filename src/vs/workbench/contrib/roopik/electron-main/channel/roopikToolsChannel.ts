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
 * - Browser Tools (5): screenshot, navigate, reload, executeScript, inspectElement
 * - CDP Tools (2): getErrors, getConsoleLogs
 * - Project Tools (3): getActiveProject, startProject, stopProject
 * - Workspace Tools (3): listCanvases, getActiveCanvas, createCanvas
 * - Component Tools (6): addComponent, addComponents, removeComponent, getComponentInfo, listComponents, rebuildComponent
 */

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
				// Browser Tools (5)
				// ============================================================
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
