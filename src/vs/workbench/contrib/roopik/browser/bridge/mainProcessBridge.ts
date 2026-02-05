/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Main Process Bridge - Renderer Side (Workbench Contribution)
 *
 * This contribution listens for command execution requests from the Main Process
 * and routes them to the Extension Host via ICommandService.
 *
 * The ICommandService automatically handles the Extension Host communication -
 * if a command is registered in an extension, it serializes the args, sends
 * them to the Extension Host, executes the command, and returns the result.
 *
 * Flow:
 *   Main → ipc('roopik:execute-command') → [THIS BRIDGE] → ICommandService → Extension Host
 */

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ipcRenderer } from '../../../../../base/parts/sandbox/electron-browser/globals.js';
import type { IpcRendererEvent } from '../../../../../base/parts/sandbox/electron-browser/electronTypes.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import {
	MAIN_TO_RENDERER_COMMAND_CHANNEL,
	getResponseChannel,
	type IMainToRendererCommandRequest,
	type IRendererToMainCommandResponse
} from '../../common/bridge/ipc.js';


// ============================================================================
// Main Process Bridge Contribution
// ============================================================================

/**
 * RoopikMainProcessBridge
 *
 * Workbench Contribution that bridges Main Process commands to Extension Host.
 * Registered to run at LifecyclePhase.Restored (after UI is ready).
 */
export class RoopikMainProcessBridge extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.roopikMainProcessBridge';

	private readonly pendingCleanup: Map<string, () => void> = new Map();
	private boundHandler: ((event: IpcRendererEvent, ...args: unknown[]) => void) | undefined;

	constructor(
		@ICommandService private readonly commandService: ICommandService,
		@ILogService private readonly logService: ILogService
	) {
		super();



		if (ipcRenderer) {
			this.registerListeners();
			this.logService.info('[RoopikMainProcessBridge] Initialized - listening for Main Process commands');

		} else {
			this.logService.warn('[RoopikMainProcessBridge] IPC Renderer not available - bridge disabled');

		}
	}

	/**
	 * Register IPC listeners
	 */
	private registerListeners(): void {
		if (!ipcRenderer) {
			return;
		}

		// Create bound handler so we can remove it later
		// The listener receives (event, ...args) - our request is the first arg
		this.boundHandler = (_event: IpcRendererEvent, ...args: unknown[]) => {

			const request = args[0] as IMainToRendererCommandRequest;
			if (request && request.requestId && request.commandId) {
				this.handleCommandRequest(request);
			} else {
				this.logService.warn('[RoopikMainProcessBridge] Invalid request format:', request);
			}
		};

		// Listen for command execution requests from Main Process
		ipcRenderer.on(MAIN_TO_RENDERER_COMMAND_CHANNEL, this.boundHandler);
		console.error('[RoopikMainProcessBridge] ipcRenderer.on() registered for channel:', MAIN_TO_RENDERER_COMMAND_CHANNEL);

		// Register cleanup
		this._register({
			dispose: () => {
				if (this.boundHandler) {
					ipcRenderer.removeListener(MAIN_TO_RENDERER_COMMAND_CHANNEL, this.boundHandler);
				}
				// Clean up any pending handlers
				for (const cleanup of this.pendingCleanup.values()) {
					cleanup();
				}
				this.pendingCleanup.clear();
			}
		});
	}

	/**
	 * Handle incoming command execution request from Main Process
	 */
	private async handleCommandRequest(request: IMainToRendererCommandRequest): Promise<void> {
		const { requestId, commandId, args = [] } = request;
		const responseChannel = getResponseChannel(requestId);

		this.logService.info(`[RoopikMainProcessBridge] Received command request: ${commandId} (${requestId})`);

		try {
			// Execute the command via ICommandService
			// This automatically routes to Extension Host if the command is registered there!
			const result = await this.commandService.executeCommand(commandId, ...args);

			// Send success response back to Main Process
			const response: IRendererToMainCommandResponse = {
				requestId,
				success: true,
				result
			};

			ipcRenderer.send(responseChannel, response);
			this.logService.info(`[RoopikMainProcessBridge] Command succeeded: ${commandId}`);

		} catch (error: any) {
			// Send error response back to Main Process
			const response: IRendererToMainCommandResponse = {
				requestId,
				success: false,
				error: error?.message || 'Unknown error',
				stack: error?.stack
			};

			ipcRenderer.send(responseChannel, response);
			this.logService.error(`[RoopikMainProcessBridge] Command failed: ${commandId}`, error);
		}
	}
}
