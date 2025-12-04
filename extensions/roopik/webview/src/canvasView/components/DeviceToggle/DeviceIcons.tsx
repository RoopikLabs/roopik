/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Device Icons
 *
 * SVG icons for device presets used in device emulation toggle.
 */

import type { DevicePreset } from '../../types/device';

interface IconProps {
	size?: number;
	className?: string;
}

/**
 * Auto/Responsive icon - represents fluid sizing
 */
export function AutoIcon({ size = 16, className }: IconProps) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 16 16"
			fill="none"
			className={className}
		>
			<rect x="2" y="4" width="12" height="8" rx="1" stroke="currentColor" strokeWidth="1.5" />
			<path d="M5 7h6M5 9h4" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
		</svg>
	);
}

/**
 * Desktop/Monitor icon
 */
export function DesktopIcon({ size = 16, className }: IconProps) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 16 16"
			fill="none"
			className={className}
		>
			<rect x="1" y="2" width="14" height="10" rx="1" stroke="currentColor" strokeWidth="1.5" />
			<path d="M5 14h6M8 12v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
		</svg>
	);
}

/**
 * Tablet icon
 */
export function TabletIcon({ size = 16, className }: IconProps) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 16 16"
			fill="none"
			className={className}
		>
			<rect x="3" y="1" width="10" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
			<circle cx="8" cy="13" r="0.75" fill="currentColor" />
		</svg>
	);
}

/**
 * Mobile/Phone icon
 */
export function MobileIcon({ size = 16, className }: IconProps) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 16 16"
			fill="none"
			className={className}
		>
			<rect x="4" y="1" width="8" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
			<circle cx="8" cy="13" r="0.75" fill="currentColor" />
		</svg>
	);
}

/**
 * Get icon component for a device preset
 */
export function getDeviceIcon(preset: DevicePreset): React.FC<IconProps> {
	switch (preset) {
		case 'auto':
			return AutoIcon;
		case 'desktop':
			return DesktopIcon;
		case 'tablet':
			return TabletIcon;
		case 'mobile':
			return MobileIcon;
		default:
			return AutoIcon;
	}
}

/**
 * Render device icon for a preset
 */
export function DeviceIcon({ preset, size = 16, className }: { preset: DevicePreset } & IconProps) {
	const Icon = getDeviceIcon(preset);
	return <Icon size={size} className={className} />;
}
