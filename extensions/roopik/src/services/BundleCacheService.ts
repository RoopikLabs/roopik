/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { Logger } from '../logger';
import {
	STORAGE_ROOT,
	CANVASES_DIR,
	COMPONENTS_DIR,
	BUNDLE_FILE,
	BUNDLE_META_FILE,
	HASH_ALGORITHM
} from '../constants';

/**
 * Bundle metadata stored alongside the compiled bundle
 */
export interface BundleMeta {
	/** SHA256 hash of source files at build time */
	sourceHash: string;
	/** Timestamp when bundle was created */
	bundledAt: number;
	/** Framework used for compilation */
	framework: string;
	/** CDN URLs used in the bundle */
	cdnUrls: string[];
	/** Bundle size in bytes */
	size: number;
}

/**
 * Cached bundle data (bundle code + metadata)
 */
export interface CachedBundle {
	/** The compiled bundle code */
	code: string;
	/** Bundle metadata */
	meta: BundleMeta;
}

/**
 * BundleCacheService
 *
 * Manages bundle caching in VS Code storage.
 * Provides methods to save, load, and validate cached bundles.
 *
 * Storage location: context.storageUri/roopik/canvases/{canvas}/components/{component}/
 *
 * This service mirrors the user workspace structure in VS Code storage
 * for easy debugging and cache management.
 */
export class BundleCacheService {
	private static instance: BundleCacheService;
	private storageUri: vscode.Uri | undefined;
	private logger: ReturnType<typeof Logger.prototype.createScoped>;

	private constructor() {
		this.logger = Logger.getInstance().createScoped('BundleCacheService');
	}

	/**
	 * Get singleton instance
	 */
	public static getInstance(): BundleCacheService {
		if (!BundleCacheService.instance) {
			BundleCacheService.instance = new BundleCacheService();
		}
		return BundleCacheService.instance;
	}

	/**
	 * Initialize with VS Code storage URI
	 * Must be called during extension activation with context.storageUri
	 */
	public initialize(storageUri: vscode.Uri | undefined): void {
		if (!storageUri) {
			this.logger.warn('No storage URI provided - caching will be disabled');
			return;
		}
		this.storageUri = storageUri;
		this.logger.info('Initialized with storage URI', { path: storageUri.fsPath });
	}

	/**
	 * Check if caching is available
	 */
	public isAvailable(): boolean {
		return this.storageUri !== undefined;
	}

	// ============================================
	// Path Resolution (Mirrors workspace structure)
	// ============================================

	/**
	 * Get storage path for a component's cache directory
	 */
	private getComponentStoragePath(canvasName: string, componentId: string): vscode.Uri | undefined {
		if (!this.storageUri) return undefined;

		return vscode.Uri.joinPath(
			this.storageUri,
			STORAGE_ROOT,
			CANVASES_DIR,
			canvasName,
			COMPONENTS_DIR,
			componentId
		);
	}

	/**
	 * Get storage path for bundle file
	 */
	private getBundlePath(canvasName: string, componentId: string): vscode.Uri | undefined {
		const componentPath = this.getComponentStoragePath(canvasName, componentId);
		if (!componentPath) return undefined;
		return vscode.Uri.joinPath(componentPath, BUNDLE_FILE);
	}

	/**
	 * Get storage path for bundle metadata file
	 */
	private getBundleMetaPath(canvasName: string, componentId: string): vscode.Uri | undefined {
		const componentPath = this.getComponentStoragePath(canvasName, componentId);
		if (!componentPath) return undefined;
		return vscode.Uri.joinPath(componentPath, BUNDLE_META_FILE);
	}

	// ============================================
	// Hash Computation
	// ============================================

	/**
	 * Compute SHA256 hash of source files
	 *
	 * @param files Record of filename → content
	 * @returns Hash string prefixed with algorithm
	 */
	public computeSourceHash(files: Record<string, string>): string {
		const hash = crypto.createHash(HASH_ALGORITHM);

		// Sort filenames for consistent hashing
		const sortedFilenames = Object.keys(files).sort();

		for (const filename of sortedFilenames) {
			// Include filename in hash (file renames should invalidate cache)
			hash.update(filename);
			hash.update(files[filename]);
		}

		return `${HASH_ALGORITHM}:${hash.digest('hex')}`;
	}

	// ============================================
	// Cache Operations
	// ============================================

	/**
	 * Save bundle to cache
	 *
	 * @param canvasName Canvas identifier
	 * @param componentId Component identifier
	 * @param bundledCode Compiled bundle code
	 * @param sourceHash Hash of source files at build time
	 * @param framework Framework used
	 * @param cdnUrls CDN URLs used in bundle
	 */
	public async saveBundle(
		canvasName: string,
		componentId: string,
		bundledCode: string,
		sourceHash: string,
		framework: string,
		cdnUrls: string[]
	): Promise<boolean> {
		if (!this.isAvailable()) {
			this.logger.warn('Cache not available - skipping save');
			return false;
		}

		try {
			const bundlePath = this.getBundlePath(canvasName, componentId);
			const metaPath = this.getBundleMetaPath(canvasName, componentId);

			if (!bundlePath || !metaPath) {
				return false;
			}

			// Create metadata
			const meta: BundleMeta = {
				sourceHash,
				bundledAt: Date.now(),
				framework,
				cdnUrls,
				size: Buffer.byteLength(bundledCode, 'utf8')
			};

			// Write bundle file
			await vscode.workspace.fs.writeFile(
				bundlePath,
				Buffer.from(bundledCode, 'utf8')
			);

			// Write metadata file
			await vscode.workspace.fs.writeFile(
				metaPath,
				Buffer.from(JSON.stringify(meta, null, '\t'), 'utf8')
			);

			this.logger.debug('Bundle saved to cache', {
				canvas: canvasName,
				component: componentId,
				size: meta.size,
				hash: sourceHash.slice(0, 20) + '...'
			});

			return true;
		} catch (error) {
			this.logger.error('Failed to save bundle to cache', error);
			return false;
		}
	}

	/**
	 * Load bundle from cache
	 *
	 * @param canvasName Canvas identifier
	 * @param componentId Component identifier
	 * @returns Cached bundle or undefined if not found
	 */
	public async loadBundle(
		canvasName: string,
		componentId: string
	): Promise<CachedBundle | undefined> {
		if (!this.isAvailable()) {
			return undefined;
		}

		try {
			const bundlePath = this.getBundlePath(canvasName, componentId);
			const metaPath = this.getBundleMetaPath(canvasName, componentId);

			if (!bundlePath || !metaPath) {
				return undefined;
			}

			// Check if files exist
			try {
				await vscode.workspace.fs.stat(bundlePath);
				await vscode.workspace.fs.stat(metaPath);
			} catch {
				// Files don't exist
				return undefined;
			}

			// Read files
			const bundleData = await vscode.workspace.fs.readFile(bundlePath);
			const metaData = await vscode.workspace.fs.readFile(metaPath);

			const code = Buffer.from(bundleData).toString('utf8');
			const meta = JSON.parse(Buffer.from(metaData).toString('utf8')) as BundleMeta;

			this.logger.debug('Bundle loaded from cache', {
				canvas: canvasName,
				component: componentId,
				age: Date.now() - meta.bundledAt
			});

			return { code, meta };
		} catch (error) {
			this.logger.error('Failed to load bundle from cache', error);
			return undefined;
		}
	}

	/**
	 * Check if cache is valid (hash matches)
	 *
	 * @param canvasName Canvas identifier
	 * @param componentId Component identifier
	 * @param currentSourceHash Current hash of source files
	 * @returns true if cache is valid, false if rebuild needed
	 */
	public async isCacheValid(
		canvasName: string,
		componentId: string,
		currentSourceHash: string
	): Promise<boolean> {
		const cached = await this.loadBundle(canvasName, componentId);

		if (!cached) {
			this.logger.debug('Cache miss - no cached bundle', { canvas: canvasName, component: componentId });
			return false;
		}

		const isValid = cached.meta.sourceHash === currentSourceHash;

		this.logger.debug('Cache validation', {
			canvas: canvasName,
			component: componentId,
			isValid,
			storedHash: cached.meta.sourceHash.slice(0, 20) + '...',
			currentHash: currentSourceHash.slice(0, 20) + '...'
		});

		return isValid;
	}

	/**
	 * Delete cached bundle for a component
	 *
	 * @param canvasName Canvas identifier
	 * @param componentId Component identifier
	 */
	public async deleteBundle(
		canvasName: string,
		componentId: string
	): Promise<boolean> {
		if (!this.isAvailable()) {
			return false;
		}

		try {
			const componentPath = this.getComponentStoragePath(canvasName, componentId);
			if (!componentPath) return false;

			await vscode.workspace.fs.delete(componentPath, { recursive: true });
			this.logger.debug('Bundle deleted from cache', { canvas: canvasName, component: componentId });
			return true;
		} catch (error) {
			// Ignore if doesn't exist
			return false;
		}
	}

	/**
	 * Delete all cached bundles for a canvas
	 *
	 * @param canvasName Canvas identifier
	 */
	public async deleteCanvasCache(canvasName: string): Promise<boolean> {
		if (!this.isAvailable()) {
			return false;
		}

		try {
			const canvasPath = vscode.Uri.joinPath(
				this.storageUri!,
				STORAGE_ROOT,
				CANVASES_DIR,
				canvasName
			);

			await vscode.workspace.fs.delete(canvasPath, { recursive: true });
			this.logger.info('Canvas cache deleted', { canvas: canvasName });
			return true;
		} catch (error) {
			// Ignore if doesn't exist
			return false;
		}
	}

	/**
	 * Clear all cached bundles (for current workspace)
	 *
	 * @returns Number of bytes freed
	 */
	public async clearAllCache(): Promise<{ filesDeleted: number; bytesFreed: number }> {
		if (!this.isAvailable()) {
			return { filesDeleted: 0, bytesFreed: 0 };
		}

		try {
			const rootPath = vscode.Uri.joinPath(this.storageUri!, STORAGE_ROOT);

			// Calculate size before deletion
			const stats = await this.getCacheStats();

			await vscode.workspace.fs.delete(rootPath, { recursive: true });

			this.logger.info('All cache cleared', stats);
			return stats;
		} catch (error) {
			// Ignore if doesn't exist
			return { filesDeleted: 0, bytesFreed: 0 };
		}
	}

	/**
	 * Get cache statistics
	 *
	 * @returns Total files and bytes in cache
	 */
	public async getCacheStats(): Promise<{ filesDeleted: number; bytesFreed: number }> {
		if (!this.isAvailable()) {
			return { filesDeleted: 0, bytesFreed: 0 };
		}

		try {
			const rootPath = vscode.Uri.joinPath(this.storageUri!, STORAGE_ROOT);
			return await this.calculateDirectorySize(rootPath);
		} catch {
			return { filesDeleted: 0, bytesFreed: 0 };
		}
	}

	/**
	 * Recursively calculate directory size
	 */
	private async calculateDirectorySize(
		uri: vscode.Uri
	): Promise<{ filesDeleted: number; bytesFreed: number }> {
		let filesDeleted = 0;
		let bytesFreed = 0;

		try {
			const entries = await vscode.workspace.fs.readDirectory(uri);

			for (const [name, type] of entries) {
				const entryUri = vscode.Uri.joinPath(uri, name);

				if (type === vscode.FileType.Directory) {
					const subStats = await this.calculateDirectorySize(entryUri);
					filesDeleted += subStats.filesDeleted;
					bytesFreed += subStats.bytesFreed;
				} else if (type === vscode.FileType.File) {
					const stat = await vscode.workspace.fs.stat(entryUri);
					filesDeleted++;
					bytesFreed += stat.size;
				}
			}
		} catch {
			// Directory doesn't exist or can't be read
		}

		return { filesDeleted, bytesFreed };
	}
}

