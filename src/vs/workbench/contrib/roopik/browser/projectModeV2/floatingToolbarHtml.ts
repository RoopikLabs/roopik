/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Floating Toolbar HTML Content
 *
 * This HTML is rendered in a separate WebContentsView that overlays on top of the browser view.
 * It provides tools for inspect mode, select mode, and other developer interactions.
 *
 * Features:
 * - Draggable to any edge (top, bottom, left, right)
 * - Auto-snaps to vertical layout on left/right edges
 * - Auto-snaps to horizontal layout on top/bottom edges
 * - Locks in place when mouse released near edge
 */

export type ToolbarPosition = 'top' | 'bottom' | 'left' | 'right';

export interface FloatingToolbarState {
	activeMode: 'select' | 'inspect' | 'none';
	isExpanded: boolean;
	position: ToolbarPosition;
	isDragging: boolean;
}

/**
 * Generate HTML content for the floating toolbar
 */
export function generateFloatingToolbarHtml(state: FloatingToolbarState): string {
	const { activeMode, position = 'bottom' } = state;

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
			width: 100%;
			height: 100%;
		}

		.toolbar-container {
			position: fixed;
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
			transition: all 0.2s ease;
		}

		/* PERFORMANCE: Disable heavy effects during drag mode */
		.toolbar-container.drag-mode,
		.toolbar-container.dragging {
			backdrop-filter: none !important;
			-webkit-backdrop-filter: none !important;
			box-shadow: none !important;
			transition: none !important;
			background: rgba(30, 30, 30, 0.98); /* Solid bg instead of blur */
		}

		/* Position-based styles */
		.toolbar-container.position-bottom {
			bottom: 16px;
			left: 50%;
			transform: translateX(-50%);
			flex-direction: row;
		}

		.toolbar-container.position-top {
			top: 16px;
			left: 50%;
			transform: translateX(-50%);
			flex-direction: row;
		}

		.toolbar-container.position-left {
			left: 16px;
			top: 50%;
			transform: translateY(-50%);
			flex-direction: column;
			padding: 8px 6px;
		}

		.toolbar-container.position-right {
			right: 16px;
			top: 50%;
			transform: translateY(-50%);
			flex-direction: column;
			padding: 8px 6px;
		}

		/* Dragging state */
		.toolbar-container.dragging {
			cursor: grabbing;
			opacity: 0.9;
			box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
		}

		/* Drag handle indicator when in drag mode */
		.toolbar-container.drag-mode {
			cursor: grab;
			border-color: rgba(59, 130, 246, 0.5);
		}

		.toolbar-container.drag-mode:active {
			cursor: grabbing;
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
			flex-shrink: 0;
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
			background: rgba(255, 255, 255, 0.15);
			margin: 0 4px;
			flex-shrink: 0;
		}

		/* Divider orientation based on toolbar position */
		.toolbar-container.position-bottom .toolbar-divider,
		.toolbar-container.position-top .toolbar-divider {
			width: 1px;
			height: 20px;
		}

		.toolbar-container.position-left .toolbar-divider,
		.toolbar-container.position-right .toolbar-divider {
			width: 20px;
			height: 1px;
			margin: 4px 0;
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
			background: rgba(0, 0, 0, 0.9);
			color: white;
			padding: 4px 8px;
			border-radius: 4px;
			font-size: 11px;
			white-space: nowrap;
			pointer-events: none;
			z-index: 1000;
		}

		/* Tooltip position based on toolbar position */
		.toolbar-container.position-bottom .toolbar-btn[title]:hover::after {
			bottom: 100%;
			left: 50%;
			transform: translateX(-50%);
			margin-bottom: 8px;
		}

		.toolbar-container.position-top .toolbar-btn[title]:hover::after {
			top: 100%;
			left: 50%;
			transform: translateX(-50%);
			margin-top: 8px;
		}

		.toolbar-container.position-left .toolbar-btn[title]:hover::after {
			left: 100%;
			top: 50%;
			transform: translateY(-50%);
			margin-left: 8px;
		}

		.toolbar-container.position-right .toolbar-btn[title]:hover::after {
			right: 100%;
			top: 50%;
			transform: translateY(-50%);
			margin-right: 8px;
		}

		.toolbar-btn {
			position: relative;
		}

		/* Dropdown menu for more options */
		.dropdown-menu {
			position: absolute;
			background: rgba(30, 30, 30, 0.98);
			border: 1px solid rgba(255, 255, 255, 0.15);
			border-radius: 6px;
			padding: 4px 0;
			min-width: 150px;
			box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
			display: none;
			z-index: 1001;
		}

		.dropdown-menu.visible {
			display: block;
		}

		/* Dropdown position based on toolbar position */
		.toolbar-container.position-bottom .dropdown-menu {
			bottom: 100%;
			right: 0;
			margin-bottom: 8px;
		}

		.toolbar-container.position-top .dropdown-menu {
			top: 100%;
			right: 0;
			margin-top: 8px;
		}

		.toolbar-container.position-left .dropdown-menu {
			left: 100%;
			top: 0;
			margin-left: 8px;
		}

		.toolbar-container.position-right .dropdown-menu {
			right: 100%;
			top: 0;
			margin-right: 8px;
		}

		.dropdown-item {
			display: flex;
			align-items: center;
			gap: 8px;
			padding: 8px 12px;
			color: rgba(255, 255, 255, 0.8);
			cursor: pointer;
			transition: background 0.1s ease;
		}

		.dropdown-item:hover {
			background: rgba(255, 255, 255, 0.1);
		}

		.dropdown-item svg {
			width: 16px;
			height: 16px;
			opacity: 0.7;
		}

		.dropdown-item.active {
			color: rgb(96, 165, 250);
		}

		.dropdown-item.active svg {
			opacity: 1;
		}

		.dropdown-divider {
			height: 1px;
			background: rgba(255, 255, 255, 0.1);
			margin: 4px 0;
		}

		/* Edge snap indicators (shown while dragging) */
		.snap-indicator {
			position: fixed;
			background: rgba(59, 130, 246, 0.3);
			border: 2px dashed rgba(59, 130, 246, 0.6);
			border-radius: 4px;
			display: none;
			pointer-events: none;
			z-index: 999;
		}

		.snap-indicator.visible {
			display: block;
		}

		.snap-indicator.top {
			top: 8px;
			left: 50%;
			transform: translateX(-50%);
			width: 200px;
			height: 48px;
		}

		.snap-indicator.bottom {
			bottom: 8px;
			left: 50%;
			transform: translateX(-50%);
			width: 200px;
			height: 48px;
		}

		.snap-indicator.left {
			left: 8px;
			top: 50%;
			transform: translateY(-50%);
			width: 48px;
			height: 200px;
		}

		.snap-indicator.right {
			right: 8px;
			top: 50%;
			transform: translateY(-50%);
			width: 48px;
			height: 200px;
		}
	</style>
</head>
<body>
	<!-- Snap indicators (shown while dragging) -->
	<div class="snap-indicator top" id="snapTop"></div>
	<div class="snap-indicator bottom" id="snapBottom"></div>
	<div class="snap-indicator left" id="snapLeft"></div>
	<div class="snap-indicator right" id="snapRight"></div>

	<div class="toolbar-container position-${position}" id="toolbar">
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

		<!-- Dropdown Menu -->
		<div class="dropdown-menu" id="dropdownMenu">
			<div class="dropdown-item" id="dragToMove">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M5 9l-3 3 3 3"/>
					<path d="M9 5l3-3 3 3"/>
					<path d="M15 19l-3 3-3-3"/>
					<path d="M19 9l3 3-3 3"/>
					<path d="M2 12h20"/>
					<path d="M12 2v20"/>
				</svg>
				<span>Drag to Move</span>
			</div>
			<div class="dropdown-divider"></div>
			<div class="dropdown-item" id="resetPosition">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
					<path d="M3 3v5h5"/>
				</svg>
				<span>Reset Position</span>
			</div>
		</div>
	</div>

	<script>
		const toolbar = document.getElementById('toolbar');
		const dropdownMenu = document.getElementById('dropdownMenu');
		const snapIndicators = {
			top: document.getElementById('snapTop'),
			bottom: document.getElementById('snapBottom'),
			left: document.getElementById('snapLeft'),
			right: document.getElementById('snapRight')
		};

		let isDragMode = false;
		let isDragging = false;
		let currentPosition = '${position}';

		// Message passing to parent
		function sendMessage(type, data = {}) {
			console.log('Toolbar action:', type, data);
			window.__roopikToolbarAction = { type, data, timestamp: Date.now() };
		}

		// Button click handlers
		document.getElementById('selectMode').addEventListener('click', (e) => {
			if (!isDragMode) sendMessage('setMode', { mode: 'select' });
		});

		document.getElementById('inspectMode').addEventListener('click', (e) => {
			if (!isDragMode) sendMessage('setMode', { mode: 'inspect' });
		});

		document.getElementById('editCss').addEventListener('click', (e) => {
			if (!isDragMode) sendMessage('editCss');
		});

		document.getElementById('screenshot').addEventListener('click', (e) => {
			if (!isDragMode) sendMessage('screenshot');
		});

		// More options dropdown
		document.getElementById('moreOptions').addEventListener('click', (e) => {
			e.stopPropagation();
			if (!isDragMode) {
				dropdownMenu.classList.toggle('visible');
			}
		});

		// Close dropdown when clicking outside
		document.addEventListener('click', (e) => {
			if (!dropdownMenu.contains(e.target) && e.target.id !== 'moreOptions') {
				dropdownMenu.classList.remove('visible');
			}
		});

		// Drag to move option
		document.getElementById('dragToMove').addEventListener('click', (e) => {
			e.stopPropagation();
			isDragMode = true;
			toolbar.classList.add('drag-mode');
			dropdownMenu.classList.remove('visible');
			sendMessage('dragModeEnabled');
		});

		// Reset position option
		document.getElementById('resetPosition').addEventListener('click', (e) => {
			e.stopPropagation();
			dropdownMenu.classList.remove('visible');
			setPosition('bottom');
			sendMessage('positionChanged', { position: 'bottom' });
		});

		// Dragging functionality
		let startX, startY;
		let toolbarRect;

		toolbar.addEventListener('mousedown', (e) => {
			if (!isDragMode) return;

			isDragging = true;
			toolbar.classList.add('dragging');
			toolbarRect = toolbar.getBoundingClientRect();
			startX = e.clientX;
			startY = e.clientY;

			e.preventDefault();
		});

		document.addEventListener('mousemove', (e) => {
			if (!isDragging) return;

			const viewportWidth = window.innerWidth;
			const viewportHeight = window.innerHeight;
			const mouseX = e.clientX;
			const mouseY = e.clientY;

			// Calculate distances to edges
			const distToTop = mouseY;
			const distToBottom = viewportHeight - mouseY;
			const distToLeft = mouseX;
			const distToRight = viewportWidth - mouseX;

			// Threshold for snapping (pixels from edge)
			const snapThreshold = 80;

			// Hide all snap indicators first
			Object.values(snapIndicators).forEach(el => el.classList.remove('visible'));

			// Show snap indicator for closest edge within threshold
			const minDist = Math.min(distToTop, distToBottom, distToLeft, distToRight);

			if (minDist < snapThreshold) {
				if (minDist === distToTop) {
					snapIndicators.top.classList.add('visible');
				} else if (minDist === distToBottom) {
					snapIndicators.bottom.classList.add('visible');
				} else if (minDist === distToLeft) {
					snapIndicators.left.classList.add('visible');
				} else if (minDist === distToRight) {
					snapIndicators.right.classList.add('visible');
				}
			}

			// Move toolbar with cursor (temporary position while dragging)
			toolbar.style.position = 'fixed';
			toolbar.style.left = (mouseX - toolbarRect.width / 2) + 'px';
			toolbar.style.top = (mouseY - toolbarRect.height / 2) + 'px';
			toolbar.style.right = 'auto';
			toolbar.style.bottom = 'auto';
			toolbar.style.transform = 'none';
		});

		document.addEventListener('mouseup', (e) => {
			if (!isDragging) return;

			isDragging = false;
			toolbar.classList.remove('dragging');

			// Hide all snap indicators
			Object.values(snapIndicators).forEach(el => el.classList.remove('visible'));

			const viewportWidth = window.innerWidth;
			const viewportHeight = window.innerHeight;
			const mouseX = e.clientX;
			const mouseY = e.clientY;

			// Calculate distances to edges
			const distToTop = mouseY;
			const distToBottom = viewportHeight - mouseY;
			const distToLeft = mouseX;
			const distToRight = viewportWidth - mouseX;

			// Snap to closest edge
			const minDist = Math.min(distToTop, distToBottom, distToLeft, distToRight);
			let newPosition = currentPosition;

			if (minDist === distToTop) {
				newPosition = 'top';
			} else if (minDist === distToBottom) {
				newPosition = 'bottom';
			} else if (minDist === distToLeft) {
				newPosition = 'left';
			} else if (minDist === distToRight) {
				newPosition = 'right';
			}

			// Apply new position
			setPosition(newPosition);

			// Exit drag mode
			isDragMode = false;
			toolbar.classList.remove('drag-mode');

			// Notify parent of position change
			sendMessage('positionChanged', { position: newPosition });
		});

		// Escape to cancel drag mode
		document.addEventListener('keydown', (e) => {
			if (e.key === 'Escape') {
				if (isDragMode) {
					isDragMode = false;
					isDragging = false;
					toolbar.classList.remove('drag-mode', 'dragging');
					Object.values(snapIndicators).forEach(el => el.classList.remove('visible'));
					setPosition(currentPosition); // Reset to current position
				} else {
					sendMessage('setMode', { mode: 'none' });
				}
			} else if (e.key === 'v' || e.key === 'V') {
				if (!isDragMode) sendMessage('setMode', { mode: 'select' });
			} else if (e.key === 'i' || e.key === 'I') {
				if (!isDragMode) sendMessage('setMode', { mode: 'inspect' });
			}
		});

		function setPosition(position) {
			// Reset inline styles
			toolbar.style.left = '';
			toolbar.style.right = '';
			toolbar.style.top = '';
			toolbar.style.bottom = '';
			toolbar.style.transform = '';

			// Remove old position class
			toolbar.classList.remove('position-top', 'position-bottom', 'position-left', 'position-right');

			// Add new position class
			toolbar.classList.add('position-' + position);
			currentPosition = position;

			// Update layout direction via class (CSS handles the rest)
		}
	</script>
</body>
</html>`;
}
