/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Canvas Service Client
 *
 * Renderer-side proxy that communicates with CanvasService in main process via IPC.
 * Implements the same ICanvasService interface, so callers can use it identically.
 *
 * Flow:
 * Extension UI -> CanvasServiceClient.method() -> IPC -> CanvasChannel -> CanvasService
 * CanvasService events -> IPC -> CanvasServiceClient.onXxx -> Extension UI
 */

import { Event } from '../../../../base/common/event.js';
import { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import {
	ICanvasService,
	CanvasCreatedEvent,
	CanvasDeletedEvent,
	CanvasUpdatedEvent,
	CanvasFocusChangedEvent
} from '../common/canvas/canvasService.js';
import {
	CanvasMeta,
	Canvas,
	CreateCanvasResult,
	ListCanvasOptions,
	CanvasPanelState
} from '../common/canvas/types.js';

export class CanvasServiceClient implements ICanvasService {
	readonly _serviceBrand: undefined;

	// ========================================================================
	// Events (proxied from main process)
	// ========================================================================

	readonly onCanvasCreated: Event<CanvasCreatedEvent>;
	readonly onCanvasDeleted: Event<CanvasDeletedEvent>;
	readonly onCanvasUpdated: Event<CanvasUpdatedEvent>;
	readonly onCanvasFocusChanged: Event<CanvasFocusChangedEvent>;

	// ========================================================================
	// Constructor
	// ========================================================================

	constructor(private readonly channel: IChannel) {
		// Subscribe to events from main process
		this.onCanvasCreated = this.channel.listen<CanvasCreatedEvent>('onCanvasCreated');
		this.onCanvasDeleted = this.channel.listen<CanvasDeletedEvent>('onCanvasDeleted');
		this.onCanvasUpdated = this.channel.listen<CanvasUpdatedEvent>('onCanvasUpdated');
		this.onCanvasFocusChanged = this.channel.listen<CanvasFocusChangedEvent>('onCanvasFocusChanged');
	}

	// ========================================================================
	// Lifecycle
	// ========================================================================

	async initialize(workspacePath: string): Promise<void> {
		return this.channel.call('initialize', workspacePath);
	}

	isInitialized(): boolean {
		// Note: This is sync in interface but async over IPC
		throw new Error('CanvasServiceClient: isInitialized() is not supported over IPC. Use async pattern.');
	}

	dispose(): void {
		// No-op on client side - main process owns the service lifecycle
	}

	// ========================================================================
	// Canvas CRUD
	// ========================================================================

	async createCanvas(name: string): Promise<CreateCanvasResult> {
		return this.channel.call('createCanvas', name);
	}

	getCanvas(canvasId: string): Canvas | undefined {
		// Sync method not supported over IPC
		throw new Error('CanvasServiceClient: getCanvas() is not supported over IPC. Use getCanvasAsync().');
	}

	async getCanvasAsync(canvasId: string): Promise<Canvas | undefined> {
		return this.channel.call('getCanvas', canvasId);
	}

	listCanvases(options?: ListCanvasOptions): CanvasMeta[] {
		// Sync method not supported over IPC
		throw new Error('CanvasServiceClient: listCanvases() is not supported over IPC. Use listCanvasesAsync().');
	}

	async listCanvasesAsync(options?: ListCanvasOptions): Promise<CanvasMeta[]> {
		return this.channel.call('listCanvases', options);
	}

	async updateCanvas(
		canvasId: string,
		updates: Partial<Pick<CanvasMeta, 'name' | 'description' | 'icon' | 'color'>>
	): Promise<void> {
		return this.channel.call('updateCanvas', { canvasId, updates });
	}

	async deleteCanvas(canvasId: string): Promise<void> {
		return this.channel.call('deleteCanvas', canvasId);
	}

	// ========================================================================
	// Panel State Tracking
	// ========================================================================

	registerPanelOpen(canvasId: string): void {
		// Fire and forget
		this.channel.call('registerPanelOpen', canvasId);
	}

	registerPanelClosed(canvasId: string): void {
		// Fire and forget
		this.channel.call('registerPanelClosed', canvasId);
	}

	registerPanelFocused(canvasId: string): void {
		// Fire and forget
		this.channel.call('registerPanelFocused', canvasId);
	}

	getFocusedCanvasId(): string | null {
		// Sync method not supported over IPC
		throw new Error('CanvasServiceClient: getFocusedCanvasId() is not supported over IPC. Use getFocusedCanvasIdAsync().');
	}

	async getFocusedCanvasIdAsync(): Promise<string | null> {
		return this.channel.call('getFocusedCanvasId');
	}

	isPanelOpen(canvasId: string): boolean {
		// Sync method not supported over IPC
		throw new Error('CanvasServiceClient: isPanelOpen() is not supported over IPC. Use isPanelOpenAsync().');
	}

	/**
	 * Async version of isPanelOpen for IPC
	 */
	async isPanelOpenAsync(canvasId: string): Promise<boolean> {
		return this.channel.call('isPanelOpen', canvasId);
	}

	getOpenPanels(): CanvasPanelState[] {
		// Sync method not supported over IPC
		throw new Error('CanvasServiceClient: getOpenPanels() is not supported over IPC. Use getOpenPanelsAsync().');
	}

	/**
	 * Async version of getOpenPanels for IPC
	 */
	async getOpenPanelsAsync(): Promise<CanvasPanelState[]> {
		return this.channel.call('getOpenPanels');
	}

	// ========================================================================
	// Utilities
	// ========================================================================

	nameToId(name: string): string {
		// This can be done locally - no need for IPC
		return name
			.toLowerCase()
			.trim()
			.replace(/\s+/g, '-')
			.replace(/[^a-z0-9-]/g, '')
			.replace(/-+/g, '-')
			.replace(/^-|-$/g, '');
	}

	canvasExists(canvasId: string): boolean {
		// Sync method not supported over IPC
		throw new Error('CanvasServiceClient: canvasExists() is not supported over IPC. Use canvasExistsAsync().');
	}

	/**
	 * Async version of canvasExists for IPC
	 */
	async canvasExistsAsync(canvasId: string): Promise<boolean> {
		return this.channel.call('canvasExists', canvasId);
	}

	async updateComponentCount(canvasId: string, count: number): Promise<void> {
		return this.channel.call('updateComponentCount', { canvasId, count });
	}
}
