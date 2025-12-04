/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { CoreBridgeService } from '../services/CoreBridgeService';
import { CanvasStateManager, CanvasState } from '../services/CanvasStateManager';
import { Logger } from '../services/Logger';
import type {
	WebviewMessage,
	ExtensionMessage,
	WebviewBuildComponentMessage,
	WebviewOpenFileMessage,
	WebviewLogMessage
} from '../types/messages';
import type { ComponentInput } from '../types/pipeline';

/** Save canvas message from webview */
interface WebviewSaveCanvasMessage {
	type: 'saveCanvas';
	payload: {
		canvasId: string;
		state: CanvasState;
	};
}

/** Canvas loaded message to webview */
interface ExtensionCanvasLoadedMessage {
	type: 'canvasLoaded';
	payload: {
		state: CanvasState;
	};
}

/** Canvas saved confirmation to webview */
interface ExtensionCanvasSavedMessage {
	type: 'canvasSaved';
	payload: {
		success: boolean;
	};
}

/** Add imported component to canvas */
interface ExtensionAddImportedComponentMessage {
	type: 'addImportedComponent';
	payload: {
		componentInput: ComponentInput;
		position?: { x: number; y: number };
		/** If true, replace existing component with same originalPath */
		replaceExisting?: boolean;
		/** Component name being replaced */
		replaceName?: string;
	};
}

/** Extended message type including canvas messages */
type CanvasExtensionMessage = ExtensionMessage | ExtensionCanvasLoadedMessage | ExtensionCanvasSavedMessage | ExtensionAddImportedComponentMessage;

/**
 * CanvasPanel - WebviewPanel wrapper for the infinite canvas
 *
 * This is a CLEAN wrapper that loads the Vite-built React app.
 * All UI logic lives in the webview (webview/src/canvasView/)
 *
 * Key feature: retainContextWhenHidden preserves state across tab switches!
 *
 * Architecture:
 * - UI rendering: Happens in webview (60fps, local React components)
 * - GridManager: Runs in webview for 60fps snap (no IPC during drag!)
 * - Heavy processing: Delegates to Core via CoreBridgeService
 * - State persistence: File-based via CanvasStateManager
 */
export class CanvasPanel {
	private readonly panel: vscode.WebviewPanel;
	private readonly extensionUri: vscode.Uri;
	private readonly coreBridge: CoreBridgeService;
	private readonly stateManager: CanvasStateManager;
	private readonly canvasName: string;
	private readonly initialState: CanvasState;
	private readonly logger = Logger.getInstance().createScoped('CanvasPanel');
	private disposed = false;

	constructor(extensionUri: vscode.Uri, canvasName: string, initialState: CanvasState) {
		this.extensionUri = extensionUri;
		this.canvasName = canvasName;
		this.initialState = initialState;
		this.coreBridge = CoreBridgeService.getInstance();
		this.stateManager = CanvasStateManager.getInstance();

		this.panel = vscode.window.createWebviewPanel(
			'roopikCanvas',
			canvasName,
			vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true, // Key for persistence!
				localResourceRoots: [
					vscode.Uri.joinPath(extensionUri, 'dist'),
					vscode.Uri.joinPath(extensionUri, 'webview', 'dist')
				]
			}
		);

		this.panel.webview.html = this.getHtml();
		this.panel.webview.onDidReceiveMessage(this.handleMessage.bind(this));
		this.panel.onDidDispose(() => this.dispose());

		this.logger.info(`Created canvas: ${canvasName}`, { id: initialState.id });
	}

	reveal(): void {
		this.panel.reveal();
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.panel.dispose();
	}

	onDidDispose(callback: () => void): void {
		this.panel.onDidDispose(callback);
	}

	/**
	 * Add an imported component to the canvas
	 * Called from extension.ts after ImportHandler processes a file
	 * @param replaceExisting If true, replace existing sandbox with same component name
	 * @param replaceName Name of the component being replaced
	 */
	addImportedComponent(
		componentInput: ComponentInput,
		position?: { x: number; y: number },
		replaceExisting?: boolean,
		replaceName?: string
	): void {
		this.logger.info(`Adding imported component: ${componentInput.id}`, {
			framework: componentInput.framework,
			files: Object.keys(componentInput.files),
			replaceExisting,
			replaceName
		});

		this.postMessage({
			type: 'addImportedComponent',
			payload: {
				componentInput,
				position,
				replaceExisting,
				replaceName
			}
		});
	}

	/**
	 * Send message to webview
	 */
	private postMessage(message: CanvasExtensionMessage): void {
		this.panel.webview.postMessage(message);
	}

	/**
	 * Handle messages from webview
	 */
	private async handleMessage(message: WebviewMessage | WebviewSaveCanvasMessage): Promise<void> {
		this.logger.debug(`Message: ${message.type}`);

		switch (message.type) {
			case 'ready':
				this.logger.info('Webview ready, sending initial state');
				// Send the initial canvas state to webview
				this.postMessage({
					type: 'canvasLoaded',
					payload: {
						state: this.initialState
					}
				});
				break;

			case 'buildComponent':
				await this.handleBuildComponent(message as WebviewBuildComponentMessage);
				break;

			case 'saveCanvas':
				await this.handleSaveCanvas(message as WebviewSaveCanvasMessage);
				break;

			case 'openFile':
				await this.handleOpenFile(message as WebviewOpenFileMessage);
				break;

			case 'log':
				this.handleLog(message as WebviewLogMessage);
				break;
		}
	}

	/**
	 * Save canvas state to file
	 */
	private async handleSaveCanvas(message: WebviewSaveCanvasMessage): Promise<void> {
		const { state } = message.payload;

		this.logger.debug(`Saving canvas: ${this.canvasName}`, {
			sandboxCount: state.sandboxes.length
		});

		try {
			await this.stateManager.saveCanvas(this.canvasName, state);
			this.postMessage({
				type: 'canvasSaved',
				payload: { success: true }
			});
			this.logger.info(`Canvas saved: ${this.canvasName}`);
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			this.logger.error(`Failed to save canvas: ${this.canvasName}`, { error: errorMsg });
			this.postMessage({
				type: 'canvasSaved',
				payload: { success: false }
			});
		}
	}

	/**
	 * Build component via Core's ESBuild pipeline
	 */
	private async handleBuildComponent(message: WebviewBuildComponentMessage): Promise<void> {
		const { componentId, input } = message.payload;

		this.logger.info(`📥 Build request received: ${componentId}`, {
			inputId: input.id,
			framework: input.framework,
			files: Object.keys(input.files),
			dependencies: input.dependencies
		});

		try {
			// Build via Core pipeline
			this.logger.debug(`🔨 Calling Core pipeline for: ${componentId}`);
			const result = await this.coreBridge.buildComponent(input);

			this.logger.info(`✅ Build success: ${componentId}`, {
				framework: result.framework,
				bundledCodeLength: result.bundledCode?.length || 0,
				cdnUrls: result.cdnUrls,
				transformTime: result.metadata?.transformTime
			});

			// Log first 300 chars of bundled code
			if (result.bundledCode) {
				this.logger.debug(`📦 Bundled code preview: ${result.bundledCode.substring(0, 300)}...`);
			}

			// Send success response
			this.postMessage({
				type: 'componentBuilt',
				payload: {
					componentId,
					result
				}
			});
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			this.logger.error(`❌ Build failed: ${componentId}`, { error: errorMsg });

			// Send error response
			this.postMessage({
				type: 'componentError',
				payload: {
					componentId,
					error: errorMsg
				}
			});
		}
	}

	/**
	 * Open file in editor
	 */
	private async handleOpenFile(message: WebviewOpenFileMessage): Promise<void> {
		const { filePath, line, column } = message.payload;
		await this.coreBridge.openFile(filePath, line, column);
	}

	/**
	 * Handle log messages from webview
	 */
	private handleLog(message: WebviewLogMessage): void {
		const { level, message: text, data } = message.payload;

		switch (level) {
			case 'error':
				this.logger.error(`[Webview] ${text}`, data);
				break;
			case 'warn':
				this.logger.warn(`[Webview] ${text}`, data);
				break;
			case 'debug':
				this.logger.debug(`[Webview] ${text}`, data);
				break;
			default:
				this.logger.info(`[Webview] ${text}`, data);
		}
	}

	/**
	 * Generate webview HTML - loads Vite-built React app
	 * NO inline HTML/CSS/JS - all UI lives in webview/src/canvasView/
	 */
	private getHtml(): string {
		const webview = this.panel.webview;

		// Get URIs for the Vite-built assets
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, 'webview', 'dist', 'assets', 'canvasView.js')
		);
		const styleUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, 'webview', 'dist', 'assets', 'canvasView.css')
		);

		// Content Security Policy
		const cspSource = webview.cspSource;

		// CSP: Allow esm.sh for CDN imports in sandbox iframes
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="
		default-src 'none';
		style-src ${cspSource} 'unsafe-inline';
		script-src ${cspSource} 'unsafe-inline' 'unsafe-eval' https://esm.sh https://cdn.skypack.dev;
		frame-src blob: data: https:;
		connect-src https://esm.sh https://cdn.skypack.dev;
		img-src ${cspSource} data: https:;
	">
	<link rel="stylesheet" href="${styleUri}">
	<title>Roopik Canvas</title>
</head>
<body>
	<div id="root"></div>
	<script type="module" src="${scriptUri}"></script>
</body>
</html>`;
	}
}
