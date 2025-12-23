/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Canvas Mode Component Tools
 *
 * MCP tools for component CRUD operations in Canvas Mode.
 * These tools let AI agents create, modify, and manage React/Vue/Svelte components.
 */

import type { ComponentService } from '../../component/componentService.js';

/**
 * Register all canvas/component-related MCP tools
 *
 * @param server - McpServer instance (dynamically imported)
 * @param z - Zod validation library (dynamically imported)
 * @param componentService - Component service instance
 */
export function registerCanvasTools(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	server: any,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	z: any,
	componentService: ComponentService
): void {


	// --------------------------------------------------------------
	// TOOL: Add Component (Import from local folder)
	// --------------------------------------------------------------
	server.tool(
		'roopik_createComponent',
		'Add/import a component to Canvas Mode from a local folder. The folder must contain component source files. Auto-detects entry file and framework. Can pass either file path or folder path.',
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
	// TOOL: Delete Component
	// --------------------------------------------------------------
	server.tool(
		'roopik_deleteComponent',
		'Delete a component from Canvas Mode. This removes all source files and cached builds.',
		{
			componentId: z.string().describe('Component ID to delete')
		},
		async ({ componentId }: { componentId: string }) => {
			try {
				await componentService.deleteComponent(componentId);

				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: true,
							componentId
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
		'roopik_getComponentInfo',
		'Get comprehensive information about a component: metadata, build status, errors, cache validity, CDN URLs. This is the primary API for understanding component state.',
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
		'roopik_listComponentsInCanvas',
		'List all components in a canvas. Returns basic info for each component.',
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
		'roopik_rebuildComponent',
		'Trigger a rebuild of a component. Useful when dependencies change or build fails.',
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

	console.log('[MCP] Registered 5 canvas tools (createComponent, deleteComponent, getComponentInfo, listComponentsInCanvas, rebuildComponent)');
}
