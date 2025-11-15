/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Manages the Canvas webview panel
 * This is where the React app will render for visual component design
 */
export class CanvasPanel {
	public static currentPanel: CanvasPanel | undefined;
	private readonly _panel: vscode.WebviewPanel;
	private _disposables: vscode.Disposable[] = [];

	public static createOrShow(extensionUri: vscode.Uri) {
		const column = vscode.window.activeTextEditor
			? vscode.window.activeTextEditor.viewColumn
			: undefined;

		// If we already have a panel, show it
		if (CanvasPanel.currentPanel) {
			CanvasPanel.currentPanel._panel.reveal(column);
			return;
		}

		// Otherwise, create a new panel
		const panel = vscode.window.createWebviewPanel(
			'roopikCanvas',
			'Roopik Canvas',
			column || vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [
					vscode.Uri.joinPath(extensionUri, 'out'),
					vscode.Uri.joinPath(extensionUri, 'webview-ui', 'build')
				]
			}
		);

		CanvasPanel.currentPanel = new CanvasPanel(panel, extensionUri);
	}

	private constructor(panel: vscode.WebviewPanel, _extensionUri: vscode.Uri) {
		this._panel = panel;

		// Set the webview's initial html content
		this._update();

		// Listen for when the panel is disposed
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

		// Handle messages from the webview
		this._panel.webview.onDidReceiveMessage(
			message => {
				switch (message.type) {
					case 'alert':
						vscode.window.showInformationMessage(message.text);
						break;
					case 'log':
						console.log('[Webview]', message.text);
						break;
				}
			},
			null,
			this._disposables
		);
	}

	public dispose() {
		CanvasPanel.currentPanel = undefined;

		this._panel.dispose();

		while (this._disposables.length) {
			const disposable = this._disposables.pop();
			if (disposable) {
				disposable.dispose();
			}
		}
	}

	private _update() {
		const webview = this._panel.webview;
		this._panel.webview.html = this._getHtmlForWebview(webview);
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this._panel.webview.options.localResourceRoots![1], 'assets', 'index.js')
		);
		const styleUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this._panel.webview.options.localResourceRoots![1], 'assets', 'index.css')
		);

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src ${webview.cspSource};">
	<link href="${styleUri}" rel="stylesheet">
	<title>Roopik Canvas</title>
</head>
<body>
	<div id="root"></div>
	<script type="module" src="${scriptUri}"></script>
</body>
</html>`;
	}
}
