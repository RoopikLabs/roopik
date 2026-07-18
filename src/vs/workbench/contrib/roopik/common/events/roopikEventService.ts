/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import type { RoopikEventTopic, RoopikEventMap, EventPayload, BrowserCreatedEvent, BrowserDestroyedEvent, BrowserNavigatedEvent, BrowserTitleChangedEvent, BrowserLoadingStartedEvent, BrowserLoadingFinishedEvent, CanvasCreatedEvent, CanvasDestroyedEvent, CanvasRenamedEvent, CanvasFocusedEvent, ComponentAddedEvent, ComponentRemovedEvent, ComponentUpdatedEvent, ComponentSelectedEvent, SettingsChangedEvent, SettingsResetEvent, AgentActionStartedEvent, AgentActionCompletedEvent, AgentErrorEvent } from './roopikEventTypes.js';

// ============================================
// Service Interface
// ============================================

export const IRoopikEventService = createDecorator<IRoopikEventService>('roopikEventService');

/**
 * Roopik Event Service
 *
 * Central event bus for the Roopik application.
 * Provides pub/sub functionality for cross-service communication.
 *
 * Features:
 * - Type-safe publish/subscribe
 * - Topic-based event routing
 * - Subscribe to all events (for AI agents, debugging)
 * - Typed convenience events for common use cases
 */
export interface IRoopikEventService {
	readonly _serviceBrand: undefined;

	// ============================================
	// Generic Pub/Sub (Flexible, Type-Safe)
	// ============================================

	/**
	 * Publish an event to all subscribers
	 * @param topic Event topic (e.g., 'browser.created')
	 * @param data Event payload (auto-typed based on topic)
	 */
	publish<T extends RoopikEventTopic>(topic: T, data: Omit<EventPayload<T>, 'timestamp'>): void;

	/**
	 * Subscribe to a specific event topic
	 * @param topic Event topic to listen to
	 * @param handler Callback function (receives typed payload)
	 * @returns Disposable to unsubscribe
	 */
	subscribe<T extends RoopikEventTopic>(topic: T, handler: (data: EventPayload<T>) => void): IDisposable;

	/**
	 * Subscribe to ALL events (useful for AI agents, debugging, logging)
	 * @param handler Callback function (receives topic + payload)
	 * @returns Disposable to unsubscribe
	 */
	subscribeAll(handler: (topic: RoopikEventTopic, data: unknown) => void): IDisposable;

	// ============================================
	// Typed Convenience Events
	// ============================================

	// Browser events
	readonly onBrowserCreated: Event<BrowserCreatedEvent>;
	readonly onBrowserDestroyed: Event<BrowserDestroyedEvent>;
	readonly onBrowserNavigated: Event<BrowserNavigatedEvent>;
	readonly onBrowserTitleChanged: Event<BrowserTitleChangedEvent>;
	readonly onBrowserLoadingStarted: Event<BrowserLoadingStartedEvent>;
	readonly onBrowserLoadingFinished: Event<BrowserLoadingFinishedEvent>;

	// Canvas events
	readonly onCanvasCreated: Event<CanvasCreatedEvent>;
	readonly onCanvasDestroyed: Event<CanvasDestroyedEvent>;
	readonly onCanvasRenamed: Event<CanvasRenamedEvent>;
	readonly onCanvasFocused: Event<CanvasFocusedEvent>;

	// Component events
	readonly onComponentAdded: Event<ComponentAddedEvent>;
	readonly onComponentRemoved: Event<ComponentRemovedEvent>;
	readonly onComponentUpdated: Event<ComponentUpdatedEvent>;
	readonly onComponentSelected: Event<ComponentSelectedEvent>;

	// Settings events
	readonly onSettingsChanged: Event<SettingsChangedEvent>;
	readonly onSettingsReset: Event<SettingsResetEvent>;

	// Agent events
	readonly onAgentActionStarted: Event<AgentActionStartedEvent>;
	readonly onAgentActionCompleted: Event<AgentActionCompletedEvent>;
	readonly onAgentError: Event<AgentErrorEvent>;
}

// ============================================
// Service Implementation
// ============================================

export class RoopikEventService extends Disposable implements IRoopikEventService {
	readonly _serviceBrand: undefined;

	// ============================================
	// Internal Emitters (per topic)
	// ============================================

	// Browser
	private readonly _onBrowserCreated = this._register(new Emitter<BrowserCreatedEvent>());
	private readonly _onBrowserDestroyed = this._register(new Emitter<BrowserDestroyedEvent>());
	private readonly _onBrowserNavigated = this._register(new Emitter<BrowserNavigatedEvent>());
	private readonly _onBrowserTitleChanged = this._register(new Emitter<BrowserTitleChangedEvent>());
	private readonly _onBrowserLoadingStarted = this._register(new Emitter<BrowserLoadingStartedEvent>());
	private readonly _onBrowserLoadingFinished = this._register(new Emitter<BrowserLoadingFinishedEvent>());

	// Canvas
	private readonly _onCanvasCreated = this._register(new Emitter<CanvasCreatedEvent>());
	private readonly _onCanvasDestroyed = this._register(new Emitter<CanvasDestroyedEvent>());
	private readonly _onCanvasRenamed = this._register(new Emitter<CanvasRenamedEvent>());
	private readonly _onCanvasFocused = this._register(new Emitter<CanvasFocusedEvent>());

	// Component
	private readonly _onComponentAdded = this._register(new Emitter<ComponentAddedEvent>());
	private readonly _onComponentRemoved = this._register(new Emitter<ComponentRemovedEvent>());
	private readonly _onComponentUpdated = this._register(new Emitter<ComponentUpdatedEvent>());
	private readonly _onComponentSelected = this._register(new Emitter<ComponentSelectedEvent>());

	// Settings
	private readonly _onSettingsChanged = this._register(new Emitter<SettingsChangedEvent>());
	private readonly _onSettingsReset = this._register(new Emitter<SettingsResetEvent>());

	// Agent
	private readonly _onAgentActionStarted = this._register(new Emitter<AgentActionStartedEvent>());
	private readonly _onAgentActionCompleted = this._register(new Emitter<AgentActionCompletedEvent>());
	private readonly _onAgentError = this._register(new Emitter<AgentErrorEvent>());

	// All events (for subscribeAll)
	private readonly _onAnyEvent = this._register(new Emitter<{ topic: RoopikEventTopic; data: unknown }>());

	// ============================================
	// Public Event Accessors
	// ============================================

	// Browser
	readonly onBrowserCreated = this._onBrowserCreated.event;
	readonly onBrowserDestroyed = this._onBrowserDestroyed.event;
	readonly onBrowserNavigated = this._onBrowserNavigated.event;
	readonly onBrowserTitleChanged = this._onBrowserTitleChanged.event;
	readonly onBrowserLoadingStarted = this._onBrowserLoadingStarted.event;
	readonly onBrowserLoadingFinished = this._onBrowserLoadingFinished.event;

	// Canvas
	readonly onCanvasCreated = this._onCanvasCreated.event;
	readonly onCanvasDestroyed = this._onCanvasDestroyed.event;
	readonly onCanvasRenamed = this._onCanvasRenamed.event;
	readonly onCanvasFocused = this._onCanvasFocused.event;

	// Component
	readonly onComponentAdded = this._onComponentAdded.event;
	readonly onComponentRemoved = this._onComponentRemoved.event;
	readonly onComponentUpdated = this._onComponentUpdated.event;
	readonly onComponentSelected = this._onComponentSelected.event;

	// Settings
	readonly onSettingsChanged = this._onSettingsChanged.event;
	readonly onSettingsReset = this._onSettingsReset.event;

	// Agent
	readonly onAgentActionStarted = this._onAgentActionStarted.event;
	readonly onAgentActionCompleted = this._onAgentActionCompleted.event;
	readonly onAgentError = this._onAgentError.event;

	// ============================================
	// Emitter Map (for dynamic routing)
	// ============================================

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private readonly emitterMap = new Map<RoopikEventTopic, Emitter<any>>();

	private initEmitterMap(): void {
		// Browser
		this.emitterMap.set('browser.created', this._onBrowserCreated);
		this.emitterMap.set('browser.destroyed', this._onBrowserDestroyed);
		this.emitterMap.set('browser.navigated', this._onBrowserNavigated);
		this.emitterMap.set('browser.titleChanged', this._onBrowserTitleChanged);
		this.emitterMap.set('browser.loadingStarted', this._onBrowserLoadingStarted);
		this.emitterMap.set('browser.loadingFinished', this._onBrowserLoadingFinished);

		// Canvas
		this.emitterMap.set('canvas.created', this._onCanvasCreated);
		this.emitterMap.set('canvas.destroyed', this._onCanvasDestroyed);
		this.emitterMap.set('canvas.renamed', this._onCanvasRenamed);
		this.emitterMap.set('canvas.focused', this._onCanvasFocused);

		// Component
		this.emitterMap.set('component.added', this._onComponentAdded);
		this.emitterMap.set('component.removed', this._onComponentRemoved);
		this.emitterMap.set('component.updated', this._onComponentUpdated);
		this.emitterMap.set('component.selected', this._onComponentSelected);

		// Settings
		this.emitterMap.set('settings.changed', this._onSettingsChanged);
		this.emitterMap.set('settings.reset', this._onSettingsReset);

		// Agent
		this.emitterMap.set('agent.actionStarted', this._onAgentActionStarted);
		this.emitterMap.set('agent.actionCompleted', this._onAgentActionCompleted);
		this.emitterMap.set('agent.error', this._onAgentError);
	}

	// Logging configuration
	private readonly LOG_PREFIX = '[RoopikEventBus]';
	private readonly enableDebugLogging = false; // Set to false in production

	constructor(
		@ILogService private readonly logService: ILogService
	) {
		super();
		this.initEmitterMap();
		this.logService.info(`${this.LOG_PREFIX} Event service initialized`);
	}

	// ============================================
	// Pub/Sub Implementation
	// ============================================

	/**
	 * Publish an event to all subscribers
	 */
	publish<T extends RoopikEventTopic>(topic: T, data: Omit<RoopikEventMap[T], 'timestamp'>): void {
		const emitter = this.emitterMap.get(topic);
		if (!emitter) {
			this.logService.warn(`${this.LOG_PREFIX} Unknown event topic: ${topic}`);
			return;
		}

		// Add timestamp to event
		const eventWithTimestamp: RoopikEventMap[T] = Object.assign({}, data, {
			timestamp: Date.now()
		}) as RoopikEventMap[T];

		// Log the event being published
		if (this.enableDebugLogging) {
			const dataPreview = this.formatEventDataForLog(topic, data);
			this.logService.info(`${this.LOG_PREFIX} PUBLISH: ${topic} ${dataPreview}`);
		}

		// Fire specific event
		emitter.fire(eventWithTimestamp);

		// Fire to all-events subscribers
		this._onAnyEvent.fire({ topic, data: eventWithTimestamp });
	}

	/**
	 * Subscribe to a specific event topic
	 */
	subscribe<T extends RoopikEventTopic>(topic: T, handler: (data: RoopikEventMap[T]) => void): IDisposable {
		const emitter = this.emitterMap.get(topic);
		if (!emitter) {
			this.logService.warn(`${this.LOG_PREFIX} Unknown event topic: ${topic}`);
			return { dispose: () => { } };
		}

		if (this.enableDebugLogging) {
			this.logService.info(`${this.LOG_PREFIX} SUBSCRIBE: ${topic}`);
		}

		return emitter.event(handler);
	}

	/**
	 * Subscribe to ALL events
	 */
	subscribeAll(handler: (topic: RoopikEventTopic, data: unknown) => void): IDisposable {
		if (this.enableDebugLogging) {
			this.logService.info(`${this.LOG_PREFIX} SUBSCRIBE_ALL: Subscribing to all events`);
		}

		return this._onAnyEvent.event(({ topic, data }) => {
			handler(topic, data);
		});
	}

	// ============================================
	// Logging Helpers
	// ============================================

	/**
	 * Format event data for logging (compact preview)
	 */
	private formatEventDataForLog(topic: RoopikEventTopic, data: unknown): string {
		try {
			const obj = data as Record<string, unknown>;

			// Extract key fields based on event type for concise logging
			if (topic.startsWith('browser.')) {
				const browserViewId = obj['browserViewId'];
				const url = obj['url'];
				const title = obj['title'];

				if (browserViewId !== undefined) {
					let result = `(viewId=${browserViewId}`;
					if (url) {
						result += `, url=${String(url).substring(0, 50)}`;
					}
					if (title) {
						result += `, title="${String(title).substring(0, 30)}"`;
					}
					return result + ')';
				}
			}

			if (topic.startsWith('settings.')) {
				const key = obj['key'];
				const scope = obj['scope'];
				return `(scope=${scope}, key=${key})`;
			}

			if (topic.startsWith('canvas.') || topic.startsWith('component.')) {
				const canvasId = obj['canvasId'];
				const componentId = obj['componentId'];
				if (canvasId) {
					return componentId ? `(canvas=${canvasId}, component=${componentId})` : `(canvas=${canvasId})`;
				}
			}

			// Fallback: stringify with truncation
			const json = JSON.stringify(data);
			return json.length > 100 ? json.substring(0, 100) + '...' : json;
		} catch {
			return '(data)';
		}
	}
}
