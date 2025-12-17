/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import type { PendingMove, OnPendingMovesChangedCallback, SourceLocation } from './types.js';

/**
 * Generates a unique ID for pending moves
 */
function generateMoveId(): string {
	return `move_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Manages the queue of pending DOM moves
 *
 * Features:
 * - LIFO undo (last move undone first)
 * - Per-move undo/apply
 * - Observable changes via callback
 * - Clear all functionality
 */
export class PendingChangesQueue {
	private moves: PendingMove[] = [];
	private onChangedCallback: OnPendingMovesChangedCallback | null = null;

	/**
	 * Add a new pending move to the queue
	 */
	add(params: {
		elementSelector: string;
		elementTagName: string;
		sourceLocation: SourceLocation | null;
		fromParent: string;
		fromIndex: number;
		toParent: string;
		toIndex: number;
	}): PendingMove {
		const move: PendingMove = {
			id: generateMoveId(),
			elementSelector: params.elementSelector,
			elementTagName: params.elementTagName,
			sourceLocation: params.sourceLocation,
			fromParent: params.fromParent,
			fromIndex: params.fromIndex,
			toParent: params.toParent,
			toIndex: params.toIndex,
			timestamp: Date.now(),
			status: 'pending'
		};

		this.moves.push(move);
		this.notifyChanged();

		return move;
	}

	/**
	 * Get all pending moves (not undone)
	 */
	getPendingMoves(): PendingMove[] {
		return this.moves.filter(m => m.status === 'pending');
	}

	/**
	 * Get all moves (including undone for redo)
	 */
	getAllMoves(): PendingMove[] {
		return [...this.moves];
	}

	/**
	 * Get count of pending moves
	 */
	getPendingCount(): number {
		return this.moves.filter(m => m.status === 'pending').length;
	}

	/**
	 * Get a move by ID
	 */
	getMove(id: string): PendingMove | undefined {
		return this.moves.find(m => m.id === id);
	}

	/**
	 * Mark a move as undone
	 * Returns the move info needed to reverse the DOM change
	 */
	markUndone(id: string): PendingMove | undefined {
		const move = this.moves.find(m => m.id === id);
		if (move && move.status === 'pending') {
			move.status = 'undone';
			this.notifyChanged();
			return move;
		}
		return undefined;
	}

	/**
	 * Undo the last pending move (LIFO)
	 * Returns the move info needed to reverse the DOM change
	 */
	undoLast(): PendingMove | undefined {
		// Find last pending move
		for (let i = this.moves.length - 1; i >= 0; i--) {
			if (this.moves[i].status === 'pending') {
				this.moves[i].status = 'undone';
				this.notifyChanged();
				return this.moves[i];
			}
		}
		return undefined;
	}

	/**
	 * Redo the last undone move (LIFO)
	 * Returns the move info needed to re-apply the DOM change
	 */
	redoLast(): PendingMove | undefined {
		// Find last undone move
		for (let i = this.moves.length - 1; i >= 0; i--) {
			if (this.moves[i].status === 'undone') {
				this.moves[i].status = 'pending';
				this.notifyChanged();
				return this.moves[i];
			}
		}
		return undefined;
	}

	/**
	 * Mark a move as applied (saved to source)
	 */
	markApplied(id: string): void {
		const move = this.moves.find(m => m.id === id);
		if (move) {
			move.status = 'applied';
			this.notifyChanged();
		}
	}

	/**
	 * Apply all pending moves
	 * Returns moves that were marked as applied
	 */
	markAllApplied(): PendingMove[] {
		const pendingMoves = this.moves.filter(m => m.status === 'pending');
		pendingMoves.forEach(m => {
			m.status = 'applied';
		});
		this.notifyChanged();
		return pendingMoves;
	}

	/**
	 * Remove applied moves from the queue
	 * Call after successfully saving to source
	 */
	clearApplied(): void {
		this.moves = this.moves.filter(m => m.status !== 'applied');
		this.notifyChanged();
	}

	/**
	 * Clear all moves (discard all changes)
	 */
	clear(): void {
		this.moves = [];
		this.notifyChanged();
	}

	/**
	 * Check if there are any pending changes
	 */
	hasPendingChanges(): boolean {
		return this.moves.some(m => m.status === 'pending');
	}

	/**
	 * Set callback for when moves change
	 */
	setOnChanged(callback: OnPendingMovesChangedCallback | null): void {
		this.onChangedCallback = callback;
	}

	/**
	 * Notify callback of changes
	 */
	private notifyChanged(): void {
		if (this.onChangedCallback) {
			this.onChangedCallback(this.getPendingMoves());
		}
	}

	/**
	 * Get summary text for display
	 */
	getSummary(): string {
		const count = this.getPendingCount();
		if (count === 0) {
			return 'No pending changes';
		}
		return `${count} pending change${count === 1 ? '' : 's'}`;
	}
}
