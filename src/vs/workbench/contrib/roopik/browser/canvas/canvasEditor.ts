/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Canvas Editor - Component Mode (Mode 1)
 *
 * Infinite canvas workspace for designing and previewing UI components.
 * Uses vanilla TypeScript + DOM (no React) following VSCode core patterns.
 *
 * Features:
 * - Infinite canvas with pan/zoom
 * - Component sandboxes in iframes
 * - Glass-morphism card design
 * - Grid layout for components
 */

import { EditorPane } from '../../../../browser/parts/editor/editorPane.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Dimension } from '../../../../../base/browser/dom.js';
import { IEditorOpenContext } from '../../../../common/editor.js';
import { CanvasInput } from './canvasInput.js';
import type { CanvasViewport, BackgroundPattern } from '../../common/canvas/canvasTypes.js';

/**
 * Canvas Editor - EditorPane implementation
 *
 * Phase 1: Basic structure with placeholder
 * Phase 2: Infinite canvas with pan/zoom
 * Phase 3: Sandbox cards with iframes
 */
export class CanvasEditor extends EditorPane {
	static readonly ID = 'roopik.canvasEditor';

	// DOM Elements
	private container: HTMLElement | undefined;
	private canvasContainer: HTMLElement | undefined;
	private canvasContent: HTMLElement | undefined;

	// Canvas state
	private viewport: CanvasViewport = { x: 0, y: 0, scale: 1 };
	private backgroundColor: string = '#1a1a1a';
	private backgroundPattern: BackgroundPattern = 'dots';

	// Interaction state
	private isPanning: boolean = false;
	private panStart: { x: number; y: number } = { x: 0, y: 0 };

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService
	) {
		super(CanvasEditor.ID, group, telemetryService, themeService, storageService);
	}

	/**
	 * Create the editor DOM structure
	 */
	protected createEditor(parent: HTMLElement): void {
		// Main container
		this.container = document.createElement('div');
		this.container.className = 'roopik-canvas-editor';
		this.container.style.cssText = `
			width: 100%;
			height: 100%;
			overflow: hidden;
			position: relative;
		`;
		parent.appendChild(this.container);

		// Canvas container (handles background and overflow)
		this.canvasContainer = document.createElement('div');
		this.canvasContainer.className = 'roopik-canvas-container';
		this.canvasContainer.style.cssText = `
			width: 100%;
			height: 100%;
			overflow: hidden;
			position: relative;
			cursor: grab;
		`;
		this.container.appendChild(this.canvasContainer);

		// Canvas content (transformed layer for pan/zoom)
		this.canvasContent = document.createElement('div');
		this.canvasContent.className = 'roopik-canvas-content';
		this.canvasContent.style.cssText = `
			position: absolute;
			top: 0;
			left: 0;
			transform-origin: 0 0;
			will-change: transform;
		`;
		this.canvasContainer.appendChild(this.canvasContent);

		// Apply initial background
		this.updateBackground();

		// Setup event listeners
		this.setupCanvasEvents();

		// Show placeholder for Phase 1
		this.showPlaceholder();
	}

	/**
	 * Setup canvas interaction events
	 */
	private setupCanvasEvents(): void {
		if (!this.canvasContainer) {
			return;
		}

		// Mouse down - start panning
		this.canvasContainer.addEventListener('mousedown', (e) => {
			if (e.button === 0 || e.button === 1) { // Left or middle click
				this.isPanning = true;
				this.panStart = {
					x: e.clientX - this.viewport.x,
					y: e.clientY - this.viewport.y
				};
				this.canvasContainer!.style.cursor = 'grabbing';
				e.preventDefault();
			}
		});

		// Mouse move - pan canvas
		this.canvasContainer.addEventListener('mousemove', (e) => {
			if (this.isPanning) {
				this.viewport.x = e.clientX - this.panStart.x;
				this.viewport.y = e.clientY - this.panStart.y;
				this.updateTransform();
			}
		});

		// Mouse up - stop panning
		this.canvasContainer.addEventListener('mouseup', () => {
			this.isPanning = false;
			this.canvasContainer!.style.cursor = 'grab';
		});

		this.canvasContainer.addEventListener('mouseleave', () => {
			this.isPanning = false;
			this.canvasContainer!.style.cursor = 'grab';
		});

		// Wheel - zoom
		this.canvasContainer.addEventListener('wheel', (e) => {
			e.preventDefault();

			const rect = this.canvasContainer!.getBoundingClientRect();
			const mouseX = e.clientX - rect.left;
			const mouseY = e.clientY - rect.top;

			// Determine if pinch zoom or regular scroll
			const isPinch = e.ctrlKey;
			const delta = isPinch ? -e.deltaY : -e.deltaY;

			// Calculate zoom
			const zoomIntensity = isPinch ? 0.01 : 0.001;
			const scaleChange = delta * zoomIntensity;
			const newScale = Math.max(0.1, Math.min(10, this.viewport.scale + scaleChange));

			// Zoom toward mouse position
			const scaleRatio = newScale / this.viewport.scale;
			this.viewport.x = mouseX - (mouseX - this.viewport.x) * scaleRatio;
			this.viewport.y = mouseY - (mouseY - this.viewport.y) * scaleRatio;
			this.viewport.scale = newScale;

			this.updateTransform();
		}, { passive: false });
	}

	/**
	 * Update canvas transform based on viewport
	 */
	private updateTransform(): void {
		if (!this.canvasContent) {
			return;
		}

		this.canvasContent.style.transform =
			`translate(${this.viewport.x}px, ${this.viewport.y}px) scale(${this.viewport.scale})`;

		// Update background pattern offset
		this.updateBackground();
	}

	/**
	 * Update background pattern
	 */
	private updateBackground(): void {
		if (!this.canvasContainer) {
			return;
		}

		const gridSize = 20 * this.viewport.scale;
		const offsetX = this.viewport.x % gridSize;
		const offsetY = this.viewport.y % gridSize;

		// Determine pattern color based on background brightness
		const isLight = this.isLightColor(this.backgroundColor);
		const patternColor = isLight
			? 'rgba(0, 0, 0, 0.1)'
			: 'rgba(255, 255, 255, 0.05)';
		const dotColor = isLight
			? 'rgba(0, 0, 0, 0.15)'
			: 'rgba(255, 255, 255, 0.15)';

		this.canvasContainer.style.backgroundColor = this.backgroundColor;

		if (this.backgroundPattern === 'grid') {
			this.canvasContainer.style.backgroundImage = `
				linear-gradient(${patternColor} 1px, transparent 1px),
				linear-gradient(90deg, ${patternColor} 1px, transparent 1px)
			`;
			this.canvasContainer.style.backgroundSize = `${gridSize}px ${gridSize}px`;
			this.canvasContainer.style.backgroundPosition = `${offsetX}px ${offsetY}px`;
		} else if (this.backgroundPattern === 'dots') {
			this.canvasContainer.style.backgroundImage =
				`radial-gradient(circle, ${dotColor} 1px, transparent 1px)`;
			this.canvasContainer.style.backgroundSize = `${gridSize}px ${gridSize}px`;
			this.canvasContainer.style.backgroundPosition = `${offsetX}px ${offsetY}px`;
		} else {
			this.canvasContainer.style.backgroundImage = 'none';
		}
	}

	/**
	 * Check if a color is light (for pattern contrast)
	 */
	private isLightColor(color: string): boolean {
		// Parse hex color
		const hex = color.replace('#', '');
		const r = parseInt(hex.substring(0, 2), 16);
		const g = parseInt(hex.substring(2, 4), 16);
		const b = parseInt(hex.substring(4, 6), 16);

		// Calculate relative luminance
		const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
		return luminance > 0.5;
	}

	/**
	 * Show placeholder for Phase 1 testing
	 */
	private showPlaceholder(): void {
		if (!this.canvasContent) {
			return;
		}

		const placeholder = document.createElement('div');
		placeholder.style.cssText = `
			position: absolute;
			left: 50%;
			top: 50%;
			transform: translate(-50%, -50%);
			text-align: center;
			color: var(--vscode-descriptionForeground);
			font-family: var(--vscode-font-family);
			pointer-events: none;
		`;

		const icon = document.createElement('div');
		icon.style.cssText = 'font-size: 64px; opacity: 0.5; margin-bottom: 16px;';
		icon.textContent = '🎨';
		placeholder.appendChild(icon);

		const title = document.createElement('div');
		title.style.cssText = `
			font-size: 24px;
			font-weight: 500;
			color: var(--vscode-foreground);
			margin-bottom: 8px;
		`;
		title.textContent = 'Component Canvas';
		placeholder.appendChild(title);

		const subtitle = document.createElement('div');
		subtitle.style.cssText = 'font-size: 14px; opacity: 0.7;';
		subtitle.textContent = 'Pan with mouse drag • Zoom with scroll wheel';
		placeholder.appendChild(subtitle);

		// Create the outer info div
		const info = document.createElement('div');
		info.style.cssText = `
			margin-top: 24px;
			padding: 12px 16px;
			background: var(--vscode-editor-background);
			border: 1px solid var(--vscode-widget-border);
			border-radius: 8px;
			font-size: 12px;
		`;

		// 1. Create and append the "Phase 1 Complete" line
		const statusDiv = document.createElement('div');
		statusDiv.style.cssText = 'margin-bottom: 8px; font-weight: 500;';
		statusDiv.textContent = 'Phase 1 Complete ✅';
		info.appendChild(statusDiv);

		// 2. Create and append the "Canvas editor registered" line
		const registeredDiv = document.createElement('div');
		registeredDiv.textContent = 'Canvas editor registered and working!';
		info.appendChild(registeredDiv);

		// 3. Create and append the viewport info line (this is the one we update later)
		const viewportDiv = document.createElement('div');
		viewportDiv.style.cssText = 'margin-top: 8px; opacity: 0.7;';
		// Set initial content
		viewportDiv.textContent =
			`Viewport: x=${this.viewport.x.toFixed(0)}, y=${this.viewport.y.toFixed(0)}, scale=${this.viewport.scale.toFixed(2)}`;
		info.appendChild(viewportDiv);

		placeholder.appendChild(info);

		// Update viewport display on transform
		const updateInfo = () => {
			// Select the newly created 'viewportDiv' correctly, e.g., by its direct reference or a known structure
			// If you don't keep a direct reference, use:
			const viewportDivToUpdate = info.querySelector('div:last-child');
			if (viewportDivToUpdate) {
				viewportDivToUpdate.textContent =
					`Viewport: x=${this.viewport.x.toFixed(0)}, y=${this.viewport.y.toFixed(0)}, scale=${this.viewport.scale.toFixed(2)}`;
			}
		};

		// Observe transform changes
		const observer = new MutationObserver(updateInfo);
		observer.observe(this.canvasContent, { attributes: true, attributeFilter: ['style'] });

		this.canvasContent.appendChild(placeholder);
	}

	// ============================================
	// EditorPane Lifecycle
	// ============================================

	override async setInput(
		input: EditorInput,
		options: IEditorOptions | undefined,
		context: IEditorOpenContext,
		token: CancellationToken
	): Promise<void> {
		await super.setInput(input, options, context, token);

		if (input instanceof CanvasInput) {
			// TODO: Load canvas state from storage
			// For now, just log
			console.log(`[CanvasEditor] Opening canvas: ${input.canvasId}`);
		}
	}

	override focus(): void {
		this.canvasContainer?.focus();
	}

	layout(_dimension: Dimension): void {
		// Canvas is fluid, no special layout needed
		this.updateBackground();
	}

	override dispose(): void {
		// Cleanup
		super.dispose();
	}
}
