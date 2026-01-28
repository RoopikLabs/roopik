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

import { resolve, normalize } from '../../../../../../base/common/path.js';
import type { DevServerService } from '../../projectMode/devServer/devServerService.js';
import type { BrowserViewService } from '../../projectMode/browserViewService.js';
import type { IRoopikStorageService } from '../../../common/storage/storageService.js';

/**
 * Resolve a path that may be relative or absolute.
 * Handles various path formats from AI agents:
 * - Absolute: C:\project\src, /home/user/project
 * - Relative: src/Button, ./src/Button, ../other
 * - Mixed separators: src\Button, ./src\Button
 *
 * Cross-platform: Works on Windows, Linux, and macOS.
 * On non-Windows platforms, backslashes are converted to forward slashes
 * since backslash is a valid filename character on Unix systems.
 *
 * @param inputPath - Path from AI agent (may be relative or absolute)
 * @param workspacePath - The workspace root path
 * @returns Absolute path
 */
function resolvePath(inputPath: string, workspacePath: string): string {
	// On non-Windows platforms, convert backslashes to forward slashes
	// because backslash is a valid filename character on Unix systems
	// but AI agents often send Windows-style paths regardless of platform
	let sanitizedInput = inputPath;
	if (process.platform !== 'win32') {
		sanitizedInput = inputPath.replace(/\\/g, '/');
	}

	// Normalize to handle ./.. segments and platform-specific separators
	const normalizedInput = normalize(sanitizedInput);

	// resolve handles both cases:
	// - If normalizedInput is absolute, returns normalizedInput
	// - If normalizedInput is relative, resolves it against workspacePath
	const result = resolve(workspacePath, normalizedInput);

	// Debug log to help troubleshoot path resolution issues
	console.log(`[MCP] Path resolution: "${inputPath}" -> "${result}" (workspace: "${workspacePath}", platform: ${process.platform})`);

	return result;
}

/**
 * Register all project-related MCP tools
 *
 * @param server - McpServer instance (dynamically imported)
 * @param z - Zod validation library (dynamically imported)
 * @param devServerService - DevServer service instance
 * @param browserViewService - BrowserView service instance (for closing browser on project stop)
 * @param storageService - Storage service for workspace path resolution
 */
export function registerProjectTools(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	server: any,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	z: any,
	devServerService: DevServerService,
	browserViewService: BrowserViewService,
	storageService: IRoopikStorageService
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
		'[Roopik IDE] Start a dev server for a project and open it in the IDE browser. The browser will automatically navigate to the dev server URL. Use project_get_active to check if already running. Supports both absolute and relative paths (relative to workspace).',
		{
			projectPath: z.string().describe('Path to the project folder. Can be absolute (e.g., C:\\project) or relative to workspace (e.g., . or ./my-app or my-app)'),
			port: z.number().optional().describe('Preferred port number (optional, auto-selects if not provided)')
		},
		async ({ projectPath, port }: { projectPath: string; port?: number }) => {
			try {
				// Resolve path (handles both absolute and relative paths)
				// Use getWorkspaceRootPath() - NOT getWorkspacePath() which returns .roopik/ folder
				const workspacePath = storageService.getWorkspaceRootPath();
				const resolvedPath = resolvePath(projectPath, workspacePath);

				const url = await devServerService.startServer({
					projectRoot: resolvedPath,
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

				// Close browser editor UI (fires event to renderer process)
				browserViewService.requestBrowserClose();

				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							success: true,
							projectPath,
							message: 'Dev server stopped and browser closed'
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

	// console.log('[MCP] Registered 3 project tools: project_get_active, project_start, project_stop');
}
