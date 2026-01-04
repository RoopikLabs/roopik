/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';

/**
 * Bookmark entry
 */
export interface BrowserBookmark {
	url: string;
	title: string;
	favicon?: string; // Base64 or URL
}

/**
 * Browser Control Bar  Configuration
 */
export interface IBrowserControlBarConfig {
	showDevTools?: boolean;
	showInspectMode?: boolean;
	showStyleInspect?: boolean;
	showScreenshot?: boolean;
	showHardReload?: boolean;
	showCopyUrl?: boolean;
	showBookmarks?: boolean;
	showPendingChanges?: boolean;
}

/**
 * Browser Control Bar Callbacks
 */
export interface IBrowserControlBarCallbacks {
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
	onStylePanelToggle?: () => void;  // Toggle style panel visibility
	onHardReload?: () => void;
	onScreenshot?: () => void;
	onScreenshotClip?: () => void;  // Clip mode (drag-to-select region)
	onCopyUrl?: () => void;

	// Bookmarks
	onBookmarkAdd?: (bookmark: BrowserBookmark) => void;
	onBookmarkRemove?: (url: string) => void;
	onBookmarkClick?: (url: string) => void;
	getBookmarks?: () => BrowserBookmark[];
	isBookmarked?: (url: string) => boolean;

	// Pending Changes
	onPendingChangesClick?: () => void;
}

/**
 * Browser Control Bar
 *
 * Control bar for browser preview with navigation and utility buttons.
 */
export class BrowserControlBar extends Disposable {
	private container: HTMLElement;
	private urlInput: HTMLInputElement;
	private urlInputWrapper: HTMLElement | undefined;
	private progressBar: HTMLElement;
	private loadingAnimation?: number;
	private backButton?: HTMLButtonElement;
	private forwardButton?: HTMLButtonElement;
	private overflowMenu?: HTMLElement;
	private isOverflowVisible: boolean = false;

	// Bookmark UI elements
	private bookmarkStar: HTMLElement | undefined;
	private bookmarkOverlay: HTMLElement | undefined;
	private isBookmarkOverlayVisible: boolean = false;
	private bookmarkHideTimeout: number | undefined;

	// Feature buttons for active state styling
	private inspectModeButton: HTMLButtonElement | undefined;
	private stylePanelButton: HTMLButtonElement | undefined;
	private devToolsButton: HTMLButtonElement | undefined;

	// Pending changes button with badge
	private pendingChangesButton: HTMLButtonElement | undefined;
	private pendingChangesBadge: HTMLElement | undefined;

	constructor(
		parent: HTMLElement,
		private config: IBrowserControlBarConfig,
		private callbacks: IBrowserControlBarCallbacks
	) {
		super();
		this.container = this.createContainer(parent);
		this.progressBar = this.createProgressBar(this.container); // Fix: attach to control bar container, not parent
		this.urlInput = this.createUrlInput();
		this.render();
	}

	private createContainer(parent: HTMLElement): HTMLElement {
		const container = document.createElement('div');
		container.style.display = 'flex';
		container.style.alignItems = 'center';
		container.style.padding = '4px 8px';
		container.style.gap = '4px';
		container.style.border = '1px solid var(--vscode-panel-border)';
		container.style.borderTop = 'none';
		container.style.backgroundColor = 'var(--vscode-sideBar-background)';
		container.style.position = 'relative'; // Required for absolute positioning of progress bar
		container.style.overflow = 'hidden'; // Ensure progress bar doesn't overflow
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
		progressContainer.style.pointerEvents = 'none'; // Prevent interaction with progress bar

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

		// URL input (with bookmark star if enabled)
		if (this.urlInputWrapper) {
			this.container.appendChild(this.urlInputWrapper);
		} else {
			this.container.appendChild(this.urlInput);
		}

		// Create bookmark star AFTER urlInput is assigned and appended
		if (this.config.showBookmarks) {
			this.createBookmarkStar();
		}

		// Stop Dev Server button (placeholder - feature coming later)
		this.createIconButton(Codicon.debugStop, 'Stop Dev Server', () => this.callbacks.onStopDevServer());

		// Separator before action buttons
		this.createSeparator();

		// Inspect Mode button (for element inspection)
		if (this.config.showInspectMode && this.callbacks.onInspectMode) {
			this.inspectModeButton = this.createIconButton(Codicon.inspect, 'Inspect Mode', () => this.callbacks.onInspectMode!());
		}

		// Style Panel toggle button (sidebar icon - toggles CSS panel)
		if (this.config.showStyleInspect && this.callbacks.onStylePanelToggle) {
			this.stylePanelButton = this.createIconButton(Codicon.layoutSidebarRight, 'Toggle Style Panel', () => this.callbacks.onStylePanelToggle!());
		}

		// DevTools button
		if (this.config.showDevTools && this.callbacks.onDevTools) {
			this.devToolsButton = this.createIconButton(Codicon.terminal, 'Toggle DevTools', () => this.callbacks.onDevTools!());
		}

		// Screenshot button (left click = clip, right click = full)
		if (this.config.showScreenshot && this.callbacks.onScreenshot && this.callbacks.onScreenshotClip) {
			this.createDualActionScreenshotButton();
		}

		// Pending Changes button with badge
		if (this.config.showPendingChanges && this.callbacks.onPendingChangesClick) {
			this.createPendingChangesButton();
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

		// Close menu on window resize/move (fixes monitor switching issue)
		window.addEventListener('resize', this.handleWindowChange);
		window.addEventListener('scroll', this.handleWindowChange, true);
	}

	private handleWindowChange = (): void => {
		// Close menu when window moves/resizes to avoid stale positioning
		if (this.isOverflowVisible) {
			this.hideOverflowMenu();
		}
	};

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

			// Show menu to measure dimensions
			this.overflowMenu.style.visibility = 'hidden';
			this.overflowMenu.style.display = 'block';
			const menuHeight = this.overflowMenu.offsetHeight;

			// Position menu with BOTTOM aligned to button's BOTTOM, shifted LEFT to not cover ellipsis
			// This keeps menu visible - not blocked by Windows title bar above
			// Menu's last item is at same level as the control bar icons
			this.overflowMenu.style.top = `${buttonRect.top - menuHeight + buttonRect.height}px`;
			this.overflowMenu.style.right = `${window.innerWidth - buttonRect.left + 4}px`;
			this.overflowMenu.style.visibility = 'visible';
			this.isOverflowVisible = true;

			const closeOnClickOutside = (e: MouseEvent) => {
				if (this.overflowMenu && !this.overflowMenu.contains(e.target as Node)) {
					this.hideOverflowMenu();
					document.removeEventListener('click', closeOnClickOutside);
				}
			};
			setTimeout(() => document.addEventListener('click', closeOnClickOutside), 0);

			// Auto-close after 1.5s when mouse leaves menu
			let autoCloseTimer: ReturnType<typeof setTimeout> | undefined;
			const startAutoClose = () => {
				autoCloseTimer = setTimeout(() => this.hideOverflowMenu(), 1500);
			};
			const cancelAutoClose = () => {
				if (autoCloseTimer) {
					clearTimeout(autoCloseTimer);
					autoCloseTimer = undefined;
				}
			};
			this.overflowMenu.onmouseleave = startAutoClose;
			this.overflowMenu.onmouseenter = cancelAutoClose;
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
		button.style.padding = '2px';
		button.style.cursor = 'pointer';
		button.style.border = 'none';
		button.style.backgroundColor = 'transparent';
		button.style.borderRadius = '2px';
		button.style.display = 'flex';
		button.style.alignItems = 'center';
		button.style.justifyContent = 'center';
		button.style.width = '24px';
		button.style.height = '24px';
		button.style.color = 'var(--vscode-foreground)';

		const iconElement = document.createElement('span');
		iconElement.className = ThemeIcon.asClassName(icon);
		iconElement.style.fontSize = '14px';
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

	/**
	 * Create dual-action screenshot button
	 * Left click = clip mode, Right click = full screenshot
	 */
	private createDualActionScreenshotButton(): void {
		const button = document.createElement('button');
		button.title = 'Click to clip, right click to capture whole screen';
		button.style.padding = '2px';
		button.style.cursor = 'pointer';
		button.style.border = 'none';
		button.style.backgroundColor = 'transparent';
		button.style.borderRadius = '2px';
		button.style.display = 'flex';
		button.style.alignItems = 'center';
		button.style.justifyContent = 'center';
		button.style.width = '24px';
		button.style.height = '24px';
		button.style.color = 'var(--vscode-foreground)';

		const iconElement = document.createElement('span');
		iconElement.className = ThemeIcon.asClassName(Codicon.deviceCamera);
		iconElement.style.fontSize = '14px';
		button.appendChild(iconElement);

		button.onmouseenter = () => {
			button.style.backgroundColor = 'var(--vscode-toolbar-hoverBackground)';
		};
		button.onmouseleave = () => {
			button.style.backgroundColor = 'transparent';
		};

		// Left click = clip mode
		button.onclick = (e) => {
			e.stopPropagation();
			e.preventDefault();
			this.callbacks.onScreenshotClip?.();
		};

		// Right click = full screenshot
		button.oncontextmenu = (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.callbacks.onScreenshot?.();
		};

		this.container.appendChild(button);
	}

	private createSeparator(): void {
		const separator = document.createElement('div');
		separator.style.width = '1px';
		separator.style.height = '16px';
		separator.style.backgroundColor = 'var(--vscode-panel-border)';
		separator.style.margin = '0 2px';
		this.container.appendChild(separator);
	}

	private createUrlInput(): HTMLInputElement {
		// Create wrapper for URL input + bookmark star
		this.urlInputWrapper = document.createElement('div');
		this.urlInputWrapper.style.flex = '1';
		this.urlInputWrapper.style.minWidth = '200px'; // Minimum width to prevent disappearing
		this.urlInputWrapper.style.position = 'relative';
		this.urlInputWrapper.style.display = 'flex';
		this.urlInputWrapper.style.alignItems = 'center';

		const input = document.createElement('input');
		input.type = 'text';
		input.placeholder = 'Enter URL (e.g., http://localhost:3000)';
		input.style.width = '100%';
		input.style.padding = '4px 8px';
		input.style.paddingRight = this.config.showBookmarks ? '28px' : '8px'; // Space for star
		input.style.border = '1px solid var(--vscode-input-border)';
		input.style.backgroundColor = 'var(--vscode-input-background)';
		input.style.color = 'var(--vscode-input-foreground)';
		input.style.borderRadius = '3px';
		input.style.fontSize = '12px';
		input.style.boxSizing = 'border-box';
		input.style.outline = 'none';

		// Focus/blur handlers for visual feedback
		input.onfocus = () => {
			input.style.border = '1px solid var(--vscode-focusBorder)';
			input.style.outline = '1px solid var(--vscode-focusBorder)';
		};
		input.onblur = () => {
			input.style.border = '1px solid var(--vscode-input-border)';
			input.style.outline = 'none';
		};

		input.onkeydown = (e) => {
			if (e.key === 'Enter') {
				let url = input.value.trim();

				// Ctrl+Enter: Auto-append .com (like Chrome/Firefox)
				if (e.ctrlKey && url && !url.includes('.') && !url.includes(':')) {
					// Only add .com if it's a simple word without dots or protocol
					url = `www.${url}.com`;
					input.value = url;
				}

				this.callbacks.onNavigate(url);
			}
		};

		this.urlInputWrapper.appendChild(input);

		// Note: Bookmark star is created AFTER urlInput is assigned
		// See render() method which calls createBookmarkStar() after this returns

		return input;
	}

	/**
	 * Create the bookmark star icon inside the URL input
	 */
	private createBookmarkStar(): void {
		if (!this.urlInputWrapper) {
			return;
		}

		this.bookmarkStar = document.createElement('div');
		this.bookmarkStar.style.position = 'absolute';
		this.bookmarkStar.style.right = '8px';
		this.bookmarkStar.style.top = '50%';
		this.bookmarkStar.style.transform = 'translateY(-50%)';
		this.bookmarkStar.style.cursor = 'pointer';
		this.bookmarkStar.style.display = 'flex';
		this.bookmarkStar.style.alignItems = 'center';
		this.bookmarkStar.style.justifyContent = 'center';
		this.bookmarkStar.style.width = '20px';
		this.bookmarkStar.style.height = '20px';
		this.bookmarkStar.style.borderRadius = '2px';
		this.bookmarkStar.style.color = 'var(--vscode-input-foreground)';
		this.bookmarkStar.style.opacity = '0.6';
		this.bookmarkStar.title = 'Add/remove bookmark';

		const starIcon = document.createElement('span');
		starIcon.className = ThemeIcon.asClassName(Codicon.star);
		starIcon.style.fontSize = '14px';
		this.bookmarkStar.appendChild(starIcon);

		// Hover effect
		this.bookmarkStar.onmouseenter = () => {
			this.bookmarkStar!.style.opacity = '1';
			this.bookmarkStar!.style.backgroundColor = 'var(--vscode-toolbar-hoverBackground)';
			// Show bookmark overlay
			this.showBookmarkOverlay();
		};

		this.bookmarkStar.onmouseleave = () => {
			// Delay hiding to allow moving to overlay
			this.bookmarkHideTimeout = window.setTimeout(() => {
				if (!this.isBookmarkOverlayVisible) {
					this.updateBookmarkStarState();
				}
			}, 100);
		};

		// Click to toggle bookmark
		this.bookmarkStar.onclick = (e) => {
			e.stopPropagation();
			this.toggleBookmark();
		};

		this.urlInputWrapper.appendChild(this.bookmarkStar);
		this.updateBookmarkStarState();
	}

	/**
	 * Update bookmark star appearance based on current URL
	 */
	private updateBookmarkStarState(): void {
		if (!this.bookmarkStar || !this.urlInput) {
			return;
		}

		const url = this.getUrl();
		const isBookmarked = url && this.callbacks.isBookmarked?.(url);
		const starIcon = this.bookmarkStar.querySelector('span');

		if (starIcon) {
			// Use filled star if bookmarked, outline if not
			starIcon.className = ThemeIcon.asClassName(isBookmarked ? Codicon.starFull : Codicon.star);
			this.bookmarkStar.style.color = isBookmarked
				? 'var(--vscode-inputValidation-warningBorder, #cca700)'
				: 'var(--vscode-input-foreground)';
			this.bookmarkStar.style.opacity = isBookmarked ? '1' : '0.6';
			this.bookmarkStar.style.backgroundColor = 'transparent';
		}
	}

	/**
	 * Toggle bookmark for current URL
	 */
	private toggleBookmark(): void {
		const url = this.getUrl();
		if (!url) {
			return;
		}

		const isBookmarked = this.callbacks.isBookmarked?.(url);
		if (isBookmarked) {
			this.callbacks.onBookmarkRemove?.(url);
		} else {
			// Extract title from URL (domain + path)
			let title = url;
			try {
				const urlObj = new URL(url);
				title = urlObj.hostname + (urlObj.pathname !== '/' ? urlObj.pathname : '');
			} catch {
				// Use URL as-is
			}
			this.callbacks.onBookmarkAdd?.({ url, title });
		}

		this.updateBookmarkStarState();
		this.updateBookmarkOverlayContent();
	}

	// Store reference to click outside handler so we can remove it
	private bookmarkClickOutsideHandler: ((e: MouseEvent) => void) | undefined;

	/**
	 * Show the bookmark overlay on hover
	 */
	private showBookmarkOverlay(): void {
		if (this.bookmarkHideTimeout) {
			clearTimeout(this.bookmarkHideTimeout);
			this.bookmarkHideTimeout = undefined;
		}

		if (!this.urlInputWrapper) {
			return;
		}

		// Create overlay if doesn't exist
		if (!this.bookmarkOverlay) {
			this.createBookmarkOverlay();
		}

		// Update theme colors NOW (in case theme changed since overlay was created)
		this.updateBookmarkOverlayThemeColors();

		this.updateBookmarkOverlayContent();
		this.positionBookmarkOverlay();

		if (this.bookmarkOverlay) {
			this.bookmarkOverlay.style.display = 'flex';
			this.isBookmarkOverlayVisible = true;

			// Start auto-hide timer (3 seconds) - will be cancelled if mouse enters overlay
			this.startBookmarkAutoHideTimer();

			// Add click-outside listener to close overlay (like overflow menu does)
			this.bookmarkClickOutsideHandler = (e: MouseEvent) => {
				const target = e.target as Node;
				// Close if click is outside overlay AND outside bookmark star
				if (this.bookmarkOverlay && !this.bookmarkOverlay.contains(target) &&
					this.bookmarkStar && !this.bookmarkStar.contains(target)) {
					this.hideBookmarkOverlay();
				}
			};
			// Use setTimeout to avoid immediate trigger from the current click
			setTimeout(() => {
				if (this.bookmarkClickOutsideHandler) {
					document.addEventListener('click', this.bookmarkClickOutsideHandler);
				}
			}, 0);
		}
	}

	/**
	 * Update bookmark overlay theme colors dynamically
	 * Called when showing overlay to pick up current theme
	 */
	private updateBookmarkOverlayThemeColors(): void {
		if (!this.bookmarkOverlay) {
			return;
		}

		// Read current theme colors from container
		const computedStyle = getComputedStyle(this.container);
		const menuBg = computedStyle.getPropertyValue('--vscode-menu-background').trim() || '#252526';
		const menuBorder = computedStyle.getPropertyValue('--vscode-menu-border').trim() || '#454545';
		const widgetShadow = computedStyle.getPropertyValue('--vscode-widget-shadow').trim() || 'rgba(0, 0, 0, 0.36)';

		// Update overlay container
		this.bookmarkOverlay.style.backgroundColor = menuBg;
		this.bookmarkOverlay.style.border = `1px solid ${menuBorder}`;
		this.bookmarkOverlay.style.boxShadow = `0 2px 8px ${widgetShadow}`;
	}

	/**
	 * Hide the bookmark overlay
	 */
	private hideBookmarkOverlay(): void {
		// Clear any pending hide timeout
		if (this.bookmarkHideTimeout) {
			clearTimeout(this.bookmarkHideTimeout);
			this.bookmarkHideTimeout = undefined;
		}

		if (this.bookmarkOverlay) {
			this.bookmarkOverlay.style.display = 'none';
			this.isBookmarkOverlayVisible = false;
			this.updateBookmarkStarState();
		}

		// Remove click-outside listener
		if (this.bookmarkClickOutsideHandler) {
			document.removeEventListener('click', this.bookmarkClickOutsideHandler);
			this.bookmarkClickOutsideHandler = undefined;
		}
	}

	/**
	 * Start auto-hide timer for bookmark overlay (3 seconds)
	 * Called when overlay is shown and when mouse leaves overlay
	 */
	private startBookmarkAutoHideTimer(): void {
		// Clear any existing timeout first
		if (this.bookmarkHideTimeout) {
			clearTimeout(this.bookmarkHideTimeout);
		}

		// Auto-hide after 3 seconds if mouse is not over the overlay
		this.bookmarkHideTimeout = window.setTimeout(() => {
			this.hideBookmarkOverlay();
		}, 3000);
	}

	/**
	 * Create the translucent bookmark overlay
	 */
	private createBookmarkOverlay(): void {
		this.bookmarkOverlay = document.createElement('div');
		this.bookmarkOverlay.style.position = 'fixed';
		this.bookmarkOverlay.style.display = 'none';
		this.bookmarkOverlay.style.flexDirection = 'row';
		this.bookmarkOverlay.style.alignItems = 'center';
		this.bookmarkOverlay.style.gap = '4px';
		this.bookmarkOverlay.style.padding = '6px 8px';

		// Get theme colors from the container (like overflow menu does)
		const computedStyle = getComputedStyle(this.container);
		const menuBg = computedStyle.getPropertyValue('--vscode-menu-background').trim() || '#252526';
		const menuBorder = computedStyle.getPropertyValue('--vscode-menu-border').trim() || '#454545';
		const widgetShadow = computedStyle.getPropertyValue('--vscode-widget-shadow').trim() || 'rgba(0, 0, 0, 0.36)';

		this.bookmarkOverlay.style.backgroundColor = menuBg;
		this.bookmarkOverlay.style.border = `1px solid ${menuBorder}`;
		this.bookmarkOverlay.style.borderRadius = '4px';
		this.bookmarkOverlay.style.boxShadow = `0 2px 8px ${widgetShadow}`;
		this.bookmarkOverlay.style.zIndex = '10001';
		this.bookmarkOverlay.style.maxWidth = '90%';
		this.bookmarkOverlay.style.overflowX = 'auto';
		this.bookmarkOverlay.style.overflowY = 'hidden';
		this.bookmarkOverlay.style.whiteSpace = 'nowrap';

		// Hide scrollbar but allow scrolling
		this.bookmarkOverlay.style.scrollbarWidth = 'none'; // Firefox
		(this.bookmarkOverlay.style as unknown as Record<string, string>)['-ms-overflow-style'] = 'none'; // IE

		// Mouse events to keep overlay visible while hovering
		this.bookmarkOverlay.onmouseenter = () => {
			// Cancel any pending hide timeout when mouse enters
			if (this.bookmarkHideTimeout) {
				clearTimeout(this.bookmarkHideTimeout);
				this.bookmarkHideTimeout = undefined;
			}
		};

		this.bookmarkOverlay.onmouseleave = () => {
			// Start 3-second auto-hide timer when mouse leaves
			this.startBookmarkAutoHideTimer();
		};

		document.body.appendChild(this.bookmarkOverlay);
	}

	/**
	 * Position the bookmark overlay above the URL input
	 * Similar to overflow menu positioning (above, not covering)
	 */
	private positionBookmarkOverlay(): void {
		if (!this.bookmarkOverlay || !this.urlInputWrapper) {
			return;
		}

		const inputRect = this.urlInputWrapper.getBoundingClientRect();

		// Show overlay to measure its height
		this.bookmarkOverlay.style.visibility = 'hidden';
		this.bookmarkOverlay.style.display = 'flex';
		const overlayHeight = this.bookmarkOverlay.offsetHeight;

		// Position ABOVE the URL input (with 4px gap), aligned left
		this.bookmarkOverlay.style.top = `${inputRect.top - overlayHeight - 4}px`;
		this.bookmarkOverlay.style.left = `${inputRect.left}px`;
		this.bookmarkOverlay.style.maxWidth = `${inputRect.width}px`;
		this.bookmarkOverlay.style.visibility = 'visible';
	}

	/**
	 * Update the content of the bookmark overlay
	 */
	private updateBookmarkOverlayContent(): void {
		if (!this.bookmarkOverlay) {
			return;
		}

		// Clear existing content (use DOM manipulation, not innerHTML due to CSP)
		while (this.bookmarkOverlay.firstChild) {
			this.bookmarkOverlay.removeChild(this.bookmarkOverlay.firstChild);
		}

		// Get theme colors from container (like overflow menu does)
		const computedStyle = getComputedStyle(this.container);
		const menuFg = computedStyle.getPropertyValue('--vscode-menu-foreground').trim() || '#cccccc';

		const bookmarks = this.callbacks.getBookmarks?.() || [];

		if (bookmarks.length === 0) {
			// Show hint when no bookmarks
			const hint = document.createElement('span');
			hint.textContent = '☆ Click star to add bookmark';
			hint.style.color = menuFg;
			hint.style.opacity = '0.7';
			hint.style.fontSize = '12px';
			hint.style.padding = '0 8px';
			this.bookmarkOverlay.appendChild(hint);
		} else {
			// Left scroll button (if needed)
			const leftBtn = this.createScrollButton('left');
			this.bookmarkOverlay.appendChild(leftBtn);

			// Bookmark items container
			const bookmarksContainer = document.createElement('div');
			bookmarksContainer.style.display = 'flex';
			bookmarksContainer.style.flexDirection = 'row';
			bookmarksContainer.style.gap = '4px';
			bookmarksContainer.style.overflowX = 'auto';
			bookmarksContainer.style.flex = '1';
			bookmarksContainer.style.scrollbarWidth = 'none';

			for (const bookmark of bookmarks) {
				const item = this.createBookmarkItem(bookmark);
				bookmarksContainer.appendChild(item);
			}

			this.bookmarkOverlay.appendChild(bookmarksContainer);

			// Right scroll button (if needed)
			const rightBtn = this.createScrollButton('right');
			this.bookmarkOverlay.appendChild(rightBtn);

			// Wire up scroll buttons
			leftBtn.onclick = () => {
				bookmarksContainer.scrollBy({ left: -100, behavior: 'smooth' });
			};
			rightBtn.onclick = () => {
				bookmarksContainer.scrollBy({ left: 100, behavior: 'smooth' });
			};

			// Show/hide scroll buttons based on scroll position
			const updateScrollButtons = () => {
				leftBtn.style.opacity = bookmarksContainer.scrollLeft > 0 ? '1' : '0.3';
				rightBtn.style.opacity =
					bookmarksContainer.scrollLeft < bookmarksContainer.scrollWidth - bookmarksContainer.clientWidth - 1
						? '1' : '0.3';
			};
			bookmarksContainer.onscroll = updateScrollButtons;
			setTimeout(updateScrollButtons, 0);
		}
	}

	/**
	 * Create a scroll button for the bookmark overlay
	 */
	private createScrollButton(direction: 'left' | 'right'): HTMLElement {
		// Get theme colors from container (like overflow menu does)
		const computedStyle = getComputedStyle(this.container);
		const menuFg = computedStyle.getPropertyValue('--vscode-menu-foreground').trim() || '#cccccc';
		const menuSelectionBg = computedStyle.getPropertyValue('--vscode-menu-selectionBackground').trim() || '#04395e';

		const btn = document.createElement('div');
		btn.style.display = 'flex';
		btn.style.alignItems = 'center';
		btn.style.justifyContent = 'center';
		btn.style.width = '20px';
		btn.style.height = '20px';
		btn.style.cursor = 'pointer';
		btn.style.borderRadius = '2px';
		btn.style.flexShrink = '0';
		btn.style.color = menuFg;
		btn.style.opacity = '0.3';

		const icon = document.createElement('span');
		icon.className = ThemeIcon.asClassName(direction === 'left' ? Codicon.chevronLeft : Codicon.chevronRight);
		icon.style.fontSize = '14px';
		btn.appendChild(icon);

		btn.onmouseenter = () => {
			btn.style.backgroundColor = menuSelectionBg;
		};
		btn.onmouseleave = () => {
			btn.style.backgroundColor = 'transparent';
		};

		return btn;
	}

	/**
	 * Create a single bookmark item chip
	 */
	private createBookmarkItem(bookmark: BrowserBookmark): HTMLElement {
		// Get theme colors from container (like overflow menu does)
		const computedStyle = getComputedStyle(this.container);
		const menuFg = computedStyle.getPropertyValue('--vscode-menu-foreground').trim() || '#cccccc';
		const menuSelectionBg = computedStyle.getPropertyValue('--vscode-menu-selectionBackground').trim() || '#04395e';
		const menuSelectionFg = computedStyle.getPropertyValue('--vscode-menu-selectionForeground').trim() || '#ffffff';
		const menuSeparatorBg = computedStyle.getPropertyValue('--vscode-menu-separatorBackground').trim() || '#454545';

		const item = document.createElement('div');
		item.style.display = 'flex';
		item.style.alignItems = 'center';
		item.style.gap = '4px';
		item.style.padding = '4px 8px';
		item.style.backgroundColor = menuSeparatorBg;
		item.style.borderRadius = '4px';
		item.style.cursor = 'pointer';
		item.style.flexShrink = '0';
		item.style.maxWidth = '150px';
		item.style.color = menuFg;
		item.title = bookmark.url;

		// Favicon or default icon
		const icon = document.createElement('span');
		icon.className = ThemeIcon.asClassName(Codicon.globe);
		icon.style.fontSize = '12px';
		icon.style.color = menuFg;
		icon.style.opacity = '0.7';
		item.appendChild(icon);

		// Title (truncated)
		const title = document.createElement('span');
		title.textContent = bookmark.title;
		title.style.fontSize = '11px';
		title.style.color = menuFg;
		title.style.overflow = 'hidden';
		title.style.textOverflow = 'ellipsis';
		title.style.whiteSpace = 'nowrap';
		item.appendChild(title);

		// Hover effect
		item.onmouseenter = () => {
			item.style.backgroundColor = menuSelectionBg;
			item.style.color = menuSelectionFg;
			icon.style.color = menuSelectionFg;
			title.style.color = menuSelectionFg;
		};
		item.onmouseleave = () => {
			item.style.backgroundColor = menuSeparatorBg;
			item.style.color = menuFg;
			icon.style.color = menuFg;
			title.style.color = menuFg;
		};

		// Click to navigate
		item.onclick = (e) => {
			e.stopPropagation();
			this.callbacks.onBookmarkClick?.(bookmark.url);
			this.hideBookmarkOverlay();
		};

		// Right-click to remove
		item.oncontextmenu = (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.callbacks.onBookmarkRemove?.(bookmark.url);
			this.updateBookmarkOverlayContent();
			this.updateBookmarkStarState();
		};

		return item;
	}

	// ============================================
	// Pending Changes Button
	// ============================================

	/**
	 * Create pending changes button with badge
	 */
	private createPendingChangesButton(): void {
		// Container for button + badge
		const wrapper = document.createElement('div');
		wrapper.style.cssText = `
			position: relative;
			display: inline-flex;
		`;

		// Create the button
		this.pendingChangesButton = document.createElement('button');
		this.pendingChangesButton.style.cssText = `
			display: flex;
			align-items: center;
			justify-content: center;
			width: 24px;
			height: 24px;
			padding: 0;
			border: none;
			background: transparent;
			color: var(--vscode-foreground);
			cursor: pointer;
			border-radius: 3px;
		`;
		this.pendingChangesButton.title = 'Pending Changes';

		// Icon
		const icon = document.createElement('span');
		icon.className = ThemeIcon.asClassName(Codicon.diff);
		icon.style.fontSize = '14px';
		this.pendingChangesButton.appendChild(icon);

		// Hover effects
		this.pendingChangesButton.onmouseenter = () => {
			this.pendingChangesButton!.style.backgroundColor = 'var(--vscode-toolbar-hoverBackground)';
		};
		this.pendingChangesButton.onmouseleave = () => {
			this.pendingChangesButton!.style.backgroundColor = 'transparent';
		};

		// Click handler
		this.pendingChangesButton.onclick = () => {
			this.callbacks.onPendingChangesClick?.();
		};

		// Create badge (hidden by default)
		this.pendingChangesBadge = document.createElement('span');
		this.pendingChangesBadge.style.cssText = `
			position: absolute;
			top: -2px;
			right: -2px;
			min-width: 12px;
			height: 12px;
			padding: 0 3px;
			font-size: 9px;
			font-weight: 600;
			line-height: 12px;
			text-align: center;
			border-radius: 6px;
			background: var(--vscode-badge-background, #007acc);
			color: var(--vscode-badge-foreground, #fff);
			display: none;
		`;

		wrapper.appendChild(this.pendingChangesButton);
		wrapper.appendChild(this.pendingChangesBadge);
		this.container.appendChild(wrapper);
	}

	/**
	 * Update pending changes count badge
	 */
	setPendingChangesCount(count: number): void {
		if (!this.pendingChangesBadge) return;

		if (count > 0) {
			this.pendingChangesBadge.textContent = count > 99 ? '99+' : String(count);
			this.pendingChangesBadge.style.display = 'block';
		} else {
			this.pendingChangesBadge.style.display = 'none';
		}
	}

	// ============================================
	// Feature Button Active States
	// ============================================

	/**
	 * Update inspect mode button active state (blue outline when active)
	 */
	setInspectModeActive(active: boolean): void {
		this.updateButtonActiveState(this.inspectModeButton, active);
	}

	/**
	 * Update style panel button active state (blue outline when active)
	 */
	setStylePanelActive(active: boolean): void {
		this.updateButtonActiveState(this.stylePanelButton, active);
	}

	/**
	 * Update devtools button active state (blue outline when active)
	 */
	setDevToolsActive(active: boolean): void {
		this.updateButtonActiveState(this.devToolsButton, active);
	}

	/**
	 * Helper to update button active state with blue outline
	 */
	private updateButtonActiveState(button: HTMLButtonElement | undefined, active: boolean): void {
		if (!button) {
			return;
		}

		if (active) {
			// Active state - blue outline
			button.style.outline = '1px solid var(--vscode-focusBorder, #007acc)';
			button.style.outlineOffset = '-1px';
		} else {
			// Inactive state - no outline
			button.style.outline = 'none';
		}
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
		// Update bookmark star state when URL changes
		this.updateBookmarkStarState();
	}

	focus(): void {
		this.urlInput.focus();
	}

	/**
	 * Focus the URL input (alias for focus())
	 */
	focusUrlInput(): void {
		this.urlInput.focus();
		this.urlInput.select(); // Select all text for easy replacement
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
		// Stop any existing animation FIRST to prevent duplicates
		if (this.loadingAnimation) {
			cancelAnimationFrame(this.loadingAnimation);
			this.loadingAnimation = undefined;
		}

		// Reset progress bar state
		this.progressBar.style.marginLeft = '0';
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
		// Clear bookmark hide timeout
		if (this.bookmarkHideTimeout) {
			clearTimeout(this.bookmarkHideTimeout);
			this.bookmarkHideTimeout = undefined;
		}
		// Remove bookmark click-outside handler
		if (this.bookmarkClickOutsideHandler) {
			document.removeEventListener('click', this.bookmarkClickOutsideHandler);
			this.bookmarkClickOutsideHandler = undefined;
		}
		// Remove overflow menu from body
		if (this.overflowMenu && this.overflowMenu.parentElement) {
			this.overflowMenu.remove();
		}
		// Remove bookmark overlay from body
		if (this.bookmarkOverlay && this.bookmarkOverlay.parentElement) {
			this.bookmarkOverlay.remove();
		}
		// Clean up window event listeners
		window.removeEventListener('resize', this.handleWindowChange);
		window.removeEventListener('scroll', this.handleWindowChange, true);
		super.dispose();
		this.container.remove();
	}
}
