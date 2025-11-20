/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import type { SessionCode, SandboxMessage } from '../core/types';
import { Logger } from '../../logger';

/**
 * ComponentSandbox - Mode 1 Renderer
 *
 * Manages iframe pool for component previews
 * Each sandbox loads the reusable sandbox_template.html
 * Code is sent via postMessage for instant rendering
 */
export class ComponentSandbox {
	private sandboxTemplateUri: vscode.Uri;
	private logger: ReturnType<typeof Logger.prototype.createScoped>;

	constructor(context: vscode.ExtensionContext) {
		// Path to sandbox_template.html in webviews/sandbox/
		this.sandboxTemplateUri = vscode.Uri.joinPath(
			context.extensionUri,
			'webview-ui',
			'sandbox',
			'sandbox_template.html'
		);
		this.logger = Logger.getInstance().createScoped('ComponentSandbox');
	}

	/**
	 * Get the sandbox template HTML as a string
	 * This will be sent to the canvas webview to load in iframes
	 */
	async getSandboxTemplate(): Promise<string> {
		try {
			const templateBytes = await vscode.workspace.fs.readFile(this.sandboxTemplateUri);
			return Buffer.from(templateBytes).toString('utf8');
		} catch (error) {
			this.logger.error('Failed to read sandbox template', error);
			throw new Error('Sandbox template not found');
		}
	}

	/**
	 * Create sandbox message for initial load
	 */
	createInitMessage(sessionCode: SessionCode): SandboxMessage {
		return {
			type: 'init',
			code: sessionCode.code,
			cdnUrls: sessionCode.cdnUrls
		};
	}

	/**
	 * Create sandbox message for hot-reload update
	 */
	createUpdateMessage(code: string): SandboxMessage {
		return {
			type: 'update',
			code
		};
	}

	/**
	 * Get sandbox template URI for webview
	 * This returns a webview URI that can be used in iframe src
	 */
	getSandboxTemplateUri(webview: vscode.Webview): vscode.Uri {
		return webview.asWebviewUri(this.sandboxTemplateUri);
	}
}
