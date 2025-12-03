/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Sandbox represents a live, interactive preview environment (iframe)
 * Mode 1: Client-side transpilation with Babel
 */
export interface Sandbox {
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
	zIndex: number;
	sandboxMessage: {
		type: 'init' | 'update';
		code: string;
		cdnUrls?: string[];
	};
}

/**
 * Canvas viewport transform
 */
export interface Transform {
	x: number;
	y: number;
	scale: number;
}

/**
 * Canvas positioning mode
 * - grid: Strict grid positioning, no overlap allowed, auto-snap to grid slots
 * - free: Free positioning, overlap allowed with visual indicator, optional snap
 */
export type SnapMode = 'grid' | 'free';

/**
 * Background pattern type
 */
export type BackgroundPattern = 'grid' | 'dots' | 'plain';

/**
 * Canvas state for persistence
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

/**
 * Point in 2D space
 */
export interface Point {
	x: number;
	y: number;
}

/**
 * Rectangle bounds
 */
export interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

/**
 * Snap result from GridManager
 */
export interface SnapResult {
	x: number;
	y: number;
	snappedX: boolean;
	snappedY: boolean;
	isOverlapping: boolean;
	blockedByGrid: boolean;
}

/**
 * Grid layout configuration
 */
export interface GridConfig {
	columns: number;
	sandboxWidth: number;
	sandboxHeight: number;
	gapX: number;
	gapY: number;
	startX: number;
	startY: number;
	containerPaddingX: number;
	containerPaddingY: number;
	containerMargin: number;
}

/**
 * Default grid configuration - 4 columns, 500x500 sandboxes
 */
export const DEFAULT_GRID_CONFIG: GridConfig = {
	columns: 4,
	sandboxWidth: 500,
	sandboxHeight: 500,
	gapX: 60,
	gapY: 60,
	startX: 100,
	startY: 100,
	containerPaddingX: 120,
	containerPaddingY: 40,
	containerMargin: 20
};

/**
 * Canvas viewport for zoom/pan calculations
 */
export interface CanvasViewport {
	x: number;
	y: number;
	scale: number;
}

/**
 * Grid position
 */
export interface GridPosition {
	x: number;
	y: number;
}

/**
 * Overlap detection result
 */
export interface OverlapInfo {
	isOverlapping: boolean;
	overlappingWith: string[];
	overlapPercent: number;
}

/**
 * Message types from Extension to Webview
 */
export type ExtensionMessage =
	| { type: 'transformComplete'; payload: { componentId: string; html: string } }
	| { type: 'transformError'; payload: { componentId: string; error: string } }
	| { type: 'canvasLoaded'; payload: { state: CanvasState } }
	| { type: 'canvasSaved'; payload: { success: boolean } }
	| { type: 'themeChanged'; payload: { theme: 'light' | 'dark' | 'high-contrast' } };

/**
 * Message types from Webview to Extension
 */
export type WebviewMessage =
	| { type: 'ready' }
	| { type: 'transformCode'; payload: { code: string; componentId: string; options?: Record<string, unknown> } }
	| { type: 'saveCanvas'; payload: { canvasId: string; state: CanvasState } }
	| { type: 'loadCanvas'; payload: { canvasId: string } }
	| { type: 'openFile'; payload: { filePath: string; line?: number; column?: number } }
	| { type: 'log'; payload: { level: 'debug' | 'info' | 'warn' | 'error'; message: string; data?: unknown } };

/**
 * VSCode API interface
 */
export interface VSCodeAPI {
	postMessage(message: WebviewMessage): void;
	getState(): CanvasState | undefined;
	setState(state: CanvasState): void;
}

declare global {
	function acquireVsCodeApi(): VSCodeAPI;
}
