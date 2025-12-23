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
	Framework,
	BundledOutput,
	BuildMeta,
	CanvasInfo,
	CanvasRegistry,
	ComponentReference,
	CanvasFile,
	BuildState,
	WorkspaceConfig,
	DEFAULT_WORKSPACE_CONFIG
} from './storageTypes.js';

// Service Interface
export {
	IRoopikStorageService
} from './storageService.js';
