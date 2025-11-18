/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import { openFileAtLine, getWorkspaceRoot } from './utils/editorControl';
import { ViteServerManager } from './devServer/viteServerManager';

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
			'🎨 Roopik Preview',
			column,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [extensionUri]
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
		_extensionUri: vscode.Uri,
		projectRoot: string
	) {
		this._panel = panel;
		this._serverManager = ViteServerManager.getInstance(projectRoot);

		// Set initial HTML (loading state)
		this._update();

		// Listen for panel disposal
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

		// Handle messages from webview
		this._panel.webview.onDidReceiveMessage(
			async (message) => {
				switch (message.type) {
					case 'iframe-log':
						// Relay iframe console logs to extension console
						const prefix = '[Roopik Iframe]';
						const args = message.args || [];
						switch (message.level) {
							case 'log':
								console.log(prefix, ...args);
								break;
							case 'warn':
								console.warn(prefix, ...args);
								break;
							case 'error':
								console.error(prefix, ...args);
								break;
							default:
								console.log(prefix, ...args);
						}
						break;

					case 'click-to-source':
						await this._handleClickToSource(message);
						break;

					case 'toggle-highlight-mode':
						this._highlightMode = message.enabled;
						console.log('[Roopik] Highlight mode:', this._highlightMode ? 'ON' : 'OFF');
						break;

					case 'navigate':
						console.log('[Roopik] Navigation:', message.url);
						// Could track current route here if needed
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
			this._panel.webview.html = this._getLoadingHtml();

			const url = await this._serverManager!.start();
			this._viteServerUrl = url;

			// Update preview with actual server URL
			this._update();
		} catch (error: any) {
			vscode.window.showErrorMessage(`Failed to start dev server: ${error.message}`);
		}
	}

	/**
	 * Get loading HTML
	 */
	private _getLoadingHtml(): string {
		return `<!DOCTYPE html>
<html>
<head>
	<meta charset="UTF-8">
	<title>Starting Server...</title>
	<style>
		body {
			font-family: var(--vscode-font-family);
			background: var(--vscode-editor-background);
			color: var(--vscode-editor-foreground);
			display: flex;
			align-items: center;
			justify-content: center;
			height: 100vh;
			margin: 0;
		}
		.loader {
			text-align: center;
		}
		.spinner {
			border: 4px solid rgba(255, 255, 255, 0.1);
			border-top: 4px solid var(--vscode-button-background);
			border-radius: 50%;
			width: 40px;
			height: 40px;
			animation: spin 1s linear infinite;
			margin: 0 auto 20px;
		}
		@keyframes spin {
			0% { transform: rotate(0deg); }
			100% { transform: rotate(360deg); }
		}
	</style>
</head>
<body>
	<div class="loader">
		<div class="spinner"></div>
		<p>Starting dev server...</p>
		<p style="font-size: 12px; opacity: 0.7; margin-top: 10px;">
			Installing dependencies if needed
		</p>
	</div>
</body>
</html>`;
	}

	/**
	 * Handle click-to-source message from webview
	 */
	private async _handleClickToSource(message: any) {
		const { file, line, column, componentName } = message;

		console.log(`[Roopik] ========================================`);
		console.log(`[Roopik] Click-to-source received!`);
		console.log(`[Roopik]   File: ${file}`);
		console.log(`[Roopik]   Line: ${line}`);
		console.log(`[Roopik]   Column: ${column}`);
		console.log(`[Roopik]   Component: ${componentName || 'unknown'}`);

		const workspaceRoot = getWorkspaceRoot();
		console.log(`[Roopik]   Workspace root: ${workspaceRoot}`);

		if (!workspaceRoot) {
			console.error('[Roopik] ✗ No workspace folder open');
			vscode.window.showErrorMessage('No workspace folder open');
			return;
		}

		try {
			console.log(`[Roopik] Opening file in VS Code...`);

			// Open file in VS Code editor (left column)
			await openFileAtLine(workspaceRoot, {
				file,
				line,
				column,
				viewColumn: vscode.ViewColumn.One, // Left side
				preview: false,
				preserveFocus: false // Focus the editor
			});

			console.log(`[Roopik] ✓ File opened successfully`);

			// Show success message
			vscode.window.setStatusBarMessage(
				`✓ Opened ${path.basename(file)}:${line}`,
				3000
			);
		} catch (error) {
			console.error(`[Roopik] ✗ Failed to open file:`, error);
			vscode.window.showErrorMessage(`Failed to open ${file}: ${error}`);
		}
		console.log(`[Roopik] ========================================`);
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
	 */
	private _getHtmlForWebview(_webview: vscode.Webview): string {
		const viteUrl = this._viteServerUrl;

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Roopik Preview</title>
	<style>
		* {
			margin: 0;
			padding: 0;
			box-sizing: border-box;
		}

		body {
			font-family: var(--vscode-font-family);
			background-color: var(--vscode-editor-background);
			color: var(--vscode-editor-foreground);
			overflow: hidden;
			height: 100vh;
			display: flex;
			flex-direction: column;
		}

		/* Browser Chrome (Top Bar) */
		.browser-chrome {
			background: var(--vscode-titleBar-activeBackground);
			border-bottom: 1px solid var(--vscode-panel-border);
			padding: 8px 12px;
			display: flex;
			align-items: center;
			gap: 8px;
			flex-shrink: 0;
		}

		.browser-controls {
			display: flex;
			gap: 4px;
		}

		.control-btn {
			background: var(--vscode-button-secondaryBackground);
			border: none;
			color: var(--vscode-button-secondaryForeground);
			padding: 4px 8px;
			border-radius: 4px;
			cursor: pointer;
			font-size: 14px;
			transition: background 0.2s;
		}

		.control-btn:hover {
			background: var(--vscode-button-secondaryHoverBackground);
		}

		.control-btn:disabled {
			opacity: 0.5;
			cursor: not-allowed;
		}

		.address-bar {
			flex: 1;
			background: var(--vscode-input-background);
			border: 1px solid var(--vscode-input-border);
			color: var(--vscode-input-foreground);
			padding: 6px 12px;
			border-radius: 4px;
			font-size: 13px;
			font-family: var(--vscode-editor-font-family);
		}

		/* Highlight Toggle Button */
		.highlight-toggle {
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			border: none;
			padding: 6px 12px;
			border-radius: 4px;
			cursor: pointer;
			font-size: 12px;
			font-weight: 500;
			display: flex;
			align-items: center;
			gap: 6px;
			transition: all 0.2s;
		}

		.highlight-toggle:hover {
			background: var(--vscode-button-hoverBackground);
		}

		.highlight-toggle.active {
			background: #4fc3f7;
			color: #000;
		}

		.highlight-indicator {
			width: 8px;
			height: 8px;
			border-radius: 50%;
			background: currentColor;
		}

		/* Stop Server Button */
		.stop-server-btn {
			background: #e74c3c;
			color: white;
			border: none;
			padding: 6px 12px;
			border-radius: 4px;
			cursor: pointer;
			font-size: 14px;
			font-weight: 500;
			display: flex;
			align-items: center;
			transition: all 0.2s;
		}

		.stop-server-btn:hover {
			background: #c0392b;
		}

		/* Preview Frame */
		.preview-container {
			flex: 1;
			position: relative;
			overflow: hidden;
		}

		#preview-frame {
			width: 100%;
			height: 100%;
			border: none;
			background: white;
		}

		/* Loading State */
		.loading {
			position: absolute;
			top: 50%;
			left: 50%;
			transform: translate(-50%, -50%);
			text-align: center;
			color: var(--vscode-descriptionForeground);
		}
	</style>
</head>
<body>
	<!-- Browser Chrome -->
	<div class="browser-chrome">
		<!-- Navigation Controls -->
		<div class="browser-controls">
			<button class="control-btn" id="back-btn" title="Back" disabled>←</button>
			<button class="control-btn" id="forward-btn" title="Forward" disabled>→</button>
			<button class="control-btn" id="refresh-btn" title="Refresh">⟳</button>
		</div>

		<!-- Address Bar -->
		<input
			type="text"
			class="address-bar"
			id="address-bar"
			value="${viteUrl}"
		/>

		<!-- Highlight Mode Toggle -->
		<button class="highlight-toggle" id="highlight-toggle" title="Toggle click-to-source debugging">
			<span class="highlight-indicator"></span>
			<span id="highlight-label">Debug Off</span>
		</button>

		<!-- Stop Server Button -->
		<button class="stop-server-btn" id="stop-server" title="Stop dev server and close preview">
			<span>⏹</span>
		</button>
	</div>

	<!-- Preview Frame -->
	<div class="preview-container">
		<div class="loading" id="loading">
			<p>Loading preview...</p>
			<p style="font-size: 12px; margin-top: 8px;">Make sure Vite dev server is running</p>
		</div>
		<iframe
			id="preview-frame"
			src="${viteUrl}"
			sandbox="allow-scripts allow-same-origin allow-forms allow-modals"
			style="display: none;"
		></iframe>
	</div>

	<script>
		const vscode = acquireVsCodeApi();
		const frame = document.getElementById('preview-frame');
		const loading = document.getElementById('loading');
		const addressBar = document.getElementById('address-bar');
		const highlightToggle = document.getElementById('highlight-toggle');
		const highlightLabel = document.getElementById('highlight-label');
		const backBtn = document.getElementById('back-btn');
		const forwardBtn = document.getElementById('forward-btn');
		const refreshBtn = document.getElementById('refresh-btn');
		const stopServerBtn = document.getElementById('stop-server');

		let highlightMode = false;
		let navigationHistory = [];
		let currentHistoryIndex = -1;

		// Show frame when loaded
		frame.addEventListener('load', () => {
			loading.style.display = 'none';
			frame.style.display = 'block';
			console.log('[Roopik] Preview loaded successfully');

			// Set initial address bar (will be updated by messages from iframe)
			addressBar.value = frame.src;

			// Add to navigation history
			if (currentHistoryIndex === -1 || navigationHistory[currentHistoryIndex] !== frame.src) {
				navigationHistory = navigationHistory.slice(0, currentHistoryIndex + 1);
				navigationHistory.push(frame.src);
				currentHistoryIndex = navigationHistory.length - 1;
			}
			updateNavigationButtons();

			// Notify iframe of debug mode state (via postMessage)
			// The script is already injected via Vite plugin, just need to send state
			if (highlightMode) {
				sendDebugModeToIframe(true);
			}
		});

		// Update back/forward button states
		function updateNavigationButtons() {
			backBtn.disabled = currentHistoryIndex <= 0;
			forwardBtn.disabled = currentHistoryIndex >= navigationHistory.length - 1;
		}

		// Highlight mode toggle
		highlightToggle.addEventListener('click', () => {
			highlightMode = !highlightMode;
			highlightToggle.classList.toggle('active', highlightMode);
			highlightLabel.textContent = highlightMode ? 'Debug On' : 'Debug Off';

			// Notify extension
			vscode.postMessage({
				type: 'toggle-highlight-mode',
				enabled: highlightMode
			});

			// Send to iframe via postMessage (cross-origin safe)
			sendDebugModeToIframe(highlightMode);
		});

		// Send debug mode state to iframe
		function sendDebugModeToIframe(enabled) {
			try {
				frame.contentWindow.postMessage({
					type: 'roopik-toggle-debug',
					enabled: enabled
				}, '*');
				console.log('[Roopik] Sent debug mode to iframe:', enabled);
			} catch (error) {
				console.error('[Roopik] Failed to send message to iframe:', error);
			}
		}

		// Listen for messages FROM iframe (postMessage)
		window.addEventListener('message', (event) => {
			// Log ALL messages for debugging
			console.log('[Roopik Webview] Message received:', event.data);

			// Accept messages from any origin (iframe can be localhost:5173 or any port)
			const message = event.data;

			// Relay iframe console logs to extension
			if (message.type === 'roopik-log') {
				vscode.postMessage({
					type: 'iframe-log',
					level: message.level,
					args: message.args
				});
			} else if (message.type === 'roopik-click-to-source') {
				// Received click-to-source from iframe
				console.log('[Roopik Webview] ✓ Got click-to-source, forwarding to extension');
				vscode.postMessage({
					type: 'click-to-source',
					file: message.file,
					line: message.line,
					column: message.column,
					componentName: message.componentName
				});
				console.log('[Roopik Webview] ✓ Forwarded to extension');
			} else if (message.type === 'roopik-navigate') {
				// Update address bar with current URL
				const newUrl = message.url;
				addressBar.value = newUrl;
				console.log('[Roopik Webview] Navigation:', newUrl);

				// Update history
				if (currentHistoryIndex === -1 || navigationHistory[currentHistoryIndex] !== newUrl) {
					// Remove forward history if navigating to new page
					navigationHistory = navigationHistory.slice(0, currentHistoryIndex + 1);
					navigationHistory.push(newUrl);
					currentHistoryIndex = navigationHistory.length - 1;
					updateNavigationButtons();
				}
			} else {
				console.log('[Roopik Webview] Unknown message type:', message.type);
			}
		});

		// Browser controls
		backBtn.addEventListener('click', () => {
			if (currentHistoryIndex > 0) {
				currentHistoryIndex--;
				const url = navigationHistory[currentHistoryIndex];
				frame.src = url;
				addressBar.value = url;
				updateNavigationButtons();
			}
		});

		forwardBtn.addEventListener('click', () => {
			if (currentHistoryIndex < navigationHistory.length - 1) {
				currentHistoryIndex++;
				const url = navigationHistory[currentHistoryIndex];
				frame.src = url;
				addressBar.value = url;
				updateNavigationButtons();
			}
		});

		refreshBtn.addEventListener('click', () => {
			// Reload iframe by changing src
			const currentSrc = frame.src;
			frame.src = 'about:blank';
			setTimeout(() => {
				frame.src = currentSrc;
			}, 10);
		});

		// Stop server button
		stopServerBtn.addEventListener('click', () => {
			// Can't use confirm() in sandboxed webview, just send directly
			vscode.postMessage({ type: 'stop-server' });
		});

		// Address bar manual entry
		addressBar.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				const newUrl = addressBar.value.trim();
				if (newUrl && newUrl.startsWith('http')) {
					frame.src = newUrl;
				}
			}
		});

		// Initial URL set
		addressBar.value = '${viteUrl}';
	</script>
</body>
</html>`;
	}

	public dispose() {
		console.log('[Roopik] Disposing preview panel...');
		ProjectPreviewPanel.currentPanel = undefined;

		// Stop dev server
		if (this._serverManager) {
			console.log('[Roopik] Stopping dev server...');
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
