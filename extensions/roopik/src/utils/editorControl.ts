/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import { Logger } from '../logger';

/**
 * VS Code Editor Control Utilities
 *
 * Provides functions to control VS Code's editor programmatically:
 * - Open files at specific lines
 * - Highlight code ranges
 * - Toggle sidebar visibility
 * - Manage editor groups
 */

export interface OpenFileOptions {
	file: string;
	line?: number;
	column?: number;
	preview?: boolean;
	viewColumn?: vscode.ViewColumn;
	preserveFocus?: boolean;
}

/**
 * Open a file in VS Code editor at a specific line
 */
export async function openFileAtLine(
	workspaceRoot: string,
	options: OpenFileOptions
): Promise<vscode.TextEditor | undefined> {
	try {
		// Resolve absolute file path
		const absolutePath = path.isAbsolute(options.file)
			? options.file
			: path.join(workspaceRoot, options.file);

		// Check if file exists
		const uri = vscode.Uri.file(absolutePath);

		// Create selection range (highlight the line)
		const line = (options.line || 1) - 1; // Convert to 0-indexed
		const column = (options.column || 0);
		const position = new vscode.Position(line, column);
		const selection = new vscode.Range(position, position);

		// Open the document
		const document = await vscode.workspace.openTextDocument(uri);

		// Show in editor
		const editor = await vscode.window.showTextDocument(document, {
			selection,
			preview: options.preview !== undefined ? options.preview : false,
			viewColumn: options.viewColumn || vscode.ViewColumn.One,
			preserveFocus: options.preserveFocus || false
		});

		// Reveal the line in the center of the editor
		editor.revealRange(selection, vscode.TextEditorRevealType.InCenter);

		const logger = Logger.getInstance();
		logger.info('EditorControl', `Opened ${options.file} at line ${options.line}`);

		return editor;
	} catch (error) {
		const logger = Logger.getInstance();
		logger.error('EditorControl', `Failed to open file: ${options.file}`, error);
		vscode.window.showErrorMessage(`Failed to open file: ${options.file}`);
		return undefined;
	}
}

/**
 * Highlight a specific range in the currently active editor
 */
export function highlightRange(
	editor: vscode.TextEditor,
	startLine: number,
	endLine: number,
	startColumn: number = 0,
	endColumn: number = 1000
): void {
	const start = new vscode.Position(startLine - 1, startColumn);
	const end = new vscode.Position(endLine - 1, endColumn);
	const range = new vscode.Range(start, end);

	editor.selection = new vscode.Selection(start, end);
	editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
}

/**
 * Toggle VS Code sidebar (file explorer) visibility
 */
export async function toggleSidebar(visible: boolean): Promise<void> {
	if (visible) {
		await vscode.commands.executeCommand('workbench.action.focusSideBar');
	} else {
		await vscode.commands.executeCommand('workbench.action.closeSidebar');
	}
}

/**
 * Open file explorer (sidebar)
 */
export async function openFileExplorer(): Promise<void> {
	await vscode.commands.executeCommand('workbench.view.explorer');
}

/**
 * Close all editor tabs
 */
export async function closeAllEditors(): Promise<void> {
	await vscode.commands.executeCommand('workbench.action.closeAllEditors');
}

/**
 * Split editor to show code side-by-side with canvas
 */
export async function splitEditorForCanvas(
	workspaceRoot: string,
	filePath: string,
	line?: number
): Promise<void> {
	// Open file in left column
	await openFileAtLine(workspaceRoot, {
		file: filePath,
		line,
		viewColumn: vscode.ViewColumn.One,
		preview: false
	});

	// Canvas webview should already be in ViewColumn.Two (right side)
	// VS Code will automatically arrange them side-by-side
}

/**
 * Get workspace root path
 */
export function getWorkspaceRoot(): string | undefined {
	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (!workspaceFolders || workspaceFolders.length === 0) {
		return undefined;
	}
	return workspaceFolders[0].uri.fsPath;
}

/**
 * Convert relative file path to absolute
 */
export function resolveFilePath(workspaceRoot: string, filePath: string): string {
	if (path.isAbsolute(filePath)) {
		return filePath;
	}
	return path.join(workspaceRoot, filePath);
}
