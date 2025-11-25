/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import type { DevicePreset } from './types.js';

/**
 * Common device presets for viewport emulation
 * Used by CDP Emulation.setDeviceMetricsOverride
 */
export const DEVICE_PRESETS: Record<string, DevicePreset> = {
	// Desktop
	'desktop': {
		name: 'Desktop',
		width: 1920,
		height: 1080,
		deviceScaleFactor: 1,
		mobile: false
	},
	'desktop-hd': {
		name: 'Desktop HD',
		width: 1440,
		height: 900,
		deviceScaleFactor: 1,
		mobile: false
	},
	'laptop': {
		name: 'Laptop',
		width: 1366,
		height: 768,
		deviceScaleFactor: 1,
		mobile: false
	},

	// Tablets
	'ipad-pro-12': {
		name: 'iPad Pro 12.9"',
		width: 1024,
		height: 1366,
		deviceScaleFactor: 2,
		mobile: true,
		userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
	},
	'ipad-pro-11': {
		name: 'iPad Pro 11"',
		width: 834,
		height: 1194,
		deviceScaleFactor: 2,
		mobile: true,
		userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
	},
	'ipad-air': {
		name: 'iPad Air',
		width: 820,
		height: 1180,
		deviceScaleFactor: 2,
		mobile: true,
		userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
	},
	'ipad-mini': {
		name: 'iPad Mini',
		width: 768,
		height: 1024,
		deviceScaleFactor: 2,
		mobile: true,
		userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
	},
	'android-tablet': {
		name: 'Android Tablet',
		width: 800,
		height: 1280,
		deviceScaleFactor: 2,
		mobile: true,
		userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
	},

	// Mobile Phones
	'iphone-15-pro-max': {
		name: 'iPhone 15 Pro Max',
		width: 430,
		height: 932,
		deviceScaleFactor: 3,
		mobile: true,
		userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
	},
	'iphone-15-pro': {
		name: 'iPhone 15 Pro',
		width: 393,
		height: 852,
		deviceScaleFactor: 3,
		mobile: true,
		userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
	},
	'iphone-15': {
		name: 'iPhone 15',
		width: 390,
		height: 844,
		deviceScaleFactor: 3,
		mobile: true,
		userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
	},
	'iphone-se': {
		name: 'iPhone SE',
		width: 375,
		height: 667,
		deviceScaleFactor: 2,
		mobile: true,
		userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
	},
	'pixel-8': {
		name: 'Pixel 8',
		width: 412,
		height: 915,
		deviceScaleFactor: 2.625,
		mobile: true,
		userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
	},
	'pixel-8-pro': {
		name: 'Pixel 8 Pro',
		width: 448,
		height: 998,
		deviceScaleFactor: 2.625,
		mobile: true,
		userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
	},
	'samsung-galaxy-s24': {
		name: 'Samsung Galaxy S24',
		width: 360,
		height: 780,
		deviceScaleFactor: 3,
		mobile: true,
		userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
	},
	'samsung-galaxy-fold': {
		name: 'Samsung Galaxy Fold',
		width: 280,
		height: 653,
		deviceScaleFactor: 3,
		mobile: true,
		userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-F946B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
	},

	// Responsive breakpoints
	'responsive-xs': {
		name: 'Extra Small (<576px)',
		width: 320,
		height: 568,
		deviceScaleFactor: 1,
		mobile: true
	},
	'responsive-sm': {
		name: 'Small (≥576px)',
		width: 576,
		height: 768,
		deviceScaleFactor: 1,
		mobile: true
	},
	'responsive-md': {
		name: 'Medium (≥768px)',
		width: 768,
		height: 1024,
		deviceScaleFactor: 1,
		mobile: false
	},
	'responsive-lg': {
		name: 'Large (≥992px)',
		width: 992,
		height: 768,
		deviceScaleFactor: 1,
		mobile: false
	},
	'responsive-xl': {
		name: 'Extra Large (≥1200px)',
		width: 1200,
		height: 900,
		deviceScaleFactor: 1,
		mobile: false
	},
	'responsive-xxl': {
		name: '2X Large (≥1400px)',
		width: 1400,
		height: 900,
		deviceScaleFactor: 1,
		mobile: false
	}
};

/**
 * Get device preset by key
 */
export function getDevicePreset(key: string): DevicePreset | undefined {
	return DEVICE_PRESETS[key];
}

/**
 * Get all device presets grouped by category
 */
export function getDevicePresetsByCategory(): Record<string, DevicePreset[]> {
	return {
		'Desktop': [
			DEVICE_PRESETS['desktop'],
			DEVICE_PRESETS['desktop-hd'],
			DEVICE_PRESETS['laptop']
		],
		'Tablets': [
			DEVICE_PRESETS['ipad-pro-12'],
			DEVICE_PRESETS['ipad-pro-11'],
			DEVICE_PRESETS['ipad-air'],
			DEVICE_PRESETS['ipad-mini'],
			DEVICE_PRESETS['android-tablet']
		],
		'Mobile': [
			DEVICE_PRESETS['iphone-15-pro-max'],
			DEVICE_PRESETS['iphone-15-pro'],
			DEVICE_PRESETS['iphone-15'],
			DEVICE_PRESETS['iphone-se'],
			DEVICE_PRESETS['pixel-8'],
			DEVICE_PRESETS['pixel-8-pro'],
			DEVICE_PRESETS['samsung-galaxy-s24'],
			DEVICE_PRESETS['samsung-galaxy-fold']
		],
		'Responsive': [
			DEVICE_PRESETS['responsive-xs'],
			DEVICE_PRESETS['responsive-sm'],
			DEVICE_PRESETS['responsive-md'],
			DEVICE_PRESETS['responsive-lg'],
			DEVICE_PRESETS['responsive-xl'],
			DEVICE_PRESETS['responsive-xxl']
		]
	};
}
