/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Click-to-Source Listener
 *
 * This script is injected into the preview iframe/webview.
 * It listens for clicks on React components and extracts source location
 * from React's __source metadata (automatically added in dev mode).
 */

interface SourceLocation {
	fileName: string;
	lineNumber: number;
	columnNumber?: number;
}

interface ClickToSourceMessage {
	type: 'click-to-source';
	file: string;
	line: number;
	column?: number;
	componentName?: string;
}

/**
 * Extract source location from React Fiber node
 */
function getSourceFromFiber(fiber: any): SourceLocation | null {
	// React 18: fiber._debugSource
	// React 17: fiber._source
	// React 16: fiber._debugSource
	const source = fiber._debugSource || fiber._source;

	if (source && source.fileName) {
		return {
			fileName: source.fileName,
			lineNumber: source.lineNumber,
			columnNumber: source.columnNumber
		};
	}

	return null;
}

/**
 * Walk up React fiber tree to find nearest component with source info
 */
function findSourceInFiberTree(element: HTMLElement): SourceLocation | null {
	// Get React fiber node from DOM element
	// React 18: _reactFiber$xxxxx
	// React 17: __reactFiber$xxxxx
	// React 16: _reactInternalFiber
	const fiberKey = Object.keys(element).find(key =>
		key.startsWith('__reactFiber') ||
		key.startsWith('_reactFiber') ||
		key === '_reactInternalFiber'
	);

	if (!fiberKey) {
		return null;
	}

	let fiber = (element as any)[fiberKey];

	// Walk up the fiber tree
	while (fiber) {
		const source = getSourceFromFiber(fiber);
		if (source) {
			return source;
		}
		fiber = fiber.return; // Parent fiber
	}

	return null;
}

/**
 * Extract component name from fiber
 */
function getComponentName(element: HTMLElement): string | undefined {
	const fiberKey = Object.keys(element).find(key =>
		key.startsWith('__reactFiber') ||
		key.startsWith('_reactFiber') ||
		key === '_reactInternalFiber'
	);

	if (!fiberKey) {
		return undefined;
	}

	let fiber = (element as any)[fiberKey];

	while (fiber) {
		if (fiber.type && typeof fiber.type === 'function') {
			return fiber.type.name || fiber.type.displayName;
		}
		if (fiber.type && typeof fiber.type === 'string') {
			return fiber.type; // e.g., 'div', 'button'
		}
		fiber = fiber.return;
	}

	return undefined;
}

/**
 * Initialize click-to-source listener
 */
export function initClickToSource() {
	console.log('[Roopik] Click-to-source listener initialized');

	document.addEventListener('click', (event) => {
		// Only intercept clicks with Ctrl/Cmd modifier
		// This prevents interfering with normal interactions
		if (!(event.metaKey || event.ctrlKey)) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();

		const target = event.target as HTMLElement;

		// Find source location from React fiber
		const source = findSourceInFiberTree(target);

		if (source) {
			const componentName = getComponentName(target);

			console.log('[Roopik] Found source:', source, 'Component:', componentName);

			// Send message to parent (webview or extension)
			const message: ClickToSourceMessage = {
				type: 'click-to-source',
				file: source.fileName,
				line: source.lineNumber,
				column: source.columnNumber,
				componentName
			};

			// If in iframe, send to parent
			if (window.parent !== window) {
				window.parent.postMessage(message, '*');
			}

			// If in VS Code webview, send directly to extension
			if ((window as any).acquireVsCodeApi) {
				const vscode = (window as any).acquireVsCodeApi();
				vscode.postMessage(message);
			}
		} else {
			console.log('[Roopik] No source information found for clicked element');
		}
	}, true); // Use capture phase to intercept before React handlers

	// Log that we're ready
	console.log('[Roopik] Click any element with Ctrl/Cmd held to jump to source');
}

// Auto-initialize when loaded
if (typeof window !== 'undefined') {
	// Wait for React to mount
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', initClickToSource);
	} else {
		initClickToSource();
	}
}
