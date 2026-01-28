/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Clip Mode Script
 *
 * Injected into browser page to enable screenshot clipping via drag-to-select rectangle.
 * User drags to select a region, then captures only that area.
 *
 * Architecture:
 * - Semi-transparent overlay covers entire page
 * - Rectangle selection via mouse drag
 * - Shows dimensions while dragging
 * - ESC cancels, Enter/Click confirms
 * - Sends coordinates back to main process for capture
 */

export function getClipModeScript(): string {
	return `
(function() {
	'use strict';

	// Prevent multiple injections
	if (window.__roopikClipMode) {
		return;
	}
	window.__roopikClipMode = true;

	let overlay = null;
	let selectionBox = null;
	let dimensionsLabel = null;
	let isDrawing = false;
	let startX = 0;
	let startY = 0;
	let currentX = 0;
	let currentY = 0;

	// ============================================================================
	// Create Clip Mode Overlay
	// ============================================================================

	function createOverlay() {
		// Semi-transparent dark overlay
		overlay = document.createElement('div');
		overlay.id = 'roopik-clip-overlay';
		overlay.style.cssText = \`
			position: fixed;
			top: 0;
			left: 0;
			width: 100vw;
			height: 100vh;
			background: rgba(0, 0, 0, 0.2);
			z-index: 2147483646;
			cursor: crosshair;
			user-select: none;
		\`;

		// Selection box (the draggable rectangle)
		selectionBox = document.createElement('div');
		selectionBox.style.cssText = \`
			position: fixed;
			border: 3px dashed #4facfe;
			background: transparent;
			box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.2), inset 0 0 0 2000px rgba(79, 172, 254, 0.08);
			display: none;
			pointer-events: none;
			z-index: 2147483647;
		\`;

		// Dimensions label (shows width x height)
		dimensionsLabel = document.createElement('div');
		dimensionsLabel.style.cssText = \`
			position: fixed;
			background: rgba(0, 0, 0, 0.8);
			color: white;
			padding: 6px 12px;
			border-radius: 4px;
			font-size: 12px;
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
			display: none;
			pointer-events: none;
			z-index: 2147483647;
		\`;

		document.body.appendChild(overlay);
		document.body.appendChild(selectionBox);
		document.body.appendChild(dimensionsLabel);
	}

	// ============================================================================
	// Mouse Event Handlers
	// ============================================================================

	function handleMouseDown(e) {
		if (e.target !== overlay) {
			return;
		}

		isDrawing = true;
		startX = e.clientX;
		startY = e.clientY;
		currentX = e.clientX;
		currentY = e.clientY;

		selectionBox.style.display = 'block';
		updateSelection();
	}

	function handleMouseMove(e) {
		if (!isDrawing) {
			return;
		}

		currentX = e.clientX;
		currentY = e.clientY;
		updateSelection();
	}

	function handleMouseUp(e) {
		if (!isDrawing) {
			return;
		}

		isDrawing = false;

		// Calculate final rectangle
		const rect = getSelectionRect();

		// Minimum size check (avoid accidental clicks)
		if (rect.width < 10 || rect.height < 10) {
			selectionBox.style.display = 'none';
			dimensionsLabel.style.display = 'none';
			return;
		}

		// Hide selection UI before capture (so it doesn't appear in screenshot)
		overlay.style.display = 'none';
		selectionBox.style.display = 'none';
		dimensionsLabel.style.display = 'none';

		// Wait for browser to repaint before capturing screenshot
		// Double requestAnimationFrame ensures the UI is fully hidden from screen
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				// Send capture request after UI is hidden
				sendCaptureRequest(rect);

				// Small delay before cleanup to ensure CDP message is sent
				setTimeout(() => {
					cleanup();
				}, 50);
			});
		});
	}

	function handleClick(e) {
		// Only handle clicks when NOT drawing (for canceling empty state)
		if (isDrawing) {
			return;
		}

		// If selection box is not visible, ignore click
		if (selectionBox.style.display === 'none') {
			return;
		}
	}

	// ============================================================================
	// Rectangle Calculation
	// ============================================================================

	function updateSelection() {
		const rect = getSelectionRect();

		selectionBox.style.left = rect.x + 'px';
		selectionBox.style.top = rect.y + 'px';
		selectionBox.style.width = rect.width + 'px';
		selectionBox.style.height = rect.height + 'px';

		// Update dimensions label
		dimensionsLabel.textContent = \`\${rect.width} × \${rect.height}\`;
		dimensionsLabel.style.display = 'block';
		dimensionsLabel.style.left = (rect.x + rect.width / 2) + 'px';
		dimensionsLabel.style.top = (rect.y + rect.height + 10) + 'px';
		dimensionsLabel.style.transform = 'translateX(-50%)';
	}

	function getSelectionRect() {
		const x = Math.min(startX, currentX);
		const y = Math.min(startY, currentY);
		const width = Math.abs(currentX - startX);
		const height = Math.abs(currentY - startY);

		return { x, y, width, height };
	}

	// ============================================================================
	// Communication with Main Process
	// ============================================================================

	function sendCaptureRequest(rect) {
		// Send clip coordinates to main process via CDP binding
		// Format: viewport coordinates (clientX/Y)
		if (typeof window.__roopikBridge === 'function') {
			window.__roopikBridge(JSON.stringify({
				type: 'roopik-clip-capture',
				rect: {
					x: rect.x,
					y: rect.y,
					width: rect.width,
					height: rect.height
				}
			}));
		}
	}

	// ============================================================================
	// Keyboard Handlers
	// ============================================================================

	function handleKeyDown(e) {
		// ESC handler removed - not crucial since click-to-exit works
		// Enter key can capture if selection exists
		if (e.key === 'Enter' && selectionBox.style.display !== 'none') {
			e.preventDefault();
			e.stopPropagation();
			const rect = getSelectionRect();
			if (rect.width >= 10 && rect.height >= 10) {
				// Hide UI before capture
				overlay.style.display = 'none';
				selectionBox.style.display = 'none';
				dimensionsLabel.style.display = 'none';

				// Wait for browser to repaint before capturing
				requestAnimationFrame(() => {
					requestAnimationFrame(() => {
						sendCaptureRequest(rect);

						setTimeout(() => {
							cleanup();
						}, 50);
					});
				});
			}
		}
	}

	// ============================================================================
	// Cleanup
	// ============================================================================

	function cleanup() {
		if (overlay) {
			overlay.removeEventListener('mousedown', handleMouseDown);
			overlay.removeEventListener('mousemove', handleMouseMove);
			overlay.removeEventListener('mouseup', handleMouseUp);
			overlay.removeEventListener('click', handleClick);
			overlay.remove();
		}
		if (selectionBox) {
			selectionBox.remove();
		}
		if (dimensionsLabel) {
			dimensionsLabel.remove();
		}
		document.removeEventListener('keydown', handleKeyDown, true);
		delete window.__roopikClipMode;
	}

	// ============================================================================
	// Initialize
	// ============================================================================

	createOverlay();

	// Attach event listeners
	overlay.addEventListener('mousedown', handleMouseDown);
	overlay.addEventListener('mousemove', handleMouseMove);
	overlay.addEventListener('mouseup', handleMouseUp);
	overlay.addEventListener('click', handleClick);
	document.addEventListener('keydown', handleKeyDown, true);

	// Notify main process that clip mode is ready
	if (typeof window.__roopikBridge === 'function') {
		window.__roopikBridge(JSON.stringify({ type: 'roopik-clip-ready' }));
	}
})();
`;
}
