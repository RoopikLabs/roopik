/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Renderer Bridge - Main Process Side
 *
 * Provides a clean API for Main Process code to execute commands
 * in the Extension Host via the Renderer bridge.
 *
 * Usage in Main Process:
 * ```typescript
 * const bridge = new RendererBridge(windowsMainService, logService);
 * const result = await bridge.executeCommand('roopik.debug.startAndWait', args);
 * ```
 */

import { ipcMain, type IpcMainEvent } from 'electron';
import type { ICodeWindow } from '../../../../../platform/window/electron-main/window.js';
import type { ILogService } from '../../../../../platform/log/common/log.js';
import {
	MAIN_TO_RENDERER_COMMAND_CHANNEL,
	generateRequestId,
	getResponseChannel,
	type IMainToRendererCommandRequest,
	type IRendererToMainCommandResponse
} from '../../common/bridge/ipc.js';

// ============================================================================
// Configuration
// ============================================================================

/** Default timeout for command execution (30 seconds) */
const DEFAULT_TIMEOUT_MS = 30000;

// ============================================================================
// Renderer Bridge
// ============================================================================

/**
 * Interface for getting the active window
 * This allows for dependency injection and testing
 */
export interface IWindowProvider {
	getLastActiveWindow(): ICodeWindow | undefined;
	getFocusedWindow(): ICodeWindow | undefined;
}

/**
 * RendererBridge - Executes VS Code commands via the Renderer process
 *
 * This bridge enables Main Process code (MCP Server, native menus) to
 * execute commands registered in the Extension Host.
 */
export class RendererBridge {
	private pendingRequests = new Map<string, {
		resolve: (value: any) => void;
		reject: (error: Error) => void;
		timeoutId: any; // Use any to avoid Node vs DOM timeout type conflicts
	}>();

	constructor(
		private readonly windowProvider: IWindowProvider,
		private readonly logService?: ILogService
	) {
		this.log('RendererBridge initialized');
	}

	/**
	 * Execute a VS Code command via the Renderer bridge
	 *
	 * @param commandId The command ID to execute (e.g., 'roopik.debug.startAndWait')
	 * @param args Arguments to pass to the command
	 * @param timeout Timeout in milliseconds (default: 30000)
	 * @returns Promise that resolves with the command result
	 */
	async executeCommand<T = any>(
		commandId: string,
		args?: any[],
		timeout: number = DEFAULT_TIMEOUT_MS
	): Promise<T> {
		// Get the active window
		const window = this.windowProvider.getLastActiveWindow() || this.windowProvider.getFocusedWindow();

		if (!window) {
			throw new Error('No active editor window found. Cannot execute command.');
		}

		// Generate unique request ID
		const requestId = generateRequestId();
		const responseChannel = getResponseChannel(requestId);

		this.log(`Executing command: ${commandId} (requestId: ${requestId})`);

		return new Promise<T>((resolve, reject) => {
			// Set up timeout
			const timeoutId = setTimeout(() => {
				this.cleanup(requestId);
				reject(new Error(`Command timeout after ${timeout}ms: ${commandId}`));
			}, timeout);

			// Store pending request
			this.pendingRequests.set(requestId, { resolve, reject, timeoutId });

			// Set up response listener
			const handler = (_event: IpcMainEvent, response: IRendererToMainCommandResponse) => {
				this.log(`Received response for ${requestId}: success=${response.success}`);
				this.cleanup(requestId);
				ipcMain.removeListener(responseChannel, handler);

				if (response.success) {
					resolve(response.result as T);
				} else {
					const error = new Error(response.error || 'Command execution failed');
					if (response.stack) {
						error.stack = response.stack;
					}
					reject(error);
				}
			};

			ipcMain.on(responseChannel, handler);

			// Send request to Renderer
			const request: IMainToRendererCommandRequest = {
				requestId,
				commandId,
				args,
				timeout
			};


			window.send(MAIN_TO_RENDERER_COMMAND_CHANNEL, request);
		});
	}

	/**
	 * Clean up a pending request
	 */
	private cleanup(requestId: string): void {
		const pending = this.pendingRequests.get(requestId);
		if (pending) {
			clearTimeout(pending.timeoutId);
			this.pendingRequests.delete(requestId);
		}
	}

	/**
	 * Log a message (if log service is available)
	 */
	private log(message: string): void {
		if (this.logService) {
			this.logService.info(`[RendererBridge] ${message}`);
		}
	}

	/**
	 * Dispose and clean up all pending requests
	 */
	dispose(): void {
		for (const pending of this.pendingRequests.values()) {
			clearTimeout(pending.timeoutId);
			pending.reject(new Error('Bridge disposed'));
		}
		this.pendingRequests.clear();
		this.log('RendererBridge disposed');
	}
}
