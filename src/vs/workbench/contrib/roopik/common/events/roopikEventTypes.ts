/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Roopik Event Types
 *
 * Defines all event topics and typed payload interfaces for the centralized event system.
 * Events follow the pattern: domain.action (e.g., 'browser.created')
 */

// ============================================
// Event Topics
// ============================================

/**
 * All possible event topics in the Roopik event system.
 * Format: domain.action
 */
export type RoopikEventTopic =
	// Browser events
	| 'browser.created'
	| 'browser.destroyed'
	| 'browser.navigated'
	| 'browser.titleChanged'
	| 'browser.loadingStarted'
	| 'browser.loadingFinished'

	// Canvas events (future)
	| 'canvas.created'
	| 'canvas.destroyed'
	| 'canvas.renamed'
	| 'canvas.focused'

	// Component events (future)
	| 'component.added'
	| 'component.removed'
	| 'component.updated'
	| 'component.selected'

	// Settings events
	| 'settings.changed'
	| 'settings.reset'

	// Agent events (future)
	| 'agent.actionStarted'
	| 'agent.actionCompleted'
	| 'agent.error';

// ============================================
// Base Event Interface
// ============================================

/**
 * Base interface for all events
 */
export interface RoopikBaseEvent {
	/** Unix timestamp when event was fired */
	timestamp: number;
}

// ============================================
// Browser Events
// ============================================

/**
 * Fired when a new browser view is created
 */
export interface BrowserCreatedEvent extends RoopikBaseEvent {
	browserViewId: number;
	windowId: number;
	/** Optional initial URL */
	url?: string;
	/** Optional initial title */
	title?: string;
}

export interface BrowserDestroyedEvent extends RoopikBaseEvent {
	browserViewId: number;
}

export interface BrowserNavigatedEvent extends RoopikBaseEvent {
	browserViewId: number;
	url: string;
	// Note: Title is NOT included - use browser.titleChanged event for title updates
}

export interface BrowserTitleChangedEvent extends RoopikBaseEvent {
	browserViewId: number;
	title: string;
}

export interface BrowserLoadingStartedEvent extends RoopikBaseEvent {
	browserViewId: number;
	/** Optional URL being loaded */
	url?: string;
}

export interface BrowserLoadingFinishedEvent extends RoopikBaseEvent {
	browserViewId: number;
	/** Optional URL that was loaded */
	url?: string;
	/** Optional success flag */
	success?: boolean;
}

// ============================================
// Canvas Events (Future)
// ============================================

export interface CanvasCreatedEvent extends RoopikBaseEvent {
	canvasId: string;
	name: string;
}

export interface CanvasDestroyedEvent extends RoopikBaseEvent {
	canvasId: string;
}

export interface CanvasRenamedEvent extends RoopikBaseEvent {
	canvasId: string;
	oldName: string;
	newName: string;
}

export interface CanvasFocusedEvent extends RoopikBaseEvent {
	canvasId: string;
}

// ============================================
// Component Events (Future)
// ============================================

export interface ComponentAddedEvent extends RoopikBaseEvent {
	canvasId: string;
	componentId: string;
	componentType: string;
	position: { x: number; y: number };
}

export interface ComponentRemovedEvent extends RoopikBaseEvent {
	canvasId: string;
	componentId: string;
}

export interface ComponentUpdatedEvent extends RoopikBaseEvent {
	canvasId: string;
	componentId: string;
	changes: Record<string, unknown>;
}

export interface ComponentSelectedEvent extends RoopikBaseEvent {
	canvasId: string;
	componentId: string | null; // null = deselected
}

// ============================================
// Settings Events
// ============================================

export interface SettingsChangedEvent extends RoopikBaseEvent {
	scope: 'app' | 'workspace';
	key: string;
	oldValue: unknown;
	newValue: unknown;
}

export interface SettingsResetEvent extends RoopikBaseEvent {
	scope: 'app' | 'workspace';
	keys: string[]; // Keys that were reset
}

// ============================================
// Agent Events (Future)
// ============================================

export interface AgentActionStartedEvent extends RoopikBaseEvent {
	actionId: string;
	actionType: string;
	target: string;
	params?: Record<string, unknown>;
}

export interface AgentActionCompletedEvent extends RoopikBaseEvent {
	actionId: string;
	success: boolean;
	result?: unknown;
	error?: string;
	durationMs: number;
}

export interface AgentErrorEvent extends RoopikBaseEvent {
	actionId?: string;
	error: string;
	details?: unknown;
}

// ============================================
// Supporting Types
// ============================================

export interface CanvasInfo {
	canvasId: string;
	name: string;
	componentCount: number;
	createdAt: number;
	updatedAt: number;
}

// ============================================
// Event Map (for type-safe subscriptions)
// ============================================

/**
 * Maps event topics to their payload types.
 * Used for type-safe publish/subscribe.
 */
export interface RoopikEventMap {
	// Browser
	'browser.created': BrowserCreatedEvent;
	'browser.destroyed': BrowserDestroyedEvent;
	'browser.navigated': BrowserNavigatedEvent;
	'browser.titleChanged': BrowserTitleChangedEvent;
	'browser.loadingStarted': BrowserLoadingStartedEvent;
	'browser.loadingFinished': BrowserLoadingFinishedEvent;

	// Canvas
	'canvas.created': CanvasCreatedEvent;
	'canvas.destroyed': CanvasDestroyedEvent;
	'canvas.renamed': CanvasRenamedEvent;
	'canvas.focused': CanvasFocusedEvent;

	// Component
	'component.added': ComponentAddedEvent;
	'component.removed': ComponentRemovedEvent;
	'component.updated': ComponentUpdatedEvent;
	'component.selected': ComponentSelectedEvent;

	// Settings
	'settings.changed': SettingsChangedEvent;
	'settings.reset': SettingsResetEvent;

	// Agent
	'agent.actionStarted': AgentActionStartedEvent;
	'agent.actionCompleted': AgentActionCompletedEvent;
	'agent.error': AgentErrorEvent;
}

/**
 * Helper type to get event payload from topic
 */
export type EventPayload<T extends RoopikEventTopic> = RoopikEventMap[T];
