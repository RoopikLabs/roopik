/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import { openFileAtLine, getWorkspaceRoot } from './utils/editorControl';
import { ViteServerManager } from './devServer/viteServerManager';
import { StyleContextGatherer } from './styleContextGatherer';
import { ConfigManager } from './config';
import { Logger } from './logger';

/**
 * Mode 2: Project Preview Panel
 *
 * Shows full React project preview with:
 * - Browser-like UI with address bar
 * - Toggle for click-to-source debugging mode
 * - Hot reload via Vite HMR (automatic)
 * - Click-to-source to jump to code
 */
export class ProjectPreviewPanel {
	private static currentPanel: ProjectPreviewPanel | undefined;
	private readonly _panel: vscode.WebviewPanel;
	private _disposables: vscode.Disposable[] = [];
	private _viteServerUrl: string = '';
	private _highlightMode: boolean = false; // Default: disabled
	private _serverManager: ViteServerManager | undefined;
	private _logger: ReturnType<typeof Logger.prototype.createScoped>;
	private _iframeLogger: ReturnType<typeof Logger.prototype.createScoped>;
	private readonly _extensionUri: vscode.Uri;

	/**
	 * Create or show project preview panel
	 */
	public static async createOrShow(extensionUri: vscode.Uri, projectRoot: string) {
		const column = vscode.ViewColumn.Two; // Show on right side

		// If panel already exists, reveal it
		if (ProjectPreviewPanel.currentPanel) {
			ProjectPreviewPanel.currentPanel._panel.reveal(column);
			return;
		}

		// Create new panel
		const panel = vscode.window.createWebviewPanel(
			'roopikProjectPreview',
			'Preview Mode',
			column,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [
					extensionUri,
					vscode.Uri.joinPath(extensionUri, 'webview', 'build')
				]
			}
		);

		ProjectPreviewPanel.currentPanel = new ProjectPreviewPanel(
			panel,
			extensionUri,
			projectRoot
		);

		// Start dev server
		await ProjectPreviewPanel.currentPanel.startDevServer();
	}

	private constructor(
		panel: vscode.WebviewPanel,
		extensionUri: vscode.Uri,
		projectRoot: string
	) {
		this._panel = panel;
		this._extensionUri = extensionUri;
		this._serverManager = ViteServerManager.getInstance(projectRoot, extensionUri.fsPath);

		// Initialize loggers
		const logger = Logger.getInstance();
		this._logger = logger.createScoped('ProjectPreview');
		this._iframeLogger = logger.createScoped('Iframe');

		// Set initial HTML (loading state)
		this._update();

		// Listen for panel disposal
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

		// Handle messages from webview
		this._panel.webview.onDidReceiveMessage(
			async (message) => {
				switch (message.type) {
					case 'iframe-log': {
						// Relay iframe console logs to Logger
						const args = message.args || [];
						const logMessage = args.map((arg: any) =>
							typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
						).join(' ');

						switch (message.level) {
							case 'log':
								this._iframeLogger.info(logMessage);
								break;
							case 'warn':
								this._iframeLogger.warn(logMessage);
								break;
							case 'error':
								this._iframeLogger.error(logMessage);
								break;
							default:
								this._iframeLogger.info(logMessage);
						}
						break;
					}

					case 'click-to-source':
						await this._handleClickToSource(message);
						break;

					case 'toggle-highlight-mode':
						this._highlightMode = message.enabled;
						this._logger.debug('Highlight mode toggled: ' + (this._highlightMode ? 'ON' : 'OFF'));
						break;

					case 'navigate':
						this._logger.debug('Navigation: ' + message.url);
						// Could track current route here if needed
						break;

					case 'update-title':
						// Update panel title with page title
						if (message.title) {
							this._panel.title = message.title;
							this._logger.debug('Panel title updated: ' + message.title);
						}
						break;

					case 'stop-server':
						// Stop the dev server
						if (this._serverManager) {
							this._serverManager.stop();
							vscode.window.showInformationMessage('Dev server stopped');
							// Close the panel
							this._panel.dispose();
						}
						break;
				}
			},
			null,
			this._disposables
		);
	}

	/**
	 * Start the dev server and update preview
	 */
	private async startDevServer() {
		try {
			// Show initial loading state (React app handles this via window.INITIAL_LOADING)
			this._update();

			const url = await this._serverManager!.start();
			this._viteServerUrl = url;

			// Update preview with actual server URL
			this._update();
		} catch (error: any) {
			vscode.window.showErrorMessage(`Failed to start dev server: ${error.message}`);
		}
	}

	/**
	 * Handle click-to-source message from webview
	 */
	private async _handleClickToSource(message: any) {
		const { file, line, column, endLine, endColumn, componentName, parentContext } = message;

		this._logger.info('========================================');
		this._logger.info('Click-to-source received!');
		this._logger.info(`  File: ${file}`);
		this._logger.info(`  Line: ${line}:${column}${endLine ? ` → ${endLine}:${endColumn}` : ''}`);
		this._logger.info(`  Component: ${componentName || 'unknown'}`);

		// Log parent context metadata if available
		if (parentContext) {
			this._logger.info(`  Parent Context: ${parentContext}`);
			// Parse and display parent metadata
			const parts = parentContext.split('|');
			if (parts.length === 2) {
				const [componentName, tagChain] = parts;
				this._logger.info(`    → Parent Component: ${componentName}`);
				this._logger.info(`    → Parent Tag Chain: ${tagChain}`);
			}
		}

		const workspaceRoot = getWorkspaceRoot();
		this._logger.info(`  Workspace root: ${workspaceRoot}`);

		if (!workspaceRoot) {
			this._logger.error('✗ No workspace folder open');
			vscode.window.showErrorMessage('No workspace folder open');
			return;
		}

		// TEST: Style Context Gatherer
		try {
			// file is already an absolute path (e.g., C:/Users/.../Home.jsx)
			// Just normalize slashes for Windows
			const absoluteFilePath = file.replace(/\//g, '\\');
			const gatherer = new StyleContextGatherer(vscode.Uri.file(workspaceRoot));
			const configManager = ConfigManager.getInstance(workspaceRoot);
			const config = configManager.getConfig();
			const styleContext = await gatherer.gatherContext(absoluteFilePath, { enabled: config.ai.enableStyleContext });

			this._logger.info('');
			this._logger.info('========== STYLE CONTEXT RESULT ==========');
			this._logger.info(`Found ${styleContext.relatedFiles.length} style files for ${file}`);

			styleContext.relatedFiles.forEach((f, i) => {
				this._logger.info('');
				this._logger.info(`--- File ${i + 1}: ${f.relativePath} ---`);
				this._logger.info(`  Full Path: ${f.path}`);
				this._logger.info(`  Type: ${f.type}`);
				this._logger.info(`  Strategy: ${f.strategy}`);
				this._logger.info(`  Language: ${f.language}`);
				this._logger.info(`  Content Size: ${f.content.length} bytes`);
				this._logger.info(`  Content Preview:`);
				this._logger.info(`  ${f.content.replace(/\n/g, '\n  ')}`);
			});

			this._logger.info('');
			this._logger.info('========== END STYLE CONTEXT ==========');
			this._logger.info('');
		} catch (err) {
			this._logger.error('Style Context Test Error', err);
		}

		try {
			this._logger.info('Opening file in VS Code...');

			// Open file in VS Code editor (left column)
			await openFileAtLine(workspaceRoot, {
				file,
				line,
				column,
				endLine, // Multi-line element support
				endColumn, // Multi-line element support
				viewColumn: vscode.ViewColumn.One, // Left side
				preview: false,
				preserveFocus: false // Focus the editor
			});

			this._logger.info('✓ File opened successfully');

			// Show success message
			vscode.window.setStatusBarMessage(
				`✓ Opened ${path.basename(file)}:${line}`,
				3000
			);
		} catch (error) {
			this._logger.error('✗ Failed to open file', error);
			vscode.window.showErrorMessage(`Failed to open ${file}: ${error}`);
		}
		this._logger.info('========================================');
	}

	/**
	 * Update webview HTML content
	 */
	private _update() {
		const webview = this._panel.webview;
		this._panel.webview.html = this._getHtmlForWebview(webview);
	}

	/**
	 * Generate HTML for webview with browser-like UI
	 * Loads from external template file for easier maintenance
	 */
	private _getHtmlForWebview(webview: vscode.Webview): string {
		// Get resource URIs
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this._extensionUri, 'webview', 'build', 'assets', 'projectView.js')
		);
		const styleUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this._extensionUri, 'webview', 'build', 'assets', 'projectView.css')
		);
		const sharedStyleUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this._extensionUri, 'webview', 'build', 'assets', 'BottomActionBar.css')
		);

		// CSP
		const csp = `
			default-src 'none';
			style-src ${webview.cspSource} 'unsafe-inline';
			script-src ${webview.cspSource} 'unsafe-inline' 'unsafe-eval';
			font-src ${webview.cspSource};
			img-src ${webview.cspSource} data:;
			connect-src ${webview.cspSource};
			frame-src ${webview.cspSource} http://localhost:* http://127.0.0.1:* data: blob:;
		`;

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="${csp.replace(/\s+/g, ' ').trim()}">
	<style>
		body {
			padding: 0;
			margin: 0;
			overflow: hidden;
			background-color: var(--vscode-editor-background);
			color: var(--vscode-foreground);
		}
	</style>
	<link href="${styleUri}" rel="stylesheet">
	<link href="${sharedStyleUri}" rel="stylesheet">
	<title>Roopik Preview</title>
</head>
<body>
	<div id="root"></div>
	<script>
		window.VITE_SERVER_URL = ${this._viteServerUrl ? JSON.stringify(this._viteServerUrl) : 'undefined'};
		window.INITIAL_LOADING = ${!this._viteServerUrl};
	</script>
	<script type="module" src="${scriptUri}"></script>
</body>
</html>`;
	}

	public dispose() {
		this._logger.info('Disposing preview panel...');
		ProjectPreviewPanel.currentPanel = undefined;

		// Stop dev server
		if (this._serverManager) {
			this._logger.info('Stopping dev server...');
			this._serverManager.stop();
			this._serverManager.dispose();
		}

		// Don't call this._panel.dispose() here if already disposed
		// The panel disposal triggers this method

		while (this._disposables.length) {
			const disposable = this._disposables.pop();
			if (disposable) {
				disposable.dispose();
			}
		}
	}
}
