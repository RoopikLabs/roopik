/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Component Service Implementation
 *
 * Main orchestrator for component operations. Coordinates:
 * - ImportService: Import components from various sources
 * - BuildService: Bundle source files
 * - StorageService: Save/load from disk
 * - FileWatcher: React to file changes
 * - BuildQueue: Deduplicate and limit concurrent builds
 *
 * This is the primary entry point for component operations.
 */

import * as crypto from 'crypto';
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
	CreateComponentRequest
} from '../../common/component/types.js';
import { ComponentMeta, ComponentIndexEntry } from '../../common/storage/storageTypes.js';
import { IRoopikStorageService } from '../../common/storage/storageService.js';
import { IBuildService, BuildInput, BuildOutput } from '../../common/build/buildService.js';
import { IImportService } from '../../common/import/importService.js';
import { IFileWatcher, FileChangeEvent } from '../../common/watch/fileWatcher.js';
import { BuildQueue, BuildRequest, QueueBuildResult } from './buildQueue.js';

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
 * Compute hash of source files for cache invalidation
 */
function computeContentHash(files: Record<string, string>): string {
	const hash = crypto.createHash('sha256');
	// Sort keys for deterministic hash
	const sortedKeys = Object.keys(files).sort();
	for (const key of sortedKeys) {
		hash.update(key);
		hash.update(files[key]);
	}
	return hash.digest('hex').substring(0, 16);
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
	private readonly importService: IImportService;
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
		importService: IImportService,
		fileWatcher: IFileWatcher
	) {
		super();

		this.storageService = storageService;
		this.buildService = buildService;
		this.importService = importService;
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
		console.log('[ComponentService] Workspace path:', this._workspacePath);

		// Initialize storage
		await this.storageService.initialize(workspacePath);

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

	async createComponent(request: CreateComponentRequest): Promise<Component> {
		this.ensureInitialized();

		// 1. Resolve canvas ID
		const canvasId = request.canvasId || await this.storageService.getActiveCanvasId();
		if (!canvasId) {
			throw new Error('ComponentService: No canvas specified and no active canvas');
		}

		// 2. Import files via ImportService
		const importResult = await this.importService.import(request.sourceData);

		// 3. Generate component ID
		const componentId = generateComponentId();

		// 4. Compute content hash
		const contentHash = computeContentHash(importResult.files);

		// 5. Determine framework (request override > detected)
		const framework = request.framework || importResult.framework;

		// 6. Merge dependencies
		const dependencies = {
			...importResult.dependencies,
			...request.dependencies
		};

		// 7. Pause file watcher for this component during write
		this.fileWatcher.ignoreComponent(componentId);

		try {
			// 8. Save source files to workspace
			const storagePath = await this.storageService.saveComponentSource(
				canvasId,
				componentId,
				importResult.files
			);

			// 9. Create metadata
			const now = Date.now();
			const meta: ComponentMeta = {
				id: componentId,
				name: request.name,
				source: request.source,
				sourceInfo: importResult.sourceInfo,
				entryFile: importResult.entryFile,
				files: Object.keys(importResult.files),
				framework,
				dependencies,
				contentHash,
				createdAt: now,
				updatedAt: now
			};

			// 10. Save metadata
			await this.storageService.saveComponentMeta(canvasId, componentId, meta);

			// 11. Create Component object
			const component: Component = {
				id: componentId,
				name: request.name,
				canvasId,
				source: request.source,
				sourceInfo: importResult.sourceInfo,
				storagePath,
				entryFile: importResult.entryFile,
				files: Object.keys(importResult.files),
				framework,
				dependencies,
				buildState: { status: 'building' },
				contentHash,
				createdAt: now,
				updatedAt: now
			};

			// 12. Update component index
			await this.storageService.updateComponentIndex(canvasId, componentId, {
				name: component.name,
				framework: component.framework,
				source: component.source,
				entryFile: component.entryFile,
				buildState: component.buildState,
				contentHash: component.contentHash,
				createdAt: component.createdAt,
				updatedAt: component.updatedAt
			});

			// 13. Add to in-memory registry
			this.components.set(componentId, component);

			// 14. Emit created event
			this._onComponentCreated.fire({ component });

			// 15. Queue build (async, result via event)
			this.buildQueue.enqueue({
				componentId,
				canvasId,
				trigger: 'create',
				priority: 'high',
				createdAt: now
			});

			return component;

		} finally {
			// 16. Resume file watcher for this component
			this.fileWatcher.unignoreComponent(componentId);
		}
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
	// Code Access
	// ========================================================================

	async getComponentSource(id: string): Promise<Record<string, string>> {
		this.ensureInitialized();

		const component = this.components.get(id);
		if (!component) {
			throw new Error(`ComponentService: Component not found: ${id}`);
		}

		return this.storageService.loadComponentSource(component.canvasId, id);
	}

	async getBundledCode(id: string): Promise<string> {
		this.ensureInitialized();

		const component = this.components.get(id);
		if (!component) {
			throw new Error(`ComponentService: Component not found: ${id}`);
		}

		const cached = await this.storageService.loadBundleCache(component.canvasId, id);
		if (!cached) {
			throw new Error(`ComponentService: Component not built yet: ${id}`);
		}

		return cached.bundledCode;
	}

	async getCdnUrls(id: string): Promise<string[]> {
		this.ensureInitialized();

		const component = this.components.get(id);
		if (!component) {
			throw new Error(`ComponentService: Component not found: ${id}`);
		}

		const cached = await this.storageService.loadBundleCache(component.canvasId, id);
		if (!cached) {
			throw new Error(`ComponentService: Component not built yet: ${id}`);
		}

		return cached.buildMeta.cdnUrls;
	}

	// ========================================================================
	// Update
	// ========================================================================

	async updateComponentSource(id: string, files: Record<string, string>): Promise<void> {
		this.ensureInitialized();

		const component = this.components.get(id);
		if (!component) {
			throw new Error(`ComponentService: Component not found: ${id}`);
		}

		// Pause file watcher during write
		this.fileWatcher.ignoreComponent(id);

		try {
			// Save files
			await this.storageService.saveComponentSource(component.canvasId, id, files);

			// Update component state
			const now = Date.now();
			const contentHash = computeContentHash(files);
			component.files = Object.keys(files);
			component.contentHash = contentHash;
			component.updatedAt = now;
			component.buildState = { status: 'building' };

			// Update metadata
			const meta = await this.storageService.loadComponentMeta(component.canvasId, id);
			if (meta) {
				meta.files = component.files;
				meta.contentHash = contentHash;
				meta.updatedAt = now;
				await this.storageService.saveComponentMeta(component.canvasId, id, meta);
			}

			// Update index
			await this.updateComponentIndex(component);

			// Queue rebuild
			this.buildQueue.enqueue({
				componentId: id,
				canvasId: component.canvasId,
				trigger: 'update',
				priority: 'high',
				createdAt: now
			});

		} finally {
			this.fileWatcher.unignoreComponent(id);
		}
	}

	async updateComponentMeta(id: string, updates: { name?: string }): Promise<void> {
		this.ensureInitialized();

		const component = this.components.get(id);
		if (!component) {
			throw new Error(`ComponentService: Component not found: ${id}`);
		}

		const changes: ('name' | 'source')[] = [];

		if (updates.name && updates.name !== component.name) {
			component.name = updates.name;
			changes.push('name');
		}

		if (changes.length === 0) {
			return;
		}

		// Update metadata
		const meta = await this.storageService.loadComponentMeta(component.canvasId, id);
		if (meta) {
			if (updates.name) meta.name = updates.name;
			meta.updatedAt = Date.now();
			await this.storageService.saveComponentMeta(component.canvasId, id, meta);
		}

		// Update index
		await this.updateComponentIndex(component);

		// Emit event
		this._onComponentUpdated.fire({ component, changes });
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

		// Invalidate cache
		await this.storageService.invalidateCache(component.canvasId, id);

		// Update state
		component.buildState = { status: 'building' };
		await this.updateComponentIndex(component);

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

			// Load source files
			const files = await this.storageService.loadComponentSource(canvasId, componentId);

			// Build
			const buildInput: BuildInput = {
				id: componentId,
				files,
				entryFile: component.entryFile,
				framework: component.framework,
				dependencies: component.dependencies
			};

			const buildOutput: BuildOutput = await this.buildService.build(buildInput);

			// Save to cache
			await this.storageService.saveBundleCache(canvasId, componentId, {
				bundledCode: buildOutput.bundledCode,
				buildMeta: {
					componentId,
					canvasId,
					sourceHash: component.contentHash,
					cdnUrls: buildOutput.cdnUrls,
					buildTime: buildOutput.buildTime,
					bundleSize: buildOutput.bundleSize,
					builtAt: Date.now()
				}
			});

			// Update component state
			component.buildState = { status: 'ready' };
			component.dependencies = buildOutput.resolvedDependencies;
			await this.updateComponentIndex(component);

			return {
				componentId,
				canvasId,
				success: true,
				cdnUrls: buildOutput.cdnUrls,
				buildTime: Date.now() - startTime,
				bundleSize: buildOutput.bundleSize,
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
				await this.updateComponentIndex(component);
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
			// Success: include build stats (but not bundledCode - too large)
			event.result = {
				cdnUrls: result.cdnUrls || [],
				buildTime: result.buildTime || 0,
				bundleSize: result.bundleSize || 0
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
	 * Ensure service is initialized
	 */
	private ensureInitialized(): void {
		if (!this.initialized) {
			throw new Error('ComponentService: Not initialized. Call initialize() first.');
		}
	}

	/**
	 * Load all components from storage on startup
	 */
	private async loadAllComponents(): Promise<void> {
		const canvases = await this.storageService.getCanvases();

		for (const canvas of canvases) {
			const index = await this.storageService.getComponentIndex(canvas.id);

			for (const [componentId, entry] of Object.entries(index.components)) {
				// Load full metadata
				const meta = await this.storageService.loadComponentMeta(canvas.id, componentId);
				if (!meta) {
					console.warn(`[ComponentService] Missing metadata for component: ${componentId}`);
					continue;
				}

				// Create Component object
				const component: Component = {
					id: componentId,
					name: meta.name,
					canvasId: canvas.id,
					source: meta.source,
					sourceInfo: meta.sourceInfo,
					storagePath: this.storageService.getComponentPath(canvas.id, componentId),
					entryFile: meta.entryFile,
					files: meta.files,
					framework: meta.framework,
					dependencies: meta.dependencies,
					buildState: entry.buildState,
					contentHash: meta.contentHash,
					createdAt: meta.createdAt,
					updatedAt: meta.updatedAt
				};

				this.components.set(componentId, component);
			}
		}

		console.log(`[ComponentService] Loaded ${this.components.size} components`);
	}

	/**
	 * Update component index entry
	 */
	private async updateComponentIndex(component: Component): Promise<void> {
		const entry: ComponentIndexEntry = {
			name: component.name,
			framework: component.framework,
			source: component.source,
			entryFile: component.entryFile,
			buildState: component.buildState,
			contentHash: component.contentHash,
			createdAt: component.createdAt,
			updatedAt: component.updatedAt
		};

		await this.storageService.updateComponentIndex(component.canvasId, component.id, entry);
	}
}
