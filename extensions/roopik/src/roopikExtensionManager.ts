/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Logger } from './logger';
import { CanvasPanel } from './canvasPanel';

// Types from Core (will be imported via IPC when available)
// For now, define locally - these must match Core's types
import type {
	ComponentCreatedEvent,
	ComponentBuildEvent,
	ComponentDeletedEvent,
	ComponentUpdatedEvent
} from './types/componentEvents';
import type { AddComponentRequest, Component } from './types/component';
import type { CreateCanvasResult } from './types/canvas';

/**
 * RoopikExtensionManager - SINGLETON
 *
 * Central manager for the Roopik extension that:
 * 1. Holds ONE subscription to each Core event (not per-panel)
 * 2. Routes events to correct CanvasPanel by canvasId
 * 3. Tracks open panels in memory
 * 4. Provides clean API for panels to call Core services
 *
 * Architecture:
 * - Core events → RoopikExtensionManager → routes to correct CanvasPanel
 * - CanvasPanel action → RoopikExtensionManager → Core service client
 *
 * This prevents duplicate event subscriptions when multiple canvases are open.
 */
export class RoopikExtensionManager implements vscode.Disposable {
	private static instance: RoopikExtensionManager | null = null;

	// Service clients (will be set up when IPC is available)
	// private componentClient: ComponentServiceClient | null = null;
	// private canvasClient: CanvasServiceClient | null = null;

	// Track open canvas panels: canvasId → CanvasPanel
	private readonly canvasPanels = new Map<string, CanvasPanel>();

	// Event subscriptions (disposables)
	private readonly subscriptions: vscode.Disposable[] = [];

	// Logger
	private readonly logger: ReturnType<typeof Logger.prototype.createScoped>;

	// Workspace path
	private workspacePath: string = '';

	// Extension context (for state persistence)
	private context: vscode.ExtensionContext | null = null;

	// Initialization state
	private initialized = false;

	// ============================================================================
	// Singleton
	// ============================================================================

	private constructor() {
		this.logger = Logger.getInstance().createScoped('ExtensionManager');
	}

	/**
	 * Get the singleton instance
	 */
	public static getInstance(): RoopikExtensionManager {
		if (!RoopikExtensionManager.instance) {
			RoopikExtensionManager.instance = new RoopikExtensionManager();
		}
		return RoopikExtensionManager.instance;
	}

	// ============================================================================
	// Initialization
	// ============================================================================

	/**
	 * Initialize the manager with workspace context
	 * Sets up IPC clients and event subscriptions
	 */
	public async initialize(context: vscode.ExtensionContext): Promise<void> {
		if (this.initialized) {
			this.logger.warn('Already initialized');
			return;
		}

		// Store context for state persistence
		this.context = context;

		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			throw new Error('No workspace folder found');
		}

		this.workspacePath = workspaceFolders[0].uri.fsPath;
		this.logger.info(`Initializing with workspace: ${this.workspacePath}`);

		// TODO: Set up IPC channel to Core services
		// This will be implemented when we have the IPC bridge
		// For now, we'll use command-based communication

		// Set up event subscriptions
		this.setupEventSubscriptions();

		// Initialize Core services
		await this.initializeCoreServices();

		this.initialized = true;
		this.logger.info('Initialized successfully');
	}

	/**
	 * Set up ONE subscription to each Core event
	 * Routes events to correct panel by canvasId
	 *
	 * Note: Events are received via command handlers registered in extension.ts
	 * Core's RoopikComponentContribution fires commands like 'roopik.component.created'
	 * which are caught by extension and routed here via public handler methods.
	 */
	private setupEventSubscriptions(): void {
		// Events are now received via VSCode commands registered in extension.ts
		// Commands like 'roopik.component.created' call our public handler methods
		this.logger.info('Event subscriptions set up via command handlers');
	}

	// ============================================================================
	// Public Event Handlers (called by extension.ts command handlers)
	// ============================================================================

	/**
	 * Handle component created event from Core (via command)
	 */
	public handleComponentCreatedFromCore(event: ComponentCreatedEvent): void {
		this.handleComponentCreated(event);
	}

	/**
	 * Handle component built event from Core (via command)
	 */
	public handleComponentBuiltFromCore(event: ComponentBuildEvent): void {
		this.handleComponentBuilt(event);
	}

	/**
	 * Handle component deleted event from Core (via command)
	 */
	public handleComponentDeletedFromCore(event: ComponentDeletedEvent): void {
		this.handleComponentDeleted(event);
	}

	/**
	 * Handle component updated event from Core (via command)
	 */
	public handleComponentUpdatedFromCore(event: ComponentUpdatedEvent): void {
		this.handleComponentUpdated(event);
	}

	/**
	 * Initialize Core services (CanvasService, ComponentService)
	 */
	private async initializeCoreServices(): Promise<void> {
		// TODO: Call Core service initialization via IPC
		// await this.canvasClient.initialize(this.workspacePath);
		// await this.componentClient.initialize(this.workspacePath);

		this.logger.info('Core services initialized (pending IPC integration)');
	}

	// ============================================================================
	// Panel Management
	// ============================================================================

	/**
	 * Open a canvas panel
	 * Creates new panel or reveals existing one
	 */
	public openCanvas(canvasId: string, canvasName: string, extensionUri: vscode.Uri): void {
		this.logger.info(`Opening canvas: ${canvasId} (${canvasName})`);

		// Check if panel already exists
		const existingPanel = this.canvasPanels.get(canvasId);
		if (existingPanel) {
			existingPanel.reveal();
			this.notifyCoreFocused(canvasId);
			this.saveLastActiveCanvas(canvasId);
			return;
		}

		// Create new panel
		const panel = CanvasPanel.create(extensionUri, canvasId, canvasName, this);
		this.canvasPanels.set(canvasId, panel);

		// Notify Core that panel is open
		this.notifyCorePanelOpen(canvasId);
		this.notifyCoreFocused(canvasId);
		this.saveLastActiveCanvas(canvasId);

		this.logger.info(`Canvas opened. Total panels: ${this.canvasPanels.size}`);
	}

	/**
	 * Close a canvas panel
	 */
	public closeCanvas(canvasId: string): void {
		this.logger.info(`Closing canvas: ${canvasId}`);

		const panel = this.canvasPanels.get(canvasId);
		if (panel) {
			panel.dispose();
			// Note: onPanelDisposed will handle removal from map
		}
	}

	/**
	 * Called when a panel is disposed (by user closing tab or programmatically)
	 */
	public onPanelDisposed(canvasId: string): void {
		this.canvasPanels.delete(canvasId);
		this.notifyCorePanelClosed(canvasId);
		this.logger.info(`Panel disposed: ${canvasId}. Remaining: ${this.canvasPanels.size}`);
	}

	/**
	 * Called when a panel gains focus
	 */
	public onPanelFocused(canvasId: string): void {
		this.notifyCoreFocused(canvasId);
		// Save as last active canvas for restoration
		this.saveLastActiveCanvas(canvasId);
	}

	/**
	 * Get a panel by canvas ID
	 */
	public getPanel(canvasId: string): CanvasPanel | undefined {
		return this.canvasPanels.get(canvasId);
	}

	/**
	 * Get all open canvas IDs
	 */
	public getOpenCanvasIds(): string[] {
		return Array.from(this.canvasPanels.keys());
	}

	/**
	 * Get count of open panels
	 */
	public getOpenCount(): number {
		return this.canvasPanels.size;
	}

	// ============================================================================
	// State Persistence (Last Active Canvas)
	// ============================================================================

	/**
	 * Save the last active canvas ID to VS Code's global state
	 */
	private saveLastActiveCanvas(canvasId: string): void {
		if (!this.context) {
			this.logger.warn('Cannot save last active canvas - context not initialized');
			return;
		}

		this.context.globalState.update('roopik.lastActiveCanvas', canvasId);
		this.logger.debug(`Saved last active canvas: ${canvasId}`);
	}

	/**
	 * Get the last active canvas ID from VS Code's global state
	 */
	public getLastActiveCanvas(): string | undefined {
		if (!this.context) {
			this.logger.warn('Cannot get last active canvas - context not initialized');
			return undefined;
		}

		return this.context.globalState.get<string>('roopik.lastActiveCanvas');
	}

	/**
	 * Restore the last active canvas (called on extension activation)
	 */
	public async restoreLastActiveCanvas(extensionUri: vscode.Uri): Promise<boolean> {
		const lastCanvasId = this.getLastActiveCanvas();

		if (!lastCanvasId) {
			// this.logger.info('No last active canvas to restore');
			return false;
		}

		// this.logger.info(`Restoring last active canvas: ${lastCanvasId}`);

		try {
			// Get canvas info from Core
			const canvasInfo = await vscode.commands.executeCommand<{ id: string; name: string }>(
				'roopik.core.getCanvas',
				lastCanvasId
			);

			if (!canvasInfo) {
				this.logger.warn(`Canvas ${lastCanvasId} not found in Core - may have been deleted`);
				// Clear the saved state since canvas doesn't exist
				this.context?.globalState.update('roopik.lastActiveCanvas', undefined);
				return false;
			}

			// Open the canvas
			this.openCanvas(lastCanvasId, canvasInfo.name || lastCanvasId, extensionUri);
			// this.logger.info(`Successfully restored canvas: ${lastCanvasId}`);
			return true;

		} catch (error) {
			this.logger.error(`Failed to restore last active canvas: ${error}`);
			return false;
		}
	}

	// ============================================================================
	// Core Event Handlers (routed to correct panel)
	// ============================================================================

	/**
	 * Handle component created event from Core
	 */
	private handleComponentCreated(event: ComponentCreatedEvent): void {
		const panel = this.canvasPanels.get(event.canvasId);
		if (panel) {
			panel.onComponentCreated(event);
		}
	}

	/**
	 * Handle component built event from Core
	 */
	private handleComponentBuilt(event: ComponentBuildEvent): void {
		const panel = this.canvasPanels.get(event.canvasId);
		if (panel) {
			panel.onComponentBuilt(event);
		}
	}

	/**
	 * Handle component deleted event from Core
	 */
	private handleComponentDeleted(event: ComponentDeletedEvent): void {
		const panel = this.canvasPanels.get(event.canvasId);
		if (panel) {
			panel.onComponentDeleted(event);
		}
	}

	/**
	 * Handle component updated event from Core
	 */
	private handleComponentUpdated(event: ComponentUpdatedEvent): void {
		const panel = this.canvasPanels.get(event.canvasId);
		if (panel) {
			panel.onComponentUpdated(event);
		}
	}

	// ============================================================================
	// Core Service Calls (exposed to panels)
	// ============================================================================

	/**
	 * Create a new canvas via Core's CanvasService
	 */
	public async createCanvas(name: string): Promise<CreateCanvasResult> {
		this.logger.info(`Creating canvas: ${name}`);

		// TODO: Call Core via IPC
		// return this.canvasClient.createCanvas(name);

		// Temporary: Use command to call Core
		const result = await vscode.commands.executeCommand<CreateCanvasResult>(
			'roopik.core.createCanvas',
			name
		);

		if (!result) {
			throw new Error('Failed to create canvas - no result from Core');
		}

		return result;
	}

	/**
	 * Create a component via Core's ComponentService
	 */
	public async createComponent(request: AddComponentRequest): Promise<Component> {
		this.logger.info(`Creating component: ${request.componentName || '(auto)'} in canvas: ${request.canvasId}`);

		// Call Core via command
		const result = await vscode.commands.executeCommand<Component>(
			'roopik.core.createComponent',
			request
		);

		if (!result) {
			throw new Error('Failed to create component - no result from Core');
		}

		return result;
	}

	/**
	 * Rebuild a component via Core's ComponentService
	 */
	public async rebuildComponent(componentId: string): Promise<void> {
		this.logger.info(`Rebuilding component: ${componentId}`);

		// TODO: Call Core via IPC
		// return this.componentClient.rebuildComponent(componentId);

		await vscode.commands.executeCommand('roopik.core.rebuildComponent', componentId);
	}

	/**
	 * Delete a component via Core's ComponentService
	 */
	public async deleteComponent(componentId: string): Promise<void> {
		this.logger.info(`Deleting component: ${componentId}`);

		// TODO: Call Core via IPC
		// return this.componentClient.deleteComponent(componentId);

		await vscode.commands.executeCommand('roopik.core.deleteComponent', componentId);
	}

	/**
	 * Get bundled code for a component
	 */
	public async getBundledCode(componentId: string): Promise<string> {
		// TODO: Call Core via IPC
		// return this.componentClient.getBundledCode(componentId);

		const result = await vscode.commands.executeCommand<string>(
			'roopik.core.getBundledCode',
			componentId
		);

		return result || '';
	}

	/**
	 * Get component source files
	 */
	public async getComponentSource(componentId: string): Promise<Record<string, string>> {
		// TODO: Call Core via IPC
		// return this.componentClient.getComponentSource(componentId);

		const result = await vscode.commands.executeCommand<Record<string, string>>(
			'roopik.core.getComponentSource',
			componentId
		);

		return result || {};
	}

	/**
	 * Report a runtime error to Core
	 */
	public async reportComponentRuntimeError(
		componentId: string,
		error: {
			message: string;
			type: 'runtime' | 'promise' | 'unknown';
			stack?: string;
			source?: string;
			line?: number;
			column?: number;
			timestamp: number;
		}
	): Promise<void> {
		await vscode.commands.executeCommand(
			'roopik.core.reportRuntimeError',
			{ componentId, error }
		);
	}


	// ============================================================================
	// Core Notifications (panel state tracking)
	// ============================================================================

	private notifyCorePanelOpen(canvasId: string): void {
		// TODO: Call Core via IPC
		// this.canvasClient.registerPanelOpen(canvasId);

		vscode.commands.executeCommand('roopik.core.registerPanelOpen', canvasId);
	}

	private notifyCorePanelClosed(canvasId: string): void {
		// TODO: Call Core via IPC
		// this.canvasClient.registerPanelClosed(canvasId);

		vscode.commands.executeCommand('roopik.core.registerPanelClosed', canvasId);
	}

	private notifyCoreFocused(canvasId: string): void {
		// TODO: Call Core via IPC
		// this.canvasClient.registerPanelFocused(canvasId);

		vscode.commands.executeCommand('roopik.core.registerPanelFocused', canvasId);
	}

	// ============================================================================
	// Dispose
	// ============================================================================

	public dispose(): void {
		this.logger.info('Disposing...');

		// Dispose all panels
		this.canvasPanels.forEach(panel => panel.dispose());
		this.canvasPanels.clear();

		// Dispose subscriptions
		this.subscriptions.forEach(s => s.dispose());
		this.subscriptions.length = 0;

		this.initialized = false;
		RoopikExtensionManager.instance = null;

		this.logger.info('Disposed');
	}
}
