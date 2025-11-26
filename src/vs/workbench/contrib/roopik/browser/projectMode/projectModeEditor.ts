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
	private _currentUrl: string = 'about:blank'; // Track current URL for future use
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
	}

	override async setInput(input: EditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
	}

	protected createEditor(parent: HTMLElement): void {

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

		// Create webview tag
		this.webviewElement = document.createElement('webview') as Electron.WebviewTag;
		this.webviewElement.style.flex = '1';
		this.webviewElement.style.width = '100%';
		this.webviewElement.style.height = '100%';

		// Enable necessary webview features
		this.webviewElement.setAttribute('disablewebsecurity', 'true'); // Allow loading any URL
		this.webviewElement.setAttribute('allowpopups', 'true');
		this.webviewElement.setAttribute('partition', 'persist:roopik'); // Allow localhost and persist session

		// Setup webview event listeners
		this.setupWebviewListeners();

		this.container.appendChild(this.webviewElement);

		// Load initial URL after a short delay to ensure webview is ready
		setTimeout(() => {
			this.navigate('about:blank');
		}, 100);
	}

	/**
	 * Setup event listeners for webview
	 */
	private setupWebviewListeners(): void {
		if (!this.webviewElement) {
			return;
		}

		// Page failed to load
		this.webviewElement.addEventListener('did-fail-load', (event: any) => {
			this.logger.error('[Roopik] Webview load failed:', {
				url: event.validatedURL,
				errorCode: event.errorCode,
				errorDescription: event.errorDescription,
				isMainFrame: event.isMainFrame
			});
		});

		// URL changed (navigation)
		this.webviewElement.addEventListener('did-navigate', (event: any) => {
			this._currentUrl = event.url;
			// Update address bar
			if (this.controlBar) {
				this.controlBar.setUrl(event.url);
			}
		});

		// New window requested
		this.webviewElement.addEventListener('new-window', (event: any) => {
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

		this._currentUrl = url;
		this.logger.debug(`[Roopik] Navigating to: ${this._currentUrl}`);

		try {
			// Load URL in webview
			this.webviewElement.src = url;
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
		}
	}

	/**
	 * Navigate forward
	 */
	private navigateForward(): void {
		if (this.webviewElement && this.webviewElement.canGoForward()) {
			this.webviewElement.goForward();
		}
	}

	/**
	 * Navigate home
	 */
	private navigateHome(): void {
		this.navigate('about:blank');
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
			}
		}
	}

	/**
	 * Stop loading
	 */
	private stop(): void {
		if (this.webviewElement) {
			this.webviewElement.stop();
		}
	}

	/**
	 * Open DevTools
	 */
	private openDevTools(): void {
		if (this.webviewElement) {
			this.webviewElement.openDevTools();
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
			}
		}
	}

	/**
	 * Toggle inspect element mode
	 */
	private toggleInspect(): void {
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
		} catch (error) {
			this.logger.error('[Roopik] Failed to copy element:', error);
		}
	}

	/**
	 * Take screenshot
	 */
	private async takeScreenshot(): Promise<void> {
		// TODO: Implement screenshot using webview.capturePage()
	}

	/**
	 * Zoom in
	 */
	public zoomIn(): void {
		if (this.webviewElement) {
			this.currentZoomFactor = Math.min(this.currentZoomFactor + 0.1, 3.0); // Max 300%
			this.webviewElement.setZoomFactor(this.currentZoomFactor);
		}
	}

	/**
	 * Zoom out
	 */
	public zoomOut(): void {
		if (this.webviewElement) {
			this.currentZoomFactor = Math.max(this.currentZoomFactor - 0.1, 0.5); // Min 50%
			this.webviewElement.setZoomFactor(this.currentZoomFactor);
		}
	}

	/**
	 * Reset zoom to 100%
	 */
	public zoomReset(): void {
		if (this.webviewElement) {
			this.currentZoomFactor = 1.0;
			this.webviewElement.setZoomFactor(this.currentZoomFactor);
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
		super.clearInput();
	}

	override focus(): void {
		if (this.webviewElement) {
			this.webviewElement.focus();
		}
	}

	layout(dimension: Dimension): void {
		// Webview auto-resizes with CSS flex
	}
}
