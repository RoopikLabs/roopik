/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import { Logger } from '../logger';
import {
	WORKSPACE_ROOT,
	CANVASES_DIR,
	COMPONENTS_DIR,
	COMPONENT_META_FILE,
	CANVAS_META_FILE,
	SOURCE_EXTENSIONS,
	FILE_WATCHER_DEBOUNCE_MS,
	getFileWatcherPattern
} from '../constants';

/**
 * Parsed path info from a file change event
 */
export interface ParsedFilePath {
	/** Canvas name (folder name) */
	canvasName: string;
	/** Component ID (folder name) */
	componentId: string;
	/** Filename that changed */
	filename: string;
	/** Full relative path from workspace root */
	relativePath: string;
}

/**
 * Callback for when a component's source files change
 */
export type OnComponentChangeCallback = (
	canvasName: string,
	componentId: string,
	changedFile: string
) => void;

/**
 * Callback for when a canvas meta file changes
 */
export type OnCanvasChangeCallback = (canvasName: string) => void;

/**
 * Callback for when a component is deleted
 */
export type OnComponentDeleteCallback = (
	canvasName: string,
	componentId: string
) => void;

/**
 * SourceFileWatcher
 *
 * Watches the roopik-workspace directory for file changes.
 * Debounces rapid changes and notifies subscribers when source files change.
 *
 * Watch pattern: roopik-workspace/canvases/** /*.{tsx,jsx,vue,svelte,ts,js,css,json}
 *
 * This enables:
 * - Auto-rebuild when user/AI edits source files
 * - Activity pane updates when canvas.meta.json changes
 * - Component removal handling
 */
export class SourceFileWatcher {
	private static instance: SourceFileWatcher;
	private watcher: vscode.FileSystemWatcher | undefined;
	private logger: ReturnType<typeof Logger.prototype.createScoped>;
	private workspaceRoot: string | undefined;

	// Debounce timers per component
	private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

	// Callbacks
	private onComponentChangeCallbacks: OnComponentChangeCallback[] = [];
	private onCanvasChangeCallbacks: OnCanvasChangeCallback[] = [];
	private onComponentDeleteCallbacks: OnComponentDeleteCallback[] = [];

	private constructor() {
		this.logger = Logger.getInstance().createScoped('SourceFileWatcher');
	}

	/**
	 * Get singleton instance
	 */
	public static getInstance(): SourceFileWatcher {
		if (!SourceFileWatcher.instance) {
			SourceFileWatcher.instance = new SourceFileWatcher();
		}
		return SourceFileWatcher.instance;
	}

	/**
	 * Initialize and start watching
	 *
	 * @param workspaceRoot Root path of the workspace
	 */
	public initialize(workspaceRoot: string): void {
		this.workspaceRoot = workspaceRoot;

		// Create the watch pattern
		const pattern = new vscode.RelativePattern(
			workspaceRoot,
			getFileWatcherPattern()
		);

		// Also watch JSON files for meta changes
		const jsonPattern = new vscode.RelativePattern(
			workspaceRoot,
			`${WORKSPACE_ROOT}/${CANVASES_DIR}/**/*.json`
		);

		// Create file watcher
		this.watcher = vscode.workspace.createFileSystemWatcher(pattern);

		// Also create a separate watcher for JSON files
		const jsonWatcher = vscode.workspace.createFileSystemWatcher(jsonPattern);

		// Register handlers
		this.watcher.onDidChange(this.handleFileChange.bind(this));
		this.watcher.onDidCreate(this.handleFileCreate.bind(this));
		this.watcher.onDidDelete(this.handleFileDelete.bind(this));

		jsonWatcher.onDidChange(this.handleFileChange.bind(this));
		jsonWatcher.onDidCreate(this.handleFileCreate.bind(this));
		jsonWatcher.onDidDelete(this.handleFileDelete.bind(this));

		this.logger.info('File watcher initialized', {
			workspaceRoot,
			pattern: getFileWatcherPattern(),
			debounceMs: FILE_WATCHER_DEBOUNCE_MS
		});
	}

	/**
	 * Stop watching and cleanup
	 */
	public dispose(): void {
		if (this.watcher) {
			this.watcher.dispose();
			this.watcher = undefined;
		}

		// Clear all debounce timers
		for (const timer of this.debounceTimers.values()) {
			clearTimeout(timer);
		}
		this.debounceTimers.clear();

		this.logger.info('File watcher disposed');
	}

	// ============================================
	// Callback Registration
	// ============================================

	/**
	 * Register callback for component source changes
	 */
	public onComponentChange(callback: OnComponentChangeCallback): vscode.Disposable {
		this.onComponentChangeCallbacks.push(callback);
		return {
			dispose: () => {
				const index = this.onComponentChangeCallbacks.indexOf(callback);
				if (index !== -1) {
					this.onComponentChangeCallbacks.splice(index, 1);
				}
			}
		};
	}

	/**
	 * Register callback for canvas meta changes
	 */
	public onCanvasChange(callback: OnCanvasChangeCallback): vscode.Disposable {
		this.onCanvasChangeCallbacks.push(callback);
		return {
			dispose: () => {
				const index = this.onCanvasChangeCallbacks.indexOf(callback);
				if (index !== -1) {
					this.onCanvasChangeCallbacks.splice(index, 1);
				}
			}
		};
	}

	/**
	 * Register callback for component deletion
	 */
	public onComponentDelete(callback: OnComponentDeleteCallback): vscode.Disposable {
		this.onComponentDeleteCallbacks.push(callback);
		return {
			dispose: () => {
				const index = this.onComponentDeleteCallbacks.indexOf(callback);
				if (index !== -1) {
					this.onComponentDeleteCallbacks.splice(index, 1);
				}
			}
		};
	}

	// ============================================
	// File Event Handlers
	// ============================================

	/**
	 * Handle file change event
	 */
	private handleFileChange(uri: vscode.Uri): void {
		const parsed = this.parseFilePath(uri);
		if (!parsed) return;

		this.logger.debug('File changed', { path: parsed.relativePath });

		// Check if it's a canvas meta file
		if (parsed.filename === CANVAS_META_FILE) {
			this.notifyCanvasChange(parsed.canvasName);
			return;
		}

		// Check if it's a component meta file (no rebuild needed, just info update)
		if (parsed.filename === COMPONENT_META_FILE) {
			// Component meta changed - might want to refresh UI
			this.logger.debug('Component meta changed', {
				canvas: parsed.canvasName,
				component: parsed.componentId
			});
			return;
		}

		// Source file changed - debounce and notify
		this.debounceNotify(parsed);
	}

	/**
	 * Handle file create event
	 */
	private handleFileCreate(uri: vscode.Uri): void {
		const parsed = this.parseFilePath(uri);
		if (!parsed) return;

		this.logger.debug('File created', { path: parsed.relativePath });

		// New canvas
		if (parsed.filename === CANVAS_META_FILE) {
			this.notifyCanvasChange(parsed.canvasName);
			return;
		}

		// New source file - trigger build
		if (this.isSourceFile(parsed.filename)) {
			this.debounceNotify(parsed);
		}
	}

	/**
	 * Handle file delete event
	 */
	private handleFileDelete(uri: vscode.Uri): void {
		const parsed = this.parseFilePath(uri);
		if (!parsed) return;

		this.logger.debug('File deleted', { path: parsed.relativePath });

		// Canvas deleted
		if (parsed.filename === CANVAS_META_FILE) {
			this.notifyCanvasChange(parsed.canvasName);
			return;
		}

		// Component folder deleted (we get notified about files inside)
		// If it's a source file, notify component delete
		if (this.isSourceFile(parsed.filename)) {
			// Check if this was the last file in the component
			// For now, just notify - the handler can check if folder still exists
			for (const callback of this.onComponentDeleteCallbacks) {
				try {
					callback(parsed.canvasName, parsed.componentId);
				} catch (error) {
					this.logger.error('Component delete callback error', error);
				}
			}
		}
	}

	// ============================================
	// Path Parsing
	// ============================================

	/**
	 * Parse a file URI into structured info
	 *
	 * Expected path: roopik-workspace/canvases/{canvas}/components/{component}/{file}
	 * Or: roopik-workspace/canvases/{canvas}/canvas.meta.json
	 */
	private parseFilePath(uri: vscode.Uri): ParsedFilePath | undefined {
		if (!this.workspaceRoot) return undefined;

		const relativePath = path.relative(this.workspaceRoot, uri.fsPath);
		const parts = relativePath.split(path.sep);

		// Validate path structure
		// Should be: roopik-workspace/canvases/{canvas}/...
		if (parts.length < 3) return undefined;
		if (parts[0] !== WORKSPACE_ROOT) return undefined;
		if (parts[1] !== CANVASES_DIR) return undefined;

		const canvasName = parts[2];
		const filename = parts[parts.length - 1];

		// Canvas meta file: roopik-workspace/canvases/{canvas}/canvas.meta.json
		if (parts.length === 4 && filename === CANVAS_META_FILE) {
			return {
				canvasName,
				componentId: '',
				filename,
				relativePath
			};
		}

		// Component file: roopik-workspace/canvases/{canvas}/components/{component}/{file}
		if (parts.length >= 6 && parts[3] === COMPONENTS_DIR) {
			const componentId = parts[4];
			return {
				canvasName,
				componentId,
				filename,
				relativePath
			};
		}

		return undefined;
	}

	/**
	 * Check if a filename is a source file
	 */
	private isSourceFile(filename: string): boolean {
		const ext = path.extname(filename).toLowerCase();
		return SOURCE_EXTENSIONS.includes(ext);
	}

	// ============================================
	// Debouncing
	// ============================================

	/**
	 * Debounce notifications for a component
	 */
	private debounceNotify(parsed: ParsedFilePath): void {
		const key = `${parsed.canvasName}:${parsed.componentId}`;

		// Clear existing timer
		const existingTimer = this.debounceTimers.get(key);
		if (existingTimer) {
			clearTimeout(existingTimer);
		}

		// Set new timer
		const timer = setTimeout(() => {
			this.debounceTimers.delete(key);
			this.notifyComponentChange(parsed.canvasName, parsed.componentId, parsed.filename);
		}, FILE_WATCHER_DEBOUNCE_MS);

		this.debounceTimers.set(key, timer);
	}

	// ============================================
	// Notifications
	// ============================================

	/**
	 * Notify all callbacks of component change
	 */
	private notifyComponentChange(
		canvasName: string,
		componentId: string,
		changedFile: string
	): void {
		this.logger.info('Component source changed', {
			canvas: canvasName,
			component: componentId,
			file: changedFile
		});

		for (const callback of this.onComponentChangeCallbacks) {
			try {
				callback(canvasName, componentId, changedFile);
			} catch (error) {
				this.logger.error('Component change callback error', error);
			}
		}
	}

	/**
	 * Notify all callbacks of canvas change
	 */
	private notifyCanvasChange(canvasName: string): void {
		this.logger.info('Canvas changed', { canvas: canvasName });

		for (const callback of this.onCanvasChangeCallbacks) {
			try {
				callback(canvasName);
			} catch (error) {
				this.logger.error('Canvas change callback error', error);
			}
		}
	}
}

