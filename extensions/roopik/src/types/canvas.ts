/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Canvas Types
 *
 * These types mirror the Core's canvas types.
 * They are used for type-safe communication between Extension and Core.
 */

/**
 * Canvas metadata (lightweight, for listings)
 */
export interface CanvasMeta {
	/** Unique canvas ID (slug, persistent across renames) */
	id: string;

	/** Display name */
	name: string;

	/** Component count */
	componentCount: number;

	/** Creation timestamp */
	createdAt: number;

	/** Last update timestamp */
	updatedAt: number;

	/** Optional description */
	description?: string;

	/** Optional icon */
	icon?: string;

	/** Optional color */
	color?: string;
}

/**
 * Full canvas data (includes component IDs)
 */
export interface Canvas extends CanvasMeta {
	/** Component IDs in this canvas */
	componentIds: string[];
}

/**
 * Result of creating a canvas
 */
export interface CreateCanvasResult {
	/** Canvas ID (newly generated or existing) */
	canvasId: string;

	/** Whether this is a new canvas (false if reusing existing) */
	isNew: boolean;

	/** Canvas metadata */
	canvas: CanvasMeta;
}

/**
 * Options for listing canvases
 */
export interface ListCanvasOptions {
	/** Sort by field */
	sortBy?: 'name' | 'createdAt' | 'updatedAt';

	/** Sort order */
	sortOrder?: 'asc' | 'desc';

	/** Filter by name (partial match) */
	nameFilter?: string;
}

/**
 * Canvas panel state (for tracking open panels)
 */
export interface CanvasPanelState {
	canvasId: string;
	isOpen: boolean;
	isFocused: boolean;
	openedAt: number;
}
