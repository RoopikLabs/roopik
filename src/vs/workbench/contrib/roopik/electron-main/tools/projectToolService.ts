/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Project Tool Service
 *
 * Unified implementation of project/dev server tools.
 * Single source of truth - used by both WebSocket MCP and Native IPC.
 */

import type { DevServerService } from '../projectMode/devServer/devServerService.js';
import type {
	ToolResult,
	ProjectServerInfo,
	ProjectStartResult,
	ProjectStopResult,
} from '../mcp/executor/types.js';

// ============================================================================
// Project Tool Service
// ============================================================================

export class ProjectToolService {
	constructor(
		private readonly devServerService: DevServerService
	) {}

	// ==========================================================================
	// Get Active Project
	// ==========================================================================

	async getActive(): Promise<ToolResult<ProjectServerInfo | null>> {
		try {
			const serverInfo = await this.devServerService.getRunningServer();

			if (!serverInfo) {
				return {
					success: true,
					data: null
				};
			}

			// Map DevServerState to ProjectServerInfo.status
			// DevServerState: 'stopped' | 'starting' | 'running' | 'error'
			// ProjectServerInfo.status: 'starting' | 'running' | 'stopping' | 'stopped'
			const status = serverInfo.state === 'error' ? 'stopped' as const : serverInfo.state;

			return {
				success: true,
				data: {
					url: serverInfo.url,
					projectRoot: serverInfo.projectRoot,
					framework: serverInfo.framework,
					port: serverInfo.port,
					status
				}
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Failed to get project status'
			};
		}
	}

	// ==========================================================================
	// Start Project
	// ==========================================================================

	async start(projectPath: string, port?: number): Promise<ToolResult<ProjectStartResult>> {
		try {
			// Check if already running
			const runningServer = await this.devServerService.getRunningServer();
			if (runningServer) {
				return {
					success: false,
					error: `Dev server already running at ${runningServer.url}. Stop it first with project_stop.`
				};
			}

			// Start the dev server - returns URL on success, throws on failure
			const url = await this.devServerService.startServer({
				projectRoot: projectPath,
				port
			});

			// Get server info to retrieve framework
			const serverInfo = await this.devServerService.getRunningServer();

			return {
				success: true,
				data: {
					url,
					projectRoot: projectPath,
					framework: serverInfo?.framework,
					message: `Dev server starting for ${projectPath}`
				}
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Failed to start project'
			};
		}
	}

	// ==========================================================================
	// Stop Project
	// ==========================================================================

	async stop(): Promise<ToolResult<ProjectStopResult>> {
		try {
			const runningServer = await this.devServerService.getRunningServer();

			if (!runningServer) {
				return {
					success: true,
					data: {
						stopped: true,
						message: 'No dev server is running'
					}
				};
			}

			// Stop all servers (single server constraint means this stops the one running server)
			await this.devServerService.stopAllServers();

			return {
				success: true,
				data: {
					stopped: true,
					message: 'Dev server stopped'
				}
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Failed to stop project'
			};
		}
	}
}
