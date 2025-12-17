/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Source location from data-roopik-source attribute
 */
export interface SourceLocation {
	file: string;
	line: number;
	column?: number;
	endLine?: number;
	endColumn?: number;
}

/**
 * Current drag state in the browser
 */
export interface DragState {
	isDragging: boolean;
	draggedSelector: string | null;
	dragStartPosition: { x: number; y: number } | null;
}

/**
 * Drop zone information from inject script
 */
export interface DropZone {
	parentSelector: string;
	parentTagName: string;
	index: number;
	position: 'before' | 'after' | 'inside';
	siblingCount: number;
}

/**
 * Status of a pending move
 */
export type PendingMoveStatus = 'pending' | 'applied' | 'undone';

/**
 * A pending move in the changes queue
 * Tracks all info needed to undo/redo/apply the move
 */
export interface PendingMove {
	/** Unique identifier for this move */
	id: string;

	/** CSS selector of the moved element */
	elementSelector: string;

	/** Tag name of the moved element (e.g., 'div', 'button') */
	elementTagName: string;

	/** Source location from data-roopik-source (for AST update) */
	sourceLocation: SourceLocation | null;

	/** Original parent selector (for undo) */
	fromParent: string;

	/** Original index among siblings (for undo) */
	fromIndex: number;

	/** New parent selector */
	toParent: string;

	/** New index among siblings */
	toIndex: number;

	/** When the move was performed */
	timestamp: number;

	/** Current status */
	status: PendingMoveStatus;
}

/**
 * Callback for pending moves changes
 */
export type OnPendingMovesChangedCallback = (moves: PendingMove[]) => void;

/**
 * Result of a CDP move operation
 */
export interface MoveResult {
	success: boolean;
	newNodeId?: number;
	error?: string;
}

/**
 * Debug info from reference node calculation
 */
export interface ReferenceNodeDebug {
	validCount: number;
	siblingsCount: number;
	selectedInSameParent: boolean;
	selectedIndexInValid: number;
	targetIndex: number;
	refIndexInAll?: number;
	action: string;
	selector?: string;
}

/**
 * Result of finding reference node for insertBefore
 */
export interface ReferenceNodeResult {
	insertBefore?: null;
	insertBeforeSelector?: string;
	error?: string;
	debug?: string;
}
