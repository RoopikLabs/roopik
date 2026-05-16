/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Storage Module - Electron Main Process
 *
 * Exports the storage service implementation and utilities.
 */

// Main Service
export { RoopikStorageService } from './storageService.js';

// Sub-modules (for advanced use cases)
export { WorkspaceStorage } from './workspaceStorage.js';
export { AppDataStorage } from './appDataStorage.js';

// Path utilities
export * from './paths.js';
