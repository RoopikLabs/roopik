/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Canvas Service Implementation
 *
 * Main process implementation of ICanvasService.
 * Manages canvas lifecycle, storage, and panel state tracking.
 *
 * Storage Structure:
 * .roopik/
 * ├── canvases/
 * │   ├── login-components/
 * │   │   ├── meta.json          <- Canvas metadata
 * │   │   └── components/        <- Components in this canvas
 * │   └── dashboard-widgets/
 * │       ├── meta.json
 * │       └── components/
 * └── ...
 */

import { Emitter, Event } from '../../../../../base/common/event.js';
import {
	ICanvasService,
	CanvasCreatedEvent,
	CanvasDeletedEvent,
	CanvasUpdatedEvent,
	CanvasFocusChangedEvent
} from '../../common/canvas/canvasService.js';
import {
	CanvasMeta,
	Canvas,
	CreateCanvasResult,
	ListCanvasOptions,
	CanvasPanelState
} from '../../common/canvas/types.js';
import { IRoopikStorageService } from '../../common/storage/storageService.js';

// ============================================================================
// Service Implementation
// ============================================================================

export class CanvasService implements ICanvasService {
	readonly _serviceBrand: undefined;

	// ========================================================================
	// State
	// ========================================================================

	/** In-memory canvas registry: id -> Canvas */
	private readonly canvases = new Map<string, Canvas>();

	/** Panel states: canvasId -> CanvasPanelState */
	private readonly panelStates = new Map<string, CanvasPanelState>();

	/** Currently focused canvas ID */
	private focusedCanvasId: string | null = null;

	/** Workspace path (stored for future use) */
	private _workspacePath: string = '';

	/** Initialization state */
	private initialized: boolean = false;

	// ========================================================================
	// Events
	// ========================================================================

	private readonly _onCanvasCreated = new Emitter<CanvasCreatedEvent>();
	readonly onCanvasCreated: Event<CanvasCreatedEvent> = this._onCanvasCreated.event;

	private readonly _onCanvasDeleted = new Emitter<CanvasDeletedEvent>();
	readonly onCanvasDeleted: Event<CanvasDeletedEvent> = this._onCanvasDeleted.event;

	private readonly _onCanvasUpdated = new Emitter<CanvasUpdatedEvent>();
	readonly onCanvasUpdated: Event<CanvasUpdatedEvent> = this._onCanvasUpdated.event;

	private readonly _onCanvasFocusChanged = new Emitter<CanvasFocusChangedEvent>();
	readonly onCanvasFocusChanged: Event<CanvasFocusChangedEvent> = this._onCanvasFocusChanged.event;

	// ========================================================================
	// Constructor
	// ========================================================================

	constructor(
		private readonly storageService: IRoopikStorageService
	) {
		console.log('[CanvasService] Created');
	}

	// ========================================================================
	// Lifecycle
	// ========================================================================

	async initialize(workspacePath: string): Promise<void> {
		if (this.initialized) {
			console.warn('[CanvasService] Already initialized');
			return;
		}

		this._workspacePath = workspacePath;
		console.log('[CanvasService] Initializing with workspace:', this._workspacePath);

		// Load all existing canvases from storage
		await this.loadAllCanvases();

		this.initialized = true;
		console.log('[CanvasService] Initialized with', this.canvases.size, 'canvases');
	}

	isInitialized(): boolean {
		return this.initialized;
	}

	dispose(): void {
		this._onCanvasCreated.dispose();
		this._onCanvasDeleted.dispose();
		this._onCanvasUpdated.dispose();
		this._onCanvasFocusChanged.dispose();
		this.canvases.clear();
		this.panelStates.clear();
		console.log('[CanvasService] Disposed');
	}

	// ========================================================================
	// Canvas CRUD
	// ========================================================================

	async createCanvas(name: string): Promise<CreateCanvasResult> {
		const baseCanvasId = this.nameToId(name);

		// Check if a canvas with the SAME NAME already exists (case-insensitive)
		// This handles the "user already has this exact canvas" case
		const existingByName = this.findCanvasByName(name.trim());
		if (existingByName) {
			console.log('[CanvasService] Canvas with same name already exists:', existingByName.id);
			const meta = this.toCanvasMeta(existingByName);

			// Fire event to open the existing canvas
			this._onCanvasCreated.fire({ canvasId: existingByName.id, canvas: meta });

			return {
				canvasId: existingByName.id,
				isNew: false,
				canvas: meta
			};
		}

		// Generate unique canvasId (handles the rename conflict case)
		// If "xyz" folder exists but it's a different canvas (was renamed), create "xyz-2"
		const canvasId = this.generateUniqueId(baseCanvasId);

		// Create new canvas
		const now = Date.now();
		const canvas: Canvas = {
			id: canvasId,
			name: name.trim(),
			createdAt: now,
			updatedAt: now,
			componentCount: 0,
			isOpen: false,
			isFocused: false
		};

		// Save to storage
		await this.storageService.createCanvas(canvasId, name.trim());

		// Add to registry
		this.canvases.set(canvasId, canvas);

		// Fire event
		const meta = this.toCanvasMeta(canvas);
		this._onCanvasCreated.fire({ canvasId, canvas: meta });

		console.log('[CanvasService] Created canvas:', canvasId);

		return {
			canvasId,
			isNew: true,
			canvas: meta
		};
	}

	/**
	 * Find canvas by display name (case-insensitive)
	 */
	private findCanvasByName(name: string): Canvas | undefined {
		const lowerName = name.toLowerCase();
		for (const canvas of this.canvases.values()) {
			if (canvas.name.toLowerCase() === lowerName) {
				return canvas;
			}
		}
		return undefined;
	}

	/**
	 * Generate a unique canvas ID by appending suffix if needed
	 * e.g., "xyz" exists -> try "xyz-2" -> "xyz-3" etc.
	 */
	private generateUniqueId(baseId: string): string {
		if (!this.canvases.has(baseId)) {
			return baseId;
		}

		// Find next available suffix
		let suffix = 2;
		while (this.canvases.has(`${baseId}-${suffix}`)) {
			suffix++;
		}

		const uniqueId = `${baseId}-${suffix}`;
		console.log('[CanvasService] ID conflict resolved:', baseId, '->', uniqueId);
		return uniqueId;
	}

	getCanvas(canvasId: string): Canvas | undefined {
		return this.canvases.get(canvasId);
	}

	async getCanvasAsync(canvasId: string): Promise<Canvas | undefined> {
		return this.getCanvas(canvasId);
	}

	listCanvases(options?: ListCanvasOptions): CanvasMeta[] {
		let canvases = Array.from(this.canvases.values()).map(c => this.toCanvasMeta(c));

		// Apply name filter
		if (options?.nameFilter) {
			const filter = options.nameFilter.toLowerCase();
			canvases = canvases.filter(c => c.name.toLowerCase().includes(filter));
		}

		// Apply sorting
		const sortBy = options?.sortBy || 'updatedAt';
		const sortDir = options?.sortDirection || 'desc';

		canvases.sort((a, b) => {
			let comparison = 0;
			switch (sortBy) {
				case 'name':
					comparison = a.name.localeCompare(b.name);
					break;
				case 'createdAt':
					comparison = a.createdAt - b.createdAt;
					break;
				case 'updatedAt':
					comparison = a.updatedAt - b.updatedAt;
					break;
				case 'componentCount':
					comparison = a.componentCount - b.componentCount;
					break;
			}
			return sortDir === 'asc' ? comparison : -comparison;
		});

		return canvases;
	}

	async listCanvasesAsync(options?: ListCanvasOptions): Promise<CanvasMeta[]> {
		return this.listCanvases(options);
	}

	async updateCanvas(
		canvasId: string,
		updates: Partial<Pick<CanvasMeta, 'name' | 'description' | 'icon' | 'color'>>
	): Promise<void> {
		const canvas = this.canvases.get(canvasId);
		if (!canvas) {
			throw new Error(`Canvas not found: ${canvasId}`);
		}

		const changes: (keyof CanvasMeta)[] = [];

		if (updates.name !== undefined && updates.name !== canvas.name) {
			canvas.name = updates.name;
			changes.push('name');
		}
		if (updates.description !== undefined && updates.description !== canvas.description) {
			canvas.description = updates.description;
			changes.push('description');
		}
		if (updates.icon !== undefined && updates.icon !== canvas.icon) {
			canvas.icon = updates.icon;
			changes.push('icon');
		}
		if (updates.color !== undefined && updates.color !== canvas.color) {
			canvas.color = updates.color;
			changes.push('color');
		}

		if (changes.length > 0) {
			canvas.updatedAt = Date.now();
			changes.push('updatedAt');

			// Save to storage
			await this.saveCanvasMeta(canvas);

			// Fire event
			this._onCanvasUpdated.fire({
				canvasId,
				changes,
				canvas: this.toCanvasMeta(canvas)
			});

			console.log('[CanvasService] Updated canvas:', canvasId, changes);
		}
	}

	async deleteCanvas(canvasId: string): Promise<void> {
		const canvas = this.canvases.get(canvasId);
		if (!canvas) {
			console.warn('[CanvasService] Canvas not found for deletion:', canvasId);
			return;
		}

		// Delete from storage (this also deletes all components)
		await this.storageService.deleteCanvas(canvasId);

		// Remove from registry
		this.canvases.delete(canvasId);
		this.panelStates.delete(canvasId);

		// Update focus if needed
		if (this.focusedCanvasId === canvasId) {
			this.focusedCanvasId = null;
		}

		// Fire event
		this._onCanvasDeleted.fire({ canvasId });

		console.log('[CanvasService] Deleted canvas:', canvasId);
	}

	// ========================================================================
	// Panel State Tracking
	// ========================================================================

	registerPanelOpen(canvasId: string): void {
		const canvas = this.canvases.get(canvasId);
		if (canvas) {
			canvas.isOpen = true;
		}

		this.panelStates.set(canvasId, {
			canvasId,
			isVisible: true,
			hasFocus: false,
			lastFocusedAt: 0
		});

		console.log('[CanvasService] Panel opened:', canvasId);
	}

	registerPanelClosed(canvasId: string): void {
		const canvas = this.canvases.get(canvasId);
		if (canvas) {
			canvas.isOpen = false;
			canvas.isFocused = false;
		}

		this.panelStates.delete(canvasId);

		// Update focus if this was the focused canvas
		if (this.focusedCanvasId === canvasId) {
			const previousId = this.focusedCanvasId;
			this.focusedCanvasId = null;
			this._onCanvasFocusChanged.fire({
				previousCanvasId: previousId,
				currentCanvasId: null
			});
		}

		console.log('[CanvasService] Panel closed:', canvasId);
	}

	registerPanelFocused(canvasId: string): void {
		const previousId = this.focusedCanvasId;

		// Update previous canvas
		if (previousId && previousId !== canvasId) {
			const previousCanvas = this.canvases.get(previousId);
			if (previousCanvas) {
				previousCanvas.isFocused = false;
			}
			const previousState = this.panelStates.get(previousId);
			if (previousState) {
				previousState.hasFocus = false;
			}
		}

		// Update current canvas
		const canvas = this.canvases.get(canvasId);
		if (canvas) {
			canvas.isFocused = true;
		}

		const state = this.panelStates.get(canvasId);
		if (state) {
			state.hasFocus = true;
			state.lastFocusedAt = Date.now();
		}

		this.focusedCanvasId = canvasId;

		// Fire event only if focus actually changed
		if (previousId !== canvasId) {
			this._onCanvasFocusChanged.fire({
				previousCanvasId: previousId,
				currentCanvasId: canvasId
			});
			console.log('[CanvasService] Focus changed:', previousId, '->', canvasId);
		}
	}

	getFocusedCanvasId(): string | null {
		return this.focusedCanvasId;
	}

	async getFocusedCanvasIdAsync(): Promise<string | null> {
		return this.focusedCanvasId;
	}

	isPanelOpen(canvasId: string): boolean {
		return this.panelStates.has(canvasId);
	}

	getOpenPanels(): CanvasPanelState[] {
		return Array.from(this.panelStates.values());
	}

	// ========================================================================
	// Utilities
	// ========================================================================

	nameToId(name: string): string {
		return name
			.toLowerCase()
			.trim()
			.replace(/\s+/g, '-')
			.replace(/[^a-z0-9-]/g, '')
			.replace(/-+/g, '-')
			.replace(/^-|-$/g, '');
	}

	canvasExists(canvasId: string): boolean {
		return this.canvases.has(canvasId);
	}

	async updateComponentCount(canvasId: string, count: number): Promise<void> {
		const canvas = this.canvases.get(canvasId);
		if (canvas && canvas.componentCount !== count) {
			canvas.componentCount = count;
			canvas.updatedAt = Date.now();
			await this.saveCanvasMeta(canvas);

			this._onCanvasUpdated.fire({
				canvasId,
				changes: ['componentCount', 'updatedAt'],
				canvas: this.toCanvasMeta(canvas)
			});
		}
	}

	// ========================================================================
	// Internal: Storage Operations
	// ========================================================================

	private async loadAllCanvases(): Promise<void> {
		try {
			const canvasIds = await this.storageService.listCanvases();

			for (const canvasId of canvasIds) {
				try {
					const meta = await this.storageService.loadCanvasMeta(canvasId);
					if (meta) {
						const canvas: Canvas = {
							...meta,
							isOpen: false,
							isFocused: false
						};
						this.canvases.set(canvasId, canvas);
					}
				} catch (err) {
					console.error('[CanvasService] Failed to load canvas:', canvasId, err);
				}
			}
		} catch (err) {
			console.error('[CanvasService] Failed to list canvases:', err);
		}
	}

	private async saveCanvasMeta(canvas: Canvas): Promise<void> {
		const meta = this.toCanvasMeta(canvas);
		await this.storageService.saveCanvasMeta(canvas.id, meta);
	}

	private toCanvasMeta(canvas: Canvas): CanvasMeta {
		return {
			id: canvas.id,
			name: canvas.name,
			createdAt: canvas.createdAt,
			updatedAt: canvas.updatedAt,
			description: canvas.description,
			icon: canvas.icon,
			color: canvas.color,
			componentCount: canvas.componentCount
		};
	}
}
