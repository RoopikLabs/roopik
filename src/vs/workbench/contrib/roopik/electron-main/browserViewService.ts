/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { BrowserView, BrowserWindow } from 'electron';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { BrowserCommand, BrowserEvent, BrowserBridgeChannels } from '../common/browserBridge.js';

/**
 * Browser View Service (Main Process)
 *
 * Manages Electron BrowserView instances for project previews.
 * Runs in the main process and communicates with browser process via IPC.
 */
export class BrowserViewService extends Disposable {
	private browserViews = new Map<string, BrowserView>();
	private mainWindow: BrowserWindow | undefined;

	constructor(
		@ILogService private readonly logService: ILogService
	) {
		super();
		this.logService.info('[Roopik BrowserView] Service initialized');
	}

	/**
	 * Set the main window for attaching BrowserViews
	 */
	setMainWindow(window: BrowserWindow): void {
		this.mainWindow = window;
		this.logService.info('[Roopik BrowserView] Main window set');
	}

	/**
	 * Create a BrowserView for a container
	 */
	async createBrowserView(containerId: string): Promise<void> {
		if (!this.mainWindow) {
			throw new Error('Main window not set');
		}

		if (this.browserViews.has(containerId)) {
			this.logService.warn(`[Roopik BrowserView] BrowserView already exists for ${containerId}`);
			return;
		}

		const browserView = new BrowserView({
			webPreferences: {
				nodeIntegration: false,
				contextIsolation: true,
				sandbox: true,
				webSecurity: true,
			}
		});

		this.browserViews.set(containerId, browserView);
		this.mainWindow.addBrowserView(browserView);

		// Set initial bounds (will be updated by browser process)
		const bounds = this.mainWindow.getBounds();
		browserView.setBounds({
			x: 0,
			y: 100, // Leave space for address bar
			width: bounds.width,
			height: bounds.height - 100
		});

		// Setup event listeners
		this.setupBrowserViewEvents(containerId, browserView);

		this.logService.info(`[Roopik BrowserView] Created for ${containerId}`);
	}

	/**
	 * Destroy a BrowserView
	 */
	async destroyBrowserView(containerId: string): Promise<void> {
		const browserView = this.browserViews.get(containerId);
		if (!browserView || !this.mainWindow) {
			return;
		}

		this.mainWindow.removeBrowserView(browserView);
		(browserView.webContents as any).destroy();
		this.browserViews.delete(containerId);

		this.logService.info(`[Roopik BrowserView] Destroyed for ${containerId}`);
	}

	/**
	 * Navigate to URL
	 */
	async navigateToUrl(containerId: string, url: string): Promise<void> {
		// Auto-create BrowserView if it doesn't exist
		if (!this.browserViews.has(containerId)) {
			await this.createBrowserView(containerId);
		}

		const browserView = this.browserViews.get(containerId);
		if (!browserView) {
			throw new Error(`BrowserView not found for ${containerId}`);
		}

		try {
			await browserView.webContents.loadURL(url);
			this.sendEvent(containerId, {
				type: 'urlChanged',
				containerId,
				url
			});
		} catch (error) {
			this.logService.error(`[Roopik BrowserView] Navigation failed: ${error}`);
			this.sendEvent(containerId, {
				type: 'navigationError',
				containerId,
				error: String(error)
			});
		}
	}

	/**
	 * Navigate back
	 */
	async goBack(containerId: string): Promise<void> {
		const browserView = this.browserViews.get(containerId);
		if (browserView?.webContents.canGoBack()) {
			browserView.webContents.goBack();
		}
	}

	/**
	 * Navigate forward
	 */
	async goForward(containerId: string): Promise<void> {
		const browserView = this.browserViews.get(containerId);
		if (browserView?.webContents.canGoForward()) {
			browserView.webContents.goForward();
		}
	}

	/**
	 * Reload page
	 */
	async reload(containerId: string): Promise<void> {
		const browserView = this.browserViews.get(containerId);
		if (browserView) {
			browserView.webContents.reload();
		}
	}

	/**
	 * Hard reload (clear cache)
	 */
	async hardReload(containerId: string): Promise<void> {
		const browserView = this.browserViews.get(containerId);
		if (browserView) {
			browserView.webContents.reloadIgnoringCache();
		}
	}

	/**
	 * Open DevTools
	 */
	async openDevTools(containerId: string): Promise<void> {
		const browserView = this.browserViews.get(containerId);
		if (browserView) {
			browserView.webContents.openDevTools();
		}
	}

	/**
	 * Update BrowserView bounds
	 */
	async updateBounds(containerId: string, bounds: { x: number; y: number; width: number; height: number }): Promise<void> {
		const browserView = this.browserViews.get(containerId);
		if (browserView) {
			browserView.setBounds(bounds);
			this.logService.info(`[Roopik BrowserView] Updated bounds for ${containerId}: ${JSON.stringify(bounds)}`);
		}
	}

	/**
	 * Setup BrowserView event listeners
	 */
	private setupBrowserViewEvents(containerId: string, browserView: BrowserView): void {
		const webContents = browserView.webContents;

		// Navigation events
		webContents.on('did-start-loading', () => {
			this.sendEvent(containerId, {
				type: 'loadingStarted',
				containerId,
				progress: 0
			});
		});

		webContents.on('did-stop-loading', () => {
			this.sendEvent(containerId, {
				type: 'loadingStopped',
				containerId,
				progress: 100
			});
		});

		webContents.on('did-navigate', (_, url) => {
			this.sendEvent(containerId, {
				type: 'urlChanged',
				containerId,
				url
			});
		});

		webContents.on('did-navigate-in-page', (_, url) => {
			this.sendEvent(containerId, {
				type: 'urlChanged',
				containerId,
				url
			});
		});

		webContents.on('page-title-updated', (_, title) => {
			this.sendEvent(containerId, {
				type: 'titleChanged',
				containerId,
				title
			});
		});

		webContents.on('did-fail-load', (_, errorCode, errorDescription) => {
			this.sendEvent(containerId, {
				type: 'loadError',
				containerId,
				error: errorDescription,
				code: errorCode
			});
		});
	}

	/**
	 * Send event to browser process
	 */
	private sendEvent(containerId: string, event: BrowserEvent): void {
		if (this.mainWindow) {
			this.mainWindow.webContents.send(BrowserBridgeChannels.EVENT, event);
		}
	}

	/**
	 * Handle command from browser process
	 */
	async handleCommand(command: BrowserCommand): Promise<void> {
		try {
			switch (command.type) {
				case 'navigate':
					if (command.url) {
						await this.navigateToUrl(command.containerId, command.url);
					}
					break;
				case 'back':
					await this.goBack(command.containerId);
					break;
				case 'forward':
					await this.goForward(command.containerId);
					break;
				case 'reload':
					await this.reload(command.containerId);
					break;
				case 'stop':
					const browserView = this.browserViews.get(command.containerId);
					if (browserView) {
						browserView.webContents.stop();
					}
					break;
				case 'updateBounds':
					if (command.bounds) {
						await this.updateBounds(command.containerId, command.bounds);
					}
					break;
			}
		} catch (error) {
			this.logService.error(`[Roopik BrowserView] Command failed: ${error}`);
		}
	}

	override dispose(): void {
		// Destroy all browser views
		for (const [containerId] of this.browserViews) {
			this.destroyBrowserView(containerId);
		}
		super.dispose();
	}
}
