/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import { CanvasPanel } from './canvasPanel';
import { ConfigManager } from './config';
import { Logger, LogLevel } from './logger';

// TODO: Component Pipeline V2 services will be imported here

/**
 * Roopik Canvas Extension
 *
 * This extension provides the canvas webview panel for visual component design.
 * It receives commands from the Core (activity pane, command palette) and renders the UI.
 *
 * Architecture:
 * - Core handles: Activity pane, welcome screen, canvas name prompts, command palette
 * - Extension handles: Canvas webview rendering, state management, preview system
 * - Communication: Core calls roopik.canvas.open with canvas name, extension renders
 */

export function activate(context: vscode.ExtensionContext) {
	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (!workspaceFolders) {
		vscode.window.showErrorMessage('Please open a workspace folder to use Roopik.');
		return;
	}

	const workspaceRoot = workspaceFolders[0].uri.fsPath;

	// Initialize Logger
	const logDirectory = path.join(workspaceRoot, '.roopik', 'logs');
	const logger = Logger.getInstance({
		level: LogLevel.INFO,
		enableFileLogging: true,
		logDirectory,
		maxLogFileSize: 5 * 1024 * 1024,
		maxLogFiles: 5,
		showOutputChannel: false
	});

	// Initialize ConfigManager
	const configManager = ConfigManager.getInstance(workspaceRoot);
	const config = configManager.getConfig();
	logger.setLevel(config.logging.level as LogLevel);

	// TODO: Component Pipeline V2 services will be initialized here

	logger.info('Extension', 'Roopik Canvas extension activated');

	// Dispose logger on deactivation
	context.subscriptions.push({
		dispose: () => logger.dispose()
	});

	// Initialize Mode 1 Preview System (client-side transpilation)
	CanvasPanel.initializePreviewSystem(context);
	logger.info('Extension', 'Preview system initialized');

	// Main command: Open canvas (called from Core after CanvasService.createCanvas)
	// Core handles: name prompt -> CanvasService.createCanvas() -> passes {canvasId, canvasName} here
	const openCanvasCommand = vscode.commands.registerCommand('roopik.canvas.open', (arg: { canvasId: string; canvasName?: string }) => {
		if (!arg || !arg.canvasId) {
			logger.warn('Extension', 'No canvas ID provided');
			return;
		}

		const canvasId = arg.canvasId;
		const canvasName = arg.canvasName || canvasId; // Use canvasId as fallback if name not provided

		logger.info('Extension', `Opening canvas: ${canvasId} (${canvasName})`);
		CanvasPanel.createOrShow(context.extensionUri, canvasId, canvasName);
	});

	// Import component command (called from Core's import flow)
	const importComponentCommand = vscode.commands.registerCommand(
		'roopik.canvas.importComponent',
		async (request: { path: string; canvasId: string; position?: { x: number; y: number } }) => {
			const { path: filePath, canvasId, position } = request;

			logger.info('Extension', `Importing component from ${filePath} to canvas ${canvasId}`);

			try {
				// Read the file content
				const fileUri = vscode.Uri.file(filePath);
				const fileContent = await vscode.workspace.fs.readFile(fileUri);
				const code = Buffer.from(fileContent).toString('utf-8');

				// Determine framework from file extension
				const ext = filePath.split('.').pop()?.toLowerCase() || 'tsx';
				const framework = ext === 'vue' ? 'vue' : ext === 'svelte' ? 'svelte' : 'react';

				// Extract filename for component name
				const fileName = filePath.split(/[\\/]/).pop() || 'Component';
				const componentName = fileName.replace(/\.[^/.]+$/, '');

				// Create ComponentInput
				const componentInput = {
					id: `import-${Date.now()}`,
					source: 'import' as const,
					framework,
					files: {
						[fileName]: code
					},
					entryFile: fileName,
					dependencies: {}
				};

				// Convert canvasId to slug format (same as in open command)
				const canvasSlug = canvasId.toLowerCase()
					.trim()
					.replace(/\s+/g, '-')
					.replace(/[^a-z0-9-]/g, '');

				// Get the canvas panel
				const panel = CanvasPanel.getPanel(canvasSlug);
				if (!panel) {
					// Canvas not open, try to open it first
					await vscode.commands.executeCommand('roopik.canvas.open', canvasId);

					// Wait a bit for panel to initialize
					await new Promise(resolve => setTimeout(resolve, 500));

					const newPanel = CanvasPanel.getPanel(canvasSlug);
					if (!newPanel) {
						throw new Error(`Canvas "${canvasId}" could not be opened`);
					}

					// Send the import message
					newPanel.postMessage({
						type: 'addImportedComponent',
						payload: {
							componentInput,
							position
						}
					});
				} else {
					// Send the import message to existing panel
					panel.postMessage({
						type: 'addImportedComponent',
						payload: {
							componentInput,
							position
						}
					});
				}

				logger.info('Extension', `Component ${componentName} sent to canvas ${canvasId}`);

				return { success: true, componentInput };
			} catch (err) {
				const errorMsg = err instanceof Error ? err.message : String(err);
				logger.error('Extension', `Import failed: ${errorMsg}`);
				return { success: false, error: errorMsg };
			}
		}
	);

	// Close canvas command (called from Core when deleting a canvas)
	const closeCanvasCommand = vscode.commands.registerCommand('roopik.canvas.close', (canvasId: string) => {
		if (!canvasId) {
			logger.warn('Extension', 'No canvas ID provided for close');
			return;
		}

		logger.info('Extension', `Closing canvas: ${canvasId}`);

		const panel = CanvasPanel.getPanel(canvasId);
		if (panel) {
			panel.dispose();
			logger.info('Extension', `Canvas "${canvasId}" closed`);
		} else {
			logger.info('Extension', `Canvas "${canvasId}" was not open`);
		}
	});

	// Update canvas command (called from Core when canvas is renamed)
	const updateCanvasCommand = vscode.commands.registerCommand('roopik.canvas.update', (arg: { canvasId: string; canvasName: string }) => {
		if (!arg || !arg.canvasId) {
			logger.warn('Extension', 'No canvas ID provided for update');
			return;
		}

		logger.info('Extension', `Updating canvas: ${arg.canvasId} -> ${arg.canvasName}`);

		const panel = CanvasPanel.getPanel(arg.canvasId);
		if (panel) {
			panel.updateTitle(arg.canvasName);
			logger.info('Extension', `Canvas "${arg.canvasId}" title updated to "${arg.canvasName}"`);
		}
	});

	// Register commands
	context.subscriptions.push(openCanvasCommand, importComponentCommand, closeCanvasCommand, updateCanvasCommand);

	logger.info('Extension', 'Commands registered: roopik.canvas.open, roopik.canvas.close, roopik.canvas.importComponent');
}

export function deactivate() {
	Logger.getInstance().info('Extension', 'Extension deactivated');
}
