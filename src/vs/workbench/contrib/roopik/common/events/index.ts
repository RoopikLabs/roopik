/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Roopik Event System - Public Exports
 */

// Service
export { IRoopikEventService, RoopikEventService } from './roopikEventService.js';

// Types (type-only re-exports)
export type {
	// Topics
	RoopikEventTopic,
	RoopikEventMap,
	EventPayload,
	RoopikBaseEvent,

	// Browser events
	BrowserCreatedEvent,
	BrowserDestroyedEvent,
	BrowserNavigatedEvent,
	BrowserTitleChangedEvent,
	BrowserLoadingStartedEvent,
	BrowserLoadingFinishedEvent,

	// Canvas events
	CanvasCreatedEvent,
	CanvasDestroyedEvent,
	CanvasRenamedEvent,
	CanvasFocusedEvent,

	// Component events
	ComponentAddedEvent,
	ComponentRemovedEvent,
	ComponentUpdatedEvent,
	ComponentSelectedEvent,

	// Settings events
	SettingsChangedEvent,
	SettingsResetEvent,

	// Agent events
	AgentActionStartedEvent,
	AgentActionCompletedEvent,
	AgentErrorEvent,

	// Supporting types
	CanvasInfo
} from './roopikEventTypes.js';
