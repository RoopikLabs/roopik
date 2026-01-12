/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';

// ============================================================================
// Service Interface
// ============================================================================

export const IFileWatcher = createDecorator<IFileWatcher>('roopikFileWatcher');

/**
 * File change event
 */
export interface FileChangeEvent {
	/** Canvas containing the component */
	canvasId: string;

	/** Component that changed */
	componentId: string;

	/** File that changed (relative path) - informational only */
	file: string;

	/** Type of change */
	changeType: 'create' | 'change' | 'delete';
}

/**
 * File Watcher Interface
 *
 * Watches .roopik/canvases/{canvasId}/components/{componentId}/ for file changes.
 * Used to trigger automatic rebuilds when user edits source files.
 *
 * Features:
 * - Enable/Disable: Master switch to turn watching on/off completely
 * - Pause/Resume: Temporarily hold events (keeps watching, queues changes)
 * - Per-component ignore: Exclude specific components from watching
 * - Debouncing: Batches rapid changes to same component
 *
 * Usage:
 * ```typescript
 * // Basic usage
 * fileWatcher.start(workspacePath);
 * fileWatcher.onFileChanged(event => rebuild(event.componentId));
 *
 * // During batch operations (import, AI generation)
 * fileWatcher.pause();
 * await importFiles();
 * await manualBuild();
 * fileWatcher.resume();
 *
 * // Disable completely if causing issues
 * fileWatcher.setEnabled(false);
 *
 * // Ignore specific component while agent works on it
 * fileWatcher.ignoreComponent('abc-123');
 * await agentWritesFiles();
 * await manualRebuild('abc-123');
 * fileWatcher.unignoreComponent('abc-123');
 * ```
 *
 * Can be used by:
 * - ComponentService (primary consumer)
 * - AI Agents (to pause during writes)
 * - Project Mode (future - for project file watching)
 * - External tools via IPC
 */
export interface IFileWatcher {
	readonly _serviceBrand: undefined;

	// ============================================================================
	// Lifecycle
	// ============================================================================

	/**
	 * Start watching for file changes
	 *
	 * @param workspacePath Optional workspace path (can also use setWorkspacePath)
	 */
	start(workspacePath?: string): void;

	/**
	 * Stop watching completely (releases all resources)
	 */
	stop(): void;

	/**
	 * Check if watcher is actively running
	 */
	isWatching(): boolean;

	/**
	 * Set workspace path (can be called before start)
	 *
	 * @param workspacePath Root workspace path (where .roopik/ lives)
	 */
	setWorkspacePath(workspacePath: string): void;

	// ============================================================================
	// Enable/Disable (Master Switch)
	// ============================================================================

	/**
	 * Enable or disable file watching completely
	 *
	 * When disabled:
	 * - No events are emitted
	 * - File system watcher may still run but events are dropped
	 * - Use this if file watching is causing issues
	 *
	 * @param enabled True to enable, false to disable
	 */
	setEnabled(enabled: boolean): void;

	/**
	 * Check if file watching is enabled
	 */
	isEnabled(): boolean;

	// ============================================================================
	// Pause/Resume (Temporary Hold)
	// ============================================================================

	/**
	 * Pause event emission temporarily
	 *
	 * While paused:
	 * - File system watching continues
	 * - Changes are tracked but events NOT emitted
	 * - On resume, a single consolidated event per component is emitted
	 *
	 * Use cases:
	 * - During batch import operations
	 * - During AI agent file writes
	 * - During programmatic multi-file updates
	 */
	pause(): void;

	/**
	 * Resume event emission
	 *
	 * If changes occurred while paused, emits consolidated events
	 * for each affected component.
	 */
	resume(): void;

	/**
	 * Check if currently paused
	 */
	isPaused(): boolean;

	// ============================================================================
	// Per-Component Control
	// ============================================================================

	/**
	 * Ignore changes to a specific component
	 *
	 * Use when an agent or process is actively modifying a component
	 * and you want to manually trigger rebuild when done.
	 *
	 * @param componentId Component ID to ignore
	 */
	ignoreComponent(componentId: string): void;

	/**
	 * Stop ignoring a component
	 *
	 * @param componentId Component ID to stop ignoring
	 */
	unignoreComponent(componentId: string): void;

	/**
	 * Check if a component is being ignored
	 *
	 * @param componentId Component ID to check
	 */
	isComponentIgnored(componentId: string): boolean;

	/**
	 * Get list of all ignored components
	 */
	getIgnoredComponents(): string[];

	/**
	 * Clear all ignored components
	 */
	clearIgnoredComponents(): void;

	// ============================================================================
	// Folder Watch Registration (Metadata-Only Architecture)
	// ============================================================================

	/**
	 * Register a folder to watch for a specific component
	 *
	 * With metadata-only architecture, components stay in their original locations.
	 * This method watches the ORIGINAL folder (not .roopik/)
	 *
	 * @param componentId Component ID
	 * @param folderPath Absolute path to component folder (original location)
	 */
	registerFolderWatch(componentId: string, folderPath: string, canvasId: string): void;

	/**
	 * Unregister folder watch for a component
	 *
	 * @param componentId Component ID to stop watching
	 */
	unregisterFolderWatch(componentId: string): void;

	/**
	 * Check if a folder is currently being watched for a component
	 *
	 * @param componentId Component ID to check
	 */
	isFolderWatched(componentId: string): boolean;

	/**
	 * Get all registered folder watches
	 * Returns map of componentId → folderPath
	 */
	getRegisteredWatches(): Map<string, string>;

	// ============================================================================
	// Events
	// ============================================================================

	/**
	 * Event fired when a file changes
	 *
	 * The `file` field is informational (for logging/debugging).
	 * Consumers should rebuild the entire component, not just the changed file.
	 *
	 * Not fired when:
	 * - Watcher is disabled (setEnabled(false))
	 * - Watcher is paused (events queued until resume)
	 * - Component is ignored (ignoreComponent)
	 */
	readonly onFileChanged: Event<FileChangeEvent>;
}
