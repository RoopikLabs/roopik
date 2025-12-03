/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import type { CanvasState, TransformOptions, TransformResult } from '../types/messages';

/**
 * CoreBridgeService - Bridge between Extension and Core
 *
 * Handles communication with Core services via commands:
 * - roopik.core.transformCode (ESBuild bundling)
 * - roopik.core.saveCanvasState (persistence)
 * - roopik.core.loadCanvasState (persistence)
 *
 * NOTE: GridManager stays LOCAL in extension for 60fps performance!
 */
export class CoreBridgeService {
	private static instance: CoreBridgeService;

	private constructor() {}

	public static getInstance(): CoreBridgeService {
		if (!CoreBridgeService.instance) {
			CoreBridgeService.instance = new CoreBridgeService();
		}
		return CoreBridgeService.instance;
	}

	/**
	 * Transform code via Core's ESBuild pipeline
	 * Heavy processing - goes to Core
	 */
	async transformCode(code: string, options?: TransformOptions): Promise<TransformResult> {
		try {
			const result = await vscode.commands.executeCommand<TransformResult>(
				'roopik.core.transformCode',
				code,
				options || {}
			);
			return result || { html: '', error: 'No result from transform' };
		} catch (error) {
			console.error('[CoreBridgeService] Transform failed:', error);
			return {
				html: '',
				error: error instanceof Error ? error.message : String(error)
			};
		}
	}

	/**
	 * Save canvas state to disk via Core
	 * Persistence - goes to Core
	 */
	async saveCanvasState(canvasId: string, state: CanvasState): Promise<boolean> {
		try {
			await vscode.commands.executeCommand(
				'roopik.core.saveCanvasState',
				canvasId,
				state
			);
			return true;
		} catch (error) {
			console.error('[CoreBridgeService] Save failed:', error);
			return false;
		}
	}

	/**
	 * Load canvas state from disk via Core
	 * Persistence - goes to Core
	 */
	async loadCanvasState(canvasId: string): Promise<CanvasState | null> {
		try {
			const state = await vscode.commands.executeCommand<CanvasState>(
				'roopik.core.loadCanvasState',
				canvasId
			);
			return state || null;
		} catch (error) {
			console.error('[CoreBridgeService] Load failed:', error);
			return null;
		}
	}

	/**
	 * Open a file in the editor
	 */
	async openFile(filePath: string, line?: number, column?: number): Promise<void> {
		try {
			const uri = vscode.Uri.file(filePath);
			const document = await vscode.workspace.openTextDocument(uri);
			const editor = await vscode.window.showTextDocument(document);

			if (line !== undefined) {
				const position = new vscode.Position(line - 1, (column || 1) - 1);
				editor.selection = new vscode.Selection(position, position);
				editor.revealRange(
					new vscode.Range(position, position),
					vscode.TextEditorRevealType.InCenter
				);
			}
		} catch (error) {
			console.error('[CoreBridgeService] Open file failed:', error);
			vscode.window.showErrorMessage(`Failed to open file: ${filePath}`);
		}
	}
}
