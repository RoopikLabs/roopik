/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import type {
	Sandbox,
	SnapMode,
	SnapResult,
	GridConfig,
	GridPosition,
	OverlapInfo,
	CanvasViewport
} from '../types';
import { DEFAULT_GRID_CONFIG } from '../types';

/**
 * GridManager - Handles all grid-related calculations for the canvas
 *
 * Two Modes:
 * 1. GRID MODE - Strict grid positioning, no overlap allowed, auto-snap to grid
 * 2. FREE MODE - Free positioning, overlap allowed with visual indicator, optional snap
 *
 * Features:
 * - Calculate grid positions for sandboxes (4 columns, fills rows first)
 * - Snap-to-grid functionality with configurable threshold
 * - Overlap detection with visual indicator
 * - Tidy Up: Reorganize all sandboxes to grid slots
 * - Viewport calculations: focus, fit, reset
 *
 * Performance: Local to webview for 60fps snap operations during drag!
 */

// Snap threshold as percentage of cell dimensions (0.0 - 1.0)
const SNAP_THRESHOLD_PERCENT = 0.15; // 15%

// Overlap warning threshold - only show warning when overlap exceeds this
const OVERLAP_WARNING_THRESHOLD = 0.1; // 10%

export class GridManager {
	private config: GridConfig;
	private mode: SnapMode = 'grid';
	private snapThresholdPercent: number = SNAP_THRESHOLD_PERCENT;
	private snapEnabled: boolean = true;

	constructor(config?: Partial<GridConfig>) {
		this.config = { ...DEFAULT_GRID_CONFIG, ...config };
	}

	// ============================================
	// Mode Management
	// ============================================

	getMode(): SnapMode {
		return this.mode;
	}

	setMode(mode: SnapMode): void {
		this.mode = mode;
	}

	toggleMode(): SnapMode {
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

	getColumns(): number {
		return this.config.columns;
	}

	setSnapEnabled(enabled: boolean): void {
		this.snapEnabled = enabled;
	}

	isSnapEnabled(): boolean {
		return this.snapEnabled;
	}

	setSnapThresholdPercent(percent: number): void {
		this.snapThresholdPercent = Math.max(0, Math.min(1, percent));
	}

	// ============================================
	// Dimension Calculations
	// ============================================

	/**
	 * Get sandbox visual dimensions (width + padding + margin)
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
	 * Get snap threshold in pixels
	 */
	private getSnapThresholdPixels(): { x: number; y: number } {
		const { width, height } = this.getSandboxDimensions();
		return {
			x: width * this.snapThresholdPercent,
			y: height * this.snapThresholdPercent
		};
	}

	// ============================================
	// Grid Position Calculations
	// ============================================

	/**
	 * Calculate grid position by index (fills rows first, then moves to next row)
	 * Rule: 4 columns per row, then next row
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
	 * Get position from cell (col, row)
	 */
	getPositionFromCell(col: number, row: number): GridPosition {
		const { width, height } = this.getCellDimensions();
		return {
			x: this.config.startX + col * width,
			y: this.config.startY + row * height
		};
	}

	// ============================================
	// Overlap Detection
	// ============================================

	/**
	 * Check if a position would overlap with existing sandboxes
	 */
	detectOverlap(
		x: number,
		y: number,
		currentId: string,
		existingSandboxes: Sandbox[]
	): OverlapInfo {
		const overlappingWith: string[] = [];
		let maxOverlapPercent = 0;
		const { width, height } = this.getCellDimensions();

		for (const sandbox of existingSandboxes) {
			if (sandbox.id === currentId) continue;

			// Calculate overlap area
			const overlapX = Math.max(0,
				Math.min(x + width, sandbox.x + width) - Math.max(x, sandbox.x)
			);
			const overlapY = Math.max(0,
				Math.min(y + height, sandbox.y + height) - Math.max(y, sandbox.y)
			);

			const overlapArea = overlapX * overlapY;
			const totalArea = width * height;
			const overlapPercent = overlapArea / totalArea;

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
	 * Check if a grid slot is occupied
	 */
	isSlotOccupied(
		gridX: number,
		gridY: number,
		currentId: string,
		existingSandboxes: Sandbox[]
	): boolean {
		const tolerance = 50;

		for (const sandbox of existingSandboxes) {
			if (sandbox.id === currentId) continue;

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
	 * GRID MODE: Always snaps to nearest available slot, no overlap
	 * FREE MODE: Optional snap within threshold, overlap allowed
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
	 * Grid Mode - strict positioning, no overlap
	 */
	private snapToGridMode(
		x: number,
		y: number,
		existingSandboxes: Sandbox[],
		currentId?: string
	): SnapResult {
		const { col, row } = this.getGridCell(x, y);
		let snapPos = this.getPositionFromCell(col, row);

		const isOccupied = currentId && this.isSlotOccupied(snapPos.x, snapPos.y, currentId, existingSandboxes);

		if (isOccupied) {
			const nearestFree = this.findNearestFreeSlot(col, row, currentId, existingSandboxes);
			if (nearestFree) {
				snapPos = nearestFree;
			}
		}

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
	 * Free Mode - flexible positioning with optional snap
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

		if (this.snapEnabled) {
			const threshold = this.getSnapThresholdPixels();
			const { col, row } = this.getGridCell(x, y);
			const snapPos = this.getPositionFromCell(col, row);

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

		const overlapInfo = this.detectOverlap(resultX, resultY, currentId || '', existingSandboxes);

		return {
			x: resultX,
			y: resultY,
			snappedX,
			snappedY,
			isOverlapping: overlapInfo.isOverlapping,
			blockedByGrid: false
		};
	}

	/**
	 * Find nearest unoccupied slot - prioritizes same row first
	 */
	private findNearestFreeSlot(
		startCol: number,
		startRow: number,
		currentId: string,
		existingSandboxes: Sandbox[]
	): GridPosition | null {
		const maxSearchRadius = 10;

		for (let radius = 1; radius <= maxSearchRadius; radius++) {
			// Check same row first (left and right)
			for (let dx = -radius; dx <= radius; dx++) {
				const col = startCol + dx;
				if (col < 0 || col >= this.config.columns) continue;

				const pos = this.getPositionFromCell(col, startRow);
				if (!this.isSlotOccupied(pos.x, pos.y, currentId, existingSandboxes)) {
					return pos;
				}
			}

			// Then check rows above and below
			for (let dy = 1; dy <= radius; dy++) {
				// Row above
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

				// Row below
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

		return this.getNextAvailableSlot(existingSandboxes);
	}

	// ============================================
	// Next Available Slot (for new components)
	// ============================================

	/**
	 * Get next available slot - fills rows first (4 per row)
	 */
	getNextAvailableSlot(existingSandboxes: Sandbox[]): GridPosition {
		const occupiedSlots = new Set<string>();

		for (const sandbox of existingSandboxes) {
			const { col, row } = this.getGridCell(sandbox.x, sandbox.y);
			occupiedSlots.add(`${col},${row}`);
		}

		// Find first unoccupied slot (row by row, filling columns first)
		for (let index = 0; index < 1000; index++) {
			const col = index % this.config.columns;
			const row = Math.floor(index / this.config.columns);
			const key = `${col},${row}`;

			if (!occupiedSlots.has(key)) {
				return this.getPositionFromCell(col, row);
			}
		}

		return this.calculateGridPosition(existingSandboxes.length);
	}

	// ============================================
	// Tidy Up - Reorganize All to Grid
	// ============================================

	/**
	 * Reorganize all sandboxes to grid slots
	 * Returns map of sandbox ID -> new position
	 */
	tidyUp(sandboxes: Sandbox[]): Map<string, GridPosition> {
		const positions = new Map<string, GridPosition>();

		// Sort by current position (row first, then column)
		const sorted = [...sandboxes].sort((a, b) => {
			const cellA = this.getGridCell(a.x, a.y);
			const cellB = this.getGridCell(b.x, b.y);
			if (cellA.row !== cellB.row) return cellA.row - cellB.row;
			return cellA.col - cellB.col;
		});

		// Assign sequential grid positions (fills rows first)
		for (let i = 0; i < sorted.length; i++) {
			const sandbox = sorted[i];
			const col = i % this.config.columns;
			const row = Math.floor(i / this.config.columns);
			positions.set(sandbox.id, this.getPositionFromCell(col, row));
		}

		return positions;
	}

	// ============================================
	// Viewport Calculations
	// ============================================

	/**
	 * Calculate bounding box of all sandboxes
	 */
	private calculateBounds(sandboxes: Sandbox[]): { minX: number; minY: number; maxX: number; maxY: number } {
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

		for (const sandbox of sandboxes) {
			minX = Math.min(minX, sandbox.x);
			minY = Math.min(minY, sandbox.y);
			maxX = Math.max(maxX, sandbox.x + width);
			maxY = Math.max(maxY, sandbox.y + height);
		}

		return { minX, minY, maxX, maxY };
	}

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
	 * Calculate viewport to focus on a single sandbox (zoom in on double click)
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
		const scale = Math.min(scaleX, scaleY, 1.2); // Max 120% zoom

		const sandboxCenterX = sandbox.x + width / 2;
		const sandboxCenterY = sandbox.y + height / 2;

		const x = viewportWidth / 2 - sandboxCenterX * scale;
		const y = viewportHeight / 2 - sandboxCenterY * scale;

		return { x, y, scale };
	}

	/**
	 * Calculate viewport to reset view (center all content)
	 */
	calculateResetViewport(
		sandboxes: Sandbox[],
		viewportWidth: number,
		viewportHeight: number,
		padding: number = 80,
		maxScale: number = 1.0
	): CanvasViewport {
		if (sandboxes.length === 0) {
			return { x: padding, y: padding, scale: 1 };
		}

		const bounds = this.calculateBounds(sandboxes);
		const contentWidth = bounds.maxX - bounds.minX;
		const contentHeight = bounds.maxY - bounds.minY;

		const availableWidth = viewportWidth - (padding * 2);
		const availableHeight = viewportHeight - (padding * 2);

		const scaleX = availableWidth / contentWidth;
		const scaleY = availableHeight / contentHeight;
		const scale = Math.min(scaleX, scaleY, maxScale);

		const contentCenterX = bounds.minX + contentWidth / 2;
		const contentCenterY = bounds.minY + contentHeight / 2;

		const x = (viewportWidth / 2) - (contentCenterX * scale);
		const y = (viewportHeight / 2) - (contentCenterY * scale);

		return { x, y, scale };
	}

	/**
	 * Calculate default viewport (grid start position)
	 */
	calculateDefaultViewport(padding: number = 40): CanvasViewport {
		return { x: padding, y: padding, scale: 1 };
	}
}

// Singleton instance for the webview
export const gridManager = new GridManager();
