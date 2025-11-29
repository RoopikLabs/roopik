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
import { SandboxCard, type ISandboxCardCallbacks } from './components/sandboxCard.js';
import { FloatingToolbar, type IFloatingToolbarCallbacks } from './components/floatingToolbar.js';
import { DEFAULT_GRID_CONFIG } from '../../common/canvas/canvasTypes.js';
import type { CanvasViewport, BackgroundPattern, Sandbox, GridConfig } from '../../common/canvas/canvasTypes.js';
import { IWebviewService } from '../../../webview/browser/webview.js';
import { SAMPLE_COMPONENTS, getSampleComponent } from './data/sampleComponents.js';
import { getPreviewManager } from './services/previewManager.js';

/**
 * Canvas Editor - EditorPane implementation
 *
 * Phase 1: Basic structure with placeholder ✅
 * Phase 2: Infinite canvas with pan/zoom ✅
 * Phase 3: Sandbox cards with iframes (in progress)
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

	// Sandbox management
	private sandboxes: Map<string, Sandbox> = new Map();
	private sandboxCards: Map<string, SandboxCard> = new Map();
	private selectedSandboxId: string | null = null;
	private focusedSandboxId: string | null = null;

	// Interaction state
	private isPanning: boolean = false;
	private panStart: { x: number; y: number } = { x: 0, y: 0 };

	// Drag state for sandboxes
	private draggingSandboxId: string | null = null;
	private dragStart: { x: number; y: number } = { x: 0, y: 0 };
	private dragOffset: { x: number; y: number } = { x: 0, y: 0 };

	// Grid configuration - uses defaults, can be customized via settings in future
	private gridConfig: GridConfig = { ...DEFAULT_GRID_CONFIG };

	// UI Components
	private floatingToolbar: FloatingToolbar | undefined;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IWebviewService private readonly webviewService: IWebviewService
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

		// Create floating toolbar for testing
		this.createFloatingToolbar();

		// Sandboxes are loaded when setInput is called
	}

	/**
	 * Create the floating toolbar for loading sample components
	 */
	private createFloatingToolbar(): void {
		if (!this.container) {
			return;
		}

		const toolbarCallbacks: IFloatingToolbarCallbacks = {
			onLoadSample: (sampleId) => this.loadSampleById(sampleId),
			onLoadAll: () => this.loadAllSamples(),
			onClearAll: () => this.clearAllSandboxes()
		};

		this.floatingToolbar = new FloatingToolbar(this.container, toolbarCallbacks);
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

	// ============================================
	// Sandbox Management
	// ============================================

	/**
	 * Load a single sample component by ID
	 */
	private loadSampleById(sampleId: string): void {
		const sample = getSampleComponent(sampleId);
		if (!sample) {
			console.warn(`[CanvasEditor] Sample not found: ${sampleId}`);
			return;
		}

		// Check if already loaded
		if (this.sandboxes.has(sampleId)) {
			console.log(`[CanvasEditor] Sample already loaded: ${sampleId}`);
			this.selectSandbox(sampleId);
			return;
		}

		const { code, cdnUrls } = this.parseComponentCode(sample.id, sample.code);
		const position = this.calculateGridPosition(this.sandboxes.size);

		const sandbox: Sandbox = {
			id: sample.id,
			componentId: sample.id,
			x: position.x,
			y: position.y,
			width: this.gridConfig.sandboxWidth + this.gridConfig.containerPaddingX * 2,
			height: this.gridConfig.sandboxHeight + this.gridConfig.containerPaddingY * 2,
			zIndex: this.sandboxes.size + 1,
			state: 'loading',
			sessionCode: code,
			cdnUrls: cdnUrls
		};

		this.addSandbox(sandbox);
		console.log(`[CanvasEditor] Loaded sample: ${sample.name}`);
	}

	/**
	 * Load all sample components
	 */
	private loadAllSamples(): void {
		SAMPLE_COMPONENTS.forEach(sample => {
			if (!this.sandboxes.has(sample.id)) {
				this.loadSampleById(sample.id);
			}
		});
	}

	/**
	 * Clear all sandboxes from the canvas
	 */
	private clearAllSandboxes(): void {
		const ids = Array.from(this.sandboxes.keys());
		ids.forEach(id => this.deleteSandbox(id));
		console.log('[CanvasEditor] Cleared all sandboxes');
	}

	/**
	 * Load first 3 sample components for initial demo
	 */
	private loadInitialSamples(): void {
		// Load only the first 3 samples on initial load
		const initialSamples = SAMPLE_COMPONENTS.slice(0, 3);
		initialSamples.forEach(sample => {
			this.loadSampleById(sample.id);
		});
	}

	/**
	 * Parse component code to extract dependencies and transform imports
	 * Uses PreviewManager for proper Golden Prompt transformation
	 */
	private parseComponentCode(componentId: string, code: string): { code: string; cdnUrls: string[] } {
		const previewManager = getPreviewManager();
		const sessionCode = previewManager.processComponent(componentId, code);
		return {
			code: sessionCode.code,
			cdnUrls: sessionCode.cdnUrls
		};
	}

	/**
	 * Calculate grid position for a sandbox
	 */
	private calculateGridPosition(index: number): { x: number; y: number } {
		const col = index % this.gridConfig.columns;
		const row = Math.floor(index / this.gridConfig.columns);

		const totalWidth = this.gridConfig.sandboxWidth + this.gridConfig.containerPaddingX * 2 + this.gridConfig.containerMargin * 2;
		const totalHeight = this.gridConfig.sandboxHeight + this.gridConfig.containerPaddingY * 2 + this.gridConfig.containerMargin * 2;

		return {
			x: this.gridConfig.startX + col * (totalWidth + this.gridConfig.gapX),
			y: this.gridConfig.startY + row * (totalHeight + this.gridConfig.gapY)
		};
	}

	/**
	 * Add a sandbox to the canvas
	 */
	private addSandbox(sandbox: Sandbox): void {
		if (!this.canvasContent) {
			return;
		}

		this.sandboxes.set(sandbox.id, sandbox);

		const callbacks: ISandboxCardCallbacks = {
			onClick: (id) => this.selectSandbox(id),
			onDoubleClick: (id) => this.focusSandbox(id),
			onDragStart: (id, e) => this.startSandboxDrag(id, e),
			onDelete: (id) => this.deleteSandbox(id),
			onExpand: (id) => this.expandSandbox(id)
		};

		const card = new SandboxCard(this.canvasContent, sandbox, callbacks, this.webviewService);
		this.sandboxCards.set(sandbox.id, card);
	}

	/**
	 * Select a sandbox
	 */
	private selectSandbox(id: string): void {
		// Deselect previous
		if (this.selectedSandboxId && this.selectedSandboxId !== id) {
			const prevCard = this.sandboxCards.get(this.selectedSandboxId);
			prevCard?.setSelected(false);
		}

		// Select new
		this.selectedSandboxId = id;
		const card = this.sandboxCards.get(id);
		card?.setSelected(true);

		// Bring to front
		this.bringToFront(id);
	}

	/**
	 * Focus a sandbox (double-click for focused editing mode)
	 */
	private focusSandbox(id: string): void {
		// Clear previous focus
		if (this.focusedSandboxId && this.focusedSandboxId !== id) {
			const prevCard = this.sandboxCards.get(this.focusedSandboxId);
			prevCard?.setFocused(false);
		}

		this.focusedSandboxId = id;
		const card = this.sandboxCards.get(id);
		card?.setFocused(true);

		// TODO: Zoom canvas to center on this sandbox (Focus Mode)
		console.log(`[CanvasEditor] Focus mode activated for: ${id}`);
	}

	/**
	 * Start dragging a sandbox
	 */
	private startSandboxDrag(id: string, e: MouseEvent): void {
		this.draggingSandboxId = id;
		this.dragStart = { x: e.clientX, y: e.clientY };
		this.dragOffset = { x: 0, y: 0 };

		const card = this.sandboxCards.get(id);
		card?.setDragging(true);

		// Add document-level mouse move/up handlers
		const onMouseMove = (moveEvent: MouseEvent) => {
			if (!this.draggingSandboxId) {
				return;
			}

			const deltaX = (moveEvent.clientX - this.dragStart.x) / this.viewport.scale;
			const deltaY = (moveEvent.clientY - this.dragStart.y) / this.viewport.scale;

			this.dragOffset = { x: deltaX, y: deltaY };
			card?.applyDragOffset(deltaX, deltaY);
		};

		const onMouseUp = () => {
			if (!this.draggingSandboxId) {
				return;
			}

			const sandbox = this.sandboxes.get(this.draggingSandboxId);
			if (sandbox && card) {
				const newX = sandbox.x + this.dragOffset.x;
				const newY = sandbox.y + this.dragOffset.y;
				card.commitDragPosition(newX, newY);
				sandbox.x = newX;
				sandbox.y = newY;
			}

			card?.setDragging(false);
			this.draggingSandboxId = null;
			this.dragOffset = { x: 0, y: 0 };

			document.removeEventListener('mousemove', onMouseMove);
			document.removeEventListener('mouseup', onMouseUp);
		};

		document.addEventListener('mousemove', onMouseMove);
		document.addEventListener('mouseup', onMouseUp);
	}

	/**
	 * Delete a sandbox
	 */
	private deleteSandbox(id: string): void {
		const card = this.sandboxCards.get(id);
		card?.dispose();
		this.sandboxCards.delete(id);
		this.sandboxes.delete(id);

		if (this.selectedSandboxId === id) {
			this.selectedSandboxId = null;
		}
		if (this.focusedSandboxId === id) {
			this.focusedSandboxId = null;
		}

		console.log(`[CanvasEditor] Deleted sandbox: ${id}`);
	}

	/**
	 * Expand a sandbox to fullscreen/modal view
	 */
	private expandSandbox(id: string): void {
		// TODO: Implement fullscreen expand view
		console.log(`[CanvasEditor] Expand sandbox: ${id}`);
	}

	/**
	 * Bring a sandbox to front (highest z-index)
	 */
	private bringToFront(id: string): void {
		// Find max zIndex
		let maxZ = 0;
		for (const sandbox of this.sandboxes.values()) {
			if (sandbox.zIndex > maxZ) {
				maxZ = sandbox.zIndex;
			}
		}

		// Set this one higher
		const sandbox = this.sandboxes.get(id);
		if (sandbox) {
			sandbox.zIndex = maxZ + 1;
			const card = this.sandboxCards.get(id);
			card?.update({ zIndex: sandbox.zIndex });
		}
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
			console.log(`[CanvasEditor] Opening canvas: ${input.canvasId}`);

			// Load initial sample components for demo
			this.loadInitialSamples();
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
		// Cleanup floating toolbar
		this.floatingToolbar?.dispose();

		// Cleanup sandbox cards
		for (const card of this.sandboxCards.values()) {
			card.dispose();
		}
		this.sandboxCards.clear();
		this.sandboxes.clear();

		super.dispose();
	}
}
