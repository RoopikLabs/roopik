/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import type { Sandbox, DevicePreset } from '../../types';

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
		gap: 12,
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
	},
	content: {
		flex: 1,
		overflow: 'hidden',
	},
	iframe: {
		width: '100%',
		height: '100%',
		border: 'none',
		background: '#ffffff',
	},
};

export function FullscreenOverlay({
	sandbox,
	deviceMode,
	onDeviceModeChange,
	onClose,
}: FullscreenOverlayProps) {
	const displayName = sandbox.componentInput?.id.split('-')[0] || 'Component';

	// TODO: Use deviceMode and onDeviceModeChange for device emulation controls
	console.log('[FullscreenOverlay] Device mode:', deviceMode);

	return (
		<div style={styles.overlay}>
			{/* Header */}
			<div style={styles.header}>
				<span style={styles.title}>{displayName}</span>
				<div style={styles.headerControls}>
					{/* Device mode selector - TODO: implement */}
					<button
						onClick={() => onDeviceModeChange(deviceMode === 'auto' ? 'desktop' : 'auto')}
						title={`Device: ${deviceMode}`}
						style={{
							...styles.closeButton,
							marginRight: 8,
						}}
					>
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
							<rect x="2" y="3" width="20" height="14" rx="2" />
							<path d="M8 21h8M12 17v4" />
						</svg>
					</button>
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
			<div style={styles.content}>
				<iframe
					srcDoc={sandbox.bundledCode ? generateFullscreenHTML(sandbox.bundledCode) : ''}
					sandbox="allow-scripts allow-same-origin"
					title="Fullscreen Preview"
					style={styles.iframe}
				/>
			</div>
		</div>
	);
}
