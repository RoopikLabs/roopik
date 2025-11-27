/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { EditorPane } from '../../../../browser/parts/editor/editorPane.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
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
import { BrowserControlBarV2, IBrowserControlBarV2Config, IBrowserControlBarV2Callbacks, BrowserBookmark } from './browserControlBarV2.js';
import type { ViewBounds, DevToolsMode, NavigationStateChangedEvent } from '../../common/projectModeV2/types.js';
import { generateFloatingToolbarHtml, FloatingToolbarState } from './floatingToolbarHtml.js';
import { IRoopikEventService } from '../../common/events/index.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';

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
 * Storage key for browser bookmarks (workspace-scoped)
 * Each project has its own set of bookmarks
 */
const BOOKMARKS_STORAGE_KEY = 'roopik.browser.bookmarks';

/**
 * Project Mode V2 Editor
 *
 * Browser Preview with embedded DevTools using WebContentsView.
 * Features:
 * - Real Chromium browser via WebContentsView
 * - Embedded DevTools (ON-DEMAND creation) with Device Toolbar
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

	// "Browsing Paused" overlay - shown when menus/command palette are open
	private pausedOverlay: HTMLElement | undefined;
	private isBrowserPaused: boolean = false;

	// DevTools resize handle
	private devtoolsResizeHandle: HTMLElement | undefined;
	private isResizingDevTools: boolean = false;
	private devtoolsMinHeight: number = 100; // Minimum DevTools height in pixels
	private devtoolsMaxHeightRatio: number = 0.8; // Max 80% of content area

	// Track WHICH input we've registered the dispose listener for
	// setInput() is called on EVERY tab switch, and may pass a different input instance!
	private registeredInputForDispose: ProjectModeV2Input | undefined;

	// Bookmarks (workspace-scoped storage)
	private bookmarks: BrowserBookmark[] = [];

	// Inspect element mode state
	private isInspectModeActive: boolean = false;

	// Edit mode state (controls floating toolbar visibility)
	private isEditModeActive: boolean = false;

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
		super(ProjectModeV2Editor.ID, group, telemetryService, themeService, storageService);
		this.logger = RoopikLogger.create(loggerService);
		this.browserService = new ProjectModeV2ServiceBridge(mainProcessService.getChannel(PROJECT_MODE_V2_CHANNEL));

		// Load bookmarks from workspace storage
		this.loadBookmarks();

		// Setup event subscriptions for UI updates
		this.setupEventSubscriptions();

		// Setup menu/command palette pause detection
		this.setupBrowserPauseDetection();
	}

	// ============================================
	// Bookmarks (Workspace Storage)
	// ============================================

	/**
	 * Load bookmarks from workspace storage
	 */
	private loadBookmarks(): void {
		try {
			const stored = this.storageService.get(BOOKMARKS_STORAGE_KEY, StorageScope.WORKSPACE);
			if (stored) {
				this.bookmarks = JSON.parse(stored) as BrowserBookmark[];
				this.logger.debug(`[ProjectModeV2] Loaded ${this.bookmarks.length} bookmarks from workspace storage`);
			}
		} catch (error) {
			this.logger.warn('[ProjectModeV2] Failed to load bookmarks:', error);
			this.bookmarks = [];
		}
	}

	/**
	 * Save bookmarks to workspace storage
	 */
	private saveBookmarks(): void {
		try {
			this.storageService.store(
				BOOKMARKS_STORAGE_KEY,
				JSON.stringify(this.bookmarks),
				StorageScope.WORKSPACE,
				StorageTarget.USER
			);
			this.logger.debug(`[ProjectModeV2] Saved ${this.bookmarks.length} bookmarks to workspace storage`);
		} catch (error) {
			this.logger.error('[ProjectModeV2] Failed to save bookmarks:', error);
		}
	}

	/**
	 * Add a bookmark
	 */
	private addBookmark(bookmark: BrowserBookmark): void {
		// Don't add duplicates
		if (this.isBookmarked(bookmark.url)) {
			return;
		}
		this.bookmarks.push(bookmark);
		this.saveBookmarks();
		this.notificationService.notify({
			severity: Severity.Info,
			message: `Bookmarked: ${bookmark.title}`,
			sticky: false
		});
	}

	/**
	 * Remove a bookmark by URL
	 */
	private removeBookmark(url: string): void {
		const index = this.bookmarks.findIndex(b => b.url === url);
		if (index !== -1) {
			const removed = this.bookmarks.splice(index, 1)[0];
			this.saveBookmarks();
			this.notificationService.notify({
				severity: Severity.Info,
				message: `Removed bookmark: ${removed.title}`,
				sticky: false
			});
		}
	}

	/**
	 * Check if a URL is bookmarked
	 */
	private isBookmarked(url: string): boolean {
		return this.bookmarks.some(b => b.url === url);
	}

	/**
	 * Get all bookmarks
	 */
	private getBookmarks(): BrowserBookmark[] {
		return [...this.bookmarks];
	}

	/**
	 * Navigate to a bookmarked URL
	 */
	private navigateToBookmark(url: string): void {
		this.navigate(url);
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
	 * Pause browser - hide WebContentsView and show "Browsing Paused" overlay
	 * Called when menus or command palette open
	 */
	private pauseBrowser(): void {
		if (this.isBrowserPaused || !this.browserViewId || !this.hasLoadedUrl) {
			return;
		}

		this.isBrowserPaused = true;

		// Hide the browser WebContentsView
		this.browserService.setBrowserVisible(this.browserViewId, false);

		// Hide floating toolbar too
		if (this.floatingToolbarViewId) {
			this.setFloatingToolbarVisible(false);
		}

		// Show the paused overlay
		this.showPausedOverlay();
	}

	/**
	 * Resume browser - show WebContentsView and hide overlay
	 * Called when menus or command palette close
	 */
	private resumeBrowser(): void {
		if (!this.isBrowserPaused || !this.browserViewId) {
			return;
		}

		this.isBrowserPaused = false;

		// Hide the paused overlay
		this.hidePausedOverlay();

		// Show the browser WebContentsView (only if we have a URL loaded)
		if (this.hasLoadedUrl && this.isVisible()) {
			this.browserService.setBrowserVisible(this.browserViewId, true);

			// Show floating toolbar
			if (this.floatingToolbarViewId) {
				this.setFloatingToolbarVisible(true);
			}
		}
	}

	/**
	 * Show "Browsing Paused" overlay
	 */
	private showPausedOverlay(): void {
		if (!this.browserContainer) {
			return;
		}

		// Create overlay if it doesn't exist
		if (!this.pausedOverlay) {
			this.pausedOverlay = document.createElement('div');
			this.pausedOverlay.style.cssText = `
				position: absolute;
				top: 0;
				left: 0;
				right: 0;
				bottom: 0;
				display: flex;
				flex-direction: column;
				align-items: center;
				justify-content: center;
				background-color: var(--vscode-editor-background);
				color: var(--vscode-descriptionForeground);
				font-family: var(--vscode-font-family);
				font-size: 14px;
				gap: 12px;
				z-index: 100;
			`;

			// Pause icon
			const icon = document.createElement('div');
			icon.style.cssText = `
				font-size: 32px;
				opacity: 0.6;
			`;
			icon.textContent = '⏸';
			this.pausedOverlay.appendChild(icon);

			// Text
			const text = document.createElement('div');
			text.style.cssText = `
				font-size: 14px;
				opacity: 0.8;
			`;
			text.textContent = 'Browsing paused';
			this.pausedOverlay.appendChild(text);

			this.browserContainer.appendChild(this.pausedOverlay);
		}

		this.pausedOverlay.style.display = 'flex';
	}

	/**
	 * Hide "Browsing Paused" overlay
	 */
	private hidePausedOverlay(): void {
		if (this.pausedOverlay) {
			this.pausedOverlay.style.display = 'none';
		}
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
			showInspectMode: true,
			showScreenshot: true,
			showHardReload: true,
			showCopyUrl: true,
			showBookmarks: true,
			showEditMode: true
		};

		// Browser control bar callbacks
		const callbacks: IBrowserControlBarV2Callbacks = {
			onNavigate: (url: string) => this.navigate(url),
			onBack: () => this.goBack(),
			onForward: () => this.goForward(),
			onHome: () => this.goHome(),
			onRefresh: () => this.refresh(),
			onStopDevServer: () => this.stopDevServer(),
			onInspectMode: () => this.toggleInspectMode(),
			onDevTools: () => this.toggleDevTools(),
			onHardReload: () => this.hardReload(),
			onScreenshot: () => this.takeScreenshot(),
			onCopyUrl: () => this.copyCurrentUrl(),
			// Bookmark callbacks
			onBookmarkAdd: (bookmark: BrowserBookmark) => this.addBookmark(bookmark),
			onBookmarkRemove: (url: string) => this.removeBookmark(url),
			onBookmarkClick: (url: string) => this.navigateToBookmark(url),
			getBookmarks: () => this.getBookmarks(),
			isBookmarked: (url: string) => this.isBookmarked(url),
			// Edit Mode callback
			onEditModeToggle: (enabled: boolean) => this.toggleEditModeToolbar(enabled)
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

			// Floating toolbar is now controlled by Edit Mode button (default hidden)
			// Only show if edit mode is already active
			if (this.isEditModeActive) {
				this.createFloatingToolbar();
			}
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

			// Reset inspect mode on navigation (script is injected per-page)
			// The injected script won't survive page navigation anyway,
			// but we need to sync the state
			if (this.isInspectModeActive) {
				this.isInspectModeActive = false;
				this.logger.info('[ProjectModeV2] Inspect Mode reset due to navigation');
			}

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

		const trimmedUrl = url.trim();
		if (!trimmedUrl) {
			return;
		}

		// Check if input looks like a URL or a search query
		// Like Chrome: if it's not a valid URL pattern, search Google instead
		if (this.isSearchQuery(trimmedUrl)) {
			// Convert search query to Google search URL
			const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(trimmedUrl)}`;
			this.logger.info(`[ProjectModeV2] Searching Google for: "${trimmedUrl}"`);
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

	/**
	 * Stop Dev Server (placeholder - feature coming later)
	 * Will stop the Vite/dev server when implemented
	 */
	private stopDevServer(): void {
		// TODO: Implement dev server stop functionality
		// This will integrate with ViteServerService when available
		this.logger.info('[ProjectModeV2] Stop Dev Server clicked (not yet implemented)');
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
	// Edit Mode (Floating Toolbar Toggle)
	// ============================================

	/**
	 * Toggle Edit Mode - shows/hides the floating bottom action bar
	 * Called from the Edit Mode button in the address bar
	 */
	private async toggleEditModeToolbar(enabled: boolean): Promise<void> {
		this.isEditModeActive = enabled;

		if (enabled) {
			// Show floating toolbar
			if (!this.floatingToolbarViewId) {
				await this.createFloatingToolbar();
			}
			await this.setFloatingToolbarVisible(true);
			this.logger.info('[ProjectModeV2] Edit Mode ENABLED - floating toolbar shown');
		} else {
			// Hide floating toolbar
			await this.setFloatingToolbarVisible(false);
			this.logger.info('[ProjectModeV2] Edit Mode DISABLED - floating toolbar hidden');
		}
	}

	// ============================================
	// Inspect Mode
	// ============================================

	/**
	 * Toggle Inspect Element Mode
	 *
	 * When enabled:
	 * - Elements are highlighted on hover with an outline
	 * - Clicking an element copies its full outerHTML to clipboard and auto-exits
	 * - Press ESC to exit without copying
	 *
	 * This is accessible via API for automation (Playwright, agents, etc.)
	 */
	private async toggleInspectMode(): Promise<void> {
		if (!this.browserViewId) {
			this.logger.warn('[ProjectModeV2] Cannot toggle inspect mode: no browser view');
			return;
		}

		// Check actual state in browser (not our cached state)
		// This handles cases where script exited via ESC or copy
		const isActiveInBrowser = await this.isInspectModeActiveInBrowser();

		if (isActiveInBrowser) {
			// Currently active, disable it
			await this.disableInspectMode();
		} else {
			// Not active, enable it
			await this.enableInspectMode();
		}
	}

	/**
	 * Check if inspect mode is actually active in the browser
	 * (The script may have exited via ESC or copy)
	 */
	private async isInspectModeActiveInBrowser(): Promise<boolean> {
		if (!this.browserViewId) {
			return false;
		}

		try {
			return await this.browserService.executeScript(
				this.browserViewId,
				'typeof window.__roopikInspectCleanup === "function"'
			);
		} catch {
			return false;
		}
	}

	/**
	 * Enable Inspect Element Mode
	 * Injects script into browser to highlight elements and capture clicks
	 */
	private async enableInspectMode(): Promise<void> {
		if (!this.browserViewId) {
			return;
		}

		this.logger.info('[ProjectModeV2] Inspect Mode ENABLED');
		this.isInspectModeActive = true;

		// Inject the inspect mode script
		const inspectScript = this.getInspectModeScript();

		try {
			await this.browserService.executeScript(this.browserViewId, inspectScript);

			// Show notification
			this.notificationService.notify({
				severity: Severity.Info,
				message: 'Inspect Mode: Click element to copy HTML.',
				sticky: false
			});
		} catch (error) {
			this.logger.error('[ProjectModeV2] Failed to enable inspect mode:', error);
			this.isInspectModeActive = false;
		}
	}

	/**
	 * Disable Inspect Element Mode
	 * Removes the injected script from the browser
	 */
	private async disableInspectMode(): Promise<void> {
		this.isInspectModeActive = false;

		if (!this.browserViewId) {
			return;
		}

		this.logger.info('[ProjectModeV2] Inspect Mode DISABLED');

		// Inject cleanup script (safe to call even if already cleaned up)
		const cleanupScript = `
			(function() {
				if (window.__roopikInspectCleanup) {
					window.__roopikInspectCleanup();
				}
			})();
		`;

		try {
			await this.browserService.executeScript(this.browserViewId, cleanupScript);
		} catch (error) {
			this.logger.error('[ProjectModeV2] Failed to disable inspect mode:', error);
		}
	}

	/**
	 * Generate the inspect mode JavaScript to inject into the browser
	 * This script:
	 * - Creates a highlight overlay that follows the hovered element
	 * - Captures clicks and copies element's outerHTML to clipboard
	 * - Shows a toast notification when element is copied
	 * - Sends messages to parent for state sync
	 * - Listens for ESC key to exit inspect mode
	 */
	private getInspectModeScript(): string {
		return INSPECT_MODE_SCRIPT;
	}

	/**
	 * Get the last inspected element's HTML
	 * API for programmatic access (agents, automation tools like Playwright)
	 *
	 * @returns The outerHTML of the last clicked element, or null if none
	 */
	public async getLastInspectedElementHtml(): Promise<string | null> {
		if (!this.browserViewId) {
			return null;
		}

		try {
			return await this.browserService.executeScript(
				this.browserViewId,
				'window.__roopikLastInspectedHtml || null'
			);
		} catch {
			return null;
		}
	}

	/**
	 * Check if inspect mode is currently active
	 * API for programmatic access
	 */
	public isInspectModeEnabled(): boolean {
		return this.isInspectModeActive;
	}

	/**
	 * Enable inspect mode programmatically
	 * API for agents and automation tools
	 */
	public async startInspectMode(): Promise<void> {
		if (!this.isInspectModeActive) {
			await this.toggleInspectMode();
		}
	}

	/**
	 * Disable inspect mode programmatically
	 * API for agents and automation tools
	 */
	public async stopInspectMode(): Promise<void> {
		if (this.isInspectModeActive) {
			await this.toggleInspectMode();
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
			this.logger.info(`[ProjectModeV2] URL copied to clipboard: ${url}`);

			// Show success notification
			this.notificationService.notify({
				severity: Severity.Info,
				message: `URL copied: ${url}`,
				sticky: false
			});
		} catch (error) {
			this.logger.error('[ProjectModeV2] Failed to copy URL to clipboard:', error);
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

// ============================================
// Inspect Mode Script (injected into browser)
// ============================================

/**
 * JavaScript to inject into the browser for element inspection.
 * Features:
 * - Highlight overlay follows hovered element
 * - Label shows tag name, id, and classes (no dimensions)
 * - Click copies outerHTML to clipboard
 * - Toast notification confirms copy
 * - ESC key exits inspect mode
 * - Messages sent to parent for state sync
 */
const INSPECT_MODE_SCRIPT = `
(function() {
	// Cleanup any existing inspect mode
	if (window.__roopikInspectCleanup) {
		window.__roopikInspectCleanup();
	}

	// ========== Create UI Elements ==========

	// Highlight overlay
	const overlay = document.createElement('div');
	overlay.id = '__roopik_inspect_overlay';
	overlay.style.cssText = [
		'position: fixed',
		'pointer-events: none',
		'z-index: 2147483647',
		'border: 2px solid #007acc',
		'background-color: rgba(0, 122, 204, 0.1)',
		'transition: all 0.05s ease-out',
		'display: none'
	].join(';');
	document.body.appendChild(overlay);

	// Element label (tag info)
	const label = document.createElement('div');
	label.id = '__roopik_inspect_label';
	label.style.cssText = [
		'position: fixed',
		'pointer-events: none',
		'z-index: 2147483647',
		'background-color: #007acc',
		'color: white',
		'font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
		'font-size: 11px',
		'padding: 2px 6px',
		'border-radius: 2px',
		'white-space: nowrap',
		'display: none'
	].join(';');
	document.body.appendChild(label);

	// Toast notification container (appears from top)
	const toast = document.createElement('div');
	toast.id = '__roopik_inspect_toast';
	toast.style.cssText = [
		'position: fixed',
		'top: 20px',
		'left: 50%',
		'transform: translateX(-50%) translateY(-100px)',
		'background-color: #1e1e1e',
		'color: #ffffff',
		'font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
		'font-size: 13px',
		'padding: 10px 20px',
		'border-radius: 6px',
		'box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3)',
		'z-index: 2147483647',
		'opacity: 0',
		'transition: transform 0.3s ease, opacity 0.3s ease',
		'pointer-events: none'
	].join(';');
	document.body.appendChild(toast);

	let currentElement = null;
	let toastTimeout = null;

	// ========== Helper Functions ==========

	// Get element description for label (tag name only)
	function getElementDescription(el) {
		return el.tagName.toLowerCase();
	}

	// Show toast notification
	function showToast(message) {
		if (toastTimeout) {
			clearTimeout(toastTimeout);
		}
		toast.textContent = message;
		toast.style.opacity = '1';
		toast.style.transform = 'translateX(-50%) translateY(0)';

		toastTimeout = setTimeout(function() {
			toast.style.opacity = '0';
			toast.style.transform = 'translateX(-50%) translateY(-100px)';
		}, 2000);
	}

	// Copy text to clipboard (with fallback)
	function copyToClipboard(text) {
		return new Promise(function(resolve, reject) {
			// Try modern clipboard API first
			if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
				navigator.clipboard.writeText(text)
					.then(resolve)
					.catch(function() {
						// Fall back to execCommand
						fallbackCopy(text, resolve, reject);
					});
			} else {
				fallbackCopy(text, resolve, reject);
			}
		});
	}

	function fallbackCopy(text, resolve, reject) {
		try {
			const textarea = document.createElement('textarea');
			textarea.value = text;
			textarea.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;';
			document.body.appendChild(textarea);
			textarea.focus();
			textarea.select();
			const success = document.execCommand('copy');
			document.body.removeChild(textarea);
			if (success) {
				resolve();
			} else {
				reject(new Error('execCommand failed'));
			}
		} catch (err) {
			reject(err);
		}
	}

	// Update overlay position
	function updateOverlay(el) {
		if (!el || el === document.body || el === document.documentElement) {
			overlay.style.display = 'none';
			label.style.display = 'none';
			return;
		}

		const rect = el.getBoundingClientRect();
		overlay.style.display = 'block';
		overlay.style.top = rect.top + 'px';
		overlay.style.left = rect.left + 'px';
		overlay.style.width = rect.width + 'px';
		overlay.style.height = rect.height + 'px';

		// Position label above element, or below if not enough space
		label.style.display = 'block';
		label.textContent = getElementDescription(el);
		const labelHeight = 20;
		if (rect.top > labelHeight + 4) {
			label.style.top = (rect.top - labelHeight - 4) + 'px';
		} else {
			label.style.top = (rect.bottom + 4) + 'px';
		}
		label.style.left = Math.max(0, rect.left) + 'px';
	}

	// Flash overlay green to indicate success
	function flashSuccess() {
		overlay.style.backgroundColor = 'rgba(0, 200, 0, 0.3)';
		overlay.style.borderColor = '#00c800';
		setTimeout(function() {
			overlay.style.backgroundColor = 'rgba(0, 122, 204, 0.1)';
			overlay.style.borderColor = '#007acc';
		}, 200);
	}

	// Future use: send info back to Roopik (e.g., copied HTML to AI chat)
	function notifyParent(type, data) {
		window.postMessage({
			source: 'roopik-inspect',
			type: type,
			data: data
		}, '*');
	}

	// ========== Event Handlers ==========

	function onMouseMove(e) {
		// Ignore our own UI elements
		const el = document.elementFromPoint(e.clientX, e.clientY);
		if (el && el.id && el.id.startsWith('__roopik_inspect')) {
			return;
		}
		if (el && el !== overlay && el !== label && el !== toast && el !== currentElement) {
			currentElement = el;
			updateOverlay(el);
		}
	}

	function onClick(e) {
		e.preventDefault();
		e.stopPropagation();
		e.stopImmediatePropagation();

		if (currentElement && !(currentElement.id && currentElement.id.startsWith('__roopik_inspect'))) {
			const html = currentElement.outerHTML;

			// Store for API access
			window.__roopikLastInspectedHtml = html;

			// Copy to clipboard, then auto-exit inspect mode
			copyToClipboard(html)
				.then(function() {
					flashSuccess();
					showToast('✓ Element copied');
					notifyParent('element-copied', { html: html });

					// Auto-exit inspect mode after successful copy (with small delay for visual feedback)
					setTimeout(function() {
						cleanup();
						notifyParent('inspect-mode-exited', {});
					}, 300);
				})
				.catch(function(err) {
					console.error('[Roopik Inspect] Copy failed:', err);
					showToast('✗ Copy failed');
					notifyParent('copy-failed', { error: err.message });
					// Don't exit on failure - let user try again
				});
		}

		return false;
	}

	function onKeyDown(e) {
		if (e.key === 'Escape') {
			cleanup();
			notifyParent('inspect-mode-exited', {});
		}
	}

	function onScroll() {
		if (currentElement) {
			updateOverlay(currentElement);
		}
	}

	// ========== Cleanup ==========

	function cleanup() {
		document.removeEventListener('mousemove', onMouseMove, true);
		document.removeEventListener('click', onClick, true);
		document.removeEventListener('keydown', onKeyDown, true);
		document.removeEventListener('scroll', onScroll, true);
		window.removeEventListener('resize', onScroll);

		if (toastTimeout) {
			clearTimeout(toastTimeout);
		}

		if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
		if (label.parentNode) label.parentNode.removeChild(label);
		if (toast.parentNode) toast.parentNode.removeChild(toast);

		currentElement = null;
		delete window.__roopikInspectCleanup;
	}

	// Store cleanup function
	window.__roopikInspectCleanup = cleanup;

	// ========== Initialize ==========

	// Add event listeners (capture phase to intercept before page handlers)
	document.addEventListener('mousemove', onMouseMove, true);
	document.addEventListener('click', onClick, true);
	document.addEventListener('keydown', onKeyDown, true);
	document.addEventListener('scroll', onScroll, true);
	window.addEventListener('resize', onScroll);

	// Notify parent that inspect mode started
	notifyParent('inspect-mode-started', {});

	return 'Inspect mode enabled';
})();
`;
