/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Component Auto-Detection Utilities
 *
 * Plugin-based detectors for:
 * - Entry file detection (index.tsx, index.ts, {folderName}.tsx, etc.)
 * - Framework detection (react, vue, svelte, solid, preact, unknown)
 *
 * These run during addComponent ingestion when optional fields are missing.
 */

import * as crypto from 'crypto';
import * as path from 'path';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import {
	IComponentService,
	ComponentCreatedEvent,
	ComponentBuildEvent,
	ComponentDeletedEvent,
	ComponentUpdatedEvent
} from '../../common/component/componentService.js';
import {
	Component,
	AddComponentRequest
} from '../../common/component/types.js';
import { ComponentReference } from '../../common/storage/storageTypes.js';
import { IRoopikStorageService } from '../../common/storage/storageService.js';
import { IBuildService } from '../../common/build/buildService.js';
import { IFileWatcher, FileChangeEvent } from '../../common/watch/fileWatcher.js';
import { BuildQueue, BuildRequest, QueueBuildResult } from './buildQueue.js';
import { getBundlePath } from '../storage/paths.js';
import { detectEntryFile, detectFramework } from './detectors.js';
import { computeContentHashFromFolder } from '../../common/hash/contentHash.js';
import { loadSourceFiles } from '../../common/source/sourceLoader.js';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a unique component ID
 */
function generateComponentId(): string {
	return crypto.randomBytes(8).toString('hex');
}

/**
 * Check if folder path exists (basic validation)
 */
async function folderExists(folderPath: string): Promise<boolean> {
	// For now, just check if path is absolute and looks valid
	// In production, would use IFileService to check actual existence
	return path.isAbsolute(folderPath) && folderPath.length > 0;
}

// ============================================================================
// Component Service Implementation
// ============================================================================

export class ComponentService extends Disposable implements IComponentService {
	readonly _serviceBrand: undefined;

	// ========================================================================
	// Dependencies
	// ========================================================================

	private readonly storageService: IRoopikStorageService;
	private readonly buildService: IBuildService;
	private readonly fileWatcher: IFileWatcher;

	// ========================================================================
	// State
	// ========================================================================

	/** In-memory component registry: id → Component */
	private readonly components = new Map<string, Component>();

	/** Build queue for async builds */
	private readonly buildQueue: BuildQueue;

	/** Workspace path (stored for future use) */
	private _workspacePath: string = '';

	/** Initialization state */
	private initialized: boolean = false;

	// ========================================================================
	// Events
	// ========================================================================

	private readonly _onComponentCreated = this._register(new Emitter<ComponentCreatedEvent>());
	readonly onComponentCreated: Event<ComponentCreatedEvent> = this._onComponentCreated.event;

	private readonly _onComponentBuilt = this._register(new Emitter<ComponentBuildEvent>());
	readonly onComponentBuilt: Event<ComponentBuildEvent> = this._onComponentBuilt.event;

	private readonly _onComponentDeleted = this._register(new Emitter<ComponentDeletedEvent>());
	readonly onComponentDeleted: Event<ComponentDeletedEvent> = this._onComponentDeleted.event;

	private readonly _onComponentUpdated = this._register(new Emitter<ComponentUpdatedEvent>());
	readonly onComponentUpdated: Event<ComponentUpdatedEvent> = this._onComponentUpdated.event;

	// ========================================================================
	// Constructor
	// ========================================================================

	constructor(
		storageService: IRoopikStorageService,
		buildService: IBuildService,
		fileWatcher: IFileWatcher
	) {
		super();

		this.storageService = storageService;
		this.buildService = buildService;
		this.fileWatcher = fileWatcher;

		// Create build queue with concurrency limit
		this.buildQueue = this._register(new BuildQueue(3));

		// Set build executor
		this.buildQueue.setExecutor((request) => this.executeBuild(request));

		// Forward build queue results to our events
		this._register(this.buildQueue.onBuildComplete((result) => {
			this.handleBuildComplete(result);
		}));

		// Listen to file watcher events
		this._register(this.fileWatcher.onFileChanged((event) => {
			this.handleFileChange(event);
		}));
	}

	// ========================================================================
	// Lifecycle
	// ========================================================================

	async initialize(workspacePath: string): Promise<void> {
		if (this.initialized) {
			console.warn('[ComponentService] Already initialized');
			return;
		}

		this._workspacePath = workspacePath;
		// console.log('[ComponentService] Workspace path:', this._workspacePath);

		// Initialize storage if not already initialized
		if (!this.storageService.isInitialized()) {
			// console.log('[ComponentService] Initializing storage service...');
			await this.storageService.initialize(workspacePath);
			console.log('[ComponentService] Storage service initialized');
		}

		// Load all components from storage
		await this.loadAllComponents();

		// Start file watcher
		this.fileWatcher.setWorkspacePath(workspacePath);
		this.fileWatcher.start();

		this.initialized = true;
		console.log('[ComponentService] Initialized');
	}

	isInitialized(): boolean {
		return this.initialized;
	}

	override dispose(): void {
		this.fileWatcher.stop();
		this.components.clear();
		super.dispose();
	}

	// ========================================================================
	// Create
	// ========================================================================

	async addComponent(request: AddComponentRequest): Promise<Component> {
		this.ensureInitialized();

		// 1. Validate folder path
		if (!await folderExists(request.folderPath)) {
			throw new Error(`ComponentService: Folder not found: ${request.folderPath}`);
		}

		// 2. Get or create canvas ID
		const canvasId = request.canvasId || await this.storageService.getActiveCanvasId();
		if (!canvasId) {
			throw new Error('ComponentService: No canvas specified and no active canvas');
		}

		// 3. Auto-detect entry file if not provided
		let entryFile = request.entryFile;
		if (!entryFile) {
			console.log(`[ComponentService] Auto-detecting entry file for ${request.name}...`);
			try {
				entryFile = await detectEntryFile(request.folderPath);
			} catch (error) {
				throw new Error(`ComponentService: Could not auto-detect entry file: ${error}`);
			}
		}

		// 4. Auto-detect framework if not provided
		let framework = request.framework;
		if (!framework) {
			console.log(`[ComponentService] Auto-detecting framework for ${request.name}...`);
			try {
				const entryFilePath = path.join(request.folderPath, entryFile);
				framework = await detectFramework(entryFilePath);
			} catch (error) {
				console.warn(`[ComponentService] Framework detection failed:`, error);
				framework = 'unknown';
			}
		}

		// 5. Compute content hash from all files in folder
		// This is critical for cache validation and detecting changes
		// Uses defensive hashing - never fails, always returns a hash
		console.log(`[ComponentService] Computing content hash for ${request.name}...`);
		const hashResult = await computeContentHashFromFolder(request.folderPath);
		const { hash: contentHash, filesHashed, filesSkipped, bytesHashed, warnings } = hashResult;

		// Log hash computation results
		console.log(`[ComponentService] Hash computed: ${contentHash} (${filesHashed} files, ${bytesHashed} bytes)`);
		if (filesSkipped > 0) {
			console.warn(`[ComponentService] ⚠️  Skipped ${filesSkipped} files due to read errors`);
		}
		if (warnings.length > 0) {
			console.warn(`[ComponentService] Hash warnings:`, warnings);
		}

		// 6. Generate component ID
		const componentId = generateComponentId();
		const now = Date.now();

		// 7. Create ComponentReference (metadata-only, stored in canvas file)
		const reference: ComponentReference = {
			name: request.name,
			folderPath: request.folderPath,
			entryFile,
			framework: framework || 'unknown',
			position: { x: 0, y: 0, zIndex: 0 },
			buildState: { status: 'building' },
			contentHash, // Store computed hash for later comparison
			origin: request.origin,
			createdAt: now,
			updatedAt: now
		};

		// 8. Save reference to canvas file (atomic)
		await this.storageService.addComponentReference(canvasId, componentId, reference);

		// 9. Create Component object for in-memory registry
		const component: Component = {
			id: componentId,
			name: request.name,
			canvasId,
			folderPath: request.folderPath,
			entryFile,
			framework: framework || 'unknown',
			buildState: { status: 'building' },
			contentHash, // Include computed hash
			origin: request.origin,
			createdAt: now,
			updatedAt: now
		};

		// 10. Add to in-memory registry
		this.components.set(componentId, component);

		// 11. Emit created event
		this._onComponentCreated.fire({ component });

		console.log(`[ComponentService] ✅ Component added: ${componentId} (${request.name})`);
		console.log(`   folderPath: ${request.folderPath}`);
		console.log(`   entryFile: ${entryFile}`);
		console.log(`   framework: ${framework}`);
		console.log(`   contentHash: ${contentHash}`);

		// 12. Register folder watcher for original location
		try {
			this.fileWatcher.registerFolderWatch(componentId, request.folderPath, canvasId);
			console.log(`[ComponentService] Registered folder watch for ${componentId}`);
		} catch (error) {
			console.warn(`[ComponentService] Could not register folder watch:`, error);
		}

		// 13. Queue build (async, result via event)
		this.buildQueue.enqueue({
			componentId,
			canvasId,
			trigger: 'create',
			priority: 'high',
			createdAt: now
		});

		return component;
	}

	// ========================================================================
	// Read
	// ========================================================================

	getComponent(id: string): Component | undefined {
		return this.components.get(id);
	}

	getComponentsForCanvas(canvasId: string): Component[] {
		return Array.from(this.components.values())
			.filter(c => c.canvasId === canvasId);
	}

	getAllComponents(): Component[] {
		return Array.from(this.components.values());
	}

	// ========================================================================
	// Build
	// ========================================================================

	async rebuildComponent(id: string): Promise<void> {
		this.ensureInitialized();

		const component = this.components.get(id);
		if (!component) {
			throw new Error(`ComponentService: Component not found: ${id}`);
		}

		// Update state
		component.buildState = { status: 'building' };

		// Queue build
		this.buildQueue.enqueue({
			componentId: id,
			canvasId: component.canvasId,
			trigger: 'rebuild',
			priority: 'high',
			createdAt: Date.now()
		});
	}

	async rebuildAllInCanvas(canvasId: string): Promise<void> {
		this.ensureInitialized();

		const components = this.getComponentsForCanvas(canvasId);
		for (const component of components) {
			await this.rebuildComponent(component.id);
		}
	}

	isBuilding(id: string): boolean {
		return this.buildQueue.isBuilding(id);
	}

	getBuildQueueSize(): number {
		return this.buildQueue.getSize();
	}

	// ========================================================================
	// Delete
	// ========================================================================

	async deleteComponent(id: string): Promise<void> {
		this.ensureInitialized();

		const component = this.components.get(id);
		if (!component) {
			throw new Error(`ComponentService: Component not found: ${id}`);
		}

		// Cancel any pending builds
		this.buildQueue.cancel(id);

		// Unregister folder watch
		try {
			this.fileWatcher.unregisterFolderWatch(id);
			console.log(`[ComponentService] Unregistered folder watch for ${id}`);
		} catch (error) {
			console.warn(`[ComponentService] Could not unregister folder watch:`, error);
		}

		// Delete from storage
		await this.storageService.deleteComponent(component.canvasId, id);

		// Remove from memory
		this.components.delete(id);

		// Emit event
		this._onComponentDeleted.fire({
			componentId: id,
			canvasId: component.canvasId
		});
	}

	// ========================================================================
	// File Watcher Control
	// ========================================================================

	pauseFileWatcher(): void {
		this.fileWatcher.pause();
	}

	resumeFileWatcher(): void {
		this.fileWatcher.resume();
	}

	ignoreComponentFileChanges(id: string): void {
		this.fileWatcher.ignoreComponent(id);
	}

	unignoreComponentFileChanges(id: string): void {
		this.fileWatcher.unignoreComponent(id);
	}

	// ========================================================================
	// Internal: Build Execution
	// ========================================================================

	/**
	 * Execute a build (called by BuildQueue)
	 */
	private async executeBuild(request: BuildRequest): Promise<QueueBuildResult> {
		const { componentId, canvasId, trigger } = request;
		const startTime = Date.now();
		console.log(`[ComponentService] 🔨 Build started: ${componentId} (trigger: ${trigger})`);

		try {
			// Get component
			const component = this.components.get(componentId);
			if (!component) {
				return {
					componentId,
					canvasId,
					success: false,
					errorInfo: {
						message: 'Component not found',
						errors: [{ message: 'Component not found', category: 'unknown' }],
						buildTime: 0
					},
					trigger
				};
			}

			// Step 1: Load source files from original folderPath
			console.log(`[ComponentService] Loading source files from: ${component.folderPath}`);
			const sourceResult = await loadSourceFiles(component.folderPath);

			if (sourceResult.filesLoaded === 0) {
				return {
					componentId,
					canvasId,
					success: false,
					errorInfo: {
						message: 'No source files found in component folder',
						errors: [{ message: `Folder: ${component.folderPath}`, category: 'unknown' }],
						buildTime: Date.now() - startTime
					},
					trigger
				};
			}

			console.log(`[ComponentService] Loaded ${sourceResult.filesLoaded} files (${(sourceResult.bytesLoaded / 1024).toFixed(2)}KB)`);
			if (sourceResult.warnings.length > 0) {
				console.warn(`[ComponentService] Source load warnings:`, sourceResult.warnings);
			}

			// Step 2: Build component using buildService
			const buildOutput = await this.buildService.build({
				id: componentId,
				files: sourceResult.files,
				entryFile: component.entryFile,
				framework: component.framework,
				dependencies: {} // NOTE: Could read from package.json in future if needed
			});

			console.log(`[ComponentService] Build completed: ${buildOutput.bundleSize} bytes in ${buildOutput.buildTime}ms`);

			// Step 3: Save bundle to cache
			await this.storageService.saveBundleCache(canvasId, componentId, {
				bundledCode: buildOutput.bundledCode,
				buildMeta: {
					componentId,
					canvasId,
					sourceHash: component.contentHash || '', // Will update with new hash below
					cdnUrls: buildOutput.cdnUrls,
					buildTime: buildOutput.buildTime,
					bundleSize: buildOutput.bundleSize,
					builtAt: Date.now()
				}
			});

			// Step 4: Compute content hash AFTER successful build
			console.log(`[ComponentService] Computing content hash for validation...`);
			const hashResult = await computeContentHashFromFolder(component.folderPath);
			console.log(`[ComponentService] Hash computed: ${hashResult.hash} (${hashResult.filesHashed} files, ${(hashResult.bytesHashed / 1024).toFixed(2)}KB)`);

			// Step 5: Update component metadata
			component.buildState = { status: 'ready' };
			component.contentHash = hashResult.hash;
			component.framework = buildOutput.framework; // In case it was detected during build
			component.updatedAt = Date.now();

			// Step 6: Persist to storage
			await this.storageService.updateComponentReference(canvasId, componentId, {
				buildState: component.buildState,
				contentHash: component.contentHash,
				framework: component.framework,
				updatedAt: component.updatedAt
			});

			// Step 7: Return success
			return {
				componentId,
				canvasId,
				success: true,
				trigger
			};

		} catch (error) {
			const buildTime = Date.now() - startTime;

			// Parse error into structured format
			const errorInfo = this.parseError(error, buildTime);

			// Update component state to error
			const component = this.components.get(componentId);
			if (component) {
				component.buildState = { status: 'error', error: errorInfo.message };
				await this.storageService.updateComponentReference(canvasId, componentId, {
					buildState: component.buildState,
					updatedAt: Date.now()
				});
			}

			return {
				componentId,
				canvasId,
				success: false,
				errorInfo,
				trigger
			};
		}
	}

	/**
	 * Parse error into structured BuildErrorInfo
	 */
	private parseError(error: unknown, buildTime: number): NonNullable<QueueBuildResult['errorInfo']> {
		const message = error instanceof Error ? error.message : String(error);

		// Check if this is an ESBuild error (has errors array)
		if (error && typeof error === 'object' && 'errors' in error && Array.isArray((error as { errors: unknown[] }).errors)) {
			const esbuildError = error as { errors: Array<{ text: string; location?: { file: string; line: number; column: number; length?: number; lineText?: string }; notes?: Array<{ text: string }> }> };

			return {
				message: esbuildError.errors[0]?.text || message,
				errors: esbuildError.errors.map(e => ({
					message: e.text,
					category: this.categorizeError(e.text) as 'syntax' | 'type' | 'import' | 'transform' | 'unknown',
					location: e.location ? {
						file: e.location.file,
						line: e.location.line,
						column: e.location.column,
						length: e.location.length,
						lineText: e.location.lineText
					} : undefined,
					notes: e.notes?.map(n => n.text)
				})),
				buildTime
			};
		}

		// Generic error
		return {
			message,
			errors: [{
				message,
				category: 'unknown',
				stack: error instanceof Error ? error.stack : undefined
			}],
			buildTime
		};
	}

	/**
	 * Categorize error by message content
	 */
	private categorizeError(message: string): string {
		const lowerMessage = message.toLowerCase();

		if (lowerMessage.includes('syntax') || lowerMessage.includes('unexpected token') || lowerMessage.includes('parsing')) {
			return 'syntax';
		}
		if (lowerMessage.includes('type') || lowerMessage.includes('cannot assign')) {
			return 'type';
		}
		if (lowerMessage.includes('import') || lowerMessage.includes('module') || lowerMessage.includes('resolve')) {
			return 'import';
		}
		if (lowerMessage.includes('transform') || lowerMessage.includes('jsx') || lowerMessage.includes('tsx')) {
			return 'transform';
		}

		return 'unknown';
	}

	/**
	 * Handle build completion from queue
	 */
	private handleBuildComplete(result: QueueBuildResult): void {
		const event: ComponentBuildEvent = {
			componentId: result.componentId,
			canvasId: result.canvasId,
			success: result.success,
			trigger: result.trigger
		};

		if (result.success) {
			// Success: include build stats and bundle path (Extension reads file directly)
			const bundlePath = getBundlePath(this._workspacePath, result.canvasId, result.componentId);
			event.result = {
				cdnUrls: result.cdnUrls || [],
				buildTime: result.buildTime || 0,
				bundleSize: result.bundleSize || 0,
				bundlePath
			};
		} else {
			// Failure: include structured error info
			event.errorInfo = result.errorInfo ? {
				message: result.errorInfo.message,
				errors: result.errorInfo.errors,
				buildTime: result.errorInfo.buildTime
			} : {
				message: 'Unknown build error',
				errors: [{ message: 'Unknown build error', category: 'unknown' }],
				buildTime: 0
			};
		}

		this._onComponentBuilt.fire(event);

		if (result.success) {
			console.log(`[ComponentService] Build succeeded: ${result.componentId} (${result.buildTime}ms, ${result.bundleSize} bytes)`);
		} else {
			console.error(`[ComponentService] Build failed: ${result.componentId} - ${result.errorInfo?.message}`);
		}
	}

	// ========================================================================
	// Internal: File Watcher
	// ========================================================================

	/**
	 * Handle file change event from FileWatcher
	 */
	private handleFileChange(event: FileChangeEvent): void {
		const { canvasId, componentId, file, changeType } = event;

		console.log(`[ComponentService] File changed: ${changeType} ${file} in ${componentId}`);

		// Find component
		const component = this.components.get(componentId);
		if (!component) {
			console.warn(`[ComponentService] Component not found for file change: ${componentId}`);
			return;
		}

		// Update component state
		component.buildState = { status: 'building' };
		component.updatedAt = Date.now();

		// Queue rebuild with normal priority (file watcher triggered)
		this.buildQueue.enqueue({
			componentId,
			canvasId,
			trigger: 'file-change',
			priority: 'normal',
			createdAt: Date.now()
		});
	}

	// ========================================================================
	// Internal: Helpers
	// ========================================================================

	/**
	 * Load all components from storage on startup
	 */
	private async loadAllComponents(): Promise<void> {
		const canvases = await this.storageService.getCanvases();

		for (const canvas of canvases) {
			const canvasFile = await this.storageService.loadCanvasFile(canvas.id);
			if (!canvasFile) {
				console.warn(`[ComponentService] Could not load canvas file: ${canvas.id}`);
				continue;
			}

			// Load each component reference
			for (const [componentId, reference] of Object.entries(canvasFile.components)) {
				const ref = reference as ComponentReference;
				const component: Component = {
					id: componentId,
					name: ref.name,
					canvasId: canvas.id,
					folderPath: ref.folderPath,
					entryFile: ref.entryFile,
					framework: ref.framework,
					buildState: ref.buildState,
					contentHash: ref.contentHash,
					origin: ref.origin,
					createdAt: ref.createdAt,
					updatedAt: ref.updatedAt
				};

				this.components.set(componentId, component);

				// Register folder watch for this component
				try {
					this.fileWatcher.registerFolderWatch(componentId, ref.folderPath, canvas.id);
				} catch (error) {
					console.warn(`[ComponentService] Could not register watch for ${componentId}:`, error);
				}
			}
		}

		console.log(`[ComponentService] Loaded ${this.components.size} components`);
	}

	/**
	 * Ensure service is initialized
	 */
	private ensureInitialized(): void {
		if (!this.initialized) {
			throw new Error('ComponentService: Not initialized. Call initialize() first.');
		}
	}

	// ========================================================================
	// Component Data Access
	// ========================================================================

	/**
	 * Get component source code
	 * Loads from original folderPath
	 */
	async getComponentSource(id: string): Promise<Record<string, string>> {
		this.ensureInitialized();
		const component = this.components.get(id);
		if (!component) {
			throw new Error(`Component not found: ${id}`);
		}
		const result = await loadSourceFiles(component.folderPath);
		return result.files;
	}

	/**
	 * Get bundled code
	 * Loads from cache
	 */
	async getBundledCode(id: string): Promise<string> {
		this.ensureInitialized();
		const component = this.components.get(id);
		if (!component) {
			throw new Error(`Component not found: ${id}`);
		}
		const bundle = await this.storageService.loadBundleCache(component.canvasId, id);
		if (!bundle) {
			throw new Error(`Bundle not found for component: ${id}`);
		}
		return bundle.bundledCode;
	}

	/**
	 * Get CDN URLs
	 * Loads from cache metadata
	 */
	async getCdnUrls(id: string): Promise<string[]> {
		this.ensureInitialized();
		const component = this.components.get(id);
		if (!component) {
			throw new Error(`Component not found: ${id}`);
		}
		const bundle = await this.storageService.loadBundleCache(component.canvasId, id);
		if (!bundle) {
			return [];
		}
		return bundle.buildMeta.cdnUrls || [];
	}

	/**
	 * Update component source
	 * NOTE: Not implemented - use VS Code's native file editing instead
	 * We don't write to original component folders from the service
	 */
	async updateComponentSource(id: string, files: Record<string, string>): Promise<void> {
		this.ensureInitialized();
		throw new Error('ComponentService: updateComponentSource not supported - edit files directly in VS Code');
	}

	/**
	 * Update component metadata
	 * Updates name in canvas file
	 */
	async updateComponentMeta(id: string, updates: { name?: string }): Promise<void> {
		this.ensureInitialized();
		const component = this.components.get(id);
		if (!component) {
			throw new Error(`Component not found: ${id}`);
		}
		if (updates.name) {
			component.name = updates.name;
			component.updatedAt = Date.now();
			await this.storageService.updateComponentReference(component.canvasId, id, {
				name: updates.name,
				updatedAt: component.updatedAt
			});
			this._onComponentUpdated.fire({ component, changes: ['name'] });
		}
	}
}
