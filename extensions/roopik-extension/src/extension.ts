/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import { CanvasPanel } from './panels/CanvasPanel';
import { Logger, LogLevel } from './services/Logger';

let canvasPanel: CanvasPanel | undefined;
let logger: Logger;

/**
 * Extension activation - called when Core triggers roopik.canvas.open
 */
export function activate(context: vscode.ExtensionContext): void {
	// Initialize Logger first
	const workspaceFolders = vscode.workspace.workspaceFolders;
	const logDirectory = workspaceFolders
		? path.join(workspaceFolders[0].uri.fsPath, '.roopik', 'logs')
		: path.join(context.extensionPath, 'logs');

	logger = Logger.getInstance({
		level: LogLevel.DEBUG, // Debug level during development
		enableFileLogging: true,
		logDirectory,
		maxLogFileSize: 5 * 1024 * 1024, // 5MB
		maxLogFiles: 5,
		showOutputChannel: false
	});

	logger.info('Extension', 'Roopik Canvas extension activating...');

	// Dispose logger on deactivation
	context.subscriptions.push({
		dispose: () => logger.dispose()
	});

	// Main command - opens the canvas webview panel
	context.subscriptions.push(
		vscode.commands.registerCommand('roopik.canvas.open', () => {
			logger.info('Extension', 'Opening canvas panel');
			if (canvasPanel) {
				canvasPanel.reveal();
			} else {
				canvasPanel = new CanvasPanel(context.extensionUri);
				canvasPanel.onDidDispose(() => {
					logger.info('Extension', 'Canvas panel disposed');
					canvasPanel = undefined;
				});
			}
		})
	);

	logger.info('Extension', 'Roopik Canvas extension activated');
}

export function deactivate(): void {
	Logger.getInstance().info('Extension', 'Extension deactivating');
	canvasPanel?.dispose();
}
