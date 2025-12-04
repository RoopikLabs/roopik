/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * BottomActionBar - Native DOM component for canvas actions
 *
 * A floating action bar at the bottom center of the canvas providing:
 * - Selection tools (Select, Inspect, Rectangle select)
 * - AI Assistant
 * - View mode toggle (Preview/Code)
 */

import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { clearNode } from '../../../../../../base/browser/dom.js';

export interface IBottomActionBarCallbacks {
	onSelectMode: () => void;
	onInspectMode: () => void;
	onRectangleMode: () => void;
	onAIChat: () => void;
	onViewModeToggle: () => void;
}

// Configuration constants
const DEFAULT_BOTTOM_OFFSET = 24; // Default bottom position
const STATUS_PANEL_HEIGHT = 28; // Height of status panel when visible

export interface IBottomActionBarState {
	isSelectMode: boolean;
	isInspectMode: boolean;
	isRectangleMode: boolean;
	viewMode: 'preview' | 'code';
	statusPanelVisible: boolean; // Whether status panel is visible (affects bottom offset)
}

export class BottomActionBar extends Disposable {
	private container: HTMLElement;
	private state: IBottomActionBarState = {
		isSelectMode: false,
		isInspectMode: false,
		isRectangleMode: false,
		viewMode: 'preview',
		statusPanelVisible: true // Default to true since status panel is visible by default
	};

	constructor(
		private parent: HTMLElement,
		private callbacks: IBottomActionBarCallbacks
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

		// Main container - floating at bottom center
		this.container.style.cssText = `
			position: absolute;
			bottom: ${bottomOffset}px;
			left: 50%;
			transform: translateX(-50%);
			z-index: 1000;
			pointer-events: auto;
			transition: bottom 0.2s ease;
		`;

		// Action bar container with glass effect
		const actionBar = document.createElement('div');
		actionBar.style.cssText = `
			display: flex;
			align-items: center;
			gap: 4px;
			padding: 8px 12px;
			background: rgba(28, 28, 30, 0.92);
			backdrop-filter: blur(20px) saturate(180%);
			-webkit-backdrop-filter: blur(20px) saturate(180%);
			border: 1px solid rgba(255, 255, 255, 0.08);
			border-radius: 16px;
			box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.2);
		`;

		// Selection Tools Section
		const selectionSection = document.createElement('div');
		selectionSection.style.cssText = `display: flex; align-items: center; gap: 4px;`;

		// Select Mode Button
		selectionSection.appendChild(this.createActionButton(
			'Select Mode (V)',
			this.createSelectIcon(),
			this.state.isSelectMode,
			() => {
				this.state.isSelectMode = !this.state.isSelectMode;
				if (this.state.isSelectMode) {
					this.state.isInspectMode = false;
					this.state.isRectangleMode = false;
				}
				this.callbacks.onSelectMode();
				this.render();
			}
		));

		// Inspect Mode Button
		selectionSection.appendChild(this.createActionButton(
			'Inspect Mode (I)',
			this.createInspectIcon(),
			this.state.isInspectMode,
			() => {
				this.state.isInspectMode = !this.state.isInspectMode;
				if (this.state.isInspectMode) {
					this.state.isSelectMode = false;
					this.state.isRectangleMode = false;
				}
				this.callbacks.onInspectMode();
				this.render();
			}
		));

		// Rectangle Select Button
		selectionSection.appendChild(this.createActionButton(
			'Drag Selection (R)',
			this.createRectangleIcon(),
			this.state.isRectangleMode,
			() => {
				this.state.isRectangleMode = !this.state.isRectangleMode;
				if (this.state.isRectangleMode) {
					this.state.isSelectMode = false;
					this.state.isInspectMode = false;
				}
				this.callbacks.onRectangleMode();
				this.render();
			}
		));

		actionBar.appendChild(selectionSection);

		// Divider
		actionBar.appendChild(this.createDivider());

		// AI Assistant Button
		actionBar.appendChild(this.createActionButton(
			'AI Assistant (⌘K)',
			this.createAIIcon(),
			false,
			() => this.callbacks.onAIChat()
		));

		// Divider
		actionBar.appendChild(this.createDivider());

		// View Mode Toggle Section
		const viewSection = document.createElement('div');
		viewSection.style.cssText = `display: flex; align-items: center; gap: 2px;`;

		// Preview Mode Button
		viewSection.appendChild(this.createActionButton(
			'Preview Mode',
			this.createPreviewIcon(),
			this.state.viewMode === 'preview',
			() => {
				this.state.viewMode = 'preview';
				this.callbacks.onViewModeToggle();
				this.render();
			}
		));

		// Code Mode Button
		viewSection.appendChild(this.createActionButton(
			'Code Mode',
			this.createCodeIcon(),
			this.state.viewMode === 'code',
			() => {
				this.state.viewMode = 'code';
				this.callbacks.onViewModeToggle();
				this.render();
			}
		));

		actionBar.appendChild(viewSection);

		// Clear and rebuild
		clearNode(this.container);
		this.container.appendChild(actionBar);
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
			width: 36px;
			height: 36px;
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
				btn.style.background = 'rgba(255, 255, 255, 0.08)';
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

	private createDivider(): HTMLElement {
		const divider = document.createElement('div');
		divider.style.cssText = `
			width: 1px;
			height: 24px;
			background: rgba(255, 255, 255, 0.1);
			margin: 0 8px;
		`;
		return divider;
	}

	// SVG Icons
	private createSelectIcon(): SVGElement {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('width', '20');
		svg.setAttribute('height', '20');
		svg.setAttribute('viewBox', '0 0 20 20');
		svg.setAttribute('fill', 'none');

		const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path.setAttribute('d', 'M3 3L17 10L10 10.5L7 17L3 3Z');
		path.setAttribute('stroke', 'currentColor');
		path.setAttribute('stroke-width', '1.5');
		path.setAttribute('stroke-linejoin', 'round');
		svg.appendChild(path);

		return svg;
	}

	private createInspectIcon(): SVGElement {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('width', '20');
		svg.setAttribute('height', '20');
		svg.setAttribute('viewBox', '0 0 20 20');
		svg.setAttribute('fill', 'none');

		const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path.setAttribute('d', 'M10 3V17M3 10H17');
		path.setAttribute('stroke', 'currentColor');
		path.setAttribute('stroke-width', '1.5');
		path.setAttribute('stroke-linecap', 'round');
		svg.appendChild(path);

		const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
		circle.setAttribute('cx', '10');
		circle.setAttribute('cy', '10');
		circle.setAttribute('r', '3');
		circle.setAttribute('stroke', 'currentColor');
		circle.setAttribute('stroke-width', '1.5');
		circle.setAttribute('fill', 'none');
		svg.appendChild(circle);

		return svg;
	}

	private createRectangleIcon(): SVGElement {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('width', '20');
		svg.setAttribute('height', '20');
		svg.setAttribute('viewBox', '0 0 20 20');
		svg.setAttribute('fill', 'none');

		const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
		rect.setAttribute('x', '3');
		rect.setAttribute('y', '3');
		rect.setAttribute('width', '14');
		rect.setAttribute('height', '14');
		rect.setAttribute('stroke', 'currentColor');
		rect.setAttribute('stroke-width', '1.5');
		rect.setAttribute('stroke-dasharray', '2 2');
		rect.setAttribute('fill', 'none');
		svg.appendChild(rect);

		return svg;
	}

	private createAIIcon(): SVGElement {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('width', '20');
		svg.setAttribute('height', '20');
		svg.setAttribute('viewBox', '0 0 20 20');
		svg.setAttribute('fill', 'none');

		const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path.setAttribute('d', 'M10 3L12 7H16L13 10L14 14L10 12L6 14L7 10L4 7H8L10 3Z');
		path.setAttribute('stroke', 'currentColor');
		path.setAttribute('stroke-width', '1.5');
		path.setAttribute('stroke-linejoin', 'round');
		svg.appendChild(path);

		return svg;
	}

	private createPreviewIcon(): SVGElement {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('width', '20');
		svg.setAttribute('height', '20');
		svg.setAttribute('viewBox', '0 0 20 20');
		svg.setAttribute('fill', 'none');

		const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
		rect.setAttribute('x', '2');
		rect.setAttribute('y', '4');
		rect.setAttribute('width', '16');
		rect.setAttribute('height', '12');
		rect.setAttribute('rx', '2');
		rect.setAttribute('stroke', 'currentColor');
		rect.setAttribute('stroke-width', '1.5');
		rect.setAttribute('fill', 'none');
		svg.appendChild(rect);

		const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path.setAttribute('d', 'M6 8H14M6 11H11');
		path.setAttribute('stroke', 'currentColor');
		path.setAttribute('stroke-width', '1.5');
		path.setAttribute('stroke-linecap', 'round');
		svg.appendChild(path);

		return svg;
	}

	private createCodeIcon(): SVGElement {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('width', '20');
		svg.setAttribute('height', '20');
		svg.setAttribute('viewBox', '0 0 20 20');
		svg.setAttribute('fill', 'none');

		const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path.setAttribute('d', 'M7 6L3 10L7 14M13 6L17 10L13 14');
		path.setAttribute('stroke', 'currentColor');
		path.setAttribute('stroke-width', '1.5');
		path.setAttribute('stroke-linecap', 'round');
		path.setAttribute('stroke-linejoin', 'round');
		svg.appendChild(path);

		return svg;
	}

	// Public methods to update state from outside
	public setState(state: Partial<IBottomActionBarState>): void {
		Object.assign(this.state, state);
		this.render();
	}

	public getState(): IBottomActionBarState {
		return { ...this.state };
	}

	public setStatusPanelVisible(visible: boolean): void {
		if (this.state.statusPanelVisible !== visible) {
			this.state.statusPanelVisible = visible;
			this.render();
		}
	}

	public setVisible(visible: boolean): void {
		this.container.style.display = visible ? '' : 'none';
	}

	public override dispose(): void {
		if (this.container.parentElement) {
			this.container.parentElement.removeChild(this.container);
		}
		super.dispose();
	}
}
