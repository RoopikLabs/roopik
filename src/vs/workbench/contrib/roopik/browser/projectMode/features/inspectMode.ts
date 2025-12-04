/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { INotificationService, Severity } from '../../../../../../platform/notification/common/notification.js';
import type { IProjectModeService } from '../../../common/projectMode/ipc.js';

/**
 * Inspect Mode Feature
 *
 * Fire and forget - injects script, browser handles auto-cleanup.
 * Features:
 * - Highlight overlay follows hovered element
 * - Click copies outerHTML to clipboard
 * - Auto-exits after copy (or ESC)
 */
export class InspectMode {
	constructor(
		private readonly browserService: IProjectModeService,
		private readonly notificationService: INotificationService
	) { }

	/**
	 * Enable Inspect Element Mode
	 * Fire and forget - browser script handles auto-cleanup after copy
	 */
	async enable(browserViewId: number): Promise<void> {
		if (!browserViewId) {
			return;
		}

		try {
			await this.browserService.executeScript(browserViewId, INSPECT_MODE_SCRIPT);

			this.notificationService.notify({
				severity: Severity.Info,
				message: 'Inspect Mode: Click element to copy HTML.',
				sticky: false
			});
		} catch {
			// Silent fail - user will see no overlay appear
		}
	}

	/**
	 * Check if inspect mode is active in the browser
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
	 * Get the last inspected element's HTML
	 * API for programmatic access (agents, automation tools like Playwright)
	 */
	async getLastInspectedHtml(browserViewId: number): Promise<string | null> {
		if (!browserViewId) {
			return null;
		}

		try {
			return await this.browserService.executeScript(
				browserViewId,
				'window.__roopikLastInspectedHtml || null'
			);
		} catch {
			return null;
		}
	}
}

// ============================================
// Inspect Mode Script (injected into browser)
// ============================================

/**
 * JavaScript to inject into the browser for element inspection.
 * Features:
 * - Highlight overlay follows hovered element
 * - Label shows tag name
 * - Click copies outerHTML to clipboard
 * - Toast notification confirms copy
 * - ESC key exits inspect mode (auto-exits after copy)
 */
const INSPECT_MODE_SCRIPT = `
(function() {
	// Cleanup any existing inspect mode
	if (window.__roopikInspectCleanup) {
		window.__roopikInspectCleanup();
	}

	// ========== Create UI Elements ==========

	// Highlight overlay
	const overlay = document.createElement('div');
	overlay.id = '__roopik_inspect_overlay';
	overlay.style.cssText = [
		'position: fixed',
		'pointer-events: none',
		'z-index: 2147483647',
		'border: 2px solid #007acc',
		'background-color: rgba(0, 122, 204, 0.1)',
		'transition: all 0.05s ease-out',
		'display: none'
	].join(';');
	document.body.appendChild(overlay);

	// Element label (tag info)
	const label = document.createElement('div');
	label.id = '__roopik_inspect_label';
	label.style.cssText = [
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
	document.body.appendChild(label);

	// Toast notification container (appears from top)
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

	let currentElement = null;
	let toastTimeout = null;

	// ========== Helper Functions ==========

	// Get element description for label (tag name only)
	function getElementDescription(el) {
		return el.tagName.toLowerCase();
	}

	// Show toast notification
	function showToast(message) {
		if (toastTimeout) {
			clearTimeout(toastTimeout);
		}
		toast.textContent = message;
		toast.style.opacity = '1';
		toast.style.transform = 'translateX(-50%) translateY(0)';

		toastTimeout = setTimeout(function() {
			toast.style.opacity = '0';
			toast.style.transform = 'translateX(-50%) translateY(-100px)';
		}, 2000);
	}

	// Copy text to clipboard (with fallback)
	function copyToClipboard(text) {
		return new Promise(function(resolve, reject) {
			// Try modern clipboard API first
			if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
				navigator.clipboard.writeText(text)
					.then(resolve)
					.catch(function() {
						// Fall back to execCommand
						fallbackCopy(text, resolve, reject);
					});
			} else {
				fallbackCopy(text, resolve, reject);
			}
		});
	}

	function fallbackCopy(text, resolve, reject) {
		try {
			const textarea = document.createElement('textarea');
			textarea.value = text;
			textarea.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;';
			document.body.appendChild(textarea);
			textarea.focus();
			textarea.select();
			const success = document.execCommand('copy');
			document.body.removeChild(textarea);
			if (success) {
				resolve();
			} else {
				reject(new Error('execCommand failed'));
			}
		} catch (err) {
			reject(err);
		}
	}

	// Update overlay position
	function updateOverlay(el) {
		if (!el || el === document.body || el === document.documentElement) {
			overlay.style.display = 'none';
			label.style.display = 'none';
			return;
		}

		const rect = el.getBoundingClientRect();
		overlay.style.display = 'block';
		overlay.style.top = rect.top + 'px';
		overlay.style.left = rect.left + 'px';
		overlay.style.width = rect.width + 'px';
		overlay.style.height = rect.height + 'px';

		// Position label above element, or below if not enough space
		label.style.display = 'block';
		label.textContent = getElementDescription(el);
		const labelHeight = 20;
		if (rect.top > labelHeight + 4) {
			label.style.top = (rect.top - labelHeight - 4) + 'px';
		} else {
			label.style.top = (rect.bottom + 4) + 'px';
		}
		label.style.left = Math.max(0, rect.left) + 'px';
	}

	// Flash overlay green to indicate success
	function flashSuccess() {
		overlay.style.backgroundColor = 'rgba(0, 200, 0, 0.3)';
		overlay.style.borderColor = '#00c800';
		setTimeout(function() {
			overlay.style.backgroundColor = 'rgba(0, 122, 204, 0.1)';
			overlay.style.borderColor = '#007acc';
		}, 200);
	}


	// ========== Event Handlers ==========

	function onMouseMove(e) {
		// Ignore our own UI elements
		const el = document.elementFromPoint(e.clientX, e.clientY);
		if (el && el.id && el.id.startsWith('__roopik_inspect')) {
			return;
		}
		if (el && el !== overlay && el !== label && el !== toast && el !== currentElement) {
			currentElement = el;
			updateOverlay(el);
		}
	}

	function onClick(e) {
		e.preventDefault();
		e.stopPropagation();
		e.stopImmediatePropagation();

		if (currentElement && !(currentElement.id && currentElement.id.startsWith('__roopik_inspect'))) {
			const html = currentElement.outerHTML;

			// Store for API access
			window.__roopikLastInspectedHtml = html;

			// Copy to clipboard, then auto-exit inspect mode
			copyToClipboard(html)
				.then(function() {
					flashSuccess();
					showToast('✓ Element copied');

					// Auto-exit inspect mode after successful copy (with small delay for visual feedback)
					setTimeout(function() {
						cleanup();
					}, 300);
				})
				.catch(function(err) {
					console.error('[Roopik Inspect] Copy failed:', err);
					showToast('✗ Copy failed');
					// Don't exit on failure - let user try again
				});
		}

		return false;
	}

	function onKeyDown(e) {
		if (e.key === 'Escape') {
			cleanup();
		}
	}

	function onScroll() {
		if (currentElement) {
			updateOverlay(currentElement);
		}
	}

	// ========== Cleanup ==========

	function cleanup() {
		document.removeEventListener('mousemove', onMouseMove, true);
		document.removeEventListener('click', onClick, true);
		document.removeEventListener('keydown', onKeyDown, true);
		document.removeEventListener('scroll', onScroll, true);
		window.removeEventListener('resize', onScroll);

		if (toastTimeout) {
			clearTimeout(toastTimeout);
		}

		if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
		if (label.parentNode) label.parentNode.removeChild(label);
		if (toast.parentNode) toast.parentNode.removeChild(toast);

		currentElement = null;
		delete window.__roopikInspectCleanup;
	}

	// Store cleanup function
	window.__roopikInspectCleanup = cleanup;

	// ========== Initialize ==========

	// Add event listeners (capture phase to intercept before page handlers)
	document.addEventListener('mousemove', onMouseMove, true);
	document.addEventListener('click', onClick, true);
	document.addEventListener('keydown', onKeyDown, true);
	document.addEventListener('scroll', onScroll, true);
	window.addEventListener('resize', onScroll);

	return 'Inspect mode enabled';
})();
`;
