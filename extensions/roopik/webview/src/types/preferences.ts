/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Background pattern type for canvas
 */
export type BackgroundPattern = 'grid' | 'dots' | 'plain';

/**
 * Background color values for canvas
 */
export const BACKGROUND_COLORS = {
	MIDNIGHT_BLACK: '#000000',
	CHARCOAL: '#1a1a1a',
	DARK_SLATE: '#2d3748',
	NAVY_BLUE: '#1e293b',
	DEEP_PURPLE: '#1e1b4b',
	DARK_TEAL: '#134e4a',
	FOREST_GREEN: '#14532d',
	CREAM_WHITE: '#faf8f5',
	SOFT_PEARL: '#e8e6e3',
	LIGHT_SLATE: '#cbd5e1'
} as const;

export type BackgroundColor = typeof BACKGROUND_COLORS[keyof typeof BACKGROUND_COLORS];

/**
 * Session preferences interface
 */
export interface SessionPreferences {
	backgroundColor?: string;
	backgroundPattern?: BackgroundPattern;
}
