/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import { CanvasPanel } from './canvasPanel';
import { ConfigManager } from './config';
import { Logger, LogLevel } from './logger';

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

	logger.info('Extension', 'Roopik Canvas extension activated');

	// Dispose logger on deactivation
	context.subscriptions.push({
		dispose: () => logger.dispose()
	});

	// Initialize Mode 1 Preview System (client-side transpilation)
	CanvasPanel.initializePreviewSystem(context);
	logger.info('Extension', 'Preview system initialized');

	// Main command: Open canvas by name (called from Core)
	// Core handles the name prompt and passes the name here
	const openCanvasCommand = vscode.commands.registerCommand('roopik.canvas.open', (canvasName?: string) => {
		if (!canvasName) {
			logger.warn('Extension', 'No canvas name provided');
			return;
		}

		logger.info('Extension', `Opening canvas: ${canvasName}`);

		// Convert to slug for ID (e.g., "Login Components" -> "login-components")
		const canvasId = canvasName.toLowerCase()
			.trim()
			.replace(/\s+/g, '-')
			.replace(/[^a-z0-9-]/g, '');

		CanvasPanel.createOrShow(context.extensionUri, canvasId, canvasName);
	});

	// Register command
	context.subscriptions.push(openCanvasCommand);

	logger.info('Extension', 'roopik.canvas.open command registered');
}

export function deactivate() {
	Logger.getInstance().info('Extension', 'Extension deactivated');
}
