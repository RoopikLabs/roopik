/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { BrowserWindow, WebContentsView, session, app, ipcMain } from 'electron';
import { Emitter, Event } from '../../../../../base/common/event.js';
import type { IProjectModeService } from '../../common/projectMode/ipc.js';
import type { ViewBounds, BrowserViewResult, DevToolsViewResult, NavigationState, CDPDomains, NavigationError, DevToolsOptions, DevToolsClosedEvent, NavigationStateChangedEvent, OpenSourceRequestEvent, BrowserBridgeEvent, BrowserBridgeMessage, McpBrowserOpenRequestEvent, McpBrowserCloseRequestEvent } from '../../common/projectMode/types.js';
import type { GetElementStylesRequest, GetElementStylesResult } from '../../common/cssResolvers/types.js';
import { DevToolsExtensionLoader } from './devtoolsExtensionLoader.js';
import type { ILifecycleMainService } from '../../../../../platform/lifecycle/electron-main/lifecycleMainService.js';
import { LoadReason } from '../../../../../platform/window/electron-main/window.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { CDPCssService } from './cssResolvers/cdpCssService.js';
import { StyleSourceOrchestrator } from './cssResolvers/styleSourceOrchestrator.js';
// eslint-disable-next-line local/code-import-patterns
import contextMenu from 'electron-context-menu';
import { cleanupCDPMonitoring } from '../tools/cdpMonitorService.js';
import { injectStealthPatches } from './browserStealth.js';
import { MAX_BROWSER_TABS, type IBrowserBackend, type TabInfo } from './browserBackend.js';
import { FileAccess } from '../../../../../base/common/network.js';
import { ILoggerService } from '../../../../../platform/log/common/log.js';
import { getRoopikLogger } from '../../common/roopikLogger.js';

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
export class BrowserViewService extends Disposable implements IProjectModeService, IBrowserBackend {
	readonly _serviceBrand: undefined;

	// ============================================
	// Events
	// ============================================

	private readonly _onDevToolsClosed = new Emitter<DevToolsClosedEvent>();
	readonly onDevToolsClosed: Event<DevToolsClosedEvent> = this._onDevToolsClosed.event;

	private readonly _onNavigationStateChanged = new Emitter<NavigationStateChangedEvent>();
	readonly onNavigationStateChanged: Event<NavigationStateChangedEvent> = this._onNavigationStateChanged.event;

	private readonly _onOpenSourceRequest = new Emitter<OpenSourceRequestEvent>();
	readonly onOpenSourceRequest: Event<OpenSourceRequestEvent> = this._onOpenSourceRequest.event;

	private readonly _onAttachElementRequest = new Emitter<import('../../common/projectMode/types.js').AttachElementRequestEvent>();
	readonly onAttachElementRequest: Event<import('../../common/projectMode/types.js').AttachElementRequestEvent> = this._onAttachElementRequest.event;

	private readonly _onBrowserBridgeMessage = new Emitter<BrowserBridgeEvent>();
	readonly onBrowserBridgeMessage: Event<BrowserBridgeEvent> = this._onBrowserBridgeMessage.event;

	private readonly _onBrowserKeyPress = new Emitter<import('../../common/projectMode/types.js').BrowserKeyEvent>();
	readonly onBrowserKeyPress: Event<import('../../common/projectMode/types.js').BrowserKeyEvent> = this._onBrowserKeyPress.event;

	private readonly _onMcpBrowserOpenRequest = new Emitter<McpBrowserOpenRequestEvent>();
	readonly onMcpBrowserOpenRequest: Event<McpBrowserOpenRequestEvent> = this._onMcpBrowserOpenRequest.event;

	private readonly _onMcpBrowserCloseRequest = new Emitter<McpBrowserCloseRequestEvent>();
	readonly onMcpBrowserCloseRequest: Event<McpBrowserCloseRequestEvent> = this._onMcpBrowserCloseRequest.event;

	// CDP Monitoring Lifecycle Events
	private readonly _onBrowserViewCreated = new Emitter<{ browserViewId: number }>();
	readonly onBrowserViewCreated: Event<{ browserViewId: number }> = this._onBrowserViewCreated.event;

	private readonly _onBrowserViewDestroyed = new Emitter<{ browserViewId: number }>();
	readonly onBrowserViewDestroyed: Event<{ browserViewId: number }> = this._onBrowserViewDestroyed.event;

	// Tab Events (multi-tab)
	private readonly _onTabCreated = new Emitter<{ tabId: number; url?: string }>();
	readonly onTabCreated: Event<{ tabId: number; url?: string }> = this._onTabCreated.event;

	private readonly _onTabClosed = new Emitter<{ tabId: number }>();
	readonly onTabClosed: Event<{ tabId: number }> = this._onTabClosed.event;

	private readonly _onActiveTabChanged = new Emitter<{ tabId: number }>();
	readonly onActiveTabChanged: Event<{ tabId: number }> = this._onActiveTabChanged.event;

	// Static set of managed webContents IDs for navigation whitelist
	// This is used by app.ts to allow navigation for our browser views
	private static managedWebContentsIds = new Set<number>();

	// Track if session has been configured (only configure ONCE)
	private static sessionConfigured = false;
	private static ipcListenerRegistered = false;

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

	// Track safety leash listeners per window to prevent memory leaks
	// Map: windowId -> Set of browserViewIds that have listeners on this window
	private windowSafetyLeashListeners = new Map<number, Set<number>>();

	// ============================================
	// Multi-tab tracking
	// ============================================
	private nextTabId = 1;
	private tabToBrowserViewId = new Map<number, number>();   // tabId → browserViewId
	private browserViewIdToTab = new Map<number, number>();   // browserViewId → tabId (reverse)
	private activeTabId: number | undefined;

	// CDP debugger state
	private debuggerAttached = new Map<number, boolean>();

	// Navigation errors - track last error per browser view
	private lastNavigationErrors = new Map<number, NavigationError>();

	// Favicon URLs - track current favicon per browser view
	private favicons = new Map<number, string>();

	// Track if favicon was received for current page load (to know when to clear)
	private faviconReceivedForCurrentLoad = new Map<number, boolean>();

	// Remote debugging port counter
	private debuggingPortCounter = 9222;

	// CSS source resolution services
	private cdpCssService: CDPCssService;
	private styleOrchestrators = new Map<string, StyleSourceOrchestrator>(); // projectRoot -> orchestrator

	// Track which browser views have the bridge binding set up
	private bridgeBindingSetup = new Map<number, boolean>();

	// Logger
	private readonly logger;

	// ============================================
	// Constructor & Lifecycle Setup
	// ============================================

	constructor(
		@ILoggerService loggerService: ILoggerService,
		private readonly lifecycleMainService?: ILifecycleMainService
	) {
		super();
		this.logger = getRoopikLogger(loggerService, 'BROWSER_VIEW');
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
			this.logger.warn('ILifecycleMainService not provided, skipping lifecycle hooks');
			return;
		}

		// Listen for window reload events - destroy browser views BEFORE reload happens
		// This is the key: we clean up gracefully before the window reloads, not during
		this._register(this.lifecycleMainService.onWillLoadWindow(e => {
			if (e.reason === LoadReason.RELOAD) {
				// Get Electron BrowserWindow ID (not VS Code window ID)
				const electronWindowId = e.window.win?.id;
				if (electronWindowId !== undefined) {
					this.logger.info('Window reload detected, destroying browser views', { electronWindowId });
					this.destroyAllBrowserViewsForWindow(electronWindowId);
				} else {
					this.logger.warn('Window reload detected but Electron BrowserWindow not available');
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

		this.logger.info('Destroying browser views for window reload', { windowId, browserViewIds: browserViewIdsToDestroy });

		// Destroy each browser view synchronously (window is reloading, no time for async)
		for (const browserViewId of browserViewIdsToDestroy) {
			this.destroyBrowserViewSync(browserViewId, 'window-reload');
		}
	}

	// ============================================
	// Browser View Lifecycle
	// ============================================

	async createBrowserView(windowId: number, tabId?: number): Promise<BrowserViewResult & { tabId: number }> {
		this.logger.info('createBrowserView requested', { windowId, tabId });

		// If tabId is provided, this is a reattach (drag between groups) — try reattach first
		if (tabId !== undefined) {
			const existingBrowserViewId = this.tabToBrowserViewId.get(tabId);
			if (existingBrowserViewId !== undefined) {
				const existingView = this.browserViews.get(existingBrowserViewId);
				if (existingView && !existingView.webContents.isDestroyed()) {
					// Reattach existing view to new window
					const targetWindow = BrowserWindow.fromId(windowId);
					if (targetWindow) {
						// Remove from old window first
						const oldWindow = this.browserWindows.get(existingBrowserViewId);
						if (oldWindow && !oldWindow.isDestroyed() && oldWindow.contentView) {
							try { oldWindow.contentView.removeChildView(existingView); } catch { /* ignore */ }
						}
						targetWindow.contentView.addChildView(existingView);
						this.browserWindows.set(existingBrowserViewId, targetWindow);
						this.setActiveTabInternal(tabId);
						this.logger.info('Reattached existing view for tab', { tabId, browserViewId: existingBrowserViewId });
						return { browserViewId: existingBrowserViewId, debuggingPort: 0, tabId };
					}
				}
			}
		}

		// Check tab limit (embedded mode only)
		if (this.tabToBrowserViewId.size >= MAX_BROWSER_TABS) {
			throw new Error(`Tab limit reached (max ${MAX_BROWSER_TABS}). Close a tab first.`);
		}

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

			// C. Auto-Grant Permissions (Real Chrome-like behavior)
			// Two handlers needed: requestHandler for explicit prompts, checkHandler for implicit checks
			const allowedPermissions = ['media', 'geolocation', 'notifications', 'clipboard-read', 'clipboard-write', 'clipboard-sanitized-write', 'midi', 'midiSysex', 'pointerLock', 'fullscreen', 'display-capture', 'mediaKeySystem', 'idle-detection', 'storage-access', 'window-management', 'local-fonts', 'screen-wake-lock', 'speaker-selection'];

			// Handler for explicit permission requests (e.g., getUserMedia prompt)
			browserSession.setPermissionRequestHandler((_webContents, permission, callback) => {
				callback(allowedPermissions.includes(permission));
			});

			// Handler for implicit permission checks (e.g., enumerateDevices, permission.query)
			// WITHOUT THIS, camera/mic streams return blank even after permission is "granted"
			browserSession.setPermissionCheckHandler((_webContents, permission) => {
				return allowedPermissions.includes(permission);
			});

			// D. Load DevTools Extensions (React DevTools, Vue DevTools, etc.)
			// Extensions are loaded from resources/devtools-extensions/
			// User can add new extensions by extracting CRX files and updating manifest.json
			this.loadDevToolsExtensionsAsync(browserSession);

			// E. Browser Stealth: Make embedded browser indistinguishable from real Chrome
			// Strip Electron/Roopik identifiers from User-Agent to bypass Cloudflare/bot detection
			const defaultUA = browserSession.getUserAgent();
			const cleanUA = defaultUA
				.replace(/\s*roopik[-\w]*\/[\d.]+/gi, '')
				.replace(/\s*Electron\/[\d.]+/gi, '');
			browserSession.setUserAgent(cleanUA);
			this.logger.info('Browser stealth: UA cleaned', { cleanUA });

			// Override Accept-Language header to match real Chrome (multiple locales)
			browserSession.webRequest.onBeforeSendHeaders((details, callback) => {
				details.requestHeaders['Accept-Language'] = 'en-IN,en-GB;q=0.9,en-US;q=0.8,en;q=0.7';
				// Also ensure the User-Agent header matches (some Electron versions leak in headers)
				details.requestHeaders['User-Agent'] = cleanUA;
				callback({ requestHeaders: details.requestHeaders });
			});
		}

		// =========================================================
		// End of Session Configuration
		// =========================================================

		// Create browser WebContentsView with custom session
		// Match real Chrome browser security model: sandbox ON, webSecurity ON
		// sandbox:true prevents Node.js globals from leaking (no global, process, etc.)
		// webSecurity:true enforces same-origin policy (Cloudflare checks this!)
		const browserView = new WebContentsView({
			webPreferences: {
				nodeIntegration: false,
				contextIsolation: true,
				sandbox: true,
				javascript: true,
				navigateOnDragDrop: false,
				enableBlinkFeatures: 'StandardizedBrowserZoom',
				preload: FileAccess.asFileUri('vs/platform/browserView/electron-main/preload-browser.js').fsPath,
				session: browserSession // CRITICAL: Use our configured session for localhost support
			}
		});

		// CRITICAL: Get ID and register BEFORE adding to window
		// Adding to window can trigger immediate navigation attempts!
		const browserViewId = browserView.webContents.id;
		const debuggingPort = this.debuggingPortCounter++;
		BrowserViewService.managedWebContentsIds.add(browserViewId);

		// Now safe to add to window - ID is already whitelisted
		window.contentView.addChildView(browserView);



		this.logger.info('Browser view created', { browserViewId, windowId, debuggingPort, webContentsId: browserView.webContents.id });

		// Store references
		this.browserViews.set(browserViewId, browserView);
		this.browserWindows.set(browserViewId, window);
		// Setup zoom handlers (keyboard + touchpad pinch)
		this.setupZoomHandlers(browserView);

		// Setup event listeners
		this.setupBrowserEvents(browserView);

		// =========================================================================
		// BROWSER STEALTH: Inject fingerprint patches via CDP
		// Phase 1: dom-ready handler injects stealth on first page load
		// Phase 2: CDP registers stealth for all subsequent navigations
		// Both phases are non-blocking — won't delay browser creation
		// =========================================================================
		injectStealthPatches(browserView, this.debuggerAttached);

		// =========================================================================
		// CRITICAL: THE SAFETY LEASH
		// Auto-destroy views when parent window reloads or closes
		// This is the KEY fix for ghost browser views!
		// =========================================================================
		this.attachSafetyLeash(window, browserViewId);

		// Fire event for CDP monitoring to auto-initialize
		this._onBrowserViewCreated.fire({ browserViewId });

		// Assign stable tabId and track mapping
		const assignedTabId = tabId ?? this.nextTabId++;
		this.tabToBrowserViewId.set(assignedTabId, browserViewId);
		this.browserViewIdToTab.set(browserViewId, assignedTabId);

		// Hide other views, show this one (multi-tab visibility)
		this.setActiveTabInternal(assignedTabId);

		// Fire tab events
		this._onTabCreated.fire({ tabId: assignedTabId });
		this.logger.info('Tab created', { tabId: assignedTabId, browserViewId });

		return { browserViewId, debuggingPort, tabId: assignedTabId };
	}

	async destroyBrowserView(browserViewId: number): Promise<void> {
		this.logger.info('destroyBrowserView called', { browserViewId });

		// Fire event for CDP monitoring cleanup
		this._onBrowserViewDestroyed.fire({ browserViewId });

		// Cleanup CDP monitoring if active (from MCP CDP tools)
		cleanupCDPMonitoring(browserViewId);

		// Close DevTools if open
		await this.closeDevTools(browserViewId);

		// Detach debugger if attached
		if (this.debuggerAttached.get(browserViewId)) {
			await this.detachDebugger(browserViewId);
		}

		const browserView = this.browserViews.get(browserViewId);
		const browserWindow = this.browserWindows.get(browserViewId);

		if (browserView) {
			this.logger.info('Destroying browser view', { browserViewId, windowId: browserWindow?.id, webContentsDestroyed: browserView.webContents.isDestroyed() });

			const webContents = browserView.webContents;

			// 1. Remove from window FIRST
			if (browserWindow && !browserWindow.isDestroyed() && browserWindow.contentView) {
				try {
					browserWindow.contentView.removeChildView(browserView);
				} catch (e) {
					this.logger.error('Error removing browser view from window', { error: e });
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
					this.logger.error('Error closing browser webContents', { error: e });
				}
			}

			// 3. Cleanup maps
			this.browserViews.delete(browserViewId);
			this.browserWindows.delete(browserViewId);
			this.debuggerAttached.delete(browserViewId);
			this.lastNavigationErrors.delete(browserViewId);
			this.favicons.delete(browserViewId);
			this.faviconReceivedForCurrentLoad.delete(browserViewId);

			// 3b. Cleanup tab maps
			const tabId = this.browserViewIdToTab.get(browserViewId);
			if (tabId !== undefined) {
				this.tabToBrowserViewId.delete(tabId);
				this.browserViewIdToTab.delete(browserViewId);
				this._onTabClosed.fire({ tabId });
				// Update active tab to next available
				if (this.activeTabId === tabId) {
					const remaining = Array.from(this.tabToBrowserViewId.keys());
					this.activeTabId = remaining.length > 0 ? remaining[remaining.length - 1] : undefined;
					if (this.activeTabId !== undefined) {
						this._onActiveTabChanged.fire({ tabId: this.activeTabId });
					}
				}
				this.logger.info('Tab closed', { tabId, browserViewId });
			}

			// Clean up safety leash tracking (remove browserViewId from window's set)
			if (browserWindow) {
				const windowId = browserWindow.id;
				const browserViewIds = this.windowSafetyLeashListeners.get(windowId);
				if (browserViewIds) {
					browserViewIds.delete(browserViewId);
					// If no more browser views for this window, clean up the set
					if (browserViewIds.size === 0) {
						this.windowSafetyLeashListeners.delete(windowId);
					}
				}
			}

			// Remove from static set
			BrowserViewService.managedWebContentsIds.delete(browserViewId);
		}
	}

	/**
	 * Get the active browser view ID
	 * Since Roopik has single project constraint (one server at a time),
	 * there's at most one browser view open.
	 *
	 * @returns browserViewId if a browser is open, undefined otherwise
	 */
	getActiveBrowserViewId(): number | undefined {
		if (this.activeTabId !== undefined) {
			return this.tabToBrowserViewId.get(this.activeTabId);
		}
		// Fallback: return last view (for legacy compatibility during transition)
		const ids = Array.from(this.browserViews.keys());
		return ids.length > 0 ? ids[ids.length - 1] : undefined;
	}

	// ============================================
	// Multi-tab Management
	// ============================================

	async openNewTab(url?: string): Promise<number> {
		if (this.tabToBrowserViewId.size >= MAX_BROWSER_TABS) {
			throw new Error(`Tab limit reached (max ${MAX_BROWSER_TABS}). Close a tab first.`);
		}
		// Fire MCP browser open event — renderer will call createBrowserView
		this._onMcpBrowserOpenRequest.fire({ url: url || '' });
		// The tabId will be assigned in createBrowserView. Return the next expected tabId.
		// (This is a simplification — the actual tabId is assigned in createBrowserView)
		return this.nextTabId; // The next call to createBrowserView will use this
	}

	listTabs(): TabInfo[] {
		const tabs: TabInfo[] = [];
		for (const [tabId, browserViewId] of this.tabToBrowserViewId) {
			const view = this.browserViews.get(browserViewId);
			if (view && !view.webContents.isDestroyed()) {
				tabs.push({
					tabId,
					url: view.webContents.getURL(),
					title: view.webContents.getTitle(),
					isActive: tabId === this.activeTabId,
				});
			}
		}
		return tabs;
	}

	getActiveTabId(): number | undefined {
		return this.activeTabId;
	}

	async setActiveTab(tabId: number): Promise<void> {
		const browserViewId = this.tabToBrowserViewId.get(tabId);
		if (browserViewId === undefined) {
			throw new Error(`Tab ${tabId} not found. Use browser_list_tabs to see available tabs.`);
		}
		this.setActiveTabInternal(tabId);
	}

	async closeTab(tabId: number): Promise<void> {
		const browserViewId = this.tabToBrowserViewId.get(tabId);
		if (browserViewId === undefined) {
			throw new Error(`Tab ${tabId} not found.`);
		}
		await this.destroyBrowserView(browserViewId);
	}

	resolveTabId(tabId: number): number {
		const browserViewId = this.tabToBrowserViewId.get(tabId);
		if (browserViewId === undefined) {
			throw new Error(`Tab ${tabId} not found. Use browser_list_tabs to see available tabs.`);
		}
		return browserViewId;
	}

	/**
	 * Detach a browser view from its window WITHOUT destroying it.
	 * Used when editor is being dragged between split groups — the view
	 * will be reattached via createBrowserView(windowId, tabId).
	 */
	detachBrowserView(tabId: number): void {
		const browserViewId = this.tabToBrowserViewId.get(tabId);
		if (browserViewId === undefined) { return; }

		const view = this.browserViews.get(browserViewId);
		const window = this.browserWindows.get(browserViewId);
		if (view && window && !window.isDestroyed() && window.contentView) {
			try {
				window.contentView.removeChildView(view);
			} catch {
				// View might already be removed
			}
		}
		this.logger.info('Detached view for tab (not destroyed)', { tabId, browserViewId });
	}

	/** Internal: set active tab and manage view visibility */
	private setActiveTabInternal(tabId: number): void {
		this.activeTabId = tabId;
		// Show active view, hide others
		for (const [tid, bvId] of this.tabToBrowserViewId) {
			const view = this.browserViews.get(bvId);
			if (view && !view.webContents.isDestroyed()) {
				view.setVisible(tid === tabId);
			}
		}
		this._onActiveTabChanged.fire({ tabId });
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
		// Normalize URL - add protocol if missing (centralized for all callers: MCP, native, UI)
		const normalizedUrl = this.normalizeUrl(url);

		this.logger.debug('navigate requested', { browserViewId, url, normalizedUrl });

		const browserView = this.browserViews.get(browserViewId);
		if (!browserView) {
			const activeIds = Array.from(this.browserViews.keys());
			const message = `[ProjectMode] navigate() FAILED: browserView not found for ID ${browserViewId}. Active IDs: [${activeIds.join(', ')}]`;
			this.logger.error(message, { requestedId: browserViewId, activeIds });
			// Propagate error
			throw new Error(message);
		}

		if (browserView.webContents.isDestroyed()) {
			const message = `[ProjectMode] navigate() FAILED: webContents is destroyed for ID ${browserViewId}`;
			this.logger.error(message, { requestedId: browserViewId, webContentsDestroyed: true });
			throw new Error(message);
		}

		this.logger.debug('navigate forwarding to webContents.loadURL', { browserViewId, webContentsId: browserView.webContents.id });

		await browserView.webContents.loadURL(normalizedUrl);
	}

	/**
	 * Normalize URL by adding protocol if missing
	 * - Empty or about: URLs pass through unchanged
	 * - localhost URLs get http://
	 * - All other URLs get https://
	 */
	private normalizeUrl(url: string): string {
		if (!url) {
			return url;
		}
		const trimmed = url.trim();
		// Empty string - pass through
		if (!trimmed) {
			return trimmed;
		}
		// about: URLs (about:blank, about:srcdoc, etc.) - pass through unchanged
		if (/^about:/i.test(trimmed)) {
			return trimmed;
		}
		// Already has protocol
		if (/^https?:\/\//i.test(trimmed)) {
			return trimmed;
		}
		// Localhost should use http
		if (/^localhost(:\d+)?/i.test(trimmed)) {
			return `http://${trimmed}`;
		}
		// Everything else gets https
		return `https://${trimmed}`;
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
					this.logger.info('Cache cleared for hard reload');
				} catch (e) {
					this.logger.error('Failed to clear cache', { error: e });
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
		const favicon = this.favicons.get(browserViewId);

		// Use override if provided, otherwise query webContents
		const isLoading = isLoadingOverride !== undefined ? isLoadingOverride : webContents.isLoading();

		this._onNavigationStateChanged.fire({
			browserViewId,
			url: webContents.getURL(),
			title: webContents.getTitle(),
			isLoading,
			canGoBack: webContents.navigationHistory.canGoBack(),
			canGoForward: webContents.navigationHistory.canGoForward(),
			lastError,
			favicon
		});
	}

	// ============================================
	// DevTools (Attached Mode Only)
	// DevTools docked inside browser window with Device Toolbar available.
	// Users can detach from DevTools settings menu if needed.
	// ============================================

	async openDevTools(browserViewId: number, _options: DevToolsOptions): Promise<DevToolsViewResult> {
		this.logger.debug('openDevTools requested', { browserViewId });

		const browserView = this.browserViews.get(browserViewId);

		if (!browserView) {
			this.logger.error('openDevTools FAILED: browser view not found', { browserViewId });
			throw new Error(`Browser view ${browserViewId} not found`);
		}

		// Close existing DevTools if any
		await this.closeDevTools(browserViewId);

		// Open DevTools docked at bottom of the browser window
		// This gives us the Device Toolbar toggle and close button
		// Users can detach from DevTools settings menu if they want a separate window
		this.logger.debug('Opening devtools on webContents', { webContentsId: browserView.webContents.id });
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
				this.logger.error('Error closing devtools on browser', { error: e });
			}
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
				this.logger.error('Failed to attach debugger', { error: e });
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
				this.logger.error('Failed to detach debugger', { error: e });
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

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

	/**
	 * Register a callback for CDP events (like CSS.styleSheetAdded)
	 * Returns a function to unregister the callback
	 */
	onCDPEvent(browserViewId: number, callback: (method: string, params: unknown) => void): () => void {
		const browserView = this.browserViews.get(browserViewId);
		if (!browserView || browserView.webContents.isDestroyed()) {
			return () => { }; // Return no-op cleanup function
		}

		// Handler for 'message' event from debugger
		const handler = (_event: Electron.Event, method: string, params: unknown) => {
			callback(method, params);
		};

		browserView.webContents.debugger.on('message', handler);

		// Return cleanup function
		return () => {
			if (!browserView.webContents.isDestroyed()) {
				browserView.webContents.debugger.removeListener('message', handler);
			}
		};
	}

	/**
	 * Setup the browser bridge binding for script-to-main communication
	 * Uses CDP Runtime.addBinding to create window.__roopikBridge()
	 * Must be called after CDP is attached and before injecting inspect script
	 */
	async setupBrowserBridge(browserViewId: number): Promise<void> {
		// Already setup?
		if (this.bridgeBindingSetup.get(browserViewId)) {
			return;
		}

		const browserView = this.browserViews.get(browserViewId);
		if (!browserView || browserView.webContents.isDestroyed()) {
			throw new Error(`Browser view ${browserViewId} not found`);
		}

		// Ensure debugger is attached
		if (!this.debuggerAttached.get(browserViewId)) {
			await this.attachDebugger(browserViewId);
		}

		const debugger_ = browserView.webContents.debugger;

		// Enable Runtime domain (required for bindings)
		await debugger_.sendCommand('Runtime.enable');

		// Add the binding - creates window.__roopikBridge() in page
		await debugger_.sendCommand('Runtime.addBinding', { name: '__roopikBridge' });

		// Listen for binding calls
		const handler = (_event: Electron.Event, method: string, params: { name?: string; payload?: string }) => {
			if (method === 'Runtime.bindingCalled' && params.name === '__roopikBridge') {
				try {
					const message = JSON.parse(params.payload || '{}') as BrowserBridgeMessage;
					this._onBrowserBridgeMessage.fire({
						browserViewId,
						message
					});
				} catch (e) {
					this.logger.error('BrowserBridge: Failed to parse message', { error: e });
				}
			}
		};

		debugger_.on('message', handler);
		this.bridgeBindingSetup.set(browserViewId, true);
	}

	// ============================================
	// Utilities
	// ============================================

	/**
	 * Validate that a favicon URL actually exists (returns 200)
	 * Uses HEAD request for minimal overhead
	 */
	private async validateFaviconUrl(url: string): Promise<boolean> {
		try {
			const { net } = await import('electron');
			return new Promise((resolve) => {
				const request = net.request({
					method: 'HEAD',
					url,
					// Short timeout - favicon validation shouldn't block
					// Note: net.request doesn't have timeout option, we handle via events
				});

				// Timeout after 3 seconds
				const timeout = setTimeout(() => {
					request.abort();
					resolve(false);
				}, 3000);

				request.on('response', (response) => {
					clearTimeout(timeout);
					// Accept 200 OK and 304 Not Modified
					resolve(response.statusCode === 200 || response.statusCode === 304);
				});

				request.on('error', () => {
					clearTimeout(timeout);
					resolve(false);
				});

				request.end();
			});
		} catch {
			return false;
		}
	}

	async takeScreenshot(browserViewId: number): Promise<string> {
		const browserView = this.browserViews.get(browserViewId);
		if (!browserView || browserView.webContents.isDestroyed()) {
			throw new Error(`Browser view ${browserViewId} not found`);
		}

		const image = await browserView.webContents.capturePage();
		return image.toDataURL();
	}

	/**
	 * Take screenshot of a specific region (clip mode)
	 * Coordinates are viewport-relative (clientX/Y from browser)
	 */
	async takeScreenshotClip(browserViewId: number, x: number, y: number, width: number, height: number): Promise<string> {
		const browserView = this.browserViews.get(browserViewId);
		if (!browserView || browserView.webContents.isDestroyed()) {
			throw new Error(`Browser view ${browserViewId} not found`);
		}

		// Capture specific region - Electron's capturePage accepts rect
		const image = await browserView.webContents.capturePage({
			x: Math.floor(x),
			y: Math.floor(y),
			width: Math.floor(width),
			height: Math.floor(height)
		});

		return image.toDataURL();
	}

	/**
	 * Capture screenshot of a specific element using CDP DOM.getBoxModel
	 * This provides pixel-perfect bounds unlike JavaScript getBoundingClientRect
	 *
	 * Uses the same technique as VS Code's simple browser overlay:
	 * 1. Query element by CSS selector
	 * 2. Get box model via CDP for accurate bounds
	 * 3. Account for zoom factor
	 * 4. Capture screenshot of that region
	 *
	 * @param browserViewId - The browser view ID
	 * @param selector - CSS selector to find the element
	 * @returns Base64 data URL of the element screenshot, or null if element not found
	 */
	async captureElementScreenshot(browserViewId: number, selector: string): Promise<string | null> {
		const browserView = this.browserViews.get(browserViewId);
		if (!browserView || browserView.webContents.isDestroyed()) {
			throw new Error(`Browser view ${browserViewId} not found`);
		}

		this.logger.info('captureElementScreenshot called', { browserViewId, selector });

		try {
			// Ensure debugger is attached
			if (!this.debuggerAttached.get(browserViewId)) {
				await this.attachDebugger(browserViewId);
			}

			const debugger_ = browserView.webContents.debugger;

			// Enable DOM domain
			await debugger_.sendCommand('DOM.enable');

			// Get the document root with full depth to traverse all nodes
			const { root } = await debugger_.sendCommand('DOM.getDocument', { depth: -1, pierce: true });

			this.logger.debug('Got document root', { rootNodeId: root.nodeId });

			// Query the element by selector
			const { nodeId } = await debugger_.sendCommand('DOM.querySelector', {
				nodeId: root.nodeId,
				selector: selector
			});

			this.logger.debug('DOM.querySelector result', { selector, nodeId });

			if (!nodeId || nodeId === 0) {
				this.logger.warn('Element not found for selector via CDP', { selector });
				// Fallback: Try using JavaScript to get bounds
				return this.captureElementScreenshotFallback(browserViewId, selector);
			}

			// Get the box model for accurate bounds
			// This is the key - CDP gives us pixel-perfect coordinates
			const { model } = await debugger_.sendCommand('DOM.getBoxModel', { nodeId });

			if (!model) {
				this.logger.warn('Failed to get box model for element', { selector, nodeId });
				return this.captureElementScreenshotFallback(browserViewId, selector);
			}

			// Box model returns quad coordinates (8 values for 4 corners)
			// content: [x1,y1, x2,y1, x2,y2, x1,y2] - content box corners
			// margin: [x1,y1, x2,y1, x2,y2, x1,y2] - margin box corners
			const content = model.content as number[];
			const margin = model.margin as number[];

			// Calculate bounds from quads (same as VS Code's approach)
			// Use margin box for full element including margins
			const x = Math.min(margin[0], content[0]);
			const y = Math.min(margin[1], content[1]);
			const width = Math.max(margin[2] - margin[0], content[2] - content[0]);
			const height = Math.max(margin[5] - margin[1], content[5] - content[1]);

			// Account for zoom factor
			const zoomFactor = browserView.webContents.getZoomFactor();

			// Calculate scaled bounds
			const scaledX = Math.floor(x * zoomFactor);
			const scaledY = Math.floor(y * zoomFactor);
			const scaledWidth = Math.ceil(width * zoomFactor);
			const scaledHeight = Math.ceil(height * zoomFactor);

			// Ensure bounds are within viewport
			const viewportBounds = browserView.getBounds();
			const clippedX = Math.max(0, scaledX);
			const clippedY = Math.max(0, scaledY);
			const clippedWidth = Math.min(scaledWidth, viewportBounds.width - clippedX);
			const clippedHeight = Math.min(scaledHeight, viewportBounds.height - clippedY);

			// Skip if element is not visible or too small
			if (clippedWidth <= 0 || clippedHeight <= 0) {
				this.logger.warn('Element is not visible in viewport', { selector, bounds: { x, y, width, height } });
				return null;
			}

			this.logger.info('Capturing element screenshot', {
				selector,
				originalBounds: { x, y, width, height },
				zoomFactor,
				scaledBounds: { x: scaledX, y: scaledY, width: scaledWidth, height: scaledHeight },
				clippedBounds: { x: clippedX, y: clippedY, width: clippedWidth, height: clippedHeight }
			});

			// Capture the screenshot of the element region
			const image = await browserView.webContents.capturePage({
				x: clippedX,
				y: clippedY,
				width: clippedWidth,
				height: clippedHeight
			});

			const dataUrl = image.toDataURL();
			this.logger.info('Element screenshot captured successfully', { dataUrlLength: dataUrl.length });
			return dataUrl;

		} catch (error) {
			this.logger.error('Failed to capture element screenshot via CDP', { selector, error });
			// Try fallback approach
			return this.captureElementScreenshotFallback(browserViewId, selector);
		}
	}

	/**
	 * Fallback method to capture element screenshot using JavaScript bounds
	 * Used when CDP DOM.querySelector fails (e.g., for dynamically added elements)
	 */
	private async captureElementScreenshotFallback(browserViewId: number, selector: string): Promise<string | null> {
		const browserView = this.browserViews.get(browserViewId);
		if (!browserView || browserView.webContents.isDestroyed()) {
			return null;
		}

		try {
			this.logger.info('Using fallback JS method for element screenshot', { selector });

			// Get bounds using JavaScript
			const boundsJson = await browserView.webContents.executeJavaScript(`
				(function() {
					try {
						const el = document.querySelector(${JSON.stringify(selector)});
						if (!el) return null;
						const rect = el.getBoundingClientRect();
						return JSON.stringify({
							x: rect.x,
							y: rect.y,
							width: rect.width,
							height: rect.height
						});
					} catch (e) {
						return null;
					}
				})();
			`);

			if (!boundsJson) {
				this.logger.warn('Fallback: Element not found via JS', { selector });
				return null;
			}

			const bounds = JSON.parse(boundsJson);

			// Apply zoom factor
			const zoomFactor = browserView.webContents.getZoomFactor();
			const scaledX = Math.floor(bounds.x * zoomFactor);
			const scaledY = Math.floor(bounds.y * zoomFactor);
			const scaledWidth = Math.ceil(bounds.width * zoomFactor);
			const scaledHeight = Math.ceil(bounds.height * zoomFactor);

			// Ensure bounds are within viewport
			const viewportBounds = browserView.getBounds();
			const clippedX = Math.max(0, scaledX);
			const clippedY = Math.max(0, scaledY);
			const clippedWidth = Math.min(scaledWidth, viewportBounds.width - clippedX);
			const clippedHeight = Math.min(scaledHeight, viewportBounds.height - clippedY);

			if (clippedWidth <= 0 || clippedHeight <= 0) {
				this.logger.warn('Fallback: Element not visible in viewport', { selector, bounds });
				return null;
			}

			this.logger.info('Fallback: Capturing element screenshot', {
				selector,
				bounds,
				clippedBounds: { x: clippedX, y: clippedY, width: clippedWidth, height: clippedHeight }
			});

			const image = await browserView.webContents.capturePage({
				x: clippedX,
				y: clippedY,
				width: clippedWidth,
				height: clippedHeight
			});

			const dataUrl = image.toDataURL();
			this.logger.info('Fallback: Element screenshot captured', { dataUrlLength: dataUrl.length });
			return dataUrl;

		} catch (error) {
			this.logger.error('Fallback: Failed to capture element screenshot', { selector, error });
			return null;
		}
	}

	/**
	 * Focus the browser view to receive keyboard events
	 * This is important for ESC key handling in inspect mode
	 */
	async focusBrowserView(browserViewId: number): Promise<void> {
		const browserView = this.browserViews.get(browserViewId);
		if (!browserView || browserView.webContents.isDestroyed()) {
			throw new Error(`Browser view ${browserViewId} not found`);
		}

		browserView.webContents.focus();
	}

	/**
	 * Take screenshot with viewport metadata for pixel-perfect clicking
	 * Returns image data URL plus CSS viewport dimensions (not scaled pixel dimensions)
	 *
	 * IMPORTANT: We return CSS viewport dimensions (window.innerWidth/innerHeight),
	 * NOT the image pixel dimensions. On high-DPI displays, capturePage() returns
	 * an image scaled by devicePixelRatio, but agents need CSS coordinates for clicking.
	 *
	 * Example on 2x display:
	 * - CSS viewport: 900x600
	 * - Image pixels: 1800x1200 (scaled by devicePixelRatio)
	 * - We return: width=900, height=600 (CSS coordinates for clicking)
	 */
	async takeScreenshotWithMetadata(browserViewId: number): Promise<{
		image: string;
		width: number;
		height: number;
		devicePixelRatio: number;
	}> {
		const browserView = this.browserViews.get(browserViewId);
		if (!browserView || browserView.webContents.isDestroyed()) {
			throw new Error(`Browser view ${browserViewId} not found`);
		}

		// Get CSS viewport dimensions and devicePixelRatio from the page
		// These are the dimensions agents need to calculate click coordinates
		let viewportWidth = 0;
		let viewportHeight = 0;
		let devicePixelRatio = 1;

		try {
			const viewportInfo = await browserView.webContents.executeJavaScript(`
				JSON.stringify({
					width: window.innerWidth,
					height: window.innerHeight,
					devicePixelRatio: window.devicePixelRatio || 1
				})
			`);
			const parsed = JSON.parse(viewportInfo);
			viewportWidth = parsed.width;
			viewportHeight = parsed.height;
			devicePixelRatio = parsed.devicePixelRatio;
		} catch (e) {
			// Fallback: use image dimensions divided by a default DPR
			this.logger.warn('Failed to get viewport info from page, using fallback', { error: e });
		}

		const image = await browserView.webContents.capturePage();

		// If we couldn't get viewport info, fall back to image size / devicePixelRatio
		if (viewportWidth === 0 || viewportHeight === 0) {
			const imageSize = image.getSize();
			viewportWidth = Math.round(imageSize.width / devicePixelRatio);
			viewportHeight = Math.round(imageSize.height / devicePixelRatio);
		}

		return {
			image: image.toDataURL(),
			width: viewportWidth,
			height: viewportHeight,
			devicePixelRatio
		};
	}

	// ============================================
	// Input Automation (for AI agents)
	// ============================================

	/**
	 * Send mouse input event to the browser
	 * Coordinates are scaled based on reference dimensions
	 */
	async sendMouseEvent(
		browserViewId: number,
		action: 'click' | 'right_click' | 'double_click' | 'hover' | 'mouseDown' | 'mouseUp',
		x: number,
		y: number,
		refWidth?: number,
		refHeight?: number
	): Promise<void> {
		const browserView = this.browserViews.get(browserViewId);
		if (!browserView || browserView.webContents.isDestroyed()) {
			throw new Error(`Browser view ${browserViewId} not found`);
		}

		// Get actual viewport size for scaling
		const bounds = browserView.getBounds();
		const actualWidth = bounds.width;
		const actualHeight = bounds.height;

		// Scale coordinates if reference dimensions provided
		let finalX = x;
		let finalY = y;
		if (refWidth && refHeight) {
			finalX = Math.round(x * (actualWidth / refWidth));
			finalY = Math.round(y * (actualHeight / refHeight));
		}

		const webContents = browserView.webContents;

		switch (action) {
			case 'click':
				webContents.sendInputEvent({ type: 'mouseDown', x: finalX, y: finalY, button: 'left', clickCount: 1 });
				webContents.sendInputEvent({ type: 'mouseUp', x: finalX, y: finalY, button: 'left', clickCount: 1 });
				break;
			case 'right_click':
				webContents.sendInputEvent({ type: 'mouseDown', x: finalX, y: finalY, button: 'right', clickCount: 1 });
				webContents.sendInputEvent({ type: 'mouseUp', x: finalX, y: finalY, button: 'right', clickCount: 1 });
				break;
			case 'double_click':
				webContents.sendInputEvent({ type: 'mouseDown', x: finalX, y: finalY, button: 'left', clickCount: 2 });
				webContents.sendInputEvent({ type: 'mouseUp', x: finalX, y: finalY, button: 'left', clickCount: 2 });
				break;
			case 'hover':
				webContents.sendInputEvent({ type: 'mouseMove', x: finalX, y: finalY });
				break;
			case 'mouseDown':
				webContents.sendInputEvent({ type: 'mouseDown', x: finalX, y: finalY, button: 'left', clickCount: 1 });
				break;
			case 'mouseUp':
				webContents.sendInputEvent({ type: 'mouseUp', x: finalX, y: finalY, button: 'left', clickCount: 1 });
				break;
		}
	}

	/**
	 * Send drag event (mouseDown at start, mouseMove, mouseUp at end)
	 */
	async sendDragEvent(
		browserViewId: number,
		startX: number,
		startY: number,
		endX: number,
		endY: number,
		refWidth?: number,
		refHeight?: number
	): Promise<void> {
		const browserView = this.browserViews.get(browserViewId);
		if (!browserView || browserView.webContents.isDestroyed()) {
			throw new Error(`Browser view ${browserViewId} not found`);
		}

		const bounds = browserView.getBounds();
		const actualWidth = bounds.width;
		const actualHeight = bounds.height;

		let finalStartX = startX;
		let finalStartY = startY;
		let finalEndX = endX;
		let finalEndY = endY;

		if (refWidth && refHeight) {
			finalStartX = Math.round(startX * (actualWidth / refWidth));
			finalStartY = Math.round(startY * (actualHeight / refHeight));
			finalEndX = Math.round(endX * (actualWidth / refWidth));
			finalEndY = Math.round(endY * (actualHeight / refHeight));
		}

		const webContents = browserView.webContents;

		// Drag sequence: mouseDown -> mouseMove -> mouseUp
		webContents.sendInputEvent({ type: 'mouseDown', x: finalStartX, y: finalStartY, button: 'left', clickCount: 1 });
		webContents.sendInputEvent({ type: 'mouseMove', x: finalEndX, y: finalEndY });
		webContents.sendInputEvent({ type: 'mouseUp', x: finalEndX, y: finalEndY, button: 'left', clickCount: 1 });
	}

	/**
	 * Type text into the browser (sends char events)
	 */
	async sendTypeEvent(browserViewId: number, text: string): Promise<void> {
		const browserView = this.browserViews.get(browserViewId);
		if (!browserView || browserView.webContents.isDestroyed()) {
			throw new Error(`Browser view ${browserViewId} not found`);
		}

		const webContents = browserView.webContents;

		for (const char of text) {
			webContents.sendInputEvent({ type: 'char', keyCode: char });
		}
	}

	/**
	 * Press a key (sends keyDown + keyUp)
	 */
	async sendKeyEvent(browserViewId: number, key: string, modifiers?: string[]): Promise<void> {
		const browserView = this.browserViews.get(browserViewId);
		if (!browserView || browserView.webContents.isDestroyed()) {
			throw new Error(`Browser view ${browserViewId} not found`);
		}

		const webContents = browserView.webContents;

		// Build modifiers array for Electron
		const electronModifiers: ('shift' | 'control' | 'alt' | 'meta')[] = [];
		if (modifiers) {
			for (const mod of modifiers) {
				const lower = mod.toLowerCase();
				if (lower === 'shift' || lower === 'control' || lower === 'ctrl' || lower === 'alt' || lower === 'meta' || lower === 'cmd') {
					if (lower === 'ctrl') {
						electronModifiers.push('control');
					} else if (lower === 'cmd') {
						electronModifiers.push('meta');
					} else {
						electronModifiers.push(lower as 'shift' | 'control' | 'alt' | 'meta');
					}
				}
			}
		}

		webContents.sendInputEvent({ type: 'keyDown', keyCode: key, modifiers: electronModifiers });
		webContents.sendInputEvent({ type: 'keyUp', keyCode: key, modifiers: electronModifiers });
	}

	/**
	 * Scroll the page
	 */
	async sendScrollEvent(
		browserViewId: number,
		deltaX: number,
		deltaY: number,
		x?: number,
		y?: number
	): Promise<void> {
		const browserView = this.browserViews.get(browserViewId);
		if (!browserView || browserView.webContents.isDestroyed()) {
			throw new Error(`Browser view ${browserViewId} not found`);
		}

		const bounds = browserView.getBounds();
		// Default to center of viewport if no position specified
		const scrollX = x ?? Math.round(bounds.width / 2);
		const scrollY = y ?? Math.round(bounds.height / 2);

		browserView.webContents.sendInputEvent({
			type: 'mouseWheel',
			x: scrollX,
			y: scrollY,
			deltaX,
			deltaY,
			canScroll: true
		});
	}

	/**
	 * Get current viewport dimensions
	 */
	getViewportSize(browserViewId: number): { width: number; height: number } | null {
		const browserView = this.browserViews.get(browserViewId);
		if (!browserView || browserView.webContents.isDestroyed()) {
			return null;
		}
		const bounds = browserView.getBounds();
		return { width: bounds.width, height: bounds.height };
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
	// MCP Browser Request Events
	// ============================================

	/**
	 * Request browser to be opened from MCP
	 * Fires event that renderer listens to and opens the browser editor with proper UI
	 * This is used by MCP tools (browser_open) when no browser is currently open
	 *
	 * @param url - Optional URL to navigate to after browser opens
	 */
	requestBrowserOpen(url?: string): void {
		this.logger.info('MCP browser open request', { url });
		this._onMcpBrowserOpenRequest.fire({ url });
	}

	/**
	 * Request browser to be closed from MCP
	 * Fires event that renderer listens to and closes the editor tab properly
	 * This triggers the full cleanup chain (stop dev server, destroy browser view, etc.)
	 * This is the CORRECT way to close the browser - NOT calling destroyBrowserView directly!
	 */
	requestBrowserClose(): void {
		this.logger.info('MCP browser close request');
		this._onMcpBrowserCloseRequest.fire({});
	}

	// ============================================
	// CSS Style Inspection
	// ============================================

	/**
	 * Enable CSS domain for style inspection
	 * Called automatically when page loads to capture stylesheet events
	 */
	private async enableCSSForStyleInspection(browserViewId: number): Promise<void> {
		// CRITICAL: Validate browser view exists before attempting CDP operations
		// During page reload, the view might be destroyed but event listeners still fire
		const browserView = this.browserViews.get(browserViewId);
		if (!browserView) {
			this.logger.warn('Cannot enable CSS: Browser view not found', { browserViewId });
			return;
		}

		try {
			// Reset CSS state first - this clears the cache and marks as not enabled
			// so we get fresh styleSheetAdded events for this page load
			this.cdpCssService.resetForPageLoad(browserViewId);
			await this.cdpCssService.ensureCSSEnabled(browserViewId);
		} catch (error) {
			this.logger.error('Failed to enable CSS domain', { error });
		}
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
					this.logger.info('DevTools extensions loaded', { count: loaded.length, names: loaded.map(r => r.name) });
				}
				if (failed.length > 0) {
					this.logger.warn('DevTools extensions failed to load', { count: failed.length, failures: failed.map(r => ({ name: r.name, error: r.error })) });
				}
			})
			.catch(e => {
				this.logger.error('Error loading DevTools extensions', { error: e });
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
		const windowId = window.id;

		// Check if we already have listeners for this window
		// If yes, just track this browserViewId - don't add duplicate listeners
		let browserViewIds = this.windowSafetyLeashListeners.get(windowId);
		if (browserViewIds) {
			browserViewIds.add(browserViewId);
			return; // Listeners already attached to this window
		}

		// First time adding listeners for this window - create the set
		browserViewIds = new Set([browserViewId]);
		this.windowSafetyLeashListeners.set(windowId, browserViewIds);

		// Define a cleanup function that triggers automatically for ALL browser views on this window
		const autoDestruct = (reason: string) => {
			this.logger.info('Safety leash auto-destroy triggered', { windowId, reason });
			// Destroy ALL browser views for this window
			const viewsToDestroy = Array.from(browserViewIds || []);
			for (const viewId of viewsToDestroy) {
				// Fire and forget - we don't await because the window is dying
				this.destroyBrowserViewSync(viewId, `safety-leash:${reason}`);
			}
			// Clean up the listener tracking
			this.windowSafetyLeashListeners.delete(windowId);
		};

		// 1. HISTORICAL: 'did-start-loading' was too broad - fired on ANY workbench reload
		// including extension panel refreshes. Now handled via ILifecycleMainService.onWillLoadWindow
		// window.webContents.once('did-start-loading', () => autoDestruct('did-start-loading'));

		// 2. If the IDE window is closed entirely
		window.once('closed', () => autoDestruct('window-closed'));

		// 3. If the renderer process crashes or is killed
		window.webContents.once('render-process-gone', (_event, details) => {
			this.logger.warn('render-process-gone detected', { windowId, details });
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

		this.logger.warn('destroyBrowserViewSync invoked', {
			browserViewId,
			source: source ?? 'unknown',
			hadBrowserView,
			activeIdsSnapshot
		});

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
		this.favicons.delete(browserViewId);
		this.faviconReceivedForCurrentLoad.delete(browserViewId);
		BrowserViewService.managedWebContentsIds.delete(browserViewId);

		// Cleanup tab maps
		const tabId = this.browserViewIdToTab.get(browserViewId);
		if (tabId !== undefined) {
			this.tabToBrowserViewId.delete(tabId);
			this.browserViewIdToTab.delete(browserViewId);
			this._onTabClosed.fire({ tabId });
			if (this.activeTabId === tabId) {
				const remaining = Array.from(this.tabToBrowserViewId.keys());
				this.activeTabId = remaining.length > 0 ? remaining[remaining.length - 1] : undefined;
			}
		}

		this.logger.warn('destroyBrowserViewSync cleanup complete', {
			browserViewId,
			source: source ?? 'unknown',
			activeIdsAfter: Array.from(this.browserViews.keys())
		});
	}

	private setupBrowserEvents(browserView: WebContentsView): void {
		const webContents = browserView.webContents;
		const browserViewId = webContents.id;

		// =====================================================
		// IPC messages from preload script (roopikBrowser.send)
		// Registered ONCE globally (not per-view) to avoid listener stacking
		// =====================================================
		if (!BrowserViewService.ipcListenerRegistered) {
			BrowserViewService.ipcListenerRegistered = true;
			ipcMain.on('roopik:browser-view-message', (_event, channel: string, ...args: unknown[]) => {
				if (channel === 'passkey-not-supported') {
					this.logger.info('WebAuthn/Passkey not supported notification');
				} else {
					this.logger.info('Browser view IPC message', { channel, args });
				}
			});
		}

		// Error codes that are expected/normal and should NOT be logged as errors:
		// -3: ERR_ABORTED - Normal navigation cancellation (user navigated away, pressed stop, or new navigation started)
		const IGNORED_ERROR_CODES = new Set([-3]);

		// =====================================================
		// LIFECYCLE / CRASH DIAGNOSTICS
		// =====================================================

		// Detect when this specific webContents dies (regardless of window events)
		webContents.on('destroyed', () => {
			this.logger.warn('webContents destroyed for browser view', {
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
			this.logger.error('Load failed', { url: validatedURL, errorDescription, errorCode });
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
			this.logger.error('Provisional load failed', { url: validatedURL, errorDescription, errorCode });
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
			// Validate browser view still exists (might be destroyed during reload)
			if (!this.browserViews.has(browserViewId)) {
				return;
			}

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

		webContents.on('page-favicon-updated', (_event, favicons) => {
			// Store first favicon URL and notify renderer
			// But first validate that the favicon actually exists (HEAD request)
			if (favicons && favicons.length > 0) {
				const faviconUrl = favicons[0];

				// Validate favicon URL with HEAD request before using it
				// This prevents 404 errors from showing broken favicon in tab
				this.validateFaviconUrl(faviconUrl).then(isValid => {
					if (isValid) {
						this.favicons.set(browserViewId, faviconUrl);
						this.faviconReceivedForCurrentLoad.set(browserViewId, true);
						this.fireNavigationStateChanged(browserViewId);
					} else {
						// Favicon URL returned 404 or error - don't use it
						// The default globe icon will be shown instead
						// Favicon not found - silently ignore
						return;
					}
				});
			}
		});

		webContents.on('did-start-loading', () => {
			// CRITICAL: Check if browser view still exists before proceeding
			// During reload, the view might be destroyed but event listeners still fire
			if (!this.browserViews.has(browserViewId)) {
				this.logger.warn('did-start-loading fired for destroyed browser view', { browserViewId });
				return;
			}

			// Mark that we haven't received favicon for this page load yet
			this.faviconReceivedForCurrentLoad.set(browserViewId, false);
			// DON'T clear favicon here - keep showing old favicon until new one arrives
			// This provides smoother UX (no blank icon during loading)
			// Fire event with EXPLICIT isLoading = true
			this.fireNavigationStateChanged(browserViewId, true);

			// Enable CSS domain EARLY to capture CSS.styleSheetAdded events
			// Must be enabled before stylesheets load to receive the events
			this.enableCSSForStyleInspection(browserViewId).catch(err => {
				this.logger.warn('Failed to enable CSS for style inspection', { error: err });
			});
		});

		// did-stop-loading is the single source of truth for "loading done"
		// Using ONLY this event (not did-finish-load) prevents double loading bar animations.
		// did-finish-load fires slightly before did-stop-loading, causing a race where
		// hideLoading() gets called twice — producing two overlapping progress bar animations.
		webContents.on('did-stop-loading', () => {
			if (!this.browserViews.has(browserViewId)) {
				return;
			}

			// Clear any previous error on successful load
			this.clearNavigationError(browserViewId);

			// If no favicon was received during this page load, clear the old one
			if (!this.faviconReceivedForCurrentLoad.get(browserViewId)) {
				this.favicons.delete(browserViewId);
			}
			// Fire event with EXPLICIT isLoading = false
			this.fireNavigationStateChanged(browserViewId, false);

			// CRITICAL: Set visual zoom limits AFTER page loads (per Electron docs)
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

		// =====================================================
		// Context Menu (Right-Click)
		// =====================================================

		// Enable standard browser context menu with custom navigation items
		// Disable "Search with Google" and "Select All", add Back/Forward/Reload, keep Inspect Element
		contextMenu({
			window: browserView, // WebContentsView is accepted as a window option
			showSearchWithGoogle: false, // Disable "Search with Google"
			showSelectAll: false, // Disable "Select All" (irrelevant)
			showInspectElement: true, // Always show Inspect Element (best feature for debugging)
			prepend: (defaultActions, params, _browserWindow) => {
				const menuItems: Electron.MenuItemConstructorOptions[] = [];
				const wc = browserView.webContents;

				// Navigation items (Back, Forward, Reload)
				// Only show Back/Forward when they're available
				const canGoBack = wc.navigationHistory.canGoBack();
				const canGoForward = wc.navigationHistory.canGoForward();

				if (canGoBack || canGoForward) {
					if (canGoBack) {
						menuItems.push({
							label: 'Back',
							click: () => {
								wc.navigationHistory.goBack();
							}
						});
					}
					if (canGoForward) {
						menuItems.push({
							label: 'Forward',
							click: () => {
								wc.navigationHistory.goForward();
							}
						});
					}
					menuItems.push({ type: 'separator' });
				}

				menuItems.push({
					label: 'Reload',
					click: () => {
						wc.reload();
					}
				});

				menuItems.push({ type: 'separator' });

				// "Open Source" - opens the source file for the clicked element
				// Uses data-roopik-source attribute injected at build time
				menuItems.push({
					label: 'Open Source',
					click: async () => {
						try {
							// Execute script to find element at click position and get data-roopik-source
							const sourceAttr = await wc.executeJavaScript(`
								(function() {
									const x = ${params.x};
									const y = ${params.y};
									let el = document.elementFromPoint(x, y);

									// Walk up the DOM tree to find nearest element with data-roopik-source
									while (el && el !== document.body && el !== document.documentElement) {
										const source = el.getAttribute('data-roopik-source');
										if (source) {
											return source;
										}
										el = el.parentElement;
									}
									return null;
								})();
							`);

							if (sourceAttr) {
								// Parse the source location: file:startLine:startCol:endLine:endCol
								// Windows paths contain colons (C:\\), so we find the last 4 numeric parts
								const parsed = this.parseSourceAttribute(sourceAttr);
								if (parsed) {
									this._onOpenSourceRequest.fire({
										browserViewId,
										sourceLocation: parsed
									});
								} else {
									this._onOpenSourceRequest.fire({
										browserViewId,
										sourceLocation: null,
										error: `Could not parse source location: ${sourceAttr}`
									});
								}
							} else {
								this._onOpenSourceRequest.fire({
									browserViewId,
									sourceLocation: null,
									error: 'No source tracking found for this element. Source tracking is only available for components built with Roopik.'
								});
							}
						} catch (error) {
							this.logger.error('Failed to get source location', { error });
							this._onOpenSourceRequest.fire({
								browserViewId,
								sourceLocation: null,
								error: `Failed to get source location: ${error}`
							});
						}
					}
				});

				menuItems.push({ type: 'separator' });

				return menuItems;
			},
			append: (_defaultActions, params, _browserWindow) => {
				const menuItems: Electron.MenuItemConstructorOptions[] = [];
				const wc = browserView.webContents;

				// "Attach Element to Context" - sends element HTML to AI agent (at bottom)
				menuItems.push({ type: 'separator' });
				menuItems.push({
					label: 'Attach Element to Context',
					click: async () => {
						// Check if clicking on inspect overlay (skip if yes)
						const isInspectOverlay = await wc.executeJavaScript(`
							(function() {
								const x = ${params.x};
								const y = ${params.y};
								const el = document.elementFromPoint(x, y);
								return el && (el.id === '__roopik_inspect_selected' || el.id === '__roopik_inspect_overlay');
							})();
						`).catch(() => false);

						if (isInspectOverlay) {
							return; // Silently ignore clicks on inspect overlay
						}
						try {
							// Execute script to get element HTML, extract metadata, and strip
							const result = await wc.executeJavaScript(`
								(function() {
									const x = ${params.x};
									const y = ${params.y};
									const el = document.elementFromPoint(x, y);

									if (!el || el === document.body || el === document.documentElement) {
										return null;
									}

									// SHARED UTILITY FUNCTIONS (from htmlUtils.ts)
									// These are copied here to maintain single source of truth
									// See: src/vs/workbench/contrib/roopik/browser/projectMode/utils/htmlUtils.ts

									function extractRoopikMetadata(element) {
										return {
											source: element.getAttribute('data-roopik-source'),
											component: element.getAttribute('data-roopik-component')
										};
									}

									function stripRoopikMetadata(html) {
										return html
											.replace(/\\s+data-roopik-[a-z-]+\\s*=\\s*"[^"]*"/gi, '')
											.replace(/\\s+/g, ' ')
											.trim();
									}

									function getElementSelector(el) {
										if (!el || el === document.body || el === document.documentElement) return null;
										var parts = [];
										var current = el;
										while (current && current !== document.body && current !== document.documentElement) {
											var selector = current.tagName.toLowerCase();
											if (current.id) {
												parts.unshift('#' + CSS.escape(current.id));
												break;
											}
											if (current.className && typeof current.className === 'string') {
												var classes = current.className.trim().split(/\\s+/).filter(function(c) { return c; });
												if (classes.length > 0) {
													selector += '.' + classes.map(function(c) { return CSS.escape(c); }).join('.');
												}
											}
											var parent = current.parentElement;
											if (parent) {
												var siblings = Array.from(parent.children).filter(function(s) { return s.tagName === current.tagName; });
												if (siblings.length > 1) {
													var index = siblings.indexOf(current) + 1;
													selector += ':nth-of-type(' + index + ')';
												}
											}
											parts.unshift(selector);
											current = parent;
										}
										return parts.join(' > ');
									}

									// Extract metadata BEFORE stripping
									const metadata = extractRoopikMetadata(el);

									// Strip ALL metadata from HTML
									const rawHTML = el.outerHTML;
									const cleanHTML = stripRoopikMetadata(rawHTML);

									return {
										html: cleanHTML,
										selector: getElementSelector(el),
										tagName: el.tagName.toLowerCase(),
										source: metadata.source,
										component: metadata.component
									};
								})();
							`);

							if (result && result.html) {
								// Fire event directly (works WITHOUT inspect mode!)
								this._onAttachElementRequest.fire({
									browserViewId,
									html: result.html,
									selector: result.selector,
									tagName: result.tagName,
									source: result.source,
									component: result.component
								});
								// this.logger.info('[ContextMenu] Element attach request sent', {
								// 	tagName: result.tagName,
								// 	hasSource: !!result.source,
								// 	hasComponent: !!result.component,
								// 	source: result.source,
								// 	component: result.component
								// });
							}
						} catch (error) {
							this.logger.error('[ContextMenu] Failed to attach element', { error });
						}
					}
				});

				return menuItems;
			}
		});

	}

	// ============================================
	// Zoom Handling (Native Browser Feel)
	// ============================================

	private setupZoomHandlers(browserView: WebContentsView): void {
		const wc = browserView.webContents;
		const browserViewId = wc.id; // Get the browserViewId from webContents

		// NOTE: setVisualZoomLevelLimits is called in did-stop-loading event
		// (after page loads) per Electron documentation requirements
		// This ensures visual zoom works properly with pinch gestures

		// Centralized key handling via before-input-event
		// All key presses are forwarded to renderer for unified handling
		wc.on('before-input-event', (event, input) => {
			// Forward ALL key events to renderer for centralized handling
			// Only keyDown for now (keyUp could be added if needed)
			if (input.type === 'keyDown' || input.type === 'keyUp') {
				this._onBrowserKeyPress.fire({
					browserViewId,
					key: input.key,
					code: input.code,
					modifiers: {
						ctrl: input.control,
						alt: input.alt,
						shift: input.shift,
						meta: input.meta
					},
					type: input.type
				});
			}

			// Prevent default for ESC key - we handle it centrally in renderer
			// This prevents the browser from handling it first
			if (input.key === 'Escape' && input.type === 'keyDown') {
				event.preventDefault();
				return;
			}

			// Handle keyboard zoom shortcuts (Ctrl++, Ctrl+-, Ctrl+0) locally
			// These are handled here because they affect the webContents directly
			if (input.type !== 'keyDown') {
				return;
			}
			if (!input.control && !input.meta) { return; }

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
	// CSS Source Resolution
	// ============================================

	// ============================================
	// Source Location Parsing
	// ============================================

	/**
	 * Parse data-roopik-source attribute value into structured source location
	 *
	 * Format: file:startLine:startCol:endLine:endCol
	 * Windows paths contain colons (C:\), so we parse from the end to find numeric parts.
	 *
	 * @param sourceAttr - The raw attribute value
	 * @returns Parsed source location or null if invalid
	 */
	private parseSourceAttribute(sourceAttr: string): { file: string; line: number; column?: number; endLine?: number; endColumn?: number } | null {
		if (!sourceAttr) {
			return null;
		}

		// Split by colons
		const parts = sourceAttr.split(':');

		// Need at least 2 parts: file + line
		// Full format: file:line:col:endLine:endCol (5 numeric parts at end, or less)
		if (parts.length < 2) {
			return null;
		}

		// Parse numeric values from the end
		// Last 4 can be: line, col, endLine, endCol (all numbers)
		// Find where numbers start from the end
		let numericStartIndex = parts.length;
		for (let i = parts.length - 1; i >= 0; i--) {
			const num = parseInt(parts[i], 10);
			if (isNaN(num)) {
				numericStartIndex = i + 1;
				break;
			}
		}

		// File is everything before numeric parts
		const fileParts = parts.slice(0, numericStartIndex);
		const numericParts = parts.slice(numericStartIndex);

		if (fileParts.length === 0 || numericParts.length === 0) {
			return null;
		}

		const file = fileParts.join(':'); // Rejoin file path (handles Windows C:\)
		const line = parseInt(numericParts[0], 10);

		if (isNaN(line)) {
			return null;
		}

		const result: { file: string; line: number; column?: number; endLine?: number; endColumn?: number } = {
			file,
			line
		};

		// Optional: column, endLine, endColumn
		if (numericParts.length >= 2) {
			const col = parseInt(numericParts[1], 10);
			if (!isNaN(col)) {
				result.column = col;
			}
		}

		if (numericParts.length >= 3) {
			const endLine = parseInt(numericParts[2], 10);
			if (!isNaN(endLine)) {
				result.endLine = endLine;
			}
		}

		if (numericParts.length >= 4) {
			const endCol = parseInt(numericParts[3], 10);
			if (!isNaN(endCol)) {
				result.endColumn = endCol;
			}
		}

		return result;
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
			this.logger.error('getElementStyles error', { error });
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
