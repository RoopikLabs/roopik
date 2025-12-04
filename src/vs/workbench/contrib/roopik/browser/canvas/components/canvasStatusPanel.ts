/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * CanvasStatusPanel - Bottom status bar for canvas controls
 *
 * Positioned at the bottom of the canvas, provides:
 * - Zoom controls (zoom in, zoom out, zoom level display, fit to screen)
 * - Reset positions button (center all components)
 * - Selected sandbox info (name/ID)
 * - Component count
 *
 * Design: VSCode-style status bar with glass-morphism
 * Can be hidden via visibility flag (for settings later)
 */

import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { clearNode } from '../../../../../../base/browser/dom.js';
import type { CanvasMode } from '../services/gridManager.js';
import type { DevicePreset } from '../../../common/canvas/canvasTypes.js';

// Configuration constants
const MIN_ZOOM = 0.1;    // 10%
const MAX_ZOOM = 3.0;    // 300%
const ZOOM_STEP = 0.1;   // 10% per click

export interface ICanvasStatusPanelCallbacks {
	onZoomIn: () => void;
	onZoomOut: () => void;
	onZoomReset: () => void;  // Reset to 100%
	onFitToScreen: () => void;
	onResetPositions: () => void;
	onDeviceModeChange?: (mode: DevicePreset) => void;  // Global device mode change
}

export interface ICanvasStatusPanelState {
	zoom: number;               // Current zoom level (1 = 100%)
	selectedSandboxId: string | null;
	selectedSandboxName: string | null;
	componentCount: number;
	mode: CanvasMode;
	isVisible: boolean;
	globalDeviceMode: DevicePreset;  // Global device emulation mode
}

export class CanvasStatusPanel extends Disposable {
	private container: HTMLElement;

	private state: ICanvasStatusPanelState = {
		zoom: 1,
		selectedSandboxId: null,
		selectedSandboxName: null,
		componentCount: 0,
		mode: 'grid',
		isVisible: true,
		globalDeviceMode: 'auto'
	};

	constructor(
		private parent: HTMLElement,
		private callbacks: ICanvasStatusPanelCallbacks
	) {
		super();
		this.container = document.createElement('div');
		this.render();
		this.parent.appendChild(this.container);
	}

	private render(): void {
		// Hide if visibility is off
		if (!this.state.isVisible) {
			this.container.style.display = 'none';
			return;
		}

		// Main container - status bar at bottom
		this.container.style.cssText = `
			position: absolute;
			bottom: 0;
			left: 0;
			right: 0;
			height: 28px;
			z-index: 900;
			pointer-events: auto;
			display: flex;
			align-items: center;
			justify-content: space-between;
			padding: 0 12px;
			background: rgba(28, 28, 30, 0.85);
			backdrop-filter: blur(12px) saturate(180%);
			-webkit-backdrop-filter: blur(12px) saturate(180%);
			border-top: 1px solid rgba(255, 255, 255, 0.08);
			font-size: 12px;
			color: rgba(255, 255, 255, 0.7);
			font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
		`;

		// Clear and rebuild
		clearNode(this.container);

		// === LEFT SECTION: Component Info ===
		const leftSection = this.createLeftSection();
		this.container.appendChild(leftSection);

		// === CENTER SECTION: Zoom Controls ===
		const centerSection = this.createCenterSection();
		this.container.appendChild(centerSection);

		// === RIGHT SECTION: Reset & Mode ===
		const rightSection = this.createRightSection();
		this.container.appendChild(rightSection);
	}

	private createLeftSection(): HTMLElement {
		const section = document.createElement('div');
		section.style.cssText = `
			display: flex;
			align-items: center;
			gap: 12px;
			min-width: 200px;
		`;

		// Component count badge
		const countBadge = document.createElement('div');
		countBadge.style.cssText = `
			display: flex;
			align-items: center;
			gap: 4px;
			color: rgba(255, 255, 255, 0.6);
		`;

		// Grid icon for component count
		const gridIcon = this.createGridIcon();
		gridIcon.style.opacity = '0.7';
		countBadge.appendChild(gridIcon);

		const countText = document.createElement('span');
		countText.textContent = `${this.state.componentCount} component${this.state.componentCount !== 1 ? 's' : ''}`;
		countBadge.appendChild(countText);

		section.appendChild(countBadge);

		// Separator and selected component name
		if (this.state.selectedSandboxName) {
			const sep = document.createElement('div');
			sep.style.cssText = `
				width: 1px;
				height: 14px;
				background: rgba(255, 255, 255, 0.15);
			`;
			section.appendChild(sep);

			// Selected component info
			const selectedInfo = document.createElement('div');
			selectedInfo.style.cssText = `
				display: flex;
				align-items: center;
				gap: 4px;
				color: rgba(96, 165, 250, 0.9);
				max-width: 180px;
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;
			`;

			// Checkmark icon
			const checkIcon = this.createCheckIcon();
			selectedInfo.appendChild(checkIcon);

			const nameSpan = document.createElement('span');
			nameSpan.title = this.state.selectedSandboxName;
			nameSpan.textContent = this.state.selectedSandboxName;
			selectedInfo.appendChild(nameSpan);

			section.appendChild(selectedInfo);
		}

		return section;
	}

	private createCenterSection(): HTMLElement {
		const section = document.createElement('div');
		section.style.cssText = `
			display: flex;
			align-items: center;
			gap: 4px;
			background: rgba(255, 255, 255, 0.05);
			border-radius: 6px;
			padding: 2px;
		`;

		// Zoom Out Button
		const zoomOutBtn = this.createIconButton(
			'Zoom Out',
			this.createZoomOutIcon(),
			() => this.callbacks.onZoomOut(),
			this.state.zoom <= MIN_ZOOM
		);
		section.appendChild(zoomOutBtn);

		// Zoom Level Display (clickable to reset to 100%)
		const zoomDisplay = document.createElement('button');
		zoomDisplay.title = 'Reset to 100%';
		zoomDisplay.style.cssText = `
			display: flex;
			align-items: center;
			justify-content: center;
			min-width: 52px;
			height: 22px;
			padding: 0 8px;
			background: transparent;
			border: none;
			border-radius: 4px;
			cursor: pointer;
			color: rgba(255, 255, 255, 0.8);
			font-size: 11px;
			font-weight: 500;
			font-family: inherit;
			transition: all 0.15s ease;
		`;
		zoomDisplay.textContent = `${Math.round(this.state.zoom * 100)}%`;

		zoomDisplay.addEventListener('mouseenter', () => {
			zoomDisplay.style.background = 'rgba(255, 255, 255, 0.1)';
			zoomDisplay.style.color = 'rgba(255, 255, 255, 1)';
		});
		zoomDisplay.addEventListener('mouseleave', () => {
			zoomDisplay.style.background = 'transparent';
			zoomDisplay.style.color = 'rgba(255, 255, 255, 0.8)';
		});
		zoomDisplay.addEventListener('click', () => this.callbacks.onZoomReset());
		section.appendChild(zoomDisplay);

		// Zoom In Button
		const zoomInBtn = this.createIconButton(
			'Zoom In',
			this.createZoomInIcon(),
			() => this.callbacks.onZoomIn(),
			this.state.zoom >= MAX_ZOOM
		);
		section.appendChild(zoomInBtn);

		// Separator
		const sep = document.createElement('div');
		sep.style.cssText = `
			width: 1px;
			height: 14px;
			background: rgba(255, 255, 255, 0.15);
			margin: 0 4px;
		`;
		section.appendChild(sep);

		// Fit to Screen Button
		const fitBtn = this.createIconButton(
			'Fit to Screen',
			this.createFitIcon(),
			() => this.callbacks.onFitToScreen()
		);
		section.appendChild(fitBtn);

		return section;
	}

	private createRightSection(): HTMLElement {
		const section = document.createElement('div');
		section.style.cssText = `
			display: flex;
			align-items: center;
			gap: 8px;
			min-width: 200px;
			justify-content: flex-end;
		`;

		// Reset Positions Button
		const resetBtn = document.createElement('button');
		resetBtn.title = 'Reset Positions (Center All)';
		resetBtn.style.cssText = `
			display: flex;
			align-items: center;
			gap: 4px;
			height: 22px;
			padding: 0 8px;
			background: rgba(255, 255, 255, 0.05);
			border: 1px solid rgba(255, 255, 255, 0.1);
			border-radius: 4px;
			cursor: pointer;
			color: rgba(255, 255, 255, 0.7);
			font-size: 11px;
			font-family: inherit;
			transition: all 0.15s ease;
		`;

		const resetIcon = this.createResetIcon();
		resetBtn.appendChild(resetIcon);

		const resetText = document.createElement('span');
		resetText.textContent = 'Reset';
		resetBtn.appendChild(resetText);

		resetBtn.addEventListener('mouseenter', () => {
			resetBtn.style.background = 'rgba(59, 130, 246, 0.2)';
			resetBtn.style.borderColor = 'rgba(59, 130, 246, 0.4)';
			resetBtn.style.color = '#60a5fa';
		});
		resetBtn.addEventListener('mouseleave', () => {
			resetBtn.style.background = 'rgba(255, 255, 255, 0.05)';
			resetBtn.style.borderColor = 'rgba(255, 255, 255, 0.1)';
			resetBtn.style.color = 'rgba(255, 255, 255, 0.7)';
		});
		resetBtn.addEventListener('click', () => this.callbacks.onResetPositions());
		section.appendChild(resetBtn);

		// Mode indicator (Grid/Free)
		const modeIndicator = document.createElement('div');
		modeIndicator.title = this.state.mode === 'grid' ? 'Grid Mode' : 'Free Mode';
		modeIndicator.style.cssText = `
			display: flex;
			align-items: center;
			gap: 4px;
			padding: 0 6px;
			height: 18px;
			background: ${this.state.mode === 'grid' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(139, 92, 246, 0.15)'};
			border-radius: 3px;
			color: ${this.state.mode === 'grid' ? '#60a5fa' : '#a78bfa'};
			font-size: 10px;
			font-weight: 500;
			text-transform: uppercase;
		`;
		modeIndicator.textContent = this.state.mode;
		section.appendChild(modeIndicator);

		// Device mode indicator (minimal single letter: A, D, T, M)
		const deviceIndicator = document.createElement('div');
		const deviceLetter = this.getDeviceLetter(this.state.globalDeviceMode);
		const deviceLabel = this.getDeviceLabel(this.state.globalDeviceMode);
		deviceIndicator.title = `Device: ${deviceLabel}`;
		deviceIndicator.style.cssText = `
			display: flex;
			align-items: center;
			justify-content: center;
			width: 18px;
			height: 18px;
			background: rgba(34, 197, 94, 0.15);
			border-radius: 3px;
			color: #4ade80;
			font-size: 10px;
			font-weight: 600;
			font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
		`;
		deviceIndicator.textContent = deviceLetter;
		section.appendChild(deviceIndicator);

		return section;
	}

	/**
	 * Get single letter for device mode
	 */
	private getDeviceLetter(device: DevicePreset): string {
		switch (device) {
			case 'auto': return 'A';
			case 'desktop': return 'D';
			case 'tablet': return 'T';
			case 'mobile': return 'M';
			default: return 'A';
		}
	}

	/**
	 * Get full label for device mode
	 */
	private getDeviceLabel(device: DevicePreset): string {
		switch (device) {
			case 'auto': return 'Auto';
			case 'desktop': return 'Desktop (1280×800)';
			case 'tablet': return 'Tablet (768×1024)';
			case 'mobile': return 'Mobile (375×667)';
			default: return 'Auto';
		}
	}

	private createIconButton(
		title: string,
		icon: SVGElement,
		onClick: () => void,
		disabled: boolean = false
	): HTMLElement {
		const btn = document.createElement('button');
		btn.title = title;
		btn.disabled = disabled;
		btn.style.cssText = `
			display: flex;
			align-items: center;
			justify-content: center;
			width: 22px;
			height: 22px;
			padding: 0;
			background: transparent;
			border: none;
			border-radius: 4px;
			cursor: ${disabled ? 'not-allowed' : 'pointer'};
			color: ${disabled ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.7)'};
			transition: all 0.15s ease;
			opacity: ${disabled ? '0.5' : '1'};
		`;

		btn.appendChild(icon);

		if (!disabled) {
			btn.addEventListener('mouseenter', () => {
				btn.style.background = 'rgba(255, 255, 255, 0.1)';
				btn.style.color = 'rgba(255, 255, 255, 1)';
			});
			btn.addEventListener('mouseleave', () => {
				btn.style.background = 'transparent';
				btn.style.color = 'rgba(255, 255, 255, 0.7)';
			});
			btn.addEventListener('click', onClick);
		}

		return btn;
	}

	// ============================================
	// SVG Icons (all created programmatically)
	// ============================================

	private createGridIcon(): SVGElement {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('width', '14');
		svg.setAttribute('height', '14');
		svg.setAttribute('viewBox', '0 0 24 24');
		svg.setAttribute('fill', 'none');

		const rects = [
			{ x: 3, y: 3, width: 7, height: 7 },
			{ x: 14, y: 3, width: 7, height: 7 },
			{ x: 3, y: 14, width: 7, height: 7 },
			{ x: 14, y: 14, width: 7, height: 7 }
		];

		for (const r of rects) {
			const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
			rect.setAttribute('x', String(r.x));
			rect.setAttribute('y', String(r.y));
			rect.setAttribute('width', String(r.width));
			rect.setAttribute('height', String(r.height));
			rect.setAttribute('rx', '1');
			rect.setAttribute('stroke', 'currentColor');
			rect.setAttribute('stroke-width', '1.5');
			svg.appendChild(rect);
		}

		return svg;
	}

	private createCheckIcon(): SVGElement {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('width', '12');
		svg.setAttribute('height', '12');
		svg.setAttribute('viewBox', '0 0 24 24');
		svg.setAttribute('fill', 'none');

		const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path.setAttribute('d', 'M9 12l2 2 4-4');
		path.setAttribute('stroke', 'currentColor');
		path.setAttribute('stroke-width', '2');
		path.setAttribute('stroke-linecap', 'round');
		path.setAttribute('stroke-linejoin', 'round');
		svg.appendChild(path);

		const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
		circle.setAttribute('cx', '12');
		circle.setAttribute('cy', '12');
		circle.setAttribute('r', '9');
		circle.setAttribute('stroke', 'currentColor');
		circle.setAttribute('stroke-width', '1.5');
		svg.appendChild(circle);

		return svg;
	}

	private createZoomInIcon(): SVGElement {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('width', '14');
		svg.setAttribute('height', '14');
		svg.setAttribute('viewBox', '0 0 24 24');
		svg.setAttribute('fill', 'none');

		const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
		circle.setAttribute('cx', '11');
		circle.setAttribute('cy', '11');
		circle.setAttribute('r', '7');
		circle.setAttribute('stroke', 'currentColor');
		circle.setAttribute('stroke-width', '1.5');
		svg.appendChild(circle);

		const searchPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		searchPath.setAttribute('d', 'M21 21L16.65 16.65');
		searchPath.setAttribute('stroke', 'currentColor');
		searchPath.setAttribute('stroke-width', '1.5');
		searchPath.setAttribute('stroke-linecap', 'round');
		svg.appendChild(searchPath);

		const plusPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		plusPath.setAttribute('d', 'M11 8V14M8 11H14');
		plusPath.setAttribute('stroke', 'currentColor');
		plusPath.setAttribute('stroke-width', '1.5');
		plusPath.setAttribute('stroke-linecap', 'round');
		svg.appendChild(plusPath);

		return svg;
	}

	private createZoomOutIcon(): SVGElement {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('width', '14');
		svg.setAttribute('height', '14');
		svg.setAttribute('viewBox', '0 0 24 24');
		svg.setAttribute('fill', 'none');

		const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
		circle.setAttribute('cx', '11');
		circle.setAttribute('cy', '11');
		circle.setAttribute('r', '7');
		circle.setAttribute('stroke', 'currentColor');
		circle.setAttribute('stroke-width', '1.5');
		svg.appendChild(circle);

		const searchPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		searchPath.setAttribute('d', 'M21 21L16.65 16.65');
		searchPath.setAttribute('stroke', 'currentColor');
		searchPath.setAttribute('stroke-width', '1.5');
		searchPath.setAttribute('stroke-linecap', 'round');
		svg.appendChild(searchPath);

		const minusPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		minusPath.setAttribute('d', 'M8 11H14');
		minusPath.setAttribute('stroke', 'currentColor');
		minusPath.setAttribute('stroke-width', '1.5');
		minusPath.setAttribute('stroke-linecap', 'round');
		svg.appendChild(minusPath);

		return svg;
	}

	private createFitIcon(): SVGElement {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('width', '14');
		svg.setAttribute('height', '14');
		svg.setAttribute('viewBox', '0 0 24 24');
		svg.setAttribute('fill', 'none');

		// Corner paths
		const cornerPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		cornerPath.setAttribute('d', 'M8 3H5C3.89543 3 3 3.89543 3 5V8M16 3H19C20.1046 3 21 3.89543 21 5V8M8 21H5C3.89543 21 3 20.1046 3 19V16M16 21H19C20.1046 21 21 20.1046 21 19V16');
		cornerPath.setAttribute('stroke', 'currentColor');
		cornerPath.setAttribute('stroke-width', '1.5');
		cornerPath.setAttribute('stroke-linecap', 'round');
		svg.appendChild(cornerPath);

		// Center rect
		const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
		rect.setAttribute('x', '7');
		rect.setAttribute('y', '7');
		rect.setAttribute('width', '10');
		rect.setAttribute('height', '10');
		rect.setAttribute('rx', '1');
		rect.setAttribute('stroke', 'currentColor');
		rect.setAttribute('stroke-width', '1.5');
		svg.appendChild(rect);

		return svg;
	}

	private createResetIcon(): SVGElement {
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
		path.setAttribute('fill', 'currentColor');

		svg.appendChild(path);
		return svg;
	}



	// ============================================
	// Public Methods
	// ============================================

	public setState(state: Partial<ICanvasStatusPanelState>): void {
		Object.assign(this.state, state);
		this.render();
	}

	public getState(): ICanvasStatusPanelState {
		return { ...this.state };
	}

	public setZoom(zoom: number): void {
		this.state.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
		this.render();
	}

	public setSelectedSandbox(id: string | null, name: string | null): void {
		this.state.selectedSandboxId = id;
		this.state.selectedSandboxName = name;
		this.render();
	}

	public setComponentCount(count: number): void {
		this.state.componentCount = count;
		this.render();
	}

	public setMode(mode: CanvasMode): void {
		this.state.mode = mode;
		this.render();
	}

	public setGlobalDeviceMode(mode: DevicePreset): void {
		this.state.globalDeviceMode = mode;
		this.render();
	}

	public getGlobalDeviceMode(): DevicePreset {
		return this.state.globalDeviceMode;
	}

	public setVisible(visible: boolean): void {
		this.state.isVisible = visible;
		this.render();
	}

	public isVisible(): boolean {
		return this.state.isVisible;
	}

	/**
	 * Get zoom step for increment/decrement
	 */
	public static getZoomStep(): number {
		return ZOOM_STEP;
	}

	/**
	 * Get min/max zoom limits
	 */
	public static getZoomLimits(): { min: number; max: number } {
		return { min: MIN_ZOOM, max: MAX_ZOOM };
	}

	public override dispose(): void {
		if (this.container.parentElement) {
			this.container.parentElement.removeChild(this.container);
		}
		super.dispose();
	}
}
