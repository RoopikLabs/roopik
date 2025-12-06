/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * File Watcher Implementation
 *
 * Watches .roopik/canvases/{canvasId}/components/{componentId}/ for file changes.
 * Emits events when source files are modified - ComponentService handles rebuilds.
 *
 * Features:
 * - Enable/Disable: Master switch to turn watching on/off completely
 * - Pause/Resume: Temporarily hold events (queues changes, emits on resume)
 * - Per-component ignore: Exclude specific components from watching
 * - Debouncing: Batches rapid changes (300ms) to same component
 * - Path parsing: Extracts canvasId/componentId from file paths
 * - Source filtering: Only watches code files, ignores metadata
 */

import * as fs from 'fs';
import * as path from 'path';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IFileWatcher, FileChangeEvent } from '../../common/watch/fileWatcher.js';

/**
 * Debounce/queued change tracking per component
 */
interface PendingChange {
	canvasId: string;
	componentId: string;
	file: string;
	changeType: 'create' | 'change' | 'delete';
	timeout?: ReturnType<typeof setTimeout>;
}

/**
 * Source file extensions to watch
 */
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.vue', '.svelte', '.css', '.scss', '.html', '.json'];

/**
 * Files to ignore (metadata, not source)
 */
const IGNORED_FILES = ['meta.json', 'index.json', 'build.json'];

export class FileWatcher extends Disposable implements IFileWatcher {
	readonly _serviceBrand: undefined;

	// ============================================================================
	// State
	// ============================================================================

	private watcher: fs.FSWatcher | null = null;
	private workspacePath: string = '';
	private watching: boolean = false;

	/** Master enable/disable switch */
	private enabled: boolean = true;

	/** Temporary pause state */
	private paused: boolean = false;

	/** Components to ignore */
	private readonly ignoredComponents = new Set<string>();

	/** Debounce map: "canvasId/componentId" → pending change with timeout */
	private readonly debounceMap = new Map<string, PendingChange>();

	/** Queue of changes that occurred while paused */
	private readonly pausedQueue = new Map<string, PendingChange>();

	/** Debounce delay in ms */
	private readonly debounceDelay = 300;

	// ============================================================================
	// Events
	// ============================================================================

	private readonly _onFileChanged = this._register(new Emitter<FileChangeEvent>());
	readonly onFileChanged: Event<FileChangeEvent> = this._onFileChanged.event;

	constructor() {
		super();
	}

	// ============================================================================
	// Lifecycle
	// ============================================================================

	/**
	 * Start watching for file changes
	 */
	start(workspacePath?: string): void {
		if (this.watching) {
			console.log('[FileWatcher] Already watching');
			return;
		}

		if (workspacePath) {
			this.workspacePath = workspacePath;
		}

		if (!this.workspacePath) {
			console.error('[FileWatcher] No workspace path provided');
			return;
		}

		const canvasesPath = path.join(this.workspacePath, '.roopik', 'canvases');

		// Check if canvases folder exists
		if (!fs.existsSync(canvasesPath)) {
			console.log('[FileWatcher] Canvases folder does not exist yet:', canvasesPath);
			// Don't fail - folder may be created later
		}

		try {
			// Watch recursively for all changes under canvases/
			this.watcher = fs.watch(canvasesPath, { recursive: true }, (eventType, filename) => {
				if (filename) {
					this.handleFileChange(eventType, filename);
				}
			});

			this.watcher.on('error', (error) => {
				console.error('[FileWatcher] Watcher error:', error);
			});

			this.watching = true;
			console.log('[FileWatcher] Started watching:', canvasesPath);

		} catch (error) {
			console.error('[FileWatcher] Failed to start watcher:', error);
		}
	}

	/**
	 * Stop watching completely
	 */
	stop(): void {
		if (this.watcher) {
			this.watcher.close();
			this.watcher = null;
		}

		// Clear all pending debounces
		for (const [, pending] of this.debounceMap) {
			if (pending.timeout) {
				clearTimeout(pending.timeout);
			}
		}
		this.debounceMap.clear();

		// Clear paused queue
		this.pausedQueue.clear();

		this.watching = false;
		console.log('[FileWatcher] Stopped watching');
	}

	/**
	 * Check if watcher is running
	 */
	isWatching(): boolean {
		return this.watching;
	}

	/**
	 * Set workspace path
	 */
	setWorkspacePath(workspacePath: string): void {
		this.workspacePath = workspacePath;
	}

	// ============================================================================
	// Enable/Disable (Master Switch)
	// ============================================================================

	/**
	 * Enable or disable file watching completely
	 */
	setEnabled(enabled: boolean): void {
		const wasEnabled = this.enabled;
		this.enabled = enabled;

		if (wasEnabled && !enabled) {
			// Disabling - clear any pending events
			for (const [, pending] of this.debounceMap) {
				if (pending.timeout) {
					clearTimeout(pending.timeout);
				}
			}
			this.debounceMap.clear();
			this.pausedQueue.clear();
			console.log('[FileWatcher] Disabled');
		} else if (!wasEnabled && enabled) {
			console.log('[FileWatcher] Enabled');
		}
	}

	/**
	 * Check if file watching is enabled
	 */
	isEnabled(): boolean {
		return this.enabled;
	}

	// ============================================================================
	// Pause/Resume (Temporary Hold)
	// ============================================================================

	/**
	 * Pause event emission temporarily
	 */
	pause(): void {
		if (this.paused) {
			return;
		}

		this.paused = true;

		// Move any pending debounced changes to paused queue
		for (const [key, pending] of this.debounceMap) {
			if (pending.timeout) {
				clearTimeout(pending.timeout);
			}
			// Store without timeout - will emit on resume
			this.pausedQueue.set(key, { ...pending, timeout: undefined });
		}
		this.debounceMap.clear();

		console.log('[FileWatcher] Paused');
	}

	/**
	 * Resume event emission
	 */
	resume(): void {
		if (!this.paused) {
			return;
		}

		this.paused = false;
		console.log('[FileWatcher] Resumed');

		// Emit all queued changes
		for (const [, pending] of this.pausedQueue) {
			this.emitChange(pending.canvasId, pending.componentId, pending.file, pending.changeType);
		}
		this.pausedQueue.clear();
	}

	/**
	 * Check if currently paused
	 */
	isPaused(): boolean {
		return this.paused;
	}

	// ============================================================================
	// Per-Component Control
	// ============================================================================

	/**
	 * Ignore changes to a specific component
	 */
	ignoreComponent(componentId: string): void {
		this.ignoredComponents.add(componentId);
		console.log(`[FileWatcher] Ignoring component: ${componentId}`);
	}

	/**
	 * Stop ignoring a component
	 */
	unignoreComponent(componentId: string): void {
		this.ignoredComponents.delete(componentId);
		console.log(`[FileWatcher] Unignoring component: ${componentId}`);
	}

	/**
	 * Check if a component is being ignored
	 */
	isComponentIgnored(componentId: string): boolean {
		return this.ignoredComponents.has(componentId);
	}

	/**
	 * Get list of all ignored components
	 */
	getIgnoredComponents(): string[] {
		return Array.from(this.ignoredComponents);
	}

	/**
	 * Clear all ignored components
	 */
	clearIgnoredComponents(): void {
		this.ignoredComponents.clear();
		console.log('[FileWatcher] Cleared all ignored components');
	}

	// ============================================================================
	// Internal: File Change Handling
	// ============================================================================

	/**
	 * Handle raw file change from fs.watch
	 */
	private handleFileChange(eventType: string, relativePath: string): void {
		// Check if enabled
		if (!this.enabled) {
			return;
		}

		// Normalize path separators (Windows uses \, we want /)
		const normalizedPath = relativePath.replace(/\\/g, '/');

		// Parse the path to extract canvasId, componentId, and file
		const parsed = this.parsePath(normalizedPath);
		if (!parsed) {
			return;
		}

		const { canvasId, componentId, file } = parsed;

		// Check if component is ignored
		if (this.ignoredComponents.has(componentId)) {
			return;
		}

		// Check if this is a source file we care about
		if (!this.isSourceFile(file)) {
			return;
		}

		// Map fs.watch event type to our change type
		const changeType = this.mapEventType(eventType, canvasId, componentId, file);

		// Handle based on pause state
		if (this.paused) {
			this.queueChange(canvasId, componentId, file, changeType);
		} else {
			this.debounceChange(canvasId, componentId, file, changeType);
		}
	}

	/**
	 * Parse path to extract canvasId, componentId, and file
	 */
	private parsePath(relativePath: string): { canvasId: string; componentId: string; file: string } | null {
		const parts = relativePath.split('/');

		// Expected: canvasId/components/componentId/file (at least 4 parts)
		if (parts.length < 4) {
			return null;
		}

		// Check if this is under components/ folder
		if (parts[1] !== 'components') {
			return null;
		}

		const canvasId = parts[0];
		const componentId = parts[2];
		const file = parts.slice(3).join('/');

		if (!canvasId || !componentId || !file) {
			return null;
		}

		return { canvasId, componentId, file };
	}

	/**
	 * Check if file is a source file we should watch
	 */
	private isSourceFile(file: string): boolean {
		const basename = path.basename(file);
		if (IGNORED_FILES.includes(basename)) {
			return false;
		}

		const ext = path.extname(file).toLowerCase();
		return SOURCE_EXTENSIONS.includes(ext);
	}

	/**
	 * Map fs.watch event type to our change type
	 */
	private mapEventType(
		eventType: string,
		canvasId: string,
		componentId: string,
		file: string
	): 'create' | 'change' | 'delete' {
		if (eventType === 'change') {
			return 'change';
		}

		// For 'rename', check if file exists
		const fullPath = path.join(
			this.workspacePath,
			'.roopik',
			'canvases',
			canvasId,
			'components',
			componentId,
			file
		);

		try {
			if (fs.existsSync(fullPath)) {
				return 'create';
			} else {
				return 'delete';
			}
		} catch {
			return 'delete';
		}
	}

	/**
	 * Queue change while paused (consolidates per component)
	 */
	private queueChange(
		canvasId: string,
		componentId: string,
		file: string,
		changeType: 'create' | 'change' | 'delete'
	): void {
		const key = `${canvasId}/${componentId}`;
		this.pausedQueue.set(key, { canvasId, componentId, file, changeType });
	}

	/**
	 * Debounce changes per component
	 */
	private debounceChange(
		canvasId: string,
		componentId: string,
		file: string,
		changeType: 'create' | 'change' | 'delete'
	): void {
		const key = `${canvasId}/${componentId}`;

		// Clear existing debounce
		const existing = this.debounceMap.get(key);
		if (existing?.timeout) {
			clearTimeout(existing.timeout);
		}

		// Set new debounce
		const timeout = setTimeout(() => {
			this.debounceMap.delete(key);
			this.emitChange(canvasId, componentId, file, changeType);
		}, this.debounceDelay);

		this.debounceMap.set(key, { canvasId, componentId, file, changeType, timeout });
	}

	/**
	 * Emit file change event
	 */
	private emitChange(
		canvasId: string,
		componentId: string,
		file: string,
		changeType: 'create' | 'change' | 'delete'
	): void {
		// Final check - might have been disabled/paused between debounce and emit
		if (!this.enabled || this.paused) {
			return;
		}

		console.log(`[FileWatcher] ${changeType}: ${canvasId}/${componentId}/${file}`);

		this._onFileChanged.fire({
			canvasId,
			componentId,
			file,
			changeType
		});
	}

	/**
	 * Dispose resources
	 */
	override dispose(): void {
		this.stop();
		super.dispose();
	}
}
