/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { EditorPane } from '../../../../browser/parts/editor/editorPane.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { EditorTabInput } from './editorTabInput.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import * as DOM from '../../../../../base/browser/dom.js';
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
import { DevServerBridge } from './devServerBridge.js';
import { DEV_SERVER_CHANNEL } from '../../common/projectMode/devServer.js';
import { BrowserControlBar, IBrowserControlBarConfig, IBrowserControlBarCallbacks } from './components/browserControlBar.js';
import type { ViewBounds, NavigationStateChangedEvent } from '../../common/projectMode/types.js';
import { IRoopikEventService } from '../../common/events/index.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { Dimension } from '../../../../../base/browser/dom.js';
// Features (extracted to features/ folder)
import { InspectMode } from './features/inspectMode.js';
import { Bookmarks } from './features/bookmarks.js';
import { BrowserPause } from './features/browserPause.js';
import { StyleInspect } from './features/styleInspect.js';
import { DragDrop } from './features/dragDrop/index.js';
// Components
import { DefaultBrowserScreen } from './components/defaultBrowserScreen.js';
import { ISourceNavigationService } from '../../common/navigation/index.js';
import { IMenubarStateService } from '../services/menubarStateService.js';
import { IProjectStorageService } from '../../common/projectStorage/index.js';

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
	private devServerService: DevServerBridge;

	// View IDs
	private browserViewId: number | undefined;

	// Project mode state
	private currentProjectRoot: string | undefined;
	private isProjectMode: boolean = false;
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
	private styleInspect!: StyleInspect;
	private dragDrop!: DragDrop;

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
		@IClipboardService private readonly clipboardService: IClipboardService,
		@ISourceNavigationService private readonly sourceNavigationService: ISourceNavigationService,
		@IMenubarStateService private readonly menubarStateService: IMenubarStateService,
		@IProjectStorageService private readonly projectStorageService: IProjectStorageService
	) {
		super(Editor.ID, group, telemetryService, themeService, storageService);
		this.logger = RoopikLogger.create(loggerService);
		this.browserService = new ServiceBridge(mainProcessService.getChannel(PROJECT_MODE_CHANNEL));
		this.devServerService = new DevServerBridge(mainProcessService.getChannel(DEV_SERVER_CHANNEL));

		// Initialize features (extracted to features/ folder)
		this.inspectMode = new InspectMode(this.browserService, this.notificationService, this.clipboardService);
		this.bookmarks = new Bookmarks(this.storageService, this.notificationService, this.logger);
		this.browserPause = new BrowserPause(this.browserService);
		this.styleInspect = new StyleInspect(this.browserService, this.notificationService, this.sourceNavigationService);
		this.dragDrop = new DragDrop(this.browserService, this.logger);

		// Set callback for pending changes updates (for UI badge and panel)
		this.dragDrop.setOnPendingMovesChanged((moves) => {
			this.logger.info('[DragDrop] Pending moves changed:', moves.length);
			// Update control bar badge
			this.controlBar?.setPendingChangesCount(moves.length);
			// Update Changes tab in StyleInspect panel
			this.styleInspect.setPendingMoves(moves);
		});

		// Connect StyleInspect to unified InspectMode (uses same script for element selection)
		this.styleInspect.setInspectMode(this.inspectMode);

		// Wire pending changes callbacks from StyleInspect panel to DragDrop feature
		this.styleInspect.setOnUndoMove((moveId) => {
			this.undoPendingMove(moveId);
		});
		this.styleInspect.setOnUndoAll(() => {
			this.undoAllPendingMoves();
		});
		this.styleInspect.setOnApplyAll(() => {
			this.applyAllPendingMoves();
		});

		// Set callback to update browser bounds when style panel visibility changes
		this.styleInspect.setOnVisibilityChanged((visible, _panelWidth) => {
			// When panel shows/hides, the browserContainer size changes due to flex layout
			// We need to update the BrowserView bounds to match
			this.logger.info(`[StyleInspect] Panel visibility changed: ${visible}`);
			// Use retry mechanism to handle layout timing
			this.updateBoundsWithRetry();
			// Update control bar button active state
			this.controlBar?.setStylePanelActive(visible);
		});

		// Set callback for tree node selection (Components tab)
		// When user clicks a node in the tree, highlight it in the browser
		this.styleInspect.setOnTreeNodeSelected((nodeId) => {
			this.handleTreeNodeSelected(nodeId);
		});

		// Subscribe to DevServer logs and forward to VSCode output channel
		// This is critical for debugging - shows all prerequisite checks, server startup, etc.
		this._register(this.devServerService.onLog((event) => {
			switch (event.level) {
				case 'error':
					this.logger.error(`[DevServer] ${event.message}`);
					break;
				case 'warn':
					this.logger.warn(`[DevServer] ${event.message}`);
					break;
				default:
					this.logger.info(`[DevServer] ${event.message}`);
			}
		}));

		// Setup event subscriptions for UI updates
		this.setupEventSubscriptions();

		// Setup menu/command palette pause detection
		this.setupBrowserPauseDetection();

		// Setup "Open Source" context menu handler
		this.setupOpenSourceHandler();

		// Setup browser bridge message handler (inspect mode events, etc.)
		this.setupBrowserBridgeHandler();

		// Setup centralized key handler for browser key events
		this.setupBrowserKeyHandler();
	}

	/**
	 * Subscribe to events from the central event bus for UI updates
	 * This demonstrates the event-driven architecture where:
	 * 1. IPC event comes from main process
	 * 2. We publish to EventService (PUBLISH)
	 * 3. Subscribers receive and update UI (RECEIVED)
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
			// Don't update title when showing default screen
			// This prevents "about:blank" from appearing as the tab title
			if (!this.hasLoadedUrl) {
				return;
			}

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
	 * - Native menu bar (File, Edit, View...) via IMenubarStateService
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

		// 3. Custom menubar detection via IMenubarStateService
		// Events are fired when VSCode's custom HTML-based menubar is opened/closed
		this._register(this.menubarStateService.onDidOpenMenu(() => {
			// this.logger.info(`[ProjectMode] Menubar opened`);
			this.pauseBrowser();
		}));

		this._register(this.menubarStateService.onDidCloseMenu(() => {
			// this.logger.info(`[ProjectMode] Menubar closed`);
			this.resumeBrowser();
		}));
	}

	/**
	 * Setup handler for "Open Source" context menu
	 *
	 * When user right-clicks in browser and selects "Open Source",
	 * the main process parses the data-roopik-source attribute and
	 * fires an event with the source location. We handle it here
	 * and use the centralized SourceNavigationService to open the file.
	 */
	private setupOpenSourceHandler(): void {
		this._register(this.browserService.onOpenSourceRequest((event) => {
			// Filter by browserViewId - only handle events for this browser instance
			if (event.browserViewId !== this.browserViewId) {
				return;
			}

			if (event.sourceLocation) {
				// Open the source file at the specified location
				this.sourceNavigationService.openSourceLocation({
					file: event.sourceLocation.file,
					line: event.sourceLocation.line,
					column: event.sourceLocation.column,
					endLine: event.sourceLocation.endLine,
					endColumn: event.sourceLocation.endColumn
				});
			} else if (event.error) {
				// Show error notification
				this.notificationService.notify({
					severity: Severity.Warning,
					message: event.error,
					sticky: false
				});
			}
		}));
	}

	/**
	 * Setup handler for browser bridge messages
	 *
	 * When injected script sends a message via window.__roopikBridge(),
	 * main process receives it via CDP Runtime.bindingCalled and forwards
	 * via IPC. We handle it here for element selection, inspect mode exit, etc.
	 */
	private setupBrowserBridgeHandler(): void {
		this._register(this.browserService.onBrowserBridgeMessage((event) => {
			// Filter by browserViewId - only handle events for this browser instance
			if (event.browserViewId !== this.browserViewId) {
				return;
			}

			const message = event.message;

			switch (message.type) {
				case 'element-selected':
					this.handleElementSelected(message);
					break;
				case 'inspect-mode-exited':
					this.handleInspectModeExited();
					break;
				case 'drag-started':
					this.dragDrop.handleDragStarted(message as import('../../common/projectMode/types.js').DragStartedMessage);
					break;
				case 'drag-ended':
					if (this.browserViewId) {
						this.dragDrop.handleDragEnded(this.browserViewId, message as import('../../common/projectMode/types.js').DragEndedMessage);
					}
					break;
			}
		}));
	}

	/**
	 * Handle element selection from inspect mode
	 * - Copy HTML to clipboard
	 * - Open style panel with CSS info
	 */
	private async handleElementSelected(message: import('../../common/projectMode/types.js').ElementSelectedMessage): Promise<void> {
		// Copy HTML to clipboard
		if (message.html) {
			try {
				await this.clipboardService.writeText(message.html);
			} catch (e) {
				this.logger.error('[InspectMode] Failed to copy to clipboard:', e);
			}
		}

		// Open style panel with element CSS info
		if (this.browserViewId && message.selector) {
			// Ensure style panel is initialized
			if (this.contentContainer && !this.styleInspect.isPanelVisible()) {
				this.styleInspect.initialize(this.contentContainer);
			}

			// Set project root for CSS path resolution
			if (this.currentProjectRoot) {
				this.styleInspect.setProjectRoot(this.currentProjectRoot);
			}

			// Ensure DOM tree is fetched for Components tab sync
			// This handles cases where page loaded but onPageLoadComplete didn't fire
			if (!this.styleInspect.getDOMTreeCache()) {
				this.fetchDOMTreeForComponentsTab();
			}

			// Get element styles and show panel
			await this.styleInspect.handleElementSelected(this.browserViewId, message.selector);
		}
	}

	/**
	 * Handle inspect mode exit (ESC pressed in browser)
	 * Centralized handler for ESC key from browser
	 */
	private handleInspectModeExited(): void {
		// Update button active state
		this.controlBar?.setInspectModeActive(false);

		// Also hide style panel (ESC should close everything)
		if (this.styleInspect.isPanelVisible()) {
			this.styleInspect.hidePanel();
		}
	}

	/**
	 * Setup centralized key handler for browser key events
	 *
	 * All key presses from the BrowserView are intercepted by Electron's
	 * before-input-event and forwarded via IPC. This allows unified key
	 * handling without scattered listeners in injected scripts or panels.
	 *
	 * Architecture:
	 * Browser (BrowserView) → before-input-event (Electron main)
	 *   → IPC event: onBrowserKeyPress → Renderer (editor.ts)
	 *   → Central key handler → Features (Panel, InspectMode, DevTools)
	 */
	private setupBrowserKeyHandler(): void {
		this._register(this.browserService.onBrowserKeyPress((event) => {
			// Filter by browserViewId - only handle events for this browser instance
			if (event.browserViewId !== this.browserViewId) {
				return;
			}

			// Only handle keyDown events (ignore keyUp)
			if (event.type !== 'keyDown') {
				return;
			}

			// Dispatch based on key
			this.handleBrowserKey(event.key, event.code, event.modifiers);
		}));
	}

	/**
	 * Central key dispatch handler
	 * Routes key presses to appropriate features
	 */
	private handleBrowserKey(
		key: string,
		_code: string,
		modifiers: { ctrl: boolean; alt: boolean; shift: boolean; meta: boolean }
	): void {
		// ESC key - exit inspect mode and close panel
		if (key === 'Escape') {
			this.handleEscapeKey();
			return;
		}

		// Future: Add more key handlers here
		// Example patterns:
		// - Ctrl+Shift+C: Toggle inspect mode
		// - Ctrl+Shift+I: Toggle DevTools
		// - F5: Refresh
		// - Ctrl+R: Refresh

		// For now, we let browser handle other keys normally
		// The before-input-event doesn't preventDefault, so keys still work
		void modifiers; // Silence unused variable warning
	}

	/**
	 * Handle ESC key press from browser
	 * Exits inspect mode and closes style panel
	 */
	private handleEscapeKey(): void {
		// 1. Exit inspect mode if active
		if (this.inspectMode.getIsActive()) {
			// Disable inspect mode in browser
			if (this.browserViewId) {
				this.inspectMode.disable(this.browserViewId);
			}
			// Update button state
			this.controlBar?.setInspectModeActive(false);
		}

		// 2. Close style panel if visible
		if (this.styleInspect.isPanelVisible()) {
			this.styleInspect.hidePanel();
		}

		// 3. Hide element highlight in browser
		this.styleInspect.hideElementHighlight();
	}

	// ============================================
	// Page Load Complete Handler
	// ============================================

	/**
	 * Called when page finishes loading (after navigation/refresh)
	 * Handles:
	 * 1. Re-injecting inspect mode script if it was active
	 * 2. Fetching DOM tree for Components tab
	 */
	private onPageLoadComplete(): void {
		this.logger.info('[ProjectMode] onPageLoadComplete called, browserViewId:', this.browserViewId);

		if (!this.browserViewId) {
			this.logger.warn('[ProjectMode] onPageLoadComplete: No browserViewId!');
			return;
		}

		// 1. Re-inject inspect mode script if it was active before page load
		// Page navigation wipes all injected scripts, so we need to re-inject
		if (this.inspectMode.getIsActive()) {
			this.logger.info('[ProjectMode] Re-injecting inspect mode script');
			this.inspectMode.enable(this.browserViewId).catch((error) => {
				this.logger.warn('[ProjectMode] Failed to re-inject inspect mode after page load:', error);
			});
		}

		// 2. Fetch DOM tree for Components tab
		this.logger.info('[ProjectMode] Fetching DOM tree for Components tab');
		this.fetchDOMTreeForComponentsTab();
	}

	// ============================================
	// DOM Tree (Components Tab)
	// ============================================

	/**
	 * Fetch DOM tree for the Components tab
	 * Called after page finishes loading
	 */
	private fetchDOMTreeForComponentsTab(): void {
		if (!this.browserViewId) {
			return;
		}

		// Fetch DOM tree in background (don't await)
		this.styleInspect.fetchDOMTree(this.browserViewId).catch((error) => {
			this.logger.warn('[ProjectMode] Failed to fetch DOM tree:', error);
		});
	}

	/**
	 * Handle tree node selection from Components tab
	 * Highlights the element in the browser
	 */
	private async handleTreeNodeSelected(nodeId: number): Promise<void> {
		// Highlight element in browser via CDP
		await this.styleInspect.highlightElementInBrowser(nodeId);
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
			showStyleInspect: true,
			showScreenshot: true,
			showHardReload: true,
			showCopyUrl: true,
			showBookmarks: true,
			showEditMode: true,
			showPendingChanges: true
		};

		// Browser control bar callbacks
		const callbacks: IBrowserControlBarCallbacks = {
			onNavigate: (url: string) => this.navigate(url),
			onBack: () => this.goBack(),
			onForward: () => this.goForward(),
			onHome: () => this.goHome(),
			onRefresh: () => this.refresh(),
			onStopDevServer: () => this.stopDevServer(),
			onInspectMode: () => this.toggleInspectMode(),
			onStylePanelToggle: () => this.toggleStylePanel(),
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
			onEditModeToggle: (enabled: boolean) => this.toggleEditModeToolbar(enabled),
			// Pending Changes callback
			onPendingChangesClick: () => this.togglePendingChangesPanel()
		};

		this.controlBar = this._register(new BrowserControlBar(this.container, config, callbacks));

		// Content container (browser + style panel in row layout)
		this.contentContainer = document.createElement('div');
		this.contentContainer.style.flex = '1 1 auto';
		this.contentContainer.style.display = 'flex';
		this.contentContainer.style.flexDirection = 'row';  // Row layout for browser + panel side by side
		this.contentContainer.style.position = 'relative';
		this.contentContainer.style.overflow = 'hidden';
		this.contentContainer.style.minHeight = '0';
		this.contentContainer.style.height = 'calc(100% - 2px)'; // Prevent terminal overlap
		this.contentContainer.style.width = '100%';
		this.container.appendChild(this.contentContainer);

		// Browser container (takes remaining space, shrinks when panel opens)
		this.browserContainer = document.createElement('div');
		this.browserContainer.style.flex = '1 1 0%';
		this.browserContainer.style.display = 'flex';
		this.browserContainer.style.flexDirection = 'column';
		this.browserContainer.style.overflow = 'hidden';
		this.browserContainer.style.backgroundColor = 'var(--vscode-editor-background)';
		this.browserContainer.style.position = 'relative';
		this.browserContainer.style.minHeight = '0';
		this.browserContainer.style.minWidth = '0';  // Allow shrinking
		this.contentContainer.appendChild(this.browserContainer);

		// Default screen shown when no URL is loaded (WebContentsView renders on top of this)
		this.createDefaultScreen();

		// Setup ResizeObserver for automatic bounds updates
		// Observe container and browserContainer to catch all resize events
		// This is critical for split screen scenarios where parent resizes
		this.resizeObserver = new ResizeObserver(() => {
			this.updateViewBounds();
		});
		this.resizeObserver.observe(this.container); // Parent container for split resize
		this.resizeObserver.observe(this.browserContainer);

		// NOTE: Browser view initialization is handled by setInput()
		// This ensures only ONE initialization happens per editor lifecycle
	}

	// Promise for initialization - used to wait if already initializing
	private initializationPromise: Promise<void> | undefined;

	// Default browser screen (shown when no URL is loaded)
	private defaultScreen: DefaultBrowserScreen | undefined;

	/**
	 * Create default browser screen (shown when no URL is loaded)
	 * Uses modular DefaultBrowserScreen component
	 */
	private createDefaultScreen(): void {
		if (!this.browserContainer) {
			return;
		}

		this.defaultScreen = new DefaultBrowserScreen(
			this.browserContainer,
			{
				onOpenProject: () => this.openProjectPicker(),
				onBrowseWeb: () => this.focusUrlBar(),
				onNavigate: (url) => this.navigate(url),
				onServerStopped: (projectRoot) => {
					// Update editor state when server is stopped from tile
					if (this.currentProjectRoot === projectRoot) {
						this.currentProjectRoot = undefined;
						this.isProjectMode = false;
					}
				}
			},
			this.devServerService,
			this.notificationService
		);
	}

	/**
	 * Open project folder picker
	 */
	private async openProjectPicker(): Promise<void> {
		// Show native folder picker directly
		const result = await this.nativeHostService.showOpenDialog({
			title: 'Select Project Folder',
			properties: ['openDirectory'],
			buttonLabel: 'Open Project'
		});

		if (result && !result.canceled && result.filePaths.length > 0) {
			const projectPath = result.filePaths[0];
			await this.startProjectPreview(projectPath);
		}
	}

	/**
	 * Focus the URL bar for manual URL entry
	 */
	private focusUrlBar(): void {
		if (this.controlBar) {
			this.controlBar.focusUrlInput();
		}
	}

	/**
	 * Hide placeholder when URL is loaded
	 * Shows the WebContentsView using native visibility API
	 */
	private hidePlaceholder(): void {
		if (this.defaultScreen) {
			this.defaultScreen.hide();
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

		// Use DOM.scheduleAtNextAnimationFrame to wait for next paint
		DOM.scheduleAtNextAnimationFrame(DOM.getWindow(this.browserContainer), () => {
			this.updateViewBounds();

			// Additional delayed updates to catch late layout changes
			// This handles split screen and other complex layout scenarios
			setTimeout(() => {
				this.updateViewBounds();
			}, 50);

			setTimeout(() => {
				this.updateViewBounds();
			}, 150);

			// Final update after layout should definitely be stable
			setTimeout(() => {
				this.updateViewBounds();
			}, 300);
		});
	}

	/**
	 * Show placeholder when no URL is loaded
	 * Hides the WebContentsView using native visibility API so placeholder is visible
	 */
	private showPlaceholder(): void {
		if (this.defaultScreen) {
			this.defaultScreen.show();
		}
		// Hide the browser view using native visibility API (like Cursor)
		// This properly hides the native view without destroying state
		if (this.browserViewId) {
			this.browserService.setBrowserVisible(this.browserViewId, false);
		}

		// Set tab title to "Browser Preview" when showing default screen
		// This is the proper way - set title based on UI state, not filter browser's title
		const input = this.input as EditorTabInput;
		if (input) {
			input.setPageTitle('');  // Clear page title so getName() returns "Browser Preview"
		}
	}

	/**
	 * Initialize browser WebContentsView
	 * Note: This only creates the view, navigation is handled by setInput()
	 */
	private initializeBrowserView(): Promise<void> {
		this.logger.info('[ProjectMode] initializeBrowserView() called');

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

			this.logger.info('[ProjectMode] Browser view initialized', {
				windowId,
				browserViewId: this.browserViewId
			});

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
					// Update button active state
					this.controlBar?.setDevToolsActive(false);
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
	private lastKnownFavicon = '';
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

				// Page finished loading - do post-load setup
				this.onPageLoadComplete();
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
			const previousUrl = this.lastKnownUrl;
			this.lastKnownUrl = currentUrl;

			// CRITICAL: Update input URL so it gets serialized correctly on reload
			// This ensures the full URL (including path, query params, etc.) is saved
			// not just the initial navigation URL which might have been redirected
			// Update whenever URL changes to capture the final URL after all redirects
			const input = this.input as EditorTabInput;
			if (input && currentUrl && currentUrl !== 'about:blank') {
				input.setUrl(currentUrl);
			}

			// Publish navigation event to central event bus (title is sent separately via titleChanged)
			this.eventService.publish('browser.navigated', {
				browserViewId: event.browserViewId,
				url: currentUrl
			});

			// UI updates now happen via event subscription (see setupEventSubscriptions)

			// If page is not loading and we don't have a DOM tree cache, fetch it
			// This handles cases where we miss the loading transition:
			// - First navigation from about:blank
			// - Fast page loads
			// - Reconnecting to an already-loaded page
			if (!event.isLoading && currentUrl && currentUrl !== 'about:blank') {
				// Always call onPageLoadComplete if we're not loading and URL changed significantly
				// It's safe to call multiple times - it just re-injects scripts and refreshes DOM tree
				if (previousUrl !== currentUrl || !this.styleInspect.getDOMTreeCache()) {
					this.onPageLoadComplete();
				}
			}
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

		// Update tab favicon when it changes
		const currentFavicon = event.favicon || '';
		if (currentFavicon !== this.lastKnownFavicon) {
			this.lastKnownFavicon = currentFavicon;
			const input = this.input as EditorTabInput;
			if (input) {
				input.setFavicon(currentFavicon || undefined);
			}
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

	/**
	 * Public method to navigate to a URL with project context
	 * Called by roopik.startProject command after dev server starts
	 * @param url - The URL to navigate to (e.g., http://localhost:5173)
	 * @param projectRoot - The project root path (for state tracking)
	 */
	public async navigateToUrl(url: string, projectRoot?: string): Promise<void> {
		// Ensure browser view is initialized
		if (!this.browserViewId) {
			this.logger.info('[ProjectMode] Browser view not ready, initializing...');
			await this.initializeBrowserView();
		}

		// Update project state if projectRoot provided
		if (projectRoot) {
			this.isProjectMode = true;
			this.currentProjectRoot = projectRoot;
		}

		// Navigate to the URL
		await this.navigate(url);
	}

	private async navigate(url: string): Promise<void> {
		if (!url) {
			this.logger.warn('[ProjectMode] Navigation aborted: No URL provided');
			return;
		}

		if (!this.browserViewId) {
			this.logger.error('[ProjectMode] Navigation aborted: No browser view ID! Browser view may not be initialized.', {
				requestedUrl: url
			});
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

		this.logger.info('[ProjectMode] Navigation requested', {
			browserViewId: this.browserViewId,
			finalUrl: url
		});

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

	/**
	 * Go to home screen (default browser screen)
	 *
	 * IMPORTANT: We MUST navigate to about:blank to properly unload the page.
	 * This is the standard Electron pattern to:
	 * - Stop audio/video playback
	 * - Release page memory
	 * - Clear JavaScript timers
	 * - Unload all resources
	 * - Clear any error states
	 *
	 * Just hiding the browser view would leave the page running in background!
	 * (e.g., YouTube audio would keep playing)
	 *
	 * This method is ALWAYS safe to call - even if already on home screen.
	 * It will reset error states and ensure clean state.
	 */
	private goHome(): void {
		// 1. Update state FIRST so event handlers ignore title/URL changes
		this.hasLoadedUrl = false;

		// 2. Start navigation IMMEDIATELY (fire and forget - don't await)
		//    This stops audio/video as fast as possible AND clears error states
		//    Always navigate even if we think we're already on about:blank
		//    to ensure clean state and clear any stuck errors
		if (this.browserViewId) {
			this.browserService.navigate(this.browserViewId, 'about:blank')
				.catch(error => this.logger.warn('[ProjectMode] Failed to navigate to about:blank:', error));
		}

		// 3. Update UI (happens in parallel with navigation)
		//    showPlaceholder() calls defaultScreen.show() which resets to normal state
		//    (clears any error messages that might be displayed)
		this.showPlaceholder();

		// 4. Clear URL bar
		if (this.controlBar) {
			this.controlBar.setUrl('');
		}

		// 5. Update input URL state
		const input = this.input as EditorTabInput;
		if (input) {
			input.setUrl('');
		}
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
	 * Stop Dev Server
	 * Stops the Vite dev server for the current project
	 * Queries electron-main for running server (survives IDE reload)
	 */
	private async stopDevServer(): Promise<void> {
		try {
			// Check electron-main for actually running server (not browser state)
			const runningServer = await this.devServerService.getRunningServer();

			if (!runningServer) {
				this.logger.warn('[ProjectMode] No project to stop');
				this.notificationService.notify({
					severity: Severity.Warning,
					message: 'No dev server is running',
					sticky: false
				});
				return;
			}

			// Stop the server using the actual projectRoot from electron-main
			await this.devServerService.stopServer(runningServer.projectRoot);

			// Clear active project metadata (fire-and-forget - don't block stop operation!)
			this.projectStorageService.clearActiveProject()
				.then(() => this.logger.info('[ProjectMode] Active project metadata cleared'))
				.catch((err) => this.logger.warn('[ProjectMode] Failed to clear active project metadata (non-fatal):', err));
			this.currentProjectRoot = undefined;

			// Show home screen after stopping server (don't navigate to about:blank)
			this.goHome();

			this.notificationService.notify({
				severity: Severity.Info,
				message: 'Dev server stopped',
				sticky: false
			});
		} catch (error) {
			this.logger.error('[ProjectMode] Failed to stop dev server:', error);
			this.notificationService.notify({
				severity: Severity.Error,
				message: `Failed to stop dev server: ${error}`,
				sticky: false
			});
		}
	}

	/**
	 * Start project preview mode
	 * Starts dev server and navigates to it
	 * @param projectRoot - Path to project root directory
	 *
	 * CONSTRAINT: Only ONE dev server can run at a time globally.
	 * If a different project is already running, we stop it first.
	 * If the SAME project is already running, we just navigate to it.
	 */
	public async startProjectPreview(projectRoot: string): Promise<void> {
		this.logger.info(`[ProjectMode] Starting project preview for: ${projectRoot}`);

		// =====================================================
		// SINGLE SERVER CONSTRAINT
		// Only one dev server can run at a time!
		// =====================================================

		// Check if SAME project is already running - just navigate to it
		if (this.isProjectMode && this.currentProjectRoot === projectRoot) {
			this.logger.info('[ProjectMode] Same project already running, navigating to existing server');
			const serverInfo = await this.devServerService.getServerInfo(projectRoot);
			if (serverInfo?.url) {
				await this.navigate(serverInfo.url);
				return;
			}
			// Server info not found, continue to start fresh
		}

		// Check if DIFFERENT project is running - stop it first
		if (this.isProjectMode && this.currentProjectRoot && this.currentProjectRoot !== projectRoot) {
			this.logger.info(`[ProjectMode] Different project running (${this.currentProjectRoot}), stopping it first`);
			this.notificationService.notify({
				severity: Severity.Info,
				message: 'Stopping previous project server...',
				sticky: false
			});

			// Stop the existing server
			await this.devServerService.stopServer(this.currentProjectRoot);
			this.currentProjectRoot = undefined;
			this.isProjectMode = false;
		}

		// =====================================================
		// END SINGLE SERVER CONSTRAINT
		// =====================================================

		// Show loading state
		if (this.controlBar) {
			this.controlBar.showLoading();
		}

		// CRITICAL: Ensure browser view is initialized before starting dev server
		// This fixes a race condition where user clicks "Open Project" before browser is ready
		if (!this.browserViewId) {
			this.logger.info('[ProjectMode] Browser view not ready, initializing...');
			await this.initializeBrowserView();
		}

		// Double-check browser is ready (initialization might have failed)
		if (!this.browserViewId) {
			this.logger.error('[ProjectMode] Failed to initialize browser view');
			if (this.controlBar) {
				this.controlBar.hideLoading();
			}
			this.notificationService.notify({
				severity: Severity.Error,
				message: 'Failed to initialize browser preview. Please try again.',
				sticky: false
			});
			return;
		}

		// NOTE: We don't subscribe to onStatusChanged here!
		// The DevServerService fires events, but they go to ALL listeners.
		// Since startServer() returns a Promise that resolves on success or rejects on error,
		// we just await it directly. Status events are for external monitoring (e.g., status bar).

		try {
			// Start the dev server (this handles all prerequisite checks internally)
			const url = await this.devServerService.startServer({
				projectRoot,
				port: 5173
			});

			// Update state
			this.isProjectMode = true;
			this.currentProjectRoot = projectRoot;

			// Save to recent projects storage and set as active project (non-blocking)
			// Extract project name from the path (folder name)
			const projectName = projectRoot.split(/[/\\]/).pop() || 'Project';

			// Get server info to capture framework, pid, port, url for metadata persistence
			// IMPORTANT: This is fire-and-forget - don't let metadata saving block browser opening!
			this.devServerService.getServerInfo(projectRoot).then(async (serverInfo) => {
				if (serverInfo) {
					try {
						const framework = serverInfo.framework;
						const frameworkDisplayName = serverInfo.frameworkDisplayName;
						const projectId = await this.projectStorageService.upsertProject(projectName, projectRoot, framework, frameworkDisplayName);

						// Store active project metadata for orphaned process cleanup after IDE restart
						if (serverInfo.pid && serverInfo.port && serverInfo.url) {
							await this.projectStorageService.setActiveProject(projectId, serverInfo.pid, serverInfo.port, serverInfo.url);
							this.logger.info(`[ProjectMode] Active project metadata saved: ${projectId} (PID: ${serverInfo.pid}, Port: ${serverInfo.port})`);
						} else {
							this.logger.warn('[ProjectMode] Server info incomplete, skipping active project metadata');
						}
					} catch (err) {
						// Don't let metadata saving failure block browser opening!
						this.logger.warn('[ProjectMode] Failed to save project metadata (non-fatal):', err);
					}
				}
			}).catch((err) => {
				this.logger.warn('[ProjectMode] Failed to get server info for metadata (non-fatal):', err);
			});

			// Small delay to ensure Vite server is fully ready to accept connections
			// The server reports READY when listening starts, but it may take a few ms
			// to actually be able to serve requests (especially on first load with cold cache)
			await new Promise(resolve => setTimeout(resolve, 100));

			// Navigate to dev server URL
			await this.navigate(url);

			this.logger.info(`[ProjectMode] Project preview started at: ${url}`);
		} catch (error) {
			this.logger.error('[ProjectMode] Failed to start project preview:', error);
			if (this.controlBar) {
				this.controlBar.hideLoading();
			}
			this.notificationService.notify({
				severity: Severity.Error,
				message: `Failed to start project: ${error}`,
				sticky: false
			});
		}
	}


	/**
	 * Check if currently in project preview mode
	 */
	public isInProjectMode(): boolean {
		return this.isProjectMode;
	}

	/**
	 * Get current project root (if in project mode)
	 */
	public getProjectRoot(): string | undefined {
		return this.currentProjectRoot;
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

		// Update button active state
		this.controlBar?.setDevToolsActive(this.devtoolsVisible);
	}

	// ============================================
	// Edit Mode (placeholder for future implementation)
	// ============================================

	/**
	 * Toggle Edit Mode
	 * TODO: Implement edit mode features (drag-drop, direct style editing)
	 */
	private toggleEditModeToolbar(enabled: boolean): void {
		this.logger.info(`[ProjectMode] Edit Mode ${enabled ? 'ENABLED' : 'DISABLED'} (not yet implemented)`);
		// TODO: Implement edit mode - will enable drag-drop, style editing, etc.
	}

	// ============================================
	// Pending Changes Panel (drag-drop operations)
	// ============================================

	/**
	 * Toggle Pending Changes Panel visibility
	 * Opens the StyleInspect panel and switches to the Changes tab
	 */
	private togglePendingChangesPanel(): void {
		if (!this.contentContainer) {
			return;
		}

		// Initialize StyleInspect panel if not already done
		if (!this.styleInspect.isPanelVisible()) {
			this.styleInspect.initialize(this.contentContainer);
		}

		// Switch to Changes tab (this also shows the panel if hidden)
		this.styleInspect.switchToChangesTab();
	}

	/**
	 * Undo a specific pending move
	 */
	private async undoPendingMove(moveId: string): Promise<void> {
		if (!this.browserViewId) {
			return;
		}

		const success = await this.dragDrop.undoMove(this.browserViewId, moveId);
		if (!success) {
			this.notificationService.notify({
				severity: Severity.Warning,
				message: 'Failed to undo move',
				sticky: false
			});
		}
	}

	/**
	 * Undo all pending moves by reloading the page
	 *
	 * Since DOM changes are ephemeral (like Chrome DevTools), the simplest
	 * and most reliable way to "Undo All" is to reload the page from source.
	 * HMR will serve the original code without any in-memory DOM changes.
	 *
	 * This is more robust than trying to undo each move individually because:
	 * 1. Element selectors change after moves, making tracking unreliable
	 * 2. Complex nested moves can get out of sync
	 * 3. Page reload guarantees a clean state from source
	 */
	private async undoAllPendingMoves(): Promise<void> {
		if (!this.browserViewId) {
			return;
		}

		const count = this.dragDrop.getPendingCount();
		if (count === 0) {
			return;
		}

		// Clear the pending queue first
		this.dragDrop.clearPendingChanges();

		// Reload the page to restore original DOM from source
		await this.refresh();

		// Notify user
		this.notificationService.notify({
			severity: Severity.Info,
			message: `Discarded ${count} pending change${count === 1 ? '' : 's'} - page reloaded`,
			sticky: false
		});
	}

	/**
	 * Apply all pending moves (commit to source)
	 * TODO: Implement AST-based source file updates
	 */
	private async applyAllPendingMoves(): Promise<void> {
		const moves = this.dragDrop.getPendingMoves();
		if (moves.length === 0) {
			return;
		}

		// TODO: Phase 5 - Implement AST-based source file updates
		// For now, just clear the queue and show a message
		this.notificationService.notify({
			severity: Severity.Info,
			message: `${moves.length} changes applied (source file update coming soon)`,
			sticky: false
		});

		// Clear the pending queue
		this.dragDrop.clearPendingChanges();
	}

	// ============================================
	// Inspect Mode (delegates to InspectMode feature class)
	// ============================================

	/**
	 * Toggle Inspect Element Mode (enable/disable)
	 * Same button press enables and disables - standard toggle behavior
	 */
	private async toggleInspectMode(): Promise<void> {
		if (!this.browserViewId) {
			return;
		}

		// Toggle based on current state
		if (this.inspectMode.getIsActive()) {
			// Disable inspect mode
			await this.inspectMode.disable(this.browserViewId);
			this.controlBar?.setInspectModeActive(false);
		} else {
			// Enable inspect mode
			// Setup CDP bridge first (creates window.__roopikBridge in page)
			try {
				await this.browserService.setupBrowserBridge(this.browserViewId);
			} catch (e) {
				this.logger.warn('[InspectMode] Failed to setup bridge, continuing anyway:', e);
				// Continue anyway - script will still work, just won't send events
			}

			// Inject inspect mode script
			await this.inspectMode.enable(this.browserViewId);

			// Update button active state
			this.controlBar?.setInspectModeActive(true);
		}
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
	// Style Inspect Mode (CSS source tracking)
	// ============================================


	/**
	 * Disable Style Inspect Mode
	 */
	public async disableStyleInspectMode(): Promise<void> {
		if (this.browserViewId) {
			await this.styleInspect.disable(this.browserViewId);
		}
		this.styleInspect.hidePanel();
	}

	/**
	 * Toggle Style Panel visibility
	 * Called from control bar button click
	 */
	private toggleStylePanel(): void {
		if (this.styleInspect.isPanelVisible()) {
			this.styleInspect.hidePanel();
		} else {
			// Initialize panel if needed
			if (this.contentContainer) {
				this.styleInspect.initialize(this.contentContainer);
			}
			// Show empty panel (user can then use inspect mode to select an element)
			// Panel will use cached DOM tree if available (from page load)
			this.styleInspect.showEmptyPanel();

			// If no cached tree exists yet, fetch it now
			if (!this.styleInspect.getDOMTreeCache()) {
				this.fetchDOMTreeForComponentsTab();
			}
		}
	}

	/**
	 * Check if style inspect mode is active
	 */
	public isStyleInspectModeActive(): boolean {
		return this.styleInspect.getIsActive();
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
			// this.logger.info(`[ProjectMode] URL copied to clipboard: ${url}`);

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
					// Stop dev server FIRST to release the port
					// This is critical - if we don't stop here, the server becomes orphaned
					// and blocks the port until VSCode is restarted
					this.stopDevServerOnClose();
					this.destroyBrowserNow();
				}));
			}

			// Initialize browser view if not already done
			// This happens on:
			// 1. First time opening the browser preview
			// 2. After IDE reload (browser view was destroyed, needs to be recreated)
			//    - EditorTabInputSerializer restores the URL
			//    - setInput() is called with restored input
			//    - Browser view is recreated and navigated to restored URL
			if (!this.browserViewId) {
				// Set URL bar to initial URL for first load
				if (this.controlBar) {
					this.controlBar.setUrl(initialUrl);
				}

				await this.initializeBrowserView();

				// Navigate only on first initialization if we have a real URL
				// This handles both fresh opens and restores after reload
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

		// Show error on the default screen
		if (this.defaultScreen) {
			this.defaultScreen.showError(message);
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
	 * Stop dev server on tab close
	 * CRITICAL: Must be called when tab is closed to release the port!
	 * Without this, the server becomes orphaned and blocks the port.
	 *
	 * This is idempotent - safe to call multiple times.
	 */
	private stopDevServerOnClose(): void {
		if (!this.currentProjectRoot) {
			return;
		}

		const projectRoot = this.currentProjectRoot;
		this.currentProjectRoot = undefined; // Clear immediately to prevent double-stop
		this.isProjectMode = false;

		this.logger.info(`[ProjectMode] Stopping dev server on tab close for: ${projectRoot}`);

		this.devServerService.stopServer(projectRoot)
			.then(() => {
				this.logger.info('[ProjectMode] Dev server stopped successfully');
			})
			.catch(err => {
				this.logger.error('[ProjectMode] Failed to stop dev server on tab close:', err);
			});
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

		// Dispose features
		this.styleInspect.dispose();
		this.dragDrop.dispose();

		// Stop dev server if running (idempotent - may have already been stopped by onWillDispose)
		this.stopDevServerOnClose();

		// Destroy browser if not already destroyed by input disposal
		// (destroyBrowserNow may have already been called via onWillDispose)
		if (this.browserViewId) {
			this.destroyBrowserNow();
		}

		super.dispose();
	}
}
