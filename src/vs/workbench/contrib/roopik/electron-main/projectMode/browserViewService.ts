/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { BrowserWindow, WebContentsView, session, app } from 'electron';
import { Emitter, Event } from '../../../../../base/common/event.js';
import type { IProjectModeService } from '../../common/projectMode/ipc.js';
import type { ViewBounds, DevicePreset, BrowserViewResult, DevToolsViewResult, NavigationState, CDPDomains, NavigationError, DevToolsOptions, DevToolsClosedEvent, NavigationStateChangedEvent } from '../../common/projectMode/types.js';
import type { GetElementStylesRequest, GetElementStylesResult } from '../../common/cssResolvers/types.js';
import { DevToolsExtensionLoader } from './devtoolsExtensionLoader.js';
import type { ILifecycleMainService } from '../../../../../platform/lifecycle/electron-main/lifecycleMainService.js';
import { LoadReason } from '../../../../../platform/window/electron-main/window.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { CDPCssService } from './cssResolvers/cdpCssService.js';
import { StyleSourceOrchestrator } from './cssResolvers/styleSourceOrchestrator.js';

/**
 * Browser View Service
 *
 * Main process service managing WebContentsView lifecycle with:
 * - Proper destruction to avoid ghost processes
 * - ON-DEMAND DevTools creation (fresh WebContentsView each time)
 * - CDP debugger integration
 * - Device emulation via CDP
 * - Graceful cleanup on window reload (via ILifecycleMainService)
 */
export class BrowserViewService extends Disposable implements IProjectModeService {
	readonly _serviceBrand: undefined;

	// ============================================
	// Events
	// ============================================

	private readonly _onDevToolsClosed = new Emitter<DevToolsClosedEvent>();
	readonly onDevToolsClosed: Event<DevToolsClosedEvent> = this._onDevToolsClosed.event;

	private readonly _onNavigationStateChanged = new Emitter<NavigationStateChangedEvent>();
	readonly onNavigationStateChanged: Event<NavigationStateChangedEvent> = this._onNavigationStateChanged.event;

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


	// Overlay views (for floating toolbar, menus)
	// Maps overlayViewId -> { view, parentBrowserViewId }
	private overlayViews = new Map<number, { view: WebContentsView; parentBrowserViewId: number }>();

	// CDP debugger state
	private debuggerAttached = new Map<number, boolean>();

	// Navigation errors - track last error per browser view
	private lastNavigationErrors = new Map<number, NavigationError>();

	// Remote debugging port counter
	private debuggingPortCounter = 9222;

	// CSS source resolution services
	private cdpCssService: CDPCssService;
	private styleOrchestrators = new Map<string, StyleSourceOrchestrator>(); // projectRoot -> orchestrator

	// ============================================
	// Constructor & Lifecycle Setup
	// ============================================

	constructor(private readonly lifecycleMainService?: ILifecycleMainService) {
		super();
		// Initialize CDP CSS Service with this as the browser service
		this.cdpCssService = new CDPCssService(this);
		this.setupLifecycleHooks();
	}

	/**
	 * Setup lifecycle hooks to gracefully destroy browser views before window reload
	 * This follows approach: destroy BEFORE reload, not during
	 */
	private setupLifecycleHooks(): void {
		if (!this.lifecycleMainService) {
			console.warn('[ProjectMode][Main] ILifecycleMainService not provided, skipping lifecycle hooks');
			return;
		}

		// Listen for window reload events - destroy browser views BEFORE reload happens
		// This is the key: we clean up gracefully before the window reloads, not during
		this._register(this.lifecycleMainService.onWillLoadWindow(e => {
			if (e.reason === LoadReason.RELOAD) {
				// Get Electron BrowserWindow ID (not VS Code window ID)
				const electronWindowId = e.window.win?.id;
				if (electronWindowId !== undefined) {
					console.log('[ProjectMode][Main] Window reload detected, destroying all browser views for window', electronWindowId);
					this.destroyAllBrowserViewsForWindow(electronWindowId);
				} else {
					console.warn('[ProjectMode][Main] Window reload detected but Electron BrowserWindow not available');
				}
			}
		}));
	}

	/**
	 * Destroy all browser views associated with a specific window
	 * Used when window is reloading to prevent ghost browser views
	 */
	private destroyAllBrowserViewsForWindow(windowId: number): void {
		const browserViewIdsToDestroy: number[] = [];

		// Find all browser views for this window
		for (const [browserViewId, window] of this.browserWindows.entries()) {
			if (window.id === windowId) {
				browserViewIdsToDestroy.push(browserViewId);
			}
		}

		console.log('[ProjectMode][Main] Destroying browser views for window reload', {
			windowId,
			browserViewIds: browserViewIdsToDestroy
		});

		// Destroy each browser view synchronously (window is reloading, no time for async)
		for (const browserViewId of browserViewIdsToDestroy) {
			this.destroyBrowserViewSync(browserViewId, 'window-reload');
		}
	}

	// ============================================
	// Browser View Lifecycle
	// ============================================

	async createBrowserView(windowId: number): Promise<BrowserViewResult> {
		console.log('[ProjectMode][Main] createBrowserView() requested for window', windowId);

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

		console.log('[ProjectMode][Main] Browser view CREATED', {
			browserViewId,
			windowId,
			debuggingPort,
			webContentsId: browserView.webContents.id
		});

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
		console.log('[ProjectMode][Main] destroyBrowserView() called for', browserViewId);

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
			console.log('[ProjectMode][Main] Destroying browser view', {
				browserViewId,
				windowId: window?.id,
				webContentsDestroyed: browserView.webContents.isDestroyed()
			});

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
		console.log('[ProjectMode][Main] navigate() requested', { browserViewId, url });

		const browserView = this.browserViews.get(browserViewId);
		if (!browserView) {
			const activeIds = Array.from(this.browserViews.keys());
			const message = `[ProjectMode] navigate() FAILED: browserView not found for ID ${browserViewId}. Active IDs: [${activeIds.join(', ')}]`;
			console.error(message, {
				requestedId: browserViewId,
				activeIds
			});
			// Propagate a hard error back to renderer so UI can show a proper message
			throw new Error(message);
		}

		if (browserView.webContents.isDestroyed()) {
			const message = `[ProjectMode] navigate() FAILED: webContents is destroyed for ID ${browserViewId}`;
			console.error(message, {
				requestedId: browserViewId,
				webContentsDestroyed: true
			});
			throw new Error(message);
		}

		console.log('[ProjectMode][Main] navigate() forwarding to webContents.loadURL()', {
			browserViewId,
			webContentsId: browserView.webContents.id
		});

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
	// DevTools (Attached Mode Only)
	// DevTools docked inside browser window with Device Toolbar available.
	// Users can detach from DevTools settings menu if needed.
	// ============================================

	async openDevTools(browserViewId: number, _options: DevToolsOptions): Promise<DevToolsViewResult> {
		console.log('[ProjectMode][Main] openDevTools() requested for', browserViewId);

		const browserView = this.browserViews.get(browserViewId);

		if (!browserView) {
			console.error('[ProjectMode][Main] openDevTools() FAILED: browser view not found', browserViewId);
			throw new Error(`Browser view ${browserViewId} not found`);
		}

		// Close existing DevTools if any
		await this.closeDevTools(browserViewId);

		// Open DevTools docked at bottom of the browser window
		// This gives us the Device Toolbar toggle and close button
		// Users can detach from DevTools settings menu if they want a separate window
		console.log('[ProjectMode][Main] openDevTools() opening devtools on webContents', browserView.webContents.id);
		browserView.webContents.openDevTools({ mode: 'bottom' });

		// Return -1 as devtoolsViewId since Electron manages the DevTools view
		return { devtoolsViewId: -1 };
	}

	async closeDevTools(browserViewId: number): Promise<void> {
		const browserView = this.browserViews.get(browserViewId);

		// Close DevTools on browser webContents
		// Graceful check - browser may already be destroyed
		if (browserView && !browserView.webContents.isDestroyed()) {
			try {
				browserView.webContents.closeDevTools();
			} catch (e) {
				console.error('[ProjectMode] Error closing devtools on browser:', e);
			}
		}
	}

	async setDevToolsBounds(_browserViewId: number, _bounds: ViewBounds): Promise<void> {
		// In attached mode, Electron manages DevTools layout automatically
		// This method is kept for API compatibility but is a no-op
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
	 * This is a FALLBACK safety mechanism for edge cases (window close, crashes, etc.)
	 *
	 * NOTE: Window reload is now handled gracefully via ILifecycleMainService.onWillLoadWindow
	 * (see setupLifecycleHooks()). This follows approach: destroy browser views
	 * BEFORE the window reloads, not during. This prevents the "browser dies on extension
	 * activity" bug while still preventing ghost browsers after reload.
	 *
	 * The old 'did-start-loading' approach was too broad - it fired on ANY workbench reload,
	 * including when extension panels refreshed, causing false positives.
	 *
	 * Historical note: The commented line below was the original approach, but it caused
	 * browser views to die when the legacy extension's activity panel refreshed.
	 */
	private attachSafetyLeash(window: BrowserWindow, browserViewId: number): void {
		// Define a cleanup function that triggers automatically
		const autoDestruct = (reason: string) => {
			console.log('[ProjectMode][Main] Safety leash auto-destroy triggered', {
				reason,
				windowId: window.id,
				browserViewId
			});
			// Fire and forget - we don't await because the window is dying
			this.destroyBrowserViewSync(browserViewId, `safety-leash:${reason}`);
		};

		// 1. HISTORICAL: 'did-start-loading' was too broad - fired on ANY workbench reload
		// including extension panel refreshes. Now handled via ILifecycleMainService.onWillLoadWindow
		// window.webContents.once('did-start-loading', () => autoDestruct('did-start-loading'));

		// 2. If the IDE window is closed entirely
		window.once('closed', () => autoDestruct('window-closed'));

		// 3. If the renderer process crashes or is killed
		window.webContents.once('render-process-gone', (_event, details) => {
			console.warn('[ProjectMode][Main] render-process-gone detected for window', window.id, details);
			autoDestruct(`render-process-gone:${details?.reason ?? 'unknown'}`);
		});

		// 4. If webContents is destroyed
		window.webContents.once('destroyed', () => autoDestruct('webcontents-destroyed'));
	}

	/**
	 * Synchronous destroy - used by safety leash during window lifecycle events
	 * Must be robust and never throw - the window is dying anyway
	 */
	private destroyBrowserViewSync(browserViewId: number, source?: string): void {
		const hadBrowserView = this.browserViews.has(browserViewId);
		const activeIdsSnapshot = Array.from(this.browserViews.keys());

		console.warn('[ProjectMode][Main] destroyBrowserViewSync invoked', {
			browserViewId,
			source: source ?? 'unknown',
			hadBrowserView,
			activeIdsSnapshot
		});

		// Destroy overlay views first
		this.destroyOverlaysForBrowser(browserViewId);

		const browserView = this.browserViews.get(browserViewId);
		const window = this.browserWindows.get(browserViewId);

		// Close DevTools first (Electron manages cleanup in attached mode)
		if (browserView && !browserView.webContents.isDestroyed()) {
			try {
				browserView.webContents.closeDevTools();
			} catch (e) {
				// Ignore - window might be dead
			}
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

		console.warn('[ProjectMode][Main] destroyBrowserViewSync cleanup complete', {
			browserViewId,
			source: source ?? 'unknown',
			activeIdsAfter: Array.from(this.browserViews.keys())
		});
	}

	private setupBrowserEvents(browserView: WebContentsView): void {
		const webContents = browserView.webContents;
		const browserViewId = webContents.id;

		// Error codes that are expected/normal and should NOT be logged as errors:
		// -3: ERR_ABORTED - Normal navigation cancellation (user navigated away, pressed stop, or new navigation started)
		const IGNORED_ERROR_CODES = new Set([-3]);

		// =====================================================
		// LIFECYCLE / CRASH DIAGNOSTICS
		// =====================================================

		// Detect when this specific webContents dies (regardless of window events)
		webContents.on('destroyed', () => {
			console.warn('[ProjectMode][Main] webContents destroyed for browser view', {
				browserViewId,
				webContentsId: webContents.id
			});
			// Ensure maps are cleaned even if safety leash didn't run
			this.destroyBrowserViewSync(browserViewId, 'webcontents:destroyed');
		});

		// =====================================================
		// Navigation / loading events
		// =====================================================

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
			console.log('[ProjectMode][Main] did-start-loading', {
				browserViewId,
				url: webContents.getURL()
			});
			// Fire event with EXPLICIT isLoading = true
			this.fireNavigationStateChanged(browserViewId, true);
		});

		webContents.on('did-finish-load', () => {
			console.log('[ProjectMode][Main] did-finish-load', {
				browserViewId,
				url: webContents.getURL()
			});
			// Clear any previous error on successful load
			this.clearNavigationError(browserViewId);
			// Fire event with EXPLICIT isLoading = false
			this.fireNavigationStateChanged(browserViewId, false);
		});

		// did-stop-loading is more reliable than did-finish-load for complex pages
		webContents.on('did-stop-loading', () => {
			console.log('[ProjectMode][Main] did-stop-loading', {
				browserViewId,
				url: webContents.getURL()
			});
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

	// ============================================
	// CSS Source Resolution
	// ============================================

	/**
	 * Get complete style information for an element
	 *
	 * Uses CDP (Chrome DevTools Protocol) for deterministic source resolution.
	 * Handles plain CSS, SCSS/LESS (via source maps), CSS-in-JS, and inline styles.
	 *
	 * @param request - Element identification and project context
	 * @returns Complete style information including source locations
	 */
	async getElementStyles(request: GetElementStylesRequest): Promise<GetElementStylesResult> {
		const { browserViewId, projectRoot } = request;

		// Validate browser view exists
		const browserView = this.browserViews.get(browserViewId);
		if (!browserView || browserView.webContents.isDestroyed()) {
			return {
				success: false,
				error: 'Browser view not found or destroyed'
			};
		}

		try {
			// Get or create orchestrator for this project root
			let orchestrator = this.styleOrchestrators.get(projectRoot);
			if (!orchestrator) {
				orchestrator = new StyleSourceOrchestrator(this.cdpCssService, projectRoot);
				this.styleOrchestrators.set(projectRoot, orchestrator);
			}

			// Delegate to orchestrator
			return await orchestrator.getElementStyles(request);
		} catch (error) {
			console.error('[BrowserViewService] getElementStyles error:', error);
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	/**
	 * Clear CSS cache for a project
	 * Call when files change to ensure fresh source map resolution
	 */
	clearCssCacheForProject(projectRoot: string): void {
		const orchestrator = this.styleOrchestrators.get(projectRoot);
		if (orchestrator) {
			orchestrator.clearCaches();
		}
	}
}
