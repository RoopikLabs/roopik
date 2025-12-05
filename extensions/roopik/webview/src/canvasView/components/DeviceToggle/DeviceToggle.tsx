/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * DeviceToggle Component
 *
 * A floating button that cycles through device presets (auto, desktop, tablet, mobile).
 * Used for both global canvas control and individual sandbox control.
 */

import type { DevicePreset } from '../../types/device';
import { DEVICE_PRESETS, getNextDevicePreset } from '../../types/device';
import { DeviceIcon } from './DeviceIcons';

interface DeviceToggleProps {
	/** Current device preset */
	deviceMode: DevicePreset;
	/** Callback when device mode changes */
	onDeviceModeChange: (mode: DevicePreset) => void;
	/** Optional class name for styling */
	className?: string;
	/** Size variant */
	size?: 'small' | 'medium';
	/** Show label alongside icon */
	showLabel?: boolean;
}

export function DeviceToggle({
	deviceMode,
	onDeviceModeChange,
	className = '',
	size = 'medium',
	showLabel = false
}: DeviceToggleProps) {
	const preset = DEVICE_PRESETS[deviceMode];
	const iconSize = size === 'small' ? 14 : 18;

	const handleClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		const nextMode = getNextDevicePreset(deviceMode);
		onDeviceModeChange(nextMode);
	};

	return (
		<button
			className={`device-toggle device-toggle--${size} ${className}`}
			onClick={handleClick}
			title={`Device: ${preset.label} (click to cycle)`}
		>
			<DeviceIcon preset={deviceMode} size={iconSize} />
			{showLabel && <span className="device-toggle__label">{preset.label}</span>}
		</button>
	);
}

/**
 * DeviceSelector Component
 *
 * A dropdown/segmented control for selecting device presets.
 * Used when you want to show all options at once.
 */
interface DeviceSelectorProps {
	deviceMode: DevicePreset;
	onDeviceModeChange: (mode: DevicePreset) => void;
	className?: string;
}

export function DeviceSelector({
	deviceMode,
	onDeviceModeChange,
	className = ''
}: DeviceSelectorProps) {
	const presets: DevicePreset[] = ['auto', 'desktop', 'tablet', 'mobile'];

	return (
		<div className={`device-selector ${className}`}>
			{presets.map((preset) => (
				<button
					key={preset}
					className={`device-selector__button ${deviceMode === preset ? 'device-selector__button--active' : ''}`}
					onClick={(e) => {
						e.stopPropagation();
						onDeviceModeChange(preset);
					}}
					title={DEVICE_PRESETS[preset].label}
				>
					<DeviceIcon preset={preset} size={16} />
				</button>
			))}
		</div>
	);
}
