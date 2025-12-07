/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

// ============================================================
// Pipeline Types (Mirrors Core's sandboxPipeline/types.ts)
// ============================================================

export type Framework = 'react' | 'vue' | 'svelte' | 'solid' | 'preact' | 'html';
export type ComponentSource = 'ai' | 'user' | 'upload' | 'import' | 'sample';
export type JobPriority = 'high' | 'normal' | 'low';

/**
 * Input to the Core build pipeline
 */
export interface ComponentInput {
	id: string;
	source: ComponentSource;
	framework?: Framework;
	files: { [filename: string]: string };
	entryFile?: string;
	priority?: JobPriority;
	dependencies?: Record<string, string>;
}

/**
 * Output from the Core build pipeline
 */
export interface TransformedComponent {
	id: string;
	framework: Framework;
	bundledCode: string;
	cdnUrls: string[];
	metadata: {
		size: number;
		transformTime: number;
	};
}

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

import type { DevicePreset } from './device';

/**
 * Build status for a sandbox
 */
export type SandboxBuildStatus = 'pending' | 'building' | 'ready' | 'error';

/**
 * Sandbox represents a live, interactive preview environment (iframe)
 *
 * All components are built via Core's ESBuild pipeline.
 * The bundledCode is pre-built ESM ready for execution in the iframe.
 *
 * Note: width/height are NOT stored per-sandbox - all sandboxes use
 * DEFAULT_CONFIG.sandboxWidth/Height from gridManager.ts for consistency.
 * This keeps storage lean (only x, y, zIndex for position).
 */
export interface Sandbox {
	id: string;
	x: number;
	y: number;
	zIndex: number;

	/** Build status */
	buildStatus: SandboxBuildStatus;

	/** Error message if build failed */
	buildError?: string;

	/** Pre-built ESM from Core's ESBuild pipeline */
	bundledCode?: string;

	/** CDN URLs used in the bundle */
	cdnUrls?: string[];

	/** Original ComponentInput (for rebuild/persistence) */
	componentInput: ComponentInput;

	/** Per-sandbox device mode override (undefined = use global) */
	deviceMode?: DevicePreset;
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
 * Canvas positioning mode
 * - grid: Strict grid positioning, no overlap allowed, auto-snap to grid slots
 * - free: Free positioning, overlap allowed with visual indicator, optional snap
 */
export type SnapMode = 'grid' | 'free';

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
 * Note: The authoritative GridConfig and DEFAULT_CONFIG are in gridManager.ts
 * Import from there: import { DEFAULT_CONFIG, GridConfig } from '../services/gridManager';
 */

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
	/** Background color hex value */
	backgroundColor?: string;
	/** Background pattern type */
	backgroundPattern?: BackgroundPattern;
	createdAt: number;
	updatedAt: number;
}

// ============================================================
// Message Types
// ============================================================

/**
 * Canvas preferences (matches Core's storageTypes.ts)
 */
export interface CanvasPreferences {
	backgroundColor: string;
	backgroundPattern: BackgroundPattern;
	viewport: Transform;
}

/**
 * Sandbox position on canvas (matches Core's storageTypes.ts SandboxPosition)
 */
export interface SandboxPosition {
	x: number;
	y: number;
	zIndex: number;
}

/**
 * Map of component IDs to their sandbox positions
 */
export type SandboxPositions = Record<string, SandboxPosition>;

/**
 * Message types from Extension to Webview
 */
export type ExtensionMessage =
	// Core pipeline responses
	| { type: 'componentCreated'; payload: { componentId: string; canvasId: string } }
	| { type: 'componentBuilt'; payload: { componentId: string; result: TransformedComponent } }
	| { type: 'componentError'; payload: { componentId: string; error: string } }
	// Canvas state
	| { type: 'canvasLoaded'; payload: { state: CanvasState } }
	| { type: 'canvasSaved'; payload: { success: boolean } }
	| { type: 'themeChanged'; payload: { theme: 'light' | 'dark' | 'high-contrast' } }
	// Canvas preferences loaded from file (includes sandbox positions for restoration)
	| { type: 'canvasPreferencesLoaded'; payload: { preferences: CanvasPreferences; sandboxPositions?: SandboxPositions } }
	// Import
	| { type: 'addImportedComponent'; payload: { componentInput: ComponentInput; position?: { x: number; y: number }; replaceExisting?: boolean; replaceName?: string } };

/**
 * Message types from Webview to Extension
 */
export type WebviewMessage =
	| { type: 'ready' }
	// Core pipeline request
	| { type: 'buildComponent'; payload: { componentId: string; input: ComponentInput } }
	// Canvas state
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

// ============================================================
// Re-export Device Types
// ============================================================
export * from './device';
