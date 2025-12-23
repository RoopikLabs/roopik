/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * File Watcher Implementation
 *
 * Watches component folders in their ORIGINAL locations (metadata-only architecture).
 * NO LONGER watches .roopik/ - components are referenced, not copied.
 *
 * Key Changes:
 * - Per-component folder registration: registerFolderWatch(componentId, folderPath)
 * - Multiple fs.FSWatcher instances: one per component
 * - Unregister when component deleted: unregisterFolderWatch(componentId)
 *
 * Features:
 * - Enable/Disable: Master switch to turn watching on/off completely
 * - Pause/Resume: Temporarily hold events (queues changes, emits on resume)
 * - Per-component ignore: Exclude specific components from watching
 * - Debouncing: Batches rapid changes (300ms) to same component
 * - Source filtering: Only watches code files, ignores node_modules/dist/build
 */

import * as fs from 'fs';
import * as path from 'path';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IFileWatcher, FileChangeEvent } from '../../common/watch/fileWatcher.js';

/**
 * Registered folder watch for a component
 */
interface RegisteredWatch {
	componentId: string;
	canvasId: string;
	folderPath: string;
	watcher: fs.FSWatcher;
}

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
const IGNORED_FILES = ['meta.json', 'index.json', 'canvases.json', 'build.json'];

export class FileWatcher extends Disposable implements IFileWatcher {
	readonly _serviceBrand: undefined;

	// ============================================================================
	// State
	// ============================================================================

	/** Per-component folder watches: componentId → RegisteredWatch */
	private readonly registeredWatches = new Map<string, RegisteredWatch>();

	private workspacePath: string = '';
	private watching: boolean = false;

	/** Master enable/disable switch */
	private enabled: boolean = true;

	/** Temporary pause state */
	private paused: boolean = false;

	/** Components to ignore */
	private readonly ignoredComponents = new Set<string>();

	/** Debounce map: componentId → pending change with timeout */
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
	 *
	 * With metadata-only architecture, this just sets the watching flag.
	 * Actual folder watches are registered per-component via registerFolderWatch()
	 */
	start(workspacePath?: string): void {
		if (this.watching) {
			console.log('[Roopik FileWatcher] Already watching');
			return;
		}

		if (workspacePath) {
			this.workspacePath = workspacePath;
		}

		if (!this.workspacePath) {
			console.error('[Roopik FileWatcher] No workspace path provided');
			return;
		}

		this.watching = true;
		console.log('[Roopik FileWatcher] Started (metadata-only mode - use registerFolderWatch for each component)');
	}

	/**
	 * Stop watching completely
	 * Closes all registered folder watchers
	 */
	stop(): void {
		// Close all registered watchers
		for (const [componentId, registered] of this.registeredWatches) {
			try {
				registered.watcher.close();
				console.log(`[Roopik FileWatcher] Closed watcher for component: ${componentId}`);
			} catch (error) {
				console.error(`[Roopik FileWatcher] Error closing watcher for ${componentId}:`, error);
			}
		}
		this.registeredWatches.clear();

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
		console.log('[Roopik FileWatcher] Stopped watching');
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
			console.log('[Roopik FileWatcher] Disabled');
		} else if (!wasEnabled && enabled) {
			console.log('[Roopik FileWatcher] Enabled');
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

		console.log('[Roopik FileWatcher] Paused');
	}

	/**
	 * Resume event emission
	 */
	resume(): void {
		if (!this.paused) {
			return;
		}

		this.paused = false;
		console.log('[Roopik FileWatcher] Resumed');

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
		console.log(`[Roopik FileWatcher] Ignoring component: ${componentId}`);
	}

	/**
	 * Stop ignoring a component
	 */
	unignoreComponent(componentId: string): void {
		this.ignoredComponents.delete(componentId);
		console.log(`[Roopik FileWatcher] Unignoring component: ${componentId}`);
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
		console.log('[Roopik FileWatcher] Cleared all ignored components');
	}

	// ============================================================================
	// Folder Watch Registration (Metadata-Only Architecture)
	// ============================================================================

	/**
	 * Register a folder to watch for a specific component
	 *
	 * Creates an fs.watch on the original component folder (NOT .roopik/)
	 */
	registerFolderWatch(componentId: string, folderPath: string, canvasId: string): void {
		// Check if already registered
		if (this.registeredWatches.has(componentId)) {
			console.warn(`[Roopik FileWatcher] Component already has a registered watch: ${componentId}`);
			return;
		}

		try {
			// Create fs.watch for this folder
			const watcher = fs.watch(
				folderPath,
				{ recursive: true },
				(eventType, filename) => {
					if (filename) {
						this.handleComponentFileChange(componentId, canvasId, folderPath, eventType, filename);
					}
				}
			);

			// Store registration
			this.registeredWatches.set(componentId, {
				componentId,
				canvasId,
				folderPath,
				watcher
			});

			console.log(`[Roopik FileWatcher] Registered watch for ${componentId} at ${folderPath}`);

		} catch (error) {
			console.error(`[Roopik FileWatcher] Failed to register watch for ${componentId}:`, error);
		}
	}

	/**
	 * Unregister folder watch for a component
	 */
	unregisterFolderWatch(componentId: string): void {
		const registered = this.registeredWatches.get(componentId);
		if (!registered) {
			console.warn(`[Roopik FileWatcher] No registered watch found for: ${componentId}`);
			return;
		}

		try {
			registered.watcher.close();
			this.registeredWatches.delete(componentId);
			console.log(`[Roopik FileWatcher] Unregistered watch for: ${componentId}`);
		} catch (error) {
			console.error(`[Roopik FileWatcher] Error unregistering watch for ${componentId}:`, error);
		}

		// Clean up any pending changes for this component
		const key = `${registered.canvasId}/${componentId}`;
		const pending = this.debounceMap.get(key);
		if (pending?.timeout) {
			clearTimeout(pending.timeout);
		}
		this.debounceMap.delete(key);
		this.pausedQueue.delete(key);
	}

	/**
	 * Check if a folder is currently being watched for a component
	 */
	isFolderWatched(componentId: string): boolean {
		return this.registeredWatches.has(componentId);
	}

	/**
	 * Get all registered folder watches
	 */
	getRegisteredWatches(): Map<string, string> {
		const result = new Map<string, string>();
		for (const [componentId, registered] of this.registeredWatches) {
			result.set(componentId, registered.folderPath);
		}
		return result;
	}

	// ============================================================================
	// Internal: File Change Handling
	// ============================================================================

	/**
	 * Handle file change from a registered component folder watch
	 */
	private handleComponentFileChange(
		componentId: string,
		canvasId: string,
		folderPath: string,
		eventType: string,
		filename: string
	): void {
		// Check if enabled
		if (!this.enabled) {
			return;
		}

		// Check if component is ignored
		if (this.ignoredComponents.has(componentId)) {
			return;
		}

		// Normalize filename (Windows uses \, we want /)
		const normalizedFilename = filename.replace(/\\/g, '/');

		// Check if this is a source file we care about
		if (!this.isSourceFile(normalizedFilename)) {
			return;
		}

		// Map fs.watch event type to our change type
		const changeType = this.mapComponentEventType(eventType, folderPath, normalizedFilename);

		// Handle based on pause state
		if (this.paused) {
			this.queueChange(canvasId, componentId, normalizedFilename, changeType);
		} else {
			this.debounceChange(canvasId, componentId, normalizedFilename, changeType);
		}
	}

	/**
	 * Map fs.watch event type to our change type (for component folder watches)
	 */
	private mapComponentEventType(
		eventType: string,
		folderPath: string,
		filename: string
	): 'create' | 'change' | 'delete' {
		if (eventType === 'change') {
			return 'change';
		}

		// For 'rename', check if file exists
		const fullPath = path.join(folderPath, filename);

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

		console.log(`[Roopik FileWatcher] ${changeType}: ${canvasId}/${componentId}/${file}`);

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
