/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import { CanvasPanel } from './panels/CanvasPanel';
import { Logger, LogLevel } from './services/Logger';
import { CanvasStateManager } from './services/CanvasStateManager';
import { ImportHandler } from './services/ImportHandler';

/** Map of canvas name to panel instance */
const canvasPanels = new Map<string, CanvasPanel>();
let logger: Logger;
let importHandler: ImportHandler;

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

	// Initialize ImportHandler
	importHandler = new ImportHandler();
	if (workspaceFolders && workspaceFolders.length > 0) {
		importHandler.initialize(workspaceFolders[0].uri.fsPath);
	}
	logger.info('Extension', 'ImportHandler initialized');

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

	// Import component command - called from Core's import commands
	context.subscriptions.push(
		vscode.commands.registerCommand('roopik.canvas.importComponent', async (request: {
			path: string;
			canvasId: string;
			position?: { x: number; y: number };
			forceReplace?: boolean;
		}) => {
			logger.info('Extension', `Import request received`, request);

			// Track if we're replacing and what component name
			let isReplacing = false;
			let replaceComponentName: string | undefined;

			// Process the import
			let result = await importHandler.importComponent(request, request.forceReplace ?? false);

			// Handle duplicate case - ask user what to do
			if (!result.success && result.code === 'DUPLICATE_COMPONENT') {
				const duplicateResult = result as import('./services/ImportHandler').ImportDuplicateError;
				const componentName = duplicateResult.duplicateInfo.existingName;

				logger.info('Extension', `Duplicate component found: ${componentName}`);

				const choice = await vscode.window.showWarningMessage(
					`Component "${componentName}" is already on this canvas. What would you like to do?`,
					{ modal: true },
					'Replace',
					'Cancel'
				);

				if (choice === 'Replace') {
					// Re-import with forceReplace = true
					logger.info('Extension', `User chose to replace: ${componentName}`);
					isReplacing = true;
					replaceComponentName = componentName;
					result = await importHandler.importComponent(request, true);
				} else {
					// User cancelled
					return { success: false, error: 'Import cancelled - component already exists' };
				}
			}

			if (!result.success) {
				logger.error('Extension', `Import failed: ${result.message}`);
				vscode.window.showErrorMessage(`Import failed: ${result.message}`);
				return { success: false, error: result.message };
			}

			logger.info('Extension', `Import successful: ${result.componentInput.id}`);

			// Find the canvas panel and send the component
			const panel = canvasPanels.get(request.canvasId);
			if (panel) {
				// Send the imported component to the webview
				// If replacing, tell webview to remove old sandbox first
				panel.addImportedComponent(
					result.componentInput,
					request.position,
					isReplacing,
					replaceComponentName
				);
				return { success: true, componentInput: result.componentInput };
			} else {
				// No panel open for this canvas - open it first, then import
				logger.warn('Extension', `No panel open for canvas: ${request.canvasId}`);
				vscode.window.showWarningMessage('Please open a canvas first, then import.');
				return { success: false, error: 'Canvas not open' };
			}
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
