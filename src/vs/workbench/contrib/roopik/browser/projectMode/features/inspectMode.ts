/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { IClipboardService } from '../../../../../../platform/clipboard/common/clipboardService.js';
import type { IProjectModeService } from '../../../common/projectMode/ipc.js';
import { INSPECT_MODE_SCRIPT } from '../scripts/inspectModeScript.js';

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
 * - Grab cursor on selected element (for future drag support)
 * - Chat icon on selected element (for AI editing)
 * - Reads data-roopik-source for source location
 * - Stores selector for style panel to use
 * - ESC exits inspect mode
 *
 * Data stored in window for panel to read:
 * - __roopikInspectResult: Full element info (HTML, source, selector, etc.)
 *
 * Script is modularized in: ../scripts/inspectModeScript.ts
 */
export class InspectMode {
	// Track inspect mode state per browserViewId (multi-tab safe)
	private activeInViews = new Set<number>();

	constructor(
		private readonly browserService: IProjectModeService,
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

		this.activeInViews.add(browserViewId);

		try {
			await this.browserService.executeScript(browserViewId, INSPECT_MODE_SCRIPT);

			// Focus the browser view so ESC key events are received
			await this.browserService.focusBrowserView(browserViewId);
		} catch {
			this.activeInViews.delete(browserViewId);
		}
	}

	/**
	 * Disable Inspect Mode
	 */
	async disable(browserViewId: number): Promise<void> {
		if (!browserViewId) {
			return;
		}

		this.activeInViews.delete(browserViewId);

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
	 * Check if inspect mode is active for a specific browser view.
	 * Pass browserViewId to check per-tab; omit for backwards-compat (any active).
	 */
	getIsActive(browserViewId?: number): boolean {
		if (browserViewId !== undefined) {
			return this.activeInViews.has(browserViewId);
		}
		return this.activeInViews.size > 0;
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
