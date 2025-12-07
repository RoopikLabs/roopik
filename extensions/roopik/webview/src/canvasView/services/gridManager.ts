/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import type { Sandbox, Transform } from '../types';

// ============================================================
// Grid Configuration
// ============================================================

export interface GridConfig {
	sandboxWidth: number;
	sandboxHeight: number;
	gridColumns: number;
	containerMargin: number;
	containerPaddingLR: number;
	containerPaddingTB: number;
	gapX: number;
	gapY: number;
	startX: number;
	startY: number;
}

const DEFAULT_CONFIG: GridConfig = {
	sandboxWidth: 500,
	sandboxHeight: 500,
	gridColumns: 4,
	containerMargin: 20,
	containerPaddingLR: 120,
	containerPaddingTB: 40,
	gapX: 60,
	gapY: 60,
	startX: 100,
	startY: 100,
};

// ============================================================
// Grid Calculations
// ============================================================

/**
 * Calculate total dimensions of a sandbox including container padding/margin.
 */
export function getSandboxTotalDimensions(config: GridConfig = DEFAULT_CONFIG) {
	const totalWidth = config.sandboxWidth + (config.containerMargin * 2) + (config.containerPaddingLR * 2);
	const totalHeight = config.sandboxHeight + (config.containerMargin * 2) + (config.containerPaddingTB * 2);
	return { totalWidth, totalHeight };
}

/**
 * Calculate grid position for a sandbox at the given index.
 */
export function getGridPosition(index: number, config: GridConfig = DEFAULT_CONFIG): { x: number; y: number } {
	const { totalWidth, totalHeight } = getSandboxTotalDimensions(config);
	const col = index % config.gridColumns;
	const row = Math.floor(index / config.gridColumns);

	return {
		x: config.startX + (col * (totalWidth + config.gapX)),
		y: config.startY + (row * (totalHeight + config.gapY)),
	};
}

/**
 * Reorganize all sandboxes to proper grid layout positions.
 */
export function reorganizeSandboxes(
	sandboxes: Sandbox[],
	config: GridConfig = DEFAULT_CONFIG
): Sandbox[] {
	return sandboxes.map((sandbox, index) => {
		const position = getGridPosition(index, config);
		return {
			...sandbox,
			x: position.x,
			y: position.y,
		};
	});
}

// ============================================================
// Bounding Box Calculations
// ============================================================

interface BoundingBox {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
	width: number;
	height: number;
}

/**
 * Calculate the bounding box containing all sandboxes.
 */
export function getSandboxBoundingBox(
	sandboxes: Sandbox[],
	config: GridConfig = DEFAULT_CONFIG
): BoundingBox | null {
	if (sandboxes.length === 0) {
		return null;
	}

	const { totalWidth, totalHeight } = getSandboxTotalDimensions(config);

	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;

	sandboxes.forEach(sandbox => {
		minX = Math.min(minX, sandbox.x);
		minY = Math.min(minY, sandbox.y);
		maxX = Math.max(maxX, sandbox.x + totalWidth);
		maxY = Math.max(maxY, sandbox.y + totalHeight);
	});

	return {
		minX,
		minY,
		maxX,
		maxY,
		width: maxX - minX,
		height: maxY - minY,
	};
}

// ============================================================
// Viewport Calculations
// ============================================================

interface ViewportSize {
	width: number;
	height: number;
}

/**
 * Calculate transform to fit all sandboxes in the viewport.
 */
export function calculateFitAllTransform(
	sandboxes: Sandbox[],
	viewport: ViewportSize,
	config: GridConfig = DEFAULT_CONFIG,
	options: { padding?: number; toolbarHeight?: number; maxScale?: number } = {}
): Transform | null {
	const boundingBox = getSandboxBoundingBox(sandboxes, config);
	if (!boundingBox) {
		return null;
	}

	const {
		padding = 100,
		toolbarHeight = 100,
		maxScale = 1,
	} = options;

	const usableHeight = viewport.height - toolbarHeight;

	const scaleX = (viewport.width - padding * 2) / boundingBox.width;
	const scaleY = (usableHeight - padding * 2) / boundingBox.height;
	const scale = Math.min(scaleX, scaleY, maxScale);

	const centerX = (viewport.width - boundingBox.width * scale) / 2 - boundingBox.minX * scale;
	const centerY = (usableHeight - boundingBox.height * scale) / 2 - boundingBox.minY * scale;

	return { x: centerX, y: centerY, scale };
}

/**
 * Calculate transform to focus on a single sandbox.
 */
export function calculateFocusTransform(
	sandbox: Sandbox,
	viewport: ViewportSize,
	config: GridConfig = DEFAULT_CONFIG,
	options: { usableHeightRatio?: number; usableWidthRatio?: number; maxScale?: number } = {}
): Transform {
	const {
		usableHeightRatio = 0.8,
		usableWidthRatio = 0.9,
		maxScale = 1.2,
	} = options;

	const { totalWidth, totalHeight } = getSandboxTotalDimensions(config);

	const usableHeight = viewport.height * usableHeightRatio;
	const usableWidth = viewport.width * usableWidthRatio;

	const scaleX = usableWidth / totalWidth;
	const scaleY = usableHeight / totalHeight;
	const scale = Math.min(scaleX, scaleY, maxScale);

	// Calculate center position
	const sandboxVisualCenterX = sandbox.x + totalWidth / 2;
	const sandboxVisualCenterY = sandbox.y + totalHeight / 2;
	const viewportCenterX = viewport.width / 2;
	const viewportCenterY = viewport.height / 2;

	const x = viewportCenterX - sandboxVisualCenterX * scale;
	const y = viewportCenterY - sandboxVisualCenterY * scale;

	return { x, y, scale };
}


// ============================================================
// Smart Grid Positioning
// ============================================================

/**
 * Get slot index from pixel position.
 * Returns the grid slot (column, row) for a given x,y position.
 */
export function getSlotFromPosition(
	x: number,
	y: number,
	config: GridConfig = DEFAULT_CONFIG
): { col: number; row: number; slotIndex: number } {
	const { totalWidth, totalHeight } = getSandboxTotalDimensions(config);

	const col = Math.round((x - config.startX) / (totalWidth + config.gapX));
	const row = Math.round((y - config.startY) / (totalHeight + config.gapY));

	// Clamp to valid range
	const clampedCol = Math.max(0, Math.min(col, config.gridColumns - 1));
	const clampedRow = Math.max(0, row);

	return {
		col: clampedCol,
		row: clampedRow,
		slotIndex: clampedRow * config.gridColumns + clampedCol,
	};
}

/**
 * Get all occupied slot indices from sandboxes.
 */
export function getOccupiedSlots(
	sandboxes: Sandbox[],
	config: GridConfig = DEFAULT_CONFIG
): Set<number> {
	const occupied = new Set<number>();

	sandboxes.forEach(sandbox => {
		const slot = getSlotFromPosition(sandbox.x, sandbox.y, config);
		occupied.add(slot.slotIndex);
	});

	return occupied;
}

/**
 * Find the next available grid position.
 * Scans slots in order (left-to-right, top-to-bottom) to find the first empty slot.
 */
export function getNextAvailableGridPosition(
	sandboxes: Sandbox[],
	config: GridConfig = DEFAULT_CONFIG
): { x: number; y: number; slotIndex: number } {
	const occupied = getOccupiedSlots(sandboxes, config);

	// Find first unoccupied slot
	let slotIndex = 0;
	while (occupied.has(slotIndex)) {
		slotIndex++;
	}

	const position = getGridPosition(slotIndex, config);
	return { ...position, slotIndex };
}

/**
 * Find the nearest available slot to a given position.
 * Used for Grid mode snapping.
 */
export function findNearestAvailableSlot(
	x: number,
	y: number,
	sandboxes: Sandbox[],
	excludeSandboxId?: string,
	config: GridConfig = DEFAULT_CONFIG
): { x: number; y: number; slotIndex: number } {
	// Get occupied slots, excluding the sandbox being dragged
	const occupied = new Set<number>();
	sandboxes.forEach(sandbox => {
		if (sandbox.id !== excludeSandboxId) {
			const slot = getSlotFromPosition(sandbox.x, sandbox.y, config);
			occupied.add(slot.slotIndex);
		}
	});

	// Get the slot closest to the drop position
	const targetSlot = getSlotFromPosition(x, y, config);

	// If target slot is available, use it
	if (!occupied.has(targetSlot.slotIndex)) {
		const position = getGridPosition(targetSlot.slotIndex, config);
		return { ...position, slotIndex: targetSlot.slotIndex };
	}

	// Otherwise, search outward in a spiral pattern for nearest available
	const maxSearchRadius = 50; // Max slots to search
	let bestSlot = -1;
	let bestDistance = Infinity;

	for (let radius = 1; radius <= maxSearchRadius; radius++) {
		// Check slots in a square ring around the target
		for (let dr = -radius; dr <= radius; dr++) {
			for (let dc = -radius; dc <= radius; dc++) {
				// Only check the perimeter of the ring
				if (Math.abs(dr) !== radius && Math.abs(dc) !== radius) continue;

				const testRow = targetSlot.row + dr;
				const testCol = targetSlot.col + dc;

				// Skip invalid positions
				if (testRow < 0 || testCol < 0 || testCol >= config.gridColumns) continue;

				const testSlotIndex = testRow * config.gridColumns + testCol;

				if (!occupied.has(testSlotIndex)) {
					// Calculate distance to target position
					const testPos = getGridPosition(testSlotIndex, config);
					const distance = Math.sqrt(
						Math.pow(testPos.x - x, 2) + Math.pow(testPos.y - y, 2)
					);

					if (distance < bestDistance) {
						bestDistance = distance;
						bestSlot = testSlotIndex;
					}
				}
			}
		}

		// If we found a slot in this ring, use it
		if (bestSlot !== -1) {
			const position = getGridPosition(bestSlot, config);
			return { ...position, slotIndex: bestSlot };
		}
	}

	// Fallback: find first available slot
	return getNextAvailableGridPosition(sandboxes, config);
}

/**
 * Snap position to nearest grid slot.
 * Returns the snapped position and whether it's available.
 */
export function snapToGridSlot(
	x: number,
	y: number,
	sandboxes: Sandbox[],
	excludeSandboxId?: string,
	config: GridConfig = DEFAULT_CONFIG
): { x: number; y: number; slotIndex: number; isOccupied: boolean } {
	const slot = getSlotFromPosition(x, y, config);
	const position = getGridPosition(slot.slotIndex, config);

	// Check if this slot is occupied by another sandbox
	const isOccupied = sandboxes.some(sandbox => {
		if (sandbox.id === excludeSandboxId) return false;
		const sandboxSlot = getSlotFromPosition(sandbox.x, sandbox.y, config);
		return sandboxSlot.slotIndex === slot.slotIndex;
	});

	return {
		...position,
		slotIndex: slot.slotIndex,
		isOccupied,
	};
}

/**
 * Check if a position would overlap with existing sandboxes.
 */
export function checkOverlap(
	x: number,
	y: number,
	sandboxes: Sandbox[],
	excludeSandboxId?: string,
	config: GridConfig = DEFAULT_CONFIG
): { isOverlapping: boolean; overlappingWith: string[] } {
	const { totalWidth, totalHeight } = getSandboxTotalDimensions(config);
	const overlappingWith: string[] = [];

	sandboxes.forEach(sandbox => {
		if (sandbox.id === excludeSandboxId) return;

		// Check bounding box overlap
		const overlapX = x < sandbox.x + totalWidth && x + totalWidth > sandbox.x;
		const overlapY = y < sandbox.y + totalHeight && y + totalHeight > sandbox.y;

		if (overlapX && overlapY) {
			overlappingWith.push(sandbox.id);
		}
	});

	return {
		isOverlapping: overlappingWith.length > 0,
		overlappingWith,
	};
}

// ============================================================
// Z-Index Management
// ============================================================

/**
 * Bring a sandbox to front by updating its z-index.
 */
export function bringToFront(sandboxes: Sandbox[], sandboxId: string): Sandbox[] {
	const maxZIndex = Math.max(...sandboxes.map(s => s.zIndex));
	return sandboxes.map(s =>
		s.id === sandboxId
			? { ...s, zIndex: maxZIndex + 1 }
			: s
	);
}

// ============================================================
// Export default config for convenience
// ============================================================

export { DEFAULT_CONFIG };
