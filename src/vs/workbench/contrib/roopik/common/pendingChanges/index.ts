/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Pending Changes Module - Common Exports
 *
 * This module provides the "dirty buffer" pattern for tracking file changes.
 * Use this for any feature that needs to:
 * - Track unsaved changes
 * - Show diff previews
 * - Allow user review before applying
 *
 * Usage:
 * ```typescript
 * import {
 *   IPendingChangesService,
 *   IPendingFile,
 *   DEFAULT_PENDING_CONFIG
 * } from '../../common/pendingChanges';
 * ```
 */

export type {
	IPendingChangesConfig,
	IPendingFile,
	IPendingFileMetadata,
	IApplyResult,
	PendingChangeSource,
	OnPendingFilesChangedCallback,
	IPendingChangesService
} from './types.js';

export { DEFAULT_PENDING_CONFIG } from './types.js';
