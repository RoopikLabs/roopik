/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Canvas Tool Service
 *
 * Unified implementation of canvas tools.
 * Single source of truth - used by both WebSocket MCP and Native IPC.
 */

import type { ICanvasService } from '../../common/canvas/canvasService.js';
import type { ComponentService } from '../component/componentService.js';
import type {
	ToolResult,
	CanvasListResult,
	CanvasInfo,
	ComponentInfo,
} from '../mcp/executor/types.js';

// ============================================================================
// Canvas Tool Service
// ============================================================================

export class CanvasToolService {
	constructor(
		private readonly canvasService: ICanvasService,
		private readonly componentService?: ComponentService
	) {}

	// ==========================================================================
	// List Canvases
	// ==========================================================================

	async list(options?: {
		nameFilter?: string;
		sortBy?: 'name' | 'updatedAt' | 'createdAt' | 'componentCount';
		sortDirection?: 'asc' | 'desc';
	}): Promise<ToolResult<CanvasListResult>> {
		try {
			let canvases = await this.canvasService.listCanvasesAsync();

			// Filter by name
			if (options?.nameFilter) {
				const filter = options.nameFilter.toLowerCase();
				canvases = canvases.filter(c => c.name.toLowerCase().includes(filter));
			}

			// Sort
			if (options?.sortBy) {
				const direction = options.sortDirection === 'desc' ? -1 : 1;
				canvases.sort((a, b) => {
					switch (options.sortBy) {
						case 'name':
							return direction * a.name.localeCompare(b.name);
						case 'updatedAt':
							return direction * ((a.updatedAt || 0) - (b.updatedAt || 0));
						case 'createdAt':
							return direction * ((a.createdAt || 0) - (b.createdAt || 0));
						case 'componentCount':
							return direction * ((a.componentCount || 0) - (b.componentCount || 0));
						default:
							return 0;
					}
				});
			}

			const result: CanvasInfo[] = canvases.map(c => ({
				id: c.id,
				name: c.name,
				description: c.description,
				componentCount: c.componentCount || 0,
				createdAt: c.createdAt,
				updatedAt: c.updatedAt
			}));

			return {
				success: true,
				data: {
					canvases: result,
					count: result.length
				}
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Failed to list canvases'
			};
		}
	}

	// ==========================================================================
	// Get Active Canvas
	// ==========================================================================

	async getActive(): Promise<ToolResult<CanvasInfo | null>> {
		try {
			// Get the focused canvas ID first
			const canvasId = await this.canvasService.getFocusedCanvasIdAsync();

			if (!canvasId) {
				return {
					success: true,
					data: null
				};
			}

			// Then get the full canvas data
			const canvas = await this.canvasService.getCanvasAsync(canvasId);

			if (!canvas) {
				return {
					success: true,
					data: null
				};
			}

			return {
				success: true,
				data: {
					id: canvas.id,
					name: canvas.name,
					description: canvas.description,
					componentCount: canvas.componentCount || 0,
					createdAt: canvas.createdAt,
					updatedAt: canvas.updatedAt
				}
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Failed to get active canvas'
			};
		}
	}

	// ==========================================================================
	// Create Canvas
	// ==========================================================================

	async create(name: string): Promise<ToolResult<CanvasInfo>> {
		try {
			// createCanvas handles duplicates - returns existing if name matches
			const result = await this.canvasService.createCanvas(name);

			// If canvas already existed, get its data
			if (!result.isNew && result.canvas) {
				return {
					success: true,
					data: {
						id: result.canvas.id,
						name: result.canvas.name,
						description: result.canvas.description,
						componentCount: result.canvas.componentCount || 0,
						createdAt: result.canvas.createdAt,
						updatedAt: result.canvas.updatedAt
					}
				};
			}

			// New canvas created - get its data
			const canvas = await this.canvasService.getCanvasAsync(result.canvasId);

			return {
				success: true,
				data: {
					id: result.canvasId,
					name: canvas?.name || name,
					description: canvas?.description,
					componentCount: 0,
					createdAt: canvas?.createdAt,
					updatedAt: canvas?.updatedAt
				}
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Failed to create canvas'
			};
		}
	}

	// ==========================================================================
	// Open Canvas
	// ==========================================================================

	async open(params: { canvasId?: string; name?: string }): Promise<ToolResult<CanvasInfo & { components?: ComponentInfo[] }>> {
		try {
			// Need either canvasId or name
			if (!params.canvasId && !params.name) {
				return {
					success: false,
					error: 'Must provide either canvasId or name'
				};
			}

			let canvas;

			// If canvasId provided, look up by ID
			if (params.canvasId) {
				canvas = await this.canvasService.getCanvasAsync(params.canvasId);
				if (!canvas) {
					return {
						success: false,
						error: `Canvas not found: ${params.canvasId}`
					};
				}
			}
			// If name provided, look up by name in the list
			else if (params.name) {
				const canvases = await this.canvasService.listCanvasesAsync();
				canvas = canvases.find(c => c.name.toLowerCase() === params.name!.toLowerCase());
				if (!canvas) {
					return {
						success: false,
						error: `Canvas not found: ${params.name}`
					};
				}
			}

			// Trigger the canvas to open by calling createCanvas with the existing name
			// This will fire the onCanvasCreated event which opens the UI panel
			const result = await this.canvasService.createCanvas(canvas!.name);

			// Get components list if componentService is available
			let components: ComponentInfo[] | undefined;
			if (this.componentService) {
				const componentsInCanvas = this.componentService.getComponentsForCanvas(result.canvasId);
				components = componentsInCanvas.map(c => {
					// Runtime error takes precedence over build status
					let status: 'pending' | 'building' | 'ready' | 'error';
					if (c.runtimeError) {
						status = 'error';  // Component crashed at runtime
					} else {
						status = c.buildState.status;
					}

					return {
						id: c.id,
						name: c.componentName,
						path: c.folderPath,
						canvasId: c.canvasId,
						status
					};
				});
			}

			return {
				success: true,
				data: {
					id: result.canvasId,
					name: result.canvas.name,
					description: result.canvas.description,
					componentCount: result.canvas.componentCount || 0,
					createdAt: result.canvas.createdAt,
					updatedAt: result.canvas.updatedAt,
					components
				}
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Failed to open canvas'
			};
		}
	}
}
