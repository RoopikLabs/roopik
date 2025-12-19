/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Storage Constants
 *
 * Centralized configuration for all storage paths and behaviors.
 * Modify these to change storage locations without touching business logic.
 */

// ============================================
// User Workspace Paths (Monitored by FileWatcher)
// ============================================

/** Root folder name in user workspace */
export const WORKSPACE_ROOT = 'roopik-workspace';

/** Canvases directory name */
export const CANVASES_DIR = 'canvases';

/** Components directory name (inside each canvas) */
export const COMPONENTS_DIR = 'components';

// ============================================
// File Names
// ============================================

/** Canvas metadata file */
export const CANVAS_META_FILE = 'canvas.meta.json';

/** Component metadata file */
export const COMPONENT_META_FILE = 'component.json';

/** Bundle output file (in VS Code storage) */
export const BUNDLE_FILE = 'bundle.js';

/** Bundle metadata file (in VS Code storage) */
export const BUNDLE_META_FILE = 'bundle.meta.json';

// ============================================
// VS Code Storage
// ============================================

/** Root folder name in VS Code storage */
export const STORAGE_ROOT = 'roopik';

// ============================================
// File Extensions
// ============================================

/** Source file extensions to watch and bundle */
export const SOURCE_EXTENSIONS = [
	'.tsx',
	'.jsx',
	'.vue',
	'.svelte',
	'.ts',
	'.js',
	'.css'
];

/** Component entry file extensions (in priority order) */
export const ENTRY_FILE_EXTENSIONS = [
	'.tsx',
	'.jsx',
	'.vue',
	'.svelte',
	'.ts',
	'.js'
];

// ============================================
// Behavior Configuration
// ============================================

/** Debounce time for file watcher (ms) */
export const FILE_WATCHER_DEBOUNCE_MS = 500;

/** Build timeout (ms) */
export const BUILD_TIMEOUT_MS = 30000;

/** Hash algorithm for source file comparison */
export const HASH_ALGORITHM = 'sha256';

// ============================================
// Path Builders
// ============================================

/**
 * Build workspace path for a canvas
 */
export function getCanvasPath(canvasName: string): string {
	return `${WORKSPACE_ROOT}/${CANVASES_DIR}/${canvasName}`;
}

/**
 * Build workspace path for a component
 */
export function getComponentPath(canvasName: string, componentName: string): string {
	return `${WORKSPACE_ROOT}/${CANVASES_DIR}/${canvasName}/${COMPONENTS_DIR}/${componentName}`;
}

/**
 * Build file watcher glob pattern
 */
export function getFileWatcherPattern(): string {
	const extensions = SOURCE_EXTENSIONS.map(ext => ext.slice(1)).join(',');
	return `${WORKSPACE_ROOT}/${CANVASES_DIR}/**/*.{${extensions}}`;
}

