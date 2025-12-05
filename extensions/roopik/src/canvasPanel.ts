/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ConfigManager } from './config';
import { Logger } from './logger';
import { CoreBridgeService } from './services/CoreBridgeService';
import { CanvasStateManager, type CanvasState } from './services/CanvasStateManager';
import type { ComponentInput } from './types/pipeline';

// Re-export CanvasState for external use
export type { CanvasState } from './services/CanvasStateManager';

/**
 * Manages Canvas webview panels with ID-based singleton pattern
 * Each canvas ID can have only one panel, but multiple canvas IDs can exist simultaneously
 *
 * Architecture:
 * - Core handles: Activity pane, welcome screen, canvas name prompts, command palette
 * - Extension handles: Canvas webview rendering, state management via CanvasStateManager
 * - Communication: Core calls roopik.canvas.open with canvas name, extension renders
 */
export class CanvasPanel {
	// ID-based map instead of global singleton
	private static panels: Map<string, CanvasPanel> = new Map();

	// State Manager (singleton for all canvases)
	private static stateManager: CanvasStateManager | null = null;

	// Event emitter for canvas open/close events
	private static readonly onDidChangePanelsEmitter = new vscode.EventEmitter<void>();
	public static readonly onDidChangePanels = CanvasPanel.onDidChangePanelsEmitter.event;

	/**
	 * Initialize the canvas system
	 * Called once during extension activation
	 */
	public static initializePreviewSystem(_context: vscode.ExtensionContext) {
		// Initialize state manager
		CanvasPanel.stateManager = CanvasStateManager.getInstance();
		CanvasPanel.stateManager.initialize();

		Logger.getInstance().info('CanvasPanel', 'Canvas system initialized');
	}

	private readonly _panel: vscode.WebviewPanel;
	private _disposables: vscode.Disposable[] = [];
	private readonly canvasId: string;
	private readonly canvasName: string;
	private readonly extensionUri: vscode.Uri;
	private canvasState: CanvasState;
	private logger: ReturnType<typeof Logger.prototype.createScoped>;

	/**
	 * Create or show a canvas panel by name
	 * @param extensionUri - Extension URI for loading resources
	 * @param canvasId - Unique canvas identifier (slug)
	 * @param canvasName - Display name for the canvas
	 */
	public static createOrShow(
		extensionUri: vscode.Uri,
		canvasId: string,
		canvasName?: string
	) {
		try {
			const column = vscode.window.activeTextEditor
				? vscode.window.activeTextEditor.viewColumn
				: undefined;

			// Get workspace root for config
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (!workspaceFolders) {
				vscode.window.showErrorMessage('Please open a workspace folder first.');
				return;
			}
			const workspaceRoot = workspaceFolders[0].uri.fsPath;
			const configManager = ConfigManager.getInstance(workspaceRoot);
			const config = configManager.getConfig();

			// If this specific canvas already exists, show it
			const existingPanel = CanvasPanel.panels.get(canvasId);
			if (existingPanel) {
				existingPanel._panel.reveal(column);
				// Notify listeners (in case dashboard needs to update focus state)
				CanvasPanel.onDidChangePanelsEmitter.fire();
				return;
			}

			// Check max canvas limit before creating new
			if (CanvasPanel.panels.size >= config.performance.maxCanvases) {
				vscode.window.showWarningMessage(
					`Maximum ${config.performance.maxCanvases} canvases reached. Close some before opening new ones.`,
					'Close All Canvases'
				).then(selection => {
					if (selection === 'Close All Canvases') {
						CanvasPanel.closeAll();
					}
				});
				return;
			}

			// Warning at threshold
			if (CanvasPanel.panels.size >= config.performance.warnAtCanvases) {
				vscode.window.showInformationMessage(
					`You have ${CanvasPanel.panels.size + 1} canvases open. Performance may be affected.`
				);
			}

			// Create new panel with unique viewType per canvas ID
			const displayName = canvasName || canvasId;
			const panel = vscode.window.createWebviewPanel(
				`roopikCanvas-${canvasId}`,
				displayName,
				column || vscode.ViewColumn.One,
				{
					enableScripts: true,
					retainContextWhenHidden: true,
					localResourceRoots: [
						vscode.Uri.joinPath(extensionUri, 'out'),
						vscode.Uri.joinPath(extensionUri, 'webview', 'build')
					]
				}
			);

			// Create new canvas panel instance
			const canvasPanel = new CanvasPanel(panel, extensionUri, canvasId, displayName);
			CanvasPanel.panels.set(canvasId, canvasPanel);

			// Notify listeners that panels changed
			CanvasPanel.onDidChangePanelsEmitter.fire();

			Logger.getInstance().info('CanvasPanel', `Canvas "${displayName}" created. Total canvases: ${CanvasPanel.panels.size}`);
		} catch (error) {
			Logger.getInstance().error('CanvasPanel', 'Error in createOrShow', error);
			vscode.window.showErrorMessage(`Failed to create canvas: ${error}`);
		}
	}

	/**
	 * Close all canvas panels
	 */
	public static closeAll() {
		CanvasPanel.panels.forEach(panel => panel.dispose());
		CanvasPanel.panels.clear();
		// Notify listeners that all panels closed
		CanvasPanel.onDidChangePanelsEmitter.fire();
		Logger.getInstance().info('CanvasPanel', 'All canvases closed');
	}

	/**
	 * Get all open canvas IDs
	 */
	public static getOpenCanvasIds(): string[] {
		return Array.from(CanvasPanel.panels.keys());
	}

	/**
	 * Get count of open canvases
	 */
	public static getOpenCount(): number {
		return CanvasPanel.panels.size;
	}

	/**
	 * Get a canvas panel by ID
	 */
	public static getPanel(canvasId: string): CanvasPanel | undefined {
		return CanvasPanel.panels.get(canvasId);
	}

	/**
	 * Send a message to this canvas's webview
	 */
	public postMessage(message: { type: string; payload: unknown }): void {
		this._panel.webview.postMessage(message);
	}

	private constructor(
		panel: vscode.WebviewPanel,
		extensionUri: vscode.Uri,
		canvasId: string,
		canvasName: string
	) {
		this._panel = panel;
		this.extensionUri = extensionUri;
		this.canvasId = canvasId;
		this.canvasName = canvasName;

		this.logger = Logger.getInstance().createScoped(`Canvas-${canvasId}`);

		// Load or create canvas state using CanvasStateManager
		this.canvasState = this.loadOrCreateState();

		// Set the webview's initial html content
		this._update();

		// Listen for when the panel is disposed
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

		// Handle messages from the webview
		this._panel.webview.onDidReceiveMessage(
			async message => {
				switch (message.type) {
					case 'saveCanvas':
						await this.handleSaveCanvas(message.payload);
						break;
					case 'buildComponent':
						await this.handleBuildComponent(message.payload);
						break;
					case 'error':
						this.handleError(message.message || message.error);
						break;
				}
			},
			null,
			this._disposables
		);
	}

	/**
	 * Load canvas state from disk or create new using CanvasStateManager
	 */
	private loadOrCreateState(): CanvasState {
		const stateManager = CanvasStateManager.getInstance();

		// Try to load existing canvas
		const existingState = stateManager.loadCanvasSync(this.canvasName);
		if (existingState) {
			this.logger.info('State loaded from disk');
			return existingState;
		}

		// Create new state
		const now = Date.now();
		const newState: CanvasState = {
			id: `canvas-${now}`,
			name: this.canvasName,
			sandboxes: [],
			selectedSandboxId: null,
			viewport: { x: 0, y: 0, scale: 1 },
			createdAt: now,
			updatedAt: now
		};

		// Save new state
		stateManager.saveCanvasSync(this.canvasName, newState);
		this.logger.info('New state created');

		return newState;
	}

	/**
	 * Handle errors from webview
	 */
	private handleError(error: unknown) {
		this.logger.error('Webview error', error);

		// Extract error message
		const errorMessage = typeof error === 'string'
			? error
			: (error as Error)?.message || JSON.stringify(error);

		// Show error message but don't crash
		vscode.window.showErrorMessage(
			`Error in canvas "${this.canvasState.name}": ${errorMessage}`
		);
	}

	/**
	 * Handle saveCanvas message from webview (auto-save from React app)
	 * This is the main save handler used by ComponentView.tsx
	 */
	private async handleSaveCanvas(payload: { canvasId: string; state: CanvasState }) {
		try {
			const { state } = payload;
			this.logger.debug(`Saving canvas state: ${state.sandboxes?.length || 0} sandboxes`);

			// Update canvas state
			this.canvasState = {
				...this.canvasState,
				sandboxes: state.sandboxes || [],
				selectedSandboxId: state.selectedSandboxId,
				viewport: state.viewport || this.canvasState.viewport,
				backgroundColor: state.backgroundColor,
				backgroundPattern: state.backgroundPattern,
				updatedAt: Date.now()
			};

			// Persist to disk
			const stateManager = CanvasStateManager.getInstance();
			stateManager.saveCanvasSync(this.canvasName, this.canvasState);

			this.logger.debug('Canvas state saved successfully');
		} catch (error) {
			this.logger.error('Failed to save canvas state', error);
			this.handleError(error);
		}
	}

	/**
	 * Handle build component request via Core's ESBuild pipeline
	 */
	private async handleBuildComponent(payload: { componentId: string; input: ComponentInput }) {
		const { componentId, input } = payload;

		this.logger.info(`📥 Build request received: ${componentId}`, {
			inputId: input.id,
			framework: input.framework,
			files: Object.keys(input.files),
			dependencies: input.dependencies
		});

		try {
			// Build via Core pipeline
			this.logger.debug(`🔨 Calling Core pipeline for: ${componentId}`);
			const coreBridge = CoreBridgeService.getInstance();
			const result = await coreBridge.buildComponent(input);

			this.logger.info(`✅ Build success: ${componentId}`, {
				framework: result.framework,
				bundledCodeLength: result.bundledCode?.length || 0,
				cdnUrls: result.cdnUrls,
				transformTime: result.metadata?.transformTime
			});

			// Log first 300 chars of bundled code for debugging
			if (result.bundledCode) {
				this.logger.debug(`📦 Bundled code preview: ${result.bundledCode.substring(0, 300)}...`);
			}

			// Send success response to webview
			this._panel.webview.postMessage({
				type: 'componentBuilt',
				payload: {
					componentId,
					result
				}
			});
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			this.logger.error(`❌ Build failed: ${componentId}`, { error: errorMsg });

			// Send error response to webview
			this._panel.webview.postMessage({
				type: 'componentError',
				payload: {
					componentId,
					error: errorMsg
				}
			});
		}
	}

	public dispose() {
		this.logger.debug('Disposing...');

		// Remove from map
		CanvasPanel.panels.delete(this.canvasId);

		// Save final state
		const stateManager = CanvasStateManager.getInstance();
		stateManager.saveCanvasSync(this.canvasName, this.canvasState);

		// Notify listeners that panels changed (before disposing)
		CanvasPanel.onDidChangePanelsEmitter.fire();

		// Clean up panel
		this._panel.dispose();

		while (this._disposables.length) {
			const disposable = this._disposables.pop();
			if (disposable) {
				disposable.dispose();
			}
		}

		this.logger.debug(`Disposed. Remaining canvases: ${CanvasPanel.panels.size}`);
	}

	private _update() {
		const webview = this._panel.webview;
		this._panel.webview.html = this._getHtmlForWebview(webview);
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
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

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="${csp.replace(/\s+/g, ' ').trim()}">
	<style>
		/* VS Code CSS variables are automatically available in webviews */
		body {
			color: var(--vscode-foreground);
			background-color: var(--vscode-editor-background);
		}
	</style>
	<link href="${styleUri}" rel="stylesheet">
	<title>Roopik Canvas - ${this.canvasState.name}</title>
</head>
<body>
	<div id="root"></div>
	<script type="module" src="${scriptUri}"></script>
	<script>
		// Pass canvas state to React app
		window.CANVAS_STATE = ${JSON.stringify(this.canvasState)};
	</script>
</body>
</html>`;
	}
}
