/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import type { DevicePreset } from '../../common/projectModeV2/types.js';
import { getDevicePresetsByCategory } from '../../common/projectModeV2/devicePresets.js';

/**
 * Browser Control Bar V2 Configuration
 */
export interface IBrowserControlBarV2Config {
	showDevTools?: boolean;
	showDeviceSelector?: boolean;
	showScreenshot?: boolean;
	showHardReload?: boolean;
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
	onStop: () => void;

	// Features
	onDevTools?: () => void;
	onDeviceSelect?: (device: DevicePreset | undefined) => void;
	onHardReload?: () => void;
	onScreenshot?: () => void;
}

/**
 * Browser Control Bar V2
 *
 * Enhanced control bar with device selector for responsive testing.
 */
export class BrowserControlBarV2 extends Disposable {
	private container: HTMLElement;
	private urlInput: HTMLInputElement;
	private progressBar: HTMLElement;
	private progressContainer?: HTMLElement;
	private loadingAnimation?: number;
	private backButton?: HTMLButtonElement;
	private forwardButton?: HTMLButtonElement;
	private deviceButton?: HTMLButtonElement;
	private deviceMenu?: HTMLElement;
	private isDeviceMenuVisible: boolean = false;
	private _currentDevice: DevicePreset | undefined;
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

		// Store reference to container for indeterminate animation
		this.progressContainer = progressContainer;

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

		// Device selector (if enabled)
		if (this.config.showDeviceSelector) {
			this.createDeviceSelector();
		}

		// Stop button
		this.createIconButton(Codicon.chromeClose, 'Stop loading', () => this.callbacks.onStop());

		// Overflow menu for optional features
		const hasOptionalFeatures = this.config.showDevTools || this.config.showHardReload || this.config.showScreenshot;
		if (hasOptionalFeatures) {
			this.createSeparator();
			this.createOverflowButton();
		}
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

	private createDeviceSelector(): void {
		// Device button with current device indicator
		this.deviceButton = document.createElement('button');
		this.deviceButton.title = 'Device emulation';
		this.deviceButton.style.padding = '4px 8px';
		this.deviceButton.style.cursor = 'pointer';
		this.deviceButton.style.border = '1px solid var(--vscode-input-border)';
		this.deviceButton.style.backgroundColor = 'var(--vscode-input-background)';
		this.deviceButton.style.borderRadius = '2px';
		this.deviceButton.style.display = 'flex';
		this.deviceButton.style.alignItems = 'center';
		this.deviceButton.style.gap = '4px';
		this.deviceButton.style.color = 'var(--vscode-foreground)';
		this.deviceButton.style.fontSize = '12px';
		this.deviceButton.style.minWidth = '100px';

		// Device icon
		const iconElement = document.createElement('span');
		iconElement.className = ThemeIcon.asClassName(Codicon.deviceMobile);
		iconElement.style.fontSize = '14px';
		this.deviceButton.appendChild(iconElement);

		// Device name
		const nameElement = document.createElement('span');
		nameElement.textContent = 'Responsive';
		nameElement.style.flex = '1';
		nameElement.style.textAlign = 'left';
		this.deviceButton.appendChild(nameElement);

		// Dropdown arrow
		const arrowElement = document.createElement('span');
		arrowElement.className = ThemeIcon.asClassName(Codicon.chevronDown);
		arrowElement.style.fontSize = '12px';
		this.deviceButton.appendChild(arrowElement);

		this.deviceButton.onclick = (e) => {
			e.stopPropagation();
			this.toggleDeviceMenu();
		};

		this.container.appendChild(this.deviceButton);

		// Create device menu
		this.deviceMenu = this.createDeviceMenu();
		this.container.appendChild(this.deviceMenu);
	}

	private createDeviceMenu(): HTMLElement {
		const menu = document.createElement('div');
		menu.style.position = 'absolute';
		menu.style.top = '100%';
		menu.style.left = '50%';
		menu.style.transform = 'translateX(-50%)';
		menu.style.marginTop = '4px';
		menu.style.backgroundColor = 'var(--vscode-menu-background)';
		menu.style.border = '1px solid var(--vscode-menu-border)';
		menu.style.borderRadius = '4px';
		menu.style.boxShadow = '0 2px 8px var(--vscode-widget-shadow)';
		menu.style.zIndex = '1001';
		menu.style.display = 'none';
		menu.style.minWidth = '220px';
		menu.style.maxHeight = '400px';
		menu.style.overflowY = 'auto';

		// "Responsive" option (no emulation)
		menu.appendChild(this.createDeviceMenuItem('Responsive', Codicon.screenNormal, () => {
			this._currentDevice = undefined;
			this.updateDeviceButtonLabel('Responsive');
			this.callbacks.onDeviceSelect?.(undefined);
			this.hideDeviceMenu();
			console.log('[BrowserControlBarV2] Device cleared:', this._currentDevice);
		}));

		// Add separator
		const separator = document.createElement('div');
		separator.style.height = '1px';
		separator.style.backgroundColor = 'var(--vscode-menu-separatorBackground)';
		separator.style.margin = '4px 0';
		menu.appendChild(separator);

		// Add devices by category
		const categories = getDevicePresetsByCategory();
		for (const [category, devices] of Object.entries(categories)) {
			// Category header
			const header = document.createElement('div');
			header.style.padding = '4px 12px';
			header.style.fontSize = '11px';
			header.style.fontWeight = 'bold';
			header.style.color = 'var(--vscode-descriptionForeground)';
			header.style.textTransform = 'uppercase';
			header.textContent = category;
			menu.appendChild(header);

			// Devices in category
			for (const device of devices) {
				const icon = device.mobile ? Codicon.deviceMobile : Codicon.screenNormal;
				menu.appendChild(this.createDeviceMenuItem(
					`${device.name} (${device.width}×${device.height})`,
					icon,
					() => {
						this._currentDevice = device;
						this.updateDeviceButtonLabel(device.name);
						this.callbacks.onDeviceSelect?.(device);
						this.hideDeviceMenu();
					}
				));
			}
		}

		return menu;
	}

	private createDeviceMenuItem(label: string, icon: ThemeIcon, onClick: () => void): HTMLElement {
		const item = document.createElement('div');
		item.style.display = 'flex';
		item.style.alignItems = 'center';
		item.style.padding = '6px 12px';
		item.style.cursor = 'pointer';
		item.style.gap = '8px';
		item.style.color = 'var(--vscode-menu-foreground)';
		item.style.fontSize = '13px';

		const iconEl = document.createElement('span');
		iconEl.className = ThemeIcon.asClassName(icon);
		iconEl.style.fontSize = '14px';
		item.appendChild(iconEl);

		const labelEl = document.createElement('span');
		labelEl.textContent = label;
		item.appendChild(labelEl);

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

	private updateDeviceButtonLabel(name: string): void {
		if (this.deviceButton) {
			const nameElement = this.deviceButton.querySelector('span:nth-child(2)') as HTMLElement;
			if (nameElement) {
				nameElement.textContent = name.length > 12 ? name.substring(0, 12) + '...' : name;
			}
		}
	}

	private toggleDeviceMenu(): void {
		if (this.isDeviceMenuVisible) {
			this.hideDeviceMenu();
		} else {
			this.showDeviceMenu();
		}
	}

	private showDeviceMenu(): void {
		if (this.deviceMenu) {
			this.deviceMenu.style.display = 'block';
			this.isDeviceMenuVisible = true;

			const closeOnClickOutside = (e: MouseEvent) => {
				if (this.deviceMenu && !this.deviceMenu.contains(e.target as Node) &&
					this.deviceButton && !this.deviceButton.contains(e.target as Node)) {
					this.hideDeviceMenu();
					document.removeEventListener('click', closeOnClickOutside);
				}
			};
			setTimeout(() => document.addEventListener('click', closeOnClickOutside), 0);
		}
	}

	private hideDeviceMenu(): void {
		if (this.deviceMenu) {
			this.deviceMenu.style.display = 'none';
			this.isDeviceMenuVisible = false;
		}
	}

	private createOverflowButton(): void {
		this.createIconButton(Codicon.ellipsis, 'More options', () => this.toggleOverflowMenu());

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
		menu.style.minWidth = '180px';

		if (this.config.showDevTools && this.callbacks.onDevTools) {
			menu.appendChild(this.createMenuItem('Toggle DevTools', Codicon.terminal, () => {
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

		if (this.config.showScreenshot && this.callbacks.onScreenshot) {
			menu.appendChild(this.createMenuItem('Take Screenshot', Codicon.deviceCamera, () => {
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

		const iconEl = document.createElement('span');
		iconEl.className = ThemeIcon.asClassName(icon);
		iconEl.style.fontSize = '16px';
		item.appendChild(iconEl);

		const labelEl = document.createElement('span');
		labelEl.textContent = label;
		labelEl.style.fontSize = '13px';
		item.appendChild(labelEl);

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

	override dispose(): void {
		// Stop any loading animation
		if (this.loadingAnimation) {
			cancelAnimationFrame(this.loadingAnimation);
			this.loadingAnimation = undefined;
		}
		super.dispose();
		this.container.remove();
	}
}
