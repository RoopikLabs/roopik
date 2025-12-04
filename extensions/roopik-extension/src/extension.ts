/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * DEPRECATED: This extension is disabled.
 * Canvas functionality has been moved to extensions/roopik.
 * This file is kept temporarily and will be deleted.
 */

import * as vscode from 'vscode';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	// Extension disabled - all commands moved to extensions/roopik
	console.log('roopik-extension: Disabled - use extensions/roopik instead');
}

export function deactivate(): void {
	// Nothing to clean up
}
