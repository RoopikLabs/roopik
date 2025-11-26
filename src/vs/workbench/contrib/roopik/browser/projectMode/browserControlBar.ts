/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';

/**
 * Browser Control Bar Configuration
 * Controls which optional features are enabled.
 * Basic navigation (back, forward, home, refresh, stop) is always visible.
 * Optional features appear in overflow menu (...).
 */
export interface IBrowserControlBarConfig {
	showDevTools?: boolean;        // Open DevTools button (overflow menu)
	showScreenshot?: boolean;      // Screenshot button (overflow menu)
	showInspect?: boolean;         // Inspect/Select element mode (overflow menu)
	showHardReload?: boolean;      // Hard reload (overflow menu)
	showCopyElement?: boolean;     // Copy current element button (overflow menu)
}

/**
 * Browser Control Bar Events
 */
export interface IBrowserControlBarCallbacks {
	// Basic navigation (always visible)
	onNavigate: (url: string) => void;
	onBack: () => void;
	onForward: () => void;
	onHome: () => void;
	onRefresh: () => void;
	onStop: () => void;            // Stop loading/dev server

	// Optional features (overflow menu)
	onDevTools?: () => void;
	onScreenshot?: () => void;
	onInspect?: () => void;        // Select/Inspect element mode
	onHardReload?: () => void;     // Hard reload (clear cache)
	onCopyElement?: () => void;    // Copy current inspected element
}

/**
 * Browser Control Bar
 *
 * Modular, icon-based control bar for browser preview.
 * Features are controlled by configuration flags.
 * Includes address bar, navigation controls, and action buttons.
 */
export class BrowserControlBar extends Disposable {
	private container: HTMLElement;
	private urlInput: HTMLInputElement;
	private progressBar: HTMLElement;
	private backButton?: HTMLButtonElement;
	private forwardButton?: HTMLButtonElement;
	private overflowMenu?: HTMLElement;
	private isOverflowVisible: boolean = false;

	constructor(
		parent: HTMLElement,
		private config: IBrowserControlBarConfig,
		private callbacks: IBrowserControlBarCallbacks
	) {
		super();
		this.container = this.createContainer(parent);
		this.progressBar = this.createProgressBar(parent);
		this.urlInput = this.createUrlInput();
		this.render();
	}

	private createContainer(parent: HTMLElement): HTMLElement {
		const container = document.createElement('div');
		container.style.display = 'flex';
		container.style.alignItems = 'center';
		container.style.padding = '8px';
		container.style.gap = '8px';
		container.style.borderBottom = '1px solid var(--vscode-panel-border)';
		container.style.backgroundColor = 'var(--vscode-editor-background)';
		container.style.position = 'relative'; // For absolute positioning of overflow menu
		parent.appendChild(container);
		return container;
	}

	private createProgressBar(parent: HTMLElement): HTMLElement {
		const progressContainer = document.createElement('div');
		progressContainer.style.position = 'absolute';
		progressContainer.style.top = '0';
		progressContainer.style.left = '0';
		progressContainer.style.right = '0';
		progressContainer.style.height = '2px';
		progressContainer.style.backgroundColor = 'transparent';
		progressContainer.style.overflow = 'hidden';
		progressContainer.style.zIndex = '1000';

		const progressBar = document.createElement('div');
		progressBar.style.height = '100%';
		progressBar.style.width = '0%';
		progressBar.style.backgroundColor = 'var(--vscode-progressBar-background)';
		progressBar.style.transition = 'width 0.3s ease';

		progressContainer.appendChild(progressBar);
		parent.appendChild(progressContainer);

		return progressBar;
	}

	private render(): void {
		// Basic navigation controls: Back | Forward | Refresh | Home | Address Bar | Stop | ...
		this.backButton = this.createIconButton(
			Codicon.arrowLeft,
			'Go back',
			() => this.callbacks.onBack()
		);
		this.forwardButton = this.createIconButton(
			Codicon.arrowRight,
			'Go forward',
			() => this.callbacks.onForward()
		);
		this.createIconButton(
			Codicon.refresh,
			'Refresh',
			() => this.callbacks.onRefresh()
		);
		this.createIconButton(
			Codicon.home,
			'Home',
			() => this.callbacks.onHome()
		);

		// URL input
		this.container.appendChild(this.urlInput);

		// Stop button (on right side of address bar)
		this.createIconButton(
			Codicon.chromeClose,
			'Stop loading / Stop dev server',
			() => this.callbacks.onStop()
		);

		// Overflow menu button (if there are optional features)
		const hasOptionalFeatures =
			this.config.showDevTools ||
			this.config.showScreenshot ||
			this.config.showInspect ||
			this.config.showHardReload ||
			this.config.showCopyElement;

		if (hasOptionalFeatures) {
			this.createSeparator();
			this.createOverflowButton();
		}
	}

	private createIconButton(icon: ThemeIcon, tooltip: string, onClick: () => void): HTMLButtonElement {
		const button = document.createElement('button');
		button.className = 'monaco-button monaco-text-button';
		button.title = tooltip;
		button.style.padding = '4px';
		button.style.cursor = 'pointer';
		button.style.border = 'none';
		button.style.backgroundColor = 'transparent';
		button.style.borderRadius = '2px';
		button.style.display = 'flex';
		button.style.alignItems = 'center';
		button.style.justifyContent = 'center';
		button.style.width = '28px';
		button.style.height = '28px';

		// Create icon element using ThemeIcon helper
		const iconElement = document.createElement('span');
		iconElement.className = ThemeIcon.asClassName(icon);
		iconElement.style.fontSize = '16px';
		button.appendChild(iconElement);

		// Hover effect
		button.onmouseenter = () => {
			button.style.backgroundColor = 'var(--vscode-toolbar-hoverBackground)';
		};
		button.onmouseleave = () => {
			button.style.backgroundColor = 'transparent';
		};

		button.onclick = (e) => {
			e.stopPropagation();
			onClick();
		};
		this.container.appendChild(button);
		return button;
	}

	private createSeparator(): void {
		const separator = document.createElement('div');
		separator.style.width = '1px';
		separator.style.height = '20px';
		separator.style.backgroundColor = 'var(--vscode-panel-border)';
		separator.style.margin = '0 4px';
		this.container.appendChild(separator);
	}

	private createOverflowButton(): void {
		const button = document.createElement('button');
		button.className = 'monaco-button monaco-text-button';
		button.title = 'More options';
		button.style.padding = '4px';
		button.style.cursor = 'pointer';
		button.style.border = 'none';
		button.style.backgroundColor = 'transparent';
		button.style.borderRadius = '2px';
		button.style.display = 'flex';
		button.style.alignItems = 'center';
		button.style.justifyContent = 'center';
		button.style.width = '28px';
		button.style.height = '28px';

		// Create icon element using ThemeIcon helper
		const iconElement = document.createElement('span');
		iconElement.className = ThemeIcon.asClassName(Codicon.ellipsis);
		iconElement.style.fontSize = '16px';
		button.appendChild(iconElement);

		// Hover effect
		button.onmouseenter = () => {
			button.style.backgroundColor = 'var(--vscode-toolbar-hoverBackground)';
		};
		button.onmouseleave = () => {
			button.style.backgroundColor = 'transparent';
		};

		button.onclick = (e) => {
			e.stopPropagation();
			this.toggleOverflowMenu();
		};
		this.container.appendChild(button);

		// Create overflow menu (initially hidden)
		this.overflowMenu = this.createOverflowMenu();
		this.container.appendChild(this.overflowMenu);
	}

	private createOverflowMenu(): HTMLElement {
		const menu = document.createElement('div');
		menu.style.position = 'absolute';
		menu.style.top = '100%';
		menu.style.right = '8px';
		menu.style.marginTop = '4px';
		menu.style.backgroundColor = 'var(--vscode-menu-background)';
		menu.style.border = '1px solid var(--vscode-menu-border)';
		menu.style.borderRadius = '4px';
		menu.style.boxShadow = '0 2px 8px var(--vscode-widget-shadow)';
		menu.style.zIndex = '1001';
		menu.style.display = 'none';
		menu.style.minWidth = '200px';

		// Add menu items
		if (this.config.showDevTools && this.callbacks.onDevTools) {
			menu.appendChild(this.createMenuItem('DevTools', Codicon.tools, () => {
				this.callbacks.onDevTools!();
				this.hideOverflowMenu();
			}));
		}

		if (this.config.showHardReload && this.callbacks.onHardReload) {
			menu.appendChild(this.createMenuItem('Hard Reload', Codicon.debugRestart, () => {
				this.callbacks.onHardReload!();
				this.hideOverflowMenu();
			}));
		}

		if (this.config.showInspect && this.callbacks.onInspect) {
			menu.appendChild(this.createMenuItem('Inspect Element', Codicon.target, () => {
				this.callbacks.onInspect!();
				this.hideOverflowMenu();
			}));
		}

		if (this.config.showCopyElement && this.callbacks.onCopyElement) {
			menu.appendChild(this.createMenuItem('Copy Element', Codicon.copy, () => {
				this.callbacks.onCopyElement!();
				this.hideOverflowMenu();
			}));
		}

		if (this.config.showScreenshot && this.callbacks.onScreenshot) {
			menu.appendChild(this.createMenuItem('Screenshot', Codicon.deviceCameraVideo, () => {
				this.callbacks.onScreenshot!();
				this.hideOverflowMenu();
			}));
		}

		return menu;
	}

	private createMenuItem(label: string, icon: ThemeIcon, onClick: () => void): HTMLElement {
		const item = document.createElement('div');
		item.style.display = 'flex';
		item.style.alignItems = 'center';
		item.style.padding = '8px 12px';
		item.style.cursor = 'pointer';
		item.style.gap = '8px';
		item.style.color = 'var(--vscode-menu-foreground)';

		// Icon using ThemeIcon helper
		const iconEl = document.createElement('span');
		iconEl.className = ThemeIcon.asClassName(icon);
		iconEl.style.fontSize = '16px';
		item.appendChild(iconEl);

		// Label
		const labelEl = document.createElement('span');
		labelEl.textContent = label;
		labelEl.style.fontSize = '13px';
		item.appendChild(labelEl);

		// Hover effect
		item.onmouseenter = () => {
			item.style.backgroundColor = 'var(--vscode-menu-selectionBackground)';
			item.style.color = 'var(--vscode-menu-selectionForeground)';
		};
		item.onmouseleave = () => {
			item.style.backgroundColor = 'transparent';
			item.style.color = 'var(--vscode-menu-foreground)';
		};

		item.onclick = onClick;
		return item;
	}

	private toggleOverflowMenu(): void {
		if (this.isOverflowVisible) {
			this.hideOverflowMenu();
		} else {
			this.showOverflowMenu();
		}
	}

	private showOverflowMenu(): void {
		if (this.overflowMenu) {
			this.overflowMenu.style.display = 'block';
			this.isOverflowVisible = true;

			// Close menu when clicking outside
			const closeOnClickOutside = (e: MouseEvent) => {
				if (this.overflowMenu && !this.overflowMenu.contains(e.target as Node)) {
					this.hideOverflowMenu();
					document.removeEventListener('click', closeOnClickOutside);
				}
			};
			setTimeout(() => document.addEventListener('click', closeOnClickOutside), 0);
		}
	}

	private hideOverflowMenu(): void {
		if (this.overflowMenu) {
			this.overflowMenu.style.display = 'none';
			this.isOverflowVisible = false;
		}
	}

	private createUrlInput(): HTMLInputElement {
		const input = document.createElement('input');
		input.type = 'text';
		input.placeholder = 'Enter URL (e.g., http://localhost:3000)';
		input.style.flex = '1';
		input.style.padding = '6px 12px';
		input.style.border = '1px solid var(--vscode-input-border)';
		input.style.backgroundColor = 'var(--vscode-input-background)';
		input.style.color = 'var(--vscode-input-foreground)';
		input.style.borderRadius = '2px';
		input.style.fontSize = '13px';

		// Enter key to navigate (no Go button needed!)
		input.onkeydown = (e) => {
			if (e.key === 'Enter') {
				this.callbacks.onNavigate(input.value);
			}
		};

		return input;
	}

	/**
	 * Get URL input value
	 */
	getUrl(): string {
		return this.urlInput.value;
	}

	/**
	 * Set URL input value
	 */
	setUrl(url: string): void {
		this.urlInput.value = url;
	}

	/**
	 * Focus URL input
	 */
	focus(): void {
		this.urlInput.focus();
	}

	/**
	 * Update navigation button states
	 */
	updateNavigationState(canGoBack: boolean, canGoForward: boolean): void {
		if (this.backButton) {
			this.backButton.disabled = !canGoBack;
			this.backButton.style.opacity = canGoBack ? '1' : '0.5';
			this.backButton.style.cursor = canGoBack ? 'pointer' : 'not-allowed';
		}
		if (this.forwardButton) {
			this.forwardButton.disabled = !canGoForward;
			this.forwardButton.style.opacity = canGoForward ? '1' : '0.5';
			this.forwardButton.style.cursor = canGoForward ? 'pointer' : 'not-allowed';
		}
	}

	/**
	 * Update loading progress (0-100)
	 */
	updateProgress(progress: number): void {
		this.progressBar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
	}

	/**
	 * Show loading state
	 */
	showLoading(): void {
		this.progressBar.style.width = '30%';
	}

	/**
	 * Hide loading state
	 */
	hideLoading(): void {
		this.progressBar.style.width = '100%';
		setTimeout(() => {
			this.progressBar.style.width = '0%';
		}, 300);
	}

	override dispose(): void {
		super.dispose();
		this.container.remove();
	}
}
