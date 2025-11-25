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
import { BrowserViewServiceBridge } from '../services/browserViewServiceBridge.js';

/**
 * Project Mode Editor
 *
 * Main editor for Mode 2 (Browser Preview).
 * Provides:
 * - Address bar for navigation
 * - Browser preview container (will integrate BrowserView later)
 * - DevTools integration (future)
 */
export class ProjectModeEditor extends EditorPane {
	static readonly ID = 'roopik.projectModeEditor';

	private container: HTMLElement | undefined;
	private controlBar: BrowserControlBar | undefined;
	private browserContainer: HTMLElement | undefined;
	private browserBridge: BrowserViewServiceBridge;
	private logger: ILogger;
	private containerId: string;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@ILoggerService loggerService: ILoggerService
	) {
		super(ProjectModeEditor.ID, group, telemetryService, themeService, storageService);
		this.logger = RoopikLogger.create(loggerService);
		this.browserBridge = this._register(new BrowserViewServiceBridge(loggerService));
		this.containerId = `project-preview-${Date.now()}`;

		// Setup event listeners
		this._register(this.browserBridge.onUrlChanged(({ url }) => {
			if (this.controlBar) {
				this.controlBar.setUrl(url);
			}
		}));

		this._register(this.browserBridge.onLoadingStarted(() => {
			if (this.controlBar) {
				this.controlBar.showLoading();
			}
		}));

		this._register(this.browserBridge.onLoadingStopped(() => {
			if (this.controlBar) {
				this.controlBar.hideLoading();
			}
		}));

		this._register(this.browserBridge.onNavigationError(({ error }) => {
			this.logger.error(`[Roopik] Navigation error: ${error}`);
		}));
	}

	protected createEditor(parent: HTMLElement): void {
		this.container = parent;
		this.container.style.display = 'flex';
		this.container.style.flexDirection = 'column';
		this.container.style.height = '100%';
		this.container.style.position = 'relative';

		// Create browser control bar
		const config: IBrowserControlBarConfig = {
			showDevTools: true,
			showScreenshot: true,
			showInspect: true,
			showHardReload: true,
			showCopyElement: true
		};

		const callbacks: IBrowserControlBarCallbacks = {
			onNavigate: (url) => this.navigate(url),
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

		// Create browser container
		this.browserContainer = document.createElement('div');
		this.browserContainer.id = this.containerId;
		this.browserContainer.style.flex = '1';
		this.browserContainer.style.backgroundColor = 'var(--vscode-editor-background)';
		this.browserContainer.style.position = 'relative';
		this.container.appendChild(this.browserContainer);

		this.logger.debug('[Roopik] ProjectModeEditor created');

		// Request BrowserView creation from main process
		this.browserBridge.navigate(this.containerId, 'about:blank');
		this.logger.info('[Roopik] Container ready for BrowserView overlay');

		// Update BrowserView bounds once DOM is ready
		setTimeout(() => this.updateBrowserViewBounds(), 100);
	}

	private navigate(url: string): void {
		if (!url) {
			return;
		}

		// Ensure URL has protocol
		if (!url.startsWith('http://') && !url.startsWith('https://')) {
			url = 'http://' + url;
		}

		this.logger.info(`[Roopik] Navigating to: ${url}`);

		// Update input
		const input = this.input as ProjectModeInput;
		if (input) {
			input.setUrl(url);
		}

		// Navigate via browser bridge
		this.browserBridge.navigate(this.containerId, url);
	}

	private navigateBack(): void {
		this.logger.debug('[Roopik] Navigate back');
		this.browserBridge.goBack(this.containerId);
	}

	private navigateForward(): void {
		this.logger.debug('[Roopik] Navigate forward');
		this.browserBridge.goForward(this.containerId);
	}

	private navigateHome(): void {
		this.logger.debug('[Roopik] Navigate home');
		// Navigate to default home URL (could be configurable)
		this.navigate('about:blank');
	}

	private refresh(): void {
		this.logger.debug('[Roopik] Refresh');
		this.browserBridge.reload(this.containerId);
	}

	private stop(): void {
		this.logger.debug('[Roopik] Stop loading / Stop dev server');
		// TODO: Implement stop loading and dev server shutdown
		// For now, just log
	}

	private hardReload(): void {
		this.logger.debug('[Roopik] Hard reload');
		// TODO: Implement hard reload via bridge
		this.browserBridge.reload(this.containerId);
	}

	private openDevTools(): void {
		this.logger.debug('[Roopik] Open DevTools');
		this.browserBridge.openDevTools(this.containerId);
	}

	private toggleInspect(): void {
		this.logger.debug('[Roopik] Toggle inspect mode');
		// TODO: Implement inspect mode
	}

	private copyElement(): void {
		this.logger.debug('[Roopik] Copy current element');
		// TODO: Implement copy element
	}

	private takeScreenshot(): void {
		this.logger.debug('[Roopik] Take screenshot');
		// TODO: Implement screenshot
	}

	override async setInput(input: EditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);

		// Load URL from input
		if (input instanceof ProjectModeInput && input.url && this.controlBar) {
			this.controlBar.setUrl(input.url);
			if (input.url !== 'about:blank') {
				this.navigate(input.url);
			}
		}
	}

	override clearInput(): void {
		super.clearInput();
		if (this.controlBar) {
			this.controlBar.setUrl('');
		}
	}

	override focus(): void {
		this.controlBar?.focus();
	}

	layout(dimension: Dimension): void {
		// Update BrowserView bounds when editor is resized
		if (this.browserContainer) {
			// Use setTimeout to ensure DOM has updated
			setTimeout(() => this.updateBrowserViewBounds(), 0);
		}
	}

	/**
	 * Update BrowserView bounds to match container position
	 */
	private updateBrowserViewBounds(): void {
		if (!this.browserContainer) {
			return;
		}

		try {
			// Get the container's position relative to the window
			const rect = this.browserContainer.getBoundingClientRect();

			// Send bounds update command to main process
			this.browserBridge.updateBounds(this.containerId, {
				x: Math.round(rect.left),
				y: Math.round(rect.top),
				width: Math.round(rect.width),
				height: Math.round(rect.height)
			});
		} catch (error) {
			this.logger.error(`[Roopik] Failed to update BrowserView bounds: ${error}`);
		}
	}
}
