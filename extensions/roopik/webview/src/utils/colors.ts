/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

// Standard professional color palette with light/dark indicator
export const STANDARD_COLORS = [
	{ name: 'Midnight Black', value: '#000000', isLight: false },
	{ name: 'Charcoal', value: '#1a1a1a', isLight: false },
	{ name: 'Dark Slate', value: '#2d3748', isLight: false },
	{ name: 'Navy Blue', value: '#1e293b', isLight: false },
	{ name: 'Deep Purple', value: '#1e1b4b', isLight: false },
	{ name: 'Dark Teal', value: '#134e4a', isLight: false },
	{ name: 'Forest Green', value: '#14532d', isLight: false },
	{ name: 'Cream White', value: '#faf8f5', isLight: true },
	{ name: 'Soft Pearl', value: '#e8e6e3', isLight: true },
	{ name: 'Light Slate', value: '#cbd5e1', isLight: true },
];

/**
 * Helper function to determine if a color is light (for pattern visibility)
 */
export const isLightColor = (hexColor: string): boolean => {
	const color = STANDARD_COLORS.find(c => c.value === hexColor);
	if (color) {
		return color.isLight;
	}

	// Fallback: calculate luminance for custom colors
	const hex = hexColor.replace('#', '');
	const r = parseInt(hex.substring(0, 2), 16);
	const g = parseInt(hex.substring(2, 4), 16);
	const b = parseInt(hex.substring(4, 6), 16);
	const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
	return luminance > 0.5;
};
