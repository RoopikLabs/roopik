/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { CoreBridgeService } from '../services/CoreBridgeService';
import { Logger } from '../services/Logger';
import type {
	WebviewMessage,
	ExtensionMessage,
	WebviewTransformCodeMessage,
	WebviewSaveCanvasMessage,
	WebviewLoadCanvasMessage,
	WebviewOpenFileMessage,
	WebviewLogMessage
} from '../types/messages';

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
 */
export class CanvasPanel {
	private readonly panel: vscode.WebviewPanel;
	private readonly extensionUri: vscode.Uri;
	private readonly coreBridge: CoreBridgeService;
	private readonly logger = Logger.getInstance().createScoped('CanvasPanel');
	private disposed = false;

	constructor(extensionUri: vscode.Uri) {
		this.extensionUri = extensionUri;
		this.coreBridge = CoreBridgeService.getInstance();

		this.panel = vscode.window.createWebviewPanel(
			'roopikCanvas',
			'Roopik Canvas',
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

		this.logger.info('Created with Vite-built React webview');
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
	 * Send message to webview
	 */
	private postMessage(message: ExtensionMessage): void {
		this.panel.webview.postMessage(message);
	}

	/**
	 * Handle messages from webview
	 */
	private async handleMessage(message: WebviewMessage): Promise<void> {
		this.logger.debug(`Message: ${message.type}`);

		switch (message.type) {
			case 'ready':
				this.logger.info('Webview ready');
				break;

			case 'transformCode':
				await this.handleTransformCode(message as WebviewTransformCodeMessage);
				break;

			case 'saveCanvas':
				await this.handleSaveCanvas(message as WebviewSaveCanvasMessage);
				break;

			case 'loadCanvas':
				await this.handleLoadCanvas(message as WebviewLoadCanvasMessage);
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
	 * Transform code via Core's ESBuild pipeline
	 */
	private async handleTransformCode(message: WebviewTransformCodeMessage): Promise<void> {
		const { code, componentId, options } = message.payload;

		const result = await this.coreBridge.transformCode(code, options);

		if (result.error) {
			this.postMessage({
				type: 'transformError',
				payload: { error: result.error, componentId }
			});
		} else {
			this.postMessage({
				type: 'transformComplete',
				payload: { html: result.html, componentId }
			});
		}
	}

	/**
	 * Save canvas state to disk
	 */
	private async handleSaveCanvas(message: WebviewSaveCanvasMessage): Promise<void> {
		const { canvasId, state } = message.payload;
		const success = await this.coreBridge.saveCanvasState(canvasId, state);

		this.postMessage({
			type: 'canvasSaved',
			payload: { success }
		});
	}

	/**
	 * Load canvas state from disk
	 */
	private async handleLoadCanvas(message: WebviewLoadCanvasMessage): Promise<void> {
		const { canvasId } = message.payload;
		const state = await this.coreBridge.loadCanvasState(canvasId);

		if (state) {
			this.postMessage({
				type: 'canvasLoaded',
				payload: { state }
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

		// CSP: Allow unsafe-inline/eval for React and Babel in sandbox iframes
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="
		default-src 'none';
		style-src ${cspSource} 'unsafe-inline';
		script-src ${cspSource} 'unsafe-inline' 'unsafe-eval' https://unpkg.com;
		frame-src blob: data: https:;
		connect-src https://unpkg.com;
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

