/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as fs from 'fs';
import { ConfigManager } from './config';
import { CanvasPanel } from './canvasPanel';
import { SettingsPanel } from './settingsPanel';

/**
 * Dashboard Panel - Welcome screen and canvas management interface
 *
 * Features:
 * - Recently opened canvases
 * - All saved canvases with metadata
 * - New Canvas creation
 * - Settings configuration
 * - Optional startup display
 */
export class DashboardPanel {
	private static currentPanel: DashboardPanel | undefined;

	private readonly _panel: vscode.WebviewPanel;
	private _disposables: vscode.Disposable[] = [];
	private readonly extensionUri: vscode.Uri;
	private readonly workspaceRoot: string;
	private configManager: ConfigManager;
	private refreshTimeout: NodeJS.Timeout | undefined;

	/**
	 * Create or show the dashboard panel (singleton)
	 */
	public static createOrShow(extensionUri: vscode.Uri, workspaceRoot: string) {
		const column = vscode.ViewColumn.One;

		// If dashboard already exists, show it
		if (DashboardPanel.currentPanel) {
			DashboardPanel.currentPanel._panel.reveal(column);
			DashboardPanel.currentPanel.refresh(); // Refresh data
			return;
		}

		// Create new dashboard panel
		const panel = vscode.window.createWebviewPanel(
			'roopikDashboard',
			'Roopik Dashboard',
			column,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [
					vscode.Uri.joinPath(extensionUri, 'out'),
					vscode.Uri.joinPath(extensionUri, 'dashboard-ui', 'build')
				]
			}
		);

		DashboardPanel.currentPanel = new DashboardPanel(panel, extensionUri, workspaceRoot);
	}

	/**
	 * Close the dashboard panel
	 */
	public static close() {
		if (DashboardPanel.currentPanel) {
			DashboardPanel.currentPanel.dispose();
		}
	}

	private constructor(
		panel: vscode.WebviewPanel,
		extensionUri: vscode.Uri,
		workspaceRoot: string
	) {
		this._panel = panel;
		this.extensionUri = extensionUri;
		this.workspaceRoot = workspaceRoot;
		this.configManager = ConfigManager.getInstance(workspaceRoot);

		// Set the webview's initial html content
		this._update();

		// Listen for when the panel is disposed
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

		// Handle messages from the webview
		this._panel.webview.onDidReceiveMessage(
			message => {
				switch (message.type) {
					case 'openCanvas':
						this.handleOpenCanvas(message.canvasId, message.canvasName);
						break;
					case 'newCanvas':
						this.handleNewCanvas();
						break;
					case 'deleteCanvas':
						this.handleDeleteCanvas(message.canvasId);
						break;
					case 'renameCanvas':
						this.handleRenameCanvas(message.canvasId, message.currentName);
						break;
					case 'exportCanvas':
						this.handleExportCanvas(message.canvasId);
						break;
					case 'importCanvas':
						this.handleImportCanvas();
						break;
					case 'refreshData':
						this.refresh();
						break;
					case 'updateSettings':
						this.handleUpdateSettings(message.settings);
						break;
					case 'log':
						console.log('[Dashboard]', message.text);
						break;
					case 'error':
						console.error('[Dashboard]', message.error);
						vscode.window.showErrorMessage(`Dashboard error: ${message.error}`);
						break;
				}
			},
			null,
			this._disposables
		);

		// Listen for canvas open/close events and refresh dashboard
		const canvasChangeDisposable = CanvasPanel.onDidChangePanels(() => {
			// Debounce refresh to avoid too many updates
			if (this.refreshTimeout) {
				clearTimeout(this.refreshTimeout);
			}
			this.refreshTimeout = setTimeout(() => {
				this.refresh();
			}, 100);
		});
		this._disposables.push(canvasChangeDisposable);
	}

	/**
	 * Handle opening a canvas from dashboard
	 */
	private handleOpenCanvas(canvasId: string, canvasName?: string) {
		console.log(`[Dashboard] Opening canvas: ${canvasId}`);
		CanvasPanel.createOrShow(this.extensionUri, canvasId, canvasName);

		// Refresh dashboard to update status badges (Open → Focus, blue border)
		// Use setTimeout to let the canvas fully open first
		setTimeout(() => {
			this.refresh();
		}, 100);
	}

	/**
	 * Handle creating a new canvas
	 */
	private async handleNewCanvas() {
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
			// Convert to slug for ID
			const canvasId = canvasName.toLowerCase()
				.trim()
				.replace(/\s+/g, '-')
				.replace(/[^a-z0-9-]/g, '');

			CanvasPanel.createOrShow(this.extensionUri, canvasId, canvasName);

			// Refresh dashboard to show new canvas
			this.refresh();
		}
	}

	/**
	 * Handle deleting a canvas
	 */
	private async handleDeleteCanvas(canvasId: string) {
		// Use the new centralized delete method
		const success = CanvasPanel.deleteCanvas(canvasId, this.workspaceRoot);
		if (success) {
			vscode.window.showInformationMessage(`Canvas "${canvasId}" deleted.`);
			// Refresh dashboard
			this.refresh();
		} else {
			vscode.window.showErrorMessage(`Failed to delete canvas "${canvasId}".`);
		}
	}

	/**
	 * Handle renaming a canvas
	 */
	private handleRenameCanvas(canvasId: string, currentName: string) {
		// Execute the rename command which will show input box
		vscode.commands.executeCommand('roopik.renameCanvas', canvasId, currentName)
			.then(() => {
				// Refresh dashboard after rename
				setTimeout(() => {
					this.refresh();
				}, 100);
			});
	}

	/**
	 * Handle exporting a canvas
	 */
	private handleExportCanvas(canvasId: string) {
		vscode.commands.executeCommand('roopik.exportCanvas', canvasId);
	}

	/**
	 * Handle importing a canvas
	 */
	private handleImportCanvas() {
		vscode.commands.executeCommand('roopik.importCanvas')
			.then(() => {
				// Refresh dashboard after import
				setTimeout(() => {
					this.refresh();
				}, 100);
			});
	}

	/**
	 * Handle updating settings
	 */
	private async handleUpdateSettings(settings: any) {
		console.log('[Dashboard] Settings update requested:', settings);
		try {
			await this.configManager.updateConfig(settings);
			vscode.window.showInformationMessage('Settings updated successfully.');
			// Refresh dashboard to reflect changes
			setTimeout(() => {
				this.refresh();
			}, 100);
		} catch (error) {
			console.error('[Dashboard] Failed to update settings:', error);
			vscode.window.showErrorMessage('Failed to update settings.');
		}
	}

	/**
	 * Refresh dashboard data by regenerating HTML
	 */
	public refresh() {
		console.log('[Dashboard] Refreshing data...');
		this._update(); // Regenerate the entire HTML
	}

	/**
	 * Get all dashboard data
	 */
	private getDashboardData() {
		const config = this.configManager.getConfig();
		const allCanvases = CanvasPanel.getAllCanvasStates(this.workspaceRoot);
		const openCanvasIds = CanvasPanel.getOpenCanvasIds();
		const sessionPath = this.configManager.getSessionPath();

		// Get recently opened canvases from session
		let recentCanvasIds: string[] = [];
		try {
			if (fs.existsSync(sessionPath)) {
				const sessionFile = fs.readFileSync(sessionPath, 'utf8');
				const session = JSON.parse(sessionFile);
				recentCanvasIds = session.canvasIds || [];
			}
		} catch (error) {
			console.error('[Dashboard] Failed to load recent canvases:', error);
		}

		// Map recent canvas IDs to full canvas states
		const recentCanvases = recentCanvasIds
			.map(id => allCanvases.find(c => c.id === id))
			.filter(c => c !== undefined);

		return {
			config,
			allCanvases,
			recentCanvases,
			openCanvasIds,
			stats: {
				totalCanvases: allCanvases.length,
				openCanvases: openCanvasIds.length,
				maxCanvases: config.performance.maxCanvases
			}
		};
	}

	public dispose() {
		console.log('[Dashboard] Disposing...');

		DashboardPanel.currentPanel = undefined;

		// Clear refresh timeout
		if (this.refreshTimeout) {
			clearTimeout(this.refreshTimeout);
		}

		// Clean up panel
		this._panel.dispose();

		while (this._disposables.length) {
			const disposable = this._disposables.pop();
			if (disposable) {
				disposable.dispose();
			}
		}

		console.log('[Dashboard] Disposed');
	}

	private _update() {
		const webview = this._panel.webview;
		this._panel.webview.html = this._getHtmlForWebview(webview);
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		const dashboardData = this.getDashboardData();

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline';">
	<title>Roopik</title>
	<style>
		* {
			box-sizing: border-box;
		}

		body {
			margin: 0;
			padding: 0;
			font-family: var(--vscode-font-family);
			color: var(--vscode-foreground);
			background-color: var(--vscode-editor-background);
			font-size: 13px;
			overflow: hidden; /* Prevent page scroll */
			height: 100vh;
			width: 100vw;
		}

		.container {
			display: flex;
			flex-direction: column;
			height: 100vh;
			width: 100%;
		}

		.header {
			flex-shrink: 0;
			padding: 32px 40px 24px 40px;
			border-bottom: 1px solid var(--vscode-panel-border);
			position: relative;
		}

		.settings-icon {
			position: absolute;
			top: 32px;
			right: 40px;
			width: 32px;
			height: 32px;
			border-radius: 4px;
			border: none;
			background-color: transparent;
			color: var(--vscode-foreground);
			font-size: 18px;
			cursor: pointer;
			display: flex;
			align-items: center;
			justify-content: center;
			transition: all 0.2s;
			padding: 0;
		}

		.settings-icon:hover {
			background-color: var(--vscode-toolbar-hoverBackground);
			color: var(--vscode-focusBorder);
		}

		h1 {
			font-size: 32px;
			font-weight: 400;
			margin: 0 0 4px 0;
			letter-spacing: -0.5px;
		}

		.subtitle {
			color: var(--vscode-descriptionForeground);
			font-size: 13px;
			margin: 0;
		}

		/* Main content area - NO scrolling here */
		.main-content {
			flex: 1;
			display: flex;
			flex-direction: column;
			overflow: hidden; /* No scroll at this level */
			padding: 24px 40px;
			min-height: 0; /* Allow flex shrinking */
		}

		.content-grid {
			display: grid;
			grid-template-columns: 280px 1fr;
			gap: 40px;
			max-width: 1600px;
			flex: 1;
			min-height: 0; /* Allow flex shrinking */
			overflow: hidden;
		}

		/* Responsive breakpoints */
		@media (max-width: 900px) {
			.content-grid {
				grid-template-columns: 1fr;
				gap: 24px;
			}
			.header {
				padding: 24px 24px 16px 24px;
			}
			.main-content {
				padding: 16px 24px 16px 24px;
			}
		}

		/* Left column - Start & Recent */
		.left-column {
			display: flex;
			flex-direction: column;
			gap: 24px;
			min-width: 0; /* Allow shrinking */
			overflow-y: auto; /* Scroll only if needed */
			min-height: 0;
		}

		/* On smaller screens, show Start and Recent side-by-side to save vertical space */
		@media (max-width: 900px) {
			.left-column {
				flex-direction: row;
				gap: 20px;
				overflow-y: visible;
			}
		}

		/* Right column - Stats & Canvases */
		.right-column {
			display: flex;
			flex-direction: column;
			gap: 16px; /* Reduced gap to minimize wasted space */
			min-width: 0; /* Allow shrinking */
			min-height: 0; /* Allow flex shrinking */
			overflow: hidden;
		}

		/* When stats are hidden, remove gap completely */
		@media (max-width: 900px) {
			.right-column {
				gap: 0;
			}
		}

		.section {
			margin-bottom: 0;
		}
		.section-title {
			font-size: 13px;
			font-weight: 600;
			margin-bottom: 12px;
			text-transform: uppercase;
			letter-spacing: 0.5px;
			color: var(--vscode-descriptionForeground);
		}

		/* Start section - VS Code style */
		.start-list {
			list-style: none;
			padding: 0;
			margin: 0;
		}
		.start-item {
			margin-bottom: 8px;
		}
		.start-link {
			display: flex;
			align-items: center;
			gap: 8px;
			color: var(--vscode-textLink-foreground);
			text-decoration: none;
			padding: 4px 0;
			cursor: pointer;
		}
		.start-link:hover {
			color: var(--vscode-textLink-activeForeground);
			text-decoration: underline;
		}
		.start-icon {
			font-size: 16px;
			width: 20px;
			text-align: center;
		}

		/* Recent list - simple links with container */
		.recent-container {
			max-height: 200px;
			overflow-y: auto;
			overflow-x: hidden;
		}

		.recent-list {
			list-style: none;
			padding: 0;
			margin: 0;
		}

		.recent-item {
			margin-bottom: 6px;
		}

		.recent-link {
			color: var(--vscode-textLink-foreground);
			text-decoration: none;
			cursor: pointer;
			display: flex;
			align-items: center;
			gap: 6px;
			font-size: 13px;
			padding: 2px 0;
		}

		.recent-link:hover {
			color: var(--vscode-textLink-activeForeground);
			text-decoration: underline;
		}

		.status-dot {
			display: inline-block;
			width: 6px;
			height: 6px;
			border-radius: 50%;
			background-color: var(--vscode-charts-green);
			flex-shrink: 0;
		}

		/* Stats cards */
		.stats {
			display: grid;
			grid-template-columns: repeat(3, 1fr);
			gap: 12px;
			margin-bottom: 0;
		}

		@media (max-width: 1200px) {
			.stats {
				grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
			}
		}

		@media (max-width: 900px) {
			.stats {
				grid-template-columns: repeat(3, 1fr);
			}
		}

		/* Hide stats earlier to save space on smaller screens */
		@media (max-width: 900px) {
			.stats {
				display: none;
			}
		}

		.stat-card {
			padding: 16px;
			background-color: var(--vscode-editor-inactiveSelectionBackground);
			border: 1px solid var(--vscode-panel-border);
			border-radius: 6px;
			/* Subtle depth */
			box-shadow:
				0 1px 2px rgba(0, 0, 0, 0.08),
				0 1px 3px rgba(0, 0, 0, 0.04);
			transition: all 0.2s ease;
		}

		.stat-card:hover {
			/* Subtle lift on hover */
			transform: translateY(-1px);
			box-shadow:
				0 2px 4px rgba(0, 0, 0, 0.1),
				0 1px 6px rgba(0, 0, 0, 0.06);
		}

		.stat-label {
			font-size: 11px;
			color: var(--vscode-descriptionForeground);
			margin-bottom: 6px;
			text-transform: uppercase;
			letter-spacing: 0.5px;
		}

		.stat-value {
			font-size: 24px;
			font-weight: 300;
		}

		/* Custom scrollbar styling */
		.main-content::-webkit-scrollbar,
		.canvases-container::-webkit-scrollbar,
		.recent-container::-webkit-scrollbar {
			width: 10px;
			height: 10px;
		}

		.main-content::-webkit-scrollbar-track,
		.canvases-container::-webkit-scrollbar-track,
		.recent-container::-webkit-scrollbar-track {
			background: transparent;
		}

		.main-content::-webkit-scrollbar-thumb,
		.canvases-container::-webkit-scrollbar-thumb,
		.recent-container::-webkit-scrollbar-thumb {
			background: var(--vscode-scrollbarSlider-background);
			border-radius: 5px;
		}

		.main-content::-webkit-scrollbar-thumb:hover,
		.canvases-container::-webkit-scrollbar-thumb:hover,
		.recent-container::-webkit-scrollbar-thumb:hover {
			background: var(--vscode-scrollbarSlider-hoverBackground);
		}
		/* All Canvases Section - fills available space */
		.all-canvases-section {
			flex: 1; /* Take remaining space */
			min-height: 0;
			display: flex;
			flex-direction: column;
		}

		.canvases-container {
			flex: 1; /* Fill parent */
			overflow-y: auto;
			overflow-x: hidden;
			padding: 12px; /* Padding to prevent hover clipping */
			min-height: 0;
		}

		.canvas-grid {
			display: grid;
			grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
			gap: 12px;
		}

		@media (max-width: 1200px) {
			.canvas-grid {
				grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
			}
		}

		@media (max-width: 900px) {
			.canvas-grid {
				/* Keep proper tile sizing, don't stretch to full width */
				grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
			}
			.canvases-container {
				max-height: 400px;
			}
		}

		@media (max-width: 600px) {
			.canvas-grid {
				/* On very small screens, allow smaller minimum */
				grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
			}
		}

		.canvas-card {
			padding: 16px;
			background-color: var(--vscode-editor-inactiveSelectionBackground);
			border: 1px solid var(--vscode-panel-border);
			border-radius: 6px;
			cursor: pointer;
			transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
			position: relative;
			/* Depth with subtle shadow */
			box-shadow:
				0 1px 2px rgba(0, 0, 0, 0.1),
				0 1px 4px rgba(0, 0, 0, 0.05);
		}

		.canvas-card:hover {
			background-color: var(--vscode-list-hoverBackground);
			/* Lift effect with larger shadow and glow */
			transform: translateY(-2px);
			box-shadow:
				0 4px 8px rgba(0, 0, 0, 0.15),
				0 2px 12px rgba(0, 0, 0, 0.1),
				0 0 0 1px var(--vscode-focusBorder);
			border-color: var(--vscode-focusBorder);
		}

		.canvas-card.open {
			border-color: var(--vscode-focusBorder);
			/* Use better colors for light/dark theme */
			background: linear-gradient(135deg,
				var(--vscode-list-activeSelectionBackground) 0%,
				var(--vscode-list-hoverBackground) 100%);
			/* Slightly elevated even when not hovering */
			box-shadow:
				0 2px 4px rgba(0, 0, 0, 0.12),
				0 1px 6px rgba(0, 0, 0, 0.08),
				0 0 0 1px var(--vscode-focusBorder);
		}

		.canvas-card.open .canvas-name,
		.canvas-card.open .canvas-meta {
			/* Ensure text is readable in both themes */
			color: var(--vscode-foreground);
		}

		.canvas-card.open:hover {
			/* Open cards get extra glow on hover */
			transform: translateY(-3px);
			box-shadow:
				0 6px 12px rgba(0, 0, 0, 0.18),
				0 3px 16px rgba(0, 0, 0, 0.12),
				0 0 0 2px var(--vscode-focusBorder);
		}

		.canvas-actions {
			position: absolute;
			top: 8px;
			right: 8px;
			display: flex;
			gap: 4px;
			opacity: 0;
			transition: opacity 0.2s;
		}

		.canvas-card:hover .canvas-actions {
			opacity: 1;
		}

		.export-btn,
		.delete-btn {
			width: 24px;
			height: 24px;
			border-radius: 4px;
			border: none;
			background-color: transparent;
			color: var(--vscode-descriptionForeground);
			cursor: pointer;
			display: flex;
			align-items: center;
			justify-content: center;
			transition: all 0.2s;
			padding: 0;
		}

		.export-btn {
			font-size: 14px;
		}

		.delete-btn {
			font-size: 20px;
			line-height: 1;
		}

		.export-btn:hover {
			background-color: var(--vscode-button-secondaryBackground);
			color: var(--vscode-button-secondaryForeground);
		}

		.delete-btn:hover {
			background-color: var(--vscode-inputValidation-errorBackground);
			color: var(--vscode-inputValidation-errorForeground);
		}

		.canvas-name {
			font-size: 16px;
			font-weight: 600;
			margin-bottom: 8px;
			display: flex;
			align-items: center;
			gap: 8px;
			padding-right: 28px; /* Make space for delete button */
			cursor: text; /* Indicate it's editable */
		}

		.canvas-name:hover {
			text-decoration: underline;
			text-decoration-style: dotted;
		}

		.canvas-meta {
			font-size: 12px;
			color: var(--vscode-descriptionForeground);
			margin-bottom: 4px;
		}
		button {
			padding: 8px 16px;
			background-color: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			border: none;
			border-radius: 4px;
			cursor: pointer;
			font-size: 13px;
			font-weight: 500;
			transition: all 0.2s ease;
		}
		button:hover {
			background-color: var(--vscode-button-hoverBackground);
			transform: translateY(-1px);
			box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
		}
		button.secondary {
			/* Use accent/focus color for better visibility */
			background-color: var(--vscode-inputOption-activeBackground);
			color: var(--vscode-inputOption-activeForeground);
			border: 1px solid var(--vscode-inputOption-activeBorder);
		}
		button.secondary:hover {
			background-color: var(--vscode-inputOption-hoverBackground);
			border-color: var(--vscode-focusBorder);
		}
		button.danger {
			background-color: transparent;
			color: var(--vscode-errorForeground);
			border: 1px solid var(--vscode-errorForeground);
		}
		button.danger:hover {
			background-color: var(--vscode-inputValidation-errorBackground);
		}
		.empty-state {
			text-align: center;
			padding: 48px;
			color: var(--vscode-descriptionForeground);
		}
		.status-badge {
			display: inline-block;
			width: 8px;
			height: 8px;
			border-radius: 50%;
			background-color: var(--vscode-charts-green);
		}

		/* Footer - part of flex layout */
		.footer {
			flex-shrink: 0;
			padding: 16px 40px;
			border-top: 1px solid var(--vscode-panel-border);
			background-color: var(--vscode-editor-background);
		}

		@media (max-width: 900px) {
			.footer {
				padding: 12px 24px;
			}
		}

		.checkbox-container {
			display: flex;
			align-items: center;
			gap: 8px;
			cursor: pointer;
		}
		.checkbox-container input[type="checkbox"] {
			cursor: pointer;
		}
		.checkbox-container label {
			cursor: pointer;
			font-size: 13px;
			user-select: none;
		}

		${SettingsPanel.getSettingsCSS()}
	</style>
</head>
<body>
	<div class="container">
		<div class="header">
			<button class="settings-icon" onclick="openSettings()" title="Settings">⚙️</button>
			<h1>Roopik</h1>
			<p class="subtitle">Editing evolved</p>
		</div>

		<div class="main-content">
			<div class="content-grid">
				<!-- Left Column: Start & Recent -->
				<div class="left-column">
					<!-- Start Section -->
					<div class="section">
						<h2 class="section-title">Start</h2>
						<ul class="start-list">
							<li class="start-item">
								<a class="start-link" onclick="createNewCanvas()">
									<span class="start-icon">+</span>
									<span>New Canvas...</span>
								</a>
							</li>
							<li class="start-item">
								<a class="start-link" onclick="showAllCanvases()">
									<span class="start-icon">□</span>
									<span>Open Canvas...</span>
								</a>
							</li>
							<li class="start-item">
								<a class="start-link" onclick="importCanvas()">
									<span class="start-icon">↓</span>
									<span>Import Canvas...</span>
								</a>
							</li>
						</ul>
					</div>

					<!-- Recent Section -->
					${dashboardData.recentCanvases.length > 0 ? `
						<div class="section">
							<h2 class="section-title">Recent</h2>
							<div class="recent-container">
								<ul class="recent-list">
									${dashboardData.recentCanvases.map(canvas => {
			const isOpen = dashboardData.openCanvasIds.includes(canvas.id);
			return `
											<li class="recent-item">
												<a class="recent-link" onclick="openCanvas('${canvas.id}', '${canvas.name}')">
													${isOpen ? '<span class="status-dot"></span>' : ''}
													<span>${canvas.name}</span>
												</a>
											</li>
										`;
		}).join('')}
								</ul>
							</div>
						</div>
					` : ''}
				</div>

				<!-- Right Column: Stats & All Canvases -->
				<div class="right-column">
				<!-- Stats Section -->
				<div class="stats">
					<div class="stat-card">
						<div class="stat-label">Total Canvases</div>
						<div class="stat-value">${dashboardData.stats.totalCanvases}</div>
					</div>
					<div class="stat-card">
						<div class="stat-label">Open Canvases</div>
						<div class="stat-value">${dashboardData.stats.openCanvases} / ${dashboardData.stats.maxCanvases}</div>
					</div>
					<div class="stat-card">
						<div class="stat-label">Total Components</div>
						<div class="stat-value">${dashboardData.allCanvases.reduce((sum, c) => sum + (c.components?.length || 0), 0)}</div>
					</div>
				</div>

				<!-- All Canvases Section -->
				<div class="section all-canvases-section">
					<h2 class="section-title">All Canvases</h2>
					${dashboardData.allCanvases.length > 0 ? `
						<div class="canvases-container">
							<div class="canvas-grid">
								${dashboardData.allCanvases.map(canvas => {
			const isOpen = dashboardData.openCanvasIds.includes(canvas.id);
			return `
										<div class="canvas-card ${isOpen ? 'open' : ''}" onclick="openCanvas('${canvas.id}', '${canvas.name}')">
											<div class="canvas-actions">
												<button class="export-btn" onclick="event.stopPropagation(); exportCanvas('${canvas.id}')" title="Export canvas">
													<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
														<path d="M8 1L8 11M8 1L5 4M8 1L11 4M2 11V13C2 13.5304 2.21071 14.0391 2.58579 14.4142C2.96086 14.7893 3.46957 15 4 15H12C12.5304 15 13.0391 14.7893 13.4142 14.4142C13.7893 14.0391 14 13.5304 14 13V11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
													</svg>
												</button>
												<button class="delete-btn" onclick="event.stopPropagation(); deleteCanvas('${canvas.id}')" title="Delete canvas">×</button>
											</div>
											<div class="canvas-name" onclick="event.stopPropagation(); renameCanvas('${canvas.id}', '${canvas.name}')" title="Click to rename">
												${isOpen ? '<span class="status-badge"></span>' : ''}
												${canvas.name}
											</div>
											<div class="canvas-meta">${canvas.components?.length || 0} components</div>
											<div class="canvas-meta">Created: ${new Date(canvas.createdAt).toLocaleDateString()}</div>
											<div class="canvas-meta">Last updated: ${new Date(canvas.updatedAt).toLocaleString()}</div>
										</div>
									`;
		}).join('')}
							</div>
						</div>
					` : `
						<div class="empty-state">
							<p>No canvases yet. Create your first canvas to get started!</p>
							<button onclick="createNewCanvas()" style="margin-top: 16px;">New Canvas</button>
						</div>
					`}
				</div>
				</div>
			</div>
		</div>

		<!-- Footer - now part of container -->
		<div class="footer">
			<div class="checkbox-container">
				<input
					type="checkbox"
					id="showOnStartup"
					${dashboardData.config.canvas.showDashboardOnStartup ? 'checked' : ''}
					onchange="toggleShowOnStartup(this.checked)"
				/>
				<label for="showOnStartup">Show dashboard on startup</label>
			</div>
		</div>
	</div>

	${SettingsPanel.getSettingsHTML(dashboardData.config)}

	<script>
		const vscode = acquireVsCodeApi();

		function openCanvas(canvasId, canvasName) {
			vscode.postMessage({
				type: 'openCanvas',
				canvasId: canvasId,
				canvasName: canvasName
			});
		}

		function createNewCanvas() {
			vscode.postMessage({
				type: 'newCanvas'
			});
		}

		function deleteCanvas(canvasId) {
			vscode.postMessage({
				type: 'deleteCanvas',
				canvasId: canvasId
			});
		}

		function renameCanvas(canvasId, currentName) {
			vscode.postMessage({
				type: 'renameCanvas',
				canvasId: canvasId,
				currentName: currentName
			});
		}

		function exportCanvas(canvasId) {
			vscode.postMessage({
				type: 'exportCanvas',
				canvasId: canvasId
			});
		}

		function showAllCanvases() {
			// Scroll to All Canvases section
			document.querySelector('.canvas-grid')?.scrollIntoView({ behavior: 'smooth' });
		}

		function toggleShowOnStartup(checked) {
			vscode.postMessage({
				type: 'updateSettings',
				settings: {
					canvas: {
						showDashboardOnStartup: checked
					}
				}
			});
		}

		function importCanvas() {
			vscode.postMessage({
				type: 'importCanvas'
			});
		}

		${SettingsPanel.getSettingsJS()}

		// Listen for data updates from extension
		window.addEventListener('message', event => {
			const message = event.data;

			if (message.type === 'updateData') {
				// Request full refresh by asking extension to update HTML
				vscode.postMessage({
					type: 'refreshData'
				});
			}
		});
	</script>
</body>
</html>`;
	}
}
