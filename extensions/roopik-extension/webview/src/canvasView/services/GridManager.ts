/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import type { Point, Rect, SnapMode, SnapResult } from '../types';

/**
 * GridManager - Local to webview for 60fps snap performance
 *
 * The Golden Rule: "Who needs to know *during* the drag?"
 * Answer: Only the UI (webview) needs instant feedback during drag.
 * Core only needs to know after the drop.
 *
 * This is why GridManager runs locally - no IPC latency during drag!
 *
 * Performance: snap() called every 16ms during drag - MUST be fast!
 * - During drag: GridManager calculates snap every 16ms (LOCAL)
 * - After drop: Only then send final position to Core for persistence
 */
export class GridManager {
	private mode: SnapMode = 'smart';
	private gridSize = 20;
	private snapThreshold = 10;

	/**
	 * Get current snap mode
	 */
	getMode(): SnapMode {
		return this.mode;
	}

	/**
	 * Set snap mode
	 */
	setMode(mode: SnapMode): void {
		this.mode = mode;
	}

	/**
	 * Get grid size
	 */
	getGridSize(): number {
		return this.gridSize;
	}

	/**
	 * Basic grid snap (for 'grid' mode)
	 * Called on every mouse move during drag - optimized for 60fps
	 */
	snap(x: number, y: number): Point {
		if (this.mode === 'free') {
			return { x, y };
		}

		return {
			x: Math.round(x / this.gridSize) * this.gridSize,
			y: Math.round(y / this.gridSize) * this.gridSize
		};
	}

	/**
	 * Smart snap to other components' edges (for 'smart' mode)
	 * Like Figma - snaps to left, right, top, bottom, center of other components
	 *
	 * @param point - Current drag position (top-left of dragging component)
	 * @param bounds - Size of the dragging component
	 * @param others - All other components on canvas
	 */
	smartSnap(point: Point, bounds: Rect, others: Rect[]): SnapResult {
		// Free mode - no snapping
		if (this.mode === 'free') {
			return {
				point,
				snapLines: { vertical: null, horizontal: null }
			};
		}

		// Grid mode - use basic grid snap
		if (this.mode === 'grid') {
			const snapped = this.snap(point.x, point.y);
			return {
				point: snapped,
				snapLines: { vertical: null, horizontal: null }
			};
		}

		// Smart mode - snap to other components
		let closestX = point.x;
		let closestY = point.y;
		let snapLineV: number | null = null;
		let snapLineH: number | null = null;
		let minDistX = this.snapThreshold;
		let minDistY = this.snapThreshold;

		// Calculate edges of the dragging component
		const dragLeft = point.x;
		const dragRight = point.x + bounds.width;
		const dragTop = point.y;
		const dragBottom = point.y + bounds.height;
		const dragCenterX = point.x + bounds.width / 2;
		const dragCenterY = point.y + bounds.height / 2;

		// Check against all other components
		for (const other of others) {
			const otherLeft = other.x;
			const otherRight = other.x + other.width;
			const otherTop = other.y;
			const otherBottom = other.y + other.height;
			const otherCenterX = other.x + other.width / 2;
			const otherCenterY = other.y + other.height / 2;

			// Vertical snaps (X axis) - check all edge combinations
			const verticalSnaps = [
				{ dragEdge: dragLeft, targetEdge: otherLeft, offset: 0 },                    // left to left
				{ dragEdge: dragLeft, targetEdge: otherRight, offset: 0 },                   // left to right
				{ dragEdge: dragRight, targetEdge: otherLeft, offset: -bounds.width },       // right to left
				{ dragEdge: dragRight, targetEdge: otherRight, offset: -bounds.width },      // right to right
				{ dragEdge: dragCenterX, targetEdge: otherCenterX, offset: -bounds.width / 2 } // center to center
			];

			for (const snap of verticalSnaps) {
				const distance = Math.abs(snap.dragEdge - snap.targetEdge);
				if (distance < minDistX) {
					minDistX = distance;
					closestX = snap.targetEdge + snap.offset;
					snapLineV = snap.targetEdge;
				}
			}

			// Horizontal snaps (Y axis) - check all edge combinations
			const horizontalSnaps = [
				{ dragEdge: dragTop, targetEdge: otherTop, offset: 0 },                      // top to top
				{ dragEdge: dragTop, targetEdge: otherBottom, offset: 0 },                   // top to bottom
				{ dragEdge: dragBottom, targetEdge: otherTop, offset: -bounds.height },      // bottom to top
				{ dragEdge: dragBottom, targetEdge: otherBottom, offset: -bounds.height },   // bottom to bottom
				{ dragEdge: dragCenterY, targetEdge: otherCenterY, offset: -bounds.height / 2 } // center to center
			];

			for (const snap of horizontalSnaps) {
				const distance = Math.abs(snap.dragEdge - snap.targetEdge);
				if (distance < minDistY) {
					minDistY = distance;
					closestY = snap.targetEdge + snap.offset;
					snapLineH = snap.targetEdge;
				}
			}
		}

		return {
			point: { x: closestX, y: closestY },
			snapLines: { vertical: snapLineV, horizontal: snapLineH }
		};
	}

	/**
	 * Find next empty slot for new components
	 * Uses simple grid-based layout algorithm
	 */
	findNextEmptySlot(components: Rect[], newSize: { width: number; height: number }): Point {
		const padding = 40;
		const startX = 100;
		const startY = 100;
		const columns = 3;

		const count = components.length;
		const col = count % columns;
		const row = Math.floor(count / columns);

		const x = startX + col * (newSize.width + padding);
		const y = startY + row * (newSize.height + padding);

		return this.snap(x, y);
	}
}

// Singleton instance for the webview
export const gridManager = new GridManager();
