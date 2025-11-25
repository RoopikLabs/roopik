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
import type { ViewBounds, DevicePreset } from '../../common/projectModeV2/types.js';

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

	// Instance counter for debugging
	private static instanceCounter = 0;
	private readonly instanceId: number;

	private container: HTMLElement | undefined;
	private controlBar: BrowserControlBarV2 | undefined;
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

	// Navigation state polling to sync URL bar
	private navigationPollInterval: ReturnType<typeof setInterval> | undefined;

	// Current device emulation
	private _currentDevice: DevicePreset | undefined;

	// Track if a real URL has been loaded (not about:blank)
	// Used to decide whether to show placeholder on tab switch
	private hasLoadedUrl: boolean = false;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@ILoggerService loggerService: ILoggerService,
		@IMainProcessService mainProcessService: IMainProcessService,
		@INativeHostService private readonly nativeHostService: INativeHostService
	) {
		super(ProjectModeV2Editor.ID, group, telemetryService, themeService, storageService);
		this.instanceId = ++ProjectModeV2Editor.instanceCounter;
		this.logger = RoopikLogger.create(loggerService);
		this.browserService = new ProjectModeV2ServiceBridge(mainProcessService.getChannel(PROJECT_MODE_V2_CHANNEL));
		this.logger.info(`[ProjectModeV2] Editor instance #${this.instanceId} created`);
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
		const contentContainer = document.createElement('div');
		contentContainer.style.flex = '1 1 auto';
		contentContainer.style.display = 'flex';
		contentContainer.style.flexDirection = 'column';
		contentContainer.style.position = 'relative';
		contentContainer.style.overflow = 'hidden';
		contentContainer.style.minHeight = '0';
		contentContainer.style.height = 'calc(100% - 2px)'; // Prevent terminal overlap
		contentContainer.style.width = '100%';
		this.container.appendChild(contentContainer);

		// Browser container (top area)
		this.browserContainer = document.createElement('div');
		this.browserContainer.style.flex = '1 1 0%';
		this.browserContainer.style.display = 'flex';
		this.browserContainer.style.overflow = 'hidden';
		this.browserContainer.style.backgroundColor = 'var(--vscode-editor-background)';
		this.browserContainer.style.position = 'relative';
		this.browserContainer.style.minHeight = '0';
		this.browserContainer.style.width = '100%';
		contentContainer.appendChild(this.browserContainer);

		// Placeholder shown when no URL is loaded (WebContentsView renders on top of this)
		this.createPlaceholder();

		// DevTools container (bottom area, initially hidden)
		this.devtoolsContainer = document.createElement('div');
		this.devtoolsContainer.style.display = 'none';
		this.devtoolsContainer.style.height = '40%';
		this.devtoolsContainer.style.backgroundColor = '#242424';
		this.devtoolsContainer.style.position = 'relative';
		this.devtoolsContainer.style.borderTop = '1px solid var(--vscode-panel-border)';
		contentContainer.appendChild(this.devtoolsContainer);

		// Setup ResizeObserver for automatic bounds updates
		this.resizeObserver = new ResizeObserver(() => {
			this.updateViewBounds();
		});
		this.resizeObserver.observe(this.browserContainer);
		this.resizeObserver.observe(this.devtoolsContainer);

		this.logger.info(`[ProjectModeV2] Editor #${this.instanceId} DOM created`);

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
			// Update bounds after making visible
			this.updateViewBounds();
		}
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
			this.logger.info(`[ProjectModeV2] #${this.instanceId} Browser view already initialized (viewId=${this.browserViewId}), skipping...`);
			return Promise.resolve();
		}

		// If already initializing, wait for that to complete instead of starting a new one
		// CRITICAL: Check isInitializing FIRST (sync flag set before promise created)
		if (this.isInitializing) {
			this.logger.info(`[ProjectModeV2] #${this.instanceId} Already initializing, waiting... (hasPromise=${!!this.initializationPromise})`);
			// Return existing promise if available, otherwise resolve immediately
			return this.initializationPromise || Promise.resolve();
		}

		// Mark as initializing SYNCHRONOUSLY before ANY async work
		this.isInitializing = true;
		this.logger.info(`[ProjectModeV2] #${this.instanceId} Starting browser view initialization...`);

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
			this.logger.info(`[ProjectModeV2] #${this.instanceId} Got window ID: ${windowId}`);

			const result = await this.browserService.createBrowserView(windowId);
			this.browserViewId = result.browserViewId;

			this.logger.info(`[ProjectModeV2] #${this.instanceId} Browser view created: viewId=${this.browserViewId}`);

			// Show placeholder initially (hides WebContentsView until user navigates)
			// This must happen BEFORE updateViewBounds to prevent flicker
			this.showPlaceholder();

			// Start navigation state polling to sync URL bar
			this.startNavigationPolling();

			// Enable CDP domains for debugging (don't await - do it in background)
			this.browserService.enableCDPDomains(this.browserViewId, {
				network: true,
				dom: true,
				css: true,
				runtime: true,
				page: true
			}).then(() => {
				this.logger.info('[ProjectModeV2] CDP domains enabled');
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

	/**
	 * Start polling for navigation state changes
	 * This keeps the URL bar in sync with the actual browser URL
	 */
	private startNavigationPolling(): void {
		// Clear any existing interval
		this.stopNavigationPolling();

		// Track last known URL to avoid unnecessary updates
		let lastKnownUrl = '';

		// Poll every 500ms for navigation changes
		this.navigationPollInterval = setInterval(async () => {
			if (!this.browserViewId) {
				return;
			}

			try {
				const state = await this.browserService.getNavigationState(this.browserViewId);

				// Update URL bar if URL changed
				if (state.url && state.url !== lastKnownUrl && state.url !== 'about:blank') {
					lastKnownUrl = state.url;
					if (this.controlBar) {
						this.controlBar.setUrl(state.url);
					}
				}

				// Update back/forward button states if control bar supports it
				// (can be added later)
			} catch {
				// Ignore errors - browser view might be destroyed
			}
		}, 500);
	}

	/**
	 * Stop navigation state polling
	 */
	private stopNavigationPolling(): void {
		if (this.navigationPollInterval) {
			clearInterval(this.navigationPollInterval);
			this.navigationPollInterval = undefined;
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

		// Ensure URL has protocol
		if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('about:')) {
			url = 'https://' + url;
		}

		// Track if we're loading a real URL (for tab switch behavior)
		const isRealUrl = url !== 'about:blank';

		// Hide placeholder when navigating to a real URL
		if (isRealUrl) {
			this.hasLoadedUrl = true;
			this.hidePlaceholder();
		}

		this.logger.info(`[ProjectModeV2] Navigating to: ${url} (browserViewId: ${this.browserViewId})`);

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
		this.hasLoadedUrl = false;
		this.showPlaceholder();
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
		if (!this.browserViewId || !this.devtoolsContainer) {
			return;
		}

		if (this.devtoolsVisible) {
			// Close DevTools
			await this.browserService.closeDevTools(this.browserViewId);
			this.devtoolsContainer.style.display = 'none';
			this.devtoolsVisible = false;
			this.logger.info('[ProjectModeV2] DevTools closed');
		} else {
			// Show container first
			this.devtoolsContainer.style.display = 'block';

			// Get container bounds
			const rect = this.devtoolsContainer.getBoundingClientRect();
			const bounds: ViewBounds = {
				x: Math.floor(rect.left),
				y: Math.floor(rect.top),
				width: Math.floor(rect.width),
				height: Math.floor(rect.height)
			};

			// Open DevTools (creates fresh WebContentsView ON-DEMAND)
			await this.browserService.openDevTools(this.browserViewId, bounds);
			this.devtoolsVisible = true;
			this.logger.info('[ProjectModeV2] DevTools opened');

			// Update bounds after layout settles
			setTimeout(() => this.updateViewBounds(), 100);
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
			this._currentDevice = device;
			await this.browserService.setDeviceEmulation(this.browserViewId, device);
			this.logger.info(`[ProjectModeV2] Device emulation set: ${this._currentDevice.name}`);
		} else {
			this._currentDevice = undefined;
			await this.browserService.clearDeviceEmulation(this.browserViewId);
			this.logger.info(`[ProjectModeV2] Device emulation cleared, current: ${this._currentDevice}`);
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

			this.logger.info('[ProjectModeV2] Screenshot taken');
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

			if (this.controlBar) {
				this.controlBar.setUrl(initialUrl);
			}

			// Initialize browser view if not already done
			if (!this.browserViewId) {
				this.logger.info(`[ProjectModeV2] #${this.instanceId} setInput: initializing browser view...`);
				await this.initializeBrowserView();
			}

			// Navigate only if we have a real URL (not about:blank)
			// Don't auto-navigate on initial load - user must enter URL or we pass one
			if (this.browserViewId && initialUrl && initialUrl !== 'about:blank') {
				await this.navigate(initialUrl);
			}
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
				// Update bounds after making visible
				setTimeout(() => this.updateViewBounds(), 0);
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

		// Stop navigation polling
		this.stopNavigationPolling();

		// Destroy browser view on tab close
		if (this.browserViewId) {
			this.browserService.destroyBrowserView(this.browserViewId)
				.catch(err => this.logger.error('[ProjectModeV2] Failed to destroy browser view:', err));
			this.browserViewId = undefined;
		}

		// Reset initialization flags for potential reuse
		this.isInitializing = false;
		this.initializationPromise = undefined;
	}

	override focus(): void {
		// Focus browser
		this.browserContainer?.focus();
	}

	layout(dimension: Dimension): void {
		// Bounds will auto-update via ResizeObserver
	}

	override dispose(): void {
		// Stop navigation polling
		this.stopNavigationPolling();

		// Cleanup ResizeObserver
		this.resizeObserver?.disconnect();
		this.resizeObserver = undefined;

		// Hide views immediately
		this.hideViews();

		// Destroy browser view
		if (this.browserViewId) {
			this.browserService.destroyBrowserView(this.browserViewId)
				.catch(err => this.logger.error('[ProjectModeV2] Failed to destroy browser view in dispose:', err));
			this.browserViewId = undefined;
		}

		super.dispose();
	}
}
