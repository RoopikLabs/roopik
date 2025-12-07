/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import { BundledOutput, BuildMeta } from '../../common/storage/storageTypes.js';
import {
	getWorkspaceAppDataPath,
	getWorkspaceRefPath,
	getCacheCanvasesFolderPath,
	getCacheCanvasPath,
	getCacheComponentsFolderPath,
	getCacheComponentPath,
	getBundlePath,
	getBuildMetaPath
} from './paths.js';

/**
 * App Data Storage
 *
 * Handles all file operations in the app data cache folder:
 * - workspace.json: Reference to original workspace path
 * - canvases/{id}/components/{id}/bundle.js: Bundled code
 * - canvases/{id}/components/{id}/build.json: Build metadata
 *
 * The cache structure mirrors the workspace structure exactly.
 */
export class AppDataStorage {
	private workspacePath: string = '';
	private appDataPath: string = '';
	private initialized: boolean = false;

	// ========================================================================
	// Initialization
	// ========================================================================

	/**
	 * Initialize app data storage
	 * Creates cache folder structure if it doesn't exist
	 */
	async initialize(workspacePath: string): Promise<void> {
		this.workspacePath = workspacePath;
		this.appDataPath = getWorkspaceAppDataPath(workspacePath);

		// Create app data folder structure
		await this.ensureDir(this.appDataPath);

		// Write workspace reference file (for debugging)
		const refPath = getWorkspaceRefPath(workspacePath);
		if (!await this.fileExists(refPath)) {
			await this.writeJson(refPath, {
				workspacePath,
				createdAt: Date.now()
			});
		}

		// Create canvases folder
		const canvasesPath = getCacheCanvasesFolderPath(workspacePath);
		await this.ensureDir(canvasesPath);

		this.initialized = true;
	}

	/**
	 * Check if storage is initialized
	 */
	isInitialized(): boolean {
		return this.initialized;
	}

	/**
	 * Get app data path
	 */
	getAppDataPath(): string {
		return this.appDataPath;
	}

	// ========================================================================
	// Canvas Operations
	// ========================================================================

	/**
	 * Ensure canvas cache folder exists
	 */
	async ensureCanvasCache(canvasId: string): Promise<void> {
		this.ensureInitialized();

		const canvasPath = getCacheCanvasPath(this.workspacePath, canvasId);
		await this.ensureDir(canvasPath);

		const componentsPath = getCacheComponentsFolderPath(this.workspacePath, canvasId);
		await this.ensureDir(componentsPath);
	}

	/**
	 * Delete canvas cache
	 */
	async deleteCanvasCache(canvasId: string): Promise<void> {
		this.ensureInitialized();

		const canvasPath = getCacheCanvasPath(this.workspacePath, canvasId);
		await this.removeDir(canvasPath);
	}

	// ========================================================================
	// Bundle Cache Operations
	// ========================================================================

	/**
	 * Save bundled code to cache
	 */
	async saveBundleCache(
		canvasId: string,
		componentId: string,
		bundle: BundledOutput
	): Promise<void> {
		this.ensureInitialized();

		// Ensure component cache folder exists
		const componentPath = getCacheComponentPath(this.workspacePath, canvasId, componentId);
		await this.ensureDir(componentPath);

		// Write bundle.js
		const bundlePath = getBundlePath(this.workspacePath, canvasId, componentId);
		await this.writeFile(bundlePath, bundle.bundledCode);

		// Write build.json
		const buildMetaPath = getBuildMetaPath(this.workspacePath, canvasId, componentId);
		await this.writeJson(buildMetaPath, bundle.buildMeta);
	}

	/**
	 * Load bundled code from cache
	 */
	async loadBundleCache(
		canvasId: string,
		componentId: string
	): Promise<BundledOutput | null> {
		this.ensureInitialized();

		const bundlePath = getBundlePath(this.workspacePath, canvasId, componentId);
		const buildMetaPath = getBuildMetaPath(this.workspacePath, canvasId, componentId);

		try {
			// Both files must exist
			if (!await this.fileExists(bundlePath) || !await this.fileExists(buildMetaPath)) {
				return null;
			}

			const bundledCode = await this.readFile(bundlePath);
			const buildMeta = await this.readJson<BuildMeta>(buildMetaPath);

			return {
				bundledCode,
				buildMeta
			};
		} catch {
			return null;
		}
	}

	/**
	 * Check if cache is valid for given source hash
	 */
	async isCacheValid(
		canvasId: string,
		componentId: string,
		sourceHash: string
	): Promise<boolean> {
		this.ensureInitialized();

		const buildMetaPath = getBuildMetaPath(this.workspacePath, canvasId, componentId);

		try {
			if (!await this.fileExists(buildMetaPath)) {
				return false;
			}

			const buildMeta = await this.readJson<BuildMeta>(buildMetaPath);
			return buildMeta.sourceHash === sourceHash;
		} catch {
			return false;
		}
	}

	/**
	 * Invalidate cache for a component
	 */
	async invalidateCache(canvasId: string, componentId: string): Promise<void> {
		this.ensureInitialized();

		const componentPath = getCacheComponentPath(this.workspacePath, canvasId, componentId);
		await this.removeDir(componentPath);
	}

	/**
	 * Get cache path for a component
	 */
	getCachePath(canvasId: string, componentId: string): string {
		return getCacheComponentPath(this.workspacePath, canvasId, componentId);
	}

	// ========================================================================
	// Private Helpers
	// ========================================================================

	private ensureInitialized(): void {
		if (!this.initialized) {
			throw new Error('AppDataStorage not initialized. Call initialize() first.');
		}
	}

	private async ensureDir(dirPath: string): Promise<void> {
		await fs.promises.mkdir(dirPath, { recursive: true });
	}

	private async removeDir(dirPath: string): Promise<void> {
		try {
			await fs.promises.rm(dirPath, { recursive: true, force: true });
		} catch {
			// Ignore if already deleted
		}
	}

	private async fileExists(filePath: string): Promise<boolean> {
		try {
			await fs.promises.access(filePath, fs.constants.F_OK);
			return true;
		} catch {
			return false;
		}
	}

	private async readFile(filePath: string): Promise<string> {
		return fs.promises.readFile(filePath, 'utf-8');
	}

	private async writeFile(filePath: string, content: string): Promise<void> {
		// Ensure parent directory exists
		await this.ensureDir(path.dirname(filePath));
		await fs.promises.writeFile(filePath, content, 'utf-8');
	}

	private async readJson<T>(filePath: string): Promise<T> {
		const content = await this.readFile(filePath);
		return JSON.parse(content) as T;
	}

	private async writeJson<T>(filePath: string, data: T): Promise<void> {
		const content = JSON.stringify(data, null, 2);
		await this.writeFile(filePath, content);
	}
}
