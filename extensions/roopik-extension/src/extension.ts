/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { CanvasPanel } from './panels/CanvasPanel';

let canvasPanel: CanvasPanel | undefined;

/**
 * Extension activation - called when Core triggers roopik.canvas.open
 */
export function activate(context: vscode.ExtensionContext): void {
	console.log('[Roopik Canvas] Extension activating...');

	// Main command - opens the canvas webview panel
	context.subscriptions.push(
		vscode.commands.registerCommand('roopik.canvas.open', () => {
			if (canvasPanel) {
				canvasPanel.reveal();
			} else {
				canvasPanel = new CanvasPanel(context.extensionUri);
				canvasPanel.onDidDispose(() => {
					canvasPanel = undefined;
				});
			}
		})
	);

	console.log('[Roopik Canvas] Extension activated');
}

export function deactivate(): void {
	canvasPanel?.dispose();
}
