/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { EditorPane } from '../../../../browser/parts/editor/editorPane.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ProjectModeV2Input } from './projectModeV2Input.js';
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
import { ProjectModeV2ServiceBridge } from './projectModeV2ServiceBridge.js';
import { PROJECT_MODE_V2_CHANNEL } from '../../common/projectModeV2/ipc.js';
import { BrowserControlBarV2, IBrowserControlBarV2Config, IBrowserControlBarV2Callbacks } from './browserControlBarV2.js';
import type { ViewBounds, DevicePreset, DevToolsMode, NavigationStateChangedEvent } from '../../common/projectModeV2/types.js';
import { generateFloatingToolbarHtml, FloatingToolbarState } from './floatingToolbarHtml.js';
import { IRoopikEventService } from '../../common/events/index.js';

/**
 * DevTools mode configuration flag
 *
 * - 'attached': DevTools docked inside browser window (has Device Toolbar toggle, close button)
 *   Electron manages the DevTools layout. Resize handle is NOT needed.
 *
 * - 'detached': DevTools in separate WebContentsView (full layout control, no Device Toolbar)
 *   We control the DevTools position and size. Resize handle IS needed.
 *
 * TODO: In the future, this will be a user setting preference.
 * For now, we default to 'attached' mode for the Device Toolbar feature.
 */
const DEVTOOLS_MODE: DevToolsMode = 'attached'; // 'attached' or 'detached'

/**
 * Project Mode V2 Editor
 *
 * Browser Preview with embedded DevTools using WebContentsView.
 * Features:
 * - Real Chromium browser via WebContentsView
 * - Embedded DevTools (ON-DEMAND creation)
 * - Device emulation via CDP
 * - CDP integration for AI agents (MCP compatible)
 */
export class ProjectModeV2Editor extends EditorPane {
	static readonly ID = 'roopik.projectModeV2Editor';


	private container: HTMLElement | undefined;
	private controlBar: BrowserControlBarV2 | undefined;
	private contentContainer: HTMLElement | undefined;
	private browserContainer: HTMLElement | undefined;
	private devtoolsContainer: HTMLElement | undefined;
	private logger: ILogger;

	// Service bridge to main process
	private browserService: ProjectModeV2ServiceBridge;

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

	// Floating toolbar overlay
	private floatingToolbarViewId: number | undefined;
	private floatingToolbarState: FloatingToolbarState = {
		activeMode: 'none',
		isExpanded: false
	};

	// DevTools resize handle
	private devtoolsResizeHandle: HTMLElement | undefined;
	private isResizingDevTools: boolean = false;
	private devtoolsMinHeight: number = 100; // Minimum DevTools height in pixels
	private devtoolsMaxHeightRatio: number = 0.8; // Max 80% of content area

	// Track WHICH input we've registered the dispose listener for
	// setInput() is called on EVERY tab switch, and may pass a different input instance!
	private registeredInputForDispose: ProjectModeV2Input | undefined;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@ILoggerService loggerService: ILoggerService,
		@IMainProcessService mainProcessService: IMainProcessService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@IRoopikEventService private readonly eventService: IRoopikEventService
	) {
		super(ProjectModeV2Editor.ID, group, telemetryService, themeService, storageService);
		this.logger = RoopikLogger.create(loggerService);
		this.browserService = new ProjectModeV2ServiceBridge(mainProcessService.getChannel(PROJECT_MODE_V2_CHANNEL));

		// Setup event subscriptions for UI updates
		this.setupEventSubscriptions();
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

			const input = this.input as ProjectModeV2Input;
			if (input) {
				input.setPageTitle(event.title);
			}
		}));
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
		const config: IBrowserControlBarV2Config = {
			showDevTools: true,
			showDeviceSelector: true,
			showScreenshot: true,
			showHardReload: true
		};

		// Browser control bar callbacks
		const callbacks: IBrowserControlBarV2Callbacks = {
			onNavigate: (url: string) => this.navigate(url),
			onBack: () => this.goBack(),
			onForward: () => this.goForward(),
			onHome: () => this.goHome(),
			onRefresh: () => this.refresh(),
			onStop: () => this.stop(),
			onDevTools: () => this.toggleDevTools(),
			onDeviceSelect: (device: DevicePreset | undefined) => this.setDeviceEmulation(device),
			onHardReload: () => this.hardReload(),
			onScreenshot: () => this.takeScreenshot()
		};

		this.controlBar = this._register(new BrowserControlBarV2(this.container, config, callbacks));

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

		// DevTools resize handle (between browser and devtools, initially hidden)
		this.devtoolsResizeHandle = document.createElement('div');
		this.devtoolsResizeHandle.style.display = 'none';
		this.devtoolsResizeHandle.style.height = '4px';
		this.devtoolsResizeHandle.style.width = '100%';
		this.devtoolsResizeHandle.style.cursor = 'ns-resize';
		this.devtoolsResizeHandle.style.backgroundColor = 'var(--vscode-panel-border)';
		this.devtoolsResizeHandle.style.position = 'relative';
		this.devtoolsResizeHandle.style.zIndex = '10';
		this.devtoolsResizeHandle.style.flexShrink = '0';
		// Hover effect
		this.devtoolsResizeHandle.addEventListener('mouseenter', () => {
			this.devtoolsResizeHandle!.style.backgroundColor = 'var(--vscode-focusBorder)';
		});
		this.devtoolsResizeHandle.addEventListener('mouseleave', () => {
			if (!this.isResizingDevTools) {
				this.devtoolsResizeHandle!.style.backgroundColor = 'var(--vscode-panel-border)';
			}
		});
		this.setupDevToolsResize();
		this.contentContainer.appendChild(this.devtoolsResizeHandle);

		// DevTools container (bottom area, initially hidden)
		this.devtoolsContainer = document.createElement('div');
		this.devtoolsContainer.style.display = 'none';
		this.devtoolsContainer.style.height = '300px'; // Fixed initial height (px instead of %)
		this.devtoolsContainer.style.backgroundColor = '#242424';
		this.devtoolsContainer.style.position = 'relative';
		this.devtoolsContainer.style.flexShrink = '0';
		this.contentContainer.appendChild(this.devtoolsContainer);

		// Setup ResizeObserver for automatic bounds updates
		// Observe container, browserContainer, and devtoolsContainer to catch all resize events
		// This is critical for split screen scenarios where parent resizes
		this.resizeObserver = new ResizeObserver(() => {
			this.updateViewBounds();
			// Also update floating toolbar bounds on resize
			this.updateFloatingToolbarBounds();
		});
		this.resizeObserver.observe(this.container); // Parent container for split resize
		this.resizeObserver.observe(this.browserContainer);
		this.resizeObserver.observe(this.devtoolsContainer);

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

			// Show floating toolbar when URL is loaded
			this.createFloatingToolbar();
		}
	}

	/**
	 * Update bounds with retry mechanism to handle CSS layout timing
	 * Uses requestAnimationFrame + multiple delays to ensure bounds are correct
	 */
	private updateBoundsWithRetry(): void {
		// Immediate update (may get wrong bounds if layout not complete)
		this.updateViewBounds();
		this.updateFloatingToolbarBounds();

		// Use requestAnimationFrame to wait for next paint
		requestAnimationFrame(() => {
			this.updateViewBounds();
			this.updateFloatingToolbarBounds();

			// Additional delayed updates to catch late layout changes
			// This handles split screen and other complex layout scenarios
			setTimeout(() => {
				this.updateViewBounds();
				this.updateFloatingToolbarBounds();
			}, 50);

			setTimeout(() => {
				this.updateViewBounds();
				this.updateFloatingToolbarBounds();
			}, 150);

			// Final update after layout should definitely be stable
			setTimeout(() => {
				this.updateViewBounds();
				this.updateFloatingToolbarBounds();
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
		// Hide floating toolbar when placeholder is shown
		if (this.floatingToolbarViewId) {
			this.setFloatingToolbarVisible(false);
		}
	}

	/**
	 * Setup DevTools resize functionality
	 * Allows users to drag the resize handle to change DevTools height
	 */
	private setupDevToolsResize(): void {
		if (!this.devtoolsResizeHandle) {
			return;
		}

		let startY = 0;
		let startHeight = 0;

		const onMouseMove = (e: MouseEvent) => {
			if (!this.isResizingDevTools || !this.devtoolsContainer || !this.contentContainer) {
				return;
			}

			// Calculate new height (moving up = more height, moving down = less height)
			const deltaY = startY - e.clientY;
			let newHeight = startHeight + deltaY;

			// Get content container height for max calculation
			const contentRect = this.contentContainer.getBoundingClientRect();
			const maxHeight = contentRect.height * this.devtoolsMaxHeightRatio;

			// Clamp to min/max
			newHeight = Math.max(this.devtoolsMinHeight, Math.min(newHeight, maxHeight));

			// Apply new height
			this.devtoolsContainer.style.height = `${newHeight}px`;

			// Update WebContentsView bounds in real-time for smooth resize
			this.updateViewBounds();
		};

		const onMouseUp = () => {
			if (!this.isResizingDevTools) {
				return;
			}

			this.isResizingDevTools = false;

			// Reset handle color
			if (this.devtoolsResizeHandle) {
				this.devtoolsResizeHandle.style.backgroundColor = 'var(--vscode-panel-border)';
			}

			// Remove document listeners
			document.removeEventListener('mousemove', onMouseMove);
			document.removeEventListener('mouseup', onMouseUp);

			// Remove selection prevention
			document.body.style.userSelect = '';
			document.body.style.cursor = '';

			// Final bounds update
			this.updateViewBounds();
		};

		this.devtoolsResizeHandle.addEventListener('mousedown', (e: MouseEvent) => {
			if (!this.devtoolsContainer) {
				return;
			}

			this.isResizingDevTools = true;
			startY = e.clientY;
			startHeight = this.devtoolsContainer.getBoundingClientRect().height;

			// Highlight handle during resize
			this.devtoolsResizeHandle!.style.backgroundColor = 'var(--vscode-focusBorder)';

			// Prevent text selection during drag
			document.body.style.userSelect = 'none';
			document.body.style.cursor = 'ns-resize';

			// Add document-level listeners
			document.addEventListener('mousemove', onMouseMove);
			document.addEventListener('mouseup', onMouseUp);

			e.preventDefault();
		});
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

					// In detached mode, also hide our containers
					if (DEVTOOLS_MODE === 'detached' && this.devtoolsContainer) {
						this.devtoolsContainer.style.display = 'none';
						if (this.devtoolsResizeHandle) {
							this.devtoolsResizeHandle.style.display = 'none';
						}
					}
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
				this.logger.warn('[ProjectModeV2] Failed to enable CDP domains (non-fatal):', cdpError);
			});

			// Note: Navigation is handled by setInput(), not here
			// This prevents double navigation when reopening tabs
		} catch (error) {
			this.logger.error('[ProjectModeV2] Failed to initialize browser view:', error);
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

		// Update DevTools bounds if visible
		if (this.devtoolsVisible && this.devtoolsContainer) {
			const devtoolsRect = this.devtoolsContainer.getBoundingClientRect();
			if (devtoolsRect.width > 0 && devtoolsRect.height > 0) {
				const devtoolsBounds: ViewBounds = {
					x: Math.floor(devtoolsRect.left),
					y: Math.floor(devtoolsRect.top),
					width: Math.floor(devtoolsRect.width),
					height: Math.floor(devtoolsRect.height)
				};
				this.browserService.setDevToolsBounds(this.browserViewId, devtoolsBounds);
			}
		}
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
			this.logger.warn('[ProjectModeV2] Navigation aborted: No URL provided');
			return;
		}

		if (!this.browserViewId) {
			this.logger.error('[ProjectModeV2] Navigation aborted: No browser view ID! Browser view may not be initialized.');
			return;
		}

		// Validate URL - reject gibberish like "null", "undefined", single characters, etc.
		const trimmedUrl = url.trim();
		if (this.isInvalidUrl(trimmedUrl)) {
			this.logger.warn(`[ProjectModeV2] Navigation aborted: Invalid URL "${trimmedUrl}"`);
			this.showNavigationError(`Invalid URL: "${trimmedUrl}"`);
			return;
		}

		// Ensure URL has protocol
		if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://') && !trimmedUrl.startsWith('about:')) {
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
			const input = this.input as ProjectModeV2Input;
			if (input) {
				input.setUrl(url);
			}
		} catch (error) {
			this.logger.error(`[ProjectModeV2] Navigation failed for URL "${url}":`, error);

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

	private async stop(): Promise<void> {
		if (this.browserViewId) {
			await this.browserService.stop(this.browserViewId);
		}
	}

	// ============================================
	// DevTools
	// ============================================

	private async toggleDevTools(): Promise<void> {
		if (!this.browserViewId) {
			return;
		}

		if (this.devtoolsVisible) {
			// =========================================================
			// CLOSE DevTools
			// =========================================================
			await this.browserService.closeDevTools(this.browserViewId);

			// In detached mode, hide our custom container and resize handle
			if (DEVTOOLS_MODE === 'detached' && this.devtoolsContainer) {
				this.devtoolsContainer.style.display = 'none';
				if (this.devtoolsResizeHandle) {
					this.devtoolsResizeHandle.style.display = 'none';
				}
			}

			this.devtoolsVisible = false;
		} else {
			// =========================================================
			// OPEN DevTools
			// =========================================================
			if (DEVTOOLS_MODE === 'attached') {
				// ATTACHED MODE: Electron manages DevTools layout
				// DevTools will dock at bottom of browser window
				// Device Toolbar toggle and close button will be available!
				await this.browserService.openDevTools(this.browserViewId, { mode: 'attached' as const });
				this.devtoolsVisible = true;
			} else {
				// DETACHED MODE: We manage DevTools layout
				// Show resize handle and container
				if (!this.devtoolsContainer) {
					return;
				}

				if (this.devtoolsResizeHandle) {
					this.devtoolsResizeHandle.style.display = 'block';
				}
				this.devtoolsContainer.style.display = 'block';

				// Get container bounds (need slight delay for layout to update)
				await new Promise(resolve => requestAnimationFrame(resolve));
				const rect = this.devtoolsContainer.getBoundingClientRect();
				const bounds: ViewBounds = {
					x: Math.floor(rect.left),
					y: Math.floor(rect.top),
					width: Math.floor(rect.width),
					height: Math.floor(rect.height)
				};

				// Open DevTools with our custom bounds
				await this.browserService.openDevTools(this.browserViewId, {
					mode: 'detached',
					bounds
				});
				this.devtoolsVisible = true;

				// Update bounds after layout settles
				setTimeout(() => this.updateViewBounds(), 100);
			}
		}
	}

	// ============================================
	// Floating Toolbar (Overlay)
	// ============================================

	/**
	 * Create floating toolbar overlay
	 * This creates a WebContentsView that renders ON TOP of the browser view
	 */
	private async createFloatingToolbar(): Promise<void> {
		if (!this.browserViewId || !this.browserContainer) {
			return;
		}

		// Don't create if already exists
		if (this.floatingToolbarViewId) {
			return;
		}

		try {
			// Calculate toolbar bounds - bottom center of browser container
			const browserRect = this.browserContainer.getBoundingClientRect();
			const toolbarWidth = 280;
			const toolbarHeight = 60;

			const bounds: ViewBounds = {
				x: Math.floor(browserRect.left + (browserRect.width - toolbarWidth) / 2),
				y: Math.floor(browserRect.bottom - toolbarHeight - 16), // 16px from bottom
				width: toolbarWidth,
				height: toolbarHeight
			};

			// Generate HTML content
			const htmlContent = generateFloatingToolbarHtml(this.floatingToolbarState);

			// Create overlay view
			this.floatingToolbarViewId = await this.browserService.createOverlayView(
				this.browserViewId,
				bounds,
				htmlContent
			);
		} catch (error) {
			this.logger.error('[ProjectModeV2] Failed to create floating toolbar:', error);
		}
	}

	/**
	 * Update floating toolbar bounds when browser container resizes
	 */
	private async updateFloatingToolbarBounds(): Promise<void> {
		if (!this.floatingToolbarViewId || !this.browserContainer) {
			return;
		}

		const browserRect = this.browserContainer.getBoundingClientRect();
		const toolbarWidth = 280;
		const toolbarHeight = 60;

		const bounds: ViewBounds = {
			x: Math.floor(browserRect.left + (browserRect.width - toolbarWidth) / 2),
			y: Math.floor(browserRect.bottom - toolbarHeight - 16),
			width: toolbarWidth,
			height: toolbarHeight
		};

		await this.browserService.setOverlayBounds(this.floatingToolbarViewId, bounds);
	}

	/**
	 * Show/hide floating toolbar
	 */
	private async setFloatingToolbarVisible(visible: boolean): Promise<void> {
		if (!this.floatingToolbarViewId) {
			if (visible) {
				// Create toolbar if it doesn't exist and we want to show it
				await this.createFloatingToolbar();
			}
			return;
		}

		await this.browserService.setOverlayVisible(this.floatingToolbarViewId, visible);
	}

	/**
	 * Destroy floating toolbar
	 */
	private async destroyFloatingToolbar(): Promise<void> {
		if (this.floatingToolbarViewId) {
			await this.browserService.destroyOverlayView(this.floatingToolbarViewId);
			this.floatingToolbarViewId = undefined;
		}
	}

	// ============================================
	// Device Emulation
	// ============================================

	private async setDeviceEmulation(device: DevicePreset | undefined): Promise<void> {
		if (!this.browserViewId) {
			return;
		}

		if (device) {
			await this.browserService.setDeviceEmulation(this.browserViewId, device);
		} else {
			await this.browserService.clearDeviceEmulation(this.browserViewId);
		}
	}

	// ============================================
	// Utilities
	// ============================================

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
			this.logger.error('[ProjectModeV2] Screenshot failed:', error);
		}
	}

	// ============================================
	// Lifecycle
	// ============================================

	override async setInput(input: EditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);

		if (input instanceof ProjectModeV2Input) {
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
			this.logger.warn('[ProjectModeV2] Failed to sync URL bar:', error);
		}
	}

	/**
	 * Check if URL is invalid/gibberish
	 * Returns true for URLs that are obviously empty - let browser handle other validation
	 */
	private isInvalidUrl(url: string): boolean {
		// Empty or whitespace only
		if (!url || url.length === 0) {
			return true;
		}

		// Let browser handle everything else - it will return proper errors
		// for invalid URLs like ERR_NAME_NOT_RESOLVED, ERR_INVALID_URL, etc.
		return false;
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
				// Show floating toolbar
				this.setFloatingToolbarVisible(true);
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
			// Hide floating toolbar
			this.setFloatingToolbarVisible(false);
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

		// Hide floating toolbar but don't destroy
		if (this.floatingToolbarViewId) {
			this.setFloatingToolbarVisible(false);
		}

		// Note: We do NOT reset hasLoadedUrl, lastKnownUrl, lastKnownTitle etc.
		// because the browser is still alive and will be shown again in setInput()
	}

	override focus(): void {
		// Focus browser
		this.browserContainer?.focus();
	}

	layout(dimension: Dimension): void {
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

		// Destroy floating toolbar
		this.destroyFloatingToolbar()
			.catch(err => this.logger.error('[ProjectModeV2] Failed to destroy floating toolbar:', err));

		// Publish browser destroyed event to central event bus
		this.eventService.publish('browser.destroyed', {
			browserViewId: destroyedBrowserViewId
		});

		// Destroy the browser view in main process
		this.browserService.destroyBrowserView(destroyedBrowserViewId)
			.catch(err => this.logger.error('[ProjectModeV2] Failed to destroy browser view:', err));
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
