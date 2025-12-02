/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { getWindow, clearNode } from '../../../../../../base/browser/dom.js';
import type { Sandbox, SandboxState, DevicePreset } from '../../../common/canvas/canvasTypes.js';
import { DEVICE_PRESETS } from '../../../common/canvas/canvasTypes.js';
import { IWebviewService, IWebviewElement } from '../../../../webview/browser/webview.js';
import { ISandboxPipelineService } from '../../../common/sandboxPipeline/sandboxPipelineService.js';
import { createDeviceIcon, getNextDeviceMode } from './deviceIcons.js';

/**
 * Sandbox Card Callbacks
 */
export interface ISandboxCardCallbacks {
	onClick: (id: string) => void;
	onDoubleClick: (id: string) => void;
	onDragStart: (id: string, e: MouseEvent) => void;
	onDelete: (id: string) => void;
	onExpand: (id: string) => void;
	onReload?: (id: string) => void;
	onDeviceModeChange?: (id: string, mode: DevicePreset) => void;
}

/**
 * Sandbox Card - ESBuild Pipeline Version
 *
 * This version uses the new ESBuild-based sandbox pipeline for component processing.
 * UI cloned from the original SandboxCard for consistency.
 *
 * Features:
 * - Glass-morphism design with backdrop blur
 * - ESBuild pipeline integration
 * - Device emulation
 * - Drag handle, action buttons (reload, expand, delete)
 * - Selection and focus states
 */
export class SandboxCard extends Disposable {
	private container: HTMLElement;
	private webviewElement: IWebviewElement | undefined;
	private webviewWrapper: HTMLElement | undefined;
	private webviewContainer: HTMLElement | undefined;
	private labelElement: HTMLElement;
	private actionButtons: HTMLElement | undefined;

	private _isSelected: boolean = false;
	private _isFocused: boolean = false;
	private _isHovered: boolean = false;
	private _isDragging: boolean = false;
	private _isOverlapping: boolean = false;

	// Device emulation state
	private _globalDeviceMode: DevicePreset = 'auto';
	private deviceModeButton: HTMLElement | undefined;

	constructor(
		private parent: HTMLElement,
		private sandbox: Sandbox,
		private callbacks: ISandboxCardCallbacks,
		private webviewService: IWebviewService,
		private pipelineService: ISandboxPipelineService
	) {
		super();
		this.container = this.createContainer();
		this.labelElement = this.createLabel();
		this.createWebview();
		this.render();
	}

	// ============================================
	// Container Creation
	// ============================================

	// Top bar height (label + buttons) + margin
	private static readonly TOP_BAR_HEIGHT = 48; // 16px top + ~20px content + 12px margin below
	private static readonly SIDE_PADDING = 80; // Visual side padding for square-ish look

	private createContainer(): HTMLElement {
		const container = document.createElement('div');
		container.className = 'roopik-sandbox-card new-pipeline';
		container.dataset.sandboxId = this.sandbox.id;

		// Base styles
		container.style.position = 'absolute';
		container.style.display = 'flex';
		container.style.flexDirection = 'column';
		container.style.borderRadius = '20px';
		container.style.overflow = 'hidden';
		container.style.cursor = 'pointer';
		container.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';

		// Minimal padding - just for visual breathing room
		// Top: space for top bar, Bottom: same as top for symmetry, Sides: padding for square-ish look
		container.style.padding = `${SandboxCard.TOP_BAR_HEIGHT}px ${SandboxCard.SIDE_PADDING}px ${SandboxCard.TOP_BAR_HEIGHT}px ${SandboxCard.SIDE_PADDING}px`;
		container.style.margin = '20px';

		// Position and size
		container.style.left = `${this.sandbox.x}px`;
		container.style.top = `${this.sandbox.y}px`;
		container.style.width = `${this.sandbox.width}px`;
		container.style.height = `${this.sandbox.height}px`;
		container.style.zIndex = String(this.sandbox.zIndex);

		// Glass-morphism styling
		container.style.background = 'linear-gradient(135deg, rgba(40, 40, 45, 0.25) 0%, rgba(30, 30, 35, 0.25) 100%)';
		container.style.backdropFilter = 'blur(60px) saturate(250%) brightness(1.1)';
		(container.style as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter = 'blur(60px) saturate(250%) brightness(1.1)';
		container.style.border = '1px solid rgba(255, 255, 255, 0.2)';
		container.style.boxShadow = '0 12px 48px rgba(0, 0, 0, 0.3), 0 4px 12px rgba(0, 0, 0, 0.2), inset 0 2px 0 rgba(255, 255, 255, 0.15), inset 0 -2px 0 rgba(255, 255, 255, 0.05)';

		// Event listeners
		this.setupEventListeners(container);

		this.parent.appendChild(container);
		return container;
	}

	private setupEventListeners(container: HTMLElement): void {
		// Hover
		container.addEventListener('mouseenter', () => {
			this._isHovered = true;
			this.updateVisualState();
			this.showActionButtons();
		});

		container.addEventListener('mouseleave', () => {
			this._isHovered = false;
			this.updateVisualState();
			if (!this._isSelected && !this._isFocused) {
				this.hideActionButtons();
			}
		});

		// Click (select)
		container.addEventListener('click', (e) => {
			if ((e.target as HTMLElement).closest('.sandbox-action-btn') ||
				(e.target as HTMLElement).tagName === 'IFRAME') {
				return;
			}
			this.callbacks.onClick(this.sandbox.id);
		});

		// Double-click (focus mode)
		container.addEventListener('dblclick', (e) => {
			if ((e.target as HTMLElement).tagName === 'IFRAME') {
				return;
			}
			this.callbacks.onDoubleClick(this.sandbox.id);
		});
	}

	// ============================================
	// Label (Drag Handle)
	// ============================================

	private createLabel(): HTMLElement {
		const label = document.createElement('div');
		label.className = 'sandbox-label';
		label.style.position = 'absolute';
		label.style.top = '16px';
		label.style.left = '20px';
		label.style.display = 'flex';
		label.style.alignItems = 'center';
		label.style.gap = '8px';
		label.style.cursor = 'move';
		label.style.userSelect = 'none';
		label.style.zIndex = '10';

		// Drag icon
		const dragIcon = this.createDragIcon();
		label.appendChild(dragIcon);

		// ID text
		const idText = document.createElement('span');
		idText.style.fontSize = '12px';
		idText.style.fontWeight = '700';
		idText.style.color = '#ffffff';
		idText.style.letterSpacing = '0.05em';
		idText.style.textTransform = 'uppercase';
		idText.style.textShadow = '0 2px 8px rgba(0, 0, 0, 0.3)';
		idText.textContent = this.sandbox.id;
		label.appendChild(idText);

		// Drag events
		label.addEventListener('mousedown', (e) => {
			e.stopPropagation();
			this._isDragging = true;
			this.updateVisualState();
			this.callbacks.onDragStart(this.sandbox.id, e);
		});

		return label;
	}

	private createDragIcon(): HTMLElement {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('width', '14');
		svg.setAttribute('height', '14');
		svg.setAttribute('viewBox', '0 0 16 16');
		svg.setAttribute('fill', 'none');
		svg.style.opacity = '0.7';
		svg.style.flexShrink = '0';
		svg.style.color = '#ffffff';

		// 2x3 dot grid
		const positions = [
			[4, 4], [12, 4],
			[4, 8], [12, 8],
			[4, 12], [12, 12]
		];

		for (const [cx, cy] of positions) {
			const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
			circle.setAttribute('cx', String(cx));
			circle.setAttribute('cy', String(cy));
			circle.setAttribute('r', '1.5');
			circle.setAttribute('fill', 'currentColor');
			svg.appendChild(circle);
		}

		return svg as unknown as HTMLElement;
	}

	// ============================================
	// Action Buttons
	// ============================================

	private createActionButtons(): HTMLElement {
		const container = document.createElement('div');
		container.className = 'sandbox-actions';
		container.style.position = 'absolute';
		container.style.top = '16px';
		container.style.right = '20px';
		container.style.display = 'flex';
		container.style.alignItems = 'center';
		container.style.gap = '8px';
		container.style.zIndex = '10';
		container.style.opacity = '0';
		container.style.transition = 'opacity 0.2s ease';

		// Device mode button
		this.deviceModeButton = this.createDeviceModeButton();
		container.appendChild(this.deviceModeButton);

		// Reload button
		const reloadBtn = this.createActionButton('Reload component', this.createReloadIcon(), () => {
			this.reloadComponent();
		});
		container.appendChild(reloadBtn);

		// Expand button
		const expandBtn = this.createActionButton('Expand to fullscreen', this.createExpandIcon(), () => {
			this.callbacks.onExpand(this.sandbox.id);
		});
		container.appendChild(expandBtn);

		// Delete button
		const deleteBtn = this.createActionButton('Delete sandbox', this.createDeleteIcon(), () => {
			this.callbacks.onDelete(this.sandbox.id);
		}, true);
		container.appendChild(deleteBtn);

		return container;
	}

	private createDeviceModeButton(): HTMLElement {
		const btn = document.createElement('button');
		btn.className = 'sandbox-action-btn device-mode-btn';
		this.updateDeviceModeButtonUI(btn);

		btn.style.background = 'rgba(59, 130, 246, 0.15)';
		btn.style.border = '1px solid rgba(59, 130, 246, 0.3)';
		btn.style.padding = '2px 6px';
		btn.style.cursor = 'pointer';
		btn.style.display = 'flex';
		btn.style.alignItems = 'center';
		btn.style.justifyContent = 'center';
		btn.style.gap = '3px';
		btn.style.transition = 'all 0.2s ease';
		btn.style.borderRadius = '4px';
		btn.style.fontSize = '10px';
		btn.style.fontWeight = '500';
		btn.style.color = '#60a5fa';
		btn.style.fontFamily = 'inherit';

		btn.addEventListener('mouseenter', () => {
			btn.style.background = 'rgba(59, 130, 246, 0.25)';
			btn.style.borderColor = 'rgba(59, 130, 246, 0.5)';
		});

		btn.addEventListener('mouseleave', () => {
			btn.style.background = 'rgba(59, 130, 246, 0.15)';
			btn.style.borderColor = 'rgba(59, 130, 246, 0.3)';
		});

		btn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.cycleDeviceMode();
		});

		return btn;
	}

	private updateDeviceModeButtonUI(btn?: HTMLElement): void {
		const button = btn || this.deviceModeButton;
		if (!button) return;

		const effectiveMode = this.getEffectiveDeviceMode();
		const config = DEVICE_PRESETS[effectiveMode];
		const hasOverride = this.sandbox.deviceMode !== undefined;

		clearNode(button);

		const icon = createDeviceIcon(effectiveMode, 14);
		icon.style.cssText = 'flex-shrink: 0;';
		button.appendChild(icon);

		if (hasOverride) {
			const indicator = document.createElement('span');
			indicator.textContent = '*';
			indicator.style.color = '#fbbf24';
			indicator.style.marginLeft = '2px';
			indicator.title = 'Custom device mode';
			button.appendChild(indicator);
		}

		const sizeText = config.width === 'auto' ? 'Auto size' : `${config.width}×${config.height}`;
		button.title = `Device: ${config.label} (${sizeText})${hasOverride ? ' - Override' : ' - Global'}\nClick to cycle`;
	}

	private getEffectiveDeviceMode(): DevicePreset {
		return this.sandbox.deviceMode ?? this._globalDeviceMode;
	}

	private cycleDeviceMode(): void {
		const currentMode = this.getEffectiveDeviceMode();
		const nextMode = getNextDeviceMode(currentMode);

		this.sandbox.deviceMode = nextMode;
		this.updateDeviceModeButtonUI();
		this.applyDeviceEmulation();
		this.callbacks.onDeviceModeChange?.(this.sandbox.id, nextMode);
	}

	/**
	 * Reset to global device mode (remove sandbox override)
	 */
	public resetToGlobalDeviceMode(): void {
		this.sandbox.deviceMode = undefined;
		this.updateDeviceModeButtonUI();
		this.applyDeviceEmulation();
	}

	public setGlobalDeviceMode(mode: DevicePreset): void {
		this._globalDeviceMode = mode;
		if (this.sandbox.deviceMode === undefined) {
			this.updateDeviceModeButtonUI();
			this.applyDeviceEmulation();
		}
	}

	public forceDeviceMode(mode: DevicePreset): void {
		this.sandbox.deviceMode = undefined;
		this._globalDeviceMode = mode;
		this.updateDeviceModeButtonUI();
		this.applyDeviceEmulation();
	}

	private applyDeviceEmulation(): void {
		if (!this.webviewContainer || !this.webviewWrapper) return;

		const mode = this.getEffectiveDeviceMode();
		const config = DEVICE_PRESETS[mode];

		if (config.width === 'auto' || config.height === 'auto') {
			// Auto mode: fill available space, let flexbox handle it
			this.webviewContainer.style.width = '100%';
			this.webviewContainer.style.height = '100%';
			this.webviewContainer.style.transform = 'none';
			this.webviewContainer.style.transformOrigin = '';
			this.webviewContainer.style.margin = '0';
			this.webviewContainer.style.flexShrink = '0';
		} else {
			// Device mode: fixed device size, scaled to fit available space
			// Use sandbox's logical dimensions (not getBoundingClientRect which is affected by canvas zoom)
			// Available space = sandbox size - padding (top bar + bottom margin + side padding)
			const availableWidth = this.sandbox.width - (SandboxCard.SIDE_PADDING * 2);
			const availableHeight = this.sandbox.height - (SandboxCard.TOP_BAR_HEIGHT * 2);

			const deviceWidth = config.width as number;
			const deviceHeight = config.height as number;

			// Scale to fit available space while maintaining aspect ratio
			// No cap at 1 - allow scaling up if space is available
			const scaleX = availableWidth / deviceWidth;
			const scaleY = availableHeight / deviceHeight;
			const scale = Math.min(scaleX, scaleY);

			// Calculate the visual size after scaling
			const scaledWidth = deviceWidth * scale;
			const scaledHeight = deviceHeight * scale;

			// Calculate negative margins to shrink layout box to match visual size
			// This allows flexbox centering to work correctly with scaled elements
			const marginX = (deviceWidth - scaledWidth) / 2;
			const marginY = (deviceHeight - scaledHeight) / 2;

			// Set fixed device dimensions and scale
			this.webviewContainer.style.width = `${deviceWidth}px`;
			this.webviewContainer.style.height = `${deviceHeight}px`;
			this.webviewContainer.style.transform = `scale(${scale})`;
			this.webviewContainer.style.transformOrigin = 'center center';
			this.webviewContainer.style.margin = `-${marginY}px -${marginX}px`;
			this.webviewContainer.style.flexShrink = '0';
		}
	}

	private createActionButton(title: string, icon: HTMLElement, onClick: () => void, isDanger: boolean = false): HTMLElement {
		const btn = document.createElement('button');
		btn.className = 'sandbox-action-btn';
		btn.title = title;
		btn.style.background = 'transparent';
		btn.style.border = 'none';
		btn.style.padding = '4px';
		btn.style.cursor = 'pointer';
		btn.style.display = 'flex';
		btn.style.alignItems = 'center';
		btn.style.justifyContent = 'center';
		btn.style.transition = 'all 0.2s ease';
		btn.style.opacity = '0.7';
		btn.style.borderRadius = '4px';

		btn.appendChild(icon);

		btn.addEventListener('mouseenter', () => {
			btn.style.opacity = '1';
			if (isDanger) {
				const svg = btn.querySelector('svg');
				if (svg) svg.setAttribute('stroke', '#ef4444');
			}
		});

		btn.addEventListener('mouseleave', () => {
			btn.style.opacity = '0.7';
			if (isDanger) {
				const svg = btn.querySelector('svg');
				if (svg) svg.setAttribute('stroke', 'rgba(255, 255, 255, 0.9)');
			}
		});

		btn.addEventListener('click', (e) => {
			e.stopPropagation();
			onClick();
		});

		return btn;
	}

	private createExpandIcon(): HTMLElement {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('width', '18');
		svg.setAttribute('height', '18');
		svg.setAttribute('viewBox', '0 0 16 16');
		svg.setAttribute('fill', 'none');
		svg.setAttribute('stroke', 'rgba(255, 255, 255, 0.9)');
		svg.setAttribute('stroke-width', '1.5');
		svg.setAttribute('stroke-linecap', 'round');
		svg.setAttribute('stroke-linejoin', 'round');

		const paths = ['M2 6 L2 2 L6 2', 'M10 2 L14 2 L14 6', 'M14 10 L14 14 L10 14', 'M6 14 L2 14 L2 10'];
		for (const d of paths) {
			const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
			path.setAttribute('d', d);
			svg.appendChild(path);
		}

		return svg as unknown as HTMLElement;
	}

	private createDeleteIcon(): HTMLElement {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('width', '18');
		svg.setAttribute('height', '18');
		svg.setAttribute('viewBox', '0 0 16 16');
		svg.setAttribute('fill', 'none');
		svg.setAttribute('stroke', 'rgba(255, 255, 255, 0.9)');
		svg.setAttribute('stroke-width', '2');
		svg.setAttribute('stroke-linecap', 'round');
		svg.setAttribute('stroke-linejoin', 'round');

		const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path1.setAttribute('d', 'M4 4 L12 12');
		svg.appendChild(path1);

		const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path2.setAttribute('d', 'M12 4 L4 12');
		svg.appendChild(path2);

		return svg as unknown as HTMLElement;
	}

	private createReloadIcon(): HTMLElement {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('width', '12');
		svg.setAttribute('height', '12');
		svg.setAttribute('viewBox', '0 0 90 90');
		svg.setAttribute('fill', 'none');

		const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path.setAttribute(
			'd',
			'M75.702 53.014c-2.142 7.995-7.27 14.678-14.439 18.816c-7.168 4.138-15.519 5.239-23.514 3.095c-16.505-4.423-26.335-21.448-21.913-37.953C20.258 20.467 37.286 10.64 53.79 15.06c4.213 1.129 8.076 3.118 11.413 5.809l-8.349 8.35h26.654V2.565l-8.354 8.354c-5.1-4.405-11.133-7.61-17.74-9.381C33.451-4.882 8.735 9.389 2.314 33.35c-6.42 23.961 7.851 48.678 31.811 55.098C38.001 89.486 41.934 90 45.842 90c7.795 0 15.488-2.044 22.42-6.046c10.407-6.008 17.851-15.709 20.962-27.317L75.702 53.014z'
		);
		path.setAttribute('fill', 'rgba(255, 255, 255, 0.9)');

		svg.appendChild(path);
		return svg as unknown as HTMLElement;
	}

	/**
	 * Smart reload - recreates webview and forces fresh processing
	 * This helps when:
	 * - CDN resources fail to load
	 * - HTTP timeouts occur
	 * - Component gets stuck in error state
	 * - Cache issues prevent proper rendering
	 */
	private reloadComponent(): void {
		console.log('[SandboxCard] Smart reload initiated...');

		// Clear error state
		this.sandbox.state = 'loading';
		this.sandbox.errorMessage = undefined;
		this.updateVisualState();

		// Dispose old webview completely
		if (this.webviewElement) {
			this.webviewElement.dispose();
			this.webviewElement = undefined;
		}

		// Clear webview container
		if (this.webviewContainer) {
			this.webviewContainer.remove();
			this.webviewContainer = undefined;
		}

		if (this.webviewWrapper) {
			this.webviewWrapper.remove();
			this.webviewWrapper = undefined;
		}

		// Recreate fresh webview
		this.createWebview();

		// Re-render to add webview back to DOM
		if (this.webviewWrapper) {
			// Find where to insert (after label, before or after action buttons)
			const label = this.container.querySelector('.sandbox-label');
			if (label && label.nextSibling) {
				this.container.insertBefore(this.webviewWrapper, label.nextSibling);
			} else {
				this.container.appendChild(this.webviewWrapper);
			}
		}

		// Notify parent
		this.callbacks.onReload?.(this.sandbox.id);

		console.log('[SandboxCard] Smart reload complete - fresh webview created');
	}

	private showActionButtons(): void {
		if (this.actionButtons) {
			this.actionButtons.style.opacity = '1';
		}
	}

	private hideActionButtons(): void {
		if (this.actionButtons) {
			this.actionButtons.style.opacity = '0';
		}
	}

	// ============================================
	// Webview Creation (ESBuild Pipeline)
	// ============================================

	private createWebview(): void {
		this.webviewWrapper = document.createElement('div');
		this.webviewWrapper.className = 'sandbox-webview-wrapper';
		this.webviewWrapper.style.position = 'relative';
		this.webviewWrapper.style.flex = '1';
		this.webviewWrapper.style.display = 'flex';
		this.webviewWrapper.style.alignItems = 'center';
		this.webviewWrapper.style.justifyContent = 'center';
		this.webviewWrapper.style.overflow = 'visible'; // Allow scaled content to be visible

		this.webviewContainer = document.createElement('div');
		this.webviewContainer.className = 'sandbox-webview-container';
		this.webviewContainer.style.width = '100%';
		this.webviewContainer.style.height = '100%';
		this.webviewContainer.style.borderRadius = '12px';
		this.webviewContainer.style.overflow = 'hidden';
		this.webviewContainer.style.background = '#ffffff';

		this.webviewWrapper.appendChild(this.webviewContainer);

		const webview = this.webviewService.createWebviewElement({
			title: `Sandbox: ${this.sandbox.id}`,
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

		this.webviewElement = webview;

		// Mount webview to container using VSCode's mountTo API
		webview.mountTo(this.webviewContainer, getWindow(this.parent));

		// Set HTML content
		webview.setHtml(this.getWebviewHTML());

		// Listen for messages
		this._register(webview.onMessage(e => {
			this.onWebviewMessage(e.message);
		}));

		// Process component after a short delay
		setTimeout(() => {
			this.processComponentWithPipeline();
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
		script-src 'unsafe-inline' 'unsafe-eval' blob: https://esm.sh https://unpkg.com https://cdn.skypack.dev https://cdn.jsdelivr.net;
		style-src 'unsafe-inline' https://esm.sh https://unpkg.com https://cdn.skypack.dev https://cdn.jsdelivr.net https://fonts.googleapis.com;
		font-src https://fonts.gstatic.com;
		connect-src https://esm.sh https://unpkg.com https://cdn.skypack.dev https://cdn.jsdelivr.net;
		img-src data: https:;
	">
	<style>
		* { margin: 0; padding: 0; box-sizing: border-box; }
		html, body { width: 100%; height: 100%; overflow: auto; }
		#root { width: 100%; min-height: 100%; }
	</style>
</head>
<body>
	<div id="root"></div>
	<script>
		// Acquire VSCode API for proper messaging (window.parent is overridden by VSCode)
		const vscode = acquireVsCodeApi();

		// Global error handler for runtime errors (React hooks, etc.)
		window.onerror = function(message, source, lineno, colno, error) {
			console.error('[Webview] Runtime error:', message, error);
			vscode.postMessage({
				type: 'error',
				message: typeof message === 'string' ? message : (error?.message || 'Unknown error')
			});
			return true; // Prevent default error handling
		};

		// Global handler for unhandled promise rejections
		window.addEventListener('unhandledrejection', function(event) {
			console.error('[Webview] Unhandled rejection:', event.reason);
			vscode.postMessage({
				type: 'error',
				message: event.reason?.message || String(event.reason) || 'Unhandled promise rejection'
			});
		});

		window.addEventListener('message', async (event) => {
			const message = event.data;

			if (message.type === 'execute') {
				try {
					const blobUrl = URL.createObjectURL(
						new Blob([message.code], { type: 'application/javascript' })
					);
					await import(blobUrl);
					URL.revokeObjectURL(blobUrl);
					// Signal success
					vscode.postMessage({ type: 'rendered' });
				} catch (error) {
					console.error('[Webview] Execution error:', error);
					vscode.postMessage({ type: 'error', message: error.message });
				}
			}
		});

		// Signal ready
		vscode.postMessage({ type: 'ready' });
	</script>
</body>
</html>`;
	}

	// ============================================
	// ESBuild Pipeline Processing
	// ============================================

	private async processComponentWithPipeline(): Promise<void> {
		if (!this.sandbox.sessionCode) {
			console.error('[SandboxCard] No code to process');
			return;
		}

		try {
			this.sandbox.state = 'loading';
			this.updateVisualState();

			// Detect framework and use correct file extension
			const framework = this.detectFramework(this.sandbox.sessionCode);
			const filename = this.getFilenameForFramework(framework);

			// Process through pipeline
			const jobId = await this.pipelineService.processComponent({
				id: this.sandbox.id,
				source: 'ai',
				files: {
					[filename]: this.sandbox.sessionCode
				},
				dependencies: this.getDependenciesForFramework(framework)
			});

			// Wait for result
			const result = await this.pipelineService.waitForCompletion(jobId);

			// Send bundled code to webview
			this.webviewElement?.postMessage({
				type: 'execute',
				code: result.bundledCode
			});

			this.sandbox.state = 'ready';
			console.log('[SandboxCard] ✅ Rendered via pipeline!', {
				framework: result.framework,
				cdnUrls: result.cdnUrls,
				size: result.metadata.size
			});

		} catch (error) {
			// Pipeline/build errors - show in UI
			this.sandbox.state = 'error';
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.sandbox.errorMessage = errorMessage;
			this.showError(this.formatPipelineError(errorMessage));
			console.error('[SandboxCard] Pipeline error:', error);
		}
	}

	/**
	 * Format pipeline errors for display
	 */
	private formatPipelineError(message: string): string {
		// Just return the message as-is - no hardcoded string manipulation
		return message;
	}

	/**
	 * Detect framework from code content
	 */
	private detectFramework(code: string): string {
		// Vue SFC detection
		if (code.includes('<template>') && code.includes('<script')) {
			return 'vue';
		}

		// Svelte detection
		if (code.includes('<script>') && code.includes('<style>') && !code.includes('<template>')) {
			return 'svelte';
		}

		// Vanilla HTML detection
		if (code.trim().startsWith('<') && !code.includes('import React') && !code.includes('from \'react\'')) {
			return 'html';
		}

		// Solid detection
		if (code.includes('solid-js')) {
			return 'solid';
		}

		// Preact detection
		if (code.includes('preact')) {
			return 'preact';
		}

		// Default to React
		return 'react';
	}

	/**
	 * Get appropriate filename for framework
	 */
	private getFilenameForFramework(framework: string): string {
		const extensionMap: Record<string, string> = {
			'react': 'Component.jsx',
			'vue': 'Component.vue',
			'svelte': 'Component.svelte',
			'solid': 'Component.tsx',
			'preact': 'Component.jsx',
			'html': 'index.html'
		};

		return extensionMap[framework] || 'Component.jsx';
	}

	/**
	 * Get dependencies for framework
	 */
	private getDependenciesForFramework(framework: string): Record<string, string> {
		const depsMap: Record<string, Record<string, string>> = {
			'react': { 'react': '18', 'react-dom': '18' },
			'vue': { 'vue': '3.4.21' },
			'svelte': { 'svelte': '4.2.15' },
			'solid': { 'solid-js': '1.8.0' },
			'preact': { 'preact': '10.19.0' },
			'html': {}
		};

		return depsMap[framework] || {};
	}

	private onWebviewMessage(message: any): void {
		if (message.type === 'ready') {
			console.log('[SandboxCard] Webview ready');
		} else if (message.type === 'rendered') {
			this.sandbox.state = 'ready';
			this.clearError();
			console.log('[SandboxCard] Component rendered');
		} else if (message.type === 'error') {
			this.sandbox.state = 'error';
			this.sandbox.errorMessage = message.message;
			this.showError(message.message);
			console.error('[SandboxCard] Error:', message.message);
		}
	}

	private render(): void {
		if (this.webviewContainer) {
			this.container.appendChild(this.webviewWrapper!);
		}

		this.container.appendChild(this.labelElement);

		this.actionButtons = this.createActionButtons();
		this.container.appendChild(this.actionButtons);

		this.updateVisualState();
		this.applyDeviceEmulation();
	}

	// ============================================
	// Visual State Management
	// ============================================

	private updateVisualState(): void {
		// Backdrop filter (disabled during drag for performance!)
		if (this._isDragging) {
			this.container.style.backdropFilter = 'none';
			(this.container.style as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter = 'none';
		} else {
			this.container.style.backdropFilter = 'blur(60px) saturate(250%) brightness(1.1)';
			(this.container.style as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter = 'blur(60px) saturate(250%) brightness(1.1)';
		}

		// Transition (disabled during drag for performance!)
		this.container.style.transition = this._isDragging ? 'none' : 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';

		// Webview pointer events (disabled during drag)
		if (this.webviewContainer) {
			this.webviewContainer.style.pointerEvents = this._isDragging ? 'none' : 'auto';
		}

		// Check if in error state
		const isError = this.sandbox.state === 'error';

		// Border - error state takes priority, then overlap, selection states
		if (isError) {
			this.container.style.border = '2px solid rgba(239, 68, 68, 0.8)';
		} else if (this._isOverlapping && this._isDragging) {
			this.container.style.border = '2px solid rgba(251, 191, 36, 0.8)';
		} else if (this._isDragging) {
			this.container.style.border = '1px solid rgba(255, 255, 255, 0.3)';
		} else if (this._isSelected) {
			this.container.style.border = '2px solid rgba(59, 130, 246, 0.8)';
		} else if (this._isFocused) {
			this.container.style.border = '2px solid rgba(168, 85, 247, 0.8)';
		} else if (this._isHovered) {
			this.container.style.border = '1px solid rgba(255, 255, 255, 0.4)';
		} else {
			this.container.style.border = '1px solid rgba(255, 255, 255, 0.2)';
		}

		// Box shadow - error glow takes priority
		if (isError) {
			this.container.style.boxShadow = '0 0 0 4px rgba(239, 68, 68, 0.2), 0 0 24px rgba(239, 68, 68, 0.3), 0 12px 48px rgba(0, 0, 0, 0.3)';
		} else if (this._isDragging && this._isOverlapping) {
			this.container.style.boxShadow = '0 0 0 4px rgba(251, 191, 36, 0.3), 0 8px 32px rgba(251, 191, 36, 0.4)';
		} else if (this._isDragging) {
			this.container.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.5)';
		} else if (this._isFocused) {
			this.container.style.boxShadow = '0 0 0 4px rgba(168, 85, 247, 0.2), 0 12px 48px rgba(0, 0, 0, 0.3)';
		} else if (this._isSelected) {
			this.container.style.boxShadow = '0 0 0 4px rgba(59, 130, 246, 0.2), 0 12px 48px rgba(0, 0, 0, 0.3)';
		} else if (this._isHovered) {
			this.container.style.boxShadow = '0 16px 56px rgba(0, 0, 0, 0.4), 0 4px 12px rgba(0, 0, 0, 0.2)';
		} else {
			this.container.style.boxShadow = '0 12px 48px rgba(0, 0, 0, 0.3), 0 4px 12px rgba(0, 0, 0, 0.2), inset 0 2px 0 rgba(255, 255, 255, 0.15), inset 0 -2px 0 rgba(255, 255, 255, 0.05)';
		}

		// Cursor
		this.container.style.cursor = this._isDragging ? 'grabbing' : 'pointer';

		// Opacity during drag
		if (this._isDragging) {
			this.container.style.opacity = '0.9';
		} else {
			this.container.style.opacity = '1';
		}
	}

	// ============================================
	// Error Display (renders inside webview)
	// ============================================

	private showError(errorMessage: string): void {
		// Set error HTML directly in the webview - no overlay needed
		if (this.webviewElement) {
			this.webviewElement.setHtml(this.getErrorHTML(errorMessage));
		}
		// Update visual state to show red glow border
		this.updateVisualState();
	}

	private getErrorHTML(errorMessage: string): string {
		// Escape HTML entities to prevent XSS
		const escaped = errorMessage
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');

		return `<!DOCTYPE html>
<html>
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<style>
		* { margin: 0; padding: 0; box-sizing: border-box; }
		html, body {
			width: 100%;
			height: 100%;
			background: #ffffff;
			font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
		}
		.error-container {
			width: 100%;
			height: 100%;
			display: flex;
			flex-direction: column;
			padding: 20px;
			overflow: auto;
		}
		.error-header {
			display: flex;
			align-items: center;
			gap: 10px;
			margin-bottom: 16px;
			flex-shrink: 0;
		}
		.error-icon {
			width: 20px;
			height: 20px;
			flex-shrink: 0;
		}
		.error-title {
			font-size: 14px;
			font-weight: 600;
			color: #dc2626;
		}
		.error-content {
			background: #fef2f2;
			border: 1px solid #fecaca;
			border-radius: 8px;
			padding: 14px;
			flex: 1;
			overflow: auto;
		}
		.error-message {
			font-size: 12px;
			line-height: 1.6;
			color: #991b1b;
			white-space: pre-wrap;
			word-break: break-word;
		}
	</style>
</head>
<body>
	<div class="error-container">
		<div class="error-header">
			<svg class="error-icon" viewBox="0 0 20 20" fill="none">
				<circle cx="10" cy="10" r="9" stroke="#dc2626" stroke-width="1.5" fill="#fee2e2"/>
				<path d="M7 7L13 13" stroke="#dc2626" stroke-width="1.5" stroke-linecap="round"/>
				<path d="M13 7L7 13" stroke="#dc2626" stroke-width="1.5" stroke-linecap="round"/>
			</svg>
			<span class="error-title">Error</span>
		</div>
		<div class="error-content">
			<div class="error-message">${escaped}</div>
		</div>
	</div>
</body>
</html>`;
	}

	private clearError(): void {
		this.sandbox.errorMessage = undefined;
		// Restore normal border via updateVisualState
		this.updateVisualState();
	}

	/**
	 * Get current error message (for AI agents/external access)
	 */
	public getErrorMessage(): string | undefined {
		return this.sandbox.errorMessage;
	}

	/**
	 * Check if sandbox is in error state
	 */
	public hasError(): boolean {
		return this.sandbox.state === 'error';
	}

	// ============================================
	// Public API
	// ============================================

	public setSelected(selected: boolean): void {
		this._isSelected = selected;
		this.updateVisualState();
		if (selected) {
			this.showActionButtons();
		} else if (!this._isHovered && !this._isFocused) {
			this.hideActionButtons();
		}
	}

	public setFocused(focused: boolean): void {
		this._isFocused = focused;
		this.updateVisualState();
		if (focused) {
			this.showActionButtons();
		} else if (!this._isHovered && !this._isSelected) {
			this.hideActionButtons();
		}
	}

	public setDragging(dragging: boolean): void {
		this._isDragging = dragging;
		// Clear overlap indicator when dragging ends
		if (!dragging) {
			this._isOverlapping = false;
		}
		this.updateVisualState();
	}

	public setOverlapping(overlapping: boolean): void {
		this._isOverlapping = overlapping;
		this.updateVisualState();
	}

	public updatePosition(x: number, y: number): void {
		this.sandbox.x = x;
		this.sandbox.y = y;
		this.container.style.left = `${x}px`;
		this.container.style.top = `${y}px`;
	}

	public updateSize(width: number, height: number): void {
		this.sandbox.width = width;
		this.sandbox.height = height;
		this.container.style.width = `${width}px`;
		this.container.style.height = `${height}px`;
		this.applyDeviceEmulation();
	}

	public updateZIndex(zIndex: number): void {
		this.sandbox.zIndex = zIndex;
		this.container.style.zIndex = String(zIndex);
	}

	public getElement(): HTMLElement {
		return this.container;
	}

	/**
	 * Apply drag offset (visual only, doesn't update sandbox data)
	 */
	public applyDragOffset(offsetX: number, offsetY: number): void {
		this.container.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0)`;
	}

	/**
	 * Clear drag offset and update actual position
	 */
	public commitDragPosition(newX: number, newY: number): void {
		this.sandbox.x = newX;
		this.sandbox.y = newY;
		this.container.style.transform = 'none';
		this.updatePosition(newX, newY);
	}

	public getSandbox(): Sandbox {
		return this.sandbox;
	}

	/**
	 * Update sandbox data and re-render
	 */
	public update(sandbox: Partial<Sandbox>): void {
		Object.assign(this.sandbox, sandbox);

		if ('x' in sandbox || 'y' in sandbox) {
			this.updatePosition(this.sandbox.x, this.sandbox.y);
		}
		if ('width' in sandbox || 'height' in sandbox) {
			this.updateSize(this.sandbox.width, this.sandbox.height);
		}
		if ('zIndex' in sandbox) {
			this.updateZIndex(this.sandbox.zIndex);
		}
		if ('sessionCode' in sandbox) {
			// Re-process with new code
			this.processComponentWithPipeline();
		}
	}

	/**
	 * Update render state
	 */
	public setState(state: SandboxState, errorMessage?: string): void {
		this.sandbox.state = state;
		if (errorMessage) {
			this.sandbox.errorMessage = errorMessage;
		}
	}

	override dispose(): void {
		// Dispose webview first
		if (this.webviewElement) {
			this.webviewElement.dispose();
			this.webviewElement = undefined;
		}

		// Remove webview container
		if (this.webviewContainer) {
			this.webviewContainer.remove();
			this.webviewContainer = undefined;
		}

		// Remove webview wrapper
		if (this.webviewWrapper) {
			this.webviewWrapper.remove();
			this.webviewWrapper = undefined;
		}

		// Remove action buttons
		if (this.actionButtons) {
			this.actionButtons.remove();
			this.actionButtons = undefined;
		}

		// Clear device mode button reference
		this.deviceModeButton = undefined;

		// Remove container last (this removes everything that's still attached)
		this.container.remove();

		super.dispose();
	}
}
