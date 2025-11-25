/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ILoggerService, ILogger } from '../../../../../platform/log/common/log.js';
import { RoopikLogger } from '../../common/roopikLogger.js';
import {
	BrowserCommand,
	BrowserEvent,
	BrowserBridgeChannels,
	IBrowserNavigationCommand,
	IBrowserDevToolsCommand
} from '../../common/browserBridge.js';

/**
 * Browser View Service Bridge (Browser Process)
 *
 * Communicates with BrowserViewService in main process via IPC.
 * Provides type-safe API for browser control operations.
 */
export class BrowserViewServiceBridge extends Disposable {
	private readonly logger: ILogger;

	private readonly _onUrlChanged = this._register(new Emitter<{ containerId: string; url: string }>());
	readonly onUrlChanged: Event<{ containerId: string; url: string }> = this._onUrlChanged.event;

	private readonly _onLoadingStarted = this._register(new Emitter<{ containerId: string }>());
	readonly onLoadingStarted: Event<{ containerId: string }> = this._onLoadingStarted.event;

	private readonly _onLoadingStopped = this._register(new Emitter<{ containerId: string }>());
	readonly onLoadingStopped: Event<{ containerId: string }> = this._onLoadingStopped.event;

	private readonly _onTitleChanged = this._register(new Emitter<{ containerId: string; title: string }>());
	readonly onTitleChanged: Event<{ containerId: string; title: string }> = this._onTitleChanged.event;

	private readonly _onNavigationError = this._register(new Emitter<{ containerId: string; error: string }>());
	readonly onNavigationError: Event<{ containerId: string; error: string }> = this._onNavigationError.event;

	constructor(
		@ILoggerService loggerService: ILoggerService
	) {
		super();
		this.logger = RoopikLogger.create(loggerService);

		// Listen for events from main process
		this.setupEventListeners();

		this.logger.info('[Roopik BrowserBridge] Service bridge initialized');
	}

	/**
	 * Navigate to URL
	 */
	async navigate(containerId: string, url: string): Promise<void> {
		const command: IBrowserNavigationCommand = {
			type: 'navigate',
			containerId,
			url
		};
		this.sendCommand(command);
	}

	/**
	 * Navigate back
	 */
	async goBack(containerId: string): Promise<void> {
		const command: IBrowserNavigationCommand = {
			type: 'back',
			containerId
		};
		this.sendCommand(command);
	}

	/**
	 * Navigate forward
	 */
	async goForward(containerId: string): Promise<void> {
		const command: IBrowserNavigationCommand = {
			type: 'forward',
			containerId
		};
		this.sendCommand(command);
	}

	/**
	 * Reload page
	 */
	async reload(containerId: string): Promise<void> {
		const command: IBrowserNavigationCommand = {
			type: 'reload',
			containerId
		};
		this.sendCommand(command);
	}

	/**
	 * Open DevTools
	 */
	async openDevTools(containerId: string): Promise<void> {
		const command: IBrowserDevToolsCommand = {
			type: 'openDevTools',
			containerId
		};
		this.sendCommand(command);
	}

	/**
	 * Update BrowserView bounds
	 */
	async updateBounds(containerId: string, bounds: { x: number; y: number; width: number; height: number }): Promise<void> {
		const command = {
			type: 'updateBounds' as const,
			containerId,
			bounds
		};
		this.sendCommand(command);
	}

	/**
	 * Send command to main process
	 */
	private sendCommand(command: BrowserCommand): void {
		if (typeof (window as any).vscodeApi !== 'undefined') {
			// In VSCode webview context
			(window as any).vscodeApi.postMessage({
				channel: BrowserBridgeChannels.COMMAND,
				command
			});
		} else if (typeof require !== 'undefined') {
			// In Electron renderer process
			const { ipcRenderer } = require('electron');
			ipcRenderer.send(BrowserBridgeChannels.COMMAND, command);
		}
		this.logger.trace(`[Roopik BrowserBridge] Sent command: ${command.type} for ${command.containerId}`);
	}

	/**
	 * Setup event listeners from main process
	 */
	private setupEventListeners(): void {
		if (typeof require !== 'undefined') {
			const { ipcRenderer } = require('electron');

			ipcRenderer.on(BrowserBridgeChannels.EVENT, (_event: any, event: BrowserEvent) => {
				this.handleEvent(event);
			});
		}
	}

	/**
	 * Handle event from main process
	 */
	private handleEvent(event: BrowserEvent): void {
		switch (event.type) {
			case 'urlChanged':
				if (event.url) {
					this._onUrlChanged.fire({ containerId: event.containerId, url: event.url });
				}
				break;

			case 'loadingStarted':
				this._onLoadingStarted.fire({ containerId: event.containerId });
				break;

			case 'loadingStopped':
				this._onLoadingStopped.fire({ containerId: event.containerId });
				break;

			case 'titleChanged':
				if (event.title) {
					this._onTitleChanged.fire({ containerId: event.containerId, title: event.title });
				}
				break;

			case 'navigationError':
			case 'loadError':
				this._onNavigationError.fire({ containerId: event.containerId, error: event.error });
				break;
		}
	}
}
