/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import type { IProjectModeService } from '../../../../common/projectMode/ipc.js';
import type { DragStartedMessage, DragEndedMessage } from '../../../../common/projectMode/types.js';
import type { ILogger } from '../../../../../../../platform/log/common/log.js';
import type { PendingMove, OnPendingMovesChangedCallback } from './types.js';
import { PendingChangesQueue } from './pendingChangesQueue.js';
import { CDPMoveService } from './cdpMoveService.js';

/**
 * DragDrop feature for element reordering in Project Mode
 *
 * Manages:
 * - Drag events from inject script
 * - CDP DOM operations for live preview
 * - Pending changes queue for undo/apply
 * - Callbacks for UI updates
 *
 * Usage in editor.ts:
 * ```
 * this.dragDrop = new DragDrop(this.browserService, this.logger);
 * this.dragDrop.setOnPendingMovesChanged((moves) => this.updateChangeBadge(moves.length));
 * // In message handler:
 * await this.dragDrop.handleDragEnded(message);
 * ```
 */
export class DragDrop {
	private readonly cdpService: CDPMoveService;
	private readonly pendingQueue: PendingChangesQueue;
	private onPendingMovesChangedCallback: OnPendingMovesChangedCallback | null = null;

	constructor(
		browserService: IProjectModeService,
		private readonly logger: ILogger
	) {
		this.cdpService = new CDPMoveService(browserService, logger);
		this.pendingQueue = new PendingChangesQueue();

		// Wire internal queue changes to external callback
		this.pendingQueue.setOnChanged((moves) => {
			this.onPendingMovesChangedCallback?.(moves);
		});
	}

	// ============================================
	// Event Handlers (called from editor.ts)
	// ============================================

	/**
	 * Handle drag started event
	 * Currently just logs - state is tracked in inject script
	 */
	handleDragStarted(message: DragStartedMessage): void {
		this.logger.info('[DragDrop] Drag started:', {
			selector: message.selector,
			tagName: message.tagName
		});
	}

	/**
	 * Handle drag ended event - main entry point for move operations
	 */
	async handleDragEnded(browserViewId: number, message: DragEndedMessage): Promise<void> {
		// No valid drop zone - nothing to do
		if (!message.hasDropZone || !message.dropZone) {
			this.logger.info('[DragDrop] Drop cancelled - no valid drop zone');
			return;
		}

		const { dropZone } = message;
		this.logger.info('[DragDrop] Processing drop:', {
			parentSelector: dropZone.parentSelector,
			index: dropZone.index,
			position: dropZone.position,
			siblingCount: dropZone.siblingCount
		});

		try {
			// 1. Get the currently selected element's info
			const elementSelector = await this.cdpService.getSelectedElementSelector(browserViewId);
			if (!elementSelector) {
				this.logger.error('[DragDrop] No element selected for drag');
				await this.showFeedback(browserViewId, false, 'No element selected');
				return;
			}

			// 2. Get source location for AST update later
			const sourceLocation = await this.cdpService.getSelectedElementSource(browserViewId);

			// 3. Get current position (for undo)
			const currentPosition = await this.cdpService.getElementPosition(browserViewId, elementSelector);
			if (!currentPosition) {
				this.logger.error('[DragDrop] Could not determine element current position');
				await this.showFeedback(browserViewId, false, 'Could not track element position');
				return;
			}

			this.logger.info('[DragDrop] Current position:', currentPosition);

			// 4. Execute the move via CDP
			const moveResult = await this.cdpService.moveElement(
				browserViewId,
				elementSelector,
				dropZone.parentSelector,
				dropZone.index
			);

			if (!moveResult.success) {
				this.logger.error('[DragDrop] Move failed:', moveResult.error);
				await this.showFeedback(browserViewId, false, moveResult.error || 'Move failed');
				return;
			}

			// 5. Get element tag name for display
			const tagName = dropZone.parentTagName || 'element';

			// 6. Add to pending changes queue (handles collapse and auto-remove)
			const pendingMove = this.pendingQueue.add({
				elementSelector,
				elementTagName: tagName,
				sourceLocation,
				fromParent: currentPosition.parentSelector,
				fromIndex: currentPosition.index,
				toParent: dropZone.parentSelector,
				toIndex: dropZone.index
			});

			// 7. Update selection overlay
			await this.cdpService.reselectElement(browserViewId);

			// 8. Show success feedback
			const pendingCount = this.pendingQueue.getPendingCount();

			if (pendingMove === null) {
				// Element moved back to original position - entry was auto-removed
				this.logger.info('[DragDrop] Move cancelled - element back to original position');
				await this.showFeedback(browserViewId, true, `Reverted (${pendingCount} pending)`);
			} else {
				this.logger.info('[DragDrop] Move tracked:', pendingMove.id);
				await this.showFeedback(browserViewId, true, `Element moved (${pendingCount} pending)`);
			}

		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.logger.error('[DragDrop] Error in handleDragEnded:', errorMessage);
			await this.showFeedback(browserViewId, false, `Error: ${errorMessage}`);
		}
	}

	// ============================================
	// Pending Changes Management
	// ============================================

	/**
	 * Get all pending moves
	 */
	getPendingMoves(): PendingMove[] {
		return this.pendingQueue.getPendingMoves();
	}

	/**
	 * Get count of pending moves
	 */
	getPendingCount(): number {
		return this.pendingQueue.getPendingCount();
	}

	/**
	 * Check if there are pending changes
	 */
	hasPendingChanges(): boolean {
		return this.pendingQueue.hasPendingChanges();
	}

	/**
	 * Undo a specific move by ID
	 *
	 * Uses source-based element lookup (data-roopik-source attribute) to find
	 * the element reliably, since CSS selectors change after DOM moves.
	 */
	async undoMove(browserViewId: number, moveId: string): Promise<boolean> {
		const move = this.pendingQueue.getMove(moveId);
		if (!move || move.status !== 'pending') {
			this.logger.warn('[DragDrop] Cannot undo move:', moveId);
			return false;
		}

		// Execute undo via CDP using source-based lookup
		// This uses data-roopik-source attribute to find the element reliably
		const result = await this.cdpService.undoMoveWithSource(browserViewId, move);

		if (!result.success) {
			this.logger.error('[DragDrop] Undo failed:', result.error);
			await this.showFeedback(browserViewId, false, `Undo failed: ${result.error}`);
			return false;
		}

		// Mark as undone in queue
		this.pendingQueue.markUndone(moveId);

		// Update overlays
		await this.cdpService.reselectElement(browserViewId);

		const pendingCount = this.pendingQueue.getPendingCount();
		await this.showFeedback(browserViewId, true, `Undone (${pendingCount} pending)`);

		return true;
	}

	/**
	 * Undo the last move (LIFO)
	 */
	async undoLastMove(browserViewId: number): Promise<boolean> {
		const moves = this.pendingQueue.getPendingMoves();
		if (moves.length === 0) {
			this.logger.info('[DragDrop] No moves to undo');
			return false;
		}

		// Get last pending move
		const lastMove = moves[moves.length - 1];
		return this.undoMove(browserViewId, lastMove.id);
	}

	/**
	 * Clear all pending changes (discard)
	 * Does NOT undo DOM changes - just clears the queue
	 */
	clearPendingChanges(): void {
		this.pendingQueue.clear();
		this.logger.info('[DragDrop] Pending changes cleared');
	}

	/**
	 * Get summary text for UI
	 */
	getSummary(): string {
		return this.pendingQueue.getSummary();
	}

	// ============================================
	// Callbacks
	// ============================================

	/**
	 * Set callback for when pending moves change
	 */
	setOnPendingMovesChanged(callback: OnPendingMovesChangedCallback | null): void {
		this.onPendingMovesChangedCallback = callback;
	}

	// ============================================
	// Internal Helpers
	// ============================================

	/**
	 * Show feedback toast in browser
	 */
	private async showFeedback(browserViewId: number, success: boolean, message: string): Promise<void> {
		const emoji = success ? '\u2705' : '\u274C'; // ✅ or ❌
		const fullMessage = `${emoji} ${message}`;
		try {
			await this.cdpService.showToast(browserViewId, fullMessage);
		} catch {
			// Ignore toast errors
		}
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		this.pendingQueue.clear();
		this.onPendingMovesChangedCallback = null;
	}
}
