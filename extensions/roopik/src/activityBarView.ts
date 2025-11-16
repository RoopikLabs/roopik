/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { CanvasPanel } from './canvasPanel';

/**
 * Activity Bar Webview View Provider
 *
 * Provides a compact view in the Activity Bar sidebar showing:
 * - Quick stats (total canvases, open canvases)
 * - Quick action buttons (Dashboard, New Canvas, Show Open)
 */
export class ActivityBarViewProvider implements vscode.WebviewViewProvider {
	private workspaceRoot: string;

	constructor(workspaceRoot: string) {
		this.workspaceRoot = workspaceRoot;
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
					vscode.commands.executeCommand('roopik.openCanvas');
					break;
				case 'newCanvas':
					vscode.commands.executeCommand('roopik.newCanvas');
					break;
				case 'showCanvases':
					vscode.commands.executeCommand('roopik.showCanvases');
					break;
			}
		});
	}

	/**
	 * Generate HTML content for the Activity Bar view
	 */
	private getHtmlContent(): string {
		const totalCanvases = CanvasPanel.getAllCanvasStates(this.workspaceRoot).length;
		const openCanvases = CanvasPanel.getOpenCount();

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<style>
		body {
			padding: 16px;
			color: var(--vscode-foreground);
			font-family: var(--vscode-font-family);
			font-size: 13px;
		}

		.stats {
			margin-bottom: 16px;
			padding: 12px;
			background-color: var(--vscode-editor-inactiveSelectionBackground);
			border-radius: 4px;
		}

		.stat-item {
			display: flex;
			justify-content: space-between;
			margin-bottom: 4px;
			font-size: 12px;
		}

		.stat-item:last-child {
			margin-bottom: 0;
		}

		button {
			width: 100%;
			padding: 10px;
			background-color: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			border: none;
			border-radius: 4px;
			cursor: pointer;
			font-size: 14px;
			font-weight: 500;
			margin-bottom: 8px;
			transition: background-color 0.2s ease;
		}

		button:hover {
			background-color: var(--vscode-button-hoverBackground);
		}

		button:last-child {
			margin-bottom: 0;
		}
	</style>
</head>
<body>
	<div class="stats">
		<div class="stat-item">
			<span>Total Canvases</span>
			<strong>${totalCanvases}</strong>
		</div>
		<div class="stat-item">
			<span>Open Canvases</span>
			<strong>${openCanvases}</strong>
		</div>
	</div>

	<button onclick="openDashboard()">Dashboard</button>
	<button onclick="newCanvas()">New Canvas</button>
	<button onclick="showCanvases()">Show Open</button>

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
	</script>
</body>
</html>`;
	}
}
