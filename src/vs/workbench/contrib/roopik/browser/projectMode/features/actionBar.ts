/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { ILogger } from '../../../../../../platform/log/common/log.js';
import { ServiceBridge } from '../serviceBridge.js';
import { generateBottomActionBarHtml, getActionBarOverlayBounds, ActionBarMode, BottomActionBarState } from '../components/bottomActionBar.js';
import type { ViewBounds } from '../../../common/projectMode/types.js';

/**
 * Action Bar Feature
 *
 * Manages the bottom action bar overlay (WebContentsView).
 * Fixed size overlay (220×50) with hover-expand behavior.
 */
export class ActionBar {
	private viewId: number | undefined;
	private state: BottomActionBarState = {
		activeMode: 'select',
		position: 'bottom'
	};

	constructor(
		private readonly browserService: ServiceBridge,
		private readonly logger: ILogger
	) {}

	/**
	 * Get current active mode
	 */
	get activeMode(): ActionBarMode {
		return this.state.activeMode;
	}

	/**
	 * Set active mode
	 */
	set activeMode(mode: ActionBarMode) {
		this.state.activeMode = mode;
	}

	/**
	 * Check if action bar exists
	 */
	get exists(): boolean {
		return this.viewId !== undefined;
	}

	/**
	 * Get the action bar's WebContentsView ID
	 */
	get actionBarViewId(): number | undefined {
		return this.viewId;
	}

	/**
	 * Create bottom action bar overlay
	 */
	async create(browserViewId: number, browserBounds: ViewBounds): Promise<void> {
		// Don't create if already exists
		if (this.viewId) {
			return;
		}

		try {
			// Calculate overlay bounds (fixed size, centered at bottom)
			const bounds = getActionBarOverlayBounds(browserBounds, this.state.position);

			// Generate HTML content
			const htmlContent = generateBottomActionBarHtml(this.state);

			// Create overlay view
			this.viewId = await this.browserService.createOverlayView(
				browserViewId,
				bounds,
				htmlContent
			);

			this.logger.info('[ActionBar] Created', { bounds });
		} catch (error) {
			this.logger.error('[ActionBar] Failed to create:', error);
		}
	}

	/**
	 * Show the action bar
	 */
	async show(): Promise<void> {
		if (this.viewId) {
			await this.browserService.setOverlayVisible(this.viewId, true);
		}
	}

	/**
	 * Hide the action bar
	 */
	async hide(): Promise<void> {
		if (this.viewId) {
			await this.browserService.setOverlayVisible(this.viewId, false);
		}
	}

	/**
	 * Update bounds when browser resizes
	 */
	async updateBounds(browserBounds: ViewBounds): Promise<void> {
		if (!this.viewId) {
			return;
		}

		const bounds = getActionBarOverlayBounds(browserBounds, this.state.position);
		await this.browserService.setOverlayBounds(this.viewId, bounds);
	}

	/**
	 * Destroy the action bar
	 */
	async destroy(): Promise<void> {
		if (this.viewId) {
			await this.browserService.destroyOverlayView(this.viewId);
			this.viewId = undefined;
		}
	}
}
