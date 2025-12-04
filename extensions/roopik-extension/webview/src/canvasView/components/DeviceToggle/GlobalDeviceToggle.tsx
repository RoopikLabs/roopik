/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * GlobalDeviceToggle Component
 *
 * A floating button fixed to the top-right of the canvas that controls
 * the global device mode for all sandboxes. Cycles through modes on click.
 */

import type { DevicePreset } from '../../types/device';
import { DEVICE_PRESETS, getNextDevicePreset } from '../../types/device';
import { DeviceIcon } from './DeviceIcons';

interface GlobalDeviceToggleProps {
	/** Current global device preset */
	deviceMode: DevicePreset;
	/** Callback when device mode changes */
	onDeviceModeChange: (mode: DevicePreset) => void;
}

export function GlobalDeviceToggle({
	deviceMode,
	onDeviceModeChange
}: GlobalDeviceToggleProps) {
	const preset = DEVICE_PRESETS[deviceMode];

	const handleClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		const nextMode = getNextDevicePreset(deviceMode);
		onDeviceModeChange(nextMode);
	};

	return (
		<button
			className="global-device-toggle"
			onClick={handleClick}
			title={preset.label}
		>
			<DeviceIcon preset={deviceMode} size={20} />
		</button>
	);
}
