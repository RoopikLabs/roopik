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
	// TOOL: Create Component
	// --------------------------------------------------------------
	server.tool(
		'roopik_createComponent',
		'Create a new component in Canvas Mode. Supports React, Vue, Svelte components from AI generation, local files, GitHub, or Figma. Note: Position is managed separately by the canvas UI.',
		{
			canvasId: z.string().describe('Canvas ID to create component in'),
			name: z.string().describe('Component name (e.g., "Button", "Card")'),
			source: z.enum(['ai-agent', 'local-file', 'drag-drop', 'github', 'figma', 'manual']).describe('Source type: ai-agent (AI generated), local-file (from project), github (from GitHub), figma (from Figma design), drag-drop (file drop), manual (manual creation)'),
			sourceData: z.any().describe('Source-specific data matching the source type. Structure varies by source.')
		},
		async ({ canvasId, name, source, sourceData }: {
			canvasId: string;
			name: string;
			source: 'ai-agent' | 'local-file' | 'drag-drop' | 'github' | 'figma' | 'manual';
			sourceData: any;
		}) => {
			try {
				const component = await componentService.createComponent({
					canvasId,
					name,
					source,
					sourceData
				});

				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: true,
							component: {
								id: component.id,
								name: component.name,
								canvasId: component.canvasId,
								framework: component.framework,
								entryFile: component.entryFile,
								files: component.files,
								buildState: component.buildState
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
							canvasId,
							name
						})
					}],
					isError: true
				};
			}
		}
	);

	// --------------------------------------------------------------
	// TOOL: Get Component Source
	// --------------------------------------------------------------
	server.tool(
		'roopik_getComponentSource',
		'Get the source code files for a component. Returns all files as a record of filename -> content.',
		{
			componentId: z.string().describe('Component ID to get source for')
		},
		async ({ componentId }: { componentId: string }) => {
			try {
				const files = await componentService.getComponentSource(componentId);

				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: true,
							componentId,
							files
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
	// TOOL: Update Component Source
	// --------------------------------------------------------------
	server.tool(
		'roopik_updateComponentSource',
		'Update the source code files for a component. Provide files as a record of filename -> new content. This triggers a rebuild.',
		{
			componentId: z.string().describe('Component ID to update'),
			files: z.record(z.string(), z.string()).describe('Files to update: { "Component.tsx": "...", "styles.css": "..." }')
		},
		async ({ componentId, files }: { componentId: string; files: Record<string, string> }) => {
			try {
				await componentService.updateComponentSource(componentId, files);

				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: true,
							componentId,
							updatedFiles: Object.keys(files)
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
		'Get detailed information about a component including metadata, build state, and file list.',
		{
			componentId: z.string().describe('Component ID to get info for')
		},
		async ({ componentId }: { componentId: string }) => {
			try {
				const component = componentService.getComponent(componentId);

				if (!component) {
					return {
						content: [{
							type: 'text' as const,
							text: JSON.stringify({
								success: false,
								isError: true,
								error: 'Component not found',
								componentId
							})
						}],
						isError: true
					};
				}

				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: true,
							component: {
								id: component.id,
								name: component.name,
								canvasId: component.canvasId,
								framework: component.framework,
								folderPath: component.folderPath,
								entryFile: component.entryFile,
								buildState: component.buildState,
								contentHash: component.contentHash,
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
								name: c.name,
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

	console.log('[MCP] Registered 7 canvas tools (createComponent, getComponentSource, updateComponentSource, deleteComponent, getComponentInfo, listComponentsInCanvas, rebuildComponent)');
}
