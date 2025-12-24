/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Project Mode Tools
 *
 * MCP tools for dev server lifecycle in Project Mode.
 * These give AI agents control over the live preview browser.
 */

import type { DevServerService } from '../../projectMode/devServer/devServerService.js';

/**
 * Register all project-related MCP tools
 *
 * @param server - McpServer instance (dynamically imported)
 * @param z - Zod validation library (dynamically imported)
 * @param devServerService - DevServer service instance
 */
export function registerProjectTools(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	server: any,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	z: any,
	devServerService: DevServerService
): void {

	// --------------------------------------------------------------
	// TOOL: Get Active Project
	// --------------------------------------------------------------
	server.tool(
		'project_get_active',
		'[Roopik IDE] Get the currently running project in Project Mode. Returns the dev server URL, port, framework, and project path. Use this to check if a project is running before using browser tools.',
		{},
		async () => {
			try {
				const runningServer = await devServerService.getRunningServer();

				if (!runningServer) {
					return {
						content: [{
							type: 'text' as const,
							text: JSON.stringify({
								success: true,
								hasActiveProject: false,
								message: 'No project is currently running. Use project_start to start one.'
							})
						}]
					};
				}

				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: true,
							hasActiveProject: true,
							projectPath: runningServer.projectRoot,
							url: runningServer.url,
							port: runningServer.port,
							state: runningServer.state,
							framework: runningServer.framework,
							frameworkDisplayName: runningServer.frameworkDisplayName
						})
					}]
				};
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: false,
							isError: true,
							error: message
						})
					}],
					isError: true
				};
			}
		}
	);

	// --------------------------------------------------------------
	// TOOL: Start Project
	// --------------------------------------------------------------
	server.tool(
		'project_start',
		'[Roopik IDE] Start a dev server for a project and open it in the IDE browser. The browser will automatically navigate to the dev server URL. Use project_get_active to check if already running.',
		{
			projectPath: z.string().describe('Absolute path to the project folder'),
			port: z.number().optional().describe('Preferred port number (optional, auto-selects if not provided)')
		},
		async ({ projectPath, port }: { projectPath: string; port?: number }) => {
			try {
				const url = await devServerService.startServer({
					projectRoot: projectPath,
					port
				});

				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: true,
							url,
							projectPath,
							message: `Dev server started at ${url}. Browser is now showing the project.`
						})
					}]
				};
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: false,
							isError: true,
							error: message,
							projectPath
						})
					}],
					isError: true
				};
			}
		}
	);

	// --------------------------------------------------------------
	// TOOL: Stop Project
	// --------------------------------------------------------------
	server.tool(
		'project_stop',
		'[Roopik IDE] Stop the currently running dev server. No parameters needed - automatically stops whatever project is active.',
		{},
		async () => {
			try {
				const runningServer = await devServerService.getRunningServer();

				if (!runningServer) {
					return {
						content: [{
							type: 'text' as const,
							text: JSON.stringify({
								success: true,
								message: 'No project is currently running'
							})
						}]
					};
				}

				const projectPath = runningServer.projectRoot;
				await devServerService.stopServer(projectPath);

				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: true,
							projectPath,
							message: 'Dev server stopped successfully'
						})
					}]
				};
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: false,
							isError: true,
							error: message
						})
					}],
					isError: true
				};
			}
		}
	);

	console.log('[MCP] Registered 3 project tools: project_get_active, project_start, project_stop');
}
