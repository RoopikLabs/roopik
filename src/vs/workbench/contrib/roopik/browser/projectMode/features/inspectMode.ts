/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { INotificationService, Severity } from '../../../../../../platform/notification/common/notification.js';
import { IClipboardService } from '../../../../../../platform/clipboard/common/clipboardService.js';
import type { IProjectModeService } from '../../../common/projectMode/ipc.js';

/**
 * Inspect Mode Feature (Unified)
 *
 * Runtime-injected inspect mode combining element inspection and style inspection.
 * No build-time script pollution - injected on demand.
 *
 * Features:
 * - Hover: Blue highlight follows hovered element with tag label
 * - Click: Selects element, copies HTML, keeps highlight (doesn't exit)
 * - Selected element stays highlighted (green) while hovering others (blue)
 * - Reads data-roopik-source for source location
 * - Stores selector for style panel to use
 * - ESC exits inspect mode
 *
 * Data stored in window for panel to read:
 * - __roopikInspectResult: Full element info (HTML, source, selector, etc.)
 */
export class InspectMode {
	private isActive: boolean = false;

	constructor(
		private readonly browserService: IProjectModeService,
		private readonly notificationService: INotificationService,
		private readonly clipboardService: IClipboardService
	) { }

	/**
	 * Enable Inspect Mode
	 * Injects unified script for element + style inspection
	 */
	async enable(browserViewId: number): Promise<void> {
		if (!browserViewId) {
			return;
		}

		this.isActive = true;

		try {
			await this.browserService.executeScript(browserViewId, INSPECT_MODE_SCRIPT);

			this.notificationService.notify({
				severity: Severity.Info,
				message: 'Inspect Mode: Click element to select. ESC to exit.',
				sticky: false
			});
		} catch {
			this.isActive = false;
		}
	}

	/**
	 * Disable Inspect Mode
	 */
	async disable(browserViewId: number): Promise<void> {
		if (!browserViewId) {
			return;
		}

		this.isActive = false;

		try {
			await this.browserService.executeScript(browserViewId, `
				if (window.__roopikInspectCleanup) {
					window.__roopikInspectCleanup();
				}
			`);
		} catch {
			// Silent fail
		}
	}

	/**
	 * Check if inspect mode is active (local state)
	 */
	getIsActive(): boolean {
		return this.isActive;
	}

	/**
	 * Check if inspect mode script is active in the browser
	 * (Script might have been cleaned up by page navigation)
	 */
	async isActiveInBrowser(browserViewId: number): Promise<boolean> {
		if (!browserViewId) {
			return false;
		}

		try {
			const result = await this.browserService.executeScript(
				browserViewId,
				'typeof window.__roopikInspectCleanup === "function"'
			);
			return result === true;
		} catch {
			return false;
		}
	}

	/**
	 * Get the inspection result (selected element info)
	 * Panel uses this to get element data
	 */
	async getInspectResult(browserViewId: number): Promise<InspectResult | null> {
		if (!browserViewId) {
			return null;
		}

		try {
			return await this.browserService.executeScript(
				browserViewId,
				'window.__roopikInspectResult || null'
			);
		} catch {
			return null;
		}
	}

	/**
	 * Clear the inspection result
	 * Call after panel has read the data
	 */
	async clearInspectResult(browserViewId: number): Promise<void> {
		if (!browserViewId) {
			return;
		}

		try {
			await this.browserService.executeScript(
				browserViewId,
				'window.__roopikInspectResult = null'
			);
		} catch {
			// Silent fail
		}
	}

	/**
	 * Copy element HTML to clipboard
	 * Uses VSCode's clipboard service (works reliably in Electron)
	 */
	async copyElementHtml(browserViewId: number): Promise<boolean> {
		const result = await this.getInspectResult(browserViewId);
		if (!result?.html) {
			return false;
		}

		try {
			await this.clipboardService.writeText(result.html);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Get the last inspected element's HTML
	 * API for programmatic access (agents, automation tools)
	 */
	async getLastInspectedHtml(browserViewId: number): Promise<string | null> {
		const result = await this.getInspectResult(browserViewId);
		return result?.html ?? null;
	}
}

/**
 * Unified inspection result - combines element info + style info needs
 * This is what gets stored in window.__roopikInspectResult
 */
export interface InspectResult {
	// Element identification (for style panel to query CSS)
	selector: string;
	x: number;
	y: number;

	// Element info
	tagName: string;
	id: string | null;
	className: string | null;
	html: string;

	// Source tracking (from data-roopik-source)
	source: SourceLocation | null;
	component: string | null;
	parent: string | null;

	// Timestamp for change detection
	timestamp: number;
}

/**
 * Source location parsed from data-roopik-source attribute
 * Matches common/navigation/sourceNavigationService.ts SourceLocation
 */
export interface SourceLocation {
	file: string;
	line: number;       // Required: start line (1-indexed)
	column?: number;    // Optional: start column (0-indexed)
	endLine?: number;   // Optional: end line for selection
	endColumn?: number; // Optional: end column for selection
}

// ============================================
// Unified Inspect Mode Script (injected into browser)
// ============================================

/**
 * Unified inspect mode script combining element + style inspection.
 *
 * Features:
 * - Hover: Blue highlight follows hovered element with tag label
 * - Click: Selects element (green highlight), copies HTML, stores full info
 * - Selected element stays highlighted while hovering others
 * - Compare mode: Can see selected (green) + hovered (blue) simultaneously
 * - Reads data-roopik-source for source location
 * - Stores selector + coordinates for style panel
 * - ESC exits inspect mode
 */
const INSPECT_MODE_SCRIPT = `
(function() {
	'use strict';

	// Cleanup any existing inspect mode
	if (window.__roopikInspectCleanup) {
		window.__roopikInspectCleanup();
	}

	// ========== State ==========
	let hoverElement = null;
	let selectedElement = null;
	let toastTimeout = null;

	// ========== Create UI Elements ==========

	// Hover overlay (blue - follows mouse)
	const hoverOverlay = document.createElement('div');
	hoverOverlay.id = '__roopik_inspect_hover';
	hoverOverlay.style.cssText = [
		'position: fixed',
		'pointer-events: none',
		'z-index: 2147483646',
		'border: 2px solid #007acc',
		'background-color: rgba(0, 122, 204, 0.1)',
		'transition: all 0.05s ease-out',
		'display: none'
	].join(';');
	document.body.appendChild(hoverOverlay);

	// Selected overlay (green - stays on selected element)
	const selectedOverlay = document.createElement('div');
	selectedOverlay.id = '__roopik_inspect_selected';
	selectedOverlay.style.cssText = [
		'position: fixed',
		'pointer-events: none',
		'z-index: 2147483645',
		'border: 2px solid #22c55e',
		'background-color: rgba(34, 197, 94, 0.15)',
		'display: none'
	].join(';');
	document.body.appendChild(selectedOverlay);

	// Hover label (tag info)
	const hoverLabel = document.createElement('div');
	hoverLabel.id = '__roopik_inspect_label';
	hoverLabel.style.cssText = [
		'position: fixed',
		'pointer-events: none',
		'z-index: 2147483647',
		'background-color: #007acc',
		'color: white',
		'font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
		'font-size: 11px',
		'padding: 2px 6px',
		'border-radius: 2px',
		'white-space: nowrap',
		'display: none'
	].join(';');
	document.body.appendChild(hoverLabel);

	// Toast notification
	const toast = document.createElement('div');
	toast.id = '__roopik_inspect_toast';
	toast.style.cssText = [
		'position: fixed',
		'top: 20px',
		'left: 50%',
		'transform: translateX(-50%) translateY(-100px)',
		'background-color: #1e1e1e',
		'color: #ffffff',
		'font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
		'font-size: 13px',
		'padding: 10px 20px',
		'border-radius: 6px',
		'box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3)',
		'z-index: 2147483647',
		'opacity: 0',
		'transition: transform 0.3s ease, opacity 0.3s ease',
		'pointer-events: none'
	].join(';');
	document.body.appendChild(toast);

	// ========== Helper Functions ==========

	function showToast(message) {
		if (toastTimeout) clearTimeout(toastTimeout);
		toast.textContent = message;
		toast.style.opacity = '1';
		toast.style.transform = 'translateX(-50%) translateY(0)';
		toastTimeout = setTimeout(function() {
			toast.style.opacity = '0';
			toast.style.transform = 'translateX(-50%) translateY(-100px)';
		}, 2000);
	}

	function parseSourceAttr(attr) {
		if (!attr) return null;
		var parts = attr.split(':');
		var pathEndIndex = 0;
		for (var i = parts.length - 1; i >= 0; i--) {
			if (isNaN(parseInt(parts[i], 10))) {
				pathEndIndex = i;
				break;
			}
		}
		var filePath = parts.slice(0, pathEndIndex + 1).join(':');
		var numbers = parts.slice(pathEndIndex + 1).map(function(n) { return parseInt(n, 10); });
		var result = { file: filePath, line: numbers[0] || 1 };
		if (numbers.length >= 2) result.column = numbers[1];
		if (numbers.length >= 4) {
			result.endLine = numbers[2];
			result.endColumn = numbers[3];
		}
		return result;
	}

	function getElementSelector(el) {
		if (!el || el === document.body || el === document.documentElement) return null;
		var parts = [];
		var current = el;
		while (current && current !== document.body && current !== document.documentElement) {
			var selector = current.tagName.toLowerCase();
			if (current.id) {
				parts.unshift('#' + CSS.escape(current.id));
				break;
			}
			if (current.className && typeof current.className === 'string') {
				var classes = current.className.trim().split(/\\s+/).filter(function(c) { return c; });
				if (classes.length > 0) {
					selector += '.' + classes.map(function(c) { return CSS.escape(c); }).join('.');
				}
			}
			var parent = current.parentElement;
			if (parent) {
				var siblings = Array.from(parent.children).filter(function(s) { return s.tagName === current.tagName; });
				if (siblings.length > 1) {
					var index = siblings.indexOf(current) + 1;
					selector += ':nth-of-type(' + index + ')';
				}
			}
			parts.unshift(selector);
			current = parent;
		}
		return parts.join(' > ');
	}

	function buildInspectResult(el, x, y) {
		var sourceAttr = el.getAttribute('data-roopik-source');
		var componentAttr = el.getAttribute('data-roopik-component');
		var parentAttr = el.getAttribute('data-roopik-parent');
		return {
			selector: getElementSelector(el),
			x: x,
			y: y,
			tagName: el.tagName.toLowerCase(),
			id: el.id || null,
			className: (typeof el.className === 'string') ? el.className : null,
			html: el.outerHTML,
			source: sourceAttr ? parseSourceAttr(sourceAttr) : null,
			component: componentAttr || null,
			parent: parentAttr || null,
			timestamp: Date.now()
		};
	}

	function updateOverlay(overlay, label, el, color) {
		if (!el || el === document.body || el === document.documentElement) {
			overlay.style.display = 'none';
			if (label) label.style.display = 'none';
			return;
		}
		var rect = el.getBoundingClientRect();
		overlay.style.display = 'block';
		overlay.style.top = rect.top + 'px';
		overlay.style.left = rect.left + 'px';
		overlay.style.width = rect.width + 'px';
		overlay.style.height = rect.height + 'px';

		if (label) {
			label.style.display = 'block';
			label.textContent = el.tagName.toLowerCase();
			label.style.backgroundColor = color || '#007acc';
			var labelHeight = 20;
			if (rect.top > labelHeight + 4) {
				label.style.top = (rect.top - labelHeight - 4) + 'px';
			} else {
				label.style.top = (rect.bottom + 4) + 'px';
			}
			label.style.left = Math.max(0, rect.left) + 'px';
		}
	}

	function isOurElement(el) {
		return el && el.id && el.id.startsWith('__roopik_inspect');
	}

	// ========== Event Handlers ==========

	function onMouseMove(e) {
		var el = document.elementFromPoint(e.clientX, e.clientY);
		if (isOurElement(el)) return;

		if (el && el !== hoverElement) {
			hoverElement = el;
			// Don't show hover overlay on selected element (already has green)
			if (el === selectedElement) {
				hoverOverlay.style.display = 'none';
				hoverLabel.style.display = 'none';
			} else {
				updateOverlay(hoverOverlay, hoverLabel, el, '#007acc');
			}
		}
	}

	function onClick(e) {
		e.preventDefault();
		e.stopPropagation();
		e.stopImmediatePropagation();

		var el = hoverElement || document.elementFromPoint(e.clientX, e.clientY);
		if (!el || isOurElement(el)) return false;

		// Select this element
		selectedElement = el;

		// Build result
		var rect = el.getBoundingClientRect();
		var sourceAttr = el.getAttribute('data-roopik-source');
		var message = {
			type: 'element-selected',
			selector: getElementSelector(el),
			html: el.outerHTML,
			tagName: el.tagName.toLowerCase(),
			source: sourceAttr ? parseSourceAttr(sourceAttr) : null,
			bounds: {
				x: rect.left,
				y: rect.top,
				width: rect.width,
				height: rect.height
			}
		};

		// Store result for backward compatibility (getInspectResult)
		window.__roopikInspectResult = message;

		// Send to VSCode via CDP bridge (if available)
		if (typeof window.__roopikBridge === 'function') {
			window.__roopikBridge(JSON.stringify(message));
		}

		// Update selected overlay (green)
		updateOverlay(selectedOverlay, null, el);
		selectedOverlay.style.display = 'block';

		// Hide hover overlay since we're now on selected
		hoverOverlay.style.display = 'none';
		hoverLabel.style.display = 'none';

		// Show selection feedback
		showToast('✓ Element selected');

		// DON'T cleanup - stay in inspect mode for comparing
		return false;
	}

	function onKeyDown(e) {
		if (e.key === 'Escape') {
			// Notify VSCode that inspect mode was exited
			if (typeof window.__roopikBridge === 'function') {
				window.__roopikBridge(JSON.stringify({ type: 'inspect-mode-exited' }));
			}
			cleanup();
		}
	}

	function onScroll() {
		if (hoverElement && hoverElement !== selectedElement) {
			updateOverlay(hoverOverlay, hoverLabel, hoverElement, '#007acc');
		}
		if (selectedElement) {
			updateOverlay(selectedOverlay, null, selectedElement);
		}
	}

	// ========== Cleanup ==========

	function cleanup() {
		document.removeEventListener('mousemove', onMouseMove, true);
		document.removeEventListener('click', onClick, true);
		document.removeEventListener('keydown', onKeyDown, true);
		document.removeEventListener('scroll', onScroll, true);
		window.removeEventListener('resize', onScroll);

		if (toastTimeout) clearTimeout(toastTimeout);

		if (hoverOverlay.parentNode) hoverOverlay.remove();
		if (selectedOverlay.parentNode) selectedOverlay.remove();
		if (hoverLabel.parentNode) hoverLabel.remove();
		if (toast.parentNode) toast.remove();

		hoverElement = null;
		selectedElement = null;
		delete window.__roopikInspectCleanup;
	}

	window.__roopikInspectCleanup = cleanup;

	// ========== Initialize ==========

	document.addEventListener('mousemove', onMouseMove, true);
	document.addEventListener('click', onClick, true);
	document.addEventListener('keydown', onKeyDown, true);
	document.addEventListener('scroll', onScroll, true);
	window.addEventListener('resize', onScroll);

	return 'Inspect mode enabled';
})();
`;
