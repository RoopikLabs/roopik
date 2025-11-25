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

	// ResizeObserver for automatic bounds updates
	private resizeObserver: ResizeObserver | undefined;

	// Current URL tracking
	private currentUrl: string = 'about:blank';

	// Current device emulation
	private _currentDevice: DevicePreset | undefined;

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
		this.logger = RoopikLogger.create(loggerService);
		this.browserService = new ProjectModeV2ServiceBridge(mainProcessService.getChannel(PROJECT_MODE_V2_CHANNEL));
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

		this.logger.info('[ProjectModeV2] Editor created');

		// Initialize browser view
		this.initializeBrowserView();
	}

	/**
	 * Initialize browser WebContentsView
	 */
	private async initializeBrowserView(): Promise<void> {
		try {
			const windowId = await this.nativeHostService.windowId;
			const result = await this.browserService.createBrowserView(windowId);
			this.browserViewId = result.browserViewId;

			this.logger.info(`[ProjectModeV2] Browser view created: ${this.browserViewId}`);

			// Update bounds after creation
			this.updateViewBounds();

			// Enable CDP domains for debugging
			await this.browserService.enableCDPDomains(this.browserViewId, {
				network: true,
				dom: true,
				css: true,
				runtime: true,
				page: true
			});

			// Navigate to initial URL
			if (this.currentUrl !== 'about:blank') {
				await this.navigate(this.currentUrl);
			}
		} catch (error) {
			this.logger.error('[ProjectModeV2] Failed to initialize browser view:', error);
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
	 * Hide views (set bounds to 0)
	 */
	private hideViews(): void {
		if (this.browserViewId) {
			this.browserService.setBrowserBounds(this.browserViewId, { x: 0, y: 0, width: 0, height: 0 });
			if (this.devtoolsVisible) {
				this.browserService.setDevToolsBounds(this.browserViewId, { x: 0, y: 0, width: 0, height: 0 });
			}
		}
	}

	// ============================================
	// Navigation
	// ============================================

	private async navigate(url: string): Promise<void> {
		if (!url || !this.browserViewId) {
			return;
		}

		// Ensure URL has protocol
		if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('about:')) {
			url = 'https://' + url;
		}

		this.currentUrl = url;
		this.logger.debug(`[ProjectModeV2] Navigating to: ${url}`);

		try {
			await this.browserService.navigate(this.browserViewId, url);

			// Update control bar
			if (this.controlBar) {
				this.controlBar.setUrl(url);
			}

			// Update input
			const input = this.input as ProjectModeV2Input;
			if (input) {
				input.setUrl(url);
			}
		} catch (error) {
			this.logger.error('[ProjectModeV2] Navigation failed:', error);
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
			this.currentUrl = input.url;
			if (this.controlBar) {
				this.controlBar.setUrl(input.url);
			}
			if (this.browserViewId && input.url !== 'about:blank') {
				await this.navigate(input.url);
			}
		}
	}

	override setVisible(visible: boolean): void {
		super.setVisible(visible);

		if (visible) {
			// Update bounds when becoming visible
			setTimeout(() => this.updateViewBounds(), 0);
		} else {
			// Hide views when becoming invisible
			this.hideViews();
		}
	}

	override clearInput(): void {
		super.clearInput();

		// Destroy browser view on tab close
		if (this.browserViewId) {
			this.browserService.destroyBrowserView(this.browserViewId)
				.catch(err => this.logger.error('[ProjectModeV2] Failed to destroy browser view:', err));
			this.browserViewId = undefined;
		}
	}

	override focus(): void {
		// Focus browser
		this.browserContainer?.focus();
	}

	layout(dimension: Dimension): void {
		// Bounds will auto-update via ResizeObserver
	}

	override dispose(): void {
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
