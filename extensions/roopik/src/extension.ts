/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import { RoopikExtensionManager } from './roopikExtensionManager';
import { Logger, LogLevel } from './logger';
import type { Component, BuildResult, BuildErrorInfo } from './types/component';

/**
 * Roopik Canvas Extension
 *
 * This extension provides the canvas webview panel for visual component design.
 * It uses RoopikExtensionManager as the central coordinator for:
 * - Communication with Core services (ComponentService, CanvasService)
 * - Event routing to correct CanvasPanel by canvasId
 * - Panel lifecycle management
 *
 * Architecture:
 * - Core handles: Component/Canvas CRUD, build pipeline, storage
 * - Extension handles: Canvas webview rendering, event routing
 * - Manager: Single point of contact between Core and panels
 */

let manager: RoopikExtensionManager | null = null;

export async function activate(context: vscode.ExtensionContext) {
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

	logger.info('Extension', 'Roopik Canvas extension activating...');

	// Initialize RoopikExtensionManager (singleton)
	manager = RoopikExtensionManager.getInstance();

	try {
		await manager.initialize(context);
		logger.info('Extension', 'RoopikExtensionManager initialized');

		// NOTE: Auto-restore feature disabled
		// Canvas will not automatically reopen on IDE restart
		// User must manually open canvas from Roopik dashboard
	} catch (error) {
		logger.error('Extension', 'Failed to initialize RoopikExtensionManager', error);
		vscode.window.showErrorMessage(`Roopik initialization failed: ${error}`);
		return;
	}

	// Dispose manager and logger on deactivation
	context.subscriptions.push({
		dispose: () => {
			manager?.dispose();
			logger.dispose();
		}
	});

	// ============================================================================
	// Commands
	// ============================================================================

	// Main command: Open canvas (called from Core after CanvasService.createCanvas)
	// Core handles: name prompt -> CanvasService.createCanvas() -> passes {canvasId, canvasName} here
	const openCanvasCommand = vscode.commands.registerCommand(
		'roopik.canvas.open',
		(arg: { canvasId: string; canvasName?: string }) => {
			if (!arg || !arg.canvasId) {
				logger.warn('Extension', 'No canvas ID provided');
				return;
			}

			const canvasId = arg.canvasId;
			const canvasName = arg.canvasName || canvasId;

			logger.info('Extension', `Opening canvas: ${canvasId} (${canvasName})`);
			manager!.openCanvas(canvasId, canvasName, context.extensionUri);
		}
	);

	// Close canvas command (called from Core when deleting a canvas)
	const closeCanvasCommand = vscode.commands.registerCommand(
		'roopik.canvas.close',
		(canvasId: string) => {
			if (!canvasId) {
				logger.warn('Extension', 'No canvas ID provided for close');
				return;
			}

			logger.info('Extension', `Closing canvas: ${canvasId}`);
			manager!.closeCanvas(canvasId);
		}
	);

	// Update canvas command (called from Core when canvas is renamed)
	const updateCanvasCommand = vscode.commands.registerCommand(
		'roopik.canvas.update',
		(arg: { canvasId: string; canvasName: string }) => {
			if (!arg || !arg.canvasId) {
				logger.warn('Extension', 'No canvas ID provided for update');
				return;
			}

			logger.info('Extension', `Updating canvas: ${arg.canvasId} -> ${arg.canvasName}`);

			const panel = manager!.getPanel(arg.canvasId);
			if (panel) {
				panel.updateTitle(arg.canvasName);
				logger.info('Extension', `Canvas "${arg.canvasId}" title updated to "${arg.canvasName}"`);
			}
		}
	);

	// Import component command (called from Core's import flow)
	const importComponentCommand = vscode.commands.registerCommand(
		'roopik.canvas.importComponent',
		async (request: { path: string; canvasId: string; position?: { x: number; y: number } }) => {
			const { path: filePath, canvasId } = request;

			logger.info('Extension', `Importing component from ${filePath} to canvas ${canvasId}`);

			try {
				// Extract filename for component name
				const fileName = filePath.split(/[\\/]/).pop() || 'Component';
				const componentName = fileName.replace(/\.[^/.]+$/, '');

				// Ensure canvas is open
				let panel = manager!.getPanel(canvasId);
				if (!panel) {
					// Open canvas first
					manager!.openCanvas(canvasId, canvasId, context.extensionUri);
					await new Promise(resolve => setTimeout(resolve, 500));
					panel = manager!.getPanel(canvasId);
				}

				if (!panel) {
					throw new Error(`Canvas "${canvasId}" could not be opened`);
				}

				// Create component via manager (which calls Core)
				// With new API, just pass folderPath - Core handles everything else
				await manager!.createComponent({
					folderPath: filePath, // Core will smart-parse this (extract folder + entry file)
					canvasId,
					componentName,
					origin: 'local'
				});

				logger.info('Extension', `Component ${componentName} import initiated for canvas ${canvasId}`);

				return { success: true };
			} catch (err) {
				const errorMsg = err instanceof Error ? err.message : String(err);
				logger.error('Extension', `Import failed: ${errorMsg}`);
				return { success: false, error: errorMsg };
			}
		}
	);

	// ============================================================================
	// Component Event Commands (received from Core via RoopikComponentContribution)
	// ============================================================================

	// Handle component created event from Core
	const componentCreatedCommand = vscode.commands.registerCommand(
		'roopik.component.created',
		(event: { componentId: string; canvasId: string; component: unknown }) => {
			logger.debug('Extension', `Component created event: ${event.componentId} in ${event.canvasId}`);
			manager!.handleComponentCreatedFromCore({
				componentId: event.componentId,
				canvasId: event.canvasId,
				component: event.component as Component
			});
		}
	);

	// Handle component built event from Core
	const componentBuiltCommand = vscode.commands.registerCommand(
		'roopik.component.built',
		(event: { componentId: string; canvasId: string; success: boolean; result?: unknown; errorInfo?: unknown; trigger: string }) => {
			logger.debug('Extension', `Component built event: ${event.componentId}, success: ${event.success}`);
			manager!.handleComponentBuiltFromCore({
				componentId: event.componentId,
				canvasId: event.canvasId,
				success: event.success,
				result: event.result as (Omit<BuildResult, 'bundledCode'> & { bundlePath?: string }) | undefined,
				errorInfo: event.errorInfo as BuildErrorInfo | undefined,
				trigger: event.trigger as 'create' | 'update' | 'rebuild' | 'file-change'
			});
		}
	);

	// Handle component deleted event from Core
	const componentDeletedCommand = vscode.commands.registerCommand(
		'roopik.component.deleted',
		(event: { componentId: string; canvasId: string }) => {
			logger.debug('Extension', `Component deleted event: ${event.componentId}`);
			manager!.handleComponentDeletedFromCore(event);
		}
	);

	// Handle component updated event from Core
	const componentUpdatedCommand = vscode.commands.registerCommand(
		'roopik.component.updated',
		(event: { componentId: string; canvasId: string; component: unknown; changes: string[] }) => {
			logger.debug('Extension', `Component updated event: ${event.componentId}`);
			manager!.handleComponentUpdatedFromCore({
				componentId: event.componentId,
				canvasId: event.canvasId,
				component: event.component as Component,
				changes: event.changes as ('name' | 'source')[]
			});
		}
	);

	// Handle screenshot request from Core (bidirectional IPC)
	const captureComponentScreenshotCommand = vscode.commands.registerCommand(
		'roopik.canvas.captureComponentScreenshot',
		async (componentId: string): Promise<string | null> => {
			try {
				logger.debug('Extension', `📸 Screenshot requested for component: ${componentId}`);

				// Get the canvas panel for this component
				const screenshot = await manager!.captureComponentScreenshot(componentId);

				if (screenshot) {
					const preview = screenshot.substring(0, 100);
					logger.debug('Extension', `✅ Screenshot captured, returning to Core`, {
						componentId,
						dataUrlLength: screenshot.length,
						preview
					});
					return screenshot;
				} else {
					logger.warn('Extension', `❌ Failed to capture screenshot (null returned) for ${componentId}`);
					return null;
				}
			} catch (error) {
				logger.error('Extension', `❌ Error capturing screenshot for ${componentId}`, error);
				return null;
			}
		}
	);

	// Register commands
	context.subscriptions.push(
		openCanvasCommand,
		closeCanvasCommand,
		updateCanvasCommand,
		importComponentCommand,
		componentCreatedCommand,
		componentBuiltCommand,
		componentDeletedCommand,
		componentUpdatedCommand,
		captureComponentScreenshotCommand
	);

	// logger.info('Extension', 'Roopik Canvas extension activated');
	// logger.info('Extension', 'Canvas commands: roopik.canvas.open, roopik.canvas.close, roopik.canvas.update, roopik.canvas.importComponent');
	// logger.info('Extension', 'Component event commands: roopik.component.created, roopik.component.built, roopik.component.deleted, roopik.component.updated');
}

export function deactivate() {
	Logger.getInstance().info('Extension', 'Extension deactivated');
}
