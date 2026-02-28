/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Pending Changes Module - Types
 *
 * This module handles the "dirty buffer" pattern for tracking file changes
 * that haven't been saved to disk yet. Used by:
 * - Drag-drop element reordering (Project Mode)
 * - AI agent code modifications (future)
 * - Component Mode edits (future)
 *
 * Architecture:
 * - Track FINAL state, not history of changes
 * - One pending file per modified source file
 * - Collapse multiple edits to same file automatically
 * - Use VSCode's diff editor for review
 */

/**
 * Configuration for pending changes storage
 * All paths are relative to workspace root
 */
export interface IPendingChangesConfig {
	/**
	 * Folder where pending files are stored
	 * @default '.roopik/pending'
	 */
	pendingFolder: string;

	/**
	 * Whether to mirror directory structure or flatten
	 * - 'mirror': .roopik/pending/src/components/Button.tsx
	 * - 'flat': .roopik/pending/src__components__Button.tsx
	 * @default 'mirror'
	 */
	folderStrategy: 'mirror' | 'flat';

	/**
	 * File extension for pending files
	 * @default '' (no extension added)
	 */
	pendingExtension: string;

	/**
	 * Whether to auto-cleanup pending files on apply
	 * @default true
	 */
	cleanupOnApply: boolean;
}

/**
 * Default configuration
 */
export const DEFAULT_PENDING_CONFIG: IPendingChangesConfig = {
	pendingFolder: '.roopik/pending',
	folderStrategy: 'mirror',
	pendingExtension: '',
	cleanupOnApply: true
};

/**
 * Represents a single pending file change
 */
export interface IPendingFile {
	/**
	 * Unique ID for this pending change
	 */
	id: string;

	/**
	 * Original file path (absolute)
	 */
	originalPath: string;

	/**
	 * Pending file path (absolute)
	 */
	pendingPath: string;

	/**
	 * Original file path relative to workspace
	 */
	relativePath: string;

	/**
	 * Original content snapshot (for comparison/revert)
	 */
	originalContent: string;

	/**
	 * Timestamp when first modified
	 */
	createdAt: number;

	/**
	 * Timestamp of last modification
	 */
	updatedAt: number;

	/**
	 * Source of the change
	 */
	source: PendingChangeSource;

	/**
	 * Optional metadata for UI display
	 */
	metadata?: IPendingFileMetadata;
}

/**
 * Source of the pending change
 */
export type PendingChangeSource =
	| 'drag-drop'      // Element reordering
	| 'style-edit'     // CSS/style changes
	| 'ai-agent'       // AI-generated changes
	| 'manual'         // Direct code edit
	| 'component-mode'; // Component builder

/**
 * Metadata for UI display
 */
export interface IPendingFileMetadata {
	/**
	 * Human-readable description
	 */
	description?: string;

	/**
	 * Number of individual edits collapsed into this file
	 */
	editCount?: number;

	/**
	 * Preview of changes (for tooltip)
	 */
	preview?: string;
}

/**
 * Result of applying a pending change
 */
export interface IApplyResult {
	success: boolean;
	originalPath: string;
	error?: string;
}

/**
 * Callback when pending files change
 */
export type OnPendingFilesChangedCallback = (files: IPendingFile[]) => void;

/**
 * Service interface for pending changes management
 * This is the main API for the module
 */
export interface IPendingChangesService {
	/**
	 * Get current configuration
	 */
	getConfig(): IPendingChangesConfig;

	/**
	 * Update configuration
	 */
	setConfig(config: Partial<IPendingChangesConfig>): void;

	/**
	 * Initialize service with workspace root
	 */
	initialize(workspaceRoot: string): Promise<void>;

	/**
	 * Get all pending files
	 */
	getPendingFiles(): IPendingFile[];

	/**
	 * Get pending file for a specific original path
	 */
	getPendingFile(originalPath: string): IPendingFile | undefined;

	/**
	 * Check if a file has pending changes
	 */
	hasPendingChanges(originalPath: string): boolean;

	/**
	 * Check if there are ANY pending changes
	 */
	hasAnyPendingChanges(): boolean;

	/**
	 * Get count of pending files
	 */
	getPendingCount(): number;

	/**
	 * Update or create a pending file
	 * If newContent matches original, the pending file is removed (no-op change)
	 *
	 * @param originalPath - Path to original file
	 * @param newContent - New file content
	 * @param source - Source of the change
	 * @param metadata - Optional metadata for UI
	 * @returns The pending file entry (or undefined if content matched original)
	 */
	updateFile(
		originalPath: string,
		newContent: string,
		source: PendingChangeSource,
		metadata?: IPendingFileMetadata
	): Promise<IPendingFile | undefined>;

	/**
	 * Discard pending changes for a file (revert to original)
	 */
	discardFile(originalPath: string): Promise<void>;

	/**
	 * Discard all pending changes
	 */
	discardAll(): Promise<void>;

	/**
	 * Apply pending changes for a file (write to original)
	 */
	applyFile(originalPath: string): Promise<IApplyResult>;

	/**
	 * Apply all pending changes
	 */
	applyAll(): Promise<IApplyResult[]>;

	/**
	 * Get URI for opening diff view
	 * Returns [originalUri, pendingUri] for use with vscode.diff
	 */
	getDiffUris(originalPath: string): [string, string] | undefined;

	/**
	 * Subscribe to pending files changes
	 */
	onPendingFilesChanged(callback: OnPendingFilesChangedCallback): void;

	/**
	 * Dispose and cleanup
	 */
	dispose(): void;
}
