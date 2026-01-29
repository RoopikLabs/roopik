/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Project Executor
 *
 * Unified execution logic for project/dev server tools.
 * Called by both HTTP MCP transport and WebSocket transport.
 */

import { resolve, normalize } from '../../../../../../base/common/path.js';
import type { DevServerService } from '../../projectMode/devServer/devServerService.js';
import type { BrowserViewService } from '../../projectMode/browserViewService.js';
import type { IRoopikStorageService } from '../../../common/storage/storageService.js';
import type { ToolResult, ProjectStartResult, ProjectStopResult, ProjectServerInfo } from './types.js';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Resolve a path that may be relative or absolute.
 */
function resolvePath(inputPath: string, workspacePath: string): string {
	let sanitizedInput = inputPath;
	if (process.platform !== 'win32') {
		sanitizedInput = inputPath.replace(/\\/g, '/');
	}
	const normalizedInput = normalize(sanitizedInput);
	return resolve(workspacePath, normalizedInput);
}

// ============================================================================
// Project Executor Class
// ============================================================================

export class ProjectExecutor {
	constructor(
		private readonly devServerService: DevServerService,
		private readonly browserViewService: BrowserViewService,
		private readonly storageService: IRoopikStorageService
	) {}

	// ==========================================================================
	// Project Get Active
	// ==========================================================================

	async getActiveProject(): Promise<ToolResult<{ hasActiveProject: boolean; project?: ProjectServerInfo; message?: string }>> {
		try {
			const runningServer = await this.devServerService.getRunningServer();

			if (!runningServer) {
				return {
					success: true,
					data: {
						hasActiveProject: false,
						message: 'No project is currently running. Use project_start to start one.'
					}
				};
			}

			return {
				success: true,
				data: {
					hasActiveProject: true,
					project: {
						url: runningServer.url,
						projectRoot: runningServer.projectRoot,
						framework: runningServer.framework,
						status: runningServer.state as 'starting' | 'running' | 'stopping' | 'stopped'
					}
				}
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	// ==========================================================================
	// Project Start
	// ==========================================================================

	async startProject(projectPath: string, port?: number): Promise<ToolResult<ProjectStartResult>> {
		try {
			// Use getWorkspaceRootPath() - NOT getWorkspacePath() which returns .roopik/ folder
			const workspacePath = this.storageService.getWorkspaceRootPath();
			const resolvedPath = resolvePath(projectPath, workspacePath);

			const url = await this.devServerService.startServer({
				projectRoot: resolvedPath,
				port
			});

			// Get framework info
			const runningServer = await this.devServerService.getRunningServer();

			return {
				success: true,
				data: {
					url,
					projectRoot: resolvedPath,
					framework: runningServer?.framework,
					message: `Dev server started at ${url}. Browser is now showing the project.`
				}
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	// ==========================================================================
	// Project Stop
	// ==========================================================================

	async stopProject(): Promise<ToolResult<ProjectStopResult>> {
		try {
			const runningServer = await this.devServerService.getRunningServer();

			if (!runningServer) {
				return {
					success: true,
					data: {
						stopped: false,
						message: 'No project is currently running'
					}
				};
			}

			const projectPath = runningServer.projectRoot;
			await this.devServerService.stopServer(projectPath);

			// Close browser editor UI (fires event to renderer process)
			this.browserViewService.requestBrowserClose();

			return {
				success: true,
				data: {
					stopped: true,
					message: 'Dev server stopped and browser closed'
				}
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}
}
