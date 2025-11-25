/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { ipcMain, app } from 'electron';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { BrowserViewService } from './browserViewService.js';
import { BrowserBridgeChannels, BrowserCommand } from '../common/browserBridge.js';

/**
 * Roopik Main Process Contribution
 *
 * Initializes Roopik services in the main process and sets up IPC communication.
 * This is self-initializing and doesn't require dependency injection.
 */
class RoopikMainContribution extends Disposable {
	private browserViewService: BrowserViewService | undefined;
	private isInitialized = false;

	constructor() {
		super();
		this.initialize();
	}

	private initialize(): void {
		if (this.isInitialized) {
			return;
		}

		console.log('[Roopik] Initializing main process contribution');

		// Register IPC handlers immediately
		this.registerIPCHandlers();

		// Wait for app to be ready before creating BrowserViewService
		if (app.isReady()) {
			this.initializeServices();
		} else {
			app.once('ready', () => this.initializeServices());
		}

		this.isInitialized = true;
	}

	private initializeServices(): void {
		console.log('[Roopik] Initializing BrowserViewService');

		// Create a simple logger that logs to console
		const logService = {
			info: (message: string) => console.log(message),
			error: (message: string) => console.error(message),
			warn: (message: string) => console.warn(message),
			trace: (message: string) => console.log(message),
		};

		this.browserViewService = new BrowserViewService(logService as any);
		this._register(this.browserViewService);

		console.log('[Roopik] BrowserViewService initialized');
	}

	private registerIPCHandlers(): void {
		// Handle browser commands from renderer process
		ipcMain.on(BrowserBridgeChannels.COMMAND, async (event, command: BrowserCommand) => {
			console.log(`[Roopik IPC] Received command: ${command.type} for ${command.containerId}`);

			if (!this.browserViewService) {
				console.error('[Roopik IPC] BrowserViewService not initialized yet');
				return;
			}

			// Get the main window from the event sender
			const mainWindow = require('electron').BrowserWindow.fromWebContents(event.sender);
			if (mainWindow && !this.browserViewService['mainWindow']) {
				this.browserViewService.setMainWindow(mainWindow);
			}

			try {
				switch (command.type) {
					case 'navigate':
					case 'back':
					case 'forward':
					case 'reload':
					case 'stop':
					case 'updateBounds':
						await this.browserViewService.handleCommand(command);
						break;

					case 'openDevTools':
						await this.browserViewService.openDevTools(command.containerId);
						break;

					case 'closeDevTools':
						// DevTools closing handled by user
						break;
				}
			} catch (error) {
				console.error(`[Roopik IPC] Command failed: ${error}`);
			}
		});

		console.log('[Roopik] IPC handlers registered');
	}
}

// Self-initialize when module loads
void new RoopikMainContribution();
console.log('[Roopik] Main process contribution module loaded');
