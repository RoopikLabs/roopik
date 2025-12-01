/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * EditorFullscreen - Editor-contained fullscreen component preview
 *
 * Shows a single component in a fullscreen view WITHIN the editor container.
 * This keeps the VSCode activity bar, sidebar, and command palette accessible.
 *
 * Features:
 * - Fills editor pane (position: absolute, not fixed)
 * - Activity bar and sidebar remain accessible
 * - Device presets for responsive testing (Auto, Desktop, Tablet, Mobile)
 * - Native browser zoom (Ctrl+/-, pinch) works inside webview
 * - Keyboard shortcuts (ESC to exit)
 * - Ready for future inspect/edit/AI integration
 *
 * Two Levels of Fullscreen (documented in SANDBOX_ARCHITECTURE.md):
 * - Level 1: Editor Fullscreen (this component) - stays within editor
 * - Level 2: True Fullscreen (future) - covers entire VSCode window
 *
 * Note: No custom zoom controls - use native browser zoom (Ctrl+/-, pinch)
 * which works automatically inside the webview.
 */

import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { getWindow, clearNode } from '../../../../../../base/browser/dom.js';
import type { Sandbox } from '../../../common/canvas/canvasTypes.js';
import { IWebviewService, IWebviewElement } from '../../../../webview/browser/webview.js';
import { createDeviceIcon, getDeviceLabel, getNextDeviceMode } from './deviceIcons.js';
import type { DevicePreset as CanvasDevicePreset } from '../../../common/canvas/canvasTypes.js';

// Device presets for responsive preview
export type DevicePreset = 'desktop' | 'tablet' | 'mobile' | 'auto';

export interface IDevicePresetConfig {
	name: string;
	width: number | 'auto';
	height: number | 'auto';
	icon: string;
}

export const DEVICE_PRESETS: Record<DevicePreset, IDevicePresetConfig> = {
	auto: { name: 'Auto', width: 'auto', height: 'auto', icon: 'expand' },
	desktop: { name: 'Desktop', width: 1280, height: 800, icon: 'monitor' },
	tablet: { name: 'Tablet', width: 768, height: 1024, icon: 'tablet' },
	mobile: { name: 'Mobile', width: 375, height: 667, icon: 'smartphone' }
};

export interface IEditorFullscreenCallbacks {
	onClose: () => void;
	onDeviceChange?: (device: DevicePreset) => void;
	onTrueFullscreen?: () => void;  // Future: expand to true fullscreen
}

export interface IEditorFullscreenState {
	sandbox: Sandbox;
	device: DevicePreset;
	backgroundColor: string;
}

/**
 * EditorFullscreen - Editor-contained fullscreen mode
 *
 * Key differences from true fullscreen:
 * - Uses position: absolute (not fixed) to stay within editor container
 * - Activity bar and sidebar remain accessible
 * - Covers entire editor pane (bottom: 0)
 */

export class EditorFullscreen extends Disposable {
	private overlay: HTMLElement;
	private contentContainer: HTMLElement | undefined;
	private webviewElement: IWebviewElement | undefined;
	private webviewContainer: HTMLElement | undefined;

	// Floating controls
	private actionButtonsContainer: HTMLElement | undefined;
	private buttonsPanel: HTMLElement | undefined;
	private toggleButton: HTMLElement | undefined;
	private toggleArrow: SVGElement | undefined;
	private deviceButton: HTMLElement | undefined;
	private sizeIndicator: HTMLElement | undefined;
	private isExpanded: boolean = false;
	private autoCloseTimer: ReturnType<typeof setTimeout> | undefined;

	// Double-ESC tracking
	private lastEscTime: number = 0;
	private static readonly DOUBLE_ESC_THRESHOLD_MS = 400; // Max time between ESC presses
	private static readonly AUTO_CLOSE_DELAY_MS = 1000; // Auto-close after 1 second
	private static readonly SIZE_INDICATOR_HIDE_DELAY_MS = 4000; // Auto-hide size indicator after 4 seconds
	private sizeIndicatorTimer: ReturnType<typeof setTimeout> | undefined;

	private state: IEditorFullscreenState;

	constructor(
		private editorContainer: HTMLElement,  // The editor pane container (not document.body)
		sandbox: Sandbox,
		private callbacks: IEditorFullscreenCallbacks,
		private webviewService: IWebviewService
	) {
		super();

		this.state = {
			sandbox,
			device: 'auto',
			backgroundColor: '#1a1a1a'
		};

		this.overlay = this.createOverlay();
		this.render();

		// Setup keyboard handler
		this.setupKeyboardHandler();

		// Setup resize handler for responsive device presets
		this.setupResizeHandler();
	}

	private createOverlay(): HTMLElement {
		const overlay = document.createElement('div');
		overlay.className = 'roopik-editor-fullscreen';
		overlay.style.cssText = `
			position: absolute;
			top: 0;
			left: 0;
			right: 0;
			bottom: 0;
			z-index: 100;
			background: ${this.state.backgroundColor};
			opacity: 0;
			transition: opacity 0.3s ease;
			display: flex;
			flex-direction: column;
			border-radius: 0;
		`;

		// Append to editor container (not document.body)
		this.editorContainer.appendChild(overlay);

		// Animate in
		requestAnimationFrame(() => {
			overlay.style.opacity = '1';
		});

		return overlay;
	}

	private render(): void {
		// Clear overlay using VSCode's safe clearNode
		clearNode(this.overlay);

		// Create content area (full screen, no header)
		this.contentContainer = this.createContentArea();
		this.overlay.appendChild(this.contentContainer);

		// Create webview for component
		this.createWebview();

		// Create expandable action buttons (bottom-right) - same style as canvas
		this.actionButtonsContainer = this.createActionButtons();
		this.overlay.appendChild(this.actionButtonsContainer);

		// Create size indicator (bottom-left)
		this.sizeIndicator = this.createSizeIndicator();
		this.overlay.appendChild(this.sizeIndicator);
	}

	/**
	 * Create expandable action buttons (bottom-right)
	 * Same style as canvas - glass-morphism with expand/collapse
	 * Contains: Device toggle, Reload, Close
	 */
	private createActionButtons(): HTMLElement {
		const container = document.createElement('div');
		container.style.cssText = `
			position: absolute;
			bottom: 24px;
			right: 24px;
			z-index: 10;
			display: flex;
			flex-direction: column;
			gap: 8px;
			align-items: center;
		`;

		// Expandable buttons panel
		this.buttonsPanel = this.createButtonsPanel();
		container.appendChild(this.buttonsPanel);

		// Toggle button (always visible)
		this.toggleButton = this.createToggleButton();
		container.appendChild(this.toggleButton);

		// Auto-expand on hover
		container.addEventListener('mouseenter', () => {
			this.cancelAutoClose();
			if (!this.isExpanded) {
				this.setExpanded(true);
			}
		});

		// Auto-close on mouse leave after delay
		container.addEventListener('mouseleave', () => {
			this.startAutoClose();
		});

		return container;
	}

	/**
	 * Set expanded state and update UI without full re-render
	 */
	private setExpanded(expanded: boolean): void {
		this.isExpanded = expanded;

		if (this.buttonsPanel) {
			this.buttonsPanel.style.opacity = expanded ? '1' : '0';
			this.buttonsPanel.style.transform = expanded ? 'scaleY(1) translateY(0)' : 'scaleY(0.8) translateY(10px)';
			this.buttonsPanel.style.pointerEvents = expanded ? 'auto' : 'none';
			this.buttonsPanel.style.maxHeight = expanded ? '400px' : '0';
		}

		if (this.toggleArrow) {
			this.toggleArrow.style.transform = expanded ? 'rotate(180deg)' : 'rotate(0deg)';
		}

		if (this.toggleButton) {
			this.toggleButton.title = expanded ? 'Collapse panel' : 'Expand panel';
		}
	}

	/**
	 * Start auto-close timer
	 */
	private startAutoClose(): void {
		this.cancelAutoClose();
		this.autoCloseTimer = setTimeout(() => {
			if (this.isExpanded) {
				this.setExpanded(false);
			}
		}, EditorFullscreen.AUTO_CLOSE_DELAY_MS);
	}

	/**
	 * Cancel auto-close timer
	 */
	private cancelAutoClose(): void {
		if (this.autoCloseTimer) {
			clearTimeout(this.autoCloseTimer);
			this.autoCloseTimer = undefined;
		}
	}

	/**
	 * Create the expandable buttons panel
	 * Order (top to bottom): Close, Separator, Reload, Device
	 */
	private createButtonsPanel(): HTMLElement {
		const panel = document.createElement('div');
		panel.style.cssText = `
			display: flex;
			flex-direction: column;
			gap: 6px;
			padding: 10px;
			background: rgba(28, 28, 30, 0.9);
			backdrop-filter: blur(20px) saturate(180%);
			-webkit-backdrop-filter: blur(20px) saturate(180%);
			border: 1px solid rgba(255, 255, 255, 0.12);
			border-radius: 16px;
			box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.2);
			overflow: hidden;
			transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
			transform-origin: bottom center;
			opacity: ${this.isExpanded ? '1' : '0'};
			transform: ${this.isExpanded ? 'scaleY(1) translateY(0)' : 'scaleY(0.8) translateY(10px)'};
			pointer-events: ${this.isExpanded ? 'auto' : 'none'};
			max-height: ${this.isExpanded ? '400px' : '0'};
		`;

		// Close button (TOP - red on hover)
		const closeBtn = this.createPanelButton('Close (ESC×2)', this.createCloseIcon(), true, () => this.close());
		panel.appendChild(closeBtn);

		// Separator
		const separator = document.createElement('div');
		separator.style.cssText = `
			height: 1px;
			background: rgba(255, 255, 255, 0.1);
			margin: 2px 0;
		`;
		panel.appendChild(separator);

		// Reload button
		const reloadBtn = this.createPanelButton('Reload', this.createReloadIcon(), false, () => this.reloadComponent());
		panel.appendChild(reloadBtn);

		// Device toggle button (BOTTOM) - store reference for updates
		this.deviceButton = this.createPanelButton(
			`Device: ${getDeviceLabel(this.state.device as CanvasDevicePreset)}`,
			this.createDeviceButtonContent(),
			false,
			() => this.cycleDeviceMode()
		);
		panel.appendChild(this.deviceButton);

		return panel;
	}

	/**
	 * Create the toggle button (always visible)
	 */
	private createToggleButton(): HTMLElement {
		const btn = document.createElement('button');
		btn.title = this.isExpanded ? 'Collapse panel' : 'Expand panel';
		btn.style.cssText = `
			display: flex;
			align-items: center;
			justify-content: center;
			width: 44px;
			height: 44px;
			padding: 0;
			background: rgba(28, 28, 30, 0.9);
			backdrop-filter: blur(20px) saturate(180%);
			-webkit-backdrop-filter: blur(20px) saturate(180%);
			border: 1px solid rgba(255, 255, 255, 0.12);
			border-radius: 50%;
			cursor: pointer;
			transition: all 0.2s ease;
			color: rgba(255, 255, 255, 0.8);
			box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
		`;

		// Arrow icon - store reference for updates
		this.toggleArrow = this.createArrowIcon();
		btn.appendChild(this.toggleArrow);

		// Hover effects
		btn.addEventListener('mouseenter', () => {
			btn.style.background = 'rgba(59, 130, 246, 0.3)';
			btn.style.color = '#60a5fa';
			btn.style.transform = 'scale(1.05)';
		});

		btn.addEventListener('mouseleave', () => {
			btn.style.background = 'rgba(28, 28, 30, 0.9)';
			btn.style.color = 'rgba(255, 255, 255, 0.8)';
			btn.style.transform = 'scale(1)';
		});

		// Click to toggle - use setExpanded instead of render()
		btn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.cancelAutoClose();
			this.setExpanded(!this.isExpanded);
			// If manually collapsed, don't auto-close; if manually expanded, start auto-close
			if (this.isExpanded) {
				this.startAutoClose();
			}
		});

		return btn;
	}

	private createArrowIcon(): SVGElement {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('width', '20');
		svg.setAttribute('height', '20');
		svg.setAttribute('viewBox', '0 0 24 24');
		svg.setAttribute('fill', 'none');
		svg.style.transition = 'transform 0.25s ease';
		svg.style.transform = this.isExpanded ? 'rotate(180deg)' : 'rotate(0deg)';

		const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path.setAttribute('d', 'M18 15L12 9L6 15');
		path.setAttribute('stroke', 'currentColor');
		path.setAttribute('stroke-width', '2');
		path.setAttribute('stroke-linecap', 'round');
		path.setAttribute('stroke-linejoin', 'round');
		svg.appendChild(path);

		return svg;
	}

	/**
	 * Create device button content (A for auto, icons for others)
	 */
	private createDeviceButtonContent(): HTMLElement {
		const container = document.createElement('span');
		container.className = 'device-btn-content';

		if (this.state.device === 'auto') {
			container.textContent = 'A';
			container.style.cssText = `
				font-size: 16px;
				font-weight: 600;
				font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
			`;
		} else {
			const icon = createDeviceIcon(this.state.device as CanvasDevicePreset, 20);
			container.appendChild(icon);
		}

		return container;
	}

	/**
	 * Cycle to next device mode
	 */
	private cycleDeviceMode(): void {
		const nextMode = getNextDeviceMode(this.state.device as CanvasDevicePreset);
		this.state.device = nextMode;
		this.callbacks.onDeviceChange?.(nextMode);

		// Update device button content and webview size without full re-render
		this.updateDeviceButton();
		this.updateWebviewSize();

		// Show size indicator temporarily
		this.showSizeIndicator();
	}

	/**
	 * Update device button content without re-rendering
	 */
	private updateDeviceButton(): void {
		if (!this.deviceButton) {
			return;
		}

		// Update title
		this.deviceButton.title = `Device: ${getDeviceLabel(this.state.device as CanvasDevicePreset)}`;

		// Update content - use safe DOM manipulation (no innerHTML due to Trusted Types)
		const content = this.deviceButton.querySelector('.device-btn-content');
		if (content) {
			// Clear children safely using clearNode from VSCode's dom utilities
			clearNode(content as HTMLElement);

			if (this.state.device === 'auto') {
				content.textContent = 'A';
				(content as HTMLElement).style.cssText = `
					font-size: 16px;
					font-weight: 600;
					font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
				`;
			} else {
				const icon = createDeviceIcon(this.state.device as CanvasDevicePreset, 20);
				content.appendChild(icon);
				(content as HTMLElement).style.cssText = '';
			}
		}
	}

	/**
	 * Create a button for the action panel
	 */
	private createPanelButton(title: string, content: HTMLElement | SVGElement, isDanger: boolean, onClick: () => void): HTMLElement {
		const btn = document.createElement('button');
		btn.title = title;
		btn.style.cssText = `
			display: flex;
			align-items: center;
			justify-content: center;
			width: 40px;
			height: 40px;
			padding: 0;
			background: transparent;
			border: none;
			border-radius: 10px;
			cursor: pointer;
			transition: all 0.15s ease;
			color: rgba(255, 255, 255, 0.7);
		`;

		btn.appendChild(content);

		btn.addEventListener('mouseenter', () => {
			if (isDanger) {
				btn.style.background = 'rgba(239, 68, 68, 0.25)';
				btn.style.color = '#ef4444';
			} else {
				btn.style.background = 'rgba(255, 255, 255, 0.1)';
				btn.style.color = 'rgba(255, 255, 255, 0.9)';
			}
		});

		btn.addEventListener('mouseleave', () => {
			btn.style.background = 'transparent';
			btn.style.color = 'rgba(255, 255, 255, 0.7)';
		});

		btn.addEventListener('click', onClick);

		return btn;
	}

	private createReloadIcon(): SVGElement {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('width', '14');
		svg.setAttribute('height', '14');
		svg.setAttribute('viewBox', '0 0 90 90');
		svg.setAttribute('fill', 'none');

		const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path.setAttribute(
			'd',
			'M75.702 53.014c-2.142 7.995-7.27 14.678-14.439 18.816c-7.168 4.138-15.519 5.239-23.514 3.095c-16.505-4.423-26.335-21.448-21.913-37.953C20.258 20.467 37.286 10.64 53.79 15.06c4.213 1.129 8.076 3.118 11.413 5.809l-8.349 8.35h26.654V2.565l-8.354 8.354c-5.1-4.405-11.133-7.61-17.74-9.381C33.451-4.882 8.735 9.389 2.314 33.35c-6.42 23.961 7.851 48.678 31.811 55.098C38.001 89.486 41.934 90 45.842 90c7.795 0 15.488-2.044 22.42-6.046c10.407-6.008 17.851-15.709 20.962-27.317L75.702 53.014z'
		);
		path.setAttribute('fill', 'rgba(255, 255, 255, 0.8)');

		svg.appendChild(path);
		return svg;
	}

	private createCloseIcon(): SVGElement {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('width', '20');
		svg.setAttribute('height', '20');
		svg.setAttribute('viewBox', '0 0 24 24');
		svg.setAttribute('fill', 'none');

		const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path1.setAttribute('d', 'M6 6L18 18');
		path1.setAttribute('stroke', 'currentColor');
		path1.setAttribute('stroke-width', '2');
		path1.setAttribute('stroke-linecap', 'round');
		svg.appendChild(path1);

		const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path2.setAttribute('d', 'M18 6L6 18');
		path2.setAttribute('stroke', 'currentColor');
		path2.setAttribute('stroke-width', '2');
		path2.setAttribute('stroke-linecap', 'round');
		svg.appendChild(path2);

		return svg;
	}

	/**
	 * Create size indicator (bottom-left)
	 * Shows current viewport dimensions - hidden by default, shown on device change
	 */
	private createSizeIndicator(): HTMLElement {
		const indicator = document.createElement('div');
		indicator.style.cssText = `
			position: absolute;
			bottom: 24px;
			left: 24px;
			z-index: 10;
			font-size: 12px;
			font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
			padding: 8px 12px;
			background: rgba(28, 28, 30, 0.9);
			backdrop-filter: blur(20px) saturate(180%);
			-webkit-backdrop-filter: blur(20px) saturate(180%);
			border: 1px solid rgba(255, 255, 255, 0.12);
			border-radius: 8px;
			color: rgba(255, 255, 255, 0.5);
			box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
			opacity: 0;
			transition: opacity 0.2s ease;
			pointer-events: none;
		`;

		return indicator;
	}

	/**
	 * Show size indicator temporarily (auto-hides after delay)
	 */
	private showSizeIndicator(): void {
		if (!this.sizeIndicator) return;

		// Clear any existing timer
		if (this.sizeIndicatorTimer) {
			clearTimeout(this.sizeIndicatorTimer);
		}

		// Show the indicator
		this.sizeIndicator.style.opacity = '1';

		// Auto-hide after delay
		this.sizeIndicatorTimer = setTimeout(() => {
			if (this.sizeIndicator) {
				this.sizeIndicator.style.opacity = '0';
			}
		}, EditorFullscreen.SIZE_INDICATOR_HIDE_DELAY_MS);
	}

	private reloadComponent(): void {
		// Re-send the code to the webview to trigger a fresh render
		this.sendCodeToWebview();
	}

	private createContentArea(): HTMLElement {
		const content = document.createElement('div');
		content.className = 'fullscreen-content';
		content.style.cssText = `
			position: absolute;
			top: 0;
			left: 0;
			right: 0;
			bottom: 0;
			display: flex;
			align-items: center;
			justify-content: center;
			overflow: auto;
			padding: 80px;
			scrollbar-width: thin;
			scrollbar-color: var(--vscode-scrollbarSlider-background, rgba(255, 255, 255, 0.25)) transparent;
		`;

		// Add WebKit scrollbar styling (for Chrome, Edge, Safari)
		// We need to inject a style element since inline styles don't support pseudo-elements
		const styleId = 'roopik-fullscreen-scrollbar-style';
		if (!document.getElementById(styleId)) {
			const style = document.createElement('style');
			style.id = styleId;
			style.textContent = `
				.roopik-editor-fullscreen .fullscreen-content::-webkit-scrollbar {
					width: 10px;
					height: 10px;
				}
				.roopik-editor-fullscreen .fullscreen-content::-webkit-scrollbar-track {
					background: transparent;
				}
				.roopik-editor-fullscreen .fullscreen-content::-webkit-scrollbar-thumb {
					background-color: var(--vscode-scrollbarSlider-background, rgba(0, 0, 0, 0.3));
					border-radius: 999px;
					border: 2px solid transparent;
					background-clip: padding-box;
					box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
				}
				.roopik-editor-fullscreen .fullscreen-content::-webkit-scrollbar-thumb:hover {
					background-color: var(--vscode-scrollbarSlider-hoverBackground, rgba(0, 0, 0, 0.45));
				}
			`;
			document.head.appendChild(style);
		}

		return content;
	}

	private createWebview(): void {
		if (!this.contentContainer) {
			return;
		}

		// Calculate dimensions based on device preset
		const config = DEVICE_PRESETS[this.state.device];
		const containerRect = this.contentContainer.getBoundingClientRect();

		// Available space with padding
		const padding = 80; // 40px on each side
		const availableWidth = containerRect.width - padding;
		const availableHeight = containerRect.height - padding;

		let viewportWidth: number;
		let viewportHeight: number;
		let scale: number;

		if (config.width === 'auto' || config.height === 'auto') {
			// Auto mode - use all available space, no scaling
			viewportWidth = availableWidth;
			viewportHeight = availableHeight;
			scale = 1;
		} else {
			// Device preset - REAL EMULATION
			// The webview gets the full device resolution (e.g., 1280×800)
			// We use CSS transform to scale it visually to fit the screen
			viewportWidth = config.width;
			viewportHeight = config.height;

			// Calculate scale factor to fit within available space
			const scaleX = availableWidth / viewportWidth;
			const scaleY = availableHeight / viewportHeight;
			scale = Math.min(scaleX, scaleY, 1); // Never scale up beyond 1:1
		}

		// Calculate the visual size after scaling (for the wrapper)
		const visualWidth = Math.round(viewportWidth * scale);
		const visualHeight = Math.round(viewportHeight * scale);

		// Create webview container with device frame styling
		// This container gets the FULL viewport size (e.g., 1280×800)
		// CSS transform scales it down visually while keeping internal viewport size
		// NO rounded corners - realistic browser view
		this.webviewContainer = document.createElement('div');
		this.webviewContainer.className = 'fullscreen-webview-container';
		this.webviewContainer.style.cssText = `
			width: ${viewportWidth}px;
			height: ${viewportHeight}px;
			background: #ffffff;
			overflow: hidden;
			transform: scale(${scale});
			transform-origin: top left;
			box-shadow: 0 ${Math.round(16 / scale)}px ${Math.round(48 / scale)}px rgba(0, 0, 0, 0.4);
		`;

		// Wrapper to contain the scaled webview and center it
		// NO rounded corners - realistic browser experience
		const wrapper = document.createElement('div');
		wrapper.className = 'fullscreen-webview-wrapper';
		wrapper.style.cssText = `
			width: ${visualWidth}px;
			height: ${visualHeight}px;
			position: relative;
			overflow: hidden;
			box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
		`;

		wrapper.appendChild(this.webviewContainer);

		// Update size indicator with actual viewport dimensions and scale
		this.updateSizeIndicator(viewportWidth, viewportHeight, config, scale);

		this.contentContainer.appendChild(wrapper);

		// Create webview element
		this.webviewElement = this.webviewService.createWebviewElement({
			title: `Fullscreen: ${this.state.sandbox.id}`,
			options: {
				enableFindWidget: false,
				retainContextWhenHidden: true
			},
			contentOptions: {
				allowScripts: true,
				localResourceRoots: []
			},
			extension: undefined
		});

		// Mount webview
		this.webviewElement.mountTo(this.webviewContainer, getWindow(this.editorContainer));

		// Set HTML content
		this.webviewElement.setHtml(this.getFullscreenHtml());

		// Listen for ready message and send code
		this._register(this.webviewElement.onMessage(e => {
			if (e.message.type === 'sandbox-ready') {
				this.sendCodeToWebview();
			}
		}));
	}

	private getFullscreenHtml(): string {
		// Similar to SandboxCard but optimized for fullscreen viewing
		return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Roopik Fullscreen Preview</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body {
            width: 100%;
            height: 100%;
            overflow: auto;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #ffffff;
        }
        #root {
            min-height: 100%;
            width: 100%;
        }
        .sandbox-error {
            background: #fee;
            border: 2px solid #fcc;
            border-radius: 8px;
            padding: 20px;
            max-width: 600px;
        }
        .sandbox-error h3 { color: #c33; margin-bottom: 10px; }
        .sandbox-error pre {
            background: #f5f5f5;
            padding: 10px;
            border-radius: 4px;
            overflow-x: auto;
            font-size: 12px;
        }
        .sandbox-loading {
            color: #666;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div id="root">
        <div class="sandbox-loading">Loading component...</div>
    </div>
    <script src="https://unpkg.com/@babel/standalone@7.23.5/babel.min.js"></script>
    <script>
        const vscode = acquireVsCodeApi();
        let cdnScriptsLoaded = false;

        function loadCDNScripts(urls) {
            return new Promise((resolve, reject) => {
                if (!urls || urls.length === 0) {
                    resolve();
                    return;
                }
                let loaded = 0;
                const total = urls.length;
                urls.forEach(url => {
                    const script = document.createElement('script');
                    script.src = url;
                    script.crossOrigin = 'anonymous';
                    script.onload = () => {
                        loaded++;
                        if (loaded === total) {
                            cdnScriptsLoaded = true;
                            resolve();
                        }
                    };
                    script.onerror = () => reject(new Error('Failed to load CDN script: ' + url));
                    document.head.appendChild(script);
                });
            });
        }

        function renderComponent(code) {
            try {
                let processedCode = code;

                const importRegex = /import\\s+(?:([\\w]+)\\s*,?\\s*)?(?:\\{([^}]+)\\})?\\s*from\\s*['"][^'"]+['"];?/g;
                const destructuredImports = [];

                processedCode = processedCode.replace(importRegex, (match, defaultImport, namedImports) => {
                    if (namedImports) {
                        const imports = namedImports.split(',').map(s => s.trim());
                        imports.forEach(imp => {
                            const parts = imp.split(/\\s+as\\s+/);
                            const originalName = parts[0].trim();
                            const localName = parts[1] ? parts[1].trim() : originalName;
                            destructuredImports.push({ originalName, localName });
                        });
                    }
                    return '';
                });

                if (destructuredImports.length > 0) {
                    const destructureStatement = 'const { ' +
                        destructuredImports.map(i => i.originalName === i.localName ? i.originalName : i.originalName + ': ' + i.localName).join(', ') +
                        ' } = React;\\n';
                    processedCode = destructureStatement + processedCode;
                }

                processedCode = processedCode.replace(/export\\s+default\\s+function\\s+(\\w+)?/, 'function Component');
                processedCode = processedCode.replace(/export\\s+default\\s+/, 'const Component = ');

                const transpiled = Babel.transform(processedCode, {
                    presets: ['react'],
                    filename: 'component.jsx'
                }).code;

                const root = document.getElementById('root');
                root.innerHTML = '';
                const componentFunc = new Function('React', 'ReactDOM', transpiled + '\\n\\nreturn Component;');
                const Component = componentFunc(window.React, window.ReactDOM);

                if (window.ReactDOM.createRoot) {
                    const reactRoot = window.ReactDOM.createRoot(root);
                    reactRoot.render(window.React.createElement(Component));
                } else {
                    window.ReactDOM.render(window.React.createElement(Component), root);
                }

                vscode.postMessage({ type: 'rendered', sandboxId: '${this.state.sandbox.id}' });
            } catch (error) {
                const root = document.getElementById('root');
                root.innerHTML = '';
                const errorDiv = document.createElement('div');
                errorDiv.className = 'sandbox-error';
                const h3 = document.createElement('h3');
                h3.textContent = 'Component Error';
                errorDiv.appendChild(h3);
                const pre = document.createElement('pre');
                pre.textContent = error.message;
                errorDiv.appendChild(pre);
                root.appendChild(errorDiv);
                vscode.postMessage({ type: 'error', sandboxId: '${this.state.sandbox.id}', message: error.message });
            }
        }

        window.addEventListener('message', async (event) => {
            const message = event.data;
            if (message.type === 'init') {
                try {
                    if (message.cdnUrls && message.cdnUrls.length > 0) {
                        await loadCDNScripts(message.cdnUrls);
                    }
                    renderComponent(message.code);
                } catch (error) {
                    const root = document.getElementById('root');
                    root.innerHTML = '';
                    const errorDiv = document.createElement('div');
                    errorDiv.className = 'sandbox-error';
                    const h3 = document.createElement('h3');
                    h3.textContent = 'Initialization Error';
                    errorDiv.appendChild(h3);
                    const pre = document.createElement('pre');
                    pre.textContent = error.message;
                    errorDiv.appendChild(pre);
                    root.appendChild(errorDiv);
                }
            } else if (message.type === 'update') {
                renderComponent(message.code);
            }
        });

        vscode.postMessage({ type: 'sandbox-ready', sandboxId: '${this.state.sandbox.id}' });
    </script>
</body>
</html>`;
	}

	private sendCodeToWebview(): void {
		if (this.state.sandbox.sessionCode && this.webviewElement) {
			this.webviewElement.postMessage({
				type: 'init',
				code: this.state.sandbox.sessionCode,
				cdnUrls: this.state.sandbox.cdnUrls || []
			});
		}
	}

	private setupKeyboardHandler(): void {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				const now = Date.now();
				const timeSinceLastEsc = now - this.lastEscTime;

				if (timeSinceLastEsc <= EditorFullscreen.DOUBLE_ESC_THRESHOLD_MS) {
					// Double ESC detected - close fullscreen
					this.close();
				} else {
					// First ESC - record time and show hint
					this.lastEscTime = now;
					this.showEscHint();
				}
			}
		};
		document.addEventListener('keydown', handleKeyDown);
		this._register({
			dispose: () => document.removeEventListener('keydown', handleKeyDown)
		});
	}

	/**
	 * Show a brief hint that user needs to press ESC again to exit
	 */
	private showEscHint(): void {
		// Create hint element
		const hint = document.createElement('div');
		hint.style.cssText = `
			position: absolute;
			top: 50%;
			left: 50%;
			transform: translate(-50%, -50%);
			z-index: 100;
			padding: 16px 24px;
			background: rgba(28, 28, 30, 0.95);
			backdrop-filter: blur(20px);
			border: 1px solid rgba(255, 255, 255, 0.15);
			border-radius: 12px;
			color: rgba(255, 255, 255, 0.9);
			font-size: 14px;
			font-weight: 500;
			box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
			opacity: 0;
			transition: opacity 0.15s ease;
		`;
		hint.textContent = 'Press ESC again to exit';

		this.overlay.appendChild(hint);

		// Fade in
		requestAnimationFrame(() => {
			hint.style.opacity = '1';
		});

		// Remove after delay
		setTimeout(() => {
			hint.style.opacity = '0';
			setTimeout(() => {
				if (hint.parentElement) {
					hint.parentElement.removeChild(hint);
				}
			}, 150);
		}, EditorFullscreen.DOUBLE_ESC_THRESHOLD_MS + 100);
	}

	private setupResizeHandler(): void {
		// Debounced resize handler to update webview container dimensions
		let resizeTimeout: ReturnType<typeof setTimeout> | undefined;

		const handleResize = () => {
			if (resizeTimeout) {
				clearTimeout(resizeTimeout);
			}
			resizeTimeout = setTimeout(() => {
				this.updateWebviewSize();
			}, 100); // Debounce by 100ms
		};

		window.addEventListener('resize', handleResize);
		this._register({
			dispose: () => {
				window.removeEventListener('resize', handleResize);
				if (resizeTimeout) {
					clearTimeout(resizeTimeout);
				}
			}
		});
	}

	private updateWebviewSize(): void {
		if (!this.contentContainer || !this.webviewContainer) {
			return;
		}

		const config = DEVICE_PRESETS[this.state.device];
		const containerRect = this.contentContainer.getBoundingClientRect();

		// Available space with padding
		const padding = 80; // 40px on each side
		const availableWidth = containerRect.width - padding;
		const availableHeight = containerRect.height - padding;

		let viewportWidth: number;
		let viewportHeight: number;
		let scale: number;

		if (config.width === 'auto' || config.height === 'auto') {
			// Auto mode - use all available space, no scaling
			viewportWidth = availableWidth;
			viewportHeight = availableHeight;
			scale = 1;
		} else {
			// Device preset - REAL EMULATION
			viewportWidth = config.width;
			viewportHeight = config.height;

			// Calculate scale factor to fit within available space
			const scaleX = availableWidth / viewportWidth;
			const scaleY = availableHeight / viewportHeight;
			scale = Math.min(scaleX, scaleY, 1); // Never scale up beyond 1:1
		}

		// Calculate the visual size after scaling (for the wrapper)
		const visualWidth = Math.round(viewportWidth * scale);
		const visualHeight = Math.round(viewportHeight * scale);

		// Update webview container - full viewport size with CSS transform
		// NO rounded corners - realistic browser view
		this.webviewContainer.style.width = `${viewportWidth}px`;
		this.webviewContainer.style.height = `${viewportHeight}px`;
		this.webviewContainer.style.transform = `scale(${scale})`;
		this.webviewContainer.style.transformOrigin = 'top left';

		// Update wrapper size
		const wrapper = this.webviewContainer.parentElement;
		if (wrapper && wrapper.classList.contains('fullscreen-webview-wrapper')) {
			wrapper.style.width = `${visualWidth}px`;
			wrapper.style.height = `${visualHeight}px`;
		}

		// Update size indicator
		this.updateSizeIndicator(viewportWidth, viewportHeight, config, scale);
	}

	private updateSizeIndicator(viewportWidth: number, viewportHeight: number, config: IDevicePresetConfig, scale: number = 1): void {
		if (!this.sizeIndicator) {
			return;
		}

		const deviceLabel = getDeviceLabel(this.state.device as CanvasDevicePreset);

		if (config.width === 'auto' || config.height === 'auto') {
			// Auto mode - show current size
			this.sizeIndicator.textContent = `${deviceLabel} · ${Math.round(viewportWidth)} × ${Math.round(viewportHeight)}`;
			this.sizeIndicator.style.color = 'rgba(255, 255, 255, 0.5)';
		} else {
			// Device preset - show ACTUAL viewport size and visual scale
			const targetWidth = config.width as number;
			const targetHeight = config.height as number;

			if (scale < 0.99) {
				// Scaled down visually - show viewport size and visual scale percentage
				const scalePercent = Math.round(scale * 100);
				this.sizeIndicator.textContent = `${deviceLabel} · ${targetWidth} × ${targetHeight} @ ${scalePercent}%`;
				this.sizeIndicator.style.color = 'rgba(251, 191, 36, 0.7)'; // Amber to indicate visual scaling
			} else {
				// Full size (1:1)
				this.sizeIndicator.textContent = `${deviceLabel} · ${targetWidth} × ${targetHeight} (1:1)`;
				this.sizeIndicator.style.color = 'rgba(34, 197, 94, 0.7)'; // Green for full size
			}
		}
	}

	private close(): void {
		// Animate out
		this.overlay.style.opacity = '0';
		setTimeout(() => {
			this.callbacks.onClose();
			this.dispose();
		}, 300);
	}

	public override dispose(): void {
		this.cancelAutoClose();
		if (this.sizeIndicatorTimer) {
			clearTimeout(this.sizeIndicatorTimer);
		}
		if (this.webviewElement) {
			this.webviewElement.dispose();
			this.webviewElement = undefined;
		}
		if (this.overlay.parentElement) {
			this.overlay.parentElement.removeChild(this.overlay);
		}
		super.dispose();
	}
}
