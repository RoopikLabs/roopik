/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Component Loader
 *
 * Handles loading existing components when a canvas is reopened.
 * Responsible for:
 * - Checking if cached bundle exists and is valid (hash comparison)
 * - Loading cached bundle directly if valid
 * - Triggering rebuild via manager if cache is invalid/missing
 *
 * This keeps canvasPanel.ts simple - it just detects components and delegates
 * the loading logic here.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { Logger } from './logger';
import type { RoopikExtensionManager } from './roopikExtensionManager';

// ============================================================================
// Types
// ============================================================================

/**
 * Cached bundle data (matches Core's BundledOutput)
 */
export interface CachedBundle {
	bundledCode: string;
	buildMeta: {
		componentId: string;
		canvasId: string;
		contentHash: string;
		cdnUrls: string[];
		buildTime: number;
		bundleSize: number;
		builtAt: number;
	};
}

/**
 * Result of loading a component
 */
export interface LoadResult {
	success: boolean;
	fromCache: boolean;
	bundledCode?: string;
	cdnUrls?: string[];
	buildTime?: number;
	bundleSize?: number;
	error?: string;
}

/**
 * Component info from index.json needed for loading
 */
export interface ComponentLoadInfo {
	componentId: string;
	contentHash: string;
	name?: string;
	folderPath?: string;
	entryFile?: string;
}

// ============================================================================
// Cache Path Helpers (mirrors Core's paths.ts)
// ============================================================================

/**
 * Get the app data base path (cross-platform)
 * Windows: %APPDATA%/roopik/
 * macOS: ~/Library/Application Support/roopik/
 * Linux: ~/.config/roopik/
 */
function getAppDataBasePath(): string {
	const platform = process.platform;

	if (platform === 'win32') {
		const appData = process.env.APPDATA;
		if (appData) {
			return path.join(appData, 'roopik');
		}
		return path.join(os.homedir(), 'AppData', 'Roaming', 'roopik');
	}

	if (platform === 'darwin') {
		return path.join(os.homedir(), 'Library', 'Application Support', 'roopik');
	}

	// Linux and others
	const xdgConfig = process.env.XDG_CONFIG_HOME;
	if (xdgConfig) {
		return path.join(xdgConfig, 'roopik');
	}
	return path.join(os.homedir(), '.config', 'roopik');
}

/**
 * Generate workspace hash (same as Core)
 */
function getWorkspaceHash(workspacePath: string): string {
	const normalized = path.normalize(workspacePath).toLowerCase();
	return crypto.createHash('sha256')
		.update(normalized)
		.digest('hex')
		.substring(0, 12);
}

/**
 * Get bundle.js path in cache
 */
function getBundlePath(workspacePath: string, canvasId: string, componentId: string): string {
	const hash = getWorkspaceHash(workspacePath);
	return path.join(
		getAppDataBasePath(),
		'workspaces',
		hash,
		'canvases',
		canvasId,
		'components',
		componentId,
		'bundle.js'
	);
}

/**
 * Get build.json path in cache
 */
function getBuildMetaPath(workspacePath: string, canvasId: string, componentId: string): string {
	const hash = getWorkspaceHash(workspacePath);
	return path.join(
		getAppDataBasePath(),
		'workspaces',
		hash,
		'canvases',
		canvasId,
		'components',
		componentId,
		'build.json'
	);
}

// ============================================================================
// Component Loader Class
// ============================================================================

export class ComponentLoader {
	private readonly logger: ReturnType<typeof Logger.prototype.createScoped>;
	private readonly workspacePath: string;
	private readonly manager: RoopikExtensionManager;

	constructor(workspacePath: string, manager: RoopikExtensionManager) {
		this.workspacePath = workspacePath;
		this.manager = manager;
		this.logger = Logger.getInstance().createScoped('ComponentLoader');
	}

	/**
	 * Load an existing component - checks cache first, rebuilds if needed
	 *
	 * @param canvasId - Canvas ID
	 * @param componentId - Component ID
	 * @param contentHash - Current content hash from workspace index.json
	 * @returns LoadResult with cached bundle or indication that rebuild was triggered
	 */
	async loadExistingComponent(
		canvasId: string,
		componentId: string,
		contentHash: string
	): Promise<LoadResult> {
		this.logger.debug(`Loading component: ${componentId} (hash: ${contentHash})`);

		try {
			// 1. Try to load cached bundle
			const cached = await this.loadCachedBundle(canvasId, componentId);

			if (cached) {
				// 2. Validate cache freshness by comparing hashes
				if (cached.buildMeta.contentHash === contentHash) {
					// Cache is valid!
					// this.logger.info(`Cache hit for ${componentId} - using cached bundle`);
					return {
						success: true,
						fromCache: true,
						bundledCode: cached.bundledCode,
						cdnUrls: cached.buildMeta.cdnUrls,
						buildTime: cached.buildMeta.buildTime,
						bundleSize: cached.buildMeta.bundleSize
					};
				} else {
					// Cache is stale - hashes don't match
					this.logger.info(`Cache stale for ${componentId} - hash mismatch (cached: ${cached.buildMeta.contentHash}, current: ${contentHash})`);
				}
			} else {
				this.logger.info(`No cache found for ${componentId}`);
			}

			// 3. Cache miss or stale - trigger rebuild
			this.logger.info(`Triggering rebuild for ${componentId}`);
			await this.manager.rebuildComponent(componentId);

			return {
				success: true,
				fromCache: false
				// Build result will come via onComponentBuilt event
			};

		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.logger.error(`Failed to load component ${componentId}: ${errorMessage}`);

			// Silent recovery - trigger rebuild
			try {
				this.logger.info(`Attempting rebuild after load failure for ${componentId}`);
				await this.manager.rebuildComponent(componentId);
				return {
					success: true,
					fromCache: false
				};
			} catch (rebuildError) {
				const rebuildErrorMessage = rebuildError instanceof Error ? rebuildError.message : String(rebuildError);
				this.logger.error(`Rebuild also failed for ${componentId}: ${rebuildErrorMessage}`);
				return {
					success: false,
					fromCache: false,
					error: rebuildErrorMessage
				};
			}
		}
	}

	/**
	 * Load cached bundle from app data
	 * Returns null if cache doesn't exist or is corrupted
	 */
	private async loadCachedBundle(
		canvasId: string,
		componentId: string
	): Promise<CachedBundle | null> {
		const bundlePath = getBundlePath(this.workspacePath, canvasId, componentId);
		const buildMetaPath = getBuildMetaPath(this.workspacePath, canvasId, componentId);

		try {
			// Check if both files exist
			if (!fs.existsSync(bundlePath) || !fs.existsSync(buildMetaPath)) {
				return null;
			}

			// Read bundle.js
			const bundledCode = fs.readFileSync(bundlePath, 'utf-8');

			// Read build.json
			const buildMetaContent = fs.readFileSync(buildMetaPath, 'utf-8');
			const buildMeta = JSON.parse(buildMetaContent);

			this.logger.debug(`Loaded cached bundle: ${componentId} (${bundledCode.length} bytes)`);

			return {
				bundledCode,
				buildMeta
			};

		} catch (error) {
			this.logger.warn(`Failed to read cache for ${componentId}: ${error}`);
			return null;
		}
	}

	/**
	 * Check if cache exists (quick check without loading)
	 */
	cacheExists(canvasId: string, componentId: string): boolean {
		const bundlePath = getBundlePath(this.workspacePath, canvasId, componentId);
		const buildMetaPath = getBuildMetaPath(this.workspacePath, canvasId, componentId);
		return fs.existsSync(bundlePath) && fs.existsSync(buildMetaPath);
	}

	/**
	 * Get cache paths for debugging
	 */
	getCachePaths(canvasId: string, componentId: string): { bundlePath: string; buildMetaPath: string } {
		return {
			bundlePath: getBundlePath(this.workspacePath, canvasId, componentId),
			buildMetaPath: getBuildMetaPath(this.workspacePath, canvasId, componentId)
		};
	}
}
