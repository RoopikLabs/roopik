/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { INotificationService, Severity } from '../../../../../../platform/notification/common/notification.js';
import type { IDevServerService, DevServerInfo } from '../../../common/projectMode/devServer.js';

/**
 * Callbacks for DefaultBrowserScreen actions
 */
export interface DefaultBrowserScreenCallbacks {
	onOpenProject: () => void;
	onBrowseWeb: () => void;
	onNavigate: (url: string) => Promise<void>;
	onServerStopped: (projectRoot: string) => void;
}

/**
 * Default Browser Screen
 *
 * Shows when no URL is loaded in the browser preview.
 * Displays:
 * - Welcome message with icon
 * - "Open Project" and "Browse Web" buttons
 * - Running server tile (if any dev server is active)
 *
 * This is a modular component that can be developed independently.
 */
export class DefaultBrowserScreen {
	private element: HTMLElement | undefined;
	private runningServerTile: HTMLElement | undefined;

	constructor(
		private readonly container: HTMLElement,
		private readonly callbacks: DefaultBrowserScreenCallbacks,
		private readonly devServerService: IDevServerService,
		private readonly notificationService: INotificationService
	) {
		this.create();
	}

	/**
	 * Create the default screen UI
	 */
	private create(): void {
		this.element = document.createElement('div');
		this.element.className = 'roopik-default-browser-screen';
		this.element.style.cssText = `
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
			gap: 24px;
			z-index: 1;
		`;

		// Icon
		const icon = document.createElement('div');
		icon.style.cssText = `
			font-size: 48px;
			opacity: 0.5;
		`;
		icon.textContent = '🌐';
		this.element.appendChild(icon);

		// Title
		const title = document.createElement('div');
		title.className = 'default-screen-title';
		title.style.cssText = `
			font-size: 18px;
			font-weight: 500;
			color: var(--vscode-foreground);
		`;
		title.textContent = 'Browser Preview';
		this.element.appendChild(title);

		// Description
		const description = document.createElement('div');
		description.className = 'default-screen-description';
		description.style.cssText = `
			opacity: 0.7;
			text-align: center;
			max-width: 400px;
			margin-bottom: 8px;
		`;
		description.textContent = 'Preview your project or browse the web';
		this.element.appendChild(description);

		// Buttons container
		const buttonsContainer = document.createElement('div');
		buttonsContainer.style.cssText = `
			display: flex;
			gap: 12px;
			flex-wrap: wrap;
			justify-content: center;
		`;

		// Open Project button
		const openProjectBtn = this.createButton({
			text: 'Open Project',
			icon: '📁',
			primary: true,
			title: 'Select a project folder to preview with live reload',
			onClick: () => this.callbacks.onOpenProject()
		});
		buttonsContainer.appendChild(openProjectBtn);

		// Browse Web button
		const browseBtn = this.createButton({
			text: 'Browse Web',
			icon: '🔍',
			primary: false,
			title: 'Enter a URL in the address bar to start browsing',
			onClick: () => this.callbacks.onBrowseWeb()
		});
		buttonsContainer.appendChild(browseBtn);

		this.element.appendChild(buttonsContainer);

		// Running server tile (initially hidden)
		this.runningServerTile = document.createElement('div');
		this.runningServerTile.className = 'running-server-tile';
		this.runningServerTile.style.cssText = `
			display: none;
			margin-top: 24px;
			padding: 16px 20px;
			background: var(--vscode-editor-inactiveSelectionBackground, rgba(255, 255, 255, 0.05));
			border: 1px solid var(--vscode-panel-border, rgba(255, 255, 255, 0.1));
			border-radius: 8px;
			cursor: pointer;
			transition: all 0.2s ease;
			max-width: 400px;
			width: 100%;
			position: relative;
		`;
		this.runningServerTile.title = 'Click to open running project';
		this.element.appendChild(this.runningServerTile);

		// Hint text
		const hint = document.createElement('div');
		hint.style.cssText = `
			opacity: 0.5;
			font-size: 12px;
			margin-top: 16px;
		`;
		hint.textContent = 'Tip: You can also enter a URL directly in the address bar above';
		this.element.appendChild(hint);

		this.container.appendChild(this.element);
	}

	/**
	 * Create a styled button
	 */
	private createButton(options: {
		text: string;
		icon: string;
		primary: boolean;
		title: string;
		onClick: () => void;
	}): HTMLButtonElement {
		const btn = document.createElement('button');

		if (options.primary) {
			btn.style.cssText = `
				padding: 10px 20px;
				border: none;
				border-radius: 4px;
				background: var(--vscode-button-background);
				color: var(--vscode-button-foreground);
				font-size: 13px;
				font-weight: 500;
				cursor: pointer;
				display: flex;
				align-items: center;
				gap: 8px;
				transition: background 0.2s;
			`;
		} else {
			btn.style.cssText = `
				padding: 10px 20px;
				border: 1px solid var(--vscode-button-secondaryBackground, var(--vscode-input-border));
				border-radius: 4px;
				background: transparent;
				color: var(--vscode-foreground);
				font-size: 13px;
				font-weight: 500;
				cursor: pointer;
				display: flex;
				align-items: center;
				gap: 8px;
				transition: background 0.2s;
			`;
		}

		const iconSpan = document.createElement('span');
		iconSpan.style.fontSize = '16px';
		iconSpan.textContent = options.icon;
		btn.appendChild(iconSpan);
		btn.appendChild(document.createTextNode(` ${options.text}`));
		btn.title = options.title;

		btn.addEventListener('click', options.onClick);
		btn.addEventListener('mouseenter', () => {
			btn.style.background = options.primary
				? 'var(--vscode-button-hoverBackground)'
				: 'var(--vscode-list-hoverBackground)';
		});
		btn.addEventListener('mouseleave', () => {
			btn.style.background = options.primary
				? 'var(--vscode-button-background)'
				: 'transparent';
		});

		return btn;
	}

	/**
	 * Show the default screen
	 * Resets to normal state (clears any error messages)
	 */
	public show(): void {
		if (this.element) {
			this.element.style.display = 'flex';
		}
		// Reset to normal state (clear any error that might be displayed)
		this.resetToNormal();
		// Check for running server on-demand
		this.checkAndShowRunningServerTile();
	}

	/**
	 * Reset to normal state (clear error messages)
	 * Called by show() and can be called directly if needed
	 */
	private resetToNormal(): void {
		if (!this.element) {
			return;
		}

		const title = this.element.querySelector('.default-screen-title') as HTMLElement;
		const description = this.element.querySelector('.default-screen-description') as HTMLElement;

		if (title) {
			title.textContent = 'Browser Preview';
		}
		if (description) {
			description.textContent = 'Preview your project or browse the web';
		}
	}

	/**
	 * Hide the default screen
	 */
	public hide(): void {
		if (this.element) {
			this.element.style.display = 'none';
		}
	}

	/**
	 * Check if visible
	 */
	public isVisible(): boolean {
		return this.element?.style.display !== 'none';
	}

	/**
	 * Check for running dev server and update the tile
	 * Called on-demand when screen is shown (not event-based)
	 */
	private async checkAndShowRunningServerTile(): Promise<void> {
		if (!this.runningServerTile) {
			return;
		}

		try {
			const serverInfo = await this.devServerService.getRunningServer();

			if (!serverInfo || !serverInfo.url) {
				// No server running - hide tile
				this.runningServerTile.style.display = 'none';
				return;
			}

			// Server is running - show tile with info
			this.renderRunningServerTile(serverInfo);

		} catch (error) {
			// Error checking server - hide tile silently
			this.runningServerTile.style.display = 'none';
			console.warn('[DefaultBrowserScreen] Failed to check running server:', error);
		}
	}

	/**
	 * Render the running server tile with server info
	 * Uses DOM APIs instead of innerHTML to comply with TrustedHTML CSP
	 */
	private renderRunningServerTile(serverInfo: DevServerInfo): void {
		if (!this.runningServerTile) {
			return;
		}

		const projectName = serverInfo.projectRoot.split(/[/\\]/).pop() || 'Project';

		// Clear existing content using DOM API
		while (this.runningServerTile.firstChild) {
			this.runningServerTile.removeChild(this.runningServerTile.firstChild);
		}

		// Build tile content using DOM APIs (CSP compliant)
		const container = document.createElement('div');
		container.style.cssText = 'display: flex; align-items: center; gap: 12px;';

		// Green status indicator
		const indicator = document.createElement('div');
		indicator.style.cssText = `
			width: 10px;
			height: 10px;
			background: #22c55e;
			border-radius: 50%;
			box-shadow: 0 0 8px rgba(34, 197, 94, 0.5);
			flex-shrink: 0;
		`;
		container.appendChild(indicator);

		// Info section
		const infoSection = document.createElement('div');
		infoSection.style.cssText = 'flex: 1; min-width: 0;';

		// Project name
		const nameDiv = document.createElement('div');
		nameDiv.style.cssText = `
			font-weight: 500;
			color: var(--vscode-foreground);
			font-size: 13px;
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		`;
		nameDiv.textContent = projectName;
		infoSection.appendChild(nameDiv);

		// Framework and URL
		const detailsDiv = document.createElement('div');
		detailsDiv.style.cssText = 'font-size: 11px; opacity: 0.7; margin-top: 2px;';
		detailsDiv.textContent = `${serverInfo.frameworkDisplayName || 'Dev Server'} • ${serverInfo.url}`;
		infoSection.appendChild(detailsDiv);

		container.appendChild(infoSection);

		// Close button
		const closeBtn = document.createElement('div');
		closeBtn.className = 'running-server-close';
		closeBtn.style.cssText = `
			padding: 4px 8px;
			border-radius: 4px;
			font-size: 11px;
			opacity: 0.6;
			transition: all 0.2s;
		`;
		closeBtn.title = 'Stop server';
		closeBtn.textContent = '✕';
		container.appendChild(closeBtn);

		this.runningServerTile.appendChild(container);
		this.runningServerTile.style.display = 'block';

		// Store project root for handlers
		const storedProjectRoot = serverInfo.projectRoot;

		// Click handler - open the running server
		this.runningServerTile.onclick = async (e) => {
			const target = e.target as HTMLElement;

			// Check if clicked on close button
			if (target.classList.contains('running-server-close')) {
				e.stopPropagation();
				await this.stopServerFromTile(storedProjectRoot);
				return;
			}

			// Double-check server is still running before navigating
			const freshInfo = await this.devServerService.getRunningServer();
			if (freshInfo && freshInfo.url) {
				// Server still running - navigate to it
				this.callbacks.onServerStopped(freshInfo.projectRoot); // Update editor state
				await this.callbacks.onNavigate(freshInfo.url);
			} else {
				// Server is gone (stale tile) - clear it
				this.runningServerTile!.style.display = 'none';
				this.notificationService.notify({
					severity: Severity.Info,
					message: 'Server is no longer running',
					sticky: false
				});
			}
		};

		// Hover effects
		this.runningServerTile.onmouseenter = () => {
			this.runningServerTile!.style.background = 'var(--vscode-list-hoverBackground)';
			this.runningServerTile!.style.borderColor = 'var(--vscode-focusBorder)';
		};
		this.runningServerTile.onmouseleave = () => {
			this.runningServerTile!.style.background = 'var(--vscode-editor-inactiveSelectionBackground, rgba(255, 255, 255, 0.05))';
			this.runningServerTile!.style.borderColor = 'var(--vscode-panel-border, rgba(255, 255, 255, 0.1))';
		};
	}

	/**
	 * Stop server from the tile
	 */
	private async stopServerFromTile(projectRoot: string): Promise<void> {
		try {
			await this.devServerService.stopServer(projectRoot);

			// Notify editor to update its state
			this.callbacks.onServerStopped(projectRoot);

			// Hide the tile
			if (this.runningServerTile) {
				this.runningServerTile.style.display = 'none';
			}

			this.notificationService.notify({
				severity: Severity.Info,
				message: 'Dev server stopped',
				sticky: false
			});
		} catch (error) {
			console.error('[DefaultBrowserScreen] Failed to stop server:', error);
		}
	}

	/**
	 * Escape HTML to prevent XSS
	 */
	// private escapeHtml(text: string): string {
	// 	const div = document.createElement('div');
	// 	div.textContent = text;
	// 	return div.innerHTML;
	// }

	/**
	 * Show error message temporarily
	 * Used for navigation failures
	 */
	public showError(message: string): void {
		if (!this.element) {
			return;
		}

		const title = this.element.querySelector('.default-screen-title') as HTMLElement;
		const description = this.element.querySelector('.default-screen-description') as HTMLElement;

		if (!title || !description) {
			return;
		}

		// Store original values
		const originalTitle = title.textContent;
		const originalDescription = description.textContent;

		// Show error
		title.textContent = 'Navigation Failed';
		description.textContent = message;

		// Reset to normal state after 3 seconds
		setTimeout(() => {
			if (title && description) {
				title.textContent = originalTitle;
				description.textContent = originalDescription;
			}
		}, 3000);
	}

	/**
	 * Dispose and cleanup
	 */
	public dispose(): void {
		if (this.element && this.element.parentNode) {
			this.element.parentNode.removeChild(this.element);
		}
		this.element = undefined;
		this.runningServerTile = undefined;
	}
}
