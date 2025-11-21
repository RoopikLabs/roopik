/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as fs from 'fs';
import { ConfigManager } from './config';
import { PreviewManager } from './componentIsolation/core/PreviewManager';
import { ComponentSandbox } from './componentIsolation/renderer/ComponentSandbox';
import type { ComponentSource } from './componentIsolation/core/types';
import { Logger } from './logger';

/**
 * Canvas State Interface
 * Represents the state of a single canvas instance
 */
export interface CanvasState {
	id: string;
	name: string;
	components: any[]; // Will be typed properly when we build component system
	sandboxes: any[]; // Live sandbox instances on canvas
	layout: any; // Will be typed properly later
	viewport?: { x: number; y: number; scale: number }; // Canvas viewport transform
	createdAt: number;
	updatedAt: number;
}

/**
 * Manages Canvas webview panels with ID-based singleton pattern
 * Each canvas ID can have only one panel, but multiple canvas IDs can exist simultaneously
 *
 * Examples:
 * - Canvas "login" can exist alongside canvas "onboarding"
 * - Opening "login" twice will focus the existing panel (ID-based singleton)
 * - Max canvases enforced by config (default: 5)
 */
export class CanvasPanel {
	// ID-based map instead of global singleton
	private static panels: Map<string, CanvasPanel> = new Map();

	// Preview Manager (Mode 1 - import/const translator)
	private static previewManager: PreviewManager | null = null;

	// Component Sandbox (Mode 1 - iframe renderer)
	private static componentSandbox: ComponentSandbox | null = null;

	// Session preferences (backgroundColor, backgroundPattern)
	private static sessionPreferences: { backgroundColor?: string; backgroundPattern?: string } | null = null;

	// Event emitter for canvas open/close events
	private static readonly onDidChangePanelsEmitter = new vscode.EventEmitter<void>();
	public static readonly onDidChangePanels = CanvasPanel.onDidChangePanelsEmitter.event;

	/**
	 * Initialize the Mode 1 preview system
	 * Called once during extension activation
	 */
	public static initializePreviewSystem(context: vscode.ExtensionContext) {
		CanvasPanel.previewManager = new PreviewManager();
		CanvasPanel.componentSandbox = new ComponentSandbox(context);
		Logger.getInstance().info('CanvasPanel', 'Mode 1 preview system initialized');
	}

	private readonly _panel: vscode.WebviewPanel;
	private _disposables: vscode.Disposable[] = [];
	private readonly canvasId: string;
	private readonly extensionUri: vscode.Uri;
	private canvasState: CanvasState;
	private configManager: ConfigManager;
	private logger: ReturnType<typeof Logger.prototype.createScoped>;

	/**
	 * Create or show a canvas panel by ID
	 * @param extensionUri - Extension URI for loading resources
	 * @param canvasId - Unique canvas identifier (required)
	 * @param canvasName - Display name for the canvas (optional)
	 */
	public static createOrShow(
		extensionUri: vscode.Uri,
		canvasId: string,
		canvasName?: string
	) {
		try {
			const column = vscode.window.activeTextEditor
				? vscode.window.activeTextEditor.viewColumn
				: undefined;

			// Get workspace root for config
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (!workspaceFolders) {
				vscode.window.showErrorMessage('Please open a workspace folder first.');
				return;
			}
			const workspaceRoot = workspaceFolders[0].uri.fsPath;
			const configManager = ConfigManager.getInstance(workspaceRoot);
			const config = configManager.getConfig();

			// Load session preferences if not already loaded
			if (!CanvasPanel.sessionPreferences) {
				const sessionPath = configManager.getSessionPath();
				try {
					if (fs.existsSync(sessionPath)) {
						const sessionFile = fs.readFileSync(sessionPath, 'utf8');
						const session = JSON.parse(sessionFile);

						// Validate preferences structure before using
						if (session && typeof session === 'object' && session.preferences) {
							const prefs = session.preferences;
							// Only set if preferences is an object with valid structure
							if (typeof prefs === 'object' && prefs !== null) {
								CanvasPanel.sessionPreferences = prefs;
								Logger.getInstance().info('CanvasPanel', 'Loaded session preferences', CanvasPanel.sessionPreferences);
							}
						}
					}
				} catch (error) {
					// Silently ignore errors (file doesn't exist, corrupted JSON, etc.)
					Logger.getInstance().debug('CanvasPanel', 'No valid session preferences found, using defaults');
					CanvasPanel.sessionPreferences = null;
				}
			}

			// If this specific canvas already exists, show it
			const existingPanel = CanvasPanel.panels.get(canvasId);
			if (existingPanel) {
				existingPanel._panel.reveal(column);
				// Notify listeners (in case dashboard needs to update focus state)
				CanvasPanel.onDidChangePanelsEmitter.fire();
				return;
			}

			// Check max canvas limit before creating new
			if (CanvasPanel.panels.size >= config.performance.maxCanvases) {
				vscode.window.showWarningMessage(
					`Maximum ${config.performance.maxCanvases} canvases reached. Close some before opening new ones.`,
					'Close All Canvases'
				).then(selection => {
					if (selection === 'Close All Canvases') {
						CanvasPanel.closeAll();
					}
				});
				return;
			}

			// Warning at threshold
			if (CanvasPanel.panels.size >= config.performance.warnAtCanvases) {
				vscode.window.showInformationMessage(
					`You have ${CanvasPanel.panels.size + 1} canvases open. Performance may be affected.`
				);
			}

			// Create new panel with unique viewType per canvas ID
			const panel = vscode.window.createWebviewPanel(
				`roopikCanvas-${canvasId}`,
				canvasName || `Roopik Canvas - ${canvasId}`,
				column || vscode.ViewColumn.One,
				{
					enableScripts: true,
					retainContextWhenHidden: true,
					localResourceRoots: [
						vscode.Uri.joinPath(extensionUri, 'out'),
						vscode.Uri.joinPath(extensionUri, 'webview', 'build')
					]
				}
			);

			// Create new canvas panel instance
			const canvasPanel = new CanvasPanel(panel, extensionUri, canvasId, canvasName);
			CanvasPanel.panels.set(canvasId, canvasPanel);

			// Save session after creating canvas
			CanvasPanel.saveSession(workspaceRoot);

			// Notify listeners that panels changed
			CanvasPanel.onDidChangePanelsEmitter.fire();

			Logger.getInstance().info('CanvasPanel', `Canvas "${canvasId}" created. Total canvases: ${CanvasPanel.panels.size}`);
		} catch (error) {
			Logger.getInstance().error('CanvasPanel', 'Error in createOrShow', error);
			vscode.window.showErrorMessage(`Failed to create canvas: ${error}`);
		}
	}

	/**
	 * Close all canvas panels
	 */
	public static closeAll() {
		CanvasPanel.panels.forEach(panel => panel.dispose());
		CanvasPanel.panels.clear();
		// Notify listeners that all panels closed
		CanvasPanel.onDidChangePanelsEmitter.fire();
		Logger.getInstance().info('CanvasPanel', 'All canvases closed');
	}

	/**
	 * Delete a canvas permanently (close panel + remove state file)
	 * @param canvasId - Canvas ID to delete
	 * @param workspaceRoot - Workspace root path
	 */
	public static deleteCanvas(canvasId: string, workspaceRoot: string): boolean {
		try {
			// Close panel if open
			const panel = CanvasPanel.panels.get(canvasId);
			if (panel) {
				panel.dispose();
			}

			// Delete state file
			const configManager = ConfigManager.getInstance(workspaceRoot);
			const statePath = configManager.getCanvasStatePath(canvasId);

			if (fs.existsSync(statePath)) {
				fs.unlinkSync(statePath);
				Logger.getInstance().info('CanvasPanel', `Canvas "${canvasId}" deleted from disk`);
			}

			// Save session to update list
			CanvasPanel.saveSession(workspaceRoot);

			// Notify listeners
			CanvasPanel.onDidChangePanelsEmitter.fire();

			return true;
		} catch (error) {
			Logger.getInstance().error('CanvasPanel', `Failed to delete canvas "${canvasId}"`, error);
			return false;
		}
	}

	/**
	 * Rename a canvas
	 * @param canvasId - Canvas ID to rename
	 * @param newName - New display name
	 * @param workspaceRoot - Workspace root path
	 */
	public static renameCanvas(canvasId: string, newName: string, workspaceRoot: string): boolean {
		try {
			const configManager = ConfigManager.getInstance(workspaceRoot);
			const statePath = configManager.getCanvasStatePath(canvasId);

			if (!fs.existsSync(statePath)) {
				Logger.getInstance().error('CanvasPanel', `Canvas "${canvasId}" not found`);
				return false;
			}

			// Load current state
			const stateFile = fs.readFileSync(statePath, 'utf8');
			const state = JSON.parse(stateFile) as CanvasState;

			// Update name
			state.name = newName;
			state.updatedAt = Date.now();

			// Save back
			fs.writeFileSync(statePath, JSON.stringify(state, null, '\t'), 'utf8');

			// Update panel title if open
			const panel = CanvasPanel.panels.get(canvasId);
			if (panel) {
				panel._panel.title = `Roopik Canvas - ${newName}`;
				panel.canvasState.name = newName;
			}

			Logger.getInstance().info('CanvasPanel', `Canvas "${canvasId}" renamed to "${newName}"`);

			// Notify listeners
			CanvasPanel.onDidChangePanelsEmitter.fire();

			return true;
		} catch (error) {
			Logger.getInstance().error('CanvasPanel', `Failed to rename canvas "${canvasId}"`, error);
			return false;
		}
	}

	/**
	 * Get all open canvas IDs
	 */
	public static getOpenCanvasIds(): string[] {
		return Array.from(CanvasPanel.panels.keys());
	}

	/**
	 * Get count of open canvases
	 */
	public static getOpenCount(): number {
		return CanvasPanel.panels.size;
	}

	/**
	 * Save current session (list of open canvas IDs) to disk
	 */
	public static saveSession(workspaceRoot: string, preferences?: { backgroundColor?: string; backgroundPattern?: string }) {
		const configManager = ConfigManager.getInstance(workspaceRoot);
		const sessionPath = configManager.getSessionPath();

		// Load existing session to preserve preferences if not provided
		let existingPreferences = {};
		try {
			if (fs.existsSync(sessionPath)) {
				const sessionFile = fs.readFileSync(sessionPath, 'utf8');
				const existingSession = JSON.parse(sessionFile);
				if (existingSession.preferences) {
					existingPreferences = existingSession.preferences;
				}
			}
		} catch (error) {
			// Ignore read errors, will create new session
		}

		const session = {
			canvasIds: Array.from(CanvasPanel.panels.keys()),
			preferences: preferences || existingPreferences,
			timestamp: Date.now()
		};

		try {
			fs.writeFileSync(sessionPath, JSON.stringify(session, null, '\t'), 'utf8');
			Logger.getInstance().debug('CanvasPanel', `Session saved: ${session.canvasIds.length} canvases`);
		} catch (error) {
			Logger.getInstance().error('CanvasPanel', 'Failed to save session', error);
		}
	}

	/**
	 * Restore last session (reopen canvases from previous session)
	 * Returns the session preferences (backgroundColor, backgroundPattern)
	 */
	public static restoreSession(extensionUri: vscode.Uri, workspaceRoot: string): { backgroundColor?: string; backgroundPattern?: string } | null {
		const configManager = ConfigManager.getInstance(workspaceRoot);
		const config = configManager.getConfig();

		if (!config.canvas.restoreLastSession) {
			Logger.getInstance().info('CanvasPanel', 'Session restore disabled in config');
			return null;
		}

		const sessionPath = configManager.getSessionPath();

		try {
			if (fs.existsSync(sessionPath)) {
				const sessionFile = fs.readFileSync(sessionPath, 'utf8');
				const session = JSON.parse(sessionFile);

				if (session.canvasIds && Array.isArray(session.canvasIds) && session.canvasIds.length > 0) {
					Logger.getInstance().info('CanvasPanel', `Restoring session: ${session.canvasIds.length} canvases`);

					// Reopen each canvas
					session.canvasIds.forEach((canvasId: string) => {
						try {
							// Load canvas state to get the name
							const statePath = configManager.getCanvasStatePath(canvasId);
							if (fs.existsSync(statePath)) {
								const stateFile = fs.readFileSync(statePath, 'utf8');
								const state = JSON.parse(stateFile);
								CanvasPanel.createOrShow(extensionUri, canvasId, state.name);
							}
						} catch (canvasError) {
							Logger.getInstance().error('CanvasPanel', `Failed to restore canvas "${canvasId}"`, canvasError);
							// Continue with other canvases
						}
					});
				}

				// Store preferences in static property for all canvases (with validation)
				if (session.preferences && typeof session.preferences === 'object' && session.preferences !== null) {
					CanvasPanel.sessionPreferences = session.preferences;
					Logger.getInstance().info('CanvasPanel', 'Session preferences restored', session.preferences);
					return session.preferences;
				} else {
					CanvasPanel.sessionPreferences = null;
				}
			}
		} catch (error) {
			Logger.getInstance().debug('CanvasPanel', 'No valid session found, starting fresh');
			CanvasPanel.sessionPreferences = null;
		}

		return null;
	}	/**
	 * Get list of all canvas states (for dashboard)
	 */
	public static getAllCanvasStates(workspaceRoot: string): CanvasState[] {
		const states: CanvasState[] = [];
		const roopikDir = require('path').join(workspaceRoot, '.roopik');

		try {
			if (fs.existsSync(roopikDir)) {
				const files = fs.readdirSync(roopikDir);
				files.forEach(file => {
					if (file.startsWith('canvas-') && file.endsWith('.json')) {
						const filePath = require('path').join(roopikDir, file);
						const stateFile = fs.readFileSync(filePath, 'utf8');
						const state = JSON.parse(stateFile) as CanvasState;
						states.push(state);
					}
				});
			}
		} catch (error) {
			Logger.getInstance().error('CanvasPanel', 'Failed to get canvas states', error);
		}

		// Sort by most recently updated
		return states.sort((a, b) => b.updatedAt - a.updatedAt);
	}

	/**
	 * Export a canvas to a JSON file
	 * @param canvasId - Canvas ID to export
	 * @param workspaceRoot - Workspace root path
	 * @returns Export file path or null on failure
	 */
	public static async exportCanvas(canvasId: string, workspaceRoot: string): Promise<string | null> {
		try {
			const configManager = ConfigManager.getInstance(workspaceRoot);
			const statePath = configManager.getCanvasStatePath(canvasId);

			if (!fs.existsSync(statePath)) {
				Logger.getInstance().error('CanvasPanel', `Canvas "${canvasId}" not found`);
				return null;
			}

			// Load canvas state
			const stateFile = fs.readFileSync(statePath, 'utf8');
			const state = JSON.parse(stateFile) as CanvasState;

			// Create export object with metadata
			const exportData = {
				version: '1.0',
				exportedAt: Date.now(),
				canvas: state
			};

			// Prompt user for save location
			const uri = await vscode.window.showSaveDialog({
				defaultUri: vscode.Uri.file(`${state.name}.roopik.json`),
				filters: {
					'Roopik Canvas': ['roopik.json'],
					'JSON': ['json']
				}
			});

			if (!uri) {
				return null; // User cancelled
			}

			// Write export file
			fs.writeFileSync(uri.fsPath, JSON.stringify(exportData, null, '\t'), 'utf8');
			Logger.getInstance().info('CanvasPanel', `Canvas "${canvasId}" exported to ${uri.fsPath}`);

			return uri.fsPath;
		} catch (error) {
			Logger.getInstance().error('CanvasPanel', `Failed to export canvas "${canvasId}"`, error);
			return null;
		}
	}

	/**
	 * Import a canvas from a JSON file
	 * @param workspaceRoot - Workspace root path
	 * @param extensionUri - Extension URI for creating panels
	 * @returns Imported canvas ID or null on failure
	 */
	public static async importCanvas(workspaceRoot: string, extensionUri: vscode.Uri): Promise<string | null> {
		try {
			// Prompt user for file
			const uris = await vscode.window.showOpenDialog({
				canSelectMany: false,
				filters: {
					'Roopik Canvas': ['roopik.json'],
					'JSON': ['json']
				}
			});

			if (!uris || uris.length === 0) {
				return null; // User cancelled
			}

			// Read import file
			const importFile = fs.readFileSync(uris[0].fsPath, 'utf8');
			const importData = JSON.parse(importFile);

			// Validate import format
			if (!importData.canvas || !importData.canvas.id) {
				vscode.window.showErrorMessage('Invalid canvas export file format');
				return null;
			}

			const canvasState = importData.canvas as CanvasState;

			// Check if canvas ID already exists
			const configManager = ConfigManager.getInstance(workspaceRoot);
			let finalCanvasId = canvasState.id;
			let finalCanvasName = canvasState.name;

			const existingStatePath = configManager.getCanvasStatePath(finalCanvasId);
			if (fs.existsSync(existingStatePath)) {
				// Canvas ID exists, prompt for new name
				const newName = await vscode.window.showInputBox({
					prompt: `Canvas "${finalCanvasId}" already exists. Enter a new name:`,
					value: `${canvasState.name} (imported)`,
					validateInput: (value) => {
						if (!value || value.trim().length === 0) {
							return 'Canvas name cannot be empty';
						}
						return null;
					}
				});

				if (!newName) {
					return null; // User cancelled
				}

				finalCanvasName = newName;
				finalCanvasId = newName.toLowerCase()
					.trim()
					.replace(/\s+/g, '-')
					.replace(/[^a-z0-9-]/g, '');
			}

			// Create new canvas state with updated ID and name
			const newState: CanvasState = {
				...canvasState,
				id: finalCanvasId,
				name: finalCanvasName,
				createdAt: Date.now(),
				updatedAt: Date.now()
			};

			// Save canvas state
			const newStatePath = configManager.getCanvasStatePath(finalCanvasId);
			const stateDir = require('path').dirname(newStatePath);
			if (!fs.existsSync(stateDir)) {
				fs.mkdirSync(stateDir, { recursive: true });
			}
			fs.writeFileSync(newStatePath, JSON.stringify(newState, null, '\t'), 'utf8');

			Logger.getInstance().info('CanvasPanel', `Canvas imported as "${finalCanvasId}"`);

			// Open the imported canvas
			CanvasPanel.createOrShow(extensionUri, finalCanvasId, finalCanvasName);

			// Notify listeners
			CanvasPanel.onDidChangePanelsEmitter.fire();

			return finalCanvasId;
		} catch (error) {
			Logger.getInstance().error('CanvasPanel', 'Failed to import canvas', error);
			vscode.window.showErrorMessage(`Failed to import canvas: ${error}`);
			return null;
		}
	}

	private constructor(
		panel: vscode.WebviewPanel,
		extensionUri: vscode.Uri,
		canvasId: string,
		canvasName?: string
	) {
		this._panel = panel;
		this.extensionUri = extensionUri;
		this.canvasId = canvasId;

		// Initialize config manager
		const workspaceFolders = vscode.workspace.workspaceFolders;
		const workspaceRoot = workspaceFolders![0].uri.fsPath;
		this.configManager = ConfigManager.getInstance(workspaceRoot);
		this.logger = Logger.getInstance().createScoped(`Canvas-${canvasId}`);

		// Load or create canvas state
		this.canvasState = this.loadOrCreateState(canvasName);

		// Set the webview's initial html content
		this._update();

		// Listen for when the panel is disposed
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

		// Handle messages from the webview
		this._panel.webview.onDidReceiveMessage(
			async message => {
				switch (message.type) {
					case 'alert':
						vscode.window.showInformationMessage(message.text);
						break;
					case 'log':
						this.logger.info(message.text);
						break;
					case 'saveState':
						this.saveState(message.state);
						break;
					case 'savePreferences':
						this.handleSavePreferences(message.preferences);
						break;
					case 'error':
						this.handleError(message.message || message.error);
						break;
					case 'loadComponent':
						await this.handleLoadComponent(message.component);
						break;
					case 'updateComponent':
						await this.handleUpdateComponent(message.componentId, message.code);
						break;
					case 'getSandboxTemplate':
						await this.handleGetSandboxTemplate();
						break;
					case 'saveSandboxes':
						await this.handleSaveSandboxes(message.sandboxes);
						break;
				}
			},
			null,
			this._disposables
		);
	}

	/**
	 * Load canvas state from disk or create new
	 */
	private loadOrCreateState(canvasName?: string): CanvasState {
		const statePath = this.configManager.getCanvasStatePath(this.canvasId);

		try {
			if (fs.existsSync(statePath)) {
				const stateFile = fs.readFileSync(statePath, 'utf8');
				const state = JSON.parse(stateFile) as CanvasState;
				this.logger.info('State loaded from disk');
				return state;
			}
		} catch (error) {
			this.logger.error('Failed to load state', error);
		}

		// Create new state if doesn't exist
		const newState: CanvasState = {
			id: this.canvasId,
			name: canvasName || this.canvasId,
			components: [],
			sandboxes: [],
			layout: {},
			createdAt: Date.now(),
			updatedAt: Date.now()
		};

		this.saveState(newState);
		this.logger.info('New state created');
		return newState;
	}

	/**
	 * Save canvas state to disk
	 */
	private saveState(state: Partial<CanvasState>) {
		this.canvasState = {
			...this.canvasState,
			...state,
			updatedAt: Date.now()
		};

		const statePath = this.configManager.getCanvasStatePath(this.canvasId);

		try {
			// Ensure directory exists
			const stateDir = require('path').dirname(statePath);
			if (!fs.existsSync(stateDir)) {
				fs.mkdirSync(stateDir, { recursive: true });
			}

			fs.writeFileSync(statePath, JSON.stringify(this.canvasState, null, '\t'), 'utf8');
			this.logger.debug('State saved to disk');
		} catch (error) {
			this.logger.error('Failed to save state', error);
		}
	}

	/**
	 * Handle saving preferences (backgroundColor, backgroundPattern)
	 */
	private handleSavePreferences(preferences: { backgroundColor?: string; backgroundPattern?: string }) {
		this.logger.debug('Saving preferences', preferences);

		// Save to session.json
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (workspaceFolders) {
			CanvasPanel.saveSession(workspaceFolders[0].uri.fsPath, preferences);
		}
	}

	/**
	 * Handle errors from webview
	 */
	private handleError(error: any) {
		this.logger.error('Webview error', error);

		// Extract error message
		const errorMessage = typeof error === 'string'
			? error
			: error?.message || JSON.stringify(error);

		// Show error message but don't crash
		vscode.window.showErrorMessage(
			`Error in canvas "${this.canvasState.name}": ${errorMessage}`
		);

		// Save state before potential crash
		this.saveState(this.canvasState);
	}

	/**
	 * Handle component load (Mode 1 - AI generated component)
	 * Receives import-based code with manifest, transforms it, sends session code to webview
	 */
	private async handleLoadComponent(component: ComponentSource) {
		if (!CanvasPanel.previewManager || !CanvasPanel.componentSandbox) {
			this.logger.error('Preview system not initialized');
			return;
		}

		try {
			this.logger.info(`Loading component ${component.id}`);

			// Parse dependency manifest from code
			const dependencies = CanvasPanel.previewManager.parseDependencyManifest(component.code);
			const componentSource: ComponentSource = {
				...component,
				dependencies
			};

			// Transform to session code (import → const)
			const sessionCode = CanvasPanel.previewManager.transformToSessionCode(componentSource);

			// Create init message for sandbox
			const sandboxMessage = CanvasPanel.componentSandbox.createInitMessage(sessionCode);

			this.logger.debug('Component transformed, sending to webview');

			// Send session code to webview
			this._panel.webview.postMessage({
				type: 'componentReady',
				componentId: component.id,
				sandboxMessage: sandboxMessage
			});
		} catch (error) {
			this.logger.error('Failed to load component', error);
			this.handleError(error);
		}
	}

	/**
	 * Handle component update (Mode 1 - hot reload)
	 * For live editing without reloading CDN scripts
	 */
	private async handleUpdateComponent(componentId: string, code: string) {
		if (!CanvasPanel.componentSandbox) {
			this.logger.error('Preview system not initialized');
			return;
		}

		try {
			this.logger.info(`Updating component ${componentId}`);

			// Create update message (no CDN reload)
			const sandboxMessage = CanvasPanel.componentSandbox.createUpdateMessage(code);

			// Send update to webview
			this._panel.webview.postMessage({
				type: 'componentUpdate',
				componentId: componentId,
				sandboxMessage: sandboxMessage
			});

			this.logger.debug('Component update sent for hot-reload');
		} catch (error) {
			this.logger.error('Failed to update component', error);
			this.handleError(error);
		}
	}

	/**
	 * Handle request for sandbox template
	 * Sends the sandbox_template.html content to webview
	 */
	private async handleGetSandboxTemplate() {
		if (!CanvasPanel.componentSandbox) {
			this.logger.error('Preview system not initialized');
			return;
		}

		try {
			this.logger.debug('Fetching sandbox template');

			// Get sandbox template HTML
			const templateHtml = await CanvasPanel.componentSandbox.getSandboxTemplate();

			// Send to webview
			this._panel.webview.postMessage({
				type: 'sandboxTemplate',
				html: templateHtml
			});

			this.logger.debug('Sandbox template sent to webview');
		} catch (error) {
			this.logger.error('Failed to get sandbox template', error);
			this.handleError(error);
		}
	}

	/**
	 * Handle sandbox state updates from webview
	 * Saves sandbox positions, sizes, etc. to canvas state
	 */
	private async handleSaveSandboxes(data: { sandboxes: any[]; viewport?: any }) {
		try {
			const sandboxes = data.sandboxes || data; // Support both new and old format
			this.logger.debug(`Saving ${Array.isArray(sandboxes) ? sandboxes.length : 0} sandboxes`);

			// Update canvas state with new sandboxes
			if (Array.isArray(sandboxes)) {
				this.canvasState.sandboxes = sandboxes;
			}

			// Save viewport if provided
			if (data.viewport) {
				this.canvasState.viewport = data.viewport;
			}

			this.canvasState.updatedAt = Date.now();

			// Persist to disk
			this.saveState(this.canvasState);

			this.logger.debug('State saved successfully');
		} catch (error) {
			this.logger.error('Failed to save state', error);
			this.handleError(error);
		}
	}

	public dispose() {
		this.logger.debug('Disposing...');

		// Remove from map
		CanvasPanel.panels.delete(this.canvasId);

		// Save final state
		this.saveState(this.canvasState);

		// Save session (update list of open canvases)
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (workspaceFolders) {
			CanvasPanel.saveSession(workspaceFolders[0].uri.fsPath);
		}

		// Notify listeners that panels changed (before disposing)
		CanvasPanel.onDidChangePanelsEmitter.fire();

		// Clean up panel
		this._panel.dispose();

		while (this._disposables.length) {
			const disposable = this._disposables.pop();
			if (disposable) {
				disposable.dispose();
			}
		}

		this.logger.debug(`Disposed. Remaining canvases: ${CanvasPanel.panels.size}`);
	}

	private _update() {
		const webview = this._panel.webview;
		this._panel.webview.html = this._getHtmlForWebview(webview);
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, 'webview', 'build', 'assets', 'componentView.js')
		);
		const styleUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, 'webview', 'build', 'assets', 'componentView.css')
		);

		// CSP updated to allow unpkg.com and unsafe-eval for Babel Standalone
		const csp = `
			default-src 'none';
			style-src ${webview.cspSource} 'unsafe-inline';
			script-src ${webview.cspSource} 'unsafe-inline' 'unsafe-eval' https://unpkg.com;
			font-src ${webview.cspSource};
			img-src ${webview.cspSource} data:;
			connect-src ${webview.cspSource} https://unpkg.com;
			frame-src ${webview.cspSource} data: blob:;
		`;

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="${csp.replace(/\s+/g, ' ').trim()}">
	<style>
		/* VS Code CSS variables are automatically available in webviews */
		body {
			color: var(--vscode-foreground);
			background-color: var(--vscode-editor-background);
		}
	</style>
	<link href="${styleUri}" rel="stylesheet">
	<link href="${webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'webview', 'build', 'assets', 'BottomActionBar.css'))}" rel="stylesheet">
	<title>Roopik Canvas - ${this.canvasState.name}</title>
</head>
<body>
	<div id="root"></div>
	<script type="module" src="${scriptUri}"></script>
	<script>
		// Pass canvas state and preferences to React app
		window.CANVAS_STATE = ${JSON.stringify(this.canvasState)};
		window.SESSION_PREFERENCES = ${JSON.stringify(CanvasPanel.sessionPreferences || {})};
	</script>
</body>
</html>`;
	}
}
