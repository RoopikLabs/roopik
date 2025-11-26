/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Activity Bar Webview View Provider
 *
 * Provides a compact view in the Activity Bar sidebar showing:
 * - Quick action buttons (Dashboard, New Canvas, Show Open, Open Project)
 */
export class ActivityBarViewProvider implements vscode.WebviewViewProvider {
	constructor() {
		// No need to store workspace root
	}

	/**
	 * Resolve webview view when it's first shown
	 */
	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
	) {
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: []
		};

		// Set initial HTML content
		webviewView.webview.html = this.getHtmlContent();

		// Handle messages from the webview
		webviewView.webview.onDidReceiveMessage(message => {
			switch (message.command) {
				case 'openDashboard':
					vscode.commands.executeCommand('roopik.extension.openCanvas');
					break;
				case 'newCanvas':
					vscode.commands.executeCommand('roopik.extension.newCanvas');
					break;
				case 'showCanvases':
					vscode.commands.executeCommand('roopik.extension.showCanvases');
					break;
				case 'openProject':
					vscode.commands.executeCommand('roopik.extension.openProjectPreview');
					break;
			}
		});
	}

	/**
	 * Generate HTML content for the Activity Bar view
	 */
	private getHtmlContent(): string {
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<style>
		body {
			padding: 12px;
			color: var(--vscode-foreground);
			font-family: var(--vscode-font-family);
			font-size: 13px;
		}

		.button-list {
			display: flex;
			flex-direction: column;
			gap: 4px;
		}

		button {
			width: 100%;
			padding: 8px 12px;
			background: transparent;
			color: var(--vscode-foreground);
			border: none;
			border-radius: 4px;
			cursor: pointer;
			font-size: 13px;
			font-weight: 400;
			text-align: left;
			transition: all 0.15s ease;
			display: flex;
			align-items: center;
			gap: 8px;
		}

		button:hover {
			background: var(--vscode-list-hoverBackground);
			color: var(--vscode-list-hoverForeground);
		}

		.button-icon {
			width: 16px;
			height: 16px;
			opacity: 0.8;
			flex-shrink: 0;
		}

		.button-icon svg {
			width: 100%;
			height: 100%;
			fill: currentColor;
		}
	</style>
</head>
<body>
	<div class="button-list">
		<button onclick="openDashboard()">
			<span class="button-icon">
				<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
					<path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>
				</svg>
			</span>
			<span>Dashboard</span>
		</button>
		<button onclick="newCanvas()">
			<span class="button-icon">
				<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
					<path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
				</svg>
			</span>
			<span>New Canvas</span>
		</button>
		<button onclick="showCanvases()">
			<span class="button-icon">
				<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
					<path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/>
				</svg>
			</span>
			<span>Show Open</span>
		</button>
		<button onclick="openProject()">
			<span class="button-icon">
				<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
					<path d="M8 5v14l11-7z"/>
				</svg>
			</span>
			<span>Open Project</span>
		</button>
	</div>

	<script>
		const vscode = acquireVsCodeApi();

		function openDashboard() {
			vscode.postMessage({ command: 'openDashboard' });
		}

		function newCanvas() {
			vscode.postMessage({ command: 'newCanvas' });
		}

		function showCanvases() {
			vscode.postMessage({ command: 'showCanvases' });
		}

		function openProject() {
			vscode.postMessage({ command: 'openProject' });
		}
	</script>
</body>
</html>`;
	}
}
