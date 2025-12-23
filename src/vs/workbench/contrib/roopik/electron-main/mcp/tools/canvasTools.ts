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
		'rpk_addComponent',
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
		'rpk_addComponents',
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
		'rpk_removeComponent',
		'[Roopik IDE] Remove a component from the visual Canvas. The component will no longer be displayed in the IDE canvas. This cleans up cached builds but does not delete source files.',
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
		'rpk_getComponentInfo',
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
		'rpk_listComponents',
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
		'rpk_rebuildComponent',
		'[Roopik IDE] Trigger a rebuild of a component on the Canvas. Use this after fixing code errors to refresh the live preview. Check rpk_getComponentInfo afterward to verify the build succeeded.',
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

	console.log('[MCP] Registered 6 canvas tools: rpk_addComponent, rpk_addComponents, rpk_removeComponent, rpk_getComponentInfo, rpk_listComponents, rpk_rebuildComponent');
}
