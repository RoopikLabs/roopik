/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

/**
 * Storage Path Utilities
 *
 * Provides cross-platform path resolution for:
 * - Workspace storage (.roopik/)
 * - App data storage (cache)
 */

// ============================================================================
// Constants
// ============================================================================

/** Roopik folder name in workspace */
export const ROOPIK_FOLDER = '.roopik';

/** Canvases subfolder */
export const CANVASES_FOLDER = 'canvases';

/** Components subfolder */
export const COMPONENTS_FOLDER = 'components';

/** Projects subfolder (for Mode 2 - Browser Preview) */
export const PROJECTS_FOLDER = 'projects';

/** Project registry file name */
export const PROJECT_REGISTRY_FILE = 'projects.json';

/** Config file name */
export const CONFIG_FILE = 'config.json';

/** Canvas registry file name (list of all canvases) */
export const CANVAS_REGISTRY_FILE = 'canvases.json';

/** Bundle cache file name */
export const BUNDLE_FILE = 'bundle.js';

/** Build metadata file name */
export const BUILD_META_FILE = 'build.json';

/** Canvas layout file name (written by extension) */
export const CANVAS_LAYOUT_FILE = 'canvas.json';

// ============================================================================
// Workspace Paths
// ============================================================================

/**
 * Get the .roopik folder path for a workspace
 */
export function getWorkspaceRoopikPath(workspaceRoot: string): string {
	return path.join(workspaceRoot, ROOPIK_FOLDER);
}

/**
 * Get the config file path
 */
export function getConfigPath(workspaceRoot: string): string {
	return path.join(getWorkspaceRoopikPath(workspaceRoot), CONFIG_FILE);
}

/**
 * Get the canvases folder path
 */
export function getCanvasesFolderPath(workspaceRoot: string): string {
	return path.join(getWorkspaceRoopikPath(workspaceRoot), CANVASES_FOLDER);
}

/**
 * Get the canvas registry file path (.roopik/canvases.json)
 */
export function getCanvasRegistryPath(workspaceRoot: string): string {
	return path.join(getWorkspaceRoopikPath(workspaceRoot), CANVAS_REGISTRY_FILE);
}

/**
 * Get a specific canvas file path (.roopik/canvases/{id}.json)
 */
export function getCanvasPath(workspaceRoot: string, canvasId: string): string {
	return path.join(getCanvasesFolderPath(workspaceRoot), `${canvasId}.json`);
}

// ============================================================================
// App Data Paths (Cache)
// ============================================================================

/**
 * Get the app data base path (cross-platform)
 *
 * Windows: %APPDATA%/roopik/
 * macOS: ~/Library/Application Support/roopik/
 * Linux: ~/.config/roopik/
 */
export function getAppDataBasePath(): string {
	const platform = process.platform;

	if (platform === 'win32') {
		// Windows: use APPDATA environment variable
		const appData = process.env.APPDATA;
		if (appData) {
			return path.join(appData, 'roopik');
		}
		// Fallback to user profile
		return path.join(os.homedir(), 'AppData', 'Roaming', 'roopik');
	}

	if (platform === 'darwin') {
		// macOS: ~/Library/Application Support/roopik/
		return path.join(os.homedir(), 'Library', 'Application Support', 'roopik');
	}

	// Linux and others: ~/.config/roopik/
	const xdgConfig = process.env.XDG_CONFIG_HOME;
	if (xdgConfig) {
		return path.join(xdgConfig, 'roopik');
	}
	return path.join(os.homedir(), '.config', 'roopik');
}

/**
 * Generate a consistent hash for a workspace path
 * Used to create unique cache folders per workspace
 */
export function getWorkspaceHash(workspacePath: string): string {
	// Normalize path for consistent hashing
	const normalized = path.normalize(workspacePath).toLowerCase();

	// Create a short hash (first 12 chars of SHA256)
	const hash = crypto.createHash('sha256')
		.update(normalized)
		.digest('hex')
		.substring(0, 12);

	return hash;
}

/**
 * Get the app data path for a specific workspace
 */
export function getWorkspaceAppDataPath(workspacePath: string): string {
	const hash = getWorkspaceHash(workspacePath);
	return path.join(getAppDataBasePath(), 'workspaces', hash);
}

/**
 * Get the workspace reference file path in app data
 * This file contains the original workspace path for debugging
 */
export function getWorkspaceRefPath(workspacePath: string): string {
	return path.join(getWorkspaceAppDataPath(workspacePath), 'workspace.json');
}

/**
 * Get the cache folder for canvases in app data
 */
export function getCacheCanvasesFolderPath(workspacePath: string): string {
	return path.join(getWorkspaceAppDataPath(workspacePath), CANVASES_FOLDER);
}

/**
 * Get the cache folder for a specific canvas
 */
export function getCacheCanvasPath(workspacePath: string, canvasId: string): string {
	return path.join(getCacheCanvasesFolderPath(workspacePath), canvasId);
}

/**
 * Get the cache folder for components in a canvas
 */
export function getCacheComponentsFolderPath(workspacePath: string, canvasId: string): string {
	return path.join(getCacheCanvasPath(workspacePath, canvasId), COMPONENTS_FOLDER);
}

/**
 * Get the cache folder for a specific component
 */
export function getCacheComponentPath(workspacePath: string, canvasId: string, componentId: string): string {
	return path.join(getCacheComponentsFolderPath(workspacePath, canvasId), componentId);
}

/**
 * Get the bundle file path in cache
 */
export function getBundlePath(workspacePath: string, canvasId: string, componentId: string): string {
	return path.join(getCacheComponentPath(workspacePath, canvasId, componentId), BUNDLE_FILE);
}

/**
 * Get the build metadata file path in cache
 */
export function getBuildMetaPath(workspacePath: string, canvasId: string, componentId: string): string {
	return path.join(getCacheComponentPath(workspacePath, canvasId, componentId), BUILD_META_FILE);
}

// ============================================================================
// Project Paths (Mode 2 - Browser Preview)
// ============================================================================

/**
 * Get the projects folder path (.roopik/projects/)
 */
export function getProjectsFolderPath(workspaceRoot: string): string {
	return path.join(getWorkspaceRoopikPath(workspaceRoot), PROJECTS_FOLDER);
}

/**
 * Get the project registry file path (.roopik/projects/projects.json)
 */
export function getProjectRegistryPath(workspaceRoot: string): string {
	return path.join(getProjectsFolderPath(workspaceRoot), PROJECT_REGISTRY_FILE);
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Ensure path uses forward slashes (for consistency in storage)
 */
export function normalizeToForwardSlash(p: string): string {
	return p.replace(/\\/g, '/');
}

/**
 * Get relative path from workspace root
 */
export function getRelativePath(workspaceRoot: string, absolutePath: string): string {
	return path.relative(workspaceRoot, absolutePath);
}
