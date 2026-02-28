/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import type { Transform, BackgroundPattern } from '../../types';
import { isLightColor } from '../../../utils/colors';

// ============================================================
// Types
// ============================================================

interface PatternColors {
	grid: string;
	dots: string;
}

// ============================================================
// Pattern Generation
// ============================================================

/**
 * Get pattern colors based on background brightness.
 * Uses dark patterns for light backgrounds and vice versa.
 */
function getPatternColors(backgroundColor: string): PatternColors {
	const isLight = isLightColor(backgroundColor);
	return {
		grid: isLight ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.05)',
		dots: isLight ? 'rgba(0, 0, 0, 0.15)' : 'rgba(255, 255, 255, 0.15)',
	};
}

/**
 * Generate CSS background style for grid pattern.
 */
function getGridPattern(
	gridSize: number,
	offsetX: number,
	offsetY: number,
	color: string
): React.CSSProperties {
	return {
		backgroundImage: `
			linear-gradient(${color} 1px, transparent 1px),
			linear-gradient(90deg, ${color} 1px, transparent 1px)
		`,
		backgroundSize: `${gridSize}px ${gridSize}px`,
		backgroundPosition: `${offsetX}px ${offsetY}px`,
	};
}

/**
 * Generate CSS background style for dots pattern.
 */
function getDotsPattern(
	gridSize: number,
	offsetX: number,
	offsetY: number,
	color: string
): React.CSSProperties {
	return {
		backgroundImage: `radial-gradient(circle, ${color} 1px, transparent 1px)`,
		backgroundSize: `${gridSize}px ${gridSize}px`,
		backgroundPosition: `${offsetX}px ${offsetY}px`,
	};
}

// ============================================================
// Public API
// ============================================================

/**
 * Generate background style based on pattern type, transform, and background color.
 */
export function getBackgroundStyle(
	pattern: BackgroundPattern,
	transform: Transform,
	backgroundColor: string
): React.CSSProperties {
	if (pattern === 'plain') {
		return {};
	}

	const gridSize = 20 * transform.scale;
	const offsetX = transform.x % gridSize;
	const offsetY = transform.y % gridSize;
	const colors = getPatternColors(backgroundColor);

	if (pattern === 'grid') {
		return getGridPattern(gridSize, offsetX, offsetY, colors.grid);
	}

	return getDotsPattern(gridSize, offsetX, offsetY, colors.dots);
}
