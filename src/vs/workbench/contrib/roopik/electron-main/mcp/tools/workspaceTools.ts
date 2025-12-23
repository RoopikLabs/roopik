/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Workspace Tools (Roopik-specific Context)
 *
 * MCP tools that provide deep Roopik IDE context:
 * - Canvas operations (list, get active, create)
 * - Workspace paths and structure
 * - Component counts per canvas
 *
 * These tools give AI agents Roopik-specific context that generic file tools can't provide.
 * AI agents already have basic file operations through their standard toolset.
 */

import type { ICanvasService } from '../../../common/canvas/canvasService.js';

/**
 * Register all workspace-related MCP tools
 *
 * Essential tools only - agents have file access for everything else.
 *
 * @param server - McpServer instance (dynamically imported)
 * @param z - Zod validation library (dynamically imported)
 * @param canvasService - Canvas service instance
 */
export function registerWorkspaceTools(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	server: any,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	z: any,
	canvasService: ICanvasService
): void {

	// --------------------------------------------------------------
	// TOOL: List All Canvases
	// --------------------------------------------------------------
	server.tool(
		'rpk_listCanvases',
		'[Roopik IDE] List all Canvases in the workspace. Canvases are visual workspaces in the IDE where components are displayed for live preview. Returns canvas names, component counts, and timestamps.',
		{
			nameFilter: z.string().optional().describe('Optional filter to search canvas names'),
			sortBy: z.enum(['name', 'updatedAt', 'createdAt', 'componentCount']).optional().describe('Sort field (default: updatedAt)'),
			sortDirection: z.enum(['asc', 'desc']).optional().describe('Sort direction (default: desc)')
		},
		async ({ nameFilter, sortBy, sortDirection }: { nameFilter?: string; sortBy?: 'name' | 'updatedAt' | 'createdAt' | 'componentCount'; sortDirection?: 'asc' | 'desc' }) => {
			try {
				const canvases = await canvasService.listCanvasesAsync({
					nameFilter,
					sortBy,
					sortDirection
				});

				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: true,
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
						})
					}]
				};
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : 'Unknown error';
				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: false,
							isError: true,
							error: errorMessage
						})
					}],
					isError: true
				};
			}
		}
	);

	// --------------------------------------------------------------
	// TOOL: Get Active Canvas
	// --------------------------------------------------------------
	server.tool(
		'rpk_getActiveCanvas',
		'[Roopik IDE] Get the Canvas currently open/focused in the IDE. Use this to know which Canvas the user is viewing, so you can add components to it. Returns null if no Canvas is open.',
		{},
		async () => {
			try {
				const focusedCanvasId = await canvasService.getFocusedCanvasIdAsync();

				if (!focusedCanvasId) {
					return {
						content: [{
							type: 'text' as const,
							text: JSON.stringify({
								success: true,
								activeCanvas: null,
								message: 'No canvas is currently focused'
							})
						}]
					};
				}

				const canvas = await canvasService.getCanvasAsync(focusedCanvasId);
				if (!canvas) {
					return {
						content: [{
							type: 'text' as const,
							text: JSON.stringify({
								success: true,
								activeCanvas: null,
								message: 'Focused canvas not found'
							})
						}]
					};
				}

				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: true,
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
						})
					}]
				};
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : 'Unknown error';
				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: false,
							isError: true,
							error: errorMessage
						})
					}],
					isError: true
				};
			}
		}
	);

	// --------------------------------------------------------------
	// TOOL: Create Canvas
	// --------------------------------------------------------------
	server.tool(
		'rpk_createCanvas',
		'[Roopik IDE] Create a new Canvas in the IDE for organizing and previewing components. If a Canvas with the same name exists, returns the existing one. Canvases appear as tabs in the IDE where components are visually rendered.',
		{
			name: z.string().describe('Canvas display name (e.g., "Login Components")')
		},
		async ({ name }: { name: string }) => {
			try {
				const result = await canvasService.createCanvas(name);

				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: true,
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
						})
					}]
				};
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : 'Unknown error';
				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: false,
							isError: true,
							error: errorMessage
						})
					}],
					isError: true
				};
			}
		}
	);

	console.log('[MCP] Registered 3 workspace tools: rpk_listCanvases, rpk_getActiveCanvas, rpk_createCanvas');
}
