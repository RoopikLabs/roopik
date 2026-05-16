/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Canvas Module - Public API
 *
 * Re-exports all public types and interfaces for the canvas system.
 */

// Types (type-only re-exports — must use `export type` to avoid runtime import of empty module)
export type {
	CanvasMeta,
	Canvas,
	CreateCanvasResult,
	ListCanvasOptions,
	CanvasPanelState
} from './types.js';

// Service Decorator (runtime value via createDecorator)
export { ICanvasService } from './canvasService.js';

// Event interfaces (type-only re-exports)
export type {
	CanvasCreatedEvent,
	CanvasDeletedEvent,
	CanvasUpdatedEvent,
	CanvasFocusChangedEvent
} from './canvasService.js';

/**
 * IPC Channel name for CanvasService communication.
*/
export const CANVAS_CHANNEL_NAME = 'roopikCanvas';
