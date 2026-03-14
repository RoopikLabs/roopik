/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Inspect Mode Injector
 *
 * Adds hover highlighting and click-to-inspect functionality to components.
 * Enables element inspection in the canvas sandbox.
 */

import { BaseInjector } from './types.js';
import type { InjectorContext } from './types.js';

export class InspectModeInjector extends BaseInjector {
	override readonly name = 'inspect-mode';
	override readonly priority = 50; // Run after error boundary

	override inject(code: string, context: InjectorContext): string {
		const inspectScript = `
// ===== Roopik Inspect Mode =====
(function() {
	const componentId = ${JSON.stringify(context.componentId)};
	let inspectEnabled = false;
	let captureOnSelect = false;
	let hoveredElement = null;
	let selectedElement = null; // Track locked element after click
	let highlightOverlay = null;

	// Create highlight overlay element
	function createOverlay() {
		if (highlightOverlay) return highlightOverlay;

		highlightOverlay = document.createElement('div');
		highlightOverlay.id = 'roopik-inspect-overlay';
		highlightOverlay.style.cssText = \`
			position: fixed;
			pointer-events: none;
			border: 2px solid #3b82f6;
			background: rgba(59, 130, 246, 0.1);
			z-index: 999999;
			display: none;
			transition: all 0.1s ease-out;
		\`;
		document.body.appendChild(highlightOverlay);
		return highlightOverlay;
	}

	// Update overlay position to match element
	function updateOverlay(element) {
		if (!element || !highlightOverlay) return;

		const rect = element.getBoundingClientRect();
		highlightOverlay.style.left = rect.left + 'px';
		highlightOverlay.style.top = rect.top + 'px';
		highlightOverlay.style.width = rect.width + 'px';
		highlightOverlay.style.height = rect.height + 'px';
		highlightOverlay.style.display = 'block';
	}

	// Get element info for inspection
	function getElementInfo(element) {
		if (!element) return null;

		const rect = element.getBoundingClientRect();
		const computedStyle = window.getComputedStyle(element);

		// Extract source tracking attributes (injected during build)
		const roopikSource = element.getAttribute('data-roopik-source');
		const roopikComponent = element.getAttribute('data-roopik-component');
		const roopikParent = element.getAttribute('data-roopik-parent');

		// Parse source location: "file:startLine:startCol:endLine:endCol"
		let sourceLocation = null;
		if (roopikSource) {
			const parts = roopikSource.split(':');
			if (parts.length >= 5) {
				// Handle Windows paths (C:/path/file.tsx:10:5:15:20)
				// Find the last 4 numeric parts
				const numericParts = [];
				let filePath = '';
				for (let i = parts.length - 1; i >= 0 && numericParts.length < 4; i--) {
					if (/^\\d+$/.test(parts[i])) {
						numericParts.unshift(parts[i]);
					} else {
						filePath = parts.slice(0, i + 1).join(':');
						break;
					}
				}
				if (numericParts.length === 4) {
					sourceLocation = {
						file: filePath,
						startLine: parseInt(numericParts[0], 10),
						startColumn: parseInt(numericParts[1], 10),
						endLine: parseInt(numericParts[2], 10),
						endColumn: parseInt(numericParts[3], 10)
					};
				}
			}
		}

		// Find nearest element with source tracking (walk up the tree)
		let nearestSource = sourceLocation;
		if (!nearestSource) {
			let parent = element.parentElement;
			while (parent && !nearestSource) {
				const parentSource = parent.getAttribute('data-roopik-source');
				if (parentSource) {
					const parts = parentSource.split(':');
					const numericParts = [];
					let filePath = '';
					for (let i = parts.length - 1; i >= 0 && numericParts.length < 4; i--) {
						if (/^\\d+$/.test(parts[i])) {
							numericParts.unshift(parts[i]);
						} else {
							filePath = parts.slice(0, i + 1).join(':');
							break;
						}
					}
					if (numericParts.length === 4) {
						nearestSource = {
							file: filePath,
							startLine: parseInt(numericParts[0], 10),
							startColumn: parseInt(numericParts[1], 10),
							endLine: parseInt(numericParts[2], 10),
							endColumn: parseInt(numericParts[3], 10),
							isParent: true
						};
					}
				}
				parent = parent.parentElement;
			}
		}

		return {
			tagName: element.tagName.toLowerCase(),
			id: element.id || null,
			classList: Array.from(element.classList),
			attributes: Array.from(element.attributes).reduce((acc, attr) => {
				acc[attr.name] = attr.value;
				return acc;
			}, {}),
			boundingRect: {
				x: rect.x,
				y: rect.y,
				width: rect.width,
				height: rect.height
			},
			computedStyles: {
				color: computedStyle.color,
				backgroundColor: computedStyle.backgroundColor,
				fontSize: computedStyle.fontSize,
				fontFamily: computedStyle.fontFamily,
				padding: computedStyle.padding,
				margin: computedStyle.margin,
				border: computedStyle.border,
				display: computedStyle.display,
				position: computedStyle.position
			},
			textContent: element.textContent?.slice(0, 100) || null,
			innerHTML: element.innerHTML?.slice(0, 200) || null,
			// Source tracking info
			sourceLocation: nearestSource,
			componentName: roopikComponent || null,
			parentContext: roopikParent || null
		};
	}

	// Handle mouse move for hover highlighting
	function handleMouseMove(event) {
		if (!inspectEnabled) return;

		// If element is locked/selected, don't update hover
		if (selectedElement) return;

		const target = event.target;
		if (target === highlightOverlay) return;
		if (target === hoveredElement) return;

		hoveredElement = target;
		updateOverlay(target);
	}

	// Handle click for element selection
	function handleClick(event) {
		if (!inspectEnabled) return;

		event.preventDefault();
		event.stopPropagation();

		const target = event.target;
		if (target === highlightOverlay) return;

		// Lock this element as selected
		selectedElement = target;

		// Keep the highlight locked on the selected element
		updateOverlay(target);

		const info = getElementInfo(target);
		let screenshotRequestId = null;
		if (captureOnSelect && typeof window.__roopikCaptureElement === 'function') {
			screenshotRequestId = 'inspect-' + Date.now() + '-' + Math.random().toString(16).slice(2);
			window.__roopikCaptureElement(target, {
				target: 'element',
				requestId: screenshotRequestId,
				intent: 'inspect'
			});
		}

		// Notify parent about selected element
		window.parent.postMessage({
			type: 'roopik-element-selected',
			componentId: componentId,
			element: info,
			screenshotRequestId
		}, '*');
	}

	// Listen for inspect mode toggle from parent
	window.addEventListener('message', function(event) {
		if (event.data?.type === 'roopik-toggle-inspect') {
			inspectEnabled = event.data.enabled;
			captureOnSelect = Boolean(event.data.captureOnSelect);

			if (inspectEnabled) {
				createOverlay();
				document.body.style.cursor = 'crosshair';
			} else {
				// When inspect mode is disabled, unlock the selected element
				selectedElement = null;
				if (highlightOverlay) {
					highlightOverlay.style.display = 'none';
				}
				document.body.style.cursor = '';
				hoveredElement = null;
			}
		}

		// Unlock selected element when chat closes (but keep inspect mode active)
		if (event.data?.type === 'roopik-unlock-selection') {
			selectedElement = null;
			hoveredElement = null;
			// Hide the overlay completely - it will reappear on next hover
			if (highlightOverlay) {
				highlightOverlay.style.display = 'none';
			}
		}
	});

	// Attach event listeners (capture phase to intercept all events)
	document.addEventListener('mousemove', handleMouseMove, true);
	document.addEventListener('click', handleClick, true);

	// Notify parent that inspect mode is ready
	window.parent.postMessage({
		type: 'roopik-inspect-ready',
		componentId: componentId
	}, '*');
})();
// ===== End Inspect Mode =====

`;
		return code + inspectScript;
	}
}
