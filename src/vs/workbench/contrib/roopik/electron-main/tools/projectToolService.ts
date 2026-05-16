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
import type { IRoopikStorageService } from '../../common/storage/storageService.js';
import type { IBrowserBackend } from '../projectMode/browserBackend.js';
import type {
	ToolResult,
	ProjectServerInfo,
	ProjectStartResult,
	ProjectStopResult,
} from '../mcp/executor/types.js';
import { resolve, normalize } from '../../../../../base/common/path.js';

// ============================================================================
// Project Tool Service
// ============================================================================

export class ProjectToolService {
	constructor(
		private readonly devServerService: DevServerService,
		private readonly storageService: IRoopikStorageService,
		private readonly browserViewService: IBrowserBackend
	) { }

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

			// Resolve relative paths against workspace (handles both relative and absolute)
			let inputPath = projectPath;

			// On non-Windows platforms, convert backslashes to forward slashes
			if (process.platform !== 'win32') {
				inputPath = inputPath.replace(/\\/g, '/');
			}

			const workspacePath = this.storageService.getWorkspaceRootPath();
			const resolvedPath = resolve(workspacePath, normalize(inputPath));

			// Start the dev server - returns URL on success, throws on failure
			const url = await this.devServerService.startServer({
				projectRoot: resolvedPath,
				port
			});

			// Get server info to retrieve framework
			const serverInfo = await this.devServerService.getRunningServer();

			// Wait for server to be actually ready before navigating
			await this.waitForServerReady(url);

			// Auto-open and navigate browser to the dev server URL
			// Multi-tab aware: only navigate the active tab if it's blank/placeholder.
			// If the active tab has real content, open in a new tab instead.
			const tabs = this.browserViewService.listTabs();
			if (tabs.length === 0) {
				// No browser open - request to open with URL
				this.browserViewService.requestBrowserOpen(url);
			} else {
				const activeTabId = this.browserViewService.getActiveTabId();
				const activeTab = tabs.find(t => t.tabId === activeTabId);
				const activeHasContent = activeTab && activeTab.url && activeTab.url !== 'about:blank';

				if (!activeHasContent && activeTabId !== undefined) {
					// Active tab is blank/placeholder — safe to navigate in-place
					const browserViewId = this.browserViewService.resolveTabId(activeTabId);
					await this.browserViewService.navigate(browserViewId, url);
				} else {
					// Active tab has real content — open dev server in new tab
					await this.browserViewService.openNewTab(url);
				}
			}

			return {
				success: true,
				data: {
					url,
					projectRoot: resolvedPath,
					framework: serverInfo?.framework,
					message: `Dev server starting for ${resolvedPath}`
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

	/**
	 * Wait for server to be actually ready to accept connections
	 * Retries with exponential backoff up to ~5 seconds
	 */
	private async waitForServerReady(url: string): Promise<void> {
		const maxAttempts = 10;
		const baseDelay = 100; // Start with 100ms

		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			try {
				// Try to fetch the URL with GET to ensure HTML is actually compiled
				const response = await fetch(url, { method: 'GET' });
				if (response.ok || response.status === 304) {
					// Verify we got HTML content, not an error page
					const contentType = response.headers.get('content-type') || '';
					if (contentType.includes('text/html')) {
						// Add a small grace period for Vite to fully initialize
						await new Promise(resolve => setTimeout(resolve, 200));
						return;
					}
				}
			} catch {
				// Server not ready yet, wait and retry
				if (attempt < maxAttempts - 1) {
					const delay = baseDelay * Math.pow(1.5, attempt); // Exponential backoff
					await new Promise(resolve => setTimeout(resolve, delay));
				}
			}
		}
		// If we get here, server didn't respond in time, but continue anyway
		// The navigation might still work, or it will show a proper error
	}

}
