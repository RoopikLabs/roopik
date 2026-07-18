/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { ServiceBridge } from '../serviceBridge.js';

/**
 * Browser Pause Feature
 *
 * Handles the "Browsing Paused" overlay shown when menus/command palette are open.
 *
 * Problem: WebContentsView (native Chromium) renders ON TOP of VSCode's HTML menus.
 * Solution: When menus/command palette open, hide browser and show overlay.
 *
 * This is the same approach used by Cursor IDE.
 */
export class BrowserPause {
	private pausedOverlay: HTMLElement | undefined;
	private isPaused: boolean = false;

	constructor(
		private readonly browserService: ServiceBridge
	) { }

	/**
	 * Check if browser is currently paused
	 */
	get isBrowserPaused(): boolean {
		return this.isPaused;
	}

	/**
	 * Pause browser - hide WebContentsView and show "Browsing Paused" overlay
	 * Called when menus or command palette open
	 */
	pause(browserViewId: number | undefined, browserContainer: HTMLElement | undefined, hasLoadedUrl: boolean): void {
		if (this.isPaused || !browserViewId || !hasLoadedUrl) {
			return;
		}

		this.isPaused = true;

		// Hide the browser WebContentsView
		this.browserService.setBrowserVisible(browserViewId, false);

		// Show the paused overlay
		this.showOverlay(browserContainer);
	}

	/**
	 * Resume browser - show WebContentsView and hide overlay
	 * Called when menus or command palette close
	 */
	resume(browserViewId: number | undefined, hasLoadedUrl: boolean, isVisible: boolean): void {
		if (!this.isPaused || !browserViewId) {
			return;
		}

		this.isPaused = false;

		// Hide the paused overlay
		this.hideOverlay();

		// Show the browser WebContentsView (only if we have a URL loaded)
		if (hasLoadedUrl && isVisible) {
			this.browserService.setBrowserVisible(browserViewId, true);
		}
	}

	/**
	 * Show "Browsing Paused" overlay
	 */
	private showOverlay(browserContainer: HTMLElement | undefined): void {
		if (!browserContainer) {
			return;
		}

		// Create overlay if it doesn't exist
		if (!this.pausedOverlay) {
			this.pausedOverlay = document.createElement('div');
			this.pausedOverlay.style.cssText = `
				position: absolute;
				top: 0;
				left: 0;
				right: 0;
				bottom: 0;
				display: flex;
				flex-direction: column;
				align-items: center;
				justify-content: center;
				background-color: var(--vscode-editor-background);
				color: var(--vscode-descriptionForeground);
				font-family: var(--vscode-font-family);
				font-size: 14px;
				gap: 12px;
				z-index: 100;
			`;

			// Pause icon
			const icon = document.createElement('div');
			icon.style.cssText = `
				font-size: 32px;
				opacity: 0.6;
			`;
			icon.textContent = '⏸';
			this.pausedOverlay.appendChild(icon);

			// Text
			const text = document.createElement('div');
			text.style.cssText = `
				font-size: 14px;
				opacity: 0.8;
			`;
			text.textContent = 'Browsing paused';
			this.pausedOverlay.appendChild(text);

			browserContainer.appendChild(this.pausedOverlay);
		}

		this.pausedOverlay.style.display = 'flex';
	}

	/**
	 * Hide "Browsing Paused" overlay
	 */
	private hideOverlay(): void {
		if (this.pausedOverlay) {
			this.pausedOverlay.style.display = 'none';
		}
	}
}
