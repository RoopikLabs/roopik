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

	/** File that changed (relative path) */
	file: string;

	/** Type of change */
	changeType: 'create' | 'change' | 'delete';
}

/**
 * File Watcher Interface
 *
 * Watches .roopik/canvases/*/components/* for file changes.
 * Used to trigger automatic rebuilds when user edits source files.
 */
export interface IFileWatcher {
	readonly _serviceBrand: undefined;

	/**
	 * Start watching for file changes
	 */
	start(): void;

	/**
	 * Stop watching
	 */
	stop(): void;

	/**
	 * Check if watcher is running
	 */
	isWatching(): boolean;

	/**
	 * Event fired when a file changes
	 */
	readonly onFileChanged: Event<FileChangeEvent>;
}
