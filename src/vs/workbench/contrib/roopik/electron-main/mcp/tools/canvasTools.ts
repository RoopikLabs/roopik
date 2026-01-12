/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Canvas & Component Tools
 *
 * MCP tools for Canvas and Component operations in Canvas Mode.
 * - Canvas tools: list, get active, create
 * - Component tools: add, batch add, remove, get info, list, rebuild
 *
 * These tools let AI agents manage canvases and components for live preview.
 */

import type { ICanvasService } from '../../../common/canvas/canvasService.js';
import type { ComponentService } from '../../component/componentService.js';

/**
 * Register all canvas and component MCP tools
 *
 * @param server - McpServer instance (dynamically imported)
 * @param z - Zod validation library (dynamically imported)
 * @param canvasService - Canvas service instance
 * @param componentService - Component service instance
 */
export function registerCanvasTools(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	server: any,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	z: any,
	canvasService: ICanvasService,
	componentService: ComponentService
): void {

	// ============================================================================
	// CANVAS TOOLS (3)
	// ============================================================================

	// --------------------------------------------------------------
	// TOOL: List All Canvases
	// --------------------------------------------------------------
	server.tool(
		'canvas_list',
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
		'canvas_get_active',
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
		'canvas_create',
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

	// ============================================================================
	// COMPONENT TOOLS (6)
	// ============================================================================

	// --------------------------------------------------------------
	// TOOL: Add Component (Import from local folder)
	// --------------------------------------------------------------
	server.tool(
		'component_add',
		'[Roopik IDE] Add a component to the visual Canvas for live preview. The component will be bundled and displayed in the IDE canvas where users can see it rendered. Auto-detects entry file and framework from the folder.',
		{
			canvasId: z.string().optional().describe('Canvas ID to add component to (optional, uses active canvas if not provided)'),
			folderPath: z.string().describe('Absolute path to component folder (e.g., C:\\project\\src\\Button) or file path (e.g., C:\\project\\src\\Button\\Button.tsx)'),
			name: z.string().optional().describe('Component name (optional, auto-detected from folder/file if not provided)'),
			entryFile: z.string().optional().describe('Entry file name relative to folder (optional, auto-detected if not provided)'),
			framework: z.enum(['react', 'vue', 'svelte', 'solid', 'preact', 'html']).optional().describe('Framework type (optional, auto-detected if not provided)')
		},
		async ({ canvasId, folderPath, name, entryFile, framework }: {
			canvasId?: string;
			folderPath: string;
			name?: string;
			entryFile?: string;
			framework?: 'react' | 'vue' | 'svelte' | 'solid' | 'preact' | 'html';
		}) => {
			try {
				const component = await componentService.addComponent({
					folderPath,
					canvasId,
					componentName: name,
					entryFile,
					framework,
					origin: 'ai'
				});

				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: true,
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
							error: errorMessage,
							folderPath
						})
					}],
					isError: true
				};
			}
		}
	);

	// --------------------------------------------------------------
	// TOOL: Add Multiple Components (Batch)
	// --------------------------------------------------------------
	server.tool(
		'component_add_batch',
		'[Roopik IDE] Batch add multiple components to the visual Canvas. Efficient for adding component variants or multiple components at once. All components will be bundled and displayed in the IDE canvas for live preview.',
		{
			components: z.array(z.object({
				canvasId: z.string().optional().describe('Canvas ID (optional, uses active canvas)'),
				folderPath: z.string().describe('Absolute path to component folder or file'),
				name: z.string().optional().describe('Component name (optional, auto-detected)'),
				entryFile: z.string().optional().describe('Entry file (optional, auto-detected)'),
				framework: z.enum(['react', 'vue', 'svelte', 'solid', 'preact', 'html']).optional().describe('Framework (optional, auto-detected)')
			})).describe('Array of component definitions to add')
		},
		async ({ components }: {
			components: Array<{
				canvasId?: string;
				folderPath: string;
				name?: string;
				entryFile?: string;
				framework?: 'react' | 'vue' | 'svelte' | 'solid' | 'preact' | 'html';
			}>;
		}) => {
			try {
				const requests = components.map(c => ({
					folderPath: c.folderPath,
					canvasId: c.canvasId,
					componentName: c.name,
					entryFile: c.entryFile,
					framework: c.framework,
					origin: 'ai' as const
				}));

				const created = await componentService.addComponents(requests);

				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: true,
							count: created.length,
							components: created.map(c => ({
								id: c.id,
								canvasId: c.canvasId,
								componentName: c.componentName,
								folderPath: c.folderPath,
								framework: c.framework,
								buildState: c.buildState
							}))
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
	// TOOL: Delete Component
	// --------------------------------------------------------------
	server.tool(
		'component_remove',
		'[Roopik IDE] Remove component from canvas. Set deleteSourceCode=true to automatically delete source files - do NOT manually delete files with terminal commands.',
		{
			componentId: z.string().describe('Component ID to delete'),
			deleteSourceCode: z.boolean().optional().describe('Set to true to delete source code from disk (default: false). When true, both UI removal and file deletion are handled automatically.')
		},
		async ({ componentId, deleteSourceCode }: { componentId: string; deleteSourceCode?: boolean }) => {
			try {
				await componentService.deleteComponent(componentId, deleteSourceCode);

				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: true,
							componentId,
							deletedSourceCode: deleteSourceCode ?? false
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
							error: errorMessage,
							componentId
						})
					}],
					isError: true
				};
			}
		}
	);

	// --------------------------------------------------------------
	// TOOL: Get Component Info
	// --------------------------------------------------------------
	server.tool(
		'component_get_info',
		'[Roopik IDE] Get full component status from the Canvas: build state (building/ready/error), error details, CDN URLs for preview. Use this to check if a component built successfully or to get error messages for debugging.',
		{
			componentId: z.string().describe('Component ID to get info for')
		},
		async ({ componentId }: { componentId: string }) => {
			try {
				// Use the new unified getComponentInfo() which includes everything
				const info = await componentService.getComponentInfo(componentId);

				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: true,
							component: info
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
							error: errorMessage,
							componentId
						})
					}],
					isError: true
				};
			}
		}
	);

	// --------------------------------------------------------------
	// TOOL: List Components in Canvas
	// --------------------------------------------------------------
	server.tool(
		'component_list',
		'[Roopik IDE] List all components currently displayed on a Canvas. Returns component IDs, names, frameworks, and build states. Use this to see what components are available for preview in the IDE.',
		{
			canvasId: z.string().describe('Canvas ID to list components from')
		},
		async ({ canvasId }: { canvasId: string }) => {
			try {
				const components = componentService.getComponentsForCanvas(canvasId);

				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: true,
							canvasId,
							components: components.map(c => ({
								id: c.id,
								componentName: c.componentName,
								framework: c.framework,
								entryFile: c.entryFile,
								buildState: c.buildState
							}))
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
							error: errorMessage,
							canvasId
						})
					}],
					isError: true
				};
			}
		}
	);

	// --------------------------------------------------------------
	// TOOL: Rebuild Component
	// --------------------------------------------------------------
	server.tool(
		'component_rebuild',
		'[Roopik IDE] Trigger a rebuild of a component on the Canvas. Use this after fixing code errors to refresh the live preview. Check component_get_info afterward to verify the build succeeded.',
		{
			componentId: z.string().describe('Component ID to rebuild')
		},
		async ({ componentId }: { componentId: string }) => {
			try {
				await componentService.rebuildComponent(componentId);

				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: true,
							componentId,
							message: 'Rebuild queued - use getComponentInfo to check build state'
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
							error: errorMessage,
							componentId
						})
					}],
					isError: true
				};
			}
		}
	);

	// console.log('[MCP] Registered 9 canvas/component tools: canvas_list, canvas_get_active, canvas_create, component_add, component_add_batch, component_remove, component_get_info, component_list, component_rebuild');
}
