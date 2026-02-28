/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Canvas Module - Public API
 *
 * Re-exports all public types and interfaces for the canvas system.
 */

// Types
export {
	CanvasMeta,
	Canvas,
	CreateCanvasResult,
	ListCanvasOptions,
	CanvasPanelState
} from './types.js';

// Service Decorator & Interface & Events
export {
	ICanvasService,  // Also serves as DI decorator via createDecorator
	CanvasCreatedEvent,
	CanvasDeletedEvent,
	CanvasUpdatedEvent,
	CanvasFocusChangedEvent
} from './canvasService.js';

/**
 * IPC Channel name for CanvasService communication.
*/
export const CANVAS_CHANNEL_NAME = 'roopikCanvas';
