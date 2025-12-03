/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import { CanvasPanel } from './panels/CanvasPanel';
import { Logger, LogLevel } from './services/Logger';
import { CanvasStateManager } from './services/CanvasStateManager';

/** Map of canvas name to panel instance */
const canvasPanels = new Map<string, CanvasPanel>();
let logger: Logger;

/**
 * Extension activation - called when Core triggers roopik.canvas.open
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
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

	// Initialize CanvasStateManager
	const stateManager = CanvasStateManager.getInstance();
	await stateManager.initialize();
	logger.info('Extension', `CanvasStateManager initialized: ${stateManager.getRoopikDir()}`);

	// Dispose logger on deactivation
	context.subscriptions.push({
		dispose: () => logger.dispose()
	});

	// Main command - opens the canvas webview panel with canvas name
	context.subscriptions.push(
		vscode.commands.registerCommand('roopik.canvas.open', async (canvasName?: string) => {
			// If no canvas name provided, show error (should come from Core)
			if (!canvasName) {
				logger.warn('Extension', 'No canvas name provided, using default');
				canvasName = 'Untitled Canvas';
			}

			logger.info('Extension', `Opening canvas: ${canvasName}`);

			// Check if panel for this canvas already exists
			const existingPanel = canvasPanels.get(canvasName);
			if (existingPanel) {
				logger.info('Extension', `Revealing existing canvas: ${canvasName}`);
				existingPanel.reveal();
				return;
			}

			// Create or load canvas state
			let canvasState = await stateManager.loadCanvas(canvasName);
			if (!canvasState) {
				logger.info('Extension', `Creating new canvas: ${canvasName}`);
				canvasState = await stateManager.createCanvas(canvasName);
			}

			// Create new panel
			const panel = new CanvasPanel(context.extensionUri, canvasName, canvasState);

			// Track panel
			canvasPanels.set(canvasName, panel);

			panel.onDidDispose(() => {
				logger.info('Extension', `Canvas panel disposed: ${canvasName}`);
				canvasPanels.delete(canvasName!);
			});
		})
	);

	logger.info('Extension', 'Roopik Canvas extension activated');
}

export function deactivate(): void {
	Logger.getInstance().info('Extension', 'Extension deactivating');

	// Dispose all panels
	for (const [name, panel] of canvasPanels) {
		Logger.getInstance().info('Extension', `Disposing canvas: ${name}`);
		panel.dispose();
	}
	canvasPanels.clear();
}
