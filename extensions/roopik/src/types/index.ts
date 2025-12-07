/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Type exports for Extension ↔ Core communication
 */

// Canvas types
export type {
	CanvasMeta,
	Canvas,
	CreateCanvasResult,
	ListCanvasOptions,
	CanvasPanelState
} from './canvas';

// Canvas events
export type {
	CanvasCreatedEvent,
	CanvasDeletedEvent,
	CanvasUpdatedEvent,
	CanvasFocusChangedEvent
} from './canvasEvents';

// Component types
export type {
	Component,
	ComponentSource,
	ComponentFramework,
	ComponentBuildState,
	SourceData,
	CreateComponentRequest,
	BuildResult,
	BuildErrorInfo
} from './component';

// Component events
export type {
	ComponentCreatedEvent,
	ComponentBuildEvent,
	ComponentDeletedEvent,
	ComponentUpdatedEvent
} from './componentEvents';
