/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { INotificationService, Severity } from '../../../../../../platform/notification/common/notification.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { URI } from '../../../../../../base/common/uri.js';
import type { IProjectModeService } from '../../../common/projectMode/ipc.js';
import type { CSSSourceLocation, ElementStyleInfo, GetElementStylesResult } from '../../../common/cssResolvers/types.js';
import { StyleInspectPanel, IStyleInspectPanelCallbacks } from '../components/styleInspectPanel.js';

/**
 * Style Inspect Feature
 *
 * Integrates inspect mode with CSS source resolution.
 * Flow:
 * 1. User enables style inspect mode
 * 2. User clicks element in browser
 * 3. We call getElementStyles via IPC
 * 4. Style panel shows element info and CSS sources
 * 5. User can click file links to open in editor
 *
 * This replaces the basic inspect mode when style inspection is needed.
 */
export class StyleInspect {
	private panel: StyleInspectPanel | null = null;
	private isActive: boolean = false;
	private currentProjectRoot: string | undefined;
	private onVisibilityChangedCallback: ((visible: boolean, panelWidth: number) => void) | undefined;

	constructor(
		private readonly browserService: IProjectModeService,
		private readonly notificationService: INotificationService,
		private readonly editorService: IEditorService
	) {}

	/**
	 * Set callback for when panel visibility changes
	 * Used by editor to adjust browser bounds
	 */
	setOnVisibilityChanged(callback: (visible: boolean, panelWidth: number) => void): void {
		this.onVisibilityChangedCallback = callback;
	}

	/**
	 * Initialize the style panel in a container
	 */
	initialize(container: HTMLElement): void {
		if (this.panel) {
			return;
		}

		const callbacks: IStyleInspectPanelCallbacks = {
			onOpenFile: (location) => this.openFile(location),
			onEditStyle: (prop, newValue) => this.editStyle(prop, newValue),
			onClose: () => this.onPanelClosed(),
			onVisibilityChanged: (visible, panelWidth) => {
				this.onVisibilityChangedCallback?.(visible, panelWidth);
			}
		};

		this.panel = new StyleInspectPanel(container, callbacks);
	}

	/**
	 * Set the current project root (for path resolution)
	 */
	setProjectRoot(projectRoot: string): void {
		this.currentProjectRoot = projectRoot;
	}

	/**
	 * Enable Style Inspect Mode
	 * Injects script that calls back when element is clicked
	 */
	async enable(browserViewId: number): Promise<void> {
		if (!browserViewId) {
			return;
		}

		this.isActive = true;

		try {
			// Inject style inspect script
			await this.browserService.executeScript(browserViewId, STYLE_INSPECT_SCRIPT);

			this.notificationService.notify({
				severity: Severity.Info,
				message: 'Style Inspect: Click element to view CSS sources.',
				sticky: false
			});
		} catch (error) {
			console.error('[StyleInspect] Failed to enable:', error);
			this.isActive = false;
		}
	}

	/**
	 * Disable Style Inspect Mode
	 */
	async disable(browserViewId: number): Promise<void> {
		if (!browserViewId) {
			return;
		}

		this.isActive = false;

		try {
			await this.browserService.executeScript(browserViewId, `
				if (window.__roopikStyleInspectCleanup) {
					window.__roopikStyleInspectCleanup();
				}
			`);
		} catch {
			// Silent fail
		}
	}

	/**
	 * Check if style inspect is active
	 */
	getIsActive(): boolean {
		return this.isActive;
	}

	/**
	 * Handle element selection from browser
	 * Called when user clicks element in style inspect mode
	 */
	async handleElementSelected(
		browserViewId: number,
		selector: string
	): Promise<void> {
		if (!this.panel || !this.currentProjectRoot) {
			console.warn('[StyleInspect] Panel or projectRoot not initialized');
			return;
		}

		try {
			// Get element styles via IPC
			const result: GetElementStylesResult = await this.browserService.getElementStyles({
				browserViewId,
				target: selector,
				projectRoot: this.currentProjectRoot
			});

			if (result.success && result.data) {
				this.showStylePanel(result.data);
			} else {
				this.notificationService.notify({
					severity: Severity.Warning,
					message: `Could not get styles: ${result.error || 'Unknown error'}`,
					sticky: false
				});
			}
		} catch (error) {
			console.error('[StyleInspect] Failed to get element styles:', error);
			this.notificationService.notify({
				severity: Severity.Error,
				message: 'Failed to inspect element styles',
				sticky: false
			});
		}
	}

	/**
	 * Handle element selection by coordinates
	 */
	async handleElementSelectedByPoint(
		browserViewId: number,
		x: number,
		y: number
	): Promise<void> {
		if (!this.panel || !this.currentProjectRoot) {
			console.warn('[StyleInspect] Panel or projectRoot not initialized');
			return;
		}

		try {
			// Get element styles via IPC using coordinates
			const result: GetElementStylesResult = await this.browserService.getElementStyles({
				browserViewId,
				target: { x, y },
				projectRoot: this.currentProjectRoot
			});

			if (result.success && result.data) {
				this.showStylePanel(result.data);
			} else {
				this.notificationService.notify({
					severity: Severity.Warning,
					message: `Could not get styles: ${result.error || 'Unknown error'}`,
					sticky: false
				});
			}
		} catch (error) {
			console.error('[StyleInspect] Failed to get element styles:', error);
		}
	}

	/**
	 * Show the style panel with element info
	 */
	private showStylePanel(data: ElementStyleInfo): void {
		if (this.panel) {
			this.panel.show(data);
		}
	}

	/**
	 * Hide the style panel
	 */
	hidePanel(): void {
		if (this.panel) {
			this.panel.hide();
		}
	}

	/**
	 * Check if panel is visible
	 */
	isPanelVisible(): boolean {
		return this.panel?.getIsVisible() ?? false;
	}

	/**
	 * Open a file at the specified location
	 */
	private async openFile(location: CSSSourceLocation): Promise<void> {
		try {
			const uri = URI.file(location.file);

			await this.editorService.openEditor({
				resource: uri,
				options: {
					selection: {
						startLineNumber: location.line,
						startColumn: location.column + 1, // VSCode is 1-indexed
						endLineNumber: location.endLine || location.line,
						endColumn: (location.endColumn || location.column) + 1
					},
					pinned: false,
					preserveFocus: false
				}
			});
		} catch (error) {
			console.error('[StyleInspect] Failed to open file:', error);
			this.notificationService.notify({
				severity: Severity.Error,
				message: `Could not open file: ${location.file}`,
				sticky: false
			});
		}
	}

	/**
	 * Edit a style value (placeholder - would need live CSS editing support)
	 */
	private editStyle(prop: any, newValue: string): void {
		// TODO: Implement live CSS editing
		// This would require:
		// 1. CDP CSS.setStyleTexts to update live
		// 2. File editing to persist changes
		console.log('[StyleInspect] Edit style:', prop.name, '=', newValue);
		this.notificationService.notify({
			severity: Severity.Info,
			message: 'Live CSS editing coming soon!',
			sticky: false
		});
	}

	/**
	 * Handle panel closed
	 */
	private onPanelClosed(): void {
		// Panel was closed, could disable inspect mode here if needed
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		if (this.panel) {
			this.panel.dispose();
			this.panel = null;
		}
	}
}

// ============================================
// Style Inspect Script (injected into browser)
// ============================================

/**
 * JavaScript to inject into the browser for style inspection.
 * Similar to regular inspect mode but focused on CSS.
 */
const STYLE_INSPECT_SCRIPT = `
(function() {
	'use strict';

	// Cleanup any existing inspect mode
	if (window.__roopikStyleInspectCleanup) {
		window.__roopikStyleInspectCleanup();
	}

	// ========== Create UI Elements ==========

	// Highlight overlay
	const overlay = document.createElement('div');
	overlay.id = '__roopik_style_inspect_overlay';
	overlay.style.cssText = [
		'position: fixed',
		'pointer-events: none',
		'z-index: 2147483647',
		'border: 2px solid #9333EA',
		'background-color: rgba(147, 51, 234, 0.1)',
		'transition: all 0.05s ease-out',
		'display: none'
	].join(';');
	document.body.appendChild(overlay);

	// Element label
	const label = document.createElement('div');
	label.id = '__roopik_style_inspect_label';
	label.style.cssText = [
		'position: fixed',
		'pointer-events: none',
		'z-index: 2147483647',
		'background-color: #9333EA',
		'color: white',
		'font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
		'font-size: 11px',
		'padding: 2px 6px',
		'border-radius: 2px',
		'white-space: nowrap',
		'display: none'
	].join(';');
	document.body.appendChild(label);

	let currentElement = null;

	// ========== Helper Functions ==========

	function getElementSelector(el) {
		if (!el || el === document.body || el === document.documentElement) {
			return null;
		}

		// Build a full path selector to ensure uniqueness
		var parts = [];
		var current = el;

		while (current && current !== document.body && current !== document.documentElement) {
			var selector = current.tagName.toLowerCase();

			// If element has an ID, use it and stop (IDs are unique)
			if (current.id) {
				parts.unshift('#' + CSS.escape(current.id));
				break;
			}

			// Add classes
			if (current.className && typeof current.className === 'string') {
				var classes = current.className.trim().split(/\\s+/).filter(function(c) { return c; });
				if (classes.length > 0) {
					selector += '.' + classes.map(function(c) { return CSS.escape(c); }).join('.');
				}
			}

			// Add nth-of-type for uniqueness among siblings
			var parent = current.parentElement;
			if (parent) {
				var siblings = Array.from(parent.children).filter(function(s) {
					return s.tagName === current.tagName;
				});
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

		// Position label
		label.style.display = 'block';
		label.textContent = el.tagName.toLowerCase() + (el.className ? '.' + el.className.split(' ')[0] : '');
		const labelHeight = 20;
		if (rect.top > labelHeight + 4) {
			label.style.top = (rect.top - labelHeight - 4) + 'px';
		} else {
			label.style.top = (rect.bottom + 4) + 'px';
		}
		label.style.left = Math.max(0, rect.left) + 'px';
	}

	// ========== Event Handlers ==========

	function onMouseMove(e) {
		const el = document.elementFromPoint(e.clientX, e.clientY);
		if (el && el.id && el.id.startsWith('__roopik_style_inspect')) {
			return;
		}
		if (el && el !== overlay && el !== label && el !== currentElement) {
			currentElement = el;
			updateOverlay(el);
		}
	}

	function onClick(e) {
		e.preventDefault();
		e.stopPropagation();
		e.stopImmediatePropagation();

		if (currentElement && !(currentElement.id && currentElement.id.startsWith('__roopik_style_inspect'))) {
			// Get selector for the element
			const selector = getElementSelector(currentElement);

			// Store for API access
			window.__roopikStyleInspectResult = {
				selector: selector,
				x: e.clientX,
				y: e.clientY,
				tagName: currentElement.tagName.toLowerCase(),
				className: currentElement.className || '',
				id: currentElement.id || ''
			};

			// Visual feedback
			overlay.style.backgroundColor = 'rgba(147, 51, 234, 0.3)';
			overlay.style.borderColor = '#7C3AED';

			setTimeout(function() {
				cleanup();
			}, 150);
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

		if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
		if (label.parentNode) label.parentNode.removeChild(label);

		currentElement = null;
		delete window.__roopikStyleInspectCleanup;
	}

	// Store cleanup function
	window.__roopikStyleInspectCleanup = cleanup;

	// ========== Initialize ==========

	document.addEventListener('mousemove', onMouseMove, true);
	document.addEventListener('click', onClick, true);
	document.addEventListener('keydown', onKeyDown, true);
	document.addEventListener('scroll', onScroll, true);
	window.addEventListener('resize', onScroll);

	return 'Style inspect mode enabled';
})();
`;
