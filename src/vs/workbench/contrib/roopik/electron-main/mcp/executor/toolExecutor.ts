/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Tool Executor - Central Dispatcher
 *
 * Single entry point for all MCP tool calls.
 * Routes tool calls to the appropriate executor (browser, canvas, project).
 * Both HTTP MCP and WebSocket MCP call this dispatcher.
 */

import type { BrowserViewService } from '../../projectMode/browserViewService.js';
import type { IRoopikStorageService } from '../../../common/storage/storageService.js';
import type { ICanvasService } from '../../../common/canvas/canvasService.js';
import type { ComponentService } from '../../component/componentService.js';
import type { DevServerService } from '../../projectMode/devServer/devServerService.js';
import type { ToolResult } from './types.js';
import { BrowserExecutor } from './browserExecutor.js';
import { CanvasExecutor } from './canvasExecutor.js';
import { ProjectExecutor } from './projectExecutor.js';

// ============================================================================
// Tool Call Types
// ============================================================================

export interface ToolCall {
	tool: string;
	params: Record<string, unknown>;
}

export interface ToolCallResult {
	success: boolean;
	data?: unknown;
	error?: string;
}

// ============================================================================
// Tool Executor Class
// ============================================================================

export class ToolExecutor {
	private readonly browserExecutor: BrowserExecutor;
	private readonly canvasExecutor: CanvasExecutor;
	private readonly projectExecutor: ProjectExecutor;

	constructor(
		browserViewService: BrowserViewService,
		storageService: IRoopikStorageService,
		canvasService: ICanvasService,
		componentService: ComponentService,
		devServerService: DevServerService
	) {
		this.browserExecutor = new BrowserExecutor(browserViewService, storageService);
		this.canvasExecutor = new CanvasExecutor(canvasService, componentService);
		this.projectExecutor = new ProjectExecutor(devServerService, browserViewService, storageService);
	}

	/**
	 * Execute a tool call and return the result
	 */
	async execute(call: ToolCall): Promise<ToolCallResult> {
		const { tool, params } = call;

		try {
			// Route to appropriate executor based on tool name prefix
			if (tool.startsWith('browser_')) {
				return await this.executeBrowserTool(tool, params);
			}

			if (tool.startsWith('canvas_')) {
				return await this.executeCanvasTool(tool, params);
			}

			if (tool.startsWith('component_')) {
				return await this.executeComponentTool(tool, params);
			}

			if (tool.startsWith('project_')) {
				return await this.executeProjectTool(tool, params);
			}

			return {
				success: false,
				error: `Unknown tool: ${tool}`
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	/**
	 * Get list of all available tools
	 */
	getAvailableTools(): string[] {
		return [
			// Browser tools (14)
			'browser_open',
			'browser_close',
			'browser_screenshot',
			'browser_navigate',
			'browser_reload',
			'browser_action_input',
			'browser_execute_script',
			'browser_inspect_element',
			'browser_get_errors',
			'browser_get_console_logs',
			'browser_get_performance',
			'browser_get_state',
			'browser_set_viewport',
			'browser_get_network_requests',
			// Canvas tools (3)
			'canvas_list',
			'canvas_get_active',
			'canvas_create',
			// Component tools (6)
			'component_add',
			'component_add_batch',
			'component_remove',
			'component_get_info',
			'component_list',
			'component_rebuild',
			// Project tools (3)
			'project_get_active',
			'project_start',
			'project_stop',
		];
	}

	// ==========================================================================
	// Browser Tool Routing (14 tools)
	// ==========================================================================

	private async executeBrowserTool(tool: string, params: Record<string, unknown>): Promise<ToolResult<unknown>> {
		switch (tool) {
			case 'browser_open':
				return this.browserExecutor.open(params.url as string | undefined);

			case 'browser_close':
				return this.browserExecutor.close();

			case 'browser_screenshot':
				return this.browserExecutor.screenshot();

			case 'browser_navigate':
				return this.browserExecutor.navigate(params.url as string);

			case 'browser_reload':
				return this.browserExecutor.reload(params.ignoreCache as boolean | undefined);

			case 'browser_action_input':
				return this.browserExecutor.actionInput({
					action: params.action as 'click' | 'right_click' | 'double_click' | 'hover' | 'drag' | 'type' | 'press' | 'scroll',
					coordinate: params.coordinate as string | undefined,
					text: params.text as string | undefined,
					key: params.key as string | undefined,
					modifiers: params.modifiers as string[] | undefined,
					deltaX: params.deltaX as number | undefined,
					deltaY: params.deltaY as number | undefined,
				});

			case 'browser_execute_script':
				return this.browserExecutor.executeScript(params.script as string);

			case 'browser_inspect_element':
				return this.browserExecutor.inspectElement({
					selector: params.selector as string,
					includeInherited: params.includeInherited as boolean | undefined,
				});

			case 'browser_get_errors':
				return this.browserExecutor.getErrors(params.limit as number | undefined);

			case 'browser_get_console_logs':
				return this.browserExecutor.getConsoleLogs({
					types: params.types as string[] | undefined,
					since: params.since as number | undefined,
					limit: params.limit as number | undefined,
					clear: params.clear as boolean | undefined,
				});

			case 'browser_get_performance':
				return this.browserExecutor.getPerformance();

			case 'browser_get_state':
				return this.browserExecutor.getState();

			case 'browser_set_viewport':
				// If no params or no width/height, pass undefined to clear viewport
				return this.browserExecutor.setViewport(
					Object.keys(params).length === 0 ? undefined : {
						width: params.width as number | undefined,
						height: params.height as number | undefined,
						deviceScaleFactor: params.deviceScaleFactor as number | undefined,
						mobile: params.mobile as boolean | undefined,
					}
				);

			case 'browser_get_network_requests':
				return this.browserExecutor.getNetworkRequests({
					urlFilter: params.urlFilter as string | undefined,
					method: params.method as string | undefined,
					statusFilter: params.statusFilter as 'success' | 'error' | 'all' | undefined,
					limit: params.limit as number | undefined,
				});

			default:
				return {
					success: false,
					error: `Unknown browser tool: ${tool}`
				};
		}
	}

	// ==========================================================================
	// Canvas Tool Routing (3 tools)
	// ==========================================================================

	private async executeCanvasTool(tool: string, params: Record<string, unknown>): Promise<ToolResult<unknown>> {
		switch (tool) {
			case 'canvas_list':
				return this.canvasExecutor.listCanvases({
					nameFilter: params.nameFilter as string | undefined,
					sortBy: params.sortBy as 'name' | 'updatedAt' | 'createdAt' | 'componentCount' | undefined,
					sortDirection: params.sortDirection as 'asc' | 'desc' | undefined,
				});

			case 'canvas_get_active':
				return this.canvasExecutor.getActiveCanvas();

			case 'canvas_create':
				return this.canvasExecutor.createCanvas(params.name as string);

			default:
				return {
					success: false,
					error: `Unknown canvas tool: ${tool}`
				};
		}
	}

	// ==========================================================================
	// Component Tool Routing (6 tools)
	// ==========================================================================

	private async executeComponentTool(tool: string, params: Record<string, unknown>): Promise<ToolResult<unknown>> {
		switch (tool) {
			case 'component_add':
				return this.canvasExecutor.addComponent({
					canvasId: params.canvasId as string | undefined,
					folderPath: params.folderPath as string,
					name: params.name as string | undefined,
					entryFile: params.entryFile as string | undefined,
					framework: params.framework as 'react' | 'vue' | 'svelte' | 'solid' | 'preact' | 'html' | undefined,
				});

			case 'component_add_batch':
				return this.canvasExecutor.addComponentBatch(params.components as Array<{
					canvasId?: string;
					folderPath: string;
					name?: string;
					entryFile?: string;
					framework?: 'react' | 'vue' | 'svelte' | 'solid' | 'preact' | 'html';
				}>);

			case 'component_remove':
				return this.canvasExecutor.removeComponent(
					params.componentId as string,
					params.deleteSourceCode as boolean | undefined
				);

			case 'component_get_info':
				return this.canvasExecutor.getComponentInfo(params.componentId as string);

			case 'component_list':
				return this.canvasExecutor.listComponents(params.canvasId as string);

			case 'component_rebuild':
				return this.canvasExecutor.rebuildComponent(params.componentId as string);

			default:
				return {
					success: false,
					error: `Unknown component tool: ${tool}`
				};
		}
	}

	// ==========================================================================
	// Project Tool Routing (3 tools)
	// ==========================================================================

	private async executeProjectTool(tool: string, params: Record<string, unknown>): Promise<ToolResult<unknown>> {
		switch (tool) {
			case 'project_get_active':
				return this.projectExecutor.getActiveProject();

			case 'project_start':
				return this.projectExecutor.startProject(
					params.projectPath as string,
					params.port as number | undefined
				);

			case 'project_stop':
				return this.projectExecutor.stopProject();

			default:
				return {
					success: false,
					error: `Unknown project tool: ${tool}`
				};
		}
	}
}
