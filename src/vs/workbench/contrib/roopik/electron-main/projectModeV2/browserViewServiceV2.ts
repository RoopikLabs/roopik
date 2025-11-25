/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { BrowserWindow, WebContentsView } from 'electron';
import type { IProjectModeV2Service } from '../../common/projectModeV2/ipc.js';
import type { ViewBounds, DevicePreset, BrowserViewResult, DevToolsViewResult, NavigationState, CDPDomains } from '../../common/projectModeV2/types.js';

/**
 * Browser View Service V2
 *
 * Main process service managing WebContentsView lifecycle with:
 * - Proper destruction to avoid ghost processes
 * - ON-DEMAND DevTools creation (fresh WebContentsView each time)
 * - CDP debugger integration
 * - Device emulation via CDP
 */
export class BrowserViewServiceV2 implements IProjectModeV2Service {
	readonly _serviceBrand: undefined;

	// Static set of managed webContents IDs for navigation whitelist
	// This is used by app.ts to allow navigation for our browser views
	private static managedWebContentsIds = new Set<number>();

	/**
	 * Check if a webContents ID is managed by ProjectModeV2
	 * Called by app.ts to allow navigation for our browser views
	 */
	static isManagedWebContents(webContentsId: number): boolean {
		return BrowserViewServiceV2.managedWebContentsIds.has(webContentsId);
	}

	// Browser views storage
	private browserViews = new Map<number, WebContentsView>();
	private browserWindows = new Map<number, BrowserWindow>();

	// DevTools views (ON-DEMAND, not pre-created)
	private devtoolsViews = new Map<number, WebContentsView>();

	// CDP debugger state
	private debuggerAttached = new Map<number, boolean>();

	// Remote debugging port counter
	private debuggingPortCounter = 9222;

	// ============================================
	// Browser View Lifecycle
	// ============================================

	async createBrowserView(windowId: number): Promise<BrowserViewResult> {
		const window = BrowserWindow.fromId(windowId);
		if (!window) {
			throw new Error(`Window ${windowId} not found`);
		}

		// Create browser WebContentsView
		const browserView = new WebContentsView({
			webPreferences: {
				nodeIntegration: false,
				contextIsolation: true,
				sandbox: true,
				webSecurity: false, // Allow loading any URL including localhost
				allowRunningInsecureContent: true
			}
		});

		// Add to window
		window.contentView.addChildView(browserView);

		const browserViewId = browserView.webContents.id;
		const debuggingPort = this.debuggingPortCounter++;

		// Store references
		this.browserViews.set(browserViewId, browserView);
		this.browserWindows.set(browserViewId, window);

		// Add to static set for navigation whitelist
		BrowserViewServiceV2.managedWebContentsIds.add(browserViewId);

		// Setup event listeners
		this.setupBrowserEvents(browserView);

		console.log(`[ProjectModeV2] Created browser view ${browserViewId} with debugging port ${debuggingPort}`);

		return { browserViewId, debuggingPort };
	}

	async destroyBrowserView(browserViewId: number): Promise<void> {
		console.log(`[ProjectModeV2] Destroying browser view ${browserViewId}`);

		// First close DevTools if open
		await this.closeDevTools(browserViewId);

		// Detach debugger if attached
		if (this.debuggerAttached.get(browserViewId)) {
			await this.detachDebugger(browserViewId);
		}

		const browserView = this.browserViews.get(browserViewId);
		const window = this.browserWindows.get(browserViewId);

		if (browserView) {
			const webContents = browserView.webContents;

			// 1. Remove from window FIRST
			if (window && !window.isDestroyed() && window.contentView) {
				try {
					window.contentView.removeChildView(browserView);
				} catch (e) {
					console.error('[ProjectModeV2] Error removing browser view from window:', e);
				}
			}

			// 2. Stop and cleanup webContents
			if (webContents && !webContents.isDestroyed()) {
				try {
					webContents.stop();
					webContents.setAudioMuted(true);

					// Navigate to blank to stop any running scripts
					webContents.loadURL('about:blank');

					// Close the webContents (this is the correct method per Electron docs)
					webContents.close();
				} catch (e) {
					console.error('[ProjectModeV2] Error closing browser webContents:', e);
				}
			}

			// 3. Cleanup maps
			this.browserViews.delete(browserViewId);
			this.browserWindows.delete(browserViewId);
			this.debuggerAttached.delete(browserViewId);

			// Remove from static set
			BrowserViewServiceV2.managedWebContentsIds.delete(browserViewId);
		}

		console.log(`[ProjectModeV2] Browser view ${browserViewId} destroyed`);
	}

	async setBrowserBounds(browserViewId: number, bounds: ViewBounds): Promise<void> {
		const browserView = this.browserViews.get(browserViewId);
		if (browserView) {
			browserView.setBounds({
				x: Math.round(bounds.x),
				y: Math.round(bounds.y),
				width: Math.round(bounds.width),
				height: Math.round(bounds.height)
			});
		}
	}

	async setBrowserVisible(browserViewId: number, visible: boolean): Promise<void> {
		const browserView = this.browserViews.get(browserViewId);
		if (browserView) {
			browserView.setVisible(visible);
		}
	}

	// ============================================
	// Navigation
	// ============================================

	async navigate(browserViewId: number, url: string): Promise<void> {
		const browserView = this.browserViews.get(browserViewId);
		if (browserView && !browserView.webContents.isDestroyed()) {
			await browserView.webContents.loadURL(url);
		}
	}

	async goBack(browserViewId: number): Promise<void> {
		const browserView = this.browserViews.get(browserViewId);
		if (browserView && browserView.webContents.canGoBack()) {
			browserView.webContents.goBack();
		}
	}

	async goForward(browserViewId: number): Promise<void> {
		const browserView = this.browserViews.get(browserViewId);
		if (browserView && browserView.webContents.canGoForward()) {
			browserView.webContents.goForward();
		}
	}

	async reload(browserViewId: number, ignoreCache?: boolean): Promise<void> {
		const browserView = this.browserViews.get(browserViewId);
		if (browserView && !browserView.webContents.isDestroyed()) {
			if (ignoreCache) {
				browserView.webContents.reloadIgnoringCache();
			} else {
				browserView.webContents.reload();
			}
		}
	}

	async stop(browserViewId: number): Promise<void> {
		const browserView = this.browserViews.get(browserViewId);
		if (browserView && !browserView.webContents.isDestroyed()) {
			browserView.webContents.stop();
		}
	}

	async getNavigationState(browserViewId: number): Promise<NavigationState> {
		const browserView = this.browserViews.get(browserViewId);
		if (!browserView || browserView.webContents.isDestroyed()) {
			return {
				canGoBack: false,
				canGoForward: false,
				url: '',
				title: '',
				isLoading: false
			};
		}

		const webContents = browserView.webContents;
		return {
			canGoBack: webContents.canGoBack(),
			canGoForward: webContents.canGoForward(),
			url: webContents.getURL(),
			title: webContents.getTitle(),
			isLoading: webContents.isLoading()
		};
	}

	// ============================================
	// DevTools (ON-DEMAND creation)
	// CRITICAL: Create fresh WebContentsView each time
	// ============================================

	async openDevTools(browserViewId: number, bounds: ViewBounds): Promise<DevToolsViewResult> {
		const browserView = this.browserViews.get(browserViewId);
		const window = this.browserWindows.get(browserViewId);

		if (!browserView || !window) {
			throw new Error(`Browser view ${browserViewId} not found`);
		}

		// Close existing DevTools if any
		await this.closeDevTools(browserViewId);

		// CRITICAL: Create FRESH WebContentsView for DevTools
		// Per Electron docs: "The devToolsWebContents must not have done any navigation"
		const devtoolsView = new WebContentsView({
			webPreferences: {
				nodeIntegration: false,
				contextIsolation: true
			}
		});

		// Add to window BEFORE calling setDevToolsWebContents
		window.contentView.addChildView(devtoolsView);

		// Set bounds
		devtoolsView.setBounds({
			x: Math.round(bounds.x),
			y: Math.round(bounds.y),
			width: Math.round(bounds.width),
			height: Math.round(bounds.height)
		});

		// CRITICAL: Call setDevToolsWebContents IMMEDIATELY after creation
		// The devtools WebContents must be fresh/unused
		browserView.webContents.setDevToolsWebContents(devtoolsView.webContents);

		// Open DevTools with detach mode (required for setDevToolsWebContents)
		browserView.webContents.openDevTools({ mode: 'detach' });

		const devtoolsViewId = devtoolsView.webContents.id;
		this.devtoolsViews.set(browserViewId, devtoolsView);

		console.log(`[ProjectModeV2] Opened DevTools ${devtoolsViewId} for browser ${browserViewId}`);

		return { devtoolsViewId };
	}

	async closeDevTools(browserViewId: number): Promise<void> {
		const browserView = this.browserViews.get(browserViewId);
		const devtoolsView = this.devtoolsViews.get(browserViewId);
		const window = this.browserWindows.get(browserViewId);

		if (browserView && !browserView.webContents.isDestroyed()) {
			browserView.webContents.closeDevTools();
		}

		if (devtoolsView) {
			// Remove from window
			if (window && !window.isDestroyed() && window.contentView) {
				try {
					window.contentView.removeChildView(devtoolsView);
				} catch (e) {
					console.error('[ProjectModeV2] Error removing devtools view:', e);
				}
			}

			// Destroy devtools webContents
			if (!devtoolsView.webContents.isDestroyed()) {
				devtoolsView.webContents.close();
			}

			this.devtoolsViews.delete(browserViewId);
			console.log(`[ProjectModeV2] Closed DevTools for browser ${browserViewId}`);
		}
	}

	async setDevToolsBounds(browserViewId: number, bounds: ViewBounds): Promise<void> {
		const devtoolsView = this.devtoolsViews.get(browserViewId);
		if (devtoolsView) {
			devtoolsView.setBounds({
				x: Math.round(bounds.x),
				y: Math.round(bounds.y),
				width: Math.round(bounds.width),
				height: Math.round(bounds.height)
			});
		}
	}

	async isDevToolsOpen(browserViewId: number): Promise<boolean> {
		const browserView = this.browserViews.get(browserViewId);
		if (browserView && !browserView.webContents.isDestroyed()) {
			return browserView.webContents.isDevToolsOpened();
		}
		return false;
	}

	// ============================================
	// CDP (Chrome DevTools Protocol)
	// ============================================

	async attachDebugger(browserViewId: number, protocolVersion: string = '1.3'): Promise<void> {
		const browserView = this.browserViews.get(browserViewId);
		if (!browserView || browserView.webContents.isDestroyed()) {
			throw new Error(`Browser view ${browserViewId} not found`);
		}

		if (!this.debuggerAttached.get(browserViewId)) {
			try {
				browserView.webContents.debugger.attach(protocolVersion);
				this.debuggerAttached.set(browserViewId, true);
				console.log(`[ProjectModeV2] CDP debugger attached to ${browserViewId}`);
			} catch (e) {
				console.error('[ProjectModeV2] Failed to attach debugger:', e);
				throw e;
			}
		}
	}

	async detachDebugger(browserViewId: number): Promise<void> {
		const browserView = this.browserViews.get(browserViewId);
		if (browserView && !browserView.webContents.isDestroyed() && this.debuggerAttached.get(browserViewId)) {
			try {
				browserView.webContents.debugger.detach();
				this.debuggerAttached.set(browserViewId, false);
				console.log(`[ProjectModeV2] CDP debugger detached from ${browserViewId}`);
			} catch (e) {
				console.error('[ProjectModeV2] Failed to detach debugger:', e);
			}
		}
	}

	async enableCDPDomains(browserViewId: number, domains: CDPDomains): Promise<void> {
		const browserView = this.browserViews.get(browserViewId);
		if (!browserView || browserView.webContents.isDestroyed()) {
			throw new Error(`Browser view ${browserViewId} not found`);
		}

		// Ensure debugger is attached
		if (!this.debuggerAttached.get(browserViewId)) {
			await this.attachDebugger(browserViewId);
		}

		const debugger_ = browserView.webContents.debugger;

		if (domains.network) {
			await debugger_.sendCommand('Network.enable');
		}
		if (domains.dom) {
			await debugger_.sendCommand('DOM.enable');
		}
		if (domains.css) {
			await debugger_.sendCommand('CSS.enable');
		}
		if (domains.runtime) {
			await debugger_.sendCommand('Runtime.enable');
		}
		if (domains.performance) {
			await debugger_.sendCommand('Performance.enable');
		}
		if (domains.page) {
			await debugger_.sendCommand('Page.enable');
		}

		console.log(`[ProjectModeV2] CDP domains enabled for ${browserViewId}:`, domains);
	}

	async sendCDPCommand(browserViewId: number, method: string, params?: any): Promise<any> {
		const browserView = this.browserViews.get(browserViewId);
		if (!browserView || browserView.webContents.isDestroyed()) {
			throw new Error(`Browser view ${browserViewId} not found`);
		}

		if (!this.debuggerAttached.get(browserViewId)) {
			await this.attachDebugger(browserViewId);
		}

		return browserView.webContents.debugger.sendCommand(method, params);
	}

	// ============================================
	// Device Emulation (via CDP)
	// ============================================

	async setDeviceEmulation(browserViewId: number, device: DevicePreset): Promise<void> {
		console.log(`[ProjectModeV2] Setting device emulation for ${browserViewId}:`, device.name);

		await this.sendCDPCommand(browserViewId, 'Emulation.setDeviceMetricsOverride', {
			width: device.width,
			height: device.height,
			deviceScaleFactor: device.deviceScaleFactor,
			mobile: device.mobile
		});

		if (device.userAgent) {
			await this.sendCDPCommand(browserViewId, 'Emulation.setUserAgentOverride', {
				userAgent: device.userAgent
			});
		}

		// Enable touch events for mobile
		if (device.mobile) {
			await this.sendCDPCommand(browserViewId, 'Emulation.setTouchEmulationEnabled', {
				enabled: true
			});
		}
	}

	async clearDeviceEmulation(browserViewId: number): Promise<void> {
		console.log(`[ProjectModeV2] Clearing device emulation for ${browserViewId}`);

		await this.sendCDPCommand(browserViewId, 'Emulation.clearDeviceMetricsOverride');
		await this.sendCDPCommand(browserViewId, 'Emulation.setTouchEmulationEnabled', {
			enabled: false
		});
	}

	// ============================================
	// Utilities
	// ============================================

	async takeScreenshot(browserViewId: number): Promise<string> {
		const browserView = this.browserViews.get(browserViewId);
		if (!browserView || browserView.webContents.isDestroyed()) {
			throw new Error(`Browser view ${browserViewId} not found`);
		}

		const image = await browserView.webContents.capturePage();
		return image.toDataURL();
	}

	async executeScript(browserViewId: number, script: string): Promise<any> {
		const browserView = this.browserViews.get(browserViewId);
		if (!browserView || browserView.webContents.isDestroyed()) {
			throw new Error(`Browser view ${browserViewId} not found`);
		}

		return browserView.webContents.executeJavaScript(script);
	}

	async getPageHTML(browserViewId: number): Promise<string> {
		return this.executeScript(browserViewId, 'document.documentElement.outerHTML');
	}

	async getDebuggingUrl(browserViewId: number): Promise<string> {
		const browserView = this.browserViews.get(browserViewId);
		if (!browserView || browserView.webContents.isDestroyed()) {
			throw new Error(`Browser view ${browserViewId} not found`);
		}

		// Return WebSocket URL for MCP connection
		return browserView.webContents.debugger.isAttached()
			? `ws://127.0.0.1:9222/devtools/page/${browserViewId}`
			: '';
	}

	// ============================================
	// Private Helpers
	// ============================================

	private setupBrowserEvents(browserView: WebContentsView): void {
		const webContents = browserView.webContents;

		webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
			console.error(`[ProjectModeV2] Load failed: ${validatedURL} - ${errorDescription} (${errorCode})`);
		});

		webContents.on('did-navigate', (_event, url) => {
			console.log(`[ProjectModeV2] Navigated to: ${url}`);
		});

		webContents.on('page-title-updated', (_event, title) => {
			console.log(`[ProjectModeV2] Title updated: ${title}`);
		});

		// Handle new window requests
		webContents.setWindowOpenHandler(({ url }) => {
			// Load in same view instead of opening new window
			webContents.loadURL(url);
			return { action: 'deny' };
		});
	}
}
