/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Canvas Event Types
 *
 * These types mirror the Core's canvas event types.
 * They are used for type-safe communication between Extension and Core.
 */

import type { CanvasMeta } from './canvas';

/**
 * Event fired when a canvas is created
 */
export interface CanvasCreatedEvent {
	canvasId: string;
	canvas: CanvasMeta;
}

/**
 * Event fired when a canvas is deleted
 */
export interface CanvasDeletedEvent {
	canvasId: string;
}

/**
 * Event fired when canvas metadata changes
 */
export interface CanvasUpdatedEvent {
	canvasId: string;
	canvas: CanvasMeta;
	changes: ('name' | 'description' | 'icon' | 'color')[];
}

/**
 * Event fired when focused canvas changes
 */
export interface CanvasFocusChangedEvent {
	canvasId: string | null;
	previousCanvasId: string | null;
}
