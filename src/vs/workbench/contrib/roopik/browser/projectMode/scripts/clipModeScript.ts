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
	let hintLabel = null;
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
			background: rgba(0, 0, 0, 0.5);
			z-index: 2147483646;
			cursor: crosshair;
			user-select: none;
		\`;

		// Selection box (the draggable rectangle)
		selectionBox = document.createElement('div');
		selectionBox.style.cssText = \`
			position: fixed;
			border: 2px solid #4facfe;
			background: rgba(79, 172, 254, 0.1);
			box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.3);
			display: none;
			pointer-events: none;
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

		// Hint label (instructions at top)
		hintLabel = document.createElement('div');
		hintLabel.style.cssText = \`
			position: fixed;
			top: 20px;
			left: 50%;
			transform: translateX(-50%);
			background: rgba(0, 0, 0, 0.9);
			color: white;
			padding: 12px 24px;
			border-radius: 8px;
			font-size: 14px;
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
			z-index: 2147483647;
			pointer-events: none;
		\`;
		hintLabel.textContent = 'Drag to select area • ESC to cancel';

		document.body.appendChild(overlay);
		document.body.appendChild(selectionBox);
		document.body.appendChild(dimensionsLabel);
		document.body.appendChild(hintLabel);
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

		// Show confirmation hint
		hintLabel.textContent = 'Click to capture • ESC to cancel';

		// Wait for user confirmation (click anywhere or Enter)
		// Don't auto-capture yet - wait for user intent
	}

	function handleClick(e) {
		// If clicking outside selection box, it's a cancel
		if (selectionBox.style.display === 'none') {
			return;
		}

		// User confirmed - send coordinates for capture
		const rect = getSelectionRect();

		if (rect.width >= 10 && rect.height >= 10) {
			sendCaptureRequest(rect);
			cleanup();
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
		if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			cleanup();
			// Notify main process that clip mode was cancelled
			if (typeof window.__roopikBridge === 'function') {
				window.__roopikBridge(JSON.stringify({ type: 'roopik-clip-cancelled' }));
			}
		} else if (e.key === 'Enter' && selectionBox.style.display !== 'none') {
			e.preventDefault();
			e.stopPropagation();
			const rect = getSelectionRect();
			if (rect.width >= 10 && rect.height >= 10) {
				sendCaptureRequest(rect);
				cleanup();
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
		if (hintLabel) {
			hintLabel.remove();
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
