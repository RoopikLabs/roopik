/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Device Icons - Shared SVG icons for device mode indicators
 *
 * Used by:
 * - CanvasActionButtons (expandable panel)
 * - SandboxCard (per-sandbox device toggle)
 * - EditorFullscreen (fullscreen device selector)
 */

import type { DevicePreset } from '../../../common/canvas/canvasTypes.js';

/**
 * Create SVG icon for device preset
 * @param device - The device preset type
 * @param size - Icon size in pixels (default: 16)
 * @returns SVGElement
 */
export function createDeviceIcon(device: DevicePreset, size: number = 16): SVGElement {
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('width', String(size));
	svg.setAttribute('height', String(size));
	svg.setAttribute('viewBox', '0 0 24 24');
	svg.setAttribute('fill', 'none');

	if (device === 'auto') {
		// Auto mode - responsive/aspect-ratio icon (bars showing adaptability)
		const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path.setAttribute('d', 'M4 6H20V18H4V6ZM8 10V14M12 8V16M16 10V14');
		path.setAttribute('stroke', 'currentColor');
		path.setAttribute('stroke-width', '1.5');
		path.setAttribute('stroke-linecap', 'round');
		path.setAttribute('stroke-linejoin', 'round');
		svg.appendChild(path);
	} else if (device === 'desktop') {
		// Desktop monitor icon with stand
		const monitor = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		monitor.setAttribute('d', 'M3 5C3 3.89543 3.89543 3 5 3H19C20.1046 3 21 3.89543 21 5V15C21 16.1046 20.1046 17 19 17H5C3.89543 17 3 16.1046 3 15V5Z');
		monitor.setAttribute('stroke', 'currentColor');
		monitor.setAttribute('stroke-width', '1.5');
		svg.appendChild(monitor);

		const stand = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		stand.setAttribute('d', 'M8 21H16M12 17V21');
		stand.setAttribute('stroke', 'currentColor');
		stand.setAttribute('stroke-width', '1.5');
		stand.setAttribute('stroke-linecap', 'round');
		svg.appendChild(stand);
	} else if (device === 'tablet') {
		// Tablet icon (vertical rectangle with home button)
		const tablet = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
		tablet.setAttribute('x', '5');
		tablet.setAttribute('y', '2');
		tablet.setAttribute('width', '14');
		tablet.setAttribute('height', '20');
		tablet.setAttribute('rx', '2');
		tablet.setAttribute('stroke', 'currentColor');
		tablet.setAttribute('stroke-width', '1.5');
		svg.appendChild(tablet);

		const button = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
		button.setAttribute('cx', '12');
		button.setAttribute('cy', '19');
		button.setAttribute('r', '1');
		button.setAttribute('fill', 'currentColor');
		svg.appendChild(button);
	} else {
		// Mobile phone icon (narrower rectangle with notch)
		const phone = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
		phone.setAttribute('x', '7');
		phone.setAttribute('y', '2');
		phone.setAttribute('width', '10');
		phone.setAttribute('height', '20');
		phone.setAttribute('rx', '2');
		phone.setAttribute('stroke', 'currentColor');
		phone.setAttribute('stroke-width', '1.5');
		svg.appendChild(phone);

		const notch = document.createElementNS('http://www.w3.org/2000/svg', 'line');
		notch.setAttribute('x1', '10');
		notch.setAttribute('y1', '5');
		notch.setAttribute('x2', '14');
		notch.setAttribute('y2', '5');
		notch.setAttribute('stroke', 'currentColor');
		notch.setAttribute('stroke-width', '1.5');
		notch.setAttribute('stroke-linecap', 'round');
		svg.appendChild(notch);
	}

	return svg;
}

/**
 * Get device label for display
 */
export function getDeviceLabel(device: DevicePreset): string {
	switch (device) {
		case 'auto': return 'Auto';
		case 'desktop': return 'Desktop';
		case 'tablet': return 'Tablet';
		case 'mobile': return 'Mobile';
		default: return 'Auto';
	}
}

/**
 * Get short device label (single letter)
 */
export function getDeviceLetter(device: DevicePreset): string {
	switch (device) {
		case 'auto': return 'A';
		case 'desktop': return 'D';
		case 'tablet': return 'T';
		case 'mobile': return 'M';
		default: return 'A';
	}
}

/**
 * Cycle to next device mode
 */
export function getNextDeviceMode(current: DevicePreset): DevicePreset {
	const modes: DevicePreset[] = ['auto', 'desktop', 'tablet', 'mobile'];
	const currentIndex = modes.indexOf(current);
	const nextIndex = (currentIndex + 1) % modes.length;
	return modes[nextIndex];
}
