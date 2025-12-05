/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import { Logger } from '../logger';
import { BundleCacheService } from './BundleCacheService';
import { SourceFileWatcher } from './SourceFileWatcher';
import { CoreBridgeService } from './CoreBridgeService';
import { CanvasPanel } from '../canvasPanel';
import {
	WORKSPACE_ROOT,
	CANVASES_DIR,
	COMPONENTS_DIR,
	COMPONENT_META_FILE,
	SOURCE_EXTENSIONS
} from '../constants';

/**
 * Component metadata from component.json
 */
interface ComponentMeta {
	id: string;
	framework: 'react' | 'vue' | 'svelte' | 'solid' | 'preact' | 'html';
	entryFile: string;
	files: string[];
	dependencies?: Record<string, string>;
	source?: string;
}

/**
 * ComponentRebuildService
 *
 * Orchestrates the rebuild flow when source files change:
 * 1. FileWatcher detects change
 * 2. This service computes hash and checks cache
 * 3. If cache invalid, triggers Core rebuild via PATH
 * 4. Caches result and notifies webview
 *
 * Architecture:
 * - Extension sends component PATH to Core (not file content)
 * - Core reads files from disk and builds
 * - Extension receives bundle and caches it
 */
export class ComponentRebuildService {
	private static instance: ComponentRebuildService;
	private logger: ReturnType<typeof Logger.prototype.createScoped>;
	private workspaceRoot: string | undefined;

	// Services
	private cacheService: BundleCacheService;
	private coreBridge: CoreBridgeService;

	private constructor() {
		this.logger = Logger.getInstance().createScoped('ComponentRebuildService');
		this.cacheService = BundleCacheService.getInstance();
		this.coreBridge = CoreBridgeService.getInstance();
	}

	/**
	 * Get singleton instance
	 */
	public static getInstance(): ComponentRebuildService {
		if (!ComponentRebuildService.instance) {
			ComponentRebuildService.instance = new ComponentRebuildService();
		}
		return ComponentRebuildService.instance;
	}

	/**
	 * Initialize with workspace root and connect to FileWatcher
	 */
	public initialize(workspaceRoot: string): void {
		this.workspaceRoot = workspaceRoot;

		// Connect to FileWatcher
		const fileWatcher = SourceFileWatcher.getInstance();

		fileWatcher.onComponentChange(this.handleComponentChange.bind(this));
		fileWatcher.onComponentDelete(this.handleComponentDelete.bind(this));

		this.logger.info('ComponentRebuildService initialized', { workspaceRoot });
	}

	/**
	 * Handle component source file change
	 */
	private async handleComponentChange(
		canvasName: string,
		componentId: string,
		_changedFile: string
	): Promise<void> {
		this.logger.debug('Component change detected', { canvasName, componentId });

		try {
			// 1. Read all source files for this component
			const sourceFiles = await this.readComponentSourceFiles(canvasName, componentId);
			if (!sourceFiles || Object.keys(sourceFiles).length === 0) {
				this.logger.warn('No source files found for component', { canvasName, componentId });
				return;
			}

			// 2. Compute hash of source files
			const currentHash = this.cacheService.computeSourceHash(sourceFiles);

			// 3. Check if cache is valid
			const cacheValid = await this.cacheService.isCacheValid(canvasName, componentId, currentHash);

			if (cacheValid) {
				this.logger.debug('Cache still valid, skipping rebuild', { canvasName, componentId });
				return;
			}

			// 4. Cache invalid - trigger rebuild
			this.logger.info('Cache invalid, triggering rebuild', { canvasName, componentId });

			// 5. Get component metadata
			const meta = await this.readComponentMeta(canvasName, componentId);

			// 6. Build component via Core
			// TODO: Use buildFromPath when Core supports it (send path, not content)
			// For now, we send the file content using existing buildComponent
			const result = await this.coreBridge.buildComponent({
				id: componentId,
				source: 'user',
				framework: meta?.framework || this.detectFramework(sourceFiles),
				files: sourceFiles,
				entryFile: meta?.entryFile || this.findEntryFile(sourceFiles),
				dependencies: meta?.dependencies || {}
			});

			// 7. Cache the result
			await this.cacheService.saveBundle(
				canvasName,
				componentId,
				result.bundledCode,
				currentHash,
				result.framework,
				result.cdnUrls || []
			);

			// 8. Notify open canvas webview
			this.notifyCanvasWebview(canvasName, componentId, result);

			this.logger.info('Component rebuilt successfully', {
				canvasName,
				componentId,
				bundleSize: result.bundledCode.length
			});

		} catch (error) {
			this.logger.error('Component rebuild failed', { canvasName, componentId, error });
		}
	}

	/**
	 * Handle component deletion
	 */
	private async handleComponentDelete(
		canvasName: string,
		componentId: string
	): Promise<void> {
		this.logger.info('Component deleted, clearing cache', { canvasName, componentId });

		// Clear cache for this component
		await this.cacheService.deleteBundle(canvasName, componentId);

		// Notify webview that component was deleted
		// (Webview should handle this by removing the sandbox)
	}

	/**
	 * Force rebuild a component (bypass cache check)
	 */
	public async forceRebuild(canvasName: string, componentId: string): Promise<void> {
		this.logger.info('Force rebuild requested', { canvasName, componentId });

		try {
			// Read source files
			const sourceFiles = await this.readComponentSourceFiles(canvasName, componentId);
			if (!sourceFiles || Object.keys(sourceFiles).length === 0) {
				throw new Error('No source files found');
			}

			// Compute hash
			const currentHash = this.cacheService.computeSourceHash(sourceFiles);

			// Get metadata
			const meta = await this.readComponentMeta(canvasName, componentId);

			// Build via Core
			const result = await this.coreBridge.buildComponent({
				id: componentId,
				source: 'user',
				framework: meta?.framework || this.detectFramework(sourceFiles),
				files: sourceFiles,
				entryFile: meta?.entryFile || this.findEntryFile(sourceFiles),
				dependencies: meta?.dependencies || {}
			});

			// Cache result
			await this.cacheService.saveBundle(
				canvasName,
				componentId,
				result.bundledCode,
				currentHash,
				result.framework,
				result.cdnUrls || []
			);

			// Notify webview
			this.notifyCanvasWebview(canvasName, componentId, result);

			this.logger.info('Force rebuild completed', { canvasName, componentId });

		} catch (error) {
			this.logger.error('Force rebuild failed', { canvasName, componentId, error });
			throw error;
		}
	}

	// ============================================
	// File Reading Helpers
	// ============================================

	/**
	 * Read all source files for a component
	 */
	private async readComponentSourceFiles(
		canvasName: string,
		componentId: string
	): Promise<Record<string, string> | undefined> {
		if (!this.workspaceRoot) return undefined;

		const componentPath = path.join(
			this.workspaceRoot,
			WORKSPACE_ROOT,
			CANVASES_DIR,
			canvasName,
			COMPONENTS_DIR,
			componentId
		);

		try {
			const componentUri = vscode.Uri.file(componentPath);
			const entries = await vscode.workspace.fs.readDirectory(componentUri);

			const files: Record<string, string> = {};

			for (const [name, type] of entries) {
				if (type !== vscode.FileType.File) continue;

				// Skip metadata files
				if (name === COMPONENT_META_FILE) continue;

				// Only include source files
				const ext = path.extname(name).toLowerCase();
				if (!SOURCE_EXTENSIONS.includes(ext)) continue;

				// Read file content
				const fileUri = vscode.Uri.joinPath(componentUri, name);
				const content = await vscode.workspace.fs.readFile(fileUri);
				files[name] = Buffer.from(content).toString('utf8');
			}

			return files;
		} catch (error) {
			this.logger.error('Failed to read component source files', { componentPath, error });
			return undefined;
		}
	}

	/**
	 * Read component.json metadata
	 */
	private async readComponentMeta(
		canvasName: string,
		componentId: string
	): Promise<ComponentMeta | undefined> {
		if (!this.workspaceRoot) return undefined;

		const metaPath = path.join(
			this.workspaceRoot,
			WORKSPACE_ROOT,
			CANVASES_DIR,
			canvasName,
			COMPONENTS_DIR,
			componentId,
			COMPONENT_META_FILE
		);

		try {
			const metaUri = vscode.Uri.file(metaPath);
			const content = await vscode.workspace.fs.readFile(metaUri);
			return JSON.parse(Buffer.from(content).toString('utf8')) as ComponentMeta;
		} catch {
			// Metadata file doesn't exist - will auto-detect
			return undefined;
		}
	}

	// ============================================
	// Detection Helpers
	// ============================================

	/**
	 * Detect framework from source files
	 */
	private detectFramework(files: Record<string, string>): 'react' | 'vue' | 'svelte' | 'html' {
		const filenames = Object.keys(files);

		for (const filename of filenames) {
			const ext = path.extname(filename).toLowerCase();
			if (ext === '.vue') return 'vue';
			if (ext === '.svelte') return 'svelte';
			if (ext === '.tsx' || ext === '.jsx') return 'react';
		}

		// Check content for React imports
		for (const content of Object.values(files)) {
			if (content.includes('import React') || content.includes("from 'react'")) {
				return 'react';
			}
		}

		return 'html';
	}

	/**
	 * Find the entry file from source files
	 */
	private findEntryFile(files: Record<string, string>): string {
		const filenames = Object.keys(files);

		// Priority: index.tsx > index.jsx > first .tsx > first .jsx > first file
		const priorities = ['index.tsx', 'index.jsx', 'index.ts', 'index.js'];

		for (const priority of priorities) {
			if (filenames.includes(priority)) {
				return priority;
			}
		}

		// Find first component file
		for (const filename of filenames) {
			const ext = path.extname(filename).toLowerCase();
			if (['.tsx', '.jsx', '.vue', '.svelte'].includes(ext)) {
				return filename;
			}
		}

		return filenames[0] || 'index.tsx';
	}

	// ============================================
	// Webview Notification
	// ============================================

	/**
	 * Notify canvas webview of rebuilt component
	 */
	private notifyCanvasWebview(
		canvasName: string,
		componentId: string,
		result: { bundledCode: string; cdnUrls?: string[]; framework: string }
	): void {
		// Convert canvas name to slug (same as in extension.ts)
		const canvasSlug = canvasName.toLowerCase()
			.trim()
			.replace(/\s+/g, '-')
			.replace(/[^a-z0-9-]/g, '');

		const panel = CanvasPanel.getPanel(canvasSlug);

		if (panel) {
			panel.postMessage({
				type: 'componentRebuilt',
				payload: {
					componentId,
					bundledCode: result.bundledCode,
					cdnUrls: result.cdnUrls || [],
					framework: result.framework
				}
			});
			this.logger.debug('Notified webview of rebuild', { canvasName, componentId });
		} else {
			this.logger.debug('Canvas not open, skipping notification', { canvasName });
		}
	}
}

