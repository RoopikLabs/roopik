/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * GridManager - Handles all grid-related calculations and rendering
 *
 * Two Modes:
 * 1. GRID MODE - Strict grid positioning, no overlap allowed, auto-snap to grid
 * 2. FREE MODE - Free positioning, overlap allowed with visual indicator, optional snap
 *
 * Features:
 * - Calculate grid positions for sandboxes
 * - Render background patterns (grid, dots, plain)
 * - Snap-to-grid functionality (configurable threshold)
 * - Visual overlap detection and indication
 * - Tidy Up: Reorganize all sandboxes to nearest available grid slots
 * - Viewport-aware calculations
 */

import { DEFAULT_GRID_CONFIG } from '../../../common/canvas/canvasTypes.js';
import type { GridConfig, CanvasViewport, BackgroundPattern, Sandbox } from '../../../common/canvas/canvasTypes.js';

// ============================================
// Configuration Constants
// These will be fetched from settings in the future
// ============================================

/**
 * Canvas positioning mode
 */
export type CanvasMode = 'grid' | 'free';

/**
 * Snap threshold as percentage of container dimensions (0.0 - 1.0)
 * Only applies in FREE mode - how close before snapping
 * In GRID mode, always snaps to nearest available slot
 */
export const SNAP_THRESHOLD_PERCENT = 0.15; // 15% - smaller for more flexibility

/**
 * Minimum overlap percentage to trigger the warning indicator (0.0 - 1.0)
 * Only show warning when overlap exceeds this threshold
 * 0.1 = 10% overlap required before showing warning
 */
export const OVERLAP_WARNING_THRESHOLD = 0.1; // 10% - small overlap doesn't trigger warning

/**
 * Default canvas mode
 */
export const DEFAULT_CANVAS_MODE: CanvasMode = 'grid';

// ============================================
// Grid Manager Types
// ============================================

export interface GridPosition {
	x: number;
	y: number;
}

export interface GridBounds {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}

export interface SnapResult {
	x: number;
	y: number;
	snappedX: boolean;
	snappedY: boolean;
	isOverlapping: boolean; // Visual indicator - true if would overlap with another sandbox
	blockedByGrid: boolean; // In grid mode, true if position is occupied (snap blocked)
}

export interface OverlapInfo {
	isOverlapping: boolean;
	overlappingWith: string[]; // IDs of sandboxes being overlapped
	overlapPercent: number; // 0-1, how much overlap
}

// ============================================
// Grid Manager Service
// ============================================

export class GridManager {
	private config: GridConfig;

	// Canvas mode - grid (strict) or free (flexible)
	private mode: CanvasMode = DEFAULT_CANVAS_MODE;

	// Snap threshold as percentage of container size (0.0 - 1.0)
	private snapThresholdPercent: number = SNAP_THRESHOLD_PERCENT;

	// Snap enabled state (only affects FREE mode)
	private snapEnabled: boolean = true;

	constructor(config?: Partial<GridConfig>) {
		this.config = { ...DEFAULT_GRID_CONFIG, ...config };
	}

	// ============================================
	// Mode Management
	// ============================================

	getMode(): CanvasMode {
		return this.mode;
	}

	setMode(mode: CanvasMode): void {
		this.mode = mode;
	}

	toggleMode(): CanvasMode {
		this.mode = this.mode === 'grid' ? 'free' : 'grid';
		return this.mode;
	}

	isGridMode(): boolean {
		return this.mode === 'grid';
	}

	isFreeMode(): boolean {
		return this.mode === 'free';
	}

	// ============================================
	// Configuration
	// ============================================

	getConfig(): GridConfig {
		return { ...this.config };
	}

	setConfig(config: Partial<GridConfig>): void {
		this.config = { ...this.config, ...config };
	}

	setSnapEnabled(enabled: boolean): void {
		this.snapEnabled = enabled;
	}

	isSnapEnabled(): boolean {
		return this.snapEnabled;
	}

	/**
	 * Set snap threshold as percentage of container size (0.0 - 1.0)
	 * Example: 0.15 = 15% of container dimensions
	 */
	setSnapThresholdPercent(percent: number): void {
		this.snapThresholdPercent = Math.max(0, Math.min(1, percent));
	}

	getSnapThresholdPercent(): number {
		return this.snapThresholdPercent;
	}

	// ============================================
	// Grid Position Calculations
	// ============================================

	/**
	 * Get the snap threshold in pixels based on container dimensions
	 */
	private getSnapThresholdPixels(): { x: number; y: number } {
		const { width, height } = this.getSandboxDimensions();
		return {
			x: width * this.snapThresholdPercent,
			y: height * this.snapThresholdPercent
		};
	}

	/**
	 * Calculate sandbox dimensions including padding and margin
	 * This is the total visual size of the card on canvas
	 */
	getSandboxDimensions(): { width: number; height: number } {
		return {
			width: this.config.sandboxWidth + (this.config.containerMargin * 2) + (this.config.containerPaddingX * 2),
			height: this.config.sandboxHeight + (this.config.containerMargin * 2) + (this.config.containerPaddingY * 2)
		};
	}

	/**
	 * Get cell dimensions (sandbox + gap)
	 */
	getCellDimensions(): { width: number; height: number } {
		const { width, height } = this.getSandboxDimensions();
		return {
			width: width + this.config.gapX,
			height: height + this.config.gapY
		};
	}

	/**
	 * Calculate grid position for a sandbox by index
	 * Used when auto-arranging sandboxes in a grid
	 */
	calculateGridPosition(index: number): GridPosition {
		const col = index % this.config.columns;
		const row = Math.floor(index / this.config.columns);

		const { width, height } = this.getCellDimensions();

		return {
			x: this.config.startX + col * width,
			y: this.config.startY + row * height
		};
	}

	/**
	 * Get grid cell (col, row) from pixel position
	 */
	getGridCell(x: number, y: number): { col: number; row: number } {
		const { width, height } = this.getCellDimensions();

		const col = Math.round((x - this.config.startX) / width);
		const row = Math.round((y - this.config.startY) / height);

		return { col: Math.max(0, col), row: Math.max(0, row) };
	}

	/**
	 * Get grid position from cell (col, row)
	 */
	getPositionFromCell(col: number, row: number): GridPosition {
		const { width, height } = this.getCellDimensions();
		return {
			x: this.config.startX + col * width,
			y: this.config.startY + row * height
		};
	}

	/**
	 * Calculate bounding box of all sandboxes
	 */
	calculateBounds(sandboxes: Sandbox[]): GridBounds {
		if (sandboxes.length === 0) {
			return {
				minX: this.config.startX,
				minY: this.config.startY,
				maxX: this.config.startX,
				maxY: this.config.startY
			};
		}

		const { width, height } = this.getSandboxDimensions();

		let minX = Infinity, minY = Infinity;
		let maxX = -Infinity, maxY = -Infinity;

		sandboxes.forEach(sandbox => {
			minX = Math.min(minX, sandbox.x);
			minY = Math.min(minY, sandbox.y);
			maxX = Math.max(maxX, sandbox.x + width);
			maxY = Math.max(maxY, sandbox.y + height);
		});

		return { minX, minY, maxX, maxY };
	}

	// ============================================
	// Overlap Detection
	// ============================================

	/**
	 * Check if two sandboxes overlap
	 */
	checkOverlap(pos1: GridPosition, pos2: GridPosition): boolean {
		const { width, height } = this.getSandboxDimensions();

		const rect1 = { x: pos1.x, y: pos1.y, width, height };
		const rect2 = { x: pos2.x, y: pos2.y, width, height };

		// Check if rectangles overlap
		return !(rect1.x + rect1.width <= rect2.x ||
			rect2.x + rect2.width <= rect1.x ||
			rect1.y + rect1.height <= rect2.y ||
			rect2.y + rect2.height <= rect1.y);
	}

	/**
	 * Check if a position would overlap with any existing sandbox
	 * Uses cell dimensions (sandbox + gap) for detection, not the full padded visual size
	 * Only reports overlap when it exceeds OVERLAP_WARNING_THRESHOLD
	 */
	detectOverlap(
		x: number,
		y: number,
		currentId: string,
		existingSandboxes: Sandbox[]
	): OverlapInfo {
		const overlappingWith: string[] = [];
		let maxOverlapPercent = 0;

		// Use cell dimensions for overlap detection (more accurate than visual size with padding)
		const { width, height } = this.getCellDimensions();

		for (const sandbox of existingSandboxes) {
			if (sandbox.id === currentId) {
				continue;
			}

			// Calculate overlap area between rectangles
			const overlapX = Math.max(0,
				Math.min(x + width, sandbox.x + width) - Math.max(x, sandbox.x)
			);
			const overlapY = Math.max(0,
				Math.min(y + height, sandbox.y + height) - Math.max(y, sandbox.y)
			);

			const overlapArea = overlapX * overlapY;
			const totalArea = width * height;
			const overlapPercent = overlapArea / totalArea;

			// Only count as overlapping if exceeds threshold (10% by default)
			if (overlapPercent >= OVERLAP_WARNING_THRESHOLD) {
				overlappingWith.push(sandbox.id);
				maxOverlapPercent = Math.max(maxOverlapPercent, overlapPercent);
			}
		}

		return {
			isOverlapping: overlappingWith.length > 0,
			overlappingWith,
			overlapPercent: maxOverlapPercent
		};
	}

	/**
	 * Check if a grid slot is occupied (exact position match)
	 */
	isSlotOccupied(
		gridX: number,
		gridY: number,
		currentId: string,
		existingSandboxes: Sandbox[]
	): boolean {
		const tolerance = 50; // pixels tolerance

		for (const sandbox of existingSandboxes) {
			if (sandbox.id === currentId) {
				continue;
			}

			const deltaX = Math.abs(sandbox.x - gridX);
			const deltaY = Math.abs(sandbox.y - gridY);

			if (deltaX < tolerance && deltaY < tolerance) {
				return true;
			}
		}

		return false;
	}

	// ============================================
	// Snap-to-Grid Logic
	// ============================================

	/**
	 * Main snap function - behavior depends on mode
	 *
	 * GRID MODE:
	 * - Always snaps to nearest AVAILABLE grid slot
	 * - Never allows overlap
	 * - If nearest slot is occupied, finds next available
	 *
	 * FREE MODE:
	 * - Only snaps if within threshold AND snap is enabled
	 * - Allows overlap (with visual indicator)
	 * - More flexible positioning
	 */
	snapToGrid(
		x: number,
		y: number,
		existingSandboxes: Sandbox[],
		currentId?: string
	): SnapResult {
		if (this.mode === 'grid') {
			return this.snapToGridMode(x, y, existingSandboxes, currentId);
		} else {
			return this.snapToFreeMode(x, y, existingSandboxes, currentId);
		}
	}

	/**
	 * Grid Mode snap - strict grid positioning, no overlap allowed
	 */
	private snapToGridMode(
		x: number,
		y: number,
		existingSandboxes: Sandbox[],
		currentId?: string
	): SnapResult {
		// Find nearest grid slot
		const { col, row } = this.getGridCell(x, y);
		let snapPos = this.getPositionFromCell(col, row);

		// Check if slot is occupied
		const isOccupied = currentId && this.isSlotOccupied(snapPos.x, snapPos.y, currentId, existingSandboxes);

		if (isOccupied) {
			// Find nearest unoccupied slot using spiral search
			const nearestFree = this.findNearestFreeSlot(col, row, currentId, existingSandboxes);
			if (nearestFree) {
				snapPos = nearestFree;
			}
		}

		// Check for overlap (should be none in grid mode if working correctly)
		const overlapInfo = this.detectOverlap(snapPos.x, snapPos.y, currentId || '', existingSandboxes);

		return {
			x: snapPos.x,
			y: snapPos.y,
			snappedX: true,
			snappedY: true,
			isOverlapping: overlapInfo.isOverlapping,
			blockedByGrid: isOccupied || false
		};
	}

	/**
	 * Free Mode snap - flexible positioning with optional snap
	 */
	private snapToFreeMode(
		x: number,
		y: number,
		existingSandboxes: Sandbox[],
		currentId?: string
	): SnapResult {
		let resultX = x;
		let resultY = y;
		let snappedX = false;
		let snappedY = false;

		// Only snap if enabled
		if (this.snapEnabled) {
			const threshold = this.getSnapThresholdPixels();

			// Find nearest grid slot
			const { col, row } = this.getGridCell(x, y);
			const snapPos = this.getPositionFromCell(col, row);

			// Check if within threshold
			const deltaX = Math.abs(x - snapPos.x);
			const deltaY = Math.abs(y - snapPos.y);

			if (deltaX <= threshold.x) {
				resultX = snapPos.x;
				snappedX = true;
			}

			if (deltaY <= threshold.y) {
				resultY = snapPos.y;
				snappedY = true;
			}
		}

		// Check for overlap (allowed in free mode, but indicate visually)
		const overlapInfo = this.detectOverlap(resultX, resultY, currentId || '', existingSandboxes);

		return {
			x: resultX,
			y: resultY,
			snappedX,
			snappedY,
			isOverlapping: overlapInfo.isOverlapping,
			blockedByGrid: false // Never blocked in free mode
		};
	}

	/**
	 * Find nearest unoccupied grid slot
	 * Prefers same row (horizontal) before moving to different rows
	 * RULE: Fill rows first before moving to next row
	 */
	private findNearestFreeSlot(
		startCol: number,
		startRow: number,
		currentId: string,
		existingSandboxes: Sandbox[]
	): GridPosition | null {
		const maxSearchRadius = 10; // Search up to 10 cells away

		// Search pattern: prioritize same row first, then expand
		for (let radius = 1; radius <= maxSearchRadius; radius++) {
			// First, check same row (left and right)
			for (let dx = -radius; dx <= radius; dx++) {
				const col = startCol + dx;
				if (col < 0 || col >= this.config.columns) continue;

				const pos = this.getPositionFromCell(col, startRow);
				if (!this.isSlotOccupied(pos.x, pos.y, currentId, existingSandboxes)) {
					return pos;
				}
			}

			// Then check rows above and below at this radius
			for (let dy = 1; dy <= radius; dy++) {
				// Check row above
				if (startRow - dy >= 0) {
					for (let dx = -radius; dx <= radius; dx++) {
						const col = startCol + dx;
						if (col < 0 || col >= this.config.columns) continue;

						const pos = this.getPositionFromCell(col, startRow - dy);
						if (!this.isSlotOccupied(pos.x, pos.y, currentId, existingSandboxes)) {
							return pos;
						}
					}
				}

				// Check row below
				for (let dx = -radius; dx <= radius; dx++) {
					const col = startCol + dx;
					if (col < 0 || col >= this.config.columns) continue;

					const pos = this.getPositionFromCell(col, startRow + dy);
					if (!this.isSlotOccupied(pos.x, pos.y, currentId, existingSandboxes)) {
						return pos;
					}
				}
			}
		}

		// Fallback: use getNextAvailableSlot which fills row-first
		return this.getNextAvailableSlot(existingSandboxes);
	}

	// ============================================
	// Tidy Up - Reorganize to Grid
	// ============================================

	/**
	 * Reorganize all sandboxes to grid slots
	 * RULE: Always fill rows first before moving to the next row
	 * Returns new positions for each sandbox
	 */
	tidyUp(sandboxes: Sandbox[]): Map<string, GridPosition> {
		const positions = new Map<string, GridPosition>();

		// Sort sandboxes by current position (row first, then column)
		// This preserves relative order while reorganizing
		const sorted = [...sandboxes].sort((a, b) => {
			const cellA = this.getGridCell(a.x, a.y);
			const cellB = this.getGridCell(b.x, b.y);
			// Sort by row first, then by column
			if (cellA.row !== cellB.row) return cellA.row - cellB.row;
			return cellA.col - cellB.col;
		});

		// Assign each sandbox to sequential grid position (row by row)
		// This ensures rows are filled first before moving to next row
		for (let i = 0; i < sorted.length; i++) {
			const sandbox = sorted[i];
			const col = i % this.config.columns;
			const row = Math.floor(i / this.config.columns);
			const pos = this.getPositionFromCell(col, row);
			positions.set(sandbox.id, pos);
		}

		return positions;
	}

	/**
	 * Get next available slot for a new sandbox
	 */
	getNextAvailableSlot(existingSandboxes: Sandbox[]): GridPosition {
		const occupiedSlots = new Set<string>();

		// Mark all occupied slots
		for (const sandbox of existingSandboxes) {
			const { col, row } = this.getGridCell(sandbox.x, sandbox.y);
			occupiedSlots.add(`${col},${row}`);
		}

		// Find first unoccupied slot (row by row)
		for (let index = 0; index < 1000; index++) {
			const col = index % this.config.columns;
			const row = Math.floor(index / this.config.columns);
			const key = `${col},${row}`;

			if (!occupiedSlots.has(key)) {
				return this.getPositionFromCell(col, row);
			}
		}

		// Fallback
		return this.calculateGridPosition(existingSandboxes.length);
	}

	// ============================================
	// Background Rendering
	// ============================================

	/**
	 * Check if a color is light (for pattern contrast)
	 */
	isLightColor(hexColor: string): boolean {
		const hex = hexColor.replace('#', '');
		const r = parseInt(hex.substring(0, 2), 16);
		const g = parseInt(hex.substring(2, 4), 16);
		const b = parseInt(hex.substring(4, 6), 16);
		const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
		return luminance > 0.5;
	}

	/**
	 * Apply background pattern to container
	 */
	applyBackgroundPattern(
		container: HTMLElement,
		viewport: CanvasViewport,
		backgroundColor: string,
		pattern: BackgroundPattern
	): void {
		const gridSize = 20 * viewport.scale;
		const offsetX = viewport.x % gridSize;
		const offsetY = viewport.y % gridSize;

		const isLight = this.isLightColor(backgroundColor);
		const patternColor = isLight
			? 'rgba(0, 0, 0, 0.1)'
			: 'rgba(255, 255, 255, 0.05)';
		const dotColor = isLight
			? 'rgba(0, 0, 0, 0.15)'
			: 'rgba(255, 255, 255, 0.15)';

		container.style.backgroundColor = backgroundColor;

		if (pattern === 'grid') {
			container.style.backgroundImage = `
				linear-gradient(${patternColor} 1px, transparent 1px),
				linear-gradient(90deg, ${patternColor} 1px, transparent 1px)
			`;
			container.style.backgroundSize = `${gridSize}px ${gridSize}px`;
			container.style.backgroundPosition = `${offsetX}px ${offsetY}px`;
		} else if (pattern === 'dots') {
			container.style.backgroundImage =
				`radial-gradient(circle, ${dotColor} 1px, transparent 1px)`;
			container.style.backgroundSize = `${gridSize}px ${gridSize}px`;
			container.style.backgroundPosition = `${offsetX}px ${offsetY}px`;
		} else {
			container.style.backgroundImage = 'none';
		}
	}

	// ============================================
	// Viewport Calculations
	// ============================================

	/**
	 * Calculate viewport to fit all sandboxes
	 */
	calculateFitViewport(
		sandboxes: Sandbox[],
		viewportWidth: number,
		viewportHeight: number,
		padding: number = 100
	): CanvasViewport {
		if (sandboxes.length === 0) {
			return { x: 0, y: 0, scale: 1 };
		}

		const bounds = this.calculateBounds(sandboxes);
		const contentWidth = bounds.maxX - bounds.minX;
		const contentHeight = bounds.maxY - bounds.minY;

		const scaleX = (viewportWidth - padding * 2) / contentWidth;
		const scaleY = (viewportHeight - padding * 2) / contentHeight;
		const scale = Math.min(scaleX, scaleY, 1);

		const x = (viewportWidth - contentWidth * scale) / 2 - bounds.minX * scale;
		const y = (viewportHeight - contentHeight * scale) / 2 - bounds.minY * scale;

		return { x, y, scale };
	}

	/**
	 * Calculate viewport to focus on a single sandbox
	 */
	calculateFocusViewport(
		sandbox: Sandbox,
		viewportWidth: number,
		viewportHeight: number,
		usablePercent: number = 0.8
	): CanvasViewport {
		const { width, height } = this.getSandboxDimensions();

		const usableWidth = viewportWidth * usablePercent;
		const usableHeight = viewportHeight * usablePercent;

		const scaleX = usableWidth / width;
		const scaleY = usableHeight / height;
		const scale = Math.min(scaleX, scaleY, 1.2);

		const sandboxCenterX = sandbox.x + width / 2;
		const sandboxCenterY = sandbox.y + height / 2;

		const x = viewportWidth / 2 - sandboxCenterX * scale;
		const y = viewportHeight / 2 - sandboxCenterY * scale;

		return { x, y, scale };
	}

	// ============================================
	// Reset Positions - Center All Components
	// ============================================

	/**
	 * Calculate viewport to center all sandboxes in visible range
	 * Used after canvas has been panned/zoomed away from content
	 *
	 * @param sandboxes - All sandboxes to center
	 * @param viewportWidth - Current viewport width in pixels
	 * @param viewportHeight - Current viewport height in pixels
	 * @param padding - Padding around content (default 80px)
	 * @param maxScale - Maximum scale to apply (default 1.0 for 100%)
	 * @returns New viewport to center all content
	 */
	calculateResetViewport(
		sandboxes: Sandbox[],
		viewportWidth: number,
		viewportHeight: number,
		padding: number = 80,
		maxScale: number = 1.0
	): CanvasViewport {
		// If no sandboxes, reset to default centered position
		if (sandboxes.length === 0) {
			return {
				x: padding,
				y: padding,
				scale: 1
			};
		}

		// Calculate bounding box of all sandboxes
		const bounds = this.calculateBounds(sandboxes);
		const contentWidth = bounds.maxX - bounds.minX;
		const contentHeight = bounds.maxY - bounds.minY;

		// Calculate available space (viewport minus padding)
		const availableWidth = viewportWidth - (padding * 2);
		const availableHeight = viewportHeight - (padding * 2);

		// Calculate scale to fit content (don't zoom in beyond maxScale)
		const scaleX = availableWidth / contentWidth;
		const scaleY = availableHeight / contentHeight;
		const scale = Math.min(scaleX, scaleY, maxScale);

		// Calculate center of content
		const contentCenterX = bounds.minX + contentWidth / 2;
		const contentCenterY = bounds.minY + contentHeight / 2;

		// Calculate viewport position to center content
		const x = (viewportWidth / 2) - (contentCenterX * scale);
		const y = (viewportHeight / 2) - (contentCenterY * scale);

		return { x, y, scale };
	}

	/**
	 * Calculate viewport to reset to default grid start position
	 * Shows sandboxes starting from grid origin
	 */
	calculateDefaultViewport(padding: number = 40): CanvasViewport {
		return {
			x: padding,
			y: padding,
			scale: 1
		};
	}
}

// ============================================
// Singleton Instance
// ============================================

let _gridManager: GridManager | undefined;

export function getGridManager(): GridManager {
	if (!_gridManager) {
		_gridManager = new GridManager();
	}
	return _gridManager;
}
