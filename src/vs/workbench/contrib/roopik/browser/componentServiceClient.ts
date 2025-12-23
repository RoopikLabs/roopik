/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Component Service Client
 *
 * Renderer-side proxy that communicates with ComponentService in main process via IPC.
 * Implements the same IComponentService interface, so callers can use it identically.
 *
 * Flow:
 * Extension UI → ComponentServiceClient.method() → IPC → ComponentChannel → ComponentService
 * ComponentService events → IPC → ComponentServiceClient.onXxx → Extension UI
 */

import { Event } from '../../../../base/common/event.js';
import { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import {
	IComponentService,
	ComponentCreatedEvent,
	ComponentBuildEvent,
	ComponentDeletedEvent,
	ComponentUpdatedEvent
} from '../common/component/componentService.js';
import {
	Component,
	AddComponentRequest
} from '../common/component/types.js';

import { COMPONENT_CHANNEL_NAME } from '../common/component/index.js';

// IPC Channel name for ComponentService communication
export { COMPONENT_CHANNEL_NAME };

export class ComponentServiceClient implements IComponentService {
	readonly _serviceBrand: undefined;

	private readonly channel: IChannel;

	// ========================================================================
	// Events (proxied from main process)
	// ========================================================================

	readonly onComponentCreated: Event<ComponentCreatedEvent>;
	readonly onComponentBuilt: Event<ComponentBuildEvent>;
	readonly onComponentDeleted: Event<ComponentDeletedEvent>;
	readonly onComponentUpdated: Event<ComponentUpdatedEvent>;

	// ========================================================================
	// Constructor
	// ========================================================================

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService
	) {
		// Get the component channel from main process
		this.channel = mainProcessService.getChannel(COMPONENT_CHANNEL_NAME);

		// Subscribe to events from main process
		this.onComponentCreated = this.channel.listen<ComponentCreatedEvent>('onComponentCreated');
		this.onComponentBuilt = this.channel.listen<ComponentBuildEvent>('onComponentBuilt');
		this.onComponentDeleted = this.channel.listen<ComponentDeletedEvent>('onComponentDeleted');
		this.onComponentUpdated = this.channel.listen<ComponentUpdatedEvent>('onComponentUpdated');
	}

	// ========================================================================
	// Lifecycle
	// ========================================================================

	async initialize(workspacePath: string): Promise<void> {
		return this.channel.call('initialize', workspacePath);
	}

	isInitialized(): boolean {
		// Note: This is sync in interface but async over IPC
		// For now, we'll need to handle this differently or cache the state
		// This is a limitation - consider making this async in the interface
		throw new Error('ComponentServiceClient: isInitialized() is not supported over IPC. Use async pattern.');
	}

	dispose(): void {
		// No-op on client side - main process owns the service lifecycle
	}

	// ========================================================================
	// Create
	// ========================================================================

	async addComponent(request: AddComponentRequest): Promise<Component> {
		return this.channel.call('addComponent', request);
	}

	// ========================================================================
	// Read
	// ========================================================================

	getComponent(id: string): Component | undefined {
		// Note: This is sync in interface but async over IPC
		// For now, throw - caller should use async pattern
		throw new Error('ComponentServiceClient: getComponent() is not supported over IPC. Use getComponentAsync().');
	}

	/**
	 * Async version of getComponent for IPC
	 */
	async getComponentAsync(id: string): Promise<Component | undefined> {
		return this.channel.call('getComponent', id);
	}

	getComponentsForCanvas(canvasId: string): Component[] {
		throw new Error('ComponentServiceClient: getComponentsForCanvas() is not supported over IPC. Use getComponentsForCanvasAsync().');
	}

	/**
	 * Async version of getComponentsForCanvas for IPC
	 */
	async getComponentsForCanvasAsync(canvasId: string): Promise<Component[]> {
		return this.channel.call('getComponentsForCanvas', canvasId);
	}

	getAllComponents(): Component[] {
		throw new Error('ComponentServiceClient: getAllComponents() is not supported over IPC. Use getAllComponentsAsync().');
	}

	/**
	 * Async version of getAllComponents for IPC
	 */
	async getAllComponentsAsync(): Promise<Component[]> {
		return this.channel.call('getAllComponents');
	}

	// ========================================================================
	// Code Access
	// ========================================================================

	async getComponentSource(id: string): Promise<Record<string, string>> {
		return this.channel.call('getComponentSource', id);
	}

	async getBundledCode(id: string): Promise<string> {
		return this.channel.call('getBundledCode', id);
	}

	async getCdnUrls(id: string): Promise<string[]> {
		return this.channel.call('getCdnUrls', id);
	}

	// ========================================================================
	// Update
	// ========================================================================

	async updateComponentMeta(id: string, updates: { componentName?: string }): Promise<void> {
		return this.channel.call('updateComponentMeta', { id, updates });
	}

	// ========================================================================
	// Build
	// ========================================================================

	async rebuildComponent(id: string): Promise<void> {
		return this.channel.call('rebuildComponent', id);
	}

	async rebuildAllInCanvas(canvasId: string): Promise<void> {
		return this.channel.call('rebuildAllInCanvas', canvasId);
	}

	isBuilding(id: string): boolean {
		throw new Error('ComponentServiceClient: isBuilding() is not supported over IPC. Use isBuildingAsync().');
	}

	/**
	 * Async version of isBuilding for IPC
	 */
	async isBuildingAsync(id: string): Promise<boolean> {
		return this.channel.call('isBuilding', id);
	}

	getBuildQueueSize(): number {
		throw new Error('ComponentServiceClient: getBuildQueueSize() is not supported over IPC. Use getBuildQueueSizeAsync().');
	}

	/**
	 * Async version of getBuildQueueSize for IPC
	 */
	async getBuildQueueSizeAsync(): Promise<number> {
		return this.channel.call('getBuildQueueSize');
	}

	// ========================================================================
	// Delete
	// ========================================================================

	async deleteComponent(id: string): Promise<void> {
		return this.channel.call('deleteComponent', id);
	}

	// ========================================================================
	// File Watcher Control
	// ========================================================================

	pauseFileWatcher(): void {
		// Fire and forget - we don't need to wait for acknowledgment
		this.channel.call('pauseFileWatcher');
	}

	resumeFileWatcher(): void {
		this.channel.call('resumeFileWatcher');
	}

	ignoreComponentFileChanges(id: string): void {
		this.channel.call('ignoreComponentFileChanges', id);
	}

	unignoreComponentFileChanges(id: string): void {
		this.channel.call('unignoreComponentFileChanges', id);
	}
}
