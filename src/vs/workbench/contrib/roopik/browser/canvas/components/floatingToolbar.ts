/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * FloatingToolbar - Native DOM component for testing sample components
 *
 * A floating toolbar at the top of the canvas that provides quick access
 * to load sample components for testing the Mode 1 preview system.
 */

import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { clearNode } from '../../../../../../base/browser/dom.js';
import { SAMPLE_COMPONENTS } from '../data/sampleComponents.js';

export interface IFloatingToolbarCallbacks {
	onLoadSample: (sampleId: string) => void;
	onLoadAll: () => void;
	onClearAll: () => void;
}

export class FloatingToolbar extends Disposable {
	private container: HTMLElement;
	private isExpanded: boolean = false;

	constructor(
		private parent: HTMLElement,
		private callbacks: IFloatingToolbarCallbacks
	) {
		super();
		this.container = document.createElement('div');
		this.render();
		this.parent.appendChild(this.container);
	}

	private render(): void {
		// Main container - floating at top center
		this.container.style.cssText = `
			position: absolute;
			top: 16px;
			left: 50%;
			transform: translateX(-50%);
			z-index: 1000;
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: 8px;
			pointer-events: auto;
		`;

		// Main toolbar bar
		const toolbar = document.createElement('div');
		toolbar.style.cssText = `
			display: flex;
			align-items: center;
			gap: 8px;
			padding: 8px 16px;
			background: rgba(30, 30, 30, 0.85);
			backdrop-filter: blur(12px);
			-webkit-backdrop-filter: blur(12px);
			border: 1px solid rgba(255, 255, 255, 0.1);
			border-radius: 12px;
			box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
		`;

		// Canvas label
		const label = document.createElement('span');
		label.textContent = '🎨 Canvas';
		label.style.cssText = `
			font-size: 14px;
			font-weight: 600;
			color: #e0e0e0;
			margin-right: 8px;
		`;
		toolbar.appendChild(label);

		// Separator
		const sep1 = this.createSeparator();
		toolbar.appendChild(sep1);

		// Load All button
		const loadAllBtn = this.createButton('Load All', '#4fc3f7', () => {
			this.callbacks.onLoadAll();
		});
		toolbar.appendChild(loadAllBtn);

		// Toggle samples dropdown button
		const toggleBtn = this.createButton(
			this.isExpanded ? '▲ Samples' : '▼ Samples',
			'#7c87f7',
			() => {
				this.isExpanded = !this.isExpanded;
				this.render();
			}
		);
		toolbar.appendChild(toggleBtn);

		// Separator
		const sep2 = this.createSeparator();
		toolbar.appendChild(sep2);

		// Clear All button
		const clearBtn = this.createButton('Clear', '#ff6b6b', () => {
			this.callbacks.onClearAll();
		});
		toolbar.appendChild(clearBtn);

		// Samples dropdown panel
		let dropdown: HTMLElement | null = null;
		if (this.isExpanded) {
			dropdown = this.createDropdown();
		}

		// Clear and rebuild (use clearNode for Trusted Types compliance)
		clearNode(this.container);
		this.container.appendChild(toolbar);
		if (dropdown) {
			this.container.appendChild(dropdown);
		}
	}

	private createButton(text: string, color: string, onClick: () => void): HTMLElement {
		const btn = document.createElement('button');
		btn.textContent = text;
		btn.style.cssText = `
			padding: 6px 12px;
			font-size: 12px;
			font-weight: 500;
			color: ${color};
			background: rgba(255, 255, 255, 0.05);
			border: 1px solid ${color}40;
			border-radius: 6px;
			cursor: pointer;
			transition: all 0.2s ease;
			font-family: inherit;
		`;

		btn.addEventListener('mouseenter', () => {
			btn.style.background = `${color}20`;
			btn.style.borderColor = color;
		});

		btn.addEventListener('mouseleave', () => {
			btn.style.background = 'rgba(255, 255, 255, 0.05)';
			btn.style.borderColor = `${color}40`;
		});

		btn.addEventListener('click', onClick);

		return btn;
	}

	private createSeparator(): HTMLElement {
		const sep = document.createElement('div');
		sep.style.cssText = `
			width: 1px;
			height: 20px;
			background: rgba(255, 255, 255, 0.15);
			margin: 0 4px;
		`;
		return sep;
	}

	private createDropdown(): HTMLElement {
		const dropdown = document.createElement('div');
		dropdown.style.cssText = `
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
			gap: 8px;
			padding: 12px;
			background: rgba(30, 30, 30, 0.95);
			backdrop-filter: blur(12px);
			-webkit-backdrop-filter: blur(12px);
			border: 1px solid rgba(255, 255, 255, 0.1);
			border-radius: 12px;
			box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
			max-width: 600px;
		`;

		// Create sample component buttons
		SAMPLE_COMPONENTS.forEach((sample, index) => {
			const sampleBtn = this.createSampleButton(sample.name, sample.id, index);
			dropdown.appendChild(sampleBtn);
		});

		return dropdown;
	}

	private createSampleButton(name: string, id: string, index: number): HTMLElement {
		const btn = document.createElement('button');
		btn.textContent = name;
		btn.title = id;

		// Color based on type
		const colors = [
			'#4fc3f7', // Button - cyan
			'#9575cd', // Counter - purple
			'#ffb74d', // Card - orange
			'#f06292', // Login Split - pink
			'#7c87f7', // Login Dark - blue
			'#4db6ac', // Onboarding Modern - teal
			'#aed581', // Onboarding Cards - green
			'#ffd54f', // Onboarding Slider - yellow
		];
		const color = colors[index % colors.length];

		btn.style.cssText = `
			padding: 10px 14px;
			font-size: 12px;
			font-weight: 500;
			color: #e0e0e0;
			background: rgba(255, 255, 255, 0.03);
			border: 1px solid rgba(255, 255, 255, 0.08);
			border-left: 3px solid ${color};
			border-radius: 8px;
			cursor: pointer;
			transition: all 0.2s ease;
			text-align: left;
			font-family: inherit;
		`;

		btn.addEventListener('mouseenter', () => {
			btn.style.background = 'rgba(255, 255, 255, 0.08)';
			btn.style.borderLeftColor = color;
			btn.style.transform = 'translateX(4px)';
		});

		btn.addEventListener('mouseleave', () => {
			btn.style.background = 'rgba(255, 255, 255, 0.03)';
			btn.style.transform = 'translateX(0)';
		});

		btn.addEventListener('click', () => {
			this.callbacks.onLoadSample(id);
		});

		return btn;
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
