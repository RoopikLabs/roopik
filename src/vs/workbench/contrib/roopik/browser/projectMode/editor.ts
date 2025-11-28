/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { EditorPane } from '../../../../browser/parts/editor/editorPane.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { EditorTabInput } from './editorTabInput.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Dimension } from '../../../../../base/browser/dom.js';
import { IEditorOpenContext } from '../../../../common/editor.js';
import { RoopikLogger } from '../../common/roopikLogger.js';
import { ILoggerService, ILogger } from '../../../../../platform/log/common/log.js';
import { IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { IMainProcessService } from '../../../../../platform/ipc/common/mainProcessService.js';
import { INativeHostService } from '../../../../../platform/native/common/native.js';
import { ServiceBridge } from './serviceBridge.js';
import { PROJECT_MODE_CHANNEL } from '../../common/projectMode/ipc.js';
import { BrowserControlBar, IBrowserControlBarConfig, IBrowserControlBarCallbacks } from './components/browserControlBar.js';
import type { ViewBounds, NavigationStateChangedEvent } from '../../common/projectMode/types.js';
import { IRoopikEventService } from '../../common/events/index.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
// Features (extracted to features/ folder)
import { InspectMode } from './features/inspectMode.js';
import { Bookmarks } from './features/bookmarks.js';
import { BrowserPause } from './features/browserPause.js';
import { ActionBar } from './features/actionBar.js';

/**
 * Project Mode Editor
 *
 * Browser Preview with embedded DevTools using WebContentsView.
 * Features:
 * - Real Chromium browser via WebContentsView
 * - Embedded DevTools (ON-DEMAND creation) with Device Toolbar
 * - CDP integration for AI agents (MCP compatible)
 */
export class Editor extends EditorPane {
	static readonly ID = 'roopik.projectModeEditor';


	private container: HTMLElement | undefined;
	private controlBar: BrowserControlBar | undefined;
	private contentContainer: HTMLElement | undefined;
	private browserContainer: HTMLElement | undefined;
	private logger: ILogger;

	// Service bridge to main process
	private browserService: ServiceBridge;

	// View IDs
	private browserViewId: number | undefined;
	private devtoolsVisible: boolean = false;

	// Initialization state to prevent double init
	private isInitializing: boolean = false;

	// ResizeObserver for automatic bounds updates
	private resizeObserver: ResizeObserver | undefined;

	// Track if a real URL has been loaded (not about:blank)
	// Used to decide whether to show placeholder on tab switch
	private hasLoadedUrl: boolean = false;


	// Track WHICH input we've registered the dispose listener for
	// setInput() is called on EVERY tab switch, and may pass a different input instance!
	private registeredInputForDispose: EditorTabInput | undefined;

	// Features (extracted to features/ folder)
	private inspectMode!: InspectMode;
	private bookmarks!: Bookmarks;
	private browserPause!: BrowserPause;
	private actionBar!: ActionBar;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService private readonly storageService: IStorageService,
		@ILoggerService loggerService: ILoggerService,
		@IMainProcessService mainProcessService: IMainProcessService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@IRoopikEventService private readonly eventService: IRoopikEventService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@INotificationService private readonly notificationService: INotificationService,
		@IClipboardService private readonly clipboardService: IClipboardService
	) {
		super(Editor.ID, group, telemetryService, themeService, storageService);
		this.logger = RoopikLogger.create(loggerService);
		this.browserService = new ServiceBridge(mainProcessService.getChannel(PROJECT_MODE_CHANNEL));

		// Initialize features (extracted to features/ folder)
		this.inspectMode = new InspectMode(this.browserService, this.notificationService);
		this.bookmarks = new Bookmarks(this.storageService, this.notificationService, this.logger);
		this.browserPause = new BrowserPause(this.browserService);
		this.actionBar = new ActionBar(this.browserService, this.logger);

		// Setup event subscriptions for UI updates
		this.setupEventSubscriptions();

		// Setup menu/command palette pause detection
		this.setupBrowserPauseDetection();
	}

	/**
	 * Subscribe to events from the central event bus for UI updates
	 * This demonstrates the event-driven architecture where:
	 * 1. IPC event comes from main process
	 * 2. We publish to EventService (📤 PUBLISH)
	 * 3. Subscribers receive and update UI (📥 RECEIVED)
	 */
	private setupEventSubscriptions(): void {
		// Subscribe to navigation events - update URL bar
		this._register(this.eventService.onBrowserNavigated((event) => {

			// Update URL bar
			if (this.controlBar) {
				this.controlBar.setUrl(event.url);
			}

			// Update placeholder visibility based on URL
			const isRealUrl = event.url && event.url !== 'about:blank';
			if (isRealUrl) {
				if (!this.hasLoadedUrl) {
					this.hasLoadedUrl = true;
					this.hidePlaceholder();
				}
			} else {
				if (this.hasLoadedUrl) {
					this.hasLoadedUrl = false;
					this.showPlaceholder();
				}
			}
		}));

		// Subscribe to title change events - update tab title
		this._register(this.eventService.onBrowserTitleChanged((event) => {

			const input = this.input as EditorTabInput;
			if (input) {
				input.setPageTitle(event.title);
			}
		}));
	}

	/**
	 * Setup detection for menus and command palette to pause browser
	 *
	 * Problem: WebContentsView (native Chromium) renders ON TOP of VSCode's HTML menus.
	 * Solution: When menus/command palette open, hide browser and show "Browsing Paused" overlay.
	 *
	 * This is the same approach used by Cursor IDE.
	 *
	 * Currently handled:
	 * - Command Palette (Ctrl+Shift+P) via IQuickInputService
	 * - Context menus (right-click) via IContextMenuService
	 *
	 * TODO: Native menu bar (File, Edit, View...) needs main process IPC
	 * The native Electron menu doesn't fire events in the renderer process.
	 * To fix this, we need to:
	 * 1. Add menu-will-show/menu-will-close event handlers in main process Menubar class
	 * 2. Create IPC channel to notify renderer when menu opens/closes
	 * 3. Subscribe to those events here
	 */
	private setupBrowserPauseDetection(): void {
		// 1. Command Palette detection via IQuickInputService
		this._register(this.quickInputService.onShow(() => {
			this.pauseBrowser();
		}));

		this._register(this.quickInputService.onHide(() => {
			this.resumeBrowser();
		}));

		// 2. Context menu (right-click) detection via IContextMenuService
		this._register(this.contextMenuService.onDidShowContextMenu(() => {
			this.pauseBrowser();
		}));

		this._register(this.contextMenuService.onDidHideContextMenu(() => {
			this.resumeBrowser();
		}));
	}

	/**
	 * Pause browser - delegates to BrowserPause feature
	 */
	private pauseBrowser(): void {
		this.browserPause.pause(this.browserViewId, this.browserContainer, this.hasLoadedUrl);
	}

	/**
	 * Resume browser - delegates to BrowserPause feature
	 */
	private resumeBrowser(): void {
		this.browserPause.resume(this.browserViewId, this.hasLoadedUrl, this.isVisible());
	}

	protected createEditor(parent: HTMLElement): void {
		// Main container
		this.container = document.createElement('div');
		this.container.style.display = 'flex';
		this.container.style.flexDirection = 'column';
		this.container.style.height = '100%';
		this.container.style.width = '100%';
		this.container.style.position = 'relative';
		this.container.style.overflow = 'hidden';
		parent.appendChild(this.container);

		// Browser control bar configuration
		const config: IBrowserControlBarConfig = {
			showDevTools: true,
			showInspectMode: true,
			showScreenshot: true,
			showHardReload: true,
			showCopyUrl: true,
			showBookmarks: true,
			showEditMode: true
		};

		// Browser control bar callbacks
		const callbacks: IBrowserControlBarCallbacks = {
			onNavigate: (url: string) => this.navigate(url),
			onBack: () => this.goBack(),
			onForward: () => this.goForward(),
			onHome: () => this.goHome(),
			onRefresh: () => this.refresh(),
			onStopDevServer: () => this.stopDevServer(),
			onInspectMode: () => this.enableInspectMode(),
			onDevTools: () => this.toggleDevTools(),
			onHardReload: () => this.hardReload(),
			onScreenshot: () => this.takeScreenshot(),
			onCopyUrl: () => this.copyCurrentUrl(),
			// Bookmark callbacks (delegate to Bookmarks feature)
			onBookmarkAdd: (bookmark) => this.bookmarks.add(bookmark),
			onBookmarkRemove: (url) => this.bookmarks.remove(url),
			onBookmarkClick: (url) => this.navigate(url),
			getBookmarks: () => this.bookmarks.getAll(),
			isBookmarked: (url) => this.bookmarks.isBookmarked(url),
			// Edit Mode callback
			onEditModeToggle: (enabled: boolean) => this.toggleEditModeToolbar(enabled)
		};

		this.controlBar = this._register(new BrowserControlBar(this.container, config, callbacks));

		// Content container (browser + devtools)
		this.contentContainer = document.createElement('div');
		this.contentContainer.style.flex = '1 1 auto';
		this.contentContainer.style.display = 'flex';
		this.contentContainer.style.flexDirection = 'column';
		this.contentContainer.style.position = 'relative';
		this.contentContainer.style.overflow = 'hidden';
		this.contentContainer.style.minHeight = '0';
		this.contentContainer.style.height = 'calc(100% - 2px)'; // Prevent terminal overlap
		this.contentContainer.style.width = '100%';
		this.container.appendChild(this.contentContainer);

		// Browser container (top area)
		this.browserContainer = document.createElement('div');
		this.browserContainer.style.flex = '1 1 0%';
		this.browserContainer.style.display = 'flex';
		this.browserContainer.style.overflow = 'hidden';
		this.browserContainer.style.backgroundColor = 'var(--vscode-editor-background)';
		this.browserContainer.style.position = 'relative';
		this.browserContainer.style.minHeight = '0';
		this.browserContainer.style.width = '100%';
		this.contentContainer.appendChild(this.browserContainer);

		// Placeholder shown when no URL is loaded (WebContentsView renders on top of this)
		this.createPlaceholder();

		// Setup ResizeObserver for automatic bounds updates
		// Observe container and browserContainer to catch all resize events
		// This is critical for split screen scenarios where parent resizes
		this.resizeObserver = new ResizeObserver(() => {
			this.updateViewBounds();
			// Also update action bar bounds on resize
			this.updateBottomActionBarBounds();
		});
		this.resizeObserver.observe(this.container); // Parent container for split resize
		this.resizeObserver.observe(this.browserContainer);

		// NOTE: Browser view initialization is handled by setInput()
		// This ensures only ONE initialization happens per editor lifecycle
	}

	// Promise for initialization - used to wait if already initializing
	private initializationPromise: Promise<void> | undefined;

	// Placeholder element shown when no URL is loaded
	private placeholderElement: HTMLElement | undefined;

	/**
	 * Create placeholder shown when no URL is loaded
	 */
	private createPlaceholder(): void {
		if (!this.browserContainer) {
			return;
		}

		this.placeholderElement = document.createElement('div');
		this.placeholderElement.style.cssText = `
			position: absolute;
			top: 0;
			left: 0;
			right: 0;
			bottom: 0;
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			color: var(--vscode-descriptionForeground);
			font-family: var(--vscode-font-family);
			font-size: 14px;
			gap: 16px;
			z-index: 1;
		`;

		// Icon
		const icon = document.createElement('div');
		icon.style.cssText = `
			font-size: 48px;
			opacity: 0.5;
		`;
		icon.textContent = '🌐';
		this.placeholderElement.appendChild(icon);

		// Title
		const title = document.createElement('div');
		title.style.cssText = `
			font-size: 16px;
			font-weight: 500;
			color: var(--vscode-foreground);
		`;
		title.textContent = 'Browser Preview';
		this.placeholderElement.appendChild(title);

		// Description
		const description = document.createElement('div');
		description.style.cssText = `
			opacity: 0.7;
			text-align: center;
			max-width: 300px;
		`;
		description.textContent = 'Enter a URL in the address bar above to start browsing';
		this.placeholderElement.appendChild(description);

		this.browserContainer.appendChild(this.placeholderElement);
	}

	/**
	 * Hide placeholder when URL is loaded
	 * Shows the WebContentsView using native visibility API
	 */
	private hidePlaceholder(): void {
		if (this.placeholderElement) {
			this.placeholderElement.style.display = 'none';
		}
		// Show the browser view using native visibility API (like Cursor)
		if (this.browserViewId) {
			this.browserService.setBrowserVisible(this.browserViewId, true);
			// Update bounds with robust timing to ensure CSS layout is complete
			this.updateBoundsWithRetry();
		}
	}

	/**
	 * Update bounds with retry mechanism to handle CSS layout timing
	 * Uses requestAnimationFrame + multiple delays to ensure bounds are correct
	 */
	private updateBoundsWithRetry(): void {
		// Immediate update (may get wrong bounds if layout not complete)
		this.updateViewBounds();
		this.updateBottomActionBarBounds();

		// Use requestAnimationFrame to wait for next paint
		requestAnimationFrame(() => {
			this.updateViewBounds();
			this.updateBottomActionBarBounds();

			// Additional delayed updates to catch late layout changes
			// This handles split screen and other complex layout scenarios
			setTimeout(() => {
				this.updateViewBounds();
				this.updateBottomActionBarBounds();
			}, 50);

			setTimeout(() => {
				this.updateViewBounds();
				this.updateBottomActionBarBounds();
			}, 150);

			// Final update after layout should definitely be stable
			setTimeout(() => {
				this.updateViewBounds();
				this.updateBottomActionBarBounds();
			}, 300);
		});
	}

	/**
	 * Show placeholder when no URL is loaded
	 * Hides the WebContentsView using native visibility API so placeholder is visible
	 */
	private showPlaceholder(): void {
		if (this.placeholderElement) {
			this.placeholderElement.style.display = 'flex';
		}
		// Hide the browser view using native visibility API (like Cursor)
		// This properly hides the native view without destroying state
		if (this.browserViewId) {
			this.browserService.setBrowserVisible(this.browserViewId, false);
		}
	}

	/**
	 * Initialize browser WebContentsView
	 * Note: This only creates the view, navigation is handled by setInput()
	 */
	private initializeBrowserView(): Promise<void> {
		// If already initialized, skip
		if (this.browserViewId) {
			return Promise.resolve();
		}

		// If already initializing, wait for that to complete instead of starting a new one
		// CRITICAL: Check isInitializing FIRST (sync flag set before promise created)
		if (this.isInitializing) {
			// Return existing promise if available, otherwise resolve immediately
			return this.initializationPromise || Promise.resolve();
		}

		// Mark as initializing SYNCHRONOUSLY before ANY async work
		this.isInitializing = true;

		// Create and store the promise SYNCHRONOUSLY so other callers can wait for it
		this.initializationPromise = this.doInitializeBrowserView();
		return this.initializationPromise;
	}

	/**
	 * Actual initialization logic
	 */
	private async doInitializeBrowserView(): Promise<void> {
		try {
			const windowId = await this.nativeHostService.windowId;
			const result = await this.browserService.createBrowserView(windowId);
			this.browserViewId = result.browserViewId;

			// Publish browser created event to central event bus
			this.eventService.publish('browser.created', {
				browserViewId: this.browserViewId,
				windowId,
				url: 'about:blank',
				title: 'Browser Preview'
			});

			// Subscribe to DevTools closed event (handles user closing via X button)
			// This is event-driven, not polling - much more efficient!
			this._register(this.browserService.onDevToolsClosed((event) => {
				if (event.browserViewId === this.browserViewId && this.devtoolsVisible) {
					this.devtoolsVisible = false;
				}
			}));

			// Subscribe to navigation state changed event (replaces polling!)
			// This is event-driven - fires on URL change, title change, loading state change
			this._register(this.browserService.onNavigationStateChanged((event) => {
				this.handleNavigationStateChanged(event);
			}));

			// Show placeholder initially (hides WebContentsView until user navigates)
			// This must happen BEFORE updateViewBounds to prevent flicker
			this.showPlaceholder();

			// Enable CDP domains for debugging (don't await - do it in background)
			this.browserService.enableCDPDomains(this.browserViewId, {
				network: true,
				dom: true,
				css: true,
				runtime: true,
				page: true
			}).catch((cdpError) => {
				this.logger.warn('[ProjectMode] Failed to enable CDP domains (non-fatal):', cdpError);
			});

			// Note: Navigation is handled by setInput(), not here
			// This prevents double navigation when reopening tabs
		} catch (error) {
			this.logger.error('[ProjectMode] Failed to initialize browser view:', error);
			this.browserViewId = undefined;
		} finally {
			this.isInitializing = false;
		}
	}

	// Track last known values to avoid unnecessary updates (for event-driven navigation)
	private lastKnownUrl = '';
	private lastKnownTitle = '';
	private lastErrorUrl = ''; // Track which URL we showed error for
	private wasLoading = false; // Track loading state for progress bar

	/**
	 * Handle navigation state changed event from main process
	 * This replaces polling - much more efficient!
	 * Event fires on: did-navigate, did-start-loading, did-finish-load, page-title-updated, did-stop-loading
	 */
	private handleNavigationStateChanged(event: NavigationStateChangedEvent): void {
		// CRITICAL: Filter by browserViewId for multi-browser support!
		// Each browser instance only handles events for its own view
		if (event.browserViewId !== this.browserViewId) {
			return;
		}

		const currentUrl = event.url || '';
		const currentTitle = event.title || '';

		// Update loading progress bar
		// IMPORTANT: Always respect the isLoading value from the event
		// The main process sends explicit true/false values for loading events
		if (event.isLoading) {
			// Currently loading - show loading bar
			if (!this.wasLoading) {
				this.wasLoading = true;
				this.controlBar?.showLoading();

				// Publish loading started event
				this.eventService.publish('browser.loadingStarted', {
					browserViewId: event.browserViewId
				});
			}
		} else {
			// Not loading - ALWAYS hide loading bar
			// This is critical because did-stop-loading sends isLoading=false explicitly
			if (this.wasLoading) {
				// Publish loading finished event
				this.eventService.publish('browser.loadingFinished', {
					browserViewId: event.browserViewId
				});
			}
			this.wasLoading = false;
			this.controlBar?.hideLoading();
		}

		// Check for navigation errors
		if (event.lastError && event.lastError.validatedURL !== this.lastErrorUrl) {
			this.lastErrorUrl = event.lastError.validatedURL;

			// Hide loading bar on error
			if (this.controlBar) {
				this.controlBar.hideLoading();
			}
			this.wasLoading = false;

			// Show error on placeholder
			const errorMessage = this.getNavigationErrorMessageFromCode(
				event.lastError.errorCode,
				event.lastError.errorDescription,
				event.lastError.validatedURL
			);
			this.showNavigationError(errorMessage);
		}

		// Check if URL changed
		if (currentUrl !== this.lastKnownUrl) {
			this.lastKnownUrl = currentUrl;

			// Publish navigation event to central event bus (title is sent separately via titleChanged)
			this.eventService.publish('browser.navigated', {
				browserViewId: event.browserViewId,
				url: currentUrl
			});

			// UI updates now happen via event subscription (see setupEventSubscriptions)
		}

		// Update tab title when page title changes
		if (currentTitle !== this.lastKnownTitle) {
			this.lastKnownTitle = currentTitle;

			// Publish title changed event to central event bus
			this.eventService.publish('browser.titleChanged', {
				browserViewId: event.browserViewId,
				title: currentTitle
			});

			// UI updates now happen via event subscription (see setupEventSubscriptions)
		}

		// Update back/forward button states
		if (this.controlBar) {
			this.controlBar.updateNavigationState(event.canGoBack, event.canGoForward);
		}
	}

	/**
	 * Get user-friendly error message from error code
	 */
	private getNavigationErrorMessageFromCode(errorCode: number, errorDescription: string, url: string): string {
		const host = this.extractHost(url);

		switch (errorCode) {
			case -102: // ERR_CONNECTION_REFUSED
				return `Cannot connect to ${host}. Is the server running?`;
			case -105: // ERR_NAME_NOT_RESOLVED
				return `Cannot find "${host}". Check the URL and try again.`;
			case -106: // ERR_INTERNET_DISCONNECTED
				return 'No internet connection. Check your network settings.';
			case -7: // ERR_TIMED_OUT
				return `Connection timed out. "${host}" took too long to respond.`;
			case -200: // ERR_CERT_COMMON_NAME_INVALID
				return `Certificate error for "${host}". The site's certificate is invalid.`;
			case -201: // ERR_CERT_DATE_INVALID
				return `Certificate expired for "${host}".`;
			case -202: // ERR_CERT_AUTHORITY_INVALID
				return `Untrusted certificate for "${host}".`;
			case -118: // ERR_CONNECTION_TIMED_OUT
				return `Connection to "${host}" timed out.`;
			case -137: // ERR_NAME_RESOLUTION_FAILED
				return `DNS lookup failed for "${host}".`;
			default:
				// Use error description if available
				if (errorDescription) {
					return `${errorDescription} for "${host}"`;
				}
				return `Failed to load "${host}" (error ${errorCode})`;
		}
	}

	/**
	 * Update WebContentsView bounds based on container sizes
	 */
	private updateViewBounds(): void {
		if (!this.browserViewId || !this.browserContainer) {
			return;
		}

		// Check if editor is visible
		if (!this.isVisible()) {
			this.hideViews();
			return;
		}

		const browserRect = this.browserContainer.getBoundingClientRect();
		if (browserRect.width === 0 || browserRect.height === 0) {
			this.hideViews();
			return;
		}

		// Update browser bounds
		const browserBounds: ViewBounds = {
			x: Math.floor(browserRect.left),
			y: Math.floor(browserRect.top),
			width: Math.floor(browserRect.width),
			height: Math.floor(browserRect.height)
		};
		this.browserService.setBrowserBounds(this.browserViewId, browserBounds);

		// Note: In attached mode, Electron manages DevTools layout automatically
	}

	/**
	 * Hide views using native visibility API
	 * Preserves browser state (doesn't destroy)
	 */
	private hideViews(): void {
		if (this.browserViewId) {
			this.browserService.setBrowserVisible(this.browserViewId, false);
			// Note: DevTools visibility is handled separately when embedded
		}
	}

	// ============================================
	// Navigation
	// ============================================

	private async navigate(url: string): Promise<void> {
		if (!url) {
			this.logger.warn('[ProjectMode] Navigation aborted: No URL provided');
			return;
		}

		if (!this.browserViewId) {
			this.logger.error('[ProjectMode] Navigation aborted: No browser view ID! Browser view may not be initialized.');
			return;
		}

		const trimmedUrl = url.trim();
		if (!trimmedUrl) {
			return;
		}

		// Check if input looks like a URL or a search query
		// Like Chrome: if it's not a valid URL pattern, search Google instead
		if (this.isSearchQuery(trimmedUrl)) {
			// Convert search query to Google search URL
			const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(trimmedUrl)}`;
			this.logger.info(`[ProjectMode] Searching Google for: "${trimmedUrl}"`);
			url = searchUrl;
		} else if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://') && !trimmedUrl.startsWith('about:')) {
			// Looks like a URL without protocol - add https://
			url = 'https://' + trimmedUrl;
		} else {
			url = trimmedUrl;
		}

		// Track if we're loading a real URL (for tab switch behavior)
		const isRealUrl = url !== 'about:blank';

		// Update placeholder visibility immediately for instant feedback
		// (polling will also handle this, but immediate update feels snappier)
		if (isRealUrl) {
			this.hasLoadedUrl = true;
			this.hidePlaceholder();
		} else {
			this.hasLoadedUrl = false;
			this.showPlaceholder();
		}

		try {
			await this.browserService.navigate(this.browserViewId, url);

			// Update control bar immediately (polling will keep it in sync after redirects)
			if (this.controlBar) {
				this.controlBar.setUrl(url);
			}

			// Update input
			const input = this.input as EditorTabInput;
			if (input) {
				input.setUrl(url);
			}
		} catch (error) {
			this.logger.error(`[ProjectMode] Navigation failed for URL "${url}":`, error);

			// Show user-friendly error message
			const errorMessage = this.getNavigationErrorMessage(error, url);
			this.showNavigationError(errorMessage);
		}
	}

	/**
	 * Get user-friendly error message for navigation failure
	 */
	private getNavigationErrorMessage(error: unknown, url: string): string {
		const errorStr = String(error).toLowerCase();

		// Connection refused (server not running)
		if (errorStr.includes('err_connection_refused') || errorStr.includes('-102')) {
			return `Cannot connect to ${this.extractHost(url)}. Is the server running?`;
		}

		// DNS resolution failed
		if (errorStr.includes('err_name_not_resolved') || errorStr.includes('-105')) {
			return `Cannot find "${this.extractHost(url)}". Check the URL and try again.`;
		}

		// Network disconnected
		if (errorStr.includes('err_internet_disconnected') || errorStr.includes('-106')) {
			return 'No internet connection. Check your network settings.';
		}

		// Timeout
		if (errorStr.includes('err_timed_out') || errorStr.includes('-7')) {
			return `Connection timed out. "${this.extractHost(url)}" took too long to respond.`;
		}

		// Invalid URL
		if (errorStr.includes('err_invalid_url')) {
			return `Invalid URL: "${url}"`;
		}

		// Generic error with URL
		return `Failed to load "${this.extractHost(url)}"`;
	}

	/**
	 * Extract hostname from URL for error messages
	 */
	private extractHost(url: string): string {
		try {
			const urlObj = new URL(url);
			return urlObj.hostname || url;
		} catch {
			return url;
		}
	}

	private async goBack(): Promise<void> {
		if (this.browserViewId) {
			await this.browserService.goBack(this.browserViewId);
		}
	}

	private async goForward(): Promise<void> {
		if (this.browserViewId) {
			await this.browserService.goForward(this.browserViewId);
		}
	}

	private goHome(): void {
		// Just navigate to about:blank - the navigation polling will
		// detect the URL change and show the placeholder automatically
		this.navigate('about:blank');
	}

	private async refresh(): Promise<void> {
		if (this.browserViewId) {
			await this.browserService.reload(this.browserViewId, false);
		}
	}

	private async hardReload(): Promise<void> {
		if (this.browserViewId) {
			await this.browserService.reload(this.browserViewId, true);
		}
	}

	/**
	 * Stop Dev Server (placeholder - feature coming later)
	 * Will stop the Vite/dev server when implemented
	 */
	private stopDevServer(): void {
		// TODO: Implement dev server stop functionality
		// This will integrate with ViteServerService when available
		this.logger.info('[ProjectMode] Stop Dev Server clicked (not yet implemented)');
	}

	// ============================================
	// DevTools
	// ============================================

	private async toggleDevTools(): Promise<void> {
		if (!this.browserViewId) {
			return;
		}

		if (this.devtoolsVisible) {
			// Close DevTools
			await this.browserService.closeDevTools(this.browserViewId);
			this.devtoolsVisible = false;
		} else {
			// Open DevTools in attached mode (docked at bottom)
			// Electron manages the layout. Device Toolbar toggle and close button are available.
			// Users can detach from DevTools settings menu if needed.
			await this.browserService.openDevTools(this.browserViewId, {});
			this.devtoolsVisible = true;
		}
	}

	// ============================================
	// Edit Mode & Action Bar (delegates to ActionBar feature)
	// ============================================

	/**
	 * Toggle Edit Mode - shows/hides the bottom action bar
	 */
	private async toggleEditModeToolbar(enabled: boolean): Promise<void> {
		if (enabled) {
			if (!this.actionBar.exists) {
				await this.actionBar.create(this.browserViewId!, this.getBrowserBounds());
			} else {
				await this.actionBar.show();
			}
			this.logger.info('[ProjectMode] Edit Mode ENABLED');
		} else {
			await this.actionBar.hide();
			this.logger.info('[ProjectMode] Edit Mode DISABLED');
		}
	}

	/**
	 * Get current browser container bounds
	 */
	private getBrowserBounds(): ViewBounds {
		const rect = this.browserContainer?.getBoundingClientRect() || { left: 0, top: 0, width: 0, height: 0 };
		return {
			x: Math.floor(rect.left),
			y: Math.floor(rect.top),
			width: Math.floor(rect.width),
			height: Math.floor(rect.height)
		};
	}

	/**
	 * Update action bar bounds when browser resizes
	 */
	private async updateBottomActionBarBounds(): Promise<void> {
		await this.actionBar.updateBounds(this.getBrowserBounds());
	}

	// TODO: Action bar features are unimplemented
	// Communication will use executeScript for on-demand queries

	// ============================================
	// Inspect Mode (delegates to InspectMode feature class)
	// ============================================

	/**
	 * Enable Inspect Element Mode
	 * Fire and forget - browser script handles auto-cleanup after copy
	 */
	private async enableInspectMode(): Promise<void> {
		if (!this.browserViewId) {
			return;
		}
		await this.inspectMode.enable(this.browserViewId);
	}

	/**
	 * Get the last inspected element's HTML
	 * API for programmatic access (agents, automation tools like Playwright)
	 */
	public async getLastInspectedElementHtml(): Promise<string | null> {
		return this.inspectMode.getLastInspectedHtml(this.browserViewId!);
	}

	/**
	 * Check if inspect mode is active in the browser
	 * API for programmatic access
	 */
	public async isInspectModeActive(): Promise<boolean> {
		if (!this.browserViewId) {
			return false;
		}
		return this.inspectMode.isActiveInBrowser(this.browserViewId);
	}

	/**
	 * Enable inspect mode programmatically
	 * API for agents and automation tools
	 */
	public async startInspectMode(): Promise<void> {
		if (this.browserViewId) {
			await this.inspectMode.enable(this.browserViewId);
		}
	}

	/**
	 * Inspect and copy element at specific coordinates
	 * API for agents to programmatically inspect without user interaction
	 *
	 * @param x - X coordinate in viewport
	 * @param y - Y coordinate in viewport
	 * @returns The outerHTML of the element at those coordinates
	 */
	public async inspectElementAt(x: number, y: number): Promise<string | null> {
		if (!this.browserViewId) {
			return null;
		}

		try {
			const html = await this.browserService.executeScript(
				this.browserViewId,
				`
					(function() {
						const el = document.elementFromPoint(${x}, ${y});
						if (el) {
							return el.outerHTML;
						}
						return null;
					})();
				`
			);
			return html;
		} catch {
			return null;
		}
	}

	// ============================================
	// Utilities
	// ============================================

	/**
	 * Get current URL (for programmatic/agent access)
	 * Does NOT copy to clipboard - just returns the URL string
	 *
	 * @returns Current browser URL, or empty string if no URL loaded
	 */
	public getCurrentUrl(): string {
		return this.controlBar?.getUrl() || '';
	}

	/**
	 * Copy current URL to clipboard (for UI button clicks)
	 * Only call this from UI interactions, not from agent code
	 */
	private async copyCurrentUrl(): Promise<void> {
		const url = this.getCurrentUrl();
		if (!url || url === 'about:blank') {
			this.notificationService.notify({
				severity: Severity.Warning,
				message: 'No URL to copy. Navigate to a page first.',
				sticky: false
			});
			return;
		}

		try {
			// Use VSCode's clipboard service (works reliably in Electron)
			await this.clipboardService.writeText(url);
			this.logger.info(`[ProjectMode] URL copied to clipboard: ${url}`);

			// Show success notification
			this.notificationService.notify({
				severity: Severity.Info,
				message: `URL copied: ${url}`,
				sticky: false
			});
		} catch (error) {
			this.logger.error('[ProjectMode] Failed to copy URL to clipboard:', error);
			this.notificationService.notify({
				severity: Severity.Error,
				message: 'Failed to copy URL to clipboard',
				sticky: false
			});
		}
	}

	private async takeScreenshot(): Promise<void> {
		if (!this.browserViewId) {
			return;
		}

		try {
			const dataUrl = await this.browserService.takeScreenshot(this.browserViewId);

			// Copy to clipboard or download
			const link = document.createElement('a');
			link.download = `screenshot-${Date.now()}.png`;
			link.href = dataUrl;
			link.click();
		} catch (error) {
			this.logger.error('[ProjectMode] Screenshot failed:', error);
		}
	}

	// ============================================
	// Lifecycle
	// ============================================

	override async setInput(input: EditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);

		if (input instanceof EditorTabInput) {
			const initialUrl = input.url;

			// CRITICAL: Listen for input disposal - this means the TAB is truly closed
			// (not just hidden for tab switching). When input is disposed, destroy the browser!
			// NOTE: Only register if we haven't registered for THIS SPECIFIC input instance.
			// setInput() may be called with different input instances on tab switch!
			if (this.registeredInputForDispose !== input) {
				this.registeredInputForDispose = input;
				this._register(input.onWillDispose(() => {
					this.destroyBrowserNow();
				}));
			}

			// Initialize browser view if not already done
			if (!this.browserViewId) {
				// Set URL bar to initial URL for first load
				if (this.controlBar) {
					this.controlBar.setUrl(initialUrl);
				}

				await this.initializeBrowserView();

				// Navigate only on first initialization if we have a real URL
				if (this.browserViewId && initialUrl && initialUrl !== 'about:blank') {
					await this.navigate(initialUrl);
				}
			} else {
				// Browser view already exists (tab switch back)
				// Just restore visibility - NO re-navigation needed!

				// Restore URL bar from CURRENT browser URL, not the stale input URL
				// This ensures URL bar shows where the user actually navigated to
				this.syncUrlBarFromBrowser();

				if (this.hasLoadedUrl) {
					// Restore browser visibility
					this.browserService.setBrowserVisible(this.browserViewId, true);
					this.hidePlaceholder();
					// Note: hidePlaceholder() already calls updateBoundsWithRetry()
				} else {
					// Show placeholder if no URL was loaded
					this.showPlaceholder();
				}
			}
		}
	}

	/**
	 * Sync URL bar from current browser URL
	 * Called on tab switch back to restore correct URL
	 */
	private async syncUrlBarFromBrowser(): Promise<void> {
		if (!this.browserViewId || !this.controlBar) {
			return;
		}

		try {
			const state = await this.browserService.getNavigationState(this.browserViewId);
			if (state.url && state.url !== 'about:blank') {
				this.controlBar.setUrl(state.url);
			}
		} catch (error) {
			this.logger.warn('[ProjectMode] Failed to sync URL bar:', error);
		}
	}

	/**
	 * Check if input looks like a search query rather than a URL
	 * Like Chrome's omnibox behavior:
	 * - Contains spaces → search query
	 * - No dots and no protocol → search query
	 * - Single word that's not a valid TLD pattern → search query
	 *
	 * @returns true if input should be treated as a search query
	 */
	private isSearchQuery(input: string): boolean {
		// Already has a protocol - it's a URL
		if (input.startsWith('http://') || input.startsWith('https://') || input.startsWith('about:')) {
			return false;
		}

		// Contains spaces - definitely a search query
		// (URLs cannot have unencoded spaces)
		if (input.includes(' ')) {
			return true;
		}

		// Check if it looks like a domain (has a dot and valid TLD-like pattern)
		// Examples that ARE URLs: google.com, localhost:3000, 192.168.1.1
		// Examples that ARE searches: "hello", "what is react", "fix bug"
		const domainPattern = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/;
		const localhostPattern = /^localhost(:\d+)?(\/.*)?$/;
		const ipPattern = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?(\/.*)?$/;
		const portPattern = /^[a-zA-Z0-9.-]+(:\d+)(\/.*)?$/; // domain:port

		// If it matches any URL-like pattern, it's not a search
		if (domainPattern.test(input) ||
			localhostPattern.test(input) ||
			ipPattern.test(input) ||
			portPattern.test(input)) {
			return false;
		}

		// Single word without dots - could be a search or a simple hostname
		// Treat as search (like Chrome does for most single words)
		// Exception: "localhost" is handled above
		return true;
	}

	/**
	 * Show navigation error message on placeholder
	 */
	private showNavigationError(message: string): void {
		// Show placeholder with error message
		this.hasLoadedUrl = false;
		this.showPlaceholder();

		// Update placeholder to show error
		if (this.placeholderElement) {
			const title = this.placeholderElement.querySelector('div:nth-child(2)') as HTMLElement;
			const description = this.placeholderElement.querySelector('div:nth-child(3)') as HTMLElement;

			if (title) {
				title.textContent = 'Navigation Failed';
			}
			if (description) {
				description.textContent = message;
			}

			// Reset to normal state after 3 seconds
			setTimeout(() => {
				if (title) {
					title.textContent = 'Browser Preview';
				}
				if (description) {
					description.textContent = 'Enter a URL in the address bar above to start browsing';
				}
			}, 3000);
		}
	}

	override setVisible(visible: boolean): void {
		super.setVisible(visible);

		if (visible) {
			// Tab switched back to browser
			if (this.hasLoadedUrl) {
				// User had a URL loaded - restore browser view visibility
				if (this.browserViewId) {
					this.browserService.setBrowserVisible(this.browserViewId, true);
				}
				// Update bounds with retry to ensure correct sizing
				this.updateBoundsWithRetry();
			} else {
				// No URL loaded - show placeholder (browser stays hidden)
				this.showPlaceholder();
			}
		} else {
			// Tab switched away - just hide the view, don't destroy
			// Use native visibility API to preserve browser state (like Cursor)
			if (this.browserViewId) {
				this.browserService.setBrowserVisible(this.browserViewId, false);
			}
		}
	}

	override clearInput(): void {
		super.clearInput();

		// IMPORTANT: Only HIDE the browser view here, don't destroy it!
		// clearInput() is called when switching tabs - we want to preserve the browser state.
		// The browser should only be destroyed in dispose() when the editor is actually closed.
		if (this.browserViewId) {
			this.browserService.setBrowserVisible(this.browserViewId, false);
		}

		// Note: We do NOT reset hasLoadedUrl, lastKnownUrl, lastKnownTitle etc.
		// because the browser is still alive and will be shown again in setInput()
	}

	override focus(): void {
		// Focus browser
		this.browserContainer?.focus();
	}

	layout(_dimension: Dimension): void {
		// VSCode calls this when editor pane is resized (including split screen)
		// Use the retry mechanism to ensure bounds are correctly updated
		this.updateBoundsWithRetry();
	}

	/**
	 * Destroy browser view immediately
	 * Called when EditorInput is disposed (tab truly closed)
	 */
	private destroyBrowserNow(): void {
		if (!this.browserViewId) {
			return;
		}

		const destroyedBrowserViewId = this.browserViewId;
		this.browserViewId = undefined; // Clear immediately to prevent double destruction

		// Hide views immediately
		this.hideViews();

		// Destroy action bar
		this.actionBar.destroy()
			.catch((err: Error) => this.logger.error('[ProjectMode] Failed to destroy action bar:', err));

		// Publish browser destroyed event to central event bus
		this.eventService.publish('browser.destroyed', {
			browserViewId: destroyedBrowserViewId
		});

		// Destroy the browser view in main process
		this.browserService.destroyBrowserView(destroyedBrowserViewId)
			.catch(err => this.logger.error('[ProjectMode] Failed to destroy browser view:', err));
	}

	override dispose(): void {
		// Cleanup ResizeObserver
		this.resizeObserver?.disconnect();
		this.resizeObserver = undefined;

		// Destroy browser if not already destroyed by input disposal
		// (destroyBrowserNow may have already been called via onWillDispose)
		if (this.browserViewId) {
			this.destroyBrowserNow();
		}

		super.dispose();
	}
}
