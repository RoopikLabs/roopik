/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';

/**
 * Browser Control Bar V2 Configuration
 */
export interface IBrowserControlBarV2Config {
	showDevTools?: boolean;
	showInspectMode?: boolean;
	showScreenshot?: boolean;
	showHardReload?: boolean;
	showCopyUrl?: boolean;
}

/**
 * Browser Control Bar V2 Callbacks
 */
export interface IBrowserControlBarV2Callbacks {
	// Basic navigation
	onNavigate: (url: string) => void;
	onBack: () => void;
	onForward: () => void;
	onHome: () => void;
	onRefresh: () => void;
	onStopDevServer: () => void; // Placeholder for future dev server stop feature

	// Features
	onDevTools?: () => void;
	onInspectMode?: () => void;
	onHardReload?: () => void;
	onScreenshot?: () => void;
	onCopyUrl?: () => void;
}

/**
 * Browser Control Bar V2
 *
 * Control bar for browser preview with navigation and utility buttons.
 */
export class BrowserControlBarV2 extends Disposable {
	private container: HTMLElement;
	private urlInput: HTMLInputElement;
	private progressBar: HTMLElement;
	private loadingAnimation?: number;
	private backButton?: HTMLButtonElement;
	private forwardButton?: HTMLButtonElement;
	private overflowMenu?: HTMLElement;
	private isOverflowVisible: boolean = false;

	constructor(
		parent: HTMLElement,
		private config: IBrowserControlBarV2Config,
		private callbacks: IBrowserControlBarV2Callbacks
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
		container.style.position = 'relative';
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
		// Navigation: Back | Forward | Refresh | Home
		this.backButton = this.createIconButton(Codicon.arrowLeft, 'Go back', () => this.callbacks.onBack());
		this.forwardButton = this.createIconButton(Codicon.arrowRight, 'Go forward', () => this.callbacks.onForward());
		this.createIconButton(Codicon.refresh, 'Refresh', () => this.callbacks.onRefresh());
		this.createIconButton(Codicon.home, 'Home', () => this.callbacks.onHome());

		// URL input
		this.container.appendChild(this.urlInput);

		// Stop Dev Server button (placeholder - feature coming later)
		this.createIconButton(Codicon.debugStop, 'Stop Dev Server', () => this.callbacks.onStopDevServer());

		// Separator before action buttons
		this.createSeparator();

		// Inspect Mode button (for element inspection)
		if (this.config.showInspectMode && this.callbacks.onInspectMode) {
			this.createIconButton(Codicon.inspect, 'Inspect Mode', () => this.callbacks.onInspectMode!());
		}

		// DevTools button
		if (this.config.showDevTools && this.callbacks.onDevTools) {
			this.createIconButton(Codicon.terminal, 'Toggle DevTools', () => this.callbacks.onDevTools!());
		}

		// Screenshot button
		if (this.config.showScreenshot && this.callbacks.onScreenshot) {
			this.createIconButton(Codicon.deviceCamera, 'Take Screenshot', () => this.callbacks.onScreenshot!());
		}

		// Overflow menu for Hard Reload and Copy URL
		if (this.config.showHardReload || this.config.showCopyUrl) {
			this.createOverflowButton();
		}
	}

	private ellipsisButton?: HTMLButtonElement;

	private createOverflowButton(): void {
		// Create the ellipsis button (appended to container by createIconButton)
		this.ellipsisButton = this.createIconButton(Codicon.ellipsis, 'More options', () => this.toggleOverflowMenu());

		// Create and append the dropdown menu to document body (fixed positioning)
		this.overflowMenu = this.createOverflowMenu();
		document.body.appendChild(this.overflowMenu);
	}

	private createOverflowMenu(): HTMLElement {
		const menu = document.createElement('div');
		// Use FIXED positioning to escape any overflow:hidden containers
		menu.style.position = 'fixed';

		// Get theme colors from the container (which has VSCode theming applied)
		const computedStyle = getComputedStyle(this.container);
		const menuBg = computedStyle.getPropertyValue('--vscode-menu-background').trim() || '#252526';
		const menuBorder = computedStyle.getPropertyValue('--vscode-menu-border').trim() || '#454545';
		const widgetShadow = computedStyle.getPropertyValue('--vscode-widget-shadow').trim() || 'rgba(0, 0, 0, 0.36)';

		menu.style.backgroundColor = menuBg;
		menu.style.border = `1px solid ${menuBorder}`;
		menu.style.borderRadius = '4px';
		menu.style.boxShadow = `0 2px 8px ${widgetShadow}`;
		menu.style.zIndex = '10000';
		menu.style.display = 'none';
		menu.style.minWidth = '180px';

		// Hard Reload option
		if (this.config.showHardReload && this.callbacks.onHardReload) {
			menu.appendChild(this.createMenuItem('Hard Reload', Codicon.debugRestart, () => {
				this.callbacks.onHardReload!();
				this.hideOverflowMenu();
			}));
		}

		// Copy URL option (useful for agents to grab current URL programmatically)
		if (this.config.showCopyUrl && this.callbacks.onCopyUrl) {
			menu.appendChild(this.createMenuItem('Copy URL', Codicon.link, () => {
				this.callbacks.onCopyUrl!();
				this.hideOverflowMenu();
			}));
		}

		return menu;
	}

	private createMenuItem(label: string, icon: ThemeIcon, onClick: () => void): HTMLElement {
		// Get theme colors from container
		const computedStyle = getComputedStyle(this.container);
		const menuFg = computedStyle.getPropertyValue('--vscode-menu-foreground').trim() || '#cccccc';
		const menuSelectionBg = computedStyle.getPropertyValue('--vscode-menu-selectionBackground').trim() || '#04395e';
		const menuSelectionFg = computedStyle.getPropertyValue('--vscode-menu-selectionForeground').trim() || '#ffffff';

		const item = document.createElement('div');
		item.style.display = 'flex';
		item.style.alignItems = 'center';
		item.style.padding = '8px 12px';
		item.style.cursor = 'pointer';
		item.style.gap = '8px';
		item.style.color = menuFg;

		const iconEl = document.createElement('span');
		iconEl.className = ThemeIcon.asClassName(icon);
		iconEl.style.fontSize = '16px';
		item.appendChild(iconEl);

		const labelEl = document.createElement('span');
		labelEl.textContent = label;
		labelEl.style.fontSize = '13px';
		item.appendChild(labelEl);

		item.onmouseenter = () => {
			item.style.backgroundColor = menuSelectionBg;
			item.style.color = menuSelectionFg;
		};
		item.onmouseleave = () => {
			item.style.backgroundColor = 'transparent';
			item.style.color = menuFg;
		};

		item.onclick = (e) => {
			e.stopPropagation();
			onClick();
		};
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
		if (this.overflowMenu && this.ellipsisButton) {
			// Update theme colors NOW (in case theme changed since menu was created)
			this.updateMenuThemeColors();

			// Calculate position based on ellipsis button location
			const buttonRect = this.ellipsisButton.getBoundingClientRect();

			// First show menu to measure its height
			this.overflowMenu.style.visibility = 'hidden';
			this.overflowMenu.style.display = 'block';
			const menuHeight = this.overflowMenu.offsetHeight;

			// Position menu ABOVE the button, aligned to right edge
			this.overflowMenu.style.top = `${buttonRect.top - menuHeight - 4}px`;
			this.overflowMenu.style.right = `${window.innerWidth - buttonRect.right}px`;
			this.overflowMenu.style.visibility = 'visible';
			this.isOverflowVisible = true;

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

	/**
	 * Update menu theme colors dynamically
	 * Called when showing menu to pick up current theme
	 */
	private updateMenuThemeColors(): void {
		if (!this.overflowMenu) {
			return;
		}

		// Read current theme colors from container
		const computedStyle = getComputedStyle(this.container);
		const menuBg = computedStyle.getPropertyValue('--vscode-menu-background').trim() || '#252526';
		const menuBorder = computedStyle.getPropertyValue('--vscode-menu-border').trim() || '#454545';
		const widgetShadow = computedStyle.getPropertyValue('--vscode-widget-shadow').trim() || 'rgba(0, 0, 0, 0.36)';
		const menuFg = computedStyle.getPropertyValue('--vscode-menu-foreground').trim() || '#cccccc';

		// Update menu container
		this.overflowMenu.style.backgroundColor = menuBg;
		this.overflowMenu.style.border = `1px solid ${menuBorder}`;
		this.overflowMenu.style.boxShadow = `0 2px 8px ${widgetShadow}`;

		// Update all menu items
		const items = this.overflowMenu.querySelectorAll('div');
		items.forEach(item => {
			item.style.color = menuFg;
		});
	}

	private createIconButton(icon: ThemeIcon, tooltip: string, onClick: () => void): HTMLButtonElement {
		const button = document.createElement('button');
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
		button.style.color = 'var(--vscode-foreground)';

		const iconElement = document.createElement('span');
		iconElement.className = ThemeIcon.asClassName(icon);
		iconElement.style.fontSize = '16px';
		button.appendChild(iconElement);

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

		input.onkeydown = (e) => {
			if (e.key === 'Enter') {
				this.callbacks.onNavigate(input.value);
			}
		};

		return input;
	}

	// Public API

	getUrl(): string {
		return this.urlInput.value;
	}

	setUrl(url: string): void {
		// Show empty input with placeholder for blank URLs
		// This shows the hint "Enter URL (e.g., http://localhost:3000)" instead of "about:blank"
		if (!url || url === 'about:blank') {
			this.urlInput.value = '';
		} else {
			this.urlInput.value = url;
		}
	}

	focus(): void {
		this.urlInput.focus();
	}

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

	updateProgress(progress: number): void {
		this.progressBar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
	}

	showLoading(): void {
		// Stop any existing animation
		if (this.loadingAnimation) {
			cancelAnimationFrame(this.loadingAnimation);
			this.loadingAnimation = undefined;
		}

		// Use indeterminate animation (like Chrome's loading bar)
		this.progressBar.style.transition = 'none';
		this.progressBar.style.width = '30%';

		let position = 0;
		let width = 30;
		let growing = true;

		const animate = () => {
			// Animate position and width
			if (growing) {
				position += 0.5;
				width = Math.min(50, width + 0.2);
				if (position > 50) {
					growing = false;
				}
			} else {
				position += 0.8;
				width = Math.max(20, width - 0.3);
				if (position > 100) {
					position = -30;
					width = 30;
					growing = true;
				}
			}

			this.progressBar.style.marginLeft = `${position}%`;
			this.progressBar.style.width = `${width}%`;

			this.loadingAnimation = requestAnimationFrame(animate);
		};

		this.loadingAnimation = requestAnimationFrame(animate);
	}

	hideLoading(): void {
		// Stop animation
		if (this.loadingAnimation) {
			cancelAnimationFrame(this.loadingAnimation);
			this.loadingAnimation = undefined;
		}

		// Reset margin and animate to 100%
		this.progressBar.style.marginLeft = '0';
		this.progressBar.style.transition = 'width 0.3s ease';
		this.progressBar.style.width = '100%';

		setTimeout(() => {
			this.progressBar.style.transition = 'none';
			this.progressBar.style.width = '0%';
		}, 300);
	}

	/**
	 * Disable the entire control bar (used when max browser limit is reached)
	 */
	setDisabled(disabled: boolean): void {
		this.container.style.opacity = disabled ? '0.5' : '1';
		this.container.style.pointerEvents = disabled ? 'none' : 'auto';
		this.urlInput.disabled = disabled;
	}

	override dispose(): void {
		// Stop any loading animation
		if (this.loadingAnimation) {
			cancelAnimationFrame(this.loadingAnimation);
			this.loadingAnimation = undefined;
		}
		// Remove overflow menu from body
		if (this.overflowMenu && this.overflowMenu.parentElement) {
			this.overflowMenu.remove();
		}
		super.dispose();
		this.container.remove();
	}
}
