/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { CanvasPanel } from './canvasPanel';

/**
 * Roopik Extension Entry Point
 *
 * This is the main extension for Roopik - an AI-native, canvas-first IDE
 * for frontend development built on VS Code.
 *
 * Architecture:
 * - Extension loads on startup (activationEvents: onStartupFinished)
 * - Provides canvas webview for visual component design
 * - Integrates AI for code generation and design assistance
 * - Manages bidirectional sync between canvas and code
 */

export function activate(context: vscode.ExtensionContext) {
	console.log('Roopik extension is now active!');

	// Register the "Open Canvas" command
	const openCanvasCommand = vscode.commands.registerCommand('roopik.openCanvas', () => {
		CanvasPanel.createOrShow(context.extensionUri);
	});

	context.subscriptions.push(openCanvasCommand);

	// Log successful activation
	console.log('Roopik: Extension activated successfully');
	console.log('Roopik: Commands registered');
	console.log('Roopik: Ready for development');
}

export function deactivate() {
	console.log('Roopik extension deactivated');
}
