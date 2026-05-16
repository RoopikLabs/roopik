/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Pending Changes Module - Main Process Exports
 *
 * This module runs in the main process (Node.js) and handles
 * file system operations for pending changes.
 *
 * Usage:
 * ```typescript
 * import { PendingChangesService } from '../../electron-main/pendingChanges';
 *
 * const service = new PendingChangesService({
 *   pendingFolder: '.roopik/pending',
 *   folderStrategy: 'mirror'
 * });
 *
 * await service.initialize(workspaceRoot);
 *
 * // Update a file
 * await service.updateFile(
 *   '/path/to/Button.tsx',
 *   newContent,
 *   'drag-drop',
 *   { description: 'Moved button to header' }
 * );
 *
 * // Get diff URIs for VSCode diff view
 * const [originalUri, pendingUri] = service.getDiffUris('/path/to/Button.tsx');
 *
 * // Apply changes
 * await service.applyFile('/path/to/Button.tsx');
 * ```
 */

export { PendingChangesService } from './pendingChangesService.js';

// Re-export types for convenience
export type {
	IPendingChangesConfig,
	IPendingFile,
	IPendingFileMetadata,
	IApplyResult,
	PendingChangeSource,
	OnPendingFilesChangedCallback,
	IPendingChangesService
} from '../../common/pendingChanges/index.js';

export { DEFAULT_PENDING_CONFIG } from '../../common/pendingChanges/index.js';
