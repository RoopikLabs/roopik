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

		/* VS Code-style thin dark scrollbar */
		::-webkit-scrollbar {
			width: 10px;
			height: 10px;
		}
		::-webkit-scrollbar-track {
			background: rgba(0, 0, 0, 0.1);
		}
		::-webkit-scrollbar-thumb {
			background: rgba(60, 60, 60, 0.8);
			border-radius: 5px;
			border: 2px solid transparent;
			background-clip: padding-box;
		}
		::-webkit-scrollbar-thumb:hover {
			background: rgba(80, 80, 80, 0.9);
			border: 2px solid transparent;
			background-clip: padding-box;
		}
		::-webkit-scrollbar-corner {
			background: transparent;
		}
		/* Firefox scrollbar */
		* {
			scrollbar-width: thin;
			scrollbar-color: rgba(60, 60, 60, 0.8) rgba(0, 0, 0, 0.1);
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
	content: {
		flex: 1,
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		overflow: 'hidden',
		padding: 20,
		position: 'relative' as const,
	},
	// Floating device toggle (top-right, like canvas)
	floatingDeviceToggle: {
		position: 'absolute' as const,
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
	},
	// Bottom control bar
	bottomBar: {
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 16,
		padding: '12px 16px',
		background: 'var(--vscode-titleBar-activeBackground, #3c3c3c)',
		borderTop: '1px solid var(--vscode-titleBar-border, #454545)',
		flexShrink: 0,
	},
	// Device selector in bottom bar
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
	// Close button in bottom bar
	closeButton: {
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 6,
		padding: '6px 12px',
		background: 'rgba(255, 255, 255, 0.1)',
		border: 'none',
		borderRadius: 6,
		cursor: 'pointer',
		color: 'var(--vscode-titleBar-activeForeground, #cccccc)',
		fontSize: 12,
		fontWeight: 500,
	},
	deviceFrame: {
		position: 'relative' as const,
		background: '#ffffff',
		borderRadius: 0,
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
	// Toast notification (top center)
	toast: {
		position: 'absolute' as const,
		top: 16,
		left: '50%',
		transform: 'translateX(-50%)',
		display: 'flex',
		alignItems: 'center',
		gap: 10,
		padding: '10px 16px',
		background: 'rgba(0, 0, 0, 0.85)',
		borderRadius: 8,
		color: 'white',
		fontSize: 13,
		fontWeight: 500,
		backdropFilter: 'blur(12px)',
		boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
		zIndex: 101,
		transition: 'opacity 0.3s ease, transform 0.3s ease',
	},
	toastHidden: {
		opacity: 0,
		transform: 'translateX(-50%) translateY(-10px)',
		pointerEvents: 'none' as const,
	},
	toastLabel: {
		fontWeight: 600,
	},
	toastDimensions: {
		color: 'rgba(255, 255, 255, 0.6)',
		fontWeight: 400,
	},
};

const DEVICE_MODES: DevicePreset[] = ['auto', 'desktop', 'tablet', 'mobile'];

export function FullscreenOverlay({
	sandbox,
	deviceMode,
	onDeviceModeChange,
	onClose,
}: FullscreenOverlayProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
	const [showToast, setShowToast] = useState(false);
	const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const preset = DEVICE_PRESETS[deviceMode];
	const isAutoMode = preset.width === 'auto';

	// Show toast when device mode changes
	const showDeviceToast = () => {
		setShowToast(true);
		if (toastTimeoutRef.current) {
			clearTimeout(toastTimeoutRef.current);
		}
		toastTimeoutRef.current = setTimeout(() => {
			setShowToast(false);
		}, 2000);
	};

	// Cleanup timeout on unmount
	useEffect(() => {
		return () => {
			if (toastTimeoutRef.current) {
				clearTimeout(toastTimeoutRef.current);
			}
		};
	}, []);

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

	// Cycle to next device mode
	const handleDeviceToggle = () => {
		const currentIndex = DEVICE_MODES.indexOf(deviceMode);
		const nextIndex = (currentIndex + 1) % DEVICE_MODES.length;
		onDeviceModeChange(DEVICE_MODES[nextIndex]);
		showDeviceToast();
	};

	// Handle device mode change from selector
	const handleDeviceModeSelect = (mode: DevicePreset) => {
		onDeviceModeChange(mode);
		showDeviceToast();
	};

	return (
		<div style={styles.overlay}>
			{/* Content Area */}
			<div ref={containerRef} style={styles.content}>
				{/* Toast notification (top center) */}
				<div
					style={{
						...styles.toast,
						...(showToast ? {} : styles.toastHidden),
					}}
				>
					<DeviceIcon preset={deviceMode} size={18} />
					<span style={styles.toastLabel}>{preset.label}</span>
					{!isAutoMode && (
						<span style={styles.toastDimensions}>
							{preset.width} × {preset.height}
						</span>
					)}
				</div>

				{/* Floating Device Toggle (top-right) */}
				<button
					onClick={handleDeviceToggle}
					title={preset.label}
					style={styles.floatingDeviceToggle}
				>
					<DeviceIcon preset={deviceMode} size={24} />
				</button>

				{/* Device Frame */}
				<div style={deviceFrameStyle}>
					<iframe
						srcDoc={sandbox.bundledCode ? generateFullscreenHTML(sandbox.bundledCode) : ''}
						sandbox="allow-scripts allow-same-origin"
						title="Fullscreen Preview"
						style={styles.iframe}
					/>
				</div>
			</div>

			{/* Bottom Control Bar */}
			<div style={styles.bottomBar}>
				{/* Device Mode Selector */}
				<div style={styles.deviceSelector}>
					{DEVICE_MODES.map((mode) => (
						<button
							key={mode}
							onClick={() => handleDeviceModeSelect(mode)}
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
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
						<path d="M18 6L6 18M6 6l12 12" />
					</svg>
					<span>Exit</span>
				</button>
			</div>
		</div>
	);
}
