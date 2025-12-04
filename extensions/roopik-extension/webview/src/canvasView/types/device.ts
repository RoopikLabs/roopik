/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Device Emulation Types
 *
 * Provides device preset configurations for testing components
 * across different viewport sizes (auto, desktop, tablet, mobile).
 */

/**
 * Available device presets
 */
export type DevicePreset = 'auto' | 'desktop' | 'tablet' | 'mobile';

/**
 * Configuration for each device preset
 */
export interface DevicePresetConfig {
	width: number | 'auto';
	height: number | 'auto';
	label: string;
}

/**
 * Device preset configurations with standard viewport dimensions
 */
export const DEVICE_PRESETS: Record<DevicePreset, DevicePresetConfig> = {
	auto: {
		width: 'auto',
		height: 'auto',
		label: 'Auto'
	},
	desktop: {
		width: 1280,
		height: 800,
		label: 'Desktop'
	},
	tablet: {
		width: 768,
		height: 1024,
		label: 'Tablet'
	},
	mobile: {
		width: 375,
		height: 667,
		label: 'Mobile'
	}
};

/**
 * Order of device presets for cycling through modes
 */
export const DEVICE_PRESET_ORDER: DevicePreset[] = ['auto', 'desktop', 'tablet', 'mobile'];

/**
 * Get the next device preset in the cycle
 */
export function getNextDevicePreset(current: DevicePreset): DevicePreset {
	const currentIndex = DEVICE_PRESET_ORDER.indexOf(current);
	const nextIndex = (currentIndex + 1) % DEVICE_PRESET_ORDER.length;
	return DEVICE_PRESET_ORDER[nextIndex];
}

/**
 * Calculate scaling to fit device dimensions within container
 */
export function calculateDeviceScale(
	deviceWidth: number,
	deviceHeight: number,
	containerWidth: number,
	containerHeight: number,
	padding: number = 40
): number {
	const availableWidth = containerWidth - (padding * 2);
	const availableHeight = containerHeight - (padding * 2);

	const scaleX = availableWidth / deviceWidth;
	const scaleY = availableHeight / deviceHeight;

	// Use the smaller scale to fit within container while maintaining aspect ratio
	return Math.min(scaleX, scaleY, 1); // Cap at 1 to prevent scaling up
}
