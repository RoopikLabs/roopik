/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { useState, useEffect, useRef, useMemo } from 'react';
import type { Sandbox, DevicePreset } from '../../types';
import { DEVICE_PRESETS } from '../../types';
import { DeviceIcon } from '../DeviceToggle/DeviceIcons';

interface FullscreenOverlayProps {
	sandbox: Sandbox;
	deviceMode: DevicePreset;
	onDeviceModeChange: (mode: DevicePreset) => void;
	onClose: () => void;
}

/**
 * Generate HTML for fullscreen iframe
 */
function generateFullscreenHTML(bundledCode: string): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Fullscreen Preview</title>
	<style>
		* { margin: 0; padding: 0; box-sizing: border-box; }
		body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
			background: #ffffff;
			overflow: auto;
		}
		#root {
			min-height: 100vh;
		}
	</style>
</head>
<body>
	<div id="root"></div>
	<script type="module">
${bundledCode}
	</script>
</body>
</html>`;
}

/**
 * Calculate scale to fit device dimensions within container
 */
function calculateDeviceScale(
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

	return Math.min(scaleX, scaleY, 1); // Cap at 1 to prevent scaling up
}

// Inline styles to avoid CSS conflicts
const styles = {
	overlay: {
		position: 'fixed' as const,
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		zIndex: 10000,
		background: 'var(--vscode-editor-background, #1e1e1e)',
		display: 'flex',
		flexDirection: 'column' as const,
	},
	header: {
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'space-between',
		padding: '12px 16px',
		background: 'var(--vscode-titleBar-activeBackground, #3c3c3c)',
		borderBottom: '1px solid var(--vscode-titleBar-border, #454545)',
		flexShrink: 0,
	},
	title: {
		fontSize: 14,
		fontWeight: 500,
		color: 'var(--vscode-titleBar-activeForeground, #cccccc)',
	},
	headerControls: {
		display: 'flex',
		alignItems: 'center',
		gap: 8,
	},
	deviceSelector: {
		display: 'flex',
		gap: 2,
		background: 'rgba(255, 255, 255, 0.1)',
		borderRadius: 6,
		padding: 2,
	},
	deviceButton: {
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		width: 32,
		height: 28,
		background: 'transparent',
		border: 'none',
		borderRadius: 4,
		color: 'rgba(255, 255, 255, 0.6)',
		cursor: 'pointer',
		padding: 0,
	},
	deviceButtonActive: {
		background: 'rgba(59, 130, 246, 0.8)',
		color: 'white',
	},
	closeButton: {
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		width: 32,
		height: 32,
		background: 'transparent',
		border: 'none',
		borderRadius: 4,
		cursor: 'pointer',
		color: 'var(--vscode-titleBar-activeForeground, #cccccc)',
		padding: 0,
		marginLeft: 8,
	},
	content: {
		flex: 1,
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		overflow: 'hidden',
		padding: 40,
		position: 'relative' as const,
	},
	deviceFrame: {
		position: 'relative' as const,
		background: '#ffffff',
		borderRadius: 12,
		boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.1), 0 25px 50px -12px rgba(0, 0, 0, 0.5)',
		overflow: 'hidden',
		transformOrigin: 'center center',
	},
	deviceFrameAuto: {
		width: '100%',
		height: '100%',
		borderRadius: 0,
		boxShadow: 'none',
	},
	iframe: {
		width: '100%',
		height: '100%',
		border: 'none',
		display: 'block',
	},
	deviceInfo: {
		position: 'absolute' as const,
		bottom: 20,
		left: '50%',
		transform: 'translateX(-50%)',
		display: 'flex',
		alignItems: 'center',
		gap: 12,
		padding: '8px 16px',
		background: 'rgba(0, 0, 0, 0.75)',
		borderRadius: 24,
		color: 'white',
		fontSize: 12,
		backdropFilter: 'blur(10px)',
		zIndex: 10,
	},
	deviceInfoLabel: {
		fontWeight: 500,
	},
	deviceInfoDimensions: {
		color: 'rgba(255, 255, 255, 0.6)',
	},
};

const DEVICE_MODES: DevicePreset[] = ['auto', 'desktop', 'tablet', 'mobile'];

export function FullscreenOverlay({
	sandbox,
	deviceMode,
	onDeviceModeChange,
	onClose,
}: FullscreenOverlayProps) {
	const displayName = sandbox.componentInput?.id.split('-')[0] || 'Component';
	const containerRef = useRef<HTMLDivElement>(null);
	const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

	const preset = DEVICE_PRESETS[deviceMode];
	const isAutoMode = preset.width === 'auto';

	// Track container size for device frame scaling
	useEffect(() => {
		if (!containerRef.current) return;

		const container = containerRef.current;
		const updateSize = () => {
			setContainerSize({
				width: container.clientWidth,
				height: container.clientHeight,
			});
		};

		// Initial size
		updateSize();

		// Watch for resize
		const resizeObserver = new ResizeObserver(updateSize);
		resizeObserver.observe(container);

		return () => resizeObserver.disconnect();
	}, []);

	// Calculate device frame style
	const deviceFrameStyle = useMemo(() => {
		if (isAutoMode) {
			return {
				...styles.deviceFrame,
				...styles.deviceFrameAuto,
			};
		}

		const deviceWidth = preset.width as number;
		const deviceHeight = preset.height as number;

		const scale = calculateDeviceScale(
			deviceWidth,
			deviceHeight,
			containerSize.width,
			containerSize.height,
			40
		);

		return {
			...styles.deviceFrame,
			width: deviceWidth,
			height: deviceHeight,
			transform: scale < 1 ? `scale(${scale})` : 'none',
		};
	}, [isAutoMode, preset, containerSize]);

	return (
		<div style={styles.overlay}>
			{/* Header */}
			<div style={styles.header}>
				<span style={styles.title}>{displayName}</span>
				<div style={styles.headerControls}>
					{/* Device Mode Selector */}
					<div style={styles.deviceSelector}>
						{DEVICE_MODES.map((mode) => (
							<button
								key={mode}
								onClick={() => onDeviceModeChange(mode)}
								title={DEVICE_PRESETS[mode].label}
								style={{
									...styles.deviceButton,
									...(deviceMode === mode ? styles.deviceButtonActive : {}),
								}}
							>
								<DeviceIcon preset={mode} size={16} />
							</button>
						))}
					</div>

					{/* Close Button */}
					<button
						onClick={onClose}
						title="Exit fullscreen (ESC)"
						style={styles.closeButton}
					>
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
							<path d="M18 6L6 18M6 6l12 12" />
						</svg>
					</button>
				</div>
			</div>

			{/* Content */}
			<div ref={containerRef} style={styles.content}>
				<div style={deviceFrameStyle}>
					<iframe
						srcDoc={sandbox.bundledCode ? generateFullscreenHTML(sandbox.bundledCode) : ''}
						sandbox="allow-scripts allow-same-origin"
						title="Fullscreen Preview"
						style={styles.iframe}
					/>
				</div>

				{/* Device info badge */}
				{!isAutoMode && (
					<div style={styles.deviceInfo}>
						<span style={styles.deviceInfoLabel}>{preset.label}</span>
						<span style={styles.deviceInfoDimensions}>
							{preset.width} × {preset.height}
						</span>
					</div>
				)}
			</div>
		</div>
	);
}
