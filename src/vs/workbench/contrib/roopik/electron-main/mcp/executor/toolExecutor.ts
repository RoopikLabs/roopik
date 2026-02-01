/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Tool Executor - Central Dispatcher
 *
 * Single entry point for all MCP tool calls.
 * Routes tool calls to the appropriate unified tool service.
 *
 * Architecture (Phase 3 Migration):
 * - Uses unified tool services from electron-main/tools/
 * - Services are single source of truth for all tool implementations
 * - This file is now a thin adapter that routes and delegates
 */

import type { BrowserViewService } from '../../projectMode/browserViewService.js';
import type { IRoopikStorageService } from '../../../common/storage/storageService.js';
import type { ICanvasService } from '../../../common/canvas/canvasService.js';
import type { ComponentService } from '../../component/componentService.js';
import type { DevServerService } from '../../projectMode/devServer/devServerService.js';
import type { ToolResult } from './types.js';
import { GUIDE_CONTENT } from '../toolSchemas.js';

// Import unified tool services
import { CDPMonitorService } from '../../tools/cdpMonitorService.js';
import { BrowserToolService } from '../../tools/browserToolService.js';
import { CanvasToolService } from '../../tools/canvasToolService.js';
import { ComponentToolService } from '../../tools/componentToolService.js';
import { ProjectToolService } from '../../tools/projectToolService.js';

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
	// Unified tool services (Phase 3 migration)
	private readonly cdpMonitorService: CDPMonitorService;
	private readonly browserToolService: BrowserToolService;
	private readonly canvasToolService: CanvasToolService;
	private readonly componentToolService: ComponentToolService;
	private readonly projectToolService: ProjectToolService;
	private readonly storageService: IRoopikStorageService;

	constructor(
		browserViewService: BrowserViewService,
		storageService: IRoopikStorageService,
		canvasService: ICanvasService,
		componentService: ComponentService,
		devServerService: DevServerService
	) {
		this.storageService = storageService;

		// Create CDPMonitorService first (used by BrowserToolService)
		this.cdpMonitorService = new CDPMonitorService(browserViewService);

		// Create unified tool services
		this.browserToolService = new BrowserToolService(browserViewService, this.cdpMonitorService);
		this.canvasToolService = new CanvasToolService(canvasService, componentService);
		this.componentToolService = new ComponentToolService(componentService, canvasService);
		this.projectToolService = new ProjectToolService(devServerService, storageService, browserViewService);
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

			if (tool.startsWith('roopik_')) {
				return this.executeRoopikTool(tool, params);
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
			// Canvas tools (4)
			'canvas_list',
			'canvas_get_active',
			'canvas_create',
			'canvas_validate_components',
			// Component tools (8)
			'component_add',
			'component_add_batch',
			'component_remove',
			'component_get_info',
			'component_list',
			'component_rebuild',
			// 'component_screenshot', // TODO: Disabled - race condition with webview init
			// Project tools (3)
			'project_get_active',
			'project_start',
			'project_stop',
			// Roopik tools (1)
			'roopik_get_guide',
		];
	}

	// ==========================================================================
	// Browser Tool Routing (14 tools) - Delegates to BrowserToolService
	// ==========================================================================

	private async executeBrowserTool(tool: string, params: Record<string, unknown>): Promise<ToolResult<unknown>> {
		switch (tool) {
			case 'browser_open':
				return this.browserToolService.open(params.url as string | undefined);

			case 'browser_close':
				return this.browserToolService.close();

			case 'browser_screenshot':
				return this.browserToolService.screenshot();

			case 'browser_navigate':
				return this.browserToolService.navigate(params.url as string);

			case 'browser_reload':
				return this.browserToolService.reload(params.ignoreCache as boolean | undefined);

			case 'browser_action_input':
				return this.browserToolService.actionInput({
					action: params.action as 'click' | 'right_click' | 'double_click' | 'hover' | 'drag' | 'type' | 'press' | 'scroll',
					coordinate: params.coordinate as string | undefined,
					text: params.text as string | undefined,
					key: params.key as string | undefined,
					modifiers: params.modifiers as string[] | undefined,
					deltaX: params.deltaX as number | undefined,
					deltaY: params.deltaY as number | undefined,
				});

			case 'browser_execute_script':
				return this.browserToolService.executeScript(params.script as string);

			case 'browser_inspect_element':
				return this.browserToolService.inspectElement(
					params.selector as string,
					params.includeInherited as boolean | undefined,
					this.storageService.getWorkspacePath()
				);

			case 'browser_get_errors':
				return this.browserToolService.getErrors(params.limit as number | undefined);

			case 'browser_get_console_logs':
				return this.browserToolService.getConsoleLogs({
					types: params.types as string[] | undefined,
					since: params.since as number | undefined,
					limit: params.limit as number | undefined,
					clear: params.clear as boolean | undefined,
				});

			case 'browser_get_performance':
				return this.browserToolService.getPerformance();

			case 'browser_get_state':
				return this.browserToolService.getState();

			case 'browser_set_viewport':
				// If no params or no width/height, pass undefined to clear viewport
				return this.browserToolService.setViewport(
					Object.keys(params).length === 0 ? undefined : {
						width: params.width as number | undefined,
						height: params.height as number | undefined,
						deviceScaleFactor: params.deviceScaleFactor as number | undefined,
						mobile: params.mobile as boolean | undefined,
					}
				);

			case 'browser_get_network_requests':
				return this.browserToolService.getNetworkRequests({
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
	// Canvas Tool Routing (4 tools) - Delegates to CanvasToolService
	// ==========================================================================

	private async executeCanvasTool(tool: string, params: Record<string, unknown>): Promise<ToolResult<unknown>> {
		switch (tool) {
			case 'canvas_list':
				return this.canvasToolService.list({
					nameFilter: params.nameFilter as string | undefined,
					sortBy: params.sortBy as 'name' | 'updatedAt' | 'createdAt' | 'componentCount' | undefined,
					sortDirection: params.sortDirection as 'asc' | 'desc' | undefined,
				});

			case 'canvas_get_active':
				return this.canvasToolService.getActive();

			case 'canvas_create':
				return this.canvasToolService.create(params.name as string);

			case 'canvas_open':
				return this.canvasToolService.open({
					canvasId: params.canvasId as string | undefined,
					name: params.name as string | undefined,
				});

			case 'canvas_validate_components':
				// Note: Despite the 'canvas_' prefix, this is implemented in ComponentToolService
				// because it operates on components within a canvas
				return this.componentToolService.validateComponents(params.canvasId as string | undefined);

			default:
				return {
					success: false,
					error: `Unknown canvas tool: ${tool}`
				};
		}
	}

	// ==========================================================================
	// Component Tool Routing (8 tools) - Delegates to ComponentToolService
	// ==========================================================================

	private async executeComponentTool(tool: string, params: Record<string, unknown>): Promise<ToolResult<unknown>> {
		switch (tool) {
			case 'component_add':
				return this.componentToolService.add({
					canvasId: params.canvasId as string | undefined,
					folderPath: params.folderPath as string,
					name: params.name as string | undefined,
					entryFile: params.entryFile as string | undefined,
					framework: params.framework as 'react' | 'vue' | 'svelte' | 'solid' | 'preact' | 'html' | undefined,
				});

			case 'component_add_batch':
				return this.componentToolService.addBatch(params.components as Array<{
					canvasId?: string;
					folderPath: string;
					name?: string;
					entryFile?: string;
					framework?: 'react' | 'vue' | 'svelte' | 'solid' | 'preact' | 'html';
				}>);

			case 'component_remove':
				return this.componentToolService.remove(
					params.componentId as string,
					params.deleteSourceCode as boolean | undefined
				);

			case 'component_get_info':
				return this.componentToolService.getInfo(params.componentId as string);

			case 'component_list':
				return this.componentToolService.list(params.canvasId as string);

			case 'component_rebuild':
				return this.componentToolService.rebuild(params.componentId as string);

			// TODO: Disabled - race condition with webview initialization
			// case 'component_screenshot':
			// 	return this.componentToolService.screenshot(
			// 		params.componentId as string,
			// 		params.canvasId as string
			// 	);

			default:
				return {
					success: false,
					error: `Unknown component tool: ${tool}`
				};
		}
	}

	// ==========================================================================
	// Project Tool Routing (3 tools) - Delegates to ProjectToolService
	// ==========================================================================

	private async executeProjectTool(tool: string, params: Record<string, unknown>): Promise<ToolResult<unknown>> {
		switch (tool) {
			case 'project_get_active':
				return this.projectToolService.getActive();

			case 'project_start':
				return this.projectToolService.start(
					params.projectPath as string,
					params.port as number | undefined
				);

			case 'project_stop':
				return this.projectToolService.stop();

			default:
				return {
					success: false,
					error: `Unknown project tool: ${tool}`
				};
		}
	}

	// ==========================================================================
	// Roopik Tool Routing (1 tool) - Guide/Instructions
	// ==========================================================================

	private executeRoopikTool(tool: string, params: Record<string, unknown>): ToolResult<unknown> {
		switch (tool) {
			case 'roopik_get_guide': {
				const topic = params.topic as string;
				if (!topic) {
					return {
						success: false,
						error: 'Missing required parameter: topic'
					};
				}

				const content = GUIDE_CONTENT[topic];
				if (!content) {
					return {
						success: false,
						error: `Unknown guide topic: ${topic}. Available: ${Object.keys(GUIDE_CONTENT).join(', ')}`
					};
				}

				return {
					success: true,
					data: { guide: content }
				};
			}

			default:
				return {
					success: false,
					error: `Unknown roopik tool: ${tool}`
				};
		}
	}
}
