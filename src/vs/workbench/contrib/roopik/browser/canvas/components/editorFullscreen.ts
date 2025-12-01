/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * EditorFullscreen - ESBuild Pipeline Fullscreen Editor
 *
 * Next-generation fullscreen component preview with ESBuild pipeline integration.
 * Built for extensibility to support future features:
 * - Split-screen mode (preview + code editor)
 * - Multi-file editing with tabs
 * - Multi-framework support (React, Vue, Svelte, Solid, Preact, HTML)
 * - Real-time hot reload
 * - Device emulation
 *
 * Architecture:
 * - Uses ESBuild pipeline for component processing (no Babel)
 * - Framework-agnostic rendering
 * - Modular design for easy feature additions
 */

import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { getWindow, clearNode } from '../../../../../../base/browser/dom.js';
import type { Sandbox } from '../../../common/canvas/canvasTypes.js';
import { IWebviewService, IWebviewElement } from '../../../../webview/browser/webview.js';
import { ISandboxPipelineService } from '../../../common/sandboxPipeline/sandboxPipelineService.js';
import { createDeviceIcon, getDeviceLabel, getNextDeviceMode } from './deviceIcons.js';
import type { DevicePreset as CanvasDevicePreset } from '../../../common/canvas/canvasTypes.js';

// Device presets
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
}

export interface IEditorFullscreenState {
	sandbox: Sandbox;
	device: DevicePreset;
	backgroundColor: string;
	// Future: Add mode: 'preview' | 'split' | 'code'
}

/**
 * EditorFullscreen - ESBuild Pipeline Version
 *
 * Key features:
 * - ESBuild pipeline integration (same as NewSandboxCard)
 * - Multi-framework support (auto-detection)
 * - Smart reload (recreates webview)
 * - Extensible for future split-screen mode
 */
export class EditorFullscreen extends Disposable {
	private overlay: HTMLElement;
	private contentContainer: HTMLElement | undefined;
	private webviewElement: IWebviewElement | undefined;
	private webviewContainer: HTMLElement | undefined;

	// UI Controls
	private actionButtonsContainer: HTMLElement | undefined;
	private buttonsPanel: HTMLElement | undefined;
	private toggleButton: HTMLElement | undefined;
	private toggleArrow: SVGElement | undefined;
	private deviceButton: HTMLElement | undefined;
	private sizeIndicator: HTMLElement | undefined;
	private isExpanded: boolean = false;
	private autoCloseTimer: ReturnType<typeof setTimeout> | undefined;

	// Keyboard
	private lastEscTime: number = 0;
	private static readonly DOUBLE_ESC_THRESHOLD_MS = 400;
	private static readonly AUTO_CLOSE_DELAY_MS = 1000;
	private static readonly SIZE_INDICATOR_HIDE_DELAY_MS = 4000;
	private sizeIndicatorTimer: ReturnType<typeof setTimeout> | undefined;

	private state: IEditorFullscreenState;

	private static scrollbarStylesInjected = false;

	constructor(
		private editorContainer: HTMLElement,
		sandbox: Sandbox,
		private callbacks: IEditorFullscreenCallbacks,
		private webviewService: IWebviewService,
		private pipelineService: ISandboxPipelineService
	) {
		super();

		this.state = {
			sandbox,
			device: 'auto',
			backgroundColor: '#1a1a1a'
		};

		EditorFullscreen.ensureScrollbarStyles();

		this.overlay = this.createOverlay();
		this.render();
		this.setupKeyboardHandler();
		this.setupResizeHandler();
	}

	// ============================================
	// Overlay & Rendering
	// ============================================

	private createOverlay(): HTMLElement {
		const overlay = document.createElement('div');
		overlay.className = 'roopik-editor-fullscreen-new';
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
		`;

		this.editorContainer.appendChild(overlay);

		requestAnimationFrame(() => {
			overlay.style.opacity = '1';
		});

		return overlay;
	}

	private render(): void {
		clearNode(this.overlay);

		this.contentContainer = this.createContentArea();
		this.overlay.appendChild(this.contentContainer);

		this.createWebview();

		this.actionButtonsContainer = this.createActionButtons();
		this.overlay.appendChild(this.actionButtonsContainer);

		this.sizeIndicator = this.createSizeIndicator();
		this.overlay.appendChild(this.sizeIndicator);
	}

	// ============================================
	// Action Buttons (Expandable Panel)
	// ============================================

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

		this.buttonsPanel = this.createButtonsPanel();
		container.appendChild(this.buttonsPanel);

		this.toggleButton = this.createToggleButton();
		container.appendChild(this.toggleButton);

		container.addEventListener('mouseenter', () => {
			this.cancelAutoClose();
			if (!this.isExpanded) {
				this.setExpanded(true);
			}
		});

		container.addEventListener('mouseleave', () => {
			this.startAutoClose();
		});

		return container;
	}

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
			box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
			overflow: hidden;
			transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
			transform-origin: bottom center;
			opacity: ${this.isExpanded ? '1' : '0'};
			transform: ${this.isExpanded ? 'scaleY(1) translateY(0)' : 'scaleY(0.8) translateY(10px)'};
			pointer-events: ${this.isExpanded ? 'auto' : 'none'};
			max-height: ${this.isExpanded ? '400px' : '0'};
		`;

		const closeBtn = this.createPanelButton('Close (ESC×2)', this.createCloseIcon(), true, () => this.close());
		panel.appendChild(closeBtn);

		const separator = document.createElement('div');
		separator.style.cssText = 'height: 1px; background: rgba(255, 255, 255, 0.1); margin: 2px 0;';
		panel.appendChild(separator);

		const reloadBtn = this.createPanelButton('Reload', this.createReloadIcon(), false, () => this.smartReload());
		panel.appendChild(reloadBtn);

		this.deviceButton = this.createPanelButton(
			`Device: ${getDeviceLabel(this.state.device as CanvasDevicePreset)}`,
			this.createDeviceButtonContent(),
			false,
			() => this.cycleDeviceMode()
		);
		panel.appendChild(this.deviceButton);

		return panel;
	}

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

		this.toggleArrow = this.createArrowIcon();
		btn.appendChild(this.toggleArrow);

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

		btn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.cancelAutoClose();
			this.setExpanded(!this.isExpanded);
			if (this.isExpanded) {
				this.startAutoClose();
			}
		});

		return btn;
	}

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

	private startAutoClose(): void {
		this.cancelAutoClose();
		this.autoCloseTimer = setTimeout(() => {
			if (this.isExpanded) {
				this.setExpanded(false);
			}
		}, EditorFullscreen.AUTO_CLOSE_DELAY_MS);
	}

	private cancelAutoClose(): void {
		if (this.autoCloseTimer) {
			clearTimeout(this.autoCloseTimer);
			this.autoCloseTimer = undefined;
		}
	}

	// ============================================
	// Device Emulation
	// ============================================

	private cycleDeviceMode(): void {
		const nextMode = getNextDeviceMode(this.state.device as CanvasDevicePreset);
		this.state.device = nextMode;
		this.callbacks.onDeviceChange?.(nextMode);

		this.updateDeviceButton();
		this.updateWebviewSize();
		this.showSizeIndicator();
	}

	private updateDeviceButton(): void {
		if (!this.deviceButton) return;

		this.deviceButton.title = `Device: ${getDeviceLabel(this.state.device as CanvasDevicePreset)}`;

		const content = this.deviceButton.querySelector('.device-btn-content');
		if (content) {
			clearNode(content as HTMLElement);

			if (this.state.device === 'auto') {
				content.textContent = 'A';
				(content as HTMLElement).style.cssText = 'font-size: 16px; font-weight: 600;';
			} else {
				const icon = createDeviceIcon(this.state.device as CanvasDevicePreset, 20);
				content.appendChild(icon);
				(content as HTMLElement).style.cssText = '';
			}
		}
	}

	private createDeviceButtonContent(): HTMLElement {
		const container = document.createElement('span');
		container.className = 'device-btn-content';

		if (this.state.device === 'auto') {
			container.textContent = 'A';
			container.style.cssText = 'font-size: 16px; font-weight: 600;';
		} else {
			const icon = createDeviceIcon(this.state.device as CanvasDevicePreset, 20);
			container.appendChild(icon);
		}

		return container;
	}

	// ============================================
	// Icons
	// ============================================

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

	private createReloadIcon(): SVGElement {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('width', '14');
		svg.setAttribute('height', '14');
		svg.setAttribute('viewBox', '0 0 90 90');
		svg.setAttribute('fill', 'none');

		const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path.setAttribute('d', 'M75.702 53.014c-2.142 7.995-7.27 14.678-14.439 18.816c-7.168 4.138-15.519 5.239-23.514 3.095c-16.505-4.423-26.335-21.448-21.913-37.953C20.258 20.467 37.286 10.64 53.79 15.06c4.213 1.129 8.076 3.118 11.413 5.809l-8.349 8.35h26.654V2.565l-8.354 8.354c-5.1-4.405-11.133-7.61-17.74-9.381C33.451-4.882 8.735 9.389 2.314 33.35c-6.42 23.961 7.851 48.678 31.811 55.098C38.001 89.486 41.934 90 45.842 90c7.795 0 15.488-2.044 22.42-6.046c10.407-6.008 17.851-15.709 20.962-27.317L75.702 53.014z');
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

	// ============================================
	// Size Indicator
	// ============================================

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

	private showSizeIndicator(): void {
		if (!this.sizeIndicator) return;

		if (this.sizeIndicatorTimer) {
			clearTimeout(this.sizeIndicatorTimer);
		}

		this.sizeIndicator.style.opacity = '1';

		this.sizeIndicatorTimer = setTimeout(() => {
			if (this.sizeIndicator) {
				this.sizeIndicator.style.opacity = '0';
			}
		}, EditorFullscreen.SIZE_INDICATOR_HIDE_DELAY_MS);
	}

	private updateSizeIndicator(viewportWidth: number, viewportHeight: number, config: IDevicePresetConfig, scale: number = 1): void {
		if (!this.sizeIndicator) return;

		const deviceLabel = getDeviceLabel(this.state.device as CanvasDevicePreset);

		if (config.width === 'auto' || config.height === 'auto') {
			this.sizeIndicator.textContent = `${deviceLabel} · ${Math.round(viewportWidth)} × ${Math.round(viewportHeight)}`;
			this.sizeIndicator.style.color = 'rgba(255, 255, 255, 0.5)';
		} else {
			const targetWidth = config.width as number;
			const targetHeight = config.height as number;

			if (scale < 0.99) {
				const scalePercent = Math.round(scale * 100);
				this.sizeIndicator.textContent = `${deviceLabel} · ${targetWidth} × ${targetHeight} @ ${scalePercent}%`;
				this.sizeIndicator.style.color = 'rgba(251, 191, 36, 0.7)';
			} else {
				this.sizeIndicator.textContent = `${deviceLabel} · ${targetWidth} × ${targetHeight} (1:1)`;
				this.sizeIndicator.style.color = 'rgba(34, 197, 94, 0.7)';
			}
		}
	}

	private static ensureScrollbarStyles(): void {
		if (EditorFullscreen.scrollbarStylesInjected) {
			return;
		}

		const style = document.createElement('style');
		style.textContent = `
			.roopik-editor-fullscreen-new .fullscreen-content::-webkit-scrollbar {
				width: 8px;
				height: 8px;
			}

			.roopik-editor-fullscreen-new .fullscreen-content::-webkit-scrollbar-track {
				background: transparent;
			}

			.roopik-editor-fullscreen-new .fullscreen-content::-webkit-scrollbar-thumb {
				background-color: var(--vscode-scrollbarSlider-background, rgba(255, 255, 255, 0.25));
				border-radius: 999px;
				border: 2px solid transparent;
				background-clip: padding-box;
				box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.15);
			}

			.roopik-editor-fullscreen-new .fullscreen-content::-webkit-scrollbar-thumb:hover {
				background-color: var(--vscode-scrollbarSlider-hoverBackground, rgba(255, 255, 255, 0.4));
			}
		`;

		document.head.appendChild(style);
		EditorFullscreen.scrollbarStylesInjected = true;
	}

	// ============================================
	// Content Area & Webview
	// ============================================

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
			overflow: hidden;
			padding: 60px;
			padding-bottom: 140px;
		`;

		return content;
	}

	private createWebview(): void {
		if (!this.contentContainer) return;

		const config = DEVICE_PRESETS[this.state.device];
		const containerRect = this.contentContainer.getBoundingClientRect();

		// Calculate available space accounting for padding
		// Horizontal: 60px left + 60px right = 120px
		// Vertical: 60px top + 140px bottom = 200px
		const horizontalPadding = 120;
		const verticalPadding = 200;

		const availableWidth = Math.max(100, containerRect.width - horizontalPadding);
		const availableHeight = Math.max(100, containerRect.height - verticalPadding);

		let viewportWidth: number;
		let viewportHeight: number;
		let scale: number;

		if (config.width === 'auto' || config.height === 'auto') {
			viewportWidth = availableWidth;
			viewportHeight = availableHeight;
			scale = 1;
		} else {
			viewportWidth = config.width;
			viewportHeight = config.height;

			const scaleX = availableWidth / viewportWidth;
			const scaleY = availableHeight / viewportHeight;
			scale = Math.min(scaleX, scaleY, 1);
		}

		const visualWidth = Math.round(viewportWidth * scale);
		const visualHeight = Math.round(viewportHeight * scale);

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
		this.updateSizeIndicator(viewportWidth, viewportHeight, config, scale);
		this.contentContainer.appendChild(wrapper);

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

		this.webviewElement.mountTo(this.webviewContainer, getWindow(this.editorContainer));
		this.webviewElement.setHtml(this.getWebviewHTML());

		// Listen for messages (for future error handling)
		this._register(this.webviewElement.onMessage(e => {
			console.log('[EditorFullscreen] Webview message:', e.message);
		}));

		// Process component after a short delay (same as NewSandboxCard)
		setTimeout(() => {
			console.log('[EditorFullscreen] Starting pipeline processing...');
			this.processAndRender();
		}, 500);
	}

	private getWebviewHTML(): string {
		return `<!DOCTYPE html>
<html>
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="
		default-src 'none';
		script-src 'unsafe-inline' 'unsafe-eval' blob: https://esm.sh;
		style-src 'unsafe-inline' https://esm.sh https://fonts.googleapis.com;
		font-src https://fonts.gstatic.com;
		connect-src https://esm.sh;
		img-src data: https:;
	">
	<style>
		* { margin: 0; padding: 0; box-sizing: border-box; }
		html, body { width: 100%; height: 100%; overflow: hidden; }
		#root { width: 100%; height: 100%; }
	</style>
</head>
<body>
	<div id="root"></div>
	<script>
		window.addEventListener('message', async (event) => {
			const message = event.data;

			if (message.type === 'execute') {
				try {
					const blobUrl = URL.createObjectURL(
						new Blob([message.code], { type: 'application/javascript' })
					);
					await import(blobUrl);
					URL.revokeObjectURL(blobUrl);
				} catch (error) {
					console.error('[Fullscreen] Execution error:', error);
				}
			}
		});

		window.parent.postMessage({ type: 'ready' }, '*');
	</script>
</body>
</html>`;
	}

	// ============================================
	// ESBuild Pipeline Processing
	// ============================================

	private async processAndRender(): Promise<void> {
		if (!this.state.sandbox.sessionCode) {
			console.error('[EditorFullscreen] No code to process');
			return;
		}

		try {
			const framework = this.detectFramework(this.state.sandbox.sessionCode);
			const filename = this.getFilenameForFramework(framework);

			const jobId = await this.pipelineService.processComponent({
				id: this.state.sandbox.id,
				source: 'ai',
				files: {
					[filename]: this.state.sandbox.sessionCode
				},
				dependencies: this.getDependenciesForFramework(framework)
			});

			const result = await this.pipelineService.waitForCompletion(jobId);

			this.webviewElement?.postMessage({
				type: 'execute',
				code: result.bundledCode
			});

			console.log('[EditorFullscreen] ✅ Rendered via pipeline!', {
				framework: result.framework,
				size: result.metadata.size
			});

		} catch (error) {
			console.error('[EditorFullscreen] Pipeline error:', error);
		}
	}

	private detectFramework(code: string): string {
		if (code.includes('<template>') && code.includes('<script')) return 'vue';
		if (code.includes('<script>') && code.includes('<style>') && !code.includes('<template>')) return 'svelte';
		if (code.trim().startsWith('<') && !code.includes('import React') && !code.includes('from \'react\'')) return 'html';
		if (code.includes('solid-js')) return 'solid';
		if (code.includes('preact')) return 'preact';
		return 'react';
	}

	private getFilenameForFramework(framework: string): string {
		const map: Record<string, string> = {
			'react': 'Component.jsx',
			'vue': 'Component.vue',
			'svelte': 'Component.svelte',
			'solid': 'Component.tsx',
			'preact': 'Component.jsx',
			'html': 'index.html'
		};
		return map[framework] || 'Component.jsx';
	}

	private getDependenciesForFramework(framework: string): Record<string, string> {
		const map: Record<string, Record<string, string>> = {
			'react': { 'react': '18', 'react-dom': '18' },
			'vue': { 'vue': '3.4.21' },
			'svelte': { 'svelte': '4.2.15' },
			'solid': { 'solid-js': '1.8.0' },
			'preact': { 'preact': '10.19.0' },
			'html': {}
		};
		return map[framework] || {};
	}

	// ============================================
	// Smart Reload
	// ============================================

	private smartReload(): void {
		console.log('[EditorFullscreen] Smart reload initiated...');

		// Dispose webview
		if (this.webviewElement) {
			this.webviewElement.dispose();
			this.webviewElement = undefined;
		}

		// Remove wrapper (which contains webviewContainer)
		if (this.webviewContainer && this.webviewContainer.parentElement) {
			this.webviewContainer.parentElement.remove(); // Remove the wrapper div
		}

		// Clear references
		this.webviewContainer = undefined;

		// Clear content container completely
		if (this.contentContainer) {
			clearNode(this.contentContainer);
		}

		// Recreate webview
		this.createWebview();

		console.log('[EditorFullscreen] Smart reload complete');
	}

	// ============================================
	// Resize Handling
	// ============================================

	private setupResizeHandler(): void {
		let resizeTimeout: ReturnType<typeof setTimeout> | undefined;

		const handleResize = () => {
			if (resizeTimeout) clearTimeout(resizeTimeout);
			resizeTimeout = setTimeout(() => {
				this.updateWebviewSize();
			}, 100);
		};

		window.addEventListener('resize', handleResize);
		this._register({
			dispose: () => {
				window.removeEventListener('resize', handleResize);
				if (resizeTimeout) clearTimeout(resizeTimeout);
			}
		});
	}

	private updateWebviewSize(): void {
		if (!this.contentContainer || !this.webviewContainer) return;

		const config = DEVICE_PRESETS[this.state.device];
		const containerRect = this.contentContainer.getBoundingClientRect();

		// Calculate available space accounting for padding
		// Horizontal: 60px left + 60px right = 120px
		// Vertical: 60px top + 140px bottom = 200px
		const horizontalPadding = 120;
		const verticalPadding = 200;

		const availableWidth = Math.max(100, containerRect.width - horizontalPadding);
		const availableHeight = Math.max(100, containerRect.height - verticalPadding);

		let viewportWidth: number;
		let viewportHeight: number;
		let scale: number;

		if (config.width === 'auto' || config.height === 'auto') {
			viewportWidth = availableWidth;
			viewportHeight = availableHeight;
			scale = 1;
		} else {
			viewportWidth = config.width;
			viewportHeight = config.height;

			const scaleX = availableWidth / viewportWidth;
			const scaleY = availableHeight / viewportHeight;
			scale = Math.min(scaleX, scaleY, 1);
		}

		const visualWidth = Math.round(viewportWidth * scale);
		const visualHeight = Math.round(viewportHeight * scale);

		this.webviewContainer.style.width = `${viewportWidth}px`;
		this.webviewContainer.style.height = `${viewportHeight}px`;
		this.webviewContainer.style.transform = `scale(${scale})`;
		this.webviewContainer.style.transformOrigin = 'top left';

		const wrapper = this.webviewContainer.parentElement;
		if (wrapper && wrapper.classList.contains('fullscreen-webview-wrapper')) {
			wrapper.style.width = `${visualWidth}px`;
			wrapper.style.height = `${visualHeight}px`;
		}

		this.updateSizeIndicator(viewportWidth, viewportHeight, config, scale);
	}

	// ============================================
	// Keyboard Handling
	// ============================================

	private setupKeyboardHandler(): void {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				const now = Date.now();
				const timeSinceLastEsc = now - this.lastEscTime;

				if (timeSinceLastEsc <= EditorFullscreen.DOUBLE_ESC_THRESHOLD_MS) {
					this.close();
				} else {
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

	private showEscHint(): void {
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

		requestAnimationFrame(() => {
			hint.style.opacity = '1';
		});

		setTimeout(() => {
			hint.style.opacity = '0';
			setTimeout(() => {
				if (hint.parentElement) {
					hint.parentElement.removeChild(hint);
				}
			}, 150);
		}, EditorFullscreen.DOUBLE_ESC_THRESHOLD_MS + 100);
	}

	// ============================================
	// Lifecycle
	// ============================================

	private close(): void {
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
