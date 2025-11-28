/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { BrowserWindow, WebContentsView, session, app } from 'electron';
import { Emitter, Event } from '../../../../../base/common/event.js';
import type { IProjectModeService } from '../../common/projectMode/ipc.js';
import type { ViewBounds, DevicePreset, BrowserViewResult, DevToolsViewResult, NavigationState, CDPDomains, NavigationError, DevToolsOptions, DevToolsMode, DevToolsClosedEvent, NavigationStateChangedEvent, OverlayMessageEvent } from '../../common/projectMode/types.js';
import { DevToolsExtensionLoader } from './devtoolsExtensionLoader.js';

/**
 * Browser View Service
 *
 * Main process service managing WebContentsView lifecycle with:
 * - Proper destruction to avoid ghost processes
 * - ON-DEMAND DevTools creation (fresh WebContentsView each time)
 * - CDP debugger integration
 * - Device emulation via CDP
 */
export class BrowserViewService implements IProjectModeService {
	readonly _serviceBrand: undefined;

	// ============================================
	// Events
	// ============================================

	private readonly _onDevToolsClosed = new Emitter<DevToolsClosedEvent>();
	readonly onDevToolsClosed: Event<DevToolsClosedEvent> = this._onDevToolsClosed.event;

	private readonly _onNavigationStateChanged = new Emitter<NavigationStateChangedEvent>();
	readonly onNavigationStateChanged: Event<NavigationStateChangedEvent> = this._onNavigationStateChanged.event;

	private readonly _onOverlayMessage = new Emitter<OverlayMessageEvent>();
	readonly onOverlayMessage: Event<OverlayMessageEvent> = this._onOverlayMessage.event;

	// Static set of managed webContents IDs for navigation whitelist
	// This is used by app.ts to allow navigation for our browser views
	private static managedWebContentsIds = new Set<number>();

	// Track if session has been configured (only configure ONCE)
	private static sessionConfigured = false;

	/**
	 * Check if a webContents ID is managed by ProjectMode
	 * Called by app.ts to allow navigation for our browser views
	 */
	static isManagedWebContents(webContentsId: number): boolean {
		return BrowserViewService.managedWebContentsIds.has(webContentsId);
	}

	// Browser views storage
	private browserViews = new Map<number, WebContentsView>();
	private browserWindows = new Map<number, BrowserWindow>();

	// DevTools views (ON-DEMAND, not pre-created)
	// Only populated in 'detached' mode - in 'attached' mode, Electron manages DevTools
	private devtoolsViews = new Map<number, WebContentsView>();

	// Track DevTools mode per browser view
	private devtoolsModes = new Map<number, DevToolsMode>();

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
		// Configure Session for Localhost Support (ONCE only)
		// =========================================================
		const browserSession = session.fromPartition('persist:roopik-browser', { cache: true });

		if (!BrowserViewService.sessionConfigured) {
			BrowserViewService.sessionConfigured = true;

			// A. Bypass Proxy for Localhost
			// Electron often tries to route localhost through system proxies. Force direct connection.
			await browserSession.setProxy({
				mode: 'direct', // Use direct connection, bypass system proxy entirely
				proxyBypassRules: 'localhost;127.0.0.1;[::1];*.local'
			});

			// B. Disable Certificate Verification (Trust Self-Signed Certs)
			// React/Vite/Next.js dev servers often use self-signed certs. Electron blocks them silently.
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

			// D. Load DevTools Extensions (React DevTools, Vue DevTools, etc.)
			// Extensions are loaded from resources/devtools-extensions/
			// User can add new extensions by extracting CRX files and updating manifest.json
			this.loadDevToolsExtensionsAsync(browserSession);
		}

		// =========================================================
		// End of Session Configuration
		// =========================================================

		// Create browser WebContentsView with custom session
		const browserView = new WebContentsView({
			webPreferences: {
				nodeIntegration: false,
				contextIsolation: true,
				sandbox: false,
				webSecurity: false,
				allowRunningInsecureContent: true,
				session: browserSession // CRITICAL: Use our configured session for localhost support
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
		BrowserViewService.managedWebContentsIds.add(browserViewId);

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

		return { browserViewId, debuggingPort };
	}

	async destroyBrowserView(browserViewId: number): Promise<void> {

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
					console.error('[ProjectMode] Error removing browser view from window:', e);
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
					console.error('[ProjectMode] Error closing browser webContents:', e);
				}
			}

			// 3. Cleanup maps
			this.browserViews.delete(browserViewId);
			this.browserWindows.delete(browserViewId);
			this.debuggerAttached.delete(browserViewId);
			this.lastNavigationErrors.delete(browserViewId);

			// Remove from static set
			BrowserViewService.managedWebContentsIds.delete(browserViewId);
		}
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
		if (!browserView) {
			console.error(`[ProjectMode] navigate() FAILED: browserView not found for ID ${browserViewId}`);
			return;
		}

		if (browserView.webContents.isDestroyed()) {
			console.error(`[ProjectMode] navigate() FAILED: webContents is destroyed for ID ${browserViewId}`);
			return;
		}

		await browserView.webContents.loadURL(url);
	}

	async goBack(browserViewId: number): Promise<void> {
		const browserView = this.browserViews.get(browserViewId);
		if (browserView && browserView.webContents.navigationHistory.canGoBack()) {
			browserView.webContents.navigationHistory.goBack();
		}
	}

	async goForward(browserViewId: number): Promise<void> {
		const browserView = this.browserViews.get(browserViewId);
		if (browserView && browserView.webContents.navigationHistory.canGoForward()) {
			browserView.webContents.navigationHistory.goForward();
		}
	}

	async reload(browserViewId: number, ignoreCache?: boolean): Promise<void> {
		const browserView = this.browserViews.get(browserViewId);
		if (browserView && !browserView.webContents.isDestroyed()) {
			if (ignoreCache) {
				// TRUE Hard Reload: Clear session cache completely, then reload
				// This is equivalent to Chrome's "Empty Cache and Hard Reload"
				const browserSession = browserView.webContents.session;
				try {
					await browserSession.clearCache();
					console.log('[ProjectMode] Cache cleared for hard reload');
				} catch (e) {
					console.error('[ProjectMode] Failed to clear cache:', e);
				}
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
			canGoBack: webContents.navigationHistory.canGoBack(),
			canGoForward: webContents.navigationHistory.canGoForward(),
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

	/**
	 * Fire navigation state changed event
	 * Called on navigation events to notify renderer without polling
	 *
	 * @param browserViewId - The browser view ID
	 * @param isLoadingOverride - Optional explicit loading state. When provided, this value
	 *                            is used instead of querying webContents.isLoading().
	 *                            This is CRITICAL for did-stop-loading event because
	 *                            webContents.isLoading() can sometimes still return true
	 *                            due to timing issues on certain sites like Google/Facebook.
	 */
	private fireNavigationStateChanged(browserViewId: number, isLoadingOverride?: boolean): void {
		const browserView = this.browserViews.get(browserViewId);
		if (!browserView || browserView.webContents.isDestroyed()) {
			return;
		}

		const webContents = browserView.webContents;
		const lastError = this.lastNavigationErrors.get(browserViewId);

		// Use override if provided, otherwise query webContents
		const isLoading = isLoadingOverride !== undefined ? isLoadingOverride : webContents.isLoading();

		this._onNavigationStateChanged.fire({
			browserViewId,
			url: webContents.getURL(),
			title: webContents.getTitle(),
			isLoading,
			canGoBack: webContents.navigationHistory.canGoBack(),
			canGoForward: webContents.navigationHistory.canGoForward(),
			lastError
		});
	}

	// ============================================
	// DevTools (ON-DEMAND creation)
	// Supports two modes:
	// - 'attached': Docked inside browser window (Device Toolbar available)
	// - 'detached': Separate WebContentsView (full layout control)
	// ============================================

	async openDevTools(browserViewId: number, options: DevToolsOptions): Promise<DevToolsViewResult> {
		const browserView = this.browserViews.get(browserViewId);
		const window = this.browserWindows.get(browserViewId);

		if (!browserView || !window) {
			throw new Error(`Browser view ${browserViewId} not found`);
		}

		// Validate options - must have mode
		if (!options || !options.mode) {
			console.error(`[ProjectMode] openDevTools error: options or options.mode is undefined. Received:`, options);
			throw new Error(`DevTools options are required. Received: ${JSON.stringify(options)}`);
		}

		// Close existing DevTools if any
		await this.closeDevTools(browserViewId);

		// Store the mode for this browser view
		this.devtoolsModes.set(browserViewId, options.mode);

		if (options.mode === 'attached') {
			// =========================================================
			// ATTACHED MODE: DevTools docked inside browser window
			// Device Toolbar toggle and close button are available!
			// =========================================================

			// Open DevTools docked at bottom of the browser window
			// This gives us the Device Toolbar toggle and close button
			browserView.webContents.openDevTools({ mode: 'bottom' });

			// In attached mode, we don't create a separate view - Electron manages it
			// Return -1 as devtoolsViewId to indicate attached mode
			return { devtoolsViewId: -1 };
		} else {
			// =========================================================
			// DETACHED MODE: DevTools in separate WebContentsView
			// Full layout control, but NO Device Toolbar toggle
			// =========================================================

			if (!options.bounds) {
				throw new Error('Bounds are required for detached DevTools mode');
			}

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
				x: Math.round(options.bounds.x),
				y: Math.round(options.bounds.y),
				width: Math.round(options.bounds.width),
				height: Math.round(options.bounds.height)
			});

			// CRITICAL: Call setDevToolsWebContents IMMEDIATELY after creation
			// The devtools WebContents must be fresh/unused
			browserView.webContents.setDevToolsWebContents(devtoolsView.webContents);

			// Open DevTools with detach mode (required for setDevToolsWebContents)
			browserView.webContents.openDevTools({ mode: 'detach' });

			const devtoolsViewId = devtoolsView.webContents.id;
			this.devtoolsViews.set(browserViewId, devtoolsView);

			return { devtoolsViewId };
		}
	}

	async closeDevTools(browserViewId: number): Promise<void> {
		const browserView = this.browserViews.get(browserViewId);
		const devtoolsView = this.devtoolsViews.get(browserViewId);
		const window = this.browserWindows.get(browserViewId);

		// Close DevTools on browser webContents (works for both modes)
		// Graceful check - browser may already be destroyed
		if (browserView && !browserView.webContents.isDestroyed()) {
			try {
				browserView.webContents.closeDevTools();
			} catch (e) {
				console.error('[ProjectMode] Error closing devtools on browser:', e);
			}
		}

		// ALWAYS cleanup detached DevTools WebContentsView if it exists
		// Don't rely on mode - the view existing is enough to know we need to clean it up
		// This fixes the bug where DevTools remained visible after browser tab closed
		if (devtoolsView) {
			// Remove from window
			if (window && !window.isDestroyed() && window.contentView) {
				try {
					window.contentView.removeChildView(devtoolsView);
				} catch (e) {
					// Graceful - view may already be removed
					console.error('[ProjectMode] Error removing devtools view:', e);
				}
			}

			// Destroy devtools webContents
			if (!devtoolsView.webContents.isDestroyed()) {
				try {
					devtoolsView.webContents.close();
				} catch (e) {
					// Graceful - webContents may already be destroyed
					console.error('[ProjectMode] Error closing devtools webContents:', e);
				}
			}

			this.devtoolsViews.delete(browserViewId);
		}

		// Clear mode tracking
		this.devtoolsModes.delete(browserViewId);
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
			} catch (e) {
				console.error('[ProjectMode] Failed to attach debugger:', e);
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
			} catch (e) {
				console.error('[ProjectMode] Failed to detach debugger:', e);
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
	// DevTools Extensions
	// ============================================

	/**
	 * Load DevTools extensions asynchronously (fire-and-forget)
	 * Called once during session initialization
	 */
	private loadDevToolsExtensionsAsync(browserSession: Electron.Session): void {
		// Get app path - this is where resources/ folder is located
		const appPath = app.getAppPath();

		// Load extensions asynchronously - don't block browser creation
		const loader = DevToolsExtensionLoader.getInstance(appPath);
		loader.loadExtensions(browserSession)
			.then(results => {
				const loaded = results.filter(r => r.success);
				const failed = results.filter(r => !r.success);

				if (loaded.length > 0) {
					console.log(`[ProjectMode] Loaded ${loaded.length} DevTools extension(s): ${loaded.map(r => r.name).join(', ')}`);
				}
				if (failed.length > 0) {
					console.warn(`[ProjectMode] Failed to load ${failed.length} extension(s): ${failed.map(r => `${r.name} (${r.error})`).join(', ')}`);
				}
			})
			.catch(e => {
				console.error('[ProjectMode] Error loading DevTools extensions:', e);
			});
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
			// Fire and forget - we don't await because the window is dying
			this.destroyBrowserViewSync(browserViewId);
		};

		// 1. MOST IMPORTANT: 'did-start-loading' fires immediately when IDE reloads (Ctrl+R / Reload Window)
		window.webContents.once('did-start-loading', autoDestruct);

		// 2. If the IDE window is closed entirely
		window.once('closed', autoDestruct);

		// 3. If the renderer process crashes or is killed
		window.webContents.once('render-process-gone', autoDestruct);

		// 4. If webContents is destroyed
		window.webContents.once('destroyed', autoDestruct);
	}

	/**
	 * Synchronous destroy - used by safety leash during window lifecycle events
	 * Must be robust and never throw - the window is dying anyway
	 */
	private destroyBrowserViewSync(browserViewId: number): void {
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
		BrowserViewService.managedWebContentsIds.delete(browserViewId);
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
				return;
			}
			console.error(`[ProjectMode] Load failed: ${validatedURL} - ${errorDescription} (${errorCode})`);
			// Track error so renderer can display it
			this.setNavigationError(browserViewId, errorCode, errorDescription, validatedURL);
			// Fire event to notify renderer
			this.fireNavigationStateChanged(browserViewId);
		});

		// Provisional load failure - catches CONNECTION_REFUSED, NAME_NOT_RESOLVED etc.
		// This fires BEFORE did-fail-load for certain connection errors
		webContents.on('did-fail-provisional-load', (_event, errorCode, errorDescription, validatedURL) => {
			// Skip expected/normal errors
			if (IGNORED_ERROR_CODES.has(errorCode)) {
				return;
			}
			console.error(`[ProjectMode] Provisional load failed: ${validatedURL} - ${errorDescription} (${errorCode})`);
			// Track error so renderer can display it
			this.setNavigationError(browserViewId, errorCode, errorDescription, validatedURL);
			// Fire event to notify renderer
			this.fireNavigationStateChanged(browserViewId);
			// Common error codes:
			// -102: CONNECTION_REFUSED (server not running)
			// -105: NAME_NOT_RESOLVED (DNS issue)
			// -106: INTERNET_DISCONNECTED
			// -7: TIMED_OUT
		});

		// Certificate errors - catch and allow for dev servers
		webContents.on('certificate-error', (event, _url, _error, _certificate, callback) => {
			// Prevent default "Your connection is not private" page
			event.preventDefault();
			callback(true); // Trust the certificate
		});

		webContents.on('did-navigate', () => {
			// Clear any previous error on successful navigation
			this.clearNavigationError(browserViewId);
			// Fire event to notify renderer (URL changed)
			this.fireNavigationStateChanged(browserViewId);
		});

		// Also handle in-page navigation (hash changes, History API)
		webContents.on('did-navigate-in-page', () => {
			// Fire event to notify renderer (URL changed)
			this.fireNavigationStateChanged(browserViewId);
		});

		webContents.on('page-title-updated', () => {
			// Fire event to notify renderer (title changed)
			this.fireNavigationStateChanged(browserViewId);
		});

		webContents.on('did-start-loading', () => {
			// Fire event with EXPLICIT isLoading = true
			this.fireNavigationStateChanged(browserViewId, true);
		});

		webContents.on('did-finish-load', () => {
			// Clear any previous error on successful load
			this.clearNavigationError(browserViewId);
			// Fire event with EXPLICIT isLoading = false
			this.fireNavigationStateChanged(browserViewId, false);
		});

		// did-stop-loading is more reliable than did-finish-load for complex pages
		webContents.on('did-stop-loading', () => {
			// Fire event with EXPLICIT isLoading = false
			this.fireNavigationStateChanged(browserViewId, false);

			// CRITICAL: Set visual zoom limits AFTER page loads (per Electron docs)
			// This enables pinch-to-zoom on touchpads
			// Must be called after content is loaded for visual zoom to work properly
			webContents.setVisualZoomLevelLimits(1, 5);
		});

		// NOTE: New window requests (Ctrl+Click, target="_blank", window.open, etc.)
		// are handled in app.ts via the global setWindowOpenHandler.
		// It checks isManagedWebContents() and redirects to the same view.
		// This keeps all new-window logic centralized in app.ts.

		// Fallback: Handle any windows that somehow bypass the app.ts handler
		webContents.on('did-create-window', (newWindow) => {
			// Redirect to same view and close the new window
			const url = newWindow.webContents.getURL();
			if (url && url !== 'about:blank') {
				webContents.loadURL(url);
			}
			newWindow.close();
		});

		// DevTools closed event - fires when user closes via built-in X button
		// This allows renderer to sync its state without polling
		webContents.on('devtools-closed', () => {
			this._onDevToolsClosed.fire({ browserViewId });
			this.devtoolsModes.delete(browserViewId);
		});
	}

	// ============================================
	// Zoom Handling (Native Browser Feel)
	// ============================================

	private setupZoomHandlers(browserView: WebContentsView): void {
		const wc = browserView.webContents;

		// NOTE: setVisualZoomLevelLimits is called in did-stop-loading event
		// (after page loads) per Electron documentation requirements
		// This ensures visual zoom works properly with pinch gestures

		// Handle keyboard zoom shortcuts (Ctrl++, Ctrl+-, Ctrl+0)
		wc.on('before-input-event', (event, input) => {
			if (input.type !== 'keyDown') return;
			if (!input.control && !input.meta) return;

			const currentZoom = wc.getZoomLevel();

			if (input.code === 'Equal' || input.code === 'NumpadAdd' || input.key === '+' || input.key === '=') {
				wc.setZoomLevel(currentZoom + 0.5);
				event.preventDefault();
			}
			else if (input.code === 'Minus' || input.code === 'NumpadSubtract' || input.key === '-') {
				wc.setZoomLevel(currentZoom - 0.5);
				event.preventDefault();
			}
			else if (input.code === 'Digit0' || input.code === 'Numpad0' || input.key === '0') {
				wc.setZoomLevel(0);
				event.preventDefault();
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

		// Listen for console messages from the overlay
		// Messages with 'ROOPIK_MSG:' prefix are routed to the renderer
		overlayView.webContents.on('console-message', (_event, _level, message) => {
			if (message.startsWith('ROOPIK_MSG:')) {
				try {
					const payload = JSON.parse(message.substring('ROOPIK_MSG:'.length));
					this._onOverlayMessage.fire({
						overlayViewId,
						browserViewId,
						message: payload
					});
				} catch (e) {
					console.error('[ProjectMode] Failed to parse overlay message:', e);
				}
			}
		});

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
						console.error('[ProjectMode] Error bringing overlay to top:', e);
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
				console.error('[ProjectMode] Error removing overlay view:', e);
			}
		}

		// Destroy webContents
		if (!view.webContents.isDestroyed()) {
			try {
				view.webContents.close();
			} catch (e) {
				console.error('[ProjectMode] Error closing overlay webContents:', e);
			}
		}

		this.overlayViews.delete(overlayViewId);
	}

	/**
	 * Execute JavaScript in an overlay view
	 * Used for getting/setting state in the floating toolbar
	 */
	async executeScriptOnOverlay(overlayViewId: number, script: string): Promise<any> {
		const overlayData = this.overlayViews.get(overlayViewId);
		if (!overlayData || overlayData.view.webContents.isDestroyed()) {
			throw new Error(`Overlay view ${overlayViewId} not found`);
		}

		return overlayData.view.webContents.executeJavaScript(script);
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
