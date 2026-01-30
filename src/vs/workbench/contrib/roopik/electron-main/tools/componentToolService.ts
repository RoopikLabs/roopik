/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Component Tool Service
 *
 * Unified implementation of component tools.
 * Single source of truth - used by both WebSocket MCP and Native IPC.
 */

import type { ComponentService } from '../component/componentService.js';
import type { ICanvasService } from '../../common/canvas/canvasService.js';
import type {
	ToolResult,
	ComponentListResult,
	ComponentInfo,
} from '../mcp/executor/types.js';

// ============================================================================
// Component Add Params
// ============================================================================

export interface ComponentAddParams {
	canvasId?: string;
	folderPath: string;
	name?: string;
	entryFile?: string;
	framework?: 'react' | 'vue' | 'svelte' | 'solid' | 'preact' | 'html';
}

export interface ComponentAddResult {
	id: string;
	name: string;
	path: string;
	canvasId: string;
	framework?: string;
	message: string;
}

export interface ComponentRemoveResult {
	removed: boolean;
	message: string;
}

export interface ComponentRebuildResult {
	rebuilding: boolean;
	message: string;
}

// ============================================================================
// Component Tool Service
// ============================================================================

export class ComponentToolService {
	constructor(
		private readonly componentService: ComponentService,
		private readonly canvasService: ICanvasService
	) {}

	// ==========================================================================
	// Add Component
	// ==========================================================================

	async add(params: ComponentAddParams): Promise<ToolResult<ComponentAddResult>> {
		try {
			// Get canvas ID (use active if not provided)
			let canvasId = params.canvasId;
			if (!canvasId) {
				const activeCanvasId = await this.canvasService.getFocusedCanvasIdAsync();
				if (!activeCanvasId) {
					return {
						success: false,
						error: 'No active canvas. Create a canvas first with canvas_create.'
					};
				}
				canvasId = activeCanvasId;
			}

			// Add component
			const component = await this.componentService.addComponent({
				canvasId,
				folderPath: params.folderPath,
				componentName: params.name,
				entryFile: params.entryFile,
				framework: params.framework
			});

			return {
				success: true,
				data: {
					id: component.id,
					name: component.componentName || params.name || 'Component',
					path: params.folderPath,
					canvasId,
					framework: component.framework,
					message: `Component added to canvas`
				}
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Failed to add component'
			};
		}
	}

	// ==========================================================================
	// Add Multiple Components
	// ==========================================================================

	async addBatch(components: ComponentAddParams[]): Promise<ToolResult<ComponentAddResult[]>> {
		try {
			const results: ComponentAddResult[] = [];

			for (const params of components) {
				const result = await this.add(params);
				if (result.success && result.data) {
					results.push(result.data);
				}
			}

			return {
				success: true,
				data: results
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Failed to add components'
			};
		}
	}

	// ==========================================================================
	// Remove Component
	// ==========================================================================

	async remove(componentId: string, deleteSourceCode?: boolean): Promise<ToolResult<ComponentRemoveResult>> {
		try {
			await this.componentService.deleteComponent(componentId, deleteSourceCode);

			return {
				success: true,
				data: {
					removed: true,
					message: `Component removed${deleteSourceCode ? ' (source deleted)' : ''}`
				}
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Failed to remove component'
			};
		}
	}

	// ==========================================================================
	// Get Component Info
	// ==========================================================================

	async getInfo(componentId: string): Promise<ToolResult<ComponentInfo & { buildStatus?: string; buildErrors?: string[] }>> {
		try {
			// getComponent is sync - returns Component | undefined
			const component = this.componentService.getComponent(componentId);

			if (!component) {
				return {
					success: false,
					error: `Component not found: ${componentId}`
				};
			}

			// Get comprehensive info via async getComponentInfo for build state
			const componentInfo = await this.componentService.getComponentInfo(componentId);

			// Map buildStatus from ComponentInfo to the status field expected by MCP
			// ComponentInfo.buildStatus is 'building' | 'ready' | 'error', MCP adds 'pending'
			const status = componentInfo.buildStatus === 'building' ? 'building' :
				componentInfo.buildStatus === 'ready' ? 'ready' :
				componentInfo.buildStatus === 'error' ? 'error' : 'pending';

			return {
				success: true,
				data: {
					id: component.id,
					name: component.componentName,
					path: component.folderPath,
					canvasId: component.canvasId,
					status,
					buildStatus: componentInfo.buildStatus,
					buildErrors: componentInfo.buildErrorInfo?.message ? [componentInfo.buildErrorInfo.message] : undefined
				}
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Failed to get component info'
			};
		}
	}

	// ==========================================================================
	// List Components
	// ==========================================================================

	async list(canvasId: string): Promise<ToolResult<ComponentListResult>> {
		try {
			// getComponentsForCanvas is sync
			const components = this.componentService.getComponentsForCanvas(canvasId);

			const result: ComponentInfo[] = components.map(c => ({
				id: c.id,
				name: c.componentName,
				path: c.folderPath,
				canvasId: c.canvasId,
				status: c.buildState.status
			}));

			return {
				success: true,
				data: {
					components: result,
					count: result.length
				}
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Failed to list components'
			};
		}
	}

	// ==========================================================================
	// Rebuild Component
	// ==========================================================================

	async rebuild(componentId: string): Promise<ToolResult<ComponentRebuildResult>> {
		try {
			await this.componentService.rebuildComponent(componentId);

			return {
				success: true,
				data: {
					rebuilding: true,
					message: 'Component rebuild triggered'
				}
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Failed to rebuild component'
			};
		}
	}
}
