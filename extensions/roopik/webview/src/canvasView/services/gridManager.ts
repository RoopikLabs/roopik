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
