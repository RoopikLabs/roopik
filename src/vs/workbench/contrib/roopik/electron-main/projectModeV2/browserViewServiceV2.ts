/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { BrowserWindow, WebContentsView, session } from 'electron';
import type { IProjectModeV2Service } from '../../common/projectModeV2/ipc.js';
import type { ViewBounds, DevicePreset, BrowserViewResult, DevToolsViewResult, NavigationState, CDPDomains, NavigationError } from '../../common/projectModeV2/types.js';

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

	// Overlay views (for floating toolbar, menus)
	// Maps overlayViewId -> { view, parentBrowserViewId }
	private overlayViews = new Map<number, { view: WebContentsView; parentBrowserViewId: number }>();

	// CDP debugger state
	private debuggerAttached = new Map<number, boolean>();

	// Navigation errors - track last error per browser view
	private lastNavigationErrors = new Map<number, NavigationError>();

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

		// =========================================================
		// Configure Session for Localhost Support
		// =========================================================
		const browserSession = session.fromPartition('persist:roopik-browser', { cache: true });

		// A. Bypass Proxy for Localhost
		// Electron often tries to route localhost through system proxies. Force direct connection.
		console.log('[ProjectModeV2] Setting up proxy bypass for localhost...');
		await browserSession.setProxy({
			mode: 'direct', // Use direct connection, bypass system proxy entirely
			proxyBypassRules: 'localhost;127.0.0.1;[::1];*.local'
		});

		// B. Disable Certificate Verification (Trust Self-Signed Certs)
		// React/Vite/Next.js dev servers often use self-signed certs. Electron blocks them silently.
		console.log('[ProjectModeV2] Setting up certificate verify proc...');
		browserSession.setCertificateVerifyProc((_request, callback) => {
			// Return 0 to indicate verification success (trust all certs for dev)
			callback(0);
		});

		// C. Auto-Grant Permissions for Dev
		// Local dev servers often request permissions causing invisible prompts.
		browserSession.setPermissionRequestHandler((_webContents, permission, callback) => {
			const allowedPermissions = ['media', 'geolocation', 'notifications', 'clipboard-read', 'clipboard-write', 'midi', 'pointerLock', 'fullscreen'];
			callback(allowedPermissions.includes(permission));
		});

		// =========================================================
		// End of Session Configuration
		// =========================================================

		// Create browser WebContentsView with custom session
		const browserView = new WebContentsView({
			webPreferences: {
				nodeIntegration: false,
				contextIsolation: true, // Keep this TRUE
				sandbox: false,
				webSecurity: false,
				// ADD THIS: This allows executeJavaScript to use internal Electron APIs
				// safely without exposing them to the raw internet.
				nodeIntegrationInSubFrames: false,
				preload: undefined // Ensure you aren't blocking it via preload
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

		// Setup zoom handlers (keyboard + touchpad pinch)
		this.setupZoomHandlers(browserView);

		// Setup event listeners
		this.setupBrowserEvents(browserView);

		// =========================================================================
		// CRITICAL: THE SAFETY LEASH
		// Auto-destroy views when parent window reloads or closes
		// This is the KEY fix for ghost browser views!
		// =========================================================================
		this.attachSafetyLeash(window, browserViewId);

		console.log(`[ProjectModeV2] Created browser view ${browserViewId} with debugging port ${debuggingPort}`);

		return { browserViewId, debuggingPort };
	}

	async destroyBrowserView(browserViewId: number): Promise<void> {
		console.log(`[ProjectModeV2] Destroying browser view ${browserViewId}`);

		// First destroy any overlay views
		this.destroyOverlaysForBrowser(browserViewId);

		// Close DevTools if open
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
			this.lastNavigationErrors.delete(browserViewId);

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
		console.log(`[ProjectModeV2] navigate() called: browserViewId=${browserViewId}, url=${url}`);

		const browserView = this.browserViews.get(browserViewId);
		if (!browserView) {
			console.error(`[ProjectModeV2] navigate() FAILED: browserView not found for ID ${browserViewId}`);
			console.log(`[ProjectModeV2] Current browserViews keys:`, Array.from(this.browserViews.keys()));
			return;
		}

		if (browserView.webContents.isDestroyed()) {
			console.error(`[ProjectModeV2] navigate() FAILED: webContents is destroyed for ID ${browserViewId}`);
			return;
		}

		console.log(`[ProjectModeV2] Loading URL: ${url}`);
		await browserView.webContents.loadURL(url);
		console.log(`[ProjectModeV2] URL loaded successfully: ${url}`);
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
		const lastError = this.lastNavigationErrors.get(browserViewId);

		return {
			canGoBack: webContents.canGoBack(),
			canGoForward: webContents.canGoForward(),
			url: webContents.getURL(),
			title: webContents.getTitle(),
			isLoading: webContents.isLoading(),
			lastError
		};
	}

	/**
	 * Clear navigation error for a browser view
	 * Called when navigation succeeds
	 */
	private clearNavigationError(browserViewId: number): void {
		this.lastNavigationErrors.delete(browserViewId);
	}

	/**
	 * Set navigation error for a browser view
	 * Called when navigation fails
	 */
	private setNavigationError(browserViewId: number, errorCode: number, errorDescription: string, validatedURL: string): void {
		this.lastNavigationErrors.set(browserViewId, {
			errorCode,
			errorDescription,
			validatedURL
		});
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

	/**
	 * CRITICAL: THE SAFETY LEASH
	 *
	 * This is the KEY fix for ghost browser views!
	 *
	 * In Electron, the Main Process (where WebContentsView lives) and the Renderer Process
	 * (the VS Code window) are completely separate. When you reload the IDE (Renderer),
	 * the IDE dies and comes back. But the Main Process NEVER stops running - it has no idea
	 * the IDE "died", so it keeps holding onto that browser view.
	 *
	 * The fix: Attach listeners to the parent window that auto-destroy views on reload/close.
	 *
	 * KEY EVENT: 'did-start-loading' fires the MILLISECOND you press "Reload Window",
	 * BEFORE the new UI is ready, giving us a clean visual wipe.
	 */
	private attachSafetyLeash(window: BrowserWindow, browserViewId: number): void {
		// Define a cleanup function that triggers automatically
		const autoDestruct = () => {
			console.log(`[ProjectModeV2] SAFETY LEASH TRIGGERED - Auto-destroying browser view ${browserViewId}`);
			// Fire and forget - we don't await because the window is dying
			this.destroyBrowserViewSync(browserViewId);
		};

		// 1. MOST IMPORTANT: 'did-start-loading' fires immediately when IDE reloads (Ctrl+R / Reload Window)
		//    This is the event that fires the MILLISECOND you press reload!
		window.webContents.once('did-start-loading', () => {
			console.log(`[ProjectModeV2] Window did-start-loading -> triggering safety leash`);
			autoDestruct();
		});

		// 2. If the IDE window is closed entirely
		window.once('closed', () => {
			console.log(`[ProjectModeV2] Window closed -> triggering safety leash`);
			autoDestruct();
		});

		// 3. If the renderer process crashes or is killed
		window.webContents.once('render-process-gone', (_event, details) => {
			console.log(`[ProjectModeV2] Renderer process gone (${details.reason}) -> triggering safety leash`);
			autoDestruct();
		});

		// 4. If webContents is destroyed
		window.webContents.once('destroyed', () => {
			console.log(`[ProjectModeV2] WebContents destroyed -> triggering safety leash`);
			autoDestruct();
		});

		console.log(`[ProjectModeV2] Safety leash attached for browser view ${browserViewId}`);
	}

	/**
	 * Synchronous destroy - used by safety leash during window lifecycle events
	 * Must be robust and never throw - the window is dying anyway
	 */
	private destroyBrowserViewSync(browserViewId: number): void {
		console.log(`[ProjectModeV2] Sync destroying browser view ${browserViewId}`);

		// Destroy overlay views first
		this.destroyOverlaysForBrowser(browserViewId);

		const browserView = this.browserViews.get(browserViewId);
		const devtoolsView = this.devtoolsViews.get(browserViewId);
		const window = this.browserWindows.get(browserViewId);

		// Close DevTools first
		if (browserView && !browserView.webContents.isDestroyed()) {
			try {
				browserView.webContents.closeDevTools();
			} catch (e) {
				// Ignore - window might be dead
			}
		}

		// Remove and destroy DevTools view
		if (devtoolsView) {
			if (window && !window.isDestroyed() && window.contentView) {
				try {
					window.contentView.removeChildView(devtoolsView);
				} catch (e) {
					// Ignore
				}
			}
			if (!devtoolsView.webContents.isDestroyed()) {
				try {
					devtoolsView.webContents.close();
				} catch (e) {
					// Ignore
				}
			}
			this.devtoolsViews.delete(browserViewId);
		}

		// Detach debugger
		if (browserView && !browserView.webContents.isDestroyed() && this.debuggerAttached.get(browserViewId)) {
			try {
				browserView.webContents.debugger.detach();
			} catch (e) {
				// Ignore
			}
		}

		// Remove and destroy browser view
		if (browserView) {
			if (window && !window.isDestroyed() && window.contentView) {
				try {
					window.contentView.removeChildView(browserView);
				} catch (e) {
					// Ignore
				}
			}
			if (!browserView.webContents.isDestroyed()) {
				try {
					browserView.webContents.stop();
					browserView.webContents.close();
				} catch (e) {
					// Ignore
				}
			}
		}

		// Cleanup all maps
		this.browserViews.delete(browserViewId);
		this.browserWindows.delete(browserViewId);
		this.debuggerAttached.delete(browserViewId);
		this.lastNavigationErrors.delete(browserViewId);
		BrowserViewServiceV2.managedWebContentsIds.delete(browserViewId);

		console.log(`[ProjectModeV2] Browser view ${browserViewId} sync destroyed`);
	}

	private setupBrowserEvents(browserView: WebContentsView): void {
		const webContents = browserView.webContents;
		const browserViewId = webContents.id;

		// Error codes that are expected/normal and should NOT be logged as errors:
		// -3: ERR_ABORTED - Normal navigation cancellation (user navigated away, pressed stop, or new navigation started)
		const IGNORED_ERROR_CODES = new Set([-3]);

		// Standard load failure
		webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
			// Skip expected/normal errors
			if (IGNORED_ERROR_CODES.has(errorCode)) {
				console.log(`[ProjectModeV2] Load cancelled (normal): ${validatedURL} (${errorCode})`);
				return;
			}
			console.error(`[ProjectModeV2] Load failed: ${validatedURL} - ${errorDescription} (${errorCode})`);
			// Track error so renderer can display it
			this.setNavigationError(browserViewId, errorCode, errorDescription, validatedURL);
		});

		// Provisional load failure - catches CONNECTION_REFUSED, NAME_NOT_RESOLVED etc.
		// This fires BEFORE did-fail-load for certain connection errors
		webContents.on('did-fail-provisional-load', (_event, errorCode, errorDescription, validatedURL) => {
			// Skip expected/normal errors
			if (IGNORED_ERROR_CODES.has(errorCode)) {
				console.log(`[ProjectModeV2] Provisional load cancelled (normal): ${validatedURL} (${errorCode})`);
				return;
			}
			console.error(`[ProjectModeV2] Provisional load failed: ${validatedURL} - ${errorDescription} (${errorCode})`);
			// Track error so renderer can display it
			this.setNavigationError(browserViewId, errorCode, errorDescription, validatedURL);
			// Common error codes:
			// -102: CONNECTION_REFUSED (server not running)
			// -105: NAME_NOT_RESOLVED (DNS issue)
			// -106: INTERNET_DISCONNECTED
			// -7: TIMED_OUT
		});

		// Certificate errors - catch and allow for dev servers
		webContents.on('certificate-error', (event, url, error, _certificate, callback) => {
			console.log(`[ProjectModeV2] Certificate error for ${url}: ${error} - Allowing anyway for dev`);
			// Prevent default "Your connection is not private" page
			event.preventDefault();
			callback(true); // Trust the certificate
		});

		webContents.on('did-navigate', (_event, url) => {
			console.log(`[ProjectModeV2] Navigated to: ${url}`);
			// Clear any previous error on successful navigation
			this.clearNavigationError(browserViewId);
		});

		webContents.on('page-title-updated', (_event, title) => {
			console.log(`[ProjectModeV2] Title updated: ${title}`);
		});

		// Log when page starts/finishes loading
		webContents.on('did-start-loading', () => {
			console.log(`[ProjectModeV2] Started loading...`);
		});

		webContents.on('did-finish-load', () => {
			console.log(`[ProjectModeV2] Finished loading`);
			// Clear any previous error on successful load
			this.clearNavigationError(browserViewId);
		});

		// NOTE: New window requests (Ctrl+Click, target="_blank", window.open, etc.)
		// are handled in app.ts via the global setWindowOpenHandler.
		// It checks isManagedWebContents() and redirects to the same view.
		// This keeps all new-window logic centralized in app.ts.

		// Fallback: Handle any windows that somehow bypass the app.ts handler
		webContents.on('did-create-window', (newWindow) => {
			// This fires if a new window was somehow created (shouldn't happen)
			const url = newWindow.webContents.getURL();
			console.log(`[ProjectModeV2] did-create-window (unexpected): ${url} - redirecting and closing`);
			if (url && url !== 'about:blank') {
				webContents.loadURL(url);
			}
			newWindow.close();
		});
	}

	// ============================================
	// Zoom Handling (Native Browser Feel)
	// ============================================

	private setupZoomHandlers(browserView: WebContentsView): void {
		const wc = browserView.webContents;

		// Enable pinch-to-zoom (touchpad gesture zoom)
		// Parameters: minimum zoom factor, maximum zoom factor
		wc.setVisualZoomLevelLimits(1, 5);
		console.log('[ProjectModeV2] Zoom handlers setup - visual zoom limits set (1-5)');

		// Listen for ALL key events to debug
		wc.on('before-input-event', (event, input) => {
			// Log ALL Ctrl/Cmd key presses for debugging
			if (input.control || input.meta) {
				console.log(`[ProjectModeV2] before-input-event: type=${input.type} key=${input.key} code=${input.code} ctrl=${input.control} meta=${input.meta}`);
			}

			if (input.type !== 'keyDown') return;

			// Handle zoom keyboard shortcuts
			if (input.control || input.meta) {
				const currentZoom = wc.getZoomLevel();

				if (input.code === 'Equal' || input.code === 'NumpadAdd' || input.key === '+' || input.key === '=') {
					const newZoom = currentZoom + 0.5;
					wc.setZoomLevel(newZoom);
					console.log(`[ProjectModeV2] ZOOM IN: ${currentZoom} -> ${newZoom}`);
					event.preventDefault();
				}
				else if (input.code === 'Minus' || input.code === 'NumpadSubtract' || input.key === '-') {
					const newZoom = currentZoom - 0.5;
					wc.setZoomLevel(newZoom);
					console.log(`[ProjectModeV2] ZOOM OUT: ${currentZoom} -> ${newZoom}`);
					event.preventDefault();
				}
				else if (input.code === 'Digit0' || input.code === 'Numpad0' || input.key === '0') {
					wc.setZoomLevel(0);
					console.log(`[ProjectModeV2] ZOOM RESET: ${currentZoom} -> 0`);
					event.preventDefault();
				}
			}
		});
	}


	// ============================================
	// Overlay View (for floating toolbar, menus)
	// Creates WebContentsView that renders ON TOP of browser view
	// ============================================

	async createOverlayView(browserViewId: number, bounds: ViewBounds, htmlContent: string): Promise<number> {
		const window = this.browserWindows.get(browserViewId);
		if (!window || window.isDestroyed()) {
			throw new Error(`Window for browser view ${browserViewId} not found`);
		}

		// Create overlay WebContentsView with transparent background
		const overlayView = new WebContentsView({
			webPreferences: {
				nodeIntegration: false,
				contextIsolation: true,
				// Allow inline scripts for our HTML content
				webSecurity: true
			}
		});

		// Set bounds
		overlayView.setBounds({
			x: Math.round(bounds.x),
			y: Math.round(bounds.y),
			width: Math.round(bounds.width),
			height: Math.round(bounds.height)
		});

		// Make background transparent so we only see the UI elements
		overlayView.setBackgroundColor('#00000000');

		// Add to window - this automatically puts it on top of existing views
		// (later additions are on top)
		window.contentView.addChildView(overlayView);

		// Load HTML content as data URL
		const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`;
		await overlayView.webContents.loadURL(dataUrl);

		const overlayViewId = overlayView.webContents.id;

		// Store reference
		this.overlayViews.set(overlayViewId, {
			view: overlayView,
			parentBrowserViewId: browserViewId
		});

		console.log(`[ProjectModeV2] Created overlay view ${overlayViewId} for browser ${browserViewId}`);

		return overlayViewId;
	}

	async setOverlayBounds(overlayViewId: number, bounds: ViewBounds): Promise<void> {
		const overlayData = this.overlayViews.get(overlayViewId);
		if (overlayData) {
			overlayData.view.setBounds({
				x: Math.round(bounds.x),
				y: Math.round(bounds.y),
				width: Math.round(bounds.width),
				height: Math.round(bounds.height)
			});
		}
	}

	async setOverlayContent(overlayViewId: number, htmlContent: string): Promise<void> {
		const overlayData = this.overlayViews.get(overlayViewId);
		if (overlayData && !overlayData.view.webContents.isDestroyed()) {
			const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`;
			await overlayData.view.webContents.loadURL(dataUrl);
		}
	}

	async setOverlayVisible(overlayViewId: number, visible: boolean): Promise<void> {
		const overlayData = this.overlayViews.get(overlayViewId);
		if (overlayData) {
			overlayData.view.setVisible(visible);

			// If making visible, ensure it's on top by re-adding to parent
			if (visible) {
				const window = this.browserWindows.get(overlayData.parentBrowserViewId);
				if (window && !window.isDestroyed() && window.contentView) {
					// Remove and re-add to bring to top
					try {
						window.contentView.removeChildView(overlayData.view);
						window.contentView.addChildView(overlayData.view);
					} catch (e) {
						console.error('[ProjectModeV2] Error bringing overlay to top:', e);
					}
				}
			}
		}
	}

	async destroyOverlayView(overlayViewId: number): Promise<void> {
		const overlayData = this.overlayViews.get(overlayViewId);
		if (!overlayData) {
			return;
		}

		const { view, parentBrowserViewId } = overlayData;
		const window = this.browserWindows.get(parentBrowserViewId);

		// Remove from window
		if (window && !window.isDestroyed() && window.contentView) {
			try {
				window.contentView.removeChildView(view);
			} catch (e) {
				console.error('[ProjectModeV2] Error removing overlay view:', e);
			}
		}

		// Destroy webContents
		if (!view.webContents.isDestroyed()) {
			try {
				view.webContents.close();
			} catch (e) {
				console.error('[ProjectModeV2] Error closing overlay webContents:', e);
			}
		}

		this.overlayViews.delete(overlayViewId);
		console.log(`[ProjectModeV2] Destroyed overlay view ${overlayViewId}`);
	}

	/**
	 * Destroy all overlays for a browser view
	 * Called when browser view is destroyed
	 */
	private destroyOverlaysForBrowser(browserViewId: number): void {
		const overlaysToDestroy: number[] = [];

		for (const [overlayViewId, overlayData] of this.overlayViews) {
			if (overlayData.parentBrowserViewId === browserViewId) {
				overlaysToDestroy.push(overlayViewId);
			}
		}

		for (const overlayViewId of overlaysToDestroy) {
			this.destroyOverlayView(overlayViewId);
		}
	}
}
