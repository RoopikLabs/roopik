/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Storage Module - Public API
 *
 * Export all storage types and interfaces for use by other modules.
 */

// Types
export {
	SourceFiles,
	ComponentMeta,
	ComponentSource,
	SourceInfo,
	Framework,
	BundledOutput,
	BuildMeta,
	CanvasInfo,
	CanvasIndex,
	ComponentIndexEntry,
	ComponentIndex,
	BuildState,
	WorkspaceConfig,
	DEFAULT_WORKSPACE_CONFIG
} from './storageTypes.js';

// Service Interface
export {
	IRoopikStorageService
} from './storageService.js';
