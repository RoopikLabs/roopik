/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Canvas Types
 *
 * Type definitions for Canvas entities (Mode 1: Component Canvas).
 * A Canvas is a workspace for building and organizing components.
 */

// ============================================================================
// Canvas Entity
// ============================================================================

/**
 * Canvas metadata stored on disk
 */
export interface CanvasMeta {
	/** Unique canvas ID (slug format: "login-components") */
	id: string;

	/** Display name ("Login Components") */
	name: string;

	/** Creation timestamp */
	createdAt: number;

	/** Last modified timestamp */
	updatedAt: number;

	/** Canvas description (optional) */
	description?: string;

	/** Canvas icon (codicon name, optional) */
	icon?: string;

	/** Canvas color theme (optional) */
	color?: string;

	/** Number of components in this canvas */
	componentCount: number;
}

/**
 * Full Canvas object with runtime state
 */
export interface Canvas extends CanvasMeta {
	/** Whether this canvas is currently open in a panel */
	isOpen: boolean;

	/** Whether this canvas is currently focused */
	isFocused: boolean;
}

// ============================================================================
// Canvas Operations
// ============================================================================

/**
 * Result of creating a canvas
 */
export interface CreateCanvasResult {
	/** The canvas ID */
	canvasId: string;

	/** Whether a new canvas was created (false = existing canvas returned) */
	isNew: boolean;

	/** The canvas metadata */
	canvas: CanvasMeta;
}

/**
 * Options for listing canvases
 */
export interface ListCanvasOptions {
	/** Sort by field */
	sortBy?: 'name' | 'createdAt' | 'updatedAt' | 'componentCount';

	/** Sort direction */
	sortDirection?: 'asc' | 'desc';

	/** Filter by name (partial match) */
	nameFilter?: string;
}

// ============================================================================
// Canvas Panel State
// ============================================================================

/**
 * State of a canvas panel (for tracking open/focused panels)
 */
export interface CanvasPanelState {
	/** Canvas ID */
	canvasId: string;

	/** Whether panel is visible */
	isVisible: boolean;

	/** Whether panel has focus */
	hasFocus: boolean;

	/** Last focus timestamp */
	lastFocusedAt: number;
}
