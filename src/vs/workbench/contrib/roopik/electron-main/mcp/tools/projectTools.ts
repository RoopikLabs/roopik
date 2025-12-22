/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Project Lifecycle Tools
 *
 * MCP tools for starting/stopping dev servers and detecting frameworks.
 */

import type { DevServerService } from '../../projectMode/devServer/devServerService.js';
import type { ProjectStorageService } from '../../projectStorage/projectStorageService.js';

/**
 * Register all project-related MCP tools
 *
 * @param server - McpServer instance (dynamically imported)
 * @param z - Zod validation library (dynamically imported)
 * @param devServerService - DevServer service instance
 * @param projectStorageService - ProjectStorage service instance
 */
export function registerProjectTools(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	server: any,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	z: any,
	devServerService: DevServerService,
	projectStorageService: ProjectStorageService
): void {

	// --------------------------------------------------------------
	// TOOL: Get Project Status
	// --------------------------------------------------------------
	server.tool(
		'roopik_getProjectStatus',
		'Get the status of a dev server for a project. Returns running state, URL, port, and framework.',
		{
			projectPath: z.string().describe('Absolute path to the project folder')
		},
		async ({ projectPath }: { projectPath: string }) => {
			try {
				const serverInfo = await devServerService.getServerInfo(projectPath);

				if (!serverInfo) {
					return {
						content: [{
							type: 'text' as const,
							text: JSON.stringify({
								success: true,
								projectPath,
								running: false,
								message: 'No dev server running for this project'
							})
						}]
					};
				}

				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: true,
							projectPath,
							running: serverInfo.state === 'running',
							state: serverInfo.state,
							url: serverInfo.url,
							port: serverInfo.port,
							framework: serverInfo.framework
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
	// TOOL: Get Active Project
	// --------------------------------------------------------------
	server.tool(
		'roopik_getActiveProject',
		'Get the currently active/running project in Roopik IDE. Returns project info including URL if running.',
		{},
		async () => {
			try {
				const activeProject = await projectStorageService.getActiveProject();

				if (!activeProject) {
					return {
						content: [{
							type: 'text' as const,
							text: JSON.stringify({
								success: true,
								hasActiveProject: false,
								message: 'No project is currently running'
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
							...activeProject
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
	// UNIVERSAL FLOW: Starts dev server, browser automatically opens via internal event
	// --------------------------------------------------------------
	server.tool(
		'roopik_startProject',
		'Start a dev server for a project. The browser will automatically open and navigate to the URL when the server is ready. Returns the server URL and success status.',
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
							message: `Dev server started successfully at ${url}`
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
		'roopik_stopProject',
		'Stop the dev server for a project.',
		{
			projectPath: z.string().describe('Absolute path to the project folder')
		},
		async ({ projectPath }: { projectPath: string }) => {
			try {
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
	// TOOL: Detect Framework
	// --------------------------------------------------------------
	server.tool(
		'roopik_detectFramework',
		'Detect the framework used by a project (React, Vue, Svelte, Next.js, etc.).',
		{
			projectPath: z.string().describe('Absolute path to the project folder')
		},
		async ({ projectPath }: { projectPath: string }) => {
			try {
				const frameworkInfo = await devServerService.detectFramework(projectPath);

				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: true,
							projectPath,
							framework: frameworkInfo.framework,
							displayName: frameworkInfo.displayName,
							supported: frameworkInfo.supported,
							supportsClickToSource: frameworkInfo.supportsClickToSource
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
							error: message,
							projectPath
						})
					}],
					isError: true
				};
			}
		}
	);

	console.log('[MCP] Registered 5 project tools: getProjectStatus, getActiveProject, startProject, stopProject, detectFramework');
}
