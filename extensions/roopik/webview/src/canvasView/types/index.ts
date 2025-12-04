/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

// ============================================================
// Canvas Types
// ============================================================

/**
 * Canvas transform state for pan and zoom.
 */
export interface Transform {
	x: number;
	y: number;
	scale: number;
}

/**
 * Background pattern types for the infinite canvas.
 */
export type BackgroundPattern = 'grid' | 'dots' | 'plain';

// ============================================================
// Sandbox Types
// ============================================================

/**
 * Message sent to sandbox iframe for initialization or updates.
 */
export interface SandboxMessage {
	type: 'init' | 'update';
	code: string;
	cdnUrls?: string[];
}

/**
 * Sandbox represents a live, interactive preview environment (iframe).
 * Mode 1: Client-side transpilation with Babel.
 */
export interface Sandbox {
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
	zIndex: number;
	sandboxMessage: SandboxMessage;
}

// ============================================================
// Canvas State Types
// ============================================================

/**
 * Complete canvas state including all sandboxes and viewport.
 */
export interface CanvasState {
	id: string;
	name: string;
	sandboxes: Sandbox[];
	selectedSandboxId: string | null;
	viewport: Transform;
	createdAt: number;
	updatedAt: number;
}
