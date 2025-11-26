/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Floating Toolbar HTML Content
 *
 * This HTML is rendered in a separate WebContentsView that overlays on top of the browser view.
 * It provides tools for inspect mode, select mode, and other developer interactions.
 */

export interface FloatingToolbarState {
	activeMode: 'select' | 'inspect' | 'none';
	isExpanded: boolean;
}

/**
 * Generate HTML content for the floating toolbar
 */
export function generateFloatingToolbarHtml(state: FloatingToolbarState): string {
	const { activeMode } = state;

	return `<!DOCTYPE html>
<html>
<head>
	<meta charset="UTF-8">
	<style>
		* {
			margin: 0;
			padding: 0;
			box-sizing: border-box;
		}

		html, body {
			background: transparent;
			overflow: hidden;
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
			font-size: 12px;
			user-select: none;
			-webkit-user-select: none;
		}

		.toolbar-container {
			position: fixed;
			bottom: 16px;
			left: 50%;
			transform: translateX(-50%);
			display: flex;
			align-items: center;
			gap: 4px;
			background: rgba(30, 30, 30, 0.95);
			border: 1px solid rgba(255, 255, 255, 0.1);
			border-radius: 8px;
			padding: 6px 8px;
			box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
			backdrop-filter: blur(10px);
			-webkit-backdrop-filter: blur(10px);
		}

		.toolbar-btn {
			display: flex;
			align-items: center;
			justify-content: center;
			width: 32px;
			height: 32px;
			border: none;
			border-radius: 6px;
			background: transparent;
			color: rgba(255, 255, 255, 0.7);
			cursor: pointer;
			transition: all 0.15s ease;
		}

		.toolbar-btn:hover {
			background: rgba(255, 255, 255, 0.1);
			color: rgba(255, 255, 255, 0.9);
		}

		.toolbar-btn.active {
			background: rgba(59, 130, 246, 0.3);
			color: rgb(96, 165, 250);
		}

		.toolbar-btn.active:hover {
			background: rgba(59, 130, 246, 0.4);
		}

		.toolbar-btn svg {
			width: 18px;
			height: 18px;
		}

		.toolbar-divider {
			width: 1px;
			height: 20px;
			background: rgba(255, 255, 255, 0.15);
			margin: 0 4px;
		}

		.toolbar-label {
			color: rgba(255, 255, 255, 0.5);
			font-size: 11px;
			padding: 0 8px;
		}

		/* Tooltips */
		.toolbar-btn[title]:hover::after {
			content: attr(title);
			position: absolute;
			bottom: 100%;
			left: 50%;
			transform: translateX(-50%);
			background: rgba(0, 0, 0, 0.9);
			color: white;
			padding: 4px 8px;
			border-radius: 4px;
			font-size: 11px;
			white-space: nowrap;
			margin-bottom: 8px;
			pointer-events: none;
		}

		.toolbar-btn {
			position: relative;
		}
	</style>
</head>
<body>
	<div class="toolbar-container">
		<!-- Select Mode -->
		<button class="toolbar-btn ${activeMode === 'select' ? 'active' : ''}" id="selectMode" title="Select Mode (V)">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/>
				<path d="M13 13l6 6"/>
			</svg>
		</button>

		<!-- Inspect Mode -->
		<button class="toolbar-btn ${activeMode === 'inspect' ? 'active' : ''}" id="inspectMode" title="Inspect Mode (I)">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<circle cx="11" cy="11" r="8"/>
				<path d="M21 21l-4.35-4.35"/>
			</svg>
		</button>

		<div class="toolbar-divider"></div>

		<!-- Edit CSS -->
		<button class="toolbar-btn" id="editCss" title="Edit CSS">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M12 20h9"/>
				<path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
			</svg>
		</button>

		<!-- Screenshot -->
		<button class="toolbar-btn" id="screenshot" title="Screenshot">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
				<circle cx="8.5" cy="8.5" r="1.5"/>
				<polyline points="21 15 16 10 5 21"/>
			</svg>
		</button>

		<div class="toolbar-divider"></div>

		<!-- More Options -->
		<button class="toolbar-btn" id="moreOptions" title="More Options">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<circle cx="12" cy="12" r="1"/>
				<circle cx="19" cy="12" r="1"/>
				<circle cx="5" cy="12" r="1"/>
			</svg>
		</button>
	</div>

	<script>
		// Message passing to parent
		function sendMessage(type, data = {}) {
			// Use window.parent.postMessage for iframe communication
			// For WebContentsView, we'll use a different mechanism
			console.log('Toolbar action:', type, data);

			// Store action in a custom event that can be read by the renderer
			window.__roopikToolbarAction = { type, data, timestamp: Date.now() };
		}

		// Button click handlers
		document.getElementById('selectMode').addEventListener('click', () => {
			sendMessage('setMode', { mode: 'select' });
		});

		document.getElementById('inspectMode').addEventListener('click', () => {
			sendMessage('setMode', { mode: 'inspect' });
		});

		document.getElementById('editCss').addEventListener('click', () => {
			sendMessage('editCss');
		});

		document.getElementById('screenshot').addEventListener('click', () => {
			sendMessage('screenshot');
		});

		document.getElementById('moreOptions').addEventListener('click', () => {
			sendMessage('moreOptions');
		});

		// Keyboard shortcuts
		document.addEventListener('keydown', (e) => {
			if (e.key === 'v' || e.key === 'V') {
				sendMessage('setMode', { mode: 'select' });
			} else if (e.key === 'i' || e.key === 'I') {
				sendMessage('setMode', { mode: 'inspect' });
			} else if (e.key === 'Escape') {
				sendMessage('setMode', { mode: 'none' });
			}
		});
	</script>
</body>
</html>`;
}
