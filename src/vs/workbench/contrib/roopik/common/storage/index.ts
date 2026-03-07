/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Storage Module - Public API
 *
 * Export all storage types and interfaces for use by other modules.
 */

// Runtime values
export { DEFAULT_WORKSPACE_CONFIG } from './storageTypes.js';

// Types (type-only re-exports)
export type {
	Framework,
	BundledOutput,
	BuildMeta,
	CanvasInfo,
	CanvasRegistry,
	ComponentReference,
	CanvasFile,
	BuildState,
	WorkspaceConfig
} from './storageTypes.js';

// Service Interface (runtime value via createDecorator)
export { IRoopikStorageService } from './storageService.js';
