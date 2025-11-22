/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Inspect Mode Overlay - Injected into preview iframe
 * Highlights elements on hover and sends inspection data on click
 */

export interface InspectedElement {
	componentName: string;
	file: string;
	line: number;
	column: number;
	endLine?: number;
	endColumn?: number;
	props: Record<string, unknown>;
	computedStyles: Record<string, string>;
	tagName: string;
	className: string;
	id: string;
	textContent: string;
}

export function createInspectOverlayScript(): string {
	return `
(function() {
	let overlay = null;
	let tooltip = null;
	let isInspectMode = false;
	let currentElement = null;

	// Create overlay element
	function createOverlay() {
		if (overlay) return;

		overlay = document.createElement('div');
		overlay.id = '__roopik_inspect_overlay__';
		overlay.style.cssText = \`
			position: absolute;
			pointer-events: none;
			border: 2px solid #007acc;
			background: rgba(0, 122, 204, 0.1);
			z-index: 2147483646;
			box-sizing: border-box;
			transition: all 0.1s ease;
		\`;
		document.body.appendChild(overlay);
	}

	// Create tooltip element
	function createTooltip() {
		if (tooltip) return;

		tooltip = document.createElement('div');
		tooltip.id = '__roopik_inspect_tooltip__';
		tooltip.style.cssText = \`
			position: absolute;
			pointer-events: none;
			background: rgba(0, 0, 0, 0.9);
			color: white;
			padding: 8px 12px;
			border-radius: 4px;
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
			font-size: 12px;
			z-index: 2147483647;
			white-space: nowrap;
			box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
		\`;
		document.body.appendChild(tooltip);
	}

	// Get React Fiber from element
	function getReactFiber(element) {
		const key = Object.keys(element).find(k =>
			k.startsWith('__reactFiber') ||
			k.startsWith('__reactInternalInstance')
		);
		return key ? element[key] : null;
	}

	// Find component fiber (not DOM element)
	function findComponentFiber(fiber) {
		if (!fiber) return null;

		let current = fiber;
		while (current) {
			if (typeof current.type === 'function') {
				return current;
			}
			current = current.return;
		}
		return null;
	}

	// Get component name from fiber
	function getComponentName(fiber) {
		if (!fiber) return 'Unknown';
		return fiber.type?.displayName ||
		       fiber.type?.name ||
		       fiber.elementType?.name ||
		       'Anonymous';
	}

	// Extract props from fiber
	function extractProps(fiber) {
		if (!fiber || !fiber.memoizedProps) return {};

		const props = { ...fiber.memoizedProps };
		// Remove React internals
		delete props.children;
		delete props.ref;
		return props;
	}

	// Get computed styles
	function getComputedStyles(element) {
		const computed = window.getComputedStyle(element);
		const relevantStyles = [
			'display', 'position', 'width', 'height',
			'margin', 'padding', 'border',
			'background', 'backgroundColor',
			'color', 'fontSize', 'fontWeight',
			'flexDirection', 'justifyContent', 'alignItems'
		];

		const styles = {};
		relevantStyles.forEach(prop => {
			const value = computed.getPropertyValue(prop);
			if (value) {
				styles[prop] = value;
			}
		});
		return styles;
	}

	// Inspect element and extract data
	function inspectElement(element) {
		const fiber = getReactFiber(element);
		const componentFiber = findComponentFiber(fiber);

		let file = 'Unknown';
		let line = 0;
		let column = 0;
		let componentName = 'Unknown';

		if (componentFiber?._debugSource) {
			file = componentFiber._debugSource.fileName;
			line = componentFiber._debugSource.lineNumber;
			column = componentFiber._debugSource.columnNumber;
			componentName = getComponentName(componentFiber);
		} else {
			// Fallback: use element's tag name
			componentName = element.tagName.toLowerCase();
		}

		return {
			componentName,
			file,
			line,
			column,
			props: componentFiber ? extractProps(componentFiber) : {},
			computedStyles: getComputedStyles(element),
			tagName: element.tagName,
			className: element.className,
			id: element.id,
			textContent: element.textContent?.substring(0, 100) || ''
		};
	}

	// Position overlay on element
	function positionOverlay(element) {
		if (!overlay || !element) return;

		const rect = element.getBoundingClientRect();
		overlay.style.top = rect.top + window.scrollY + 'px';
		overlay.style.left = rect.left + window.scrollX + 'px';
		overlay.style.width = rect.width + 'px';
		overlay.style.height = rect.height + 'px';
		overlay.style.display = 'block';
	}

	// Position tooltip near element
	function positionTooltip(element, data) {
		if (!tooltip || !element) return;

		const rect = element.getBoundingClientRect();
		const fileName = data.file.split('/').pop() || data.file;

		tooltip.innerHTML = \`
			<div style="font-weight: 600; margin-bottom: 4px;">\${data.componentName}</div>
			<div style="opacity: 0.8;">\${fileName}:\${data.line}</div>
		\`;

		// Position above element, or below if not enough space
		let top = rect.top + window.scrollY - tooltip.offsetHeight - 8;
		if (top < 0) {
			top = rect.bottom + window.scrollY + 8;
		}

		tooltip.style.top = top + 'px';
		tooltip.style.left = rect.left + window.scrollX + 'px';
		tooltip.style.display = 'block';
	}

	// Hide overlay and tooltip
	function hideOverlay() {
		if (overlay) overlay.style.display = 'none';
		if (tooltip) tooltip.style.display = 'none';
		currentElement = null;
	}

	// Handle mousemove
	function handleMouseMove(e) {
		if (!isInspectMode) return;

		const element = e.target;
		if (element === overlay || element === tooltip) return;

		currentElement = element;
		const data = inspectElement(element);

		positionOverlay(element);
		positionTooltip(element, data);
	}

	// Handle click
	function handleClick(e) {
		if (!isInspectMode) return;

		e.preventDefault();
		e.stopPropagation();

		if (currentElement) {
			const data = inspectElement(currentElement);

			// Send to parent
			console.log('[Roopik Inspect] 📤 Sending element data:', data);
			window.parent.postMessage({
				type: 'roopik-inspect-element',
				element: data
			}, '*');
		}
	}

	// Enable inspect mode
	function enableInspectMode() {
		if (isInspectMode) return;

		isInspectMode = true;
		createOverlay();
		createTooltip();

		document.addEventListener('mousemove', handleMouseMove, true);
		document.addEventListener('click', handleClick, true);
		document.body.style.cursor = 'crosshair';

		console.log('[Roopik Inspect] Mode enabled');
	}

	// Disable inspect mode
	function disableInspectMode() {
		if (!isInspectMode) return;

		isInspectMode = false;
		hideOverlay();

		document.removeEventListener('mousemove', handleMouseMove, true);
		document.removeEventListener('click', handleClick, true);
		document.body.style.cursor = '';

		console.log('[Roopik Inspect] Mode disabled');
	}

	// Listen for messages from parent
	window.addEventListener('message', (event) => {
		console.log('[Roopik Inspect] 📨 Received message:', event.data.type, event.data);

		if (event.data.type === 'roopik-toggle-inspect') {
			console.log('[Roopik Inspect] Toggle inspect:', event.data.enabled);
			if (event.data.enabled) {
				enableInspectMode();
			} else {
				disableInspectMode();
			}
		}
	});

	console.log('[Roopik Inspect] ✅ Overlay script loaded and listening for messages');
})();
`;
}
