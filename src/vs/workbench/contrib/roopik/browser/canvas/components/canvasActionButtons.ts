/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * CanvasActionButtons - Collapsible floating action buttons for canvas controls
 *
 * Positioned at bottom-right of the canvas, provides:
 * - Color picker (top when expanded)
 * - Background pattern toggle
 * - Separator
 * - Grid/Free mode toggle
 * - Tidy Up button (bottom)
 * - Collapse/Expand toggle button (always visible)
 *
 * Design: Glass-morphism floating buttons with smooth animations
 * Auto-collapses after 3 seconds of no hover
 */

import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { clearNode } from '../../../../../../base/browser/dom.js';
import type { CanvasMode } from '../services/gridManager.js';
import type { BackgroundPattern, DevicePreset } from '../../../common/canvas/canvasTypes.js';
import { createDeviceIcon, getDeviceLabel, getNextDeviceMode } from './deviceIcons.js';

// Configuration constants
const AUTO_COLLAPSE_DELAY_MS = 3000; // 3 seconds
const DEFAULT_BOTTOM_OFFSET = 24; // Default bottom position
const STATUS_PANEL_HEIGHT = 28; // Height of status panel when visible

export interface ICanvasActionButtonsCallbacks {
	onTidyUp: () => void;
	onModeToggle: () => void;
	onPatternToggle: () => void;
	onColorChange: (color: string) => void;
	onDeviceModeChange: (mode: DevicePreset) => void;
}

export interface ICanvasActionButtonsState {
	mode: CanvasMode;
	isOverlapping: boolean;
	pattern: BackgroundPattern;
	backgroundColor: string;
	isExpanded: boolean;
	statusPanelVisible: boolean; // Whether status panel is visible (affects bottom offset)
	deviceMode: DevicePreset;
}

export class CanvasActionButtons extends Disposable {
	private container: HTMLElement;
	private buttonsContainer: HTMLElement | undefined;
	private toggleButton: HTMLElement | undefined;
	private deviceToggleButton: HTMLElement | undefined;  // Independent device mode toggle
	private colorInput: HTMLInputElement | undefined;
	private autoCollapseTimer: ReturnType<typeof setTimeout> | undefined;

	private state: ICanvasActionButtonsState = {
		mode: 'grid',
		isOverlapping: false,
		pattern: 'dots',
		backgroundColor: '#1a1a1a',
		isExpanded: false,
		statusPanelVisible: true, // Default to true since status panel is visible by default
		deviceMode: 'auto'
	};

	constructor(
		private parent: HTMLElement,
		private callbacks: ICanvasActionButtonsCallbacks
	) {
		super();
		this.container = document.createElement('div');
		this.render();
		this.parent.appendChild(this.container);
	}

	private render(): void {
		// Calculate bottom offset based on status panel visibility
		const bottomOffset = this.state.statusPanelVisible
			? DEFAULT_BOTTOM_OFFSET + STATUS_PANEL_HEIGHT // Just above status panel
			: DEFAULT_BOTTOM_OFFSET;

		// Main container - floating at bottom right
		this.container.style.cssText = `
			position: absolute;
			bottom: ${bottomOffset}px;
			right: 24px;
			z-index: 1000;
			pointer-events: auto;
			display: flex;
			flex-direction: column;
			gap: 8px;
			align-items: center;
			transition: bottom 0.2s ease;
		`;

		// Clear and rebuild
		clearNode(this.container);

		// Create expandable buttons panel
		this.buttonsContainer = this.createButtonsPanel();
		this.container.appendChild(this.buttonsContainer);

		// Create toggle button (always visible)
		this.toggleButton = this.createToggleButton();
		this.container.appendChild(this.toggleButton);

		// Add overlap warning if needed (shown above toggle when collapsed)
		if (this.state.isOverlapping && this.state.mode === 'free') {
			const warning = this.createOverlapWarning();
			this.container.insertBefore(warning, this.buttonsContainer);
		}

		// Create device toggle button at top-right (independent floating button)
		// Remove old one first if it exists
		if (this.deviceToggleButton && this.deviceToggleButton.parentElement) {
			this.deviceToggleButton.parentElement.removeChild(this.deviceToggleButton);
		}
		this.deviceToggleButton = this.createDeviceToggleButton();
		this.parent.appendChild(this.deviceToggleButton);

		// Setup hover listeners for auto-collapse
		this.setupAutoCollapse();
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
			box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.2);
			overflow: hidden;
			transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
			transform-origin: bottom center;
			opacity: ${this.state.isExpanded ? '1' : '0'};
			transform: ${this.state.isExpanded ? 'scaleY(1) translateY(0)' : 'scaleY(0.8) translateY(10px)'};
			pointer-events: ${this.state.isExpanded ? 'auto' : 'none'};
			max-height: ${this.state.isExpanded ? '400px' : '0'};
		`;

		// === TOP: Color Picker ===
		const colorBtn = this.createColorButton();
		panel.appendChild(colorBtn);

		// === Pattern Toggle ===
		const patternBtn = this.createActionButton(
			`Background: ${this.state.pattern}`,
			this.createPatternIcon(this.state.pattern),
			false,
			() => this.callbacks.onPatternToggle()
		);
		panel.appendChild(patternBtn);

		// === Separator ===
		const separator = document.createElement('div');
		separator.style.cssText = `
			height: 1px;
			background: rgba(255, 255, 255, 0.1);
			margin: 2px 0;
		`;
		panel.appendChild(separator);

		// === Grid/Free Mode Toggle ===
		const modeBtn = this.createActionButton(
			this.state.mode === 'grid' ? 'Grid Mode' : 'Free Mode',
			this.state.mode === 'grid' ? this.createGridIcon() : this.createFreeIcon(),
			this.state.mode === 'grid',
			() => this.callbacks.onModeToggle()
		);
		panel.appendChild(modeBtn);

		// === BOTTOM: Tidy Up ===
		const tidyUpBtn = this.createActionButton(
			'Tidy Up',
			this.createTidyUpIcon(),
			false,
			() => this.callbacks.onTidyUp()
		);
		panel.appendChild(tidyUpBtn);

		return panel;
	}

	private createToggleButton(): HTMLElement {
		const btn = document.createElement('button');
		btn.title = this.state.isExpanded ? 'Collapse panel' : 'Expand panel';
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

		// Arrow icon
		const arrow = this.createArrowIcon(this.state.isExpanded);
		btn.appendChild(arrow);

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

		// Click to toggle
		btn.addEventListener('click', () => {
			this.state.isExpanded = !this.state.isExpanded;
			this.render();

			// Reset auto-collapse timer when manually toggling
			if (this.state.isExpanded) {
				this.startAutoCollapseTimer();
			}
		});

		return btn;
	}

	/**
	 * Create device toggle button - floating at top-right corner
	 * Same style as expand button (44x44px, circular, glass-morphism)
	 * Shows "A" for Auto mode, SVG icons for others
	 */
	private createDeviceToggleButton(): HTMLElement {
		const btn = document.createElement('button');
		const label = getDeviceLabel(this.state.deviceMode);
		btn.title = `Device: ${label} (click to cycle)`;
		btn.style.cssText = `
			position: absolute;
			top: 24px;
			right: 24px;
			z-index: 1000;
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
			color: ${this.state.deviceMode !== 'auto' ? '#60a5fa' : 'rgba(255, 255, 255, 0.8)'};
			box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
		`;

		// For Auto mode, show "A" text; for others show icons
		if (this.state.deviceMode === 'auto') {
			const text = document.createElement('span');
			text.textContent = 'A';
			text.style.cssText = `
				font-size: 18px;
				font-weight: 600;
				font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
			`;
			btn.appendChild(text);
		} else {
			const icon = createDeviceIcon(this.state.deviceMode, 20);
			btn.appendChild(icon);
		}

		// Hover effects
		btn.addEventListener('mouseenter', () => {
			btn.style.background = 'rgba(59, 130, 246, 0.3)';
			btn.style.color = '#60a5fa';
			btn.style.transform = 'scale(1.05)';
		});

		btn.addEventListener('mouseleave', () => {
			btn.style.background = 'rgba(28, 28, 30, 0.9)';
			btn.style.color = this.state.deviceMode !== 'auto' ? '#60a5fa' : 'rgba(255, 255, 255, 0.8)';
			btn.style.transform = 'scale(1)';
		});

		// Click to cycle device mode
		btn.addEventListener('click', () => {
			this.cycleDeviceMode();
		});

		return btn;
	}

	private createArrowIcon(isExpanded: boolean): SVGElement {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('width', '20');
		svg.setAttribute('height', '20');
		svg.setAttribute('viewBox', '0 0 24 24');
		svg.setAttribute('fill', 'none');
		svg.style.transition = 'transform 0.25s ease';
		svg.style.transform = isExpanded ? 'rotate(180deg)' : 'rotate(0deg)';

		const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		// Chevron up arrow
		path.setAttribute('d', 'M18 15L12 9L6 15');
		path.setAttribute('stroke', 'currentColor');
		path.setAttribute('stroke-width', '2');
		path.setAttribute('stroke-linecap', 'round');
		path.setAttribute('stroke-linejoin', 'round');
		svg.appendChild(path);

		return svg;
	}

	private setupAutoCollapse(): void {
		// Clear any existing timer
		this.clearAutoCollapseTimer();

		// Add hover listeners to container
		this.container.addEventListener('mouseenter', () => {
			this.clearAutoCollapseTimer();
		});

		this.container.addEventListener('mouseleave', () => {
			if (this.state.isExpanded) {
				this.startAutoCollapseTimer();
			}
		});
	}

	private startAutoCollapseTimer(): void {
		this.clearAutoCollapseTimer();
		this.autoCollapseTimer = setTimeout(() => {
			if (this.state.isExpanded) {
				this.state.isExpanded = false;
				this.render();
			}
		}, AUTO_COLLAPSE_DELAY_MS);
	}

	private clearAutoCollapseTimer(): void {
		if (this.autoCollapseTimer) {
			clearTimeout(this.autoCollapseTimer);
			this.autoCollapseTimer = undefined;
		}
	}

	private createActionButton(
		title: string,
		icon: SVGElement,
		isActive: boolean,
		onClick: () => void
	): HTMLElement {
		const btn = document.createElement('button');
		btn.title = title;
		btn.style.cssText = `
			display: flex;
			align-items: center;
			justify-content: center;
			width: 40px;
			height: 40px;
			padding: 0;
			background: ${isActive ? 'rgba(59, 130, 246, 0.25)' : 'transparent'};
			border: none;
			border-radius: 10px;
			cursor: pointer;
			transition: all 0.15s ease;
			color: ${isActive ? '#60a5fa' : 'rgba(255, 255, 255, 0.7)'};
		`;

		btn.appendChild(icon);

		btn.addEventListener('mouseenter', () => {
			if (!isActive) {
				btn.style.background = 'rgba(255, 255, 255, 0.1)';
				btn.style.color = 'rgba(255, 255, 255, 0.9)';
			}
		});

		btn.addEventListener('mouseleave', () => {
			if (!isActive) {
				btn.style.background = 'transparent';
				btn.style.color = 'rgba(255, 255, 255, 0.7)';
			}
		});

		btn.addEventListener('click', onClick);

		return btn;
	}

	private createColorButton(): HTMLElement {
		const btn = document.createElement('button');
		btn.title = 'Background color';
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
			position: relative;
		`;

		// Color preview circle
		const colorPreview = document.createElement('div');
		colorPreview.style.cssText = `
			width: 24px;
			height: 24px;
			border-radius: 50%;
			background: ${this.state.backgroundColor};
			border: 2px solid rgba(255, 255, 255, 0.3);
			box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.2);
			transition: transform 0.15s ease;
		`;
		btn.appendChild(colorPreview);

		// Hidden color input
		this.colorInput = document.createElement('input');
		this.colorInput.type = 'color';
		this.colorInput.value = this.state.backgroundColor;
		this.colorInput.style.cssText = `
			position: absolute;
			opacity: 0;
			width: 100%;
			height: 100%;
			cursor: pointer;
		`;
		btn.appendChild(this.colorInput);

		// Color change handler
		this.colorInput.addEventListener('input', (e) => {
			const color = (e.target as HTMLInputElement).value;
			colorPreview.style.background = color;
			this.callbacks.onColorChange(color);
		});

		// Hover effects
		btn.addEventListener('mouseenter', () => {
			btn.style.background = 'rgba(255, 255, 255, 0.1)';
			colorPreview.style.transform = 'scale(1.1)';
		});

		btn.addEventListener('mouseleave', () => {
			btn.style.background = 'transparent';
			colorPreview.style.transform = 'scale(1)';
		});

		return btn;
	}

	private createOverlapWarning(): HTMLElement {
		const warning = document.createElement('div');
		warning.style.cssText = `
			display: flex;
			align-items: center;
			justify-content: center;
			width: 32px;
			height: 32px;
			background: rgba(251, 191, 36, 0.2);
			backdrop-filter: blur(10px);
			border: 1px solid rgba(251, 191, 36, 0.4);
			border-radius: 50%;
			font-size: 14px;
			color: #fbbf24;
			margin-bottom: 4px;
			animation: pulse 1.5s ease-in-out infinite;
		`;
		warning.textContent = '⚠';

		// Add pulse animation
		const style = document.createElement('style');
		style.textContent = `
			@keyframes pulse {
				0%, 100% { transform: scale(1); opacity: 1; }
				50% { transform: scale(1.1); opacity: 0.8; }
			}
		`;
		warning.appendChild(style);

		return warning;
	}

	// ============================================
	// SVG Icons
	// ============================================

	private createGridIcon(): SVGElement {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('width', '20');
		svg.setAttribute('height', '20');
		svg.setAttribute('viewBox', '0 0 24 24');
		svg.setAttribute('fill', 'none');

		const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path.setAttribute('d', 'M3 3H10V10H3V3ZM14 3H21V10H14V3ZM3 14H10V21H3V14ZM14 14H21V21H14V14Z');
		path.setAttribute('stroke', 'currentColor');
		path.setAttribute('stroke-width', '1.5');
		path.setAttribute('stroke-linejoin', 'round');
		svg.appendChild(path);

		return svg;
	}

	private createFreeIcon(): SVGElement {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('width', '20');
		svg.setAttribute('height', '20');
		svg.setAttribute('viewBox', '0 0 24 24');
		svg.setAttribute('fill', 'none');

		const positions = [
			{ x: 2, y: 4, w: 7, h: 7 },
			{ x: 12, y: 2, w: 7, h: 7 },
			{ x: 6, y: 13, w: 7, h: 7 },
			{ x: 15, y: 15, w: 7, h: 7 }
		];

		for (const { x, y, w, h } of positions) {
			const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
			rect.setAttribute('x', String(x));
			rect.setAttribute('y', String(y));
			rect.setAttribute('width', String(w));
			rect.setAttribute('height', String(h));
			rect.setAttribute('rx', '1');
			rect.setAttribute('stroke', 'currentColor');
			rect.setAttribute('stroke-width', '1.5');
			svg.appendChild(rect);
		}

		return svg;
	}

	private createTidyUpIcon(): SVGElement {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('width', '20');
		svg.setAttribute('height', '20');
		svg.setAttribute('viewBox', '0 0 24 24');
		svg.setAttribute('fill', 'none');

		const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path.setAttribute('d', 'M4 4H8V8H4V4ZM10 4H14V8H10V4ZM16 4H20V8H16V4ZM4 10H8V14H4V10ZM16 10H20V14H16V10ZM4 16H8V20H4V16ZM10 16H14V20H10V16ZM16 16H20V20H16V16Z');
		path.setAttribute('stroke', 'currentColor');
		path.setAttribute('stroke-width', '1.5');
		path.setAttribute('stroke-linejoin', 'round');
		svg.appendChild(path);

		const arrows = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		arrows.setAttribute('d', 'M12 10V14M10 12H14');
		arrows.setAttribute('stroke', 'currentColor');
		arrows.setAttribute('stroke-width', '2');
		arrows.setAttribute('stroke-linecap', 'round');
		svg.appendChild(arrows);

		return svg;
	}

	private createPatternIcon(pattern: BackgroundPattern): SVGElement {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('width', '20');
		svg.setAttribute('height', '20');
		svg.setAttribute('viewBox', '0 0 24 24');
		svg.setAttribute('fill', 'none');

		if (pattern === 'grid') {
			const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
			path.setAttribute('d', 'M3 9H21M3 15H21M9 3V21M15 3V21');
			path.setAttribute('stroke', 'currentColor');
			path.setAttribute('stroke-width', '1.5');
			path.setAttribute('stroke-linecap', 'round');
			svg.appendChild(path);
		} else if (pattern === 'dots') {
			const positions = [
				[6, 6], [12, 6], [18, 6],
				[6, 12], [12, 12], [18, 12],
				[6, 18], [12, 18], [18, 18]
			];
			for (const [cx, cy] of positions) {
				const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
				circle.setAttribute('cx', String(cx));
				circle.setAttribute('cy', String(cy));
				circle.setAttribute('r', '2');
				circle.setAttribute('fill', 'currentColor');
				svg.appendChild(circle);
			}
		} else {
			const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
			rect.setAttribute('x', '4');
			rect.setAttribute('y', '4');
			rect.setAttribute('width', '16');
			rect.setAttribute('height', '16');
			rect.setAttribute('rx', '2');
			rect.setAttribute('stroke', 'currentColor');
			rect.setAttribute('stroke-width', '1.5');
			rect.setAttribute('fill', 'none');
			svg.appendChild(rect);
		}

		return svg;
	}

	private cycleDeviceMode(): void {
		const nextMode = getNextDeviceMode(this.state.deviceMode);
		this.state.deviceMode = nextMode;
		this.callbacks.onDeviceModeChange(nextMode);
		this.render();
	}

	// ============================================
	// Public Methods
	// ============================================

	public setState(state: Partial<ICanvasActionButtonsState>): void {
		Object.assign(this.state, state);
		this.render();
	}

	public getState(): ICanvasActionButtonsState {
		return { ...this.state };
	}

	public setMode(mode: CanvasMode): void {
		this.state.mode = mode;
		this.render();
	}

	public setOverlapping(isOverlapping: boolean): void {
		this.state.isOverlapping = isOverlapping;
		this.render();
	}

	public setPattern(pattern: BackgroundPattern): void {
		this.state.pattern = pattern;
		this.render();
	}

	public setBackgroundColor(color: string): void {
		this.state.backgroundColor = color;
		this.render();
	}

	public expand(): void {
		this.state.isExpanded = true;
		this.render();
		this.startAutoCollapseTimer();
	}

	public collapse(): void {
		this.state.isExpanded = false;
		this.render();
	}

	public setStatusPanelVisible(visible: boolean): void {
		this.state.statusPanelVisible = visible;
		this.render();
	}

	public setDeviceMode(mode: DevicePreset): void {
		this.state.deviceMode = mode;
		this.render();
	}

	public setVisible(visible: boolean): void {
		this.container.style.display = visible ? '' : 'none';
		if (this.deviceToggleButton) {
			this.deviceToggleButton.style.display = visible ? '' : 'none';
		}
	}

	public override dispose(): void {
		this.clearAutoCollapseTimer();
		if (this.container.parentElement) {
			this.container.parentElement.removeChild(this.container);
		}
		// Also remove the device toggle button (it's appended to parent, not container)
		if (this.deviceToggleButton && this.deviceToggleButton.parentElement) {
			this.deviceToggleButton.parentElement.removeChild(this.deviceToggleButton);
		}
		super.dispose();
	}
}
