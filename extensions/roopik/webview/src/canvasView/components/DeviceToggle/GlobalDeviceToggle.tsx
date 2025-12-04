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
			style={{
				position: 'absolute',
				top: 16,
				right: 16,
				zIndex: 100,
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				width: 44,
				height: 44,
				background: 'rgba(40, 40, 40, 0.95)',
				border: '1px solid rgba(255, 255, 255, 0.15)',
				borderRadius: '50%',
				color: 'rgba(255, 255, 255, 0.9)',
				cursor: 'pointer',
				backdropFilter: 'blur(12px)',
				boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
				padding: 0,
			}}
		>
			<DeviceIcon preset={deviceMode} size={24} />
		</button>
	);
}
