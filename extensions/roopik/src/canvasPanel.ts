/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigManager } from './config';
import { Logger } from './logger';
import { ComponentLoader, ComponentLoadInfo } from './componentLoader';
import type { RoopikExtensionManager } from './roopikExtensionManager';
import type {
	ComponentCreatedEvent,
	ComponentBuildEvent,
	ComponentDeletedEvent,
	ComponentUpdatedEvent
} from './types/componentEvents';

// ============================================================================
// Canvas Preferences (matches Core's storageTypes.ts)
// ============================================================================

interface CanvasPreferences {
	backgroundColor: string;
	backgroundPattern: 'grid' | 'dots' | 'plain';
	viewport: { x: number; y: number; scale: number };
}

const DEFAULT_CANVAS_PREFERENCES: CanvasPreferences = {
	backgroundColor: '#1e1e1e',
	backgroundPattern: 'dots',
	viewport: { x: 0, y: 0, scale: 1 }
};

/**
 * Sandbox position on the infinite canvas (matches Core's storageTypes.ts)
 */
interface SandboxPosition {
	x: number;
	y: number;
	zIndex: number;
}

/**
 * Sandbox data from webview (includes id + position)
 * The webview sends full sandbox objects, we only need id and position fields
 */
interface SandboxData {
	id: string;
	x: number;
	y: number;
	zIndex: number;
	// Other fields exist but we only need position
}

/**
 * Component entry with position and hash (subset of Core's ComponentIndexEntry)
 */
interface ComponentIndexEntry {
	contentHash: string;
	sandboxPosition?: SandboxPosition;
	// Other fields exist but we only care about these here
	[key: string]: unknown;
}

interface ComponentIndex {
	components: Record<string, ComponentIndexEntry>;
	preferences: CanvasPreferences;
}

/**
 * Loaded sandbox positions (sent to webview for sandbox placement)
 */
interface LoadedSandboxPositions {
	[componentId: string]: SandboxPosition;
}

/**
 * CanvasPanel - Dumb UI Component
 *
 * This is now a "dumb" UI class that:
 * - Renders the webview
 * - Receives events from RoopikExtensionManager (routed by canvasId)
 * - Sends actions to RoopikExtensionManager (which calls Core services)
 * - Does NOT subscribe to events itself (manager does that once)
 * - Does NOT manage its own state (uses Core's state)
 *
 * Architecture:
 * - Manager routes events TO this panel via onComponentXxx methods
 * - This panel calls manager.createComponent(), manager.rebuildComponent(), etc.
 * - Webview <-> Panel communication via postMessage
 */
export class CanvasPanel implements vscode.Disposable {
	// Reference to parent manager
	private readonly manager: RoopikExtensionManager;

	// Webview panel
	private readonly panel: vscode.WebviewPanel;

	// Canvas identity
	private readonly canvasId: string;
	private readonly canvasName: string;

	// Extension URI for resources
	private readonly extensionUri: vscode.Uri;

	// Workspace path
	private readonly workspacePath: string;

	// Logger
	private readonly logger: ReturnType<typeof Logger.prototype.createScoped>;

	// Disposables
	private readonly disposables: vscode.Disposable[] = [];

	// ============================================================================
	// Canvas Preferences (file-based, direct read/write to index.json)
	// ============================================================================
	// In-memory cache of preferences
	private currentPreferences: CanvasPreferences = { ...DEFAULT_CANVAS_PREFERENCES };
	// Track last saved values to detect changes
	private lastSavedBackgroundColor: string = DEFAULT_CANVAS_PREFERENCES.backgroundColor;
	private lastSavedBackgroundPattern: 'grid' | 'dots' | 'plain' = DEFAULT_CANVAS_PREFERENCES.backgroundPattern;
	// Timer for debounced viewport saves (viewport changes frequently during pan/zoom)
	private viewportSaveTimer: ReturnType<typeof setTimeout> | undefined;
	// Loaded sandbox positions (extracted from index.json on load)
	private loadedSandboxPositions: LoadedSandboxPositions = {};

	// ============================================================================
	// Component Loading (for reopening canvas with existing components)
	// ============================================================================
	// Component loader handles cache validation and loading
	private componentLoader: ComponentLoader | null = null;
	// Existing components to load when webview is ready (extracted from index.json)
	private loadedComponents: ComponentLoadInfo[] = [];

	// ============================================================================
	// Static Factory (called by manager)
	// ============================================================================

	/**
	 * Create a new CanvasPanel
	 * This is called by RoopikExtensionManager, not directly
	 */
	public static create(
		extensionUri: vscode.Uri,
		canvasId: string,
		canvasName: string,
		manager: RoopikExtensionManager
	): CanvasPanel {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders) {
			throw new Error('No workspace folder found');
		}

		const workspaceRoot = workspaceFolders[0].uri.fsPath;
		const configManager = ConfigManager.getInstance(workspaceRoot);
		const config = configManager.getConfig();

		// Check max canvas limit
		if (manager.getOpenCount() >= config.performance.maxCanvases) {
			throw new Error(`Maximum ${config.performance.maxCanvases} canvases reached`);
		}

		// Create webview panel
		const column = vscode.window.activeTextEditor?.viewColumn || vscode.ViewColumn.One;
		const panel = vscode.window.createWebviewPanel(
			`roopikCanvas-${canvasId}`,
			canvasName,
			column,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [
					vscode.Uri.joinPath(extensionUri, 'out'),
					vscode.Uri.joinPath(extensionUri, 'webview', 'build')
				]
			}
		);

		return new CanvasPanel(panel, extensionUri, canvasId, canvasName, workspaceRoot, manager);
	}

	// ============================================================================
	// Constructor (private - use static create())
	// ============================================================================

	private constructor(
		panel: vscode.WebviewPanel,
		extensionUri: vscode.Uri,
		canvasId: string,
		canvasName: string,
		workspacePath: string,
		manager: RoopikExtensionManager
	) {
		this.panel = panel;
		this.extensionUri = extensionUri;
		this.canvasId = canvasId;
		this.canvasName = canvasName;
		this.workspacePath = workspacePath;
		this.manager = manager;

		this.logger = Logger.getInstance().createScoped(`Canvas-${canvasId}`);

		// Initialize component loader
		this.componentLoader = new ComponentLoader(workspacePath, manager);

		// Set initial HTML
		this.updateWebview();

		// Handle panel disposal
		this.panel.onDidDispose(() => this.handleDispose(), null, this.disposables);

		// Handle messages from webview
		this.panel.webview.onDidReceiveMessage(
			message => this.handleWebviewMessage(message),
			null,
			this.disposables
		);

		// Handle panel visibility changes (focus)
		this.panel.onDidChangeViewState(
			e => {
				if (e.webviewPanel.active) {
					this.manager.onPanelFocused(this.canvasId);
				}
			},
			null,
			this.disposables
		);

		// Load canvas state (preferences, positions, components) from file on init
		this.loadCanvasStateFromFile();

		this.logger.info(`Panel created for canvas: ${canvasName}`);
	}

	// ============================================================================
	// Public Methods (called by manager)
	// ============================================================================

	/**
	 * Reveal/focus this panel
	 */
	public reveal(): void {
		this.panel.reveal();
	}

	/**
	 * Update the panel title
	 */
	public updateTitle(newTitle: string): void {
		this.panel.title = newTitle;
	}

	/**
	 * Get canvas ID
	 */
	public getCanvasId(): string {
		return this.canvasId;
	}

	// ============================================================================
	// Event Handlers (called by manager when events are routed)
	// ============================================================================

	/**
	 * Handle component created event (routed from manager)
	 */
	public onComponentCreated(event: ComponentCreatedEvent): void {
		this.logger.debug(`Component created: ${event.componentId}`);
		this.postToWebview('componentCreated', event);
	}

	/**
	 * Handle component built event (routed from manager)
	 */
	public onComponentBuilt(event: ComponentBuildEvent): void {
		this.logger.debug(`Component built: ${event.componentId}, success: ${event.success}`);

		if (event.success && event.result?.bundlePath) {
			// Read bundled code directly from file (no IPC needed)
			try {
				const bundledCode = fs.readFileSync(event.result.bundlePath, 'utf-8');
				this.logger.debug(`Bundle loaded from: ${event.result.bundlePath} (${bundledCode.length} bytes)`);

				this.postToWebview('componentBuilt', {
					componentId: event.componentId,
					result: {
						bundledCode,
						cdnUrls: event.result.cdnUrls || [],
						framework: 'react', // TODO: Get from event
						resolvedDependencies: {},
						buildTime: event.result.buildTime || 0,
						bundleSize: event.result.bundleSize || 0
					}
				});
			} catch (err) {
				this.logger.error(`Failed to read bundle from ${event.result.bundlePath}: ${err}`);
				this.postToWebview('componentError', {
					componentId: event.componentId,
					error: `Failed to read bundle: ${err instanceof Error ? err.message : String(err)}`
				});
			}
		} else if (event.success) {
			// Success but no bundlePath - shouldn't happen
			this.logger.error(`Component built but no bundlePath provided: ${event.componentId}`);
			this.postToWebview('componentError', {
				componentId: event.componentId,
				error: 'Build succeeded but bundle path not provided'
			});
		} else {
			// Build failed
			this.postToWebview('componentError', {
				componentId: event.componentId,
				error: event.errorInfo?.message || 'Build failed'
			});
		}
	}

	/**
	 * Handle component deleted event (routed from manager)
	 */
	public onComponentDeleted(event: ComponentDeletedEvent): void {
		this.logger.debug(`Component deleted: ${event.componentId}`);
		this.postToWebview('componentDeleted', event);
	}

	/**
	 * Handle component updated event (routed from manager)
	 */
	public onComponentUpdated(event: ComponentUpdatedEvent): void {
		this.logger.debug(`Component updated: ${event.componentId}`);
		this.postToWebview('componentUpdated', event);
	}

	// ============================================================================
	// Webview Communication
	// ============================================================================

	/**
	 * Post a message to the webview
	 */
	private postToWebview(type: string, payload: unknown): void {
		this.panel.webview.postMessage({ type, payload });
	}

	/**
	 * Handle messages from webview
	 */
	private async handleWebviewMessage(message: { type: string; payload?: unknown }): Promise<void> {
		this.logger.debug(`Webview message: ${message.type}`);

		try {
			switch (message.type) {
				case 'ready':
					// Webview is ready, send preferences and load existing components
					this.logger.debug('Webview ready, sending preferences');
					this.sendPreferencesToWebview();
					// Load existing components (if any)
					await this.loadExistingComponents();
					break;

				case 'createComponent':
					await this.handleCreateComponent(message.payload as {
						name: string;
						sourceData: unknown;
						position?: { x: number; y: number };
					});
					break;

				case 'rebuildComponent':
					await this.handleRebuildComponent(message.payload as { componentId: string });
					break;

				case 'deleteComponent':
					await this.handleDeleteComponent(message.payload as { componentId: string });
					break;

				case 'updateComponentSource':
					await this.handleUpdateComponentSource(message.payload as {
						componentId: string;
						files: Record<string, string>;
					});
					break;

				case 'getComponentSource':
					await this.handleGetComponentSource(message.payload as { componentId: string });
					break;

				case 'saveCanvas':
					// Handle canvas state save from webview
					await this.handleSaveCanvas(message.payload as {
						canvasId: string;
						state: {
							backgroundColor?: string;
							backgroundPattern?: 'grid' | 'dots' | 'plain';
							viewport?: { x: number; y: number; scale: number };
						};
					});
					break;

				case 'error':
					this.handleWebviewError(message.payload);
					break;

				default:
					this.logger.warn(`Unknown webview message type: ${message.type}`);
			}
		} catch (error) {
			this.logger.error(`Error handling webview message: ${error}`);
			this.postToWebview('error', {
				message: error instanceof Error ? error.message : String(error)
			});
		}
	}

	/**
	 * Handle create component request from webview
	 */
	private async handleCreateComponent(payload: {
		name: string;
		sourceData: unknown;
		position?: { x: number; y: number };
	}): Promise<void> {
		this.logger.info(`Creating component: ${payload.name}`);

		const component = await this.manager.createComponent({
			canvasId: this.canvasId,
			name: payload.name,
			sourceData: payload.sourceData as any,
			position: payload.position
		});

		// Component created - onComponentCreated event will be routed back
		this.logger.info(`Component creation initiated: ${component.id}`);
	}

	/**
	 * Handle rebuild component request from webview
	 */
	private async handleRebuildComponent(payload: { componentId: string }): Promise<void> {
		this.logger.info(`Rebuilding component: ${payload.componentId}`);

		// Notify webview that build is starting
		this.postToWebview('componentBuilding', { componentId: payload.componentId });

		await this.manager.rebuildComponent(payload.componentId);
		// onComponentBuilt event will be routed back with result
	}

	/**
	 * Handle delete component request from webview
	 */
	private async handleDeleteComponent(payload: { componentId: string }): Promise<void> {
		this.logger.info(`Deleting component: ${payload.componentId}`);
		await this.manager.deleteComponent(payload.componentId);
		// onComponentDeleted event will be routed back
	}

	/**
	 * Handle update component source request from webview
	 */
	private async handleUpdateComponentSource(payload: {
		componentId: string;
		files: Record<string, string>;
	}): Promise<void> {
		this.logger.info(`Updating component source: ${payload.componentId}`);
		await this.manager.updateComponentSource(payload.componentId, payload.files);
		// This triggers rebuild, onComponentBuilt event will be routed back
	}

	/**
	 * Handle get component source request from webview
	 */
	private async handleGetComponentSource(payload: { componentId: string }): Promise<void> {
		this.logger.info(`Getting component source: ${payload.componentId}`);
		const source = await this.manager.getComponentSource(payload.componentId);
		this.postToWebview('componentSource', {
			componentId: payload.componentId,
			files: source
		});
	}

	/**
	 * Handle error from webview
	 */
	private handleWebviewError(payload: unknown): void {
		const errorMessage = typeof payload === 'string'
			? payload
			: (payload as { message?: string })?.message || JSON.stringify(payload);

		this.logger.error(`Webview error: ${errorMessage}`);
		vscode.window.showErrorMessage(`Canvas error: ${errorMessage}`);
	}

	// ============================================================================
	// Canvas State Loading (file-based, reads from index.json)
	// ============================================================================

	/**
	 * Get the path to the canvas index.json file
	 */
	private getIndexJsonPath(): string {
		return path.join(this.workspacePath, '.roopik', 'canvases', this.canvasId, 'components', 'index.json');
	}

	/**
	 * Load canvas state from index.json on panel init
	 * Extracts:
	 * - Canvas preferences (background color, pattern, viewport)
	 * - Sandbox positions (for restoring component placement)
	 * - Component info (IDs + content hashes for cache validation)
	 *
	 * Does NOT send to webview - call sendPreferencesToWebview() after webview is ready
	 */
	private loadCanvasStateFromFile(): void {
		const indexPath = this.getIndexJsonPath();
		this.logger.debug(`Loading canvas state from: ${indexPath}`);

		try {
			if (fs.existsSync(indexPath)) {
				const content = fs.readFileSync(indexPath, 'utf-8');
				const index: ComponentIndex = JSON.parse(content);

				if (index.preferences) {
					this.currentPreferences = {
						backgroundColor: index.preferences.backgroundColor || DEFAULT_CANVAS_PREFERENCES.backgroundColor,
						backgroundPattern: index.preferences.backgroundPattern || DEFAULT_CANVAS_PREFERENCES.backgroundPattern,
						viewport: index.preferences.viewport || { ...DEFAULT_CANVAS_PREFERENCES.viewport }
					};
					this.lastSavedBackgroundColor = this.currentPreferences.backgroundColor;
					this.lastSavedBackgroundPattern = this.currentPreferences.backgroundPattern;
					this.logger.debug('Preferences loaded from file:', this.currentPreferences);
				} else {
					// File exists but no preferences - add defaults
					this.logger.debug('No preferences in file, using defaults');
					this.savePreferencesToFile();
				}

				// Extract sandbox positions and component info from components map
				this.loadedSandboxPositions = {};
				this.loadedComponents = [];
				if (index.components) {
					for (const [componentId, entry] of Object.entries(index.components)) {
						// Extract position
						if (entry.sandboxPosition) {
							this.loadedSandboxPositions[componentId] = entry.sandboxPosition;
						}
						// Extract component info for loading (need contentHash for cache validation)
						if (entry.contentHash) {
							this.loadedComponents.push({
								componentId,
								contentHash: entry.contentHash
							});
						}
					}
					const posCount = Object.keys(this.loadedSandboxPositions).length;
					if (posCount > 0) {
						this.logger.debug(`Loaded positions for ${posCount} sandboxes`);
					}
					if (this.loadedComponents.length > 0) {
						this.logger.debug(`Found ${this.loadedComponents.length} existing components to load`);
					}
				}
			} else {
				// File doesn't exist - will be created by Core on canvas creation
				// Use defaults for now
				this.logger.debug('Index file not found, using defaults');
			}
		} catch (error) {
			this.logger.error(`Failed to load canvas state: ${error}`);
			// Use defaults on error
		}
	}

	/**
	 * Send current preferences and sandbox positions to webview
	 * Called when webview sends 'ready' message
	 */
	private sendPreferencesToWebview(): void {
		this.logger.debug('Sending preferences to webview:', this.currentPreferences);
		this.logger.debug('Sending sandbox positions:', Object.keys(this.loadedSandboxPositions).length);
		this.postToWebview('canvasPreferencesLoaded', {
			preferences: this.currentPreferences,
			sandboxPositions: this.loadedSandboxPositions
		});
	}

	/**
	 * Load existing components when webview is ready
	 * For each component:
	 * 1. Send 'componentCreated' to create sandbox with loading spinner
	 * 2. Use ComponentLoader to check cache and load or trigger rebuild
	 */
	private async loadExistingComponents(): Promise<void> {
		if (this.loadedComponents.length === 0) {
			this.logger.debug('No existing components to load');
			return;
		}

		this.logger.info(`Loading ${this.loadedComponents.length} existing components`);

		for (const component of this.loadedComponents) {
			const { componentId, contentHash } = component;

			// 1. Notify webview that component exists (shows loading spinner)
			this.postToWebview('componentCreated', {
				componentId,
				canvasId: this.canvasId
			});

			// 2. Load component (checks cache, rebuilds if needed)
			if (this.componentLoader) {
				const result = await this.componentLoader.loadExistingComponent(
					this.canvasId,
					componentId,
					contentHash
				);

				if (result.fromCache && result.success && result.bundledCode) {
					// Cache hit - send bundled code directly to webview
					this.logger.debug(`Sending cached bundle for ${componentId}`);
					this.postToWebview('componentBuilt', {
						componentId,
						result: {
							bundledCode: result.bundledCode,
							cdnUrls: result.cdnUrls || [],
							framework: 'react', // TODO: Get from component meta
							resolvedDependencies: {},
							buildTime: result.buildTime || 0,
							bundleSize: result.bundleSize || 0
						}
					});
				} else if (!result.success) {
					// Load failed completely
					this.logger.error(`Failed to load component ${componentId}: ${result.error}`);
					this.postToWebview('componentError', {
						componentId,
						error: result.error || 'Failed to load component'
					});
				}
				// If result.fromCache is false but success is true, rebuild was triggered
				// and onComponentBuilt event will be routed back via manager
			}
		}

		this.logger.info('Finished loading existing components');
	}

	/**
	 * Save preferences to index.json
	 * Preserves existing components data, only updates preferences
	 */
	private savePreferencesToFile(): void {
		const indexPath = this.getIndexJsonPath();
		this.logger.debug(`Saving preferences to: ${indexPath}`);

		try {
			let index: ComponentIndex = { components: {}, preferences: { ...DEFAULT_CANVAS_PREFERENCES } };

			// Read existing file to preserve components
			if (fs.existsSync(indexPath)) {
				const content = fs.readFileSync(indexPath, 'utf-8');
				index = JSON.parse(content);
			}

			// Update preferences
			index.preferences = { ...this.currentPreferences };

			// Ensure directory exists
			const dir = path.dirname(indexPath);
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true });
			}

			// Write file
			fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
			this.logger.debug('Preferences saved to file');
		} catch (error) {
			this.logger.error(`Failed to save preferences: ${error}`);
		}
	}

	// Timer for debounced position saves
	private positionSaveTimer: ReturnType<typeof setTimeout> | undefined;
	// Pending positions to save (accumulated during debounce)
	private pendingPositions: SandboxData[] = [];

	/**
	 * Save component positions to index.json (debounced)
	 * Updates canvasPosition for each component entry
	 */
	private saveComponentPositions(sandboxes: SandboxData[]): void {
		// Accumulate positions (latest wins for same id)
		this.pendingPositions = sandboxes;

		// Debounce - wait 500ms after last change to avoid excessive writes during drag
		if (this.positionSaveTimer) {
			clearTimeout(this.positionSaveTimer);
		}

		this.positionSaveTimer = setTimeout(() => {
			this.doSaveComponentPositions();
			this.positionSaveTimer = undefined;
		}, 500);
	}

	/**
	 * Actually write sandbox positions to index.json
	 */
	private doSaveComponentPositions(): void {
		if (this.pendingPositions.length === 0) {
			return;
		}

		const indexPath = this.getIndexJsonPath();

		try {
			if (!fs.existsSync(indexPath)) {
				this.logger.debug('Index file not found, skipping position save');
				return;
			}

			const content = fs.readFileSync(indexPath, 'utf-8');
			const index: ComponentIndex = JSON.parse(content);
			let changed = false;

			// Update each sandbox's position
			for (const sandbox of this.pendingPositions) {
				const entry = index.components[sandbox.id];
				if (entry) {
					const currentPos = entry.sandboxPosition;
					// Only update if position actually changed
					if (!currentPos ||
						currentPos.x !== sandbox.x ||
						currentPos.y !== sandbox.y ||
						currentPos.zIndex !== sandbox.zIndex) {
						entry.sandboxPosition = {
							x: sandbox.x,
							y: sandbox.y,
							zIndex: sandbox.zIndex
						};
						changed = true;
					}
				}
			}

			// Only write if something changed
			if (changed) {
				fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
				this.logger.debug(`Saved positions for ${this.pendingPositions.length} sandboxes`);
			}

			this.pendingPositions = [];
		} catch (error) {
			this.logger.error(`Failed to save sandbox positions: ${error}`);
		}
	}

	/**
	 * Handle saveCanvas message from webview
	 * - backgroundColor/backgroundPattern: Save immediately
	 * - viewport: Only update in-memory (saved on dispose)
	 * - sandboxes: Extract positions and save to component index (debounced)
	 */
	private async handleSaveCanvas(payload: {
		canvasId: string;
		state: {
			backgroundColor?: string;
			backgroundPattern?: 'grid' | 'dots' | 'plain';
			viewport?: { x: number; y: number; scale: number };
			sandboxes?: SandboxData[];
		};
	}): Promise<void> {
		const state = payload.state;
		let needsSave = false;

		// Update backgroundColor (immediate save if changed)
		if (state.backgroundColor !== undefined) {
			this.currentPreferences.backgroundColor = state.backgroundColor;
			if (state.backgroundColor !== this.lastSavedBackgroundColor) {
				this.lastSavedBackgroundColor = state.backgroundColor;
				needsSave = true;
				this.logger.debug(`Background color changed to: ${state.backgroundColor}`);
			}
		}

		// Update backgroundPattern (immediate save if changed)
		if (state.backgroundPattern !== undefined) {
			this.currentPreferences.backgroundPattern = state.backgroundPattern;
			if (state.backgroundPattern !== this.lastSavedBackgroundPattern) {
				this.lastSavedBackgroundPattern = state.backgroundPattern;
				needsSave = true;
				this.logger.debug(`Background pattern changed to: ${state.backgroundPattern}`);
			}
		}

		// Update viewport (debounced save to avoid excessive writes during pan/zoom)
		if (state.viewport !== undefined) {
			this.currentPreferences.viewport = state.viewport;
			// Debounce viewport saves - wait 500ms after last change
			if (this.viewportSaveTimer) {
				clearTimeout(this.viewportSaveTimer);
			}
			this.viewportSaveTimer = setTimeout(() => {
				this.savePreferencesToFile();
				this.viewportSaveTimer = undefined;
			}, 500);
		}

		// Update component positions (debounced, saved alongside preferences)
		if (state.sandboxes && state.sandboxes.length > 0) {
			this.saveComponentPositions(state.sandboxes);
		}

		// Save immediately if color or pattern changed
		if (needsSave) {
			// Clear pending viewport timer since we're saving now anyway
			if (this.viewportSaveTimer) {
				clearTimeout(this.viewportSaveTimer);
				this.viewportSaveTimer = undefined;
			}
			this.savePreferencesToFile();
		}
	}

	// ============================================================================
	// Webview HTML
	// ============================================================================

	/**
	 * Update webview HTML content
	 */
	private updateWebview(): void {
		this.panel.webview.html = this.getHtmlForWebview();
	}

	/**
	 * Generate HTML for webview
	 */
	private getHtmlForWebview(): string {
		const webview = this.panel.webview;

		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, 'webview', 'build', 'assets', 'componentView.js')
		);
		const styleUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, 'webview', 'build', 'assets', 'componentView.css')
		);

		// CSP: Allow esm.sh for CDN imports in sandbox iframes
		const csp = `
			default-src 'none';
			style-src ${webview.cspSource} 'unsafe-inline';
			script-src ${webview.cspSource} 'unsafe-inline' 'unsafe-eval' https://esm.sh https://cdn.skypack.dev;
			font-src ${webview.cspSource};
			img-src ${webview.cspSource} data: https:;
			connect-src https://esm.sh https://cdn.skypack.dev;
			frame-src blob: data: https:;
		`;

		// Pass canvas identity to React app
		const canvasConfig = {
			canvasId: this.canvasId,
			canvasName: this.canvasName
		};

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="${csp.replace(/\s+/g, ' ').trim()}">
	<style>
		body {
			color: var(--vscode-foreground);
			background-color: var(--vscode-editor-background);
		}
	</style>
	<link href="${styleUri}" rel="stylesheet">
	<title>Roopik Canvas - ${this.canvasName}</title>
</head>
<body>
	<div id="root"></div>
	<script type="module" src="${scriptUri}"></script>
	<script>
		// Pass canvas identity to React app
		window.CANVAS_CONFIG = ${JSON.stringify(canvasConfig)};
	</script>
</body>
</html>`;
	}

	// ============================================================================
	// Disposal
	// ============================================================================

	/**
	 * Handle panel disposal
	 */
	private handleDispose(): void {
		this.logger.debug('Panel disposing...');

		// Clear any pending viewport save timer
		if (this.viewportSaveTimer) {
			clearTimeout(this.viewportSaveTimer);
			this.viewportSaveTimer = undefined;
		}

		// Clear any pending position save timer
		if (this.positionSaveTimer) {
			clearTimeout(this.positionSaveTimer);
			this.positionSaveTimer = undefined;
		}

		// Note: We do NOT save on dispose to avoid recreating deleted canvas folders
		// All preferences (including viewport) are saved via debounced handleSaveCanvas

		// Notify manager
		this.manager.onPanelDisposed(this.canvasId);

		// Dispose all disposables
		while (this.disposables.length) {
			const disposable = this.disposables.pop();
			disposable?.dispose();
		}

		this.logger.debug('Panel disposed');
	}

	/**
	 * Dispose the panel
	 */
	public dispose(): void {
		this.panel.dispose();
		// handleDispose will be called via onDidDispose
	}
}
