/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Canvas & Component Executor
 *
 * Unified execution logic for canvas and component tools.
 * Called by both HTTP MCP transport and WebSocket transport.
 */

import { resolve, normalize } from '../../../../../../base/common/path.js';
import type { ICanvasService } from '../../../common/canvas/canvasService.js';
import type { ComponentService } from '../../component/componentService.js';
import type { ToolResult, CanvasListResult, ComponentListResult } from './types.js';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Resolve a path that may be relative or absolute.
 */
function resolvePath(inputPath: string, workspacePath: string): string {
	let sanitizedInput = inputPath;
	if (process.platform !== 'win32') {
		sanitizedInput = inputPath.replace(/\\/g, '/');
	}
	const normalizedInput = normalize(sanitizedInput);
	return resolve(workspacePath, normalizedInput);
}

// ============================================================================
// Canvas Executor Class
// ============================================================================

export class CanvasExecutor {
	constructor(
		private readonly canvasService: ICanvasService,
		private readonly componentService: ComponentService
	) {}

	// ==========================================================================
	// Canvas List
	// ==========================================================================

	async listCanvases(params?: {
		nameFilter?: string;
		sortBy?: 'name' | 'updatedAt' | 'createdAt' | 'componentCount';
		sortDirection?: 'asc' | 'desc';
	}): Promise<ToolResult<CanvasListResult>> {
		try {
			const canvases = await this.canvasService.listCanvasesAsync(params);

			return {
				success: true,
				data: {
					canvases: canvases.map(c => ({
						id: c.id,
						name: c.name,
						componentCount: c.componentCount,
						description: c.description
					})),
					count: canvases.length
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
	// Canvas Get Active
	// ==========================================================================

	async getActiveCanvas(): Promise<ToolResult<{ activeCanvas: unknown | null; message?: string }>> {
		try {
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
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	// ==========================================================================
	// Canvas Create
	// ==========================================================================

	async createCanvas(name: string): Promise<ToolResult<{ canvasId: string; isNew: boolean; canvas: unknown }>> {
		try {
			const result = await this.canvasService.createCanvas(name);

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
	// Component Add
	// ==========================================================================

	async addComponent(params: {
		canvasId?: string;
		folderPath: string;
		name?: string;
		entryFile?: string;
		framework?: 'react' | 'vue' | 'svelte' | 'solid' | 'preact' | 'html';
	}): Promise<ToolResult<{ component: unknown }>> {
		try {
			const workspacePath = this.canvasService.getWorkspacePath();
			if (!workspacePath) {
				return {
					success: false,
					error: 'No workspace is open. Please open a folder/workspace first.'
				};
			}

			const resolvedPath = resolvePath(params.folderPath, workspacePath);

			const component = await this.componentService.addComponent({
				folderPath: resolvedPath,
				canvasId: params.canvasId,
				componentName: params.name,
				entryFile: params.entryFile,
				framework: params.framework,
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
						componentName: component.componentName,
						origin: component.origin,
						createdAt: component.createdAt,
						updatedAt: component.updatedAt
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
	// Component Add Batch
	// ==========================================================================

	async addComponentBatch(components: Array<{
		canvasId?: string;
		folderPath: string;
		name?: string;
		entryFile?: string;
		framework?: 'react' | 'vue' | 'svelte' | 'solid' | 'preact' | 'html';
	}>): Promise<ToolResult<{ count: number; components: unknown[] }>> {
		try {
			const workspacePath = this.canvasService.getWorkspacePath();

			const requests = components.map(c => ({
				folderPath: resolvePath(c.folderPath, workspacePath),
				canvasId: c.canvasId,
				componentName: c.name,
				entryFile: c.entryFile,
				framework: c.framework,
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
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	// ==========================================================================
	// Component Remove
	// ==========================================================================

	async removeComponent(componentId: string, deleteSourceCode?: boolean): Promise<ToolResult<{ componentId: string; deletedSourceCode: boolean }>> {
		try {
			await this.componentService.deleteComponent(componentId, deleteSourceCode);

			return {
				success: true,
				data: {
					componentId,
					deletedSourceCode: deleteSourceCode ?? false
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
	// Component Get Info
	// ==========================================================================

	async getComponentInfo(componentId: string): Promise<ToolResult<{ component: unknown }>> {
		try {
			const info = await this.componentService.getComponentInfo(componentId);

			return {
				success: true,
				data: {
					component: info
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
	// Component List
	// ==========================================================================

	async listComponents(canvasId: string): Promise<ToolResult<ComponentListResult>> {
		try {
			const components = this.componentService.getComponentsForCanvas(canvasId);

			return {
				success: true,
				data: {
					components: components.map(c => ({
						id: c.id,
						name: c.componentName,
						path: c.folderPath,
						canvasId: c.canvasId,
						// buildState can be string or { status: string, error: string }
						status: (typeof c.buildState === 'string' ? c.buildState : c.buildState.status) as 'pending' | 'building' | 'ready' | 'error'
					})),
					count: components.length
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
	// Component Rebuild
	// ==========================================================================

	async rebuildComponent(componentId: string): Promise<ToolResult<{ componentId: string; message: string }>> {
		try {
			await this.componentService.rebuildComponent(componentId);

			return {
				success: true,
				data: {
					componentId,
					message: 'Rebuild queued - use getComponentInfo to check build state'
				}
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}
}
