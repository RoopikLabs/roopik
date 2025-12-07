/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import { Logger } from '../logger';

/**
 * Background pattern types for the canvas
 */
export type BackgroundPattern = 'grid' | 'dots' | 'plain';

/**
 * Canvas state types (mirrors webview/src/canvasView/types)
 */
export interface CanvasState {
	id: string;
	name: string;
	sandboxes: Sandbox[];
	selectedSandboxId: string | null;
	viewport: Transform;
	/** Background color hex value */
	backgroundColor?: string;
	/** Background pattern type */
	backgroundPattern?: BackgroundPattern;
	createdAt: number;
	updatedAt: number;
}

/**
 * Sandbox interface for canvas state
 * Note: width/height removed - all sandboxes use DEFAULT_CONFIG dimensions
 * from gridManager.ts for consistency. Only x, y, zIndex are persisted.
 */
export interface Sandbox {
	id: string;
	x: number;
	y: number;
	zIndex: number;
	buildStatus: 'pending' | 'building' | 'ready' | 'error';
	buildError?: string;
	bundledCode?: string;
	cdnUrls?: string[];
	componentInput: ComponentInput;
}

export interface Transform {
	x: number;
	y: number;
	scale: number;
}

export interface ComponentInput {
	id: string;
	source: 'ai' | 'user' | 'upload' | 'import' | 'sample';
	framework?: 'react' | 'vue' | 'svelte' | 'solid' | 'preact' | 'html';
	files: { [filename: string]: string };
	entryFile?: string;
	priority?: 'high' | 'normal' | 'low';
	dependencies?: Record<string, string>;
}

/**
 * Canvas metadata stored in index file
 */
export interface CanvasMetadata {
	id: string;
	name: string;
	folderPath: string;
	createdAt: number;
	updatedAt: number;
}

/**
 * CanvasStateManager - File-based persistence for canvas state
 *
 * Storage structure:
 * .roopik/
 *   config.json            (IDE settings - stays in root)
 *   logs/                  (system logs - stays in root)
 *   canvas/
 *     canvases.json        (index of all canvases)
 *     {canvas-name}/
 *       canvas-state.json  (full canvas state with bundledCode)
 *       components/        (future: individual component files)
 */
export class CanvasStateManager {
	private static instance: CanvasStateManager;
	private logger: ReturnType<typeof Logger.prototype.createScoped>;
	private roopikDir: string | undefined;
	/** Canvas-specific storage directory (.roopik/canvas/) */
	private canvasDir: string | undefined;

	private constructor() {
		this.logger = Logger.getInstance().createScoped('CanvasStateManager');
	}

	public static getInstance(): CanvasStateManager {
		if (!CanvasStateManager.instance) {
			CanvasStateManager.instance = new CanvasStateManager();
		}
		return CanvasStateManager.instance;
	}

	/**
	 * Initialize the manager with workspace folder
	 */
	public async initialize(): Promise<void> {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			this.logger.warn('No workspace folder found, canvas state will not be persisted');
			return;
		}

		this.roopikDir = path.join(workspaceFolders[0].uri.fsPath, '.roopik');
		this.canvasDir = path.join(this.roopikDir, 'canvas');

		// Ensure .roopik/canvas directory exists
		try {
			await fs.mkdir(this.canvasDir, { recursive: true });
			this.logger.info(`Initialized: ${this.canvasDir}`);
		} catch (error) {
			this.logger.error('Failed to create .roopik/canvas directory', error);
		}
	}

	/**
	 * Get the .roopik directory path
	 */
	public getRoopikDir(): string | undefined {
		return this.roopikDir;
	}

	/**
	 * Create a new canvas folder and initialize state
	 */
	public async createCanvas(canvasName: string): Promise<CanvasState> {
		if (!this.canvasDir) {
			throw new Error('CanvasStateManager not initialized');
		}

		// Sanitize canvas name for folder
		const folderName = this.sanitizeFolderName(canvasName);
		const canvasFolderPath = path.join(this.canvasDir, folderName);

		// Check if canvas already exists
		try {
			await fs.access(canvasFolderPath);
			// Canvas exists, load existing state
			this.logger.info(`Canvas "${canvasName}" already exists, loading...`);
			const existingState = await this.loadCanvas(canvasName);
			if (existingState) {
				return existingState;
			}
		} catch {
			// Canvas doesn't exist, create it
		}

		// Create canvas directory
		await fs.mkdir(canvasFolderPath, { recursive: true });

		// Create initial state
		const now = Date.now();
		const canvasState: CanvasState = {
			id: `canvas-${now}`,
			name: canvasName,
			sandboxes: [],
			selectedSandboxId: null,
			viewport: { x: 0, y: 0, scale: 1 },
			createdAt: now,
			updatedAt: now
		};

		// Save initial state
		await this.saveCanvasState(canvasFolderPath, canvasState);

		// Update index
		await this.updateCanvasIndex({
			id: canvasState.id,
			name: canvasName,
			folderPath: folderName,
			createdAt: now,
			updatedAt: now
		});

		this.logger.info(`Created canvas: ${canvasName}`, { id: canvasState.id, path: canvasFolderPath });

		return canvasState;
	}

	/**
	 * Save canvas state to file
	 */
	public async saveCanvas(canvasName: string, state: CanvasState): Promise<void> {
		if (!this.canvasDir) {
			throw new Error('CanvasStateManager not initialized');
		}

		const folderName = this.sanitizeFolderName(canvasName);
		const canvasFolderPath = path.join(this.canvasDir, folderName);

		// Ensure directory exists
		await fs.mkdir(canvasFolderPath, { recursive: true });

		// Update timestamp
		state.updatedAt = Date.now();

		// Save state
		await this.saveCanvasState(canvasFolderPath, state);

		// Update index
		await this.updateCanvasIndex({
			id: state.id,
			name: canvasName,
			folderPath: folderName,
			createdAt: state.createdAt,
			updatedAt: state.updatedAt
		});

		this.logger.debug(`Saved canvas: ${canvasName}`, {
			sandboxCount: state.sandboxes.length,
			path: canvasFolderPath
		});
	}

	/**
	 * Load canvas state from file
	 */
	public async loadCanvas(canvasName: string): Promise<CanvasState | null> {
		if (!this.canvasDir) {
			return null;
		}

		const folderName = this.sanitizeFolderName(canvasName);
		const canvasFolderPath = path.join(this.canvasDir, folderName);
		const statePath = path.join(canvasFolderPath, 'canvas-state.json');

		try {
			const content = await fs.readFile(statePath, 'utf-8');
			const state = JSON.parse(content) as CanvasState;
			this.logger.info(`Loaded canvas: ${canvasName}`, {
				sandboxCount: state.sandboxes.length
			});
			return state;
		} catch (error) {
			this.logger.debug(`Canvas not found: ${canvasName}`);
			return null;
		}
	}

	/**
	 * Load canvas state synchronously (for initial panel creation)
	 */
	public loadCanvasSync(canvasName: string): CanvasState | null {
		if (!this.canvasDir) {
			return null;
		}

		const folderName = this.sanitizeFolderName(canvasName);
		const canvasFolderPath = path.join(this.canvasDir, folderName);
		const statePath = path.join(canvasFolderPath, 'canvas-state.json');

		try {
			if (fsSync.existsSync(statePath)) {
				const content = fsSync.readFileSync(statePath, 'utf-8');
				const state = JSON.parse(content) as CanvasState;
				this.logger.info(`Loaded canvas (sync): ${canvasName}`, {
					sandboxCount: state.sandboxes.length
				});
				return state;
			}
		} catch (error) {
			this.logger.debug(`Canvas not found (sync): ${canvasName}`);
		}
		return null;
	}

	/**
	 * Save canvas state synchronously
	 */
	public saveCanvasSync(canvasName: string, state: CanvasState): void {
		if (!this.canvasDir) {
			this.logger.warn('CanvasStateManager not initialized, cannot save');
			return;
		}

		const folderName = this.sanitizeFolderName(canvasName);
		const canvasFolderPath = path.join(this.canvasDir, folderName);
		const statePath = path.join(canvasFolderPath, 'canvas-state.json');

		try {
			// Ensure directory exists
			if (!fsSync.existsSync(canvasFolderPath)) {
				fsSync.mkdirSync(canvasFolderPath, { recursive: true });
			}

			// Update timestamp
			state.updatedAt = Date.now();

			// Save state
			fsSync.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');

			// Update index synchronously
			this.updateCanvasIndexSync({
				id: state.id,
				name: canvasName,
				folderPath: folderName,
				createdAt: state.createdAt,
				updatedAt: state.updatedAt
			});

			this.logger.debug(`Saved canvas (sync): ${canvasName}`);
		} catch (error) {
			this.logger.error(`Failed to save canvas (sync): ${canvasName}`, error);
		}
	}

	/**
	 * List all canvases
	 */
	public async listCanvases(): Promise<CanvasMetadata[]> {
		if (!this.canvasDir) {
			return [];
		}

		const indexPath = path.join(this.canvasDir, 'canvases.json');

		try {
			const content = await fs.readFile(indexPath, 'utf-8');
			const index = JSON.parse(content) as { canvases: CanvasMetadata[] };
			return index.canvases || [];
		} catch {
			return [];
		}
	}

	/**
	 * Delete a canvas
	 */
	public async deleteCanvas(canvasName: string): Promise<boolean> {
		if (!this.canvasDir) {
			return false;
		}

		const folderName = this.sanitizeFolderName(canvasName);
		const canvasFolderPath = path.join(this.canvasDir, folderName);

		try {
			// Remove directory
			await fs.rm(canvasFolderPath, { recursive: true, force: true });

			// Update index
			await this.removeFromIndex(canvasName);

			this.logger.info(`Deleted canvas: ${canvasName}`);
			return true;
		} catch (error) {
			this.logger.error(`Failed to delete canvas: ${canvasName}`, error);
			return false;
		}
	}

	/**
	 * Check if a canvas exists
	 */
	public async canvasExists(canvasName: string): Promise<boolean> {
		if (!this.canvasDir) {
			return false;
		}

		const folderName = this.sanitizeFolderName(canvasName);
		const canvasFolderPath = path.join(this.canvasDir, folderName);

		try {
			await fs.access(canvasFolderPath);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Check if a canvas exists (sync)
	 */
	public canvasExistsSync(canvasName: string): boolean {
		if (!this.canvasDir) {
			return false;
		}

		const folderName = this.sanitizeFolderName(canvasName);
		const canvasFolderPath = path.join(this.canvasDir, folderName);

		return fsSync.existsSync(canvasFolderPath);
	}

	// ============================================================================
	// Private Methods
	// ============================================================================

	/**
	 * Sanitize name for use as folder name
	 */
	private sanitizeFolderName(name: string): string {
		return name
			.trim()
			.toLowerCase()
			.replace(/\s+/g, '-')           // spaces to dashes
			.replace(/[<>:"/\\|?*]/g, '')   // remove invalid chars
			.replace(/\.+/g, '.')           // collapse dots
			.replace(/^\.+|\.+$/g, '');     // remove leading/trailing dots
	}

	/**
	 * Save canvas state to JSON file
	 */
	private async saveCanvasState(canvasDir: string, state: CanvasState): Promise<void> {
		const statePath = path.join(canvasDir, 'canvas-state.json');
		const content = JSON.stringify(state, null, 2);
		await fs.writeFile(statePath, content, 'utf-8');
	}

	/**
	 * Update canvas index file
	 */
	private async updateCanvasIndex(metadata: CanvasMetadata): Promise<void> {
		if (!this.canvasDir) return;

		const indexPath = path.join(this.canvasDir, 'canvases.json');
		let index: { canvases: CanvasMetadata[] } = { canvases: [] };

		try {
			const content = await fs.readFile(indexPath, 'utf-8');
			index = JSON.parse(content);
		} catch {
			// File doesn't exist, use empty index
		}

		// Update or add canvas
		const existingIndex = index.canvases.findIndex(c => c.name === metadata.name);
		if (existingIndex >= 0) {
			index.canvases[existingIndex] = metadata;
		} else {
			index.canvases.push(metadata);
		}

		// Save index
		await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8');
	}

	/**
	 * Update canvas index file (sync)
	 */
	private updateCanvasIndexSync(metadata: CanvasMetadata): void {
		if (!this.canvasDir) return;

		const indexPath = path.join(this.canvasDir, 'canvases.json');
		let index: { canvases: CanvasMetadata[] } = { canvases: [] };

		try {
			if (fsSync.existsSync(indexPath)) {
				const content = fsSync.readFileSync(indexPath, 'utf-8');
				index = JSON.parse(content);
			}
		} catch {
			// File doesn't exist, use empty index
		}

		// Update or add canvas
		const existingIndex = index.canvases.findIndex(c => c.name === metadata.name);
		if (existingIndex >= 0) {
			index.canvases[existingIndex] = metadata;
		} else {
			index.canvases.push(metadata);
		}

		// Save index
		fsSync.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
	}

	/**
	 * Remove canvas from index file
	 */
	private async removeFromIndex(canvasName: string): Promise<void> {
		if (!this.canvasDir) return;

		const indexPath = path.join(this.canvasDir, 'canvases.json');

		try {
			const content = await fs.readFile(indexPath, 'utf-8');
			const index = JSON.parse(content) as { canvases: CanvasMetadata[] };

			index.canvases = index.canvases.filter(c => c.name !== canvasName);

			await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8');
		} catch {
			// Index doesn't exist, nothing to remove
		}
	}
}
