/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { CanvasPanel } from './canvasPanel';
import { DashboardPanel } from './dashboardPanel';
import { ConfigManager } from './config';
import { ActivityBarViewProvider } from './activityBarView';

/**
 * Roopik Extension Entry Point
 *
 * This is the main extension for Roopik - an AI-native, canvas-first IDE
 * for frontend development built on VS Code.
 *
 * Architecture:
 * - Extension loads on startup (activationEvents: onStartupFinished)
 * - Provides multi-canvas webview system for visual component design
 * - Each canvas is independent with isolated state and AI context
 * - Integrates AI for code generation and design assistance
 * - Manages bidirectional sync between canvas and code
 * - Uses Mode 1 preview system: client-side transpilation (Babel) in iframes
 */

export function activate(context: vscode.ExtensionContext) {
	console.log('Roopik extension is now active!');

	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (!workspaceFolders) {
		vscode.window.showErrorMessage('Please open a workspace folder to use Roopik.');
		return;
	}

	const workspaceRoot = workspaceFolders[0].uri.fsPath;
	const configManager = ConfigManager.getInstance(workspaceRoot);
	const config = configManager.getConfig();

	// Initialize Mode 1 Preview System (client-side transpilation)
	CanvasPanel.initializePreviewSystem(context);
	console.log('[Roopik] Mode 1 preview system initialized (client-side transpilation)');

	// Restore last session after a delay (wait for VS Code to fully initialize)
	setTimeout(() => {
		CanvasPanel.restoreSession(context.extensionUri, workspaceRoot);

		// Show dashboard on startup if configured
		if (config.canvas.showDashboardOnStartup) {
			// Add a small extra delay to let canvases restore first
			setTimeout(() => {
				DashboardPanel.createOrShow(context.extensionUri, workspaceRoot);
			}, 500);
		}
	}, 1000); // 1 second delay

	// Command 1: Open Dashboard (replaces old "Open Canvas")
	const openCanvasCommand = vscode.commands.registerCommand('roopik.openCanvas', () => {
		DashboardPanel.createOrShow(context.extensionUri, workspaceRoot);
	});

	// Command 2: Create new canvas (prompt for name)
	const newCanvasCommand = vscode.commands.registerCommand('roopik.newCanvas', async () => {
		const canvasName = await vscode.window.showInputBox({
			prompt: 'Enter canvas name (e.g., Login, Onboarding, Dashboard)',
			placeHolder: 'Canvas name',
			validateInput: (value) => {
				if (!value || value.trim().length === 0) {
					return 'Canvas name cannot be empty';
				}
				if (value.length > 50) {
					return 'Canvas name is too long (max 50 characters)';
				}
				return null;
			}
		});

		if (canvasName) {
			// Convert to slug for ID (e.g., "Login Components" -> "login-components")
			const canvasId = canvasName.toLowerCase()
				.trim()
				.replace(/\s+/g, '-')
				.replace(/[^a-z0-9-]/g, '');

			CanvasPanel.createOrShow(context.extensionUri, canvasId, canvasName);
		}
	});

	// Command 3: Close all canvases
	const closeAllCanvasesCommand = vscode.commands.registerCommand('roopik.closeAllCanvases', () => {
		CanvasPanel.closeAll();
		vscode.window.showInformationMessage('All Roopik canvases closed.');
	});

	// Command 4: Show open canvases
	const showCanvasesCommand = vscode.commands.registerCommand('roopik.showCanvases', () => {
		const canvasIds = CanvasPanel.getOpenCanvasIds();

		if (canvasIds.length === 0) {
			vscode.window.showInformationMessage('No canvases are currently open.');
			return;
		}

		vscode.window.showQuickPick(canvasIds, {
			placeHolder: `${canvasIds.length} canvas(es) open. Select to focus:`
		}).then(selectedId => {
			if (selectedId) {
				CanvasPanel.createOrShow(context.extensionUri, selectedId);
			}
		});
	});

	// Command 5: Delete canvas
	const deleteCanvasCommand = vscode.commands.registerCommand('roopik.deleteCanvas', async (canvasId: string) => {
		const confirmation = await vscode.window.showWarningMessage(
			`Delete canvas "${canvasId}"? This cannot be undone.`,
			{ modal: true },
			'Delete'
		);

		if (confirmation === 'Delete') {
			const success = CanvasPanel.deleteCanvas(canvasId, workspaceRoot);
			if (success) {
				vscode.window.showInformationMessage(`Canvas "${canvasId}" deleted.`);
			} else {
				vscode.window.showErrorMessage(`Failed to delete canvas "${canvasId}".`);
			}
		}
	});

	// Command 6: Rename canvas
	const renameCanvasCommand = vscode.commands.registerCommand('roopik.renameCanvas', async (canvasId: string, currentName: string) => {
		const newName = await vscode.window.showInputBox({
			prompt: 'Enter new canvas name',
			value: currentName,
			validateInput: (value) => {
				if (!value || value.trim().length === 0) {
					return 'Canvas name cannot be empty';
				}
				if (value.length > 50) {
					return 'Canvas name is too long (max 50 characters)';
				}
				return null;
			}
		});

		if (newName && newName !== currentName) {
			const success = CanvasPanel.renameCanvas(canvasId, newName, workspaceRoot);
			if (success) {
				vscode.window.showInformationMessage(`Canvas renamed to "${newName}".`);
			} else {
				vscode.window.showErrorMessage(`Failed to rename canvas.`);
			}
		}
	});

	// Command 7: Export canvas
	const exportCanvasCommand = vscode.commands.registerCommand('roopik.exportCanvas', async (canvasId: string) => {
		const exportPath = await CanvasPanel.exportCanvas(canvasId, workspaceRoot);
		if (exportPath) {
			vscode.window.showInformationMessage(`Canvas exported to ${exportPath}`);
		} else {
			vscode.window.showErrorMessage('Failed to export canvas.');
		}
	});

	// Command 8: Import canvas
	const importCanvasCommand = vscode.commands.registerCommand('roopik.importCanvas', async () => {
		const importedId = await CanvasPanel.importCanvas(workspaceRoot, context.extensionUri);
		if (importedId) {
			vscode.window.showInformationMessage(`Canvas "${importedId}" imported successfully.`);
		}
	});

	// Register Activity Bar view provider
	const activityBarViewProvider = new ActivityBarViewProvider(workspaceRoot);
	const dashboardViewProvider = vscode.window.registerWebviewViewProvider(
		'roopik.dashboard',
		activityBarViewProvider
	);

	// Register all commands
	context.subscriptions.push(
		openCanvasCommand,
		newCanvasCommand,
		closeAllCanvasesCommand,
		showCanvasesCommand,
		deleteCanvasCommand,
		renameCanvasCommand,
		exportCanvasCommand,
		importCanvasCommand,
		dashboardViewProvider
	);

	// Log successful activation
	console.log('Roopik: Extension activated successfully');
	console.log('Roopik: Commands registered (openCanvas [Dashboard], newCanvas, closeAllCanvases, showCanvases)');
	console.log('Roopik: Multi-canvas architecture with Dashboard UI ready');
	console.log('Roopik: Activity Bar icon registered');
}

export function deactivate() {
	console.log('Roopik extension deactivated');
}
