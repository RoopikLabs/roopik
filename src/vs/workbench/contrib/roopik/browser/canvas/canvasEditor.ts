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
import { BottomActionBar, type IBottomActionBarCallbacks } from './components/bottomActionBar.js';
import { CanvasActionButtons, type ICanvasActionButtonsCallbacks } from './components/canvasActionButtons.js';
import { CanvasStatusPanel, type ICanvasStatusPanelCallbacks } from './components/canvasStatusPanel.js';
import type { CanvasViewport, BackgroundPattern, Sandbox } from '../../common/canvas/canvasTypes.js';
import { IWebviewService } from '../../../webview/browser/webview.js';
import { SAMPLE_COMPONENTS, getSampleComponent } from './data/sampleComponents.js';
import { getPreviewManager } from './services/previewManager.js';
import { getGridManager, type GridManager } from './services/gridManager.js';

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

	// Grid Manager - handles all grid calculations and snapping
	private gridManager: GridManager;

	// UI Components
	private floatingToolbar: FloatingToolbar | undefined;
	private bottomActionBar: BottomActionBar | undefined;
	private canvasActionButtons: CanvasActionButtons | undefined;
	private canvasStatusPanel: CanvasStatusPanel | undefined;

	// Status panel visibility flag (can be toggled via settings later)
	private showStatusPanel: boolean = true;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IWebviewService private readonly webviewService: IWebviewService
	) {
		super(CanvasEditor.ID, group, telemetryService, themeService, storageService);

		// Initialize grid manager
		this.gridManager = getGridManager();
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

		// Create bottom action bar
		this.createBottomActionBar();

		// Create canvas action buttons (Tidy Up, Mode Toggle)
		this.createCanvasActionButtons();

		// Create canvas status panel (zoom, reset, info)
		this.createCanvasStatusPanel();

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
	 * Create the bottom action bar for canvas tools
	 */
	private createBottomActionBar(): void {
		if (!this.container) {
			return;
		}

		const actionBarCallbacks: IBottomActionBarCallbacks = {
			onSelectMode: () => {
				console.log('[CanvasEditor] Select mode toggled');
				// TODO: Implement select mode
			},
			onInspectMode: () => {
				console.log('[CanvasEditor] Inspect mode toggled');
				// TODO: Implement inspect mode
			},
			onRectangleMode: () => {
				console.log('[CanvasEditor] Rectangle selection mode toggled');
				// TODO: Implement rectangle selection
			},
			onAIChat: () => {
				console.log('[CanvasEditor] AI Chat toggled');
				// TODO: Implement AI chat overlay
			},
			onViewModeToggle: () => {
				console.log('[CanvasEditor] View mode toggled');
				// TODO: Implement code/preview toggle
			}
		};

		this.bottomActionBar = new BottomActionBar(this.container, actionBarCallbacks);
		this.bottomActionBar.setStatusPanelVisible(this.showStatusPanel);
	}

	/**
	 * Create the canvas action buttons (Tidy Up, Mode Toggle)
	 */
	private createCanvasActionButtons(): void {
		if (!this.container) {
			return;
		}

		const actionButtonsCallbacks: ICanvasActionButtonsCallbacks = {
			onTidyUp: () => {
				console.log('[CanvasEditor] Tidy Up clicked');
				this.tidyUpSandboxes();
			},
			onModeToggle: () => {
				const newMode = this.gridManager.toggleMode();
				console.log(`[CanvasEditor] Mode toggled to: ${newMode}`);
				this.canvasActionButtons?.setMode(newMode);
				this.canvasStatusPanel?.setMode(newMode);

				// Auto tidy up when switching to grid mode
				if (newMode === 'grid') {
					this.tidyUpSandboxes();
				}
			},
			onPatternToggle: () => {
				this.cycleBackgroundPattern();
			},
			onColorChange: (color: string) => {
				this.setBackgroundColor(color);
			}
		};

		this.canvasActionButtons = new CanvasActionButtons(this.container, actionButtonsCallbacks);

		// Initialize with current state
		this.canvasActionButtons.setPattern(this.backgroundPattern);
		this.canvasActionButtons.setBackgroundColor(this.backgroundColor);
		this.canvasActionButtons.setStatusPanelVisible(this.showStatusPanel);
	}

	/**
	 * Create the canvas status panel (zoom controls, reset, info)
	 */
	private createCanvasStatusPanel(): void {
		if (!this.container || !this.showStatusPanel) {
			return;
		}

		const statusPanelCallbacks: ICanvasStatusPanelCallbacks = {
			onZoomIn: () => {
				const step = CanvasStatusPanel.getZoomStep();
				const limits = CanvasStatusPanel.getZoomLimits();
				this.viewport.scale = Math.min(this.viewport.scale + step, limits.max);
				this.updateTransform();
				this.canvasStatusPanel?.setZoom(this.viewport.scale);
			},
			onZoomOut: () => {
				const step = CanvasStatusPanel.getZoomStep();
				const limits = CanvasStatusPanel.getZoomLimits();
				this.viewport.scale = Math.max(this.viewport.scale - step, limits.min);
				this.updateTransform();
				this.canvasStatusPanel?.setZoom(this.viewport.scale);
			},
			onZoomReset: () => {
				this.viewport.scale = 1;
				this.updateTransform();
				this.canvasStatusPanel?.setZoom(this.viewport.scale);
			},
			onFitToScreen: () => {
				this.fitToScreen();
			},
			onResetPositions: () => {
				this.resetPositions();
			}
		};

		this.canvasStatusPanel = new CanvasStatusPanel(this.container, statusPanelCallbacks);

		// Initialize with current state
		this.canvasStatusPanel.setZoom(this.viewport.scale);
		this.canvasStatusPanel.setComponentCount(this.sandboxes.size);
		this.canvasStatusPanel.setMode(this.gridManager.getMode());
	}

	/**
	 * Reset positions - center all components in visible range
	 */
	private resetPositions(): void {
		if (!this.canvasContainer) {
			return;
		}

		const rect = this.canvasContainer.getBoundingClientRect();
		const sandboxArray = Array.from(this.sandboxes.values());

		// Calculate new viewport to center all content
		const newViewport = this.gridManager.calculateResetViewport(
			sandboxArray,
			rect.width,
			rect.height
		);

		// Apply new viewport with smooth transition
		this.viewport = newViewport;
		this.updateTransform();
		this.canvasStatusPanel?.setZoom(this.viewport.scale);

		console.log(`[CanvasEditor] Reset positions - centered ${sandboxArray.length} components`);
	}

	/**
	 * Fit all sandboxes to screen
	 */
	private fitToScreen(): void {
		if (!this.canvasContainer) {
			return;
		}

		const rect = this.canvasContainer.getBoundingClientRect();
		const sandboxArray = Array.from(this.sandboxes.values());

		// Use fit viewport which may scale down to fit
		const newViewport = this.gridManager.calculateFitViewport(
			sandboxArray,
			rect.width,
			rect.height
		);

		this.viewport = newViewport;
		this.updateTransform();
		this.canvasStatusPanel?.setZoom(this.viewport.scale);

		console.log(`[CanvasEditor] Fit to screen - scale: ${Math.round(this.viewport.scale * 100)}%`);
	}

	/**
	 * Cycle through background patterns: dots -> grid -> plain -> dots
	 */
	private cycleBackgroundPattern(): void {
		const patterns: BackgroundPattern[] = ['dots', 'grid', 'plain'];
		const currentIndex = patterns.indexOf(this.backgroundPattern);
		const nextIndex = (currentIndex + 1) % patterns.length;
		this.backgroundPattern = patterns[nextIndex];

		this.updateBackground();
		this.canvasActionButtons?.setPattern(this.backgroundPattern);
		console.log(`[CanvasEditor] Background pattern changed to: ${this.backgroundPattern}`);
	}

	/**
	 * Set background color
	 */
	private setBackgroundColor(color: string): void {
		this.backgroundColor = color;
		this.updateBackground();
		console.log(`[CanvasEditor] Background color changed to: ${color}`);
	}

	/**
	 * Tidy up all sandboxes - reorganize to their nearest grid slots
	 * Also centers all components in view (calls resetPositions at end)
	 */
	private tidyUpSandboxes(): void {
		const sandboxArray = Array.from(this.sandboxes.values());
		const newPositions = this.gridManager.tidyUp(sandboxArray);

		// Apply new positions with animation
		newPositions.forEach((position, id) => {
			const sandbox = this.sandboxes.get(id);
			const card = this.sandboxCards.get(id);

			if (sandbox && card) {
				sandbox.x = position.x;
				sandbox.y = position.y;
				card.commitDragPosition(position.x, position.y);
			}
		});

		console.log(`[CanvasEditor] Tidied up ${sandboxArray.length} sandboxes`);

		// Center all components in view after tidy up
		this.resetPositions();
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

			// Calculate zoom with limits from status panel
			const limits = CanvasStatusPanel.getZoomLimits();
			const zoomIntensity = isPinch ? 0.01 : 0.001;
			const scaleChange = delta * zoomIntensity;
			const newScale = Math.max(limits.min, Math.min(limits.max, this.viewport.scale + scaleChange));

			// Zoom toward mouse position
			const scaleRatio = newScale / this.viewport.scale;
			this.viewport.x = mouseX - (mouseX - this.viewport.x) * scaleRatio;
			this.viewport.y = mouseY - (mouseY - this.viewport.y) * scaleRatio;
			this.viewport.scale = newScale;

			this.updateTransform();

			// Update status panel zoom display
			this.canvasStatusPanel?.setZoom(this.viewport.scale);
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
	 * Update background pattern - delegates to GridManager
	 */
	private updateBackground(): void {
		if (!this.canvasContainer) {
			return;
		}
		this.gridManager.applyBackgroundPattern(
			this.canvasContainer,
			this.viewport,
			this.backgroundColor,
			this.backgroundPattern
		);
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
		// Use getNextAvailableSlot to find first unoccupied position (works in both modes)
		const sandboxArray = Array.from(this.sandboxes.values());
		const position = this.gridManager.getNextAvailableSlot(sandboxArray);
		const config = this.gridManager.getConfig();

		// sandbox.width/height stores the content size (sandboxWidth/sandboxHeight)
		// The SandboxCard CSS adds padding and margin for visual styling
		// Grid calculations use the full visual size (getSandboxDimensions) for spacing
		const sandbox: Sandbox = {
			id: sample.id,
			componentId: sample.id,
			x: position.x,
			y: position.y,
			width: config.sandboxWidth,
			height: config.sandboxHeight,
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

		// Update status panel component count
		this.canvasStatusPanel?.setComponentCount(this.sandboxes.size);
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

		// Update status panel with selected sandbox info
		const sandbox = this.sandboxes.get(id);
		this.canvasStatusPanel?.setSelectedSandbox(id, sandbox?.componentId || id);
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
		const sandbox = this.sandboxes.get(id);
		card?.setDragging(true);

		// Bring to front when starting to drag
		this.bringToFront(id);

		// Add document-level mouse move/up handlers
		const onMouseMove = (moveEvent: MouseEvent) => {
			if (!this.draggingSandboxId || !sandbox) {
				return;
			}

			const deltaX = (moveEvent.clientX - this.dragStart.x) / this.viewport.scale;
			const deltaY = (moveEvent.clientY - this.dragStart.y) / this.viewport.scale;

			this.dragOffset = { x: deltaX, y: deltaY };
			card?.applyDragOffset(deltaX, deltaY);

			// Check for overlap during drag (for visual indicator)
			const currentX = sandbox.x + deltaX;
			const currentY = sandbox.y + deltaY;
			const sandboxArray = Array.from(this.sandboxes.values());
			const overlapInfo = this.gridManager.detectOverlap(currentX, currentY, id, sandboxArray);

			// Update overlap indicator on the card
			card?.setOverlapping(overlapInfo.isOverlapping);

			// Update the action buttons overlap state (for the warning indicator)
			this.canvasActionButtons?.setOverlapping(overlapInfo.isOverlapping);
		};

		const onMouseUp = () => {
			if (!this.draggingSandboxId) {
				return;
			}

			const draggedSandbox = this.sandboxes.get(this.draggingSandboxId);
			if (draggedSandbox && card) {
				let newX = draggedSandbox.x + this.dragOffset.x;
				let newY = draggedSandbox.y + this.dragOffset.y;

				// Apply snap-to-grid based on current mode
				const sandboxArray = Array.from(this.sandboxes.values());
				const snapResult = this.gridManager.snapToGrid(newX, newY, sandboxArray, this.draggingSandboxId);

				// Always use snap result (in grid mode it always snaps, in free mode it respects threshold)
				newX = snapResult.x;
				newY = snapResult.y;

				if (snapResult.snappedX || snapResult.snappedY) {
					console.log(`[CanvasEditor] Snapped to grid: (${newX}, ${newY})${snapResult.isOverlapping ? ' (overlapping)' : ''}`);
				}

				card.commitDragPosition(newX, newY);
				draggedSandbox.x = newX;
				draggedSandbox.y = newY;
			}

			card?.setDragging(false);
			this.canvasActionButtons?.setOverlapping(false); // Clear overlap indicator
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
			// Clear selected sandbox in status panel
			this.canvasStatusPanel?.setSelectedSandbox(null, null);
		}
		if (this.focusedSandboxId === id) {
			this.focusedSandboxId = null;
		}

		// Update status panel component count
		this.canvasStatusPanel?.setComponentCount(this.sandboxes.size);

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

	/**
	 * Reorganize all sandboxes to their grid positions
	 * Used by the reset button in status panel
	 */
	public reorganizeToGrid(): void {
		// Delegate to tidyUpSandboxes which uses the new GridManager.tidyUp method
		this.tidyUpSandboxes();
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
		// Cleanup UI components
		this.floatingToolbar?.dispose();
		this.bottomActionBar?.dispose();
		this.canvasActionButtons?.dispose();
		this.canvasStatusPanel?.dispose();

		// Cleanup sandbox cards
		for (const card of this.sandboxCards.values()) {
			card.dispose();
		}
		this.sandboxCards.clear();
		this.sandboxes.clear();

		super.dispose();
	}
}
