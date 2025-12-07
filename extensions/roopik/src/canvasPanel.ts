/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ConfigManager } from './config';
import { Logger } from './logger';
import type { RoopikExtensionManager } from './roopikExtensionManager';
import type {
	ComponentCreatedEvent,
	ComponentBuildEvent,
	ComponentDeletedEvent,
	ComponentUpdatedEvent
} from './types/componentEvents';

/**
 * CanvasPanel - Dumb UI Component
 *
 * This is now a "dumb" UI class that:
 * - Renders the webview
 * - Receives events from RoopikExtensionManager (routed by canvasId)
 * - Sends actions to RoopikExtensionManager (which calls Core services)
 * - Does NOT subscribe to events itself (manager does that once)
 * - Does NOT manage its own state (uses Core's state)
 *
 * Architecture:
 * - Manager routes events TO this panel via onComponentXxx methods
 * - This panel calls manager.createComponent(), manager.rebuildComponent(), etc.
 * - Webview <-> Panel communication via postMessage
 */
export class CanvasPanel implements vscode.Disposable {
	// Reference to parent manager
	private readonly manager: RoopikExtensionManager;

	// Webview panel
	private readonly panel: vscode.WebviewPanel;

	// Canvas identity
	private readonly canvasId: string;
	private readonly canvasName: string;

	// Extension URI for resources
	private readonly extensionUri: vscode.Uri;

	// Logger
	private readonly logger: ReturnType<typeof Logger.prototype.createScoped>;

	// Disposables
	private readonly disposables: vscode.Disposable[] = [];

	// ============================================================================
	// Static Factory (called by manager)
	// ============================================================================

	/**
	 * Create a new CanvasPanel
	 * This is called by RoopikExtensionManager, not directly
	 */
	public static create(
		extensionUri: vscode.Uri,
		canvasId: string,
		canvasName: string,
		manager: RoopikExtensionManager
	): CanvasPanel {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders) {
			throw new Error('No workspace folder found');
		}

		const workspaceRoot = workspaceFolders[0].uri.fsPath;
		const configManager = ConfigManager.getInstance(workspaceRoot);
		const config = configManager.getConfig();

		// Check max canvas limit
		if (manager.getOpenCount() >= config.performance.maxCanvases) {
			throw new Error(`Maximum ${config.performance.maxCanvases} canvases reached`);
		}

		// Create webview panel
		const column = vscode.window.activeTextEditor?.viewColumn || vscode.ViewColumn.One;
		const panel = vscode.window.createWebviewPanel(
			`roopikCanvas-${canvasId}`,
			canvasName,
			column,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [
					vscode.Uri.joinPath(extensionUri, 'out'),
					vscode.Uri.joinPath(extensionUri, 'webview', 'build')
				]
			}
		);

		return new CanvasPanel(panel, extensionUri, canvasId, canvasName, manager);
	}

	// ============================================================================
	// Constructor (private - use static create())
	// ============================================================================

	private constructor(
		panel: vscode.WebviewPanel,
		extensionUri: vscode.Uri,
		canvasId: string,
		canvasName: string,
		manager: RoopikExtensionManager
	) {
		this.panel = panel;
		this.extensionUri = extensionUri;
		this.canvasId = canvasId;
		this.canvasName = canvasName;
		this.manager = manager;

		this.logger = Logger.getInstance().createScoped(`Canvas-${canvasId}`);

		// Set initial HTML
		this.updateWebview();

		// Handle panel disposal
		this.panel.onDidDispose(() => this.handleDispose(), null, this.disposables);

		// Handle messages from webview
		this.panel.webview.onDidReceiveMessage(
			message => this.handleWebviewMessage(message),
			null,
			this.disposables
		);

		// Handle panel visibility changes (focus)
		this.panel.onDidChangeViewState(
			e => {
				if (e.webviewPanel.active) {
					this.manager.onPanelFocused(this.canvasId);
				}
			},
			null,
			this.disposables
		);

		this.logger.info(`Panel created for canvas: ${canvasName}`);
	}

	// ============================================================================
	// Public Methods (called by manager)
	// ============================================================================

	/**
	 * Reveal/focus this panel
	 */
	public reveal(): void {
		this.panel.reveal();
	}

	/**
	 * Update the panel title
	 */
	public updateTitle(newTitle: string): void {
		this.panel.title = newTitle;
	}

	/**
	 * Get canvas ID
	 */
	public getCanvasId(): string {
		return this.canvasId;
	}

	// ============================================================================
	// Event Handlers (called by manager when events are routed)
	// ============================================================================

	/**
	 * Handle component created event (routed from manager)
	 */
	public onComponentCreated(event: ComponentCreatedEvent): void {
		this.logger.debug(`Component created: ${event.componentId}`);
		this.postToWebview('componentCreated', event);
	}

	/**
	 * Handle component built event (routed from manager)
	 */
	public onComponentBuilt(event: ComponentBuildEvent): void {
		this.logger.debug(`Component built: ${event.componentId}, success: ${event.success}`);

		if (event.success) {
			// Fetch bundled code and send to webview
			this.manager.getBundledCode(event.componentId).then(bundledCode => {
				this.postToWebview('componentBuilt', {
					...event,
					bundledCode
				});
			}).catch(err => {
				this.logger.error(`Failed to get bundled code: ${err}`);
				this.postToWebview('componentError', {
					componentId: event.componentId,
					error: `Failed to get bundled code: ${err.message}`
				});
			});
		} else {
			this.postToWebview('componentError', {
				componentId: event.componentId,
				error: event.errorInfo?.message || 'Build failed'
			});
		}
	}

	/**
	 * Handle component deleted event (routed from manager)
	 */
	public onComponentDeleted(event: ComponentDeletedEvent): void {
		this.logger.debug(`Component deleted: ${event.componentId}`);
		this.postToWebview('componentDeleted', event);
	}

	/**
	 * Handle component updated event (routed from manager)
	 */
	public onComponentUpdated(event: ComponentUpdatedEvent): void {
		this.logger.debug(`Component updated: ${event.componentId}`);
		this.postToWebview('componentUpdated', event);
	}

	// ============================================================================
	// Webview Communication
	// ============================================================================

	/**
	 * Post a message to the webview
	 */
	private postToWebview(type: string, payload: unknown): void {
		this.panel.webview.postMessage({ type, payload });
	}

	/**
	 * Handle messages from webview
	 */
	private async handleWebviewMessage(message: { type: string; payload?: unknown }): Promise<void> {
		this.logger.debug(`Webview message: ${message.type}`);

		try {
			switch (message.type) {
				case 'createComponent':
					await this.handleCreateComponent(message.payload as {
						name: string;
						sourceData: unknown;
						position?: { x: number; y: number };
					});
					break;

				case 'rebuildComponent':
					await this.handleRebuildComponent(message.payload as { componentId: string });
					break;

				case 'deleteComponent':
					await this.handleDeleteComponent(message.payload as { componentId: string });
					break;

				case 'updateComponentSource':
					await this.handleUpdateComponentSource(message.payload as {
						componentId: string;
						files: Record<string, string>;
					});
					break;

				case 'getComponentSource':
					await this.handleGetComponentSource(message.payload as { componentId: string });
					break;

				case 'saveCanvas':
					// Canvas state is now managed by Core, but we might still need
					// to save viewport position locally
					this.logger.debug('Canvas save requested (viewport state)');
					break;

				case 'error':
					this.handleWebviewError(message.payload);
					break;

				default:
					this.logger.warn(`Unknown webview message type: ${message.type}`);
			}
		} catch (error) {
			this.logger.error(`Error handling webview message: ${error}`);
			this.postToWebview('error', {
				message: error instanceof Error ? error.message : String(error)
			});
		}
	}

	/**
	 * Handle create component request from webview
	 */
	private async handleCreateComponent(payload: {
		name: string;
		sourceData: unknown;
		position?: { x: number; y: number };
	}): Promise<void> {
		this.logger.info(`Creating component: ${payload.name}`);

		const component = await this.manager.createComponent({
			canvasId: this.canvasId,
			name: payload.name,
			sourceData: payload.sourceData as any,
			position: payload.position
		});

		// Component created - onComponentCreated event will be routed back
		this.logger.info(`Component creation initiated: ${component.id}`);
	}

	/**
	 * Handle rebuild component request from webview
	 */
	private async handleRebuildComponent(payload: { componentId: string }): Promise<void> {
		this.logger.info(`Rebuilding component: ${payload.componentId}`);

		// Notify webview that build is starting
		this.postToWebview('componentBuilding', { componentId: payload.componentId });

		await this.manager.rebuildComponent(payload.componentId);
		// onComponentBuilt event will be routed back with result
	}

	/**
	 * Handle delete component request from webview
	 */
	private async handleDeleteComponent(payload: { componentId: string }): Promise<void> {
		this.logger.info(`Deleting component: ${payload.componentId}`);
		await this.manager.deleteComponent(payload.componentId);
		// onComponentDeleted event will be routed back
	}

	/**
	 * Handle update component source request from webview
	 */
	private async handleUpdateComponentSource(payload: {
		componentId: string;
		files: Record<string, string>;
	}): Promise<void> {
		this.logger.info(`Updating component source: ${payload.componentId}`);
		await this.manager.updateComponentSource(payload.componentId, payload.files);
		// This triggers rebuild, onComponentBuilt event will be routed back
	}

	/**
	 * Handle get component source request from webview
	 */
	private async handleGetComponentSource(payload: { componentId: string }): Promise<void> {
		this.logger.info(`Getting component source: ${payload.componentId}`);
		const source = await this.manager.getComponentSource(payload.componentId);
		this.postToWebview('componentSource', {
			componentId: payload.componentId,
			files: source
		});
	}

	/**
	 * Handle error from webview
	 */
	private handleWebviewError(payload: unknown): void {
		const errorMessage = typeof payload === 'string'
			? payload
			: (payload as { message?: string })?.message || JSON.stringify(payload);

		this.logger.error(`Webview error: ${errorMessage}`);
		vscode.window.showErrorMessage(`Canvas error: ${errorMessage}`);
	}

	// ============================================================================
	// Webview HTML
	// ============================================================================

	/**
	 * Update webview HTML content
	 */
	private updateWebview(): void {
		this.panel.webview.html = this.getHtmlForWebview();
	}

	/**
	 * Generate HTML for webview
	 */
	private getHtmlForWebview(): string {
		const webview = this.panel.webview;

		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, 'webview', 'build', 'assets', 'componentView.js')
		);
		const styleUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, 'webview', 'build', 'assets', 'componentView.css')
		);

		// CSP: Allow esm.sh for CDN imports in sandbox iframes
		const csp = `
			default-src 'none';
			style-src ${webview.cspSource} 'unsafe-inline';
			script-src ${webview.cspSource} 'unsafe-inline' 'unsafe-eval' https://esm.sh https://cdn.skypack.dev;
			font-src ${webview.cspSource};
			img-src ${webview.cspSource} data: https:;
			connect-src https://esm.sh https://cdn.skypack.dev;
			frame-src blob: data: https:;
		`;

		// Pass canvas identity to React app
		const canvasConfig = {
			canvasId: this.canvasId,
			canvasName: this.canvasName
		};

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="${csp.replace(/\s+/g, ' ').trim()}">
	<style>
		body {
			color: var(--vscode-foreground);
			background-color: var(--vscode-editor-background);
		}
	</style>
	<link href="${styleUri}" rel="stylesheet">
	<title>Roopik Canvas - ${this.canvasName}</title>
</head>
<body>
	<div id="root"></div>
	<script type="module" src="${scriptUri}"></script>
	<script>
		// Pass canvas identity to React app
		window.CANVAS_CONFIG = ${JSON.stringify(canvasConfig)};
	</script>
</body>
</html>`;
	}

	// ============================================================================
	// Disposal
	// ============================================================================

	/**
	 * Handle panel disposal
	 */
	private handleDispose(): void {
		this.logger.debug('Panel disposing...');

		// Notify manager
		this.manager.onPanelDisposed(this.canvasId);

		// Dispose all disposables
		while (this.disposables.length) {
			const disposable = this.disposables.pop();
			disposable?.dispose();
		}

		this.logger.debug('Panel disposed');
	}

	/**
	 * Dispose the panel
	 */
	public dispose(): void {
		this.panel.dispose();
		// handleDispose will be called via onDidDispose
	}
}
