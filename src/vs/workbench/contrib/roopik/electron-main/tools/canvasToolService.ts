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
import type {
	ToolResult,
	CanvasListResult,
	CanvasInfo,
} from '../mcp/executor/types.js';

// ============================================================================
// Canvas Tool Service
// ============================================================================

export class CanvasToolService {
	constructor(
		private readonly canvasService: ICanvasService
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
}
