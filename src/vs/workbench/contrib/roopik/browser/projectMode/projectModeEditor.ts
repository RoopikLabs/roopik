/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { EditorPane } from '../../../../browser/parts/editor/editorPane.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ProjectModeInput } from './projectModeInput.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Dimension } from '../../../../../base/browser/dom.js';
import { IEditorOpenContext } from '../../../../common/editor.js';
import { RoopikLogger } from '../../common/roopikLogger.js';
import { ILoggerService, ILogger } from '../../../../../platform/log/common/log.js';
import { IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { BrowserControlBar, IBrowserControlBarConfig, IBrowserControlBarCallbacks } from './browserControlBar.js';

/**
 * Project Mode Editor
 *
 * Main editor for Mode 2 (Browser Preview) using Electron webview tag.
 * Provides:
 * - Address bar for navigation
 * - Electron webview for full Chrome-like browser experience
 * - DevTools integration via webview.openDevTools()
 * - Zoom controls
 * - DOM access for LLM via executeJavaScript
 */
export class ProjectModeEditor extends EditorPane {
	static readonly ID = 'roopik.projectModeEditor';

	private container: HTMLElement | undefined;
	private controlBar: BrowserControlBar | undefined;
	private webviewElement: Electron.WebviewTag | undefined;
	private logger: ILogger;
	private currentUrl: string = 'about:blank';
	private currentZoomFactor: number = 1.0;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@ILoggerService loggerService: ILoggerService
	) {
		super(ProjectModeEditor.ID, group, telemetryService, themeService, storageService);
		this.logger = RoopikLogger.create(loggerService);
		this.logger.info('[Roopik] ProjectModeEditor constructor');
	}

	override async setInput(input: EditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		this.logger.info('[Roopik] ProjectModeEditor setInput');
	}

	protected createEditor(parent: HTMLElement): void {
		this.logger.info('[Roopik] ProjectModeEditor createEditor');

		// Main container
		this.container = document.createElement('div');
		this.container.style.display = 'flex';
		this.container.style.flexDirection = 'column';
		this.container.style.height = '100%';
		this.container.style.width = '100%';
		parent.appendChild(this.container);

		// Browser control bar configuration (basic nav always visible, optional features configurable)
		const config: IBrowserControlBarConfig = {
			showDevTools: true,
			showHardReload: true,
			showInspect: true,
			showCopyElement: true,
			showScreenshot: true
		};

		// Browser control bar callbacks
		const callbacks: IBrowserControlBarCallbacks = {
			onNavigate: (url: string) => this.navigate(url),
			onBack: () => this.navigateBack(),
			onForward: () => this.navigateForward(),
			onHome: () => this.navigateHome(),
			onRefresh: () => this.refresh(),
			onStop: () => this.stop(),
			onDevTools: () => this.openDevTools(),
			onHardReload: () => this.hardReload(),
			onInspect: () => this.toggleInspect(),
			onCopyElement: () => this.copyElement(),
			onScreenshot: () => this.takeScreenshot()
		};

		this.controlBar = this._register(new BrowserControlBar(this.container, config, callbacks));

		// Create webview element
		this.createWebview();

		this.logger.info('[Roopik] ProjectModeEditor created');
	}

	/**
	 * Create Electron webview element
	 */
	private createWebview(): void {
		if (!this.container) {
			return;
		}

		this.logger.info('[Roopik] Creating webview element...');

		// Create webview tag
		this.webviewElement = document.createElement('webview') as Electron.WebviewTag;
		this.webviewElement.style.flex = '1';
		this.webviewElement.style.width = '100%';
		this.webviewElement.style.height = '100%';
		this.webviewElement.style.border = '1px solid red'; // Debug: make it visible

		// Enable necessary webview features
		this.webviewElement.setAttribute('disablewebsecurity', 'true'); // Allow loading any URL
		this.webviewElement.setAttribute('allowpopups', 'true');

		this.logger.info('[Roopik] Webview element created, type:', typeof this.webviewElement);
		this.logger.info('[Roopik] Webview tagName:', this.webviewElement.tagName);

		// Setup webview event listeners
		this.setupWebviewListeners();

		this.container.appendChild(this.webviewElement);
		this.logger.info('[Roopik] Webview appended to container');

		// Load initial URL after a short delay to ensure webview is ready
		setTimeout(() => {
			this.logger.info('[Roopik] Loading initial URL...');
			this.navigate('about:blank');
		}, 100);

		this.logger.info('[Roopik] Webview created');
	}

	/**
	 * Setup event listeners for webview
	 */
	private setupWebviewListeners(): void {
		if (!this.webviewElement) {
			return;
		}

		// Page loaded
		this.webviewElement.addEventListener('did-finish-load', () => {
			this.logger.info('[Roopik] Webview loaded:', this.currentUrl);
		});

		// Page failed to load
		this.webviewElement.addEventListener('did-fail-load', (event: any) => {
			this.logger.error('[Roopik] Webview load failed:', event.errorDescription);
		});

		// URL changed (navigation)
		this.webviewElement.addEventListener('did-navigate', (event: any) => {
			this.currentUrl = event.url;
			this.logger.info('[Roopik] Navigated to:', event.url);
			// Update address bar
			if (this.controlBar) {
				this.controlBar.setUrl(event.url);
			}
		});

		// New window requested
		this.webviewElement.addEventListener('new-window', (event: any) => {
			this.logger.info('[Roopik] New window requested:', event.url);
			// Open in same webview
			this.navigate(event.url);
		});
	}

	/**
	 * Navigate to URL
	 */
	private navigate(url: string): void {
		if (!url || !this.webviewElement) {
			this.logger.error('[Roopik] Navigate called but webview not ready or no URL');
			return;
		}

		// Ensure URL has protocol
		if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('about:')) {
			url = 'https://' + url;
		}

		this.currentUrl = url;
		this.logger.info(`[Roopik] Navigating to: ${url}`);
		this.logger.info(`[Roopik] Webview element exists:`, !!this.webviewElement);
		this.logger.info(`[Roopik] Webview src property exists:`, 'src' in this.webviewElement);

		try {
			// Load URL in webview
			this.webviewElement.src = url;
			this.logger.info(`[Roopik] Set webview src to: ${url}`);
			this.logger.info(`[Roopik] Webview src is now: ${this.webviewElement.src}`);
		} catch (error) {
			this.logger.error(`[Roopik] Failed to set webview src:`, error);
		}

		// Update input
		const input = this.input as ProjectModeInput;
		if (input) {
			input.setUrl(url);
		}
	}

	/**
	 * Navigate back
	 */
	private navigateBack(): void {
		if (this.webviewElement && this.webviewElement.canGoBack()) {
			this.webviewElement.goBack();
			this.logger.debug('[Roopik] Navigate back');
		}
	}

	/**
	 * Navigate forward
	 */
	private navigateForward(): void {
		if (this.webviewElement && this.webviewElement.canGoForward()) {
			this.webviewElement.goForward();
			this.logger.debug('[Roopik] Navigate forward');
		}
	}

	/**
	 * Navigate home
	 */
	private navigateHome(): void {
		this.navigate('about:blank');
		this.logger.debug('[Roopik] Navigate home');
	}

	/**
	 * Refresh page
	 */
	private refresh(): void {
		if (this.webviewElement) {
			// Webview tag uses loadURL to reload, not reload()
			const currentSrc = this.webviewElement.src;
			if (currentSrc) {
				this.webviewElement.src = currentSrc;
				this.logger.debug('[Roopik] Refresh:', currentSrc);
			}
		}
	}

	/**
	 * Stop loading
	 */
	private stop(): void {
		if (this.webviewElement) {
			this.webviewElement.stop();
			this.logger.debug('[Roopik] Stop loading');
		}
	}

	/**
	 * Open DevTools
	 */
	private openDevTools(): void {
		if (this.webviewElement) {
			this.webviewElement.openDevTools();
			this.logger.info('[Roopik] DevTools opened');
		}
	}

	/**
	 * Hard reload (bypass cache)
	 */
	private hardReload(): void {
		if (this.webviewElement) {
			// Reload with cache bypass
			const currentSrc = this.webviewElement.src;
			if (currentSrc) {
				// Add cache-busting parameter
				const url = new URL(currentSrc);
				url.searchParams.set('_roopikReload', Date.now().toString());
				this.webviewElement.src = url.toString();
				this.logger.debug('[Roopik] Hard reload');
			}
		}
	}

	/**
	 * Toggle inspect element mode
	 */
	private toggleInspect(): void {
		this.logger.debug('[Roopik] Toggle inspect (open DevTools and enable inspect mode)');
		this.openDevTools();
		// TODO: Programmatically trigger inspect mode in DevTools if possible
	}

	/**
	 * Copy element HTML
	 */
	private async copyElement(): Promise<void> {
		if (!this.webviewElement) {
			return;
		}

		try {
			// Get the currently selected/focused element's HTML
			const html = await this.webviewElement.executeJavaScript(`
				(function() {
					const el = document.activeElement || document.body;
					return el.outerHTML;
				})()
			`);

			// Copy to clipboard
			await navigator.clipboard.writeText(html);
			this.logger.info('[Roopik] Copied element HTML to clipboard');
		} catch (error) {
			this.logger.error('[Roopik] Failed to copy element:', error);
		}
	}

	/**
	 * Take screenshot
	 */
	private async takeScreenshot(): Promise<void> {
		this.logger.info('[Roopik] Screenshot requested (not implemented yet)');
		// TODO: Implement screenshot using webview.capturePage()
	}

	/**
	 * Zoom in
	 */
	public zoomIn(): void {
		if (this.webviewElement) {
			this.currentZoomFactor = Math.min(this.currentZoomFactor + 0.1, 3.0); // Max 300%
			this.webviewElement.setZoomFactor(this.currentZoomFactor);
			this.logger.info('[Roopik] Zoom in:', this.currentZoomFactor);
		}
	}

	/**
	 * Zoom out
	 */
	public zoomOut(): void {
		if (this.webviewElement) {
			this.currentZoomFactor = Math.max(this.currentZoomFactor - 0.1, 0.5); // Min 50%
			this.webviewElement.setZoomFactor(this.currentZoomFactor);
			this.logger.info('[Roopik] Zoom out:', this.currentZoomFactor);
		}
	}

	/**
	 * Reset zoom to 100%
	 */
	public zoomReset(): void {
		if (this.webviewElement) {
			this.currentZoomFactor = 1.0;
			this.webviewElement.setZoomFactor(this.currentZoomFactor);
			this.logger.info('[Roopik] Zoom reset');
		}
	}

	/**
	 * Get page HTML for LLM
	 */
	public async getPageHTML(): Promise<string> {
		if (!this.webviewElement) {
			return '';
		}

		try {
			return await this.webviewElement.executeJavaScript('document.documentElement.outerHTML');
		} catch (error) {
			this.logger.error('[Roopik] Failed to get page HTML:', error);
			return '';
		}
	}

	/**
	 * Get page text content for LLM
	 */
	public async getPageText(): Promise<string> {
		if (!this.webviewElement) {
			return '';
		}

		try {
			return await this.webviewElement.executeJavaScript('document.body.innerText');
		} catch (error) {
			this.logger.error('[Roopik] Failed to get page text:', error);
			return '';
		}
	}

	/**
	 * Execute custom JavaScript in webview (for LLM interactions)
	 */
	public async executeScript(script: string): Promise<any> {
		if (!this.webviewElement) {
			return null;
		}

		try {
			return await this.webviewElement.executeJavaScript(script);
		} catch (error) {
			this.logger.error('[Roopik] Failed to execute script:', error);
			return null;
		}
	}

	override clearInput(): void {
		this.logger.info('[Roopik] ProjectModeEditor clearInput');
		super.clearInput();
	}

	override focus(): void {
		if (this.webviewElement) {
			this.webviewElement.focus();
		}
	}

	layout(dimension: Dimension): void {
		// Webview auto-resizes with CSS flex
		this.logger.trace('[Roopik] Layout:', dimension);
	}
}
