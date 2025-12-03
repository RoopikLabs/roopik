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
 * Snap mode for component placement
 * - free: No snapping, drag anywhere
 * - grid: Snaps to fixed 20px grid
 * - smart: Snaps to other components' edges (Figma-like alignment)
 */
export type SnapMode = 'free' | 'grid' | 'smart';

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
	point: Point;
	snapLines: {
		vertical: number | null;
		horizontal: number | null;
	};
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
