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
import * as path from '../../../../../base/common/path.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ILoggerService } from '../../../../../platform/log/common/log.js';
import { getRoopikLogger } from '../../common/roopikLogger.js';
import {
	IComponentService,
	ComponentCreatedEvent,
	ComponentBuildEvent,
	ComponentDeletedEvent,
	ComponentUpdatedEvent
} from '../../common/component/componentService.js';
import {
	Component,
	AddComponentRequest,
	ComponentInfo,
	BuildErrorInfo
} from '../../common/component/types.js';
import { ComponentReference } from '../../common/storage/storageTypes.js';
import { IRoopikStorageService } from '../../common/storage/storageService.js';
import { IBuildService } from '../../common/build/buildService.js';
import { ICanvasService } from '../../common/canvas/canvasService.js';
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
 * Generate a human-readable component ID
 * Format: {sanitized-name}_{2-char-alphanumeric}
 * Example: "Button_a3", "UserProfile_x7"
 *
 * This makes IDs interpretable by AI agents and users while avoiding duplicates.
 */
function generateComponentId(componentName: string): string {
	// Sanitize component name: lowercase, replace non-alphanumeric with hyphen, trim
	const sanitized = componentName
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')  // Replace non-alphanumeric sequences with hyphen
		.replace(/^-+|-+$/g, '')       // Trim leading/trailing hyphens
		.substring(0, 30);             // Limit length

	// Generate 2-char alphanumeric suffix (a-z, 0-9 = 36 chars, 36^2 = 1296 combinations)
	const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
	const randomBytes = crypto.randomBytes(2);
	const suffix = chars[randomBytes[0] % 36] + chars[randomBytes[1] % 36];

	return `${sanitized || 'component'}_${suffix}`;
}

/**
 * Check if folder path exists
 */
async function folderExists(folderPath: string): Promise<boolean> {
	try {
		const fs = await import('fs');
		const stats = await fs.promises.stat(folderPath);
		return stats.isDirectory();
	} catch {
		return false;
	}
}

/**
 * Get list of files in a folder (non-recursive, just immediate children)
 */
async function getFolderContents(folderPath: string): Promise<string[]> {
	try {
		const fs = await import('fs');
		const entries = await fs.promises.readdir(folderPath, { withFileTypes: true });
		// Return only files, not directories
		return entries
			.filter(entry => entry.isFile())
			.map(entry => entry.name);
	} catch {
		return [];
	}
}

// ============================================================================
// Component Service Implementation
// ============================================================================

export class ComponentService extends Disposable implements IComponentService {
	readonly _serviceBrand: undefined;

	// ========================================================================
	// Dependencies
	// ========================================================================

	private readonly logger;
	private readonly storageService: IRoopikStorageService;
	private readonly buildService: IBuildService;
	private readonly canvasService: ICanvasService;
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
		@ILoggerService loggerService: ILoggerService,
		storageService: IRoopikStorageService,
		buildService: IBuildService,
		canvasService: ICanvasService,
		fileWatcher: IFileWatcher
	) {
		super();

		this.logger = getRoopikLogger(loggerService, 'COMPONENT');
		this.storageService = storageService;
		this.buildService = buildService;
		this.canvasService = canvasService;
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
			this.logger.warn('Already initialized');
			return;
		}

		this._workspacePath = workspacePath;

		if (!this.storageService.isInitialized()) {
			await this.storageService.initialize(workspacePath);
		}

		await this.loadAllComponents();

		this.fileWatcher.setWorkspacePath(workspacePath);
		this.fileWatcher.start();

		this.initialized = true;
		this.logger.info('Initialized', { componentCount: this.components.size });
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

		// ====================================================================
		// PIPELINE STEP 1: Smart Path Parsing
		// ====================================================================
		// Handles both file paths and folder paths flexibly:
		// - Full file path (C:\project\src\Button.tsx) → Extract folder + entry file
		// - Folder path only (C:\project\src\Button\) → Auto-detect entry file later
		//
		// This supports:
		// - UI file picker (user selects a file)
		// - AI agents passing folder paths
		// - AI agents passing file paths (if they know the entry file)
		let folderPath = request.folderPath;
		let entryFile = request.entryFile;

		// Check if folderPath actually contains a file (has extension)
		const pathParts = folderPath.split(/[\\/]/);
		const lastPart = pathParts[pathParts.length - 1];
		const hasExtension = /\.[a-zA-Z0-9]+$/.test(lastPart);

		if (hasExtension && !entryFile) {
			// folderPath contains a file - extract folder and entry file
			const fileName = pathParts.pop()!;
			folderPath = pathParts.join(path.sep);
			entryFile = fileName;
		}

		// ====================================================================
		// PIPELINE STEP 2: Folder Validation
		// ====================================================================
		// 2a. Check folder exists
		if (!await folderExists(folderPath)) {
			throw new Error(`ComponentService: Folder not found: ${folderPath}`);
		}

		// 2b. Check folder is not empty (has at least one file)
		const folderContents = await getFolderContents(folderPath);
		if (folderContents.length === 0) {
			throw new Error(`ComponentService: Folder is empty: ${folderPath}`);
		}

		// ====================================================================
		// PIPELINE STEP 3: File Type Validation
		// ====================================================================
		// Supported component file extensions
		const SUPPORTED_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js', '.vue', '.svelte'];

		if (entryFile) {
			// 3a. If entryFile provided, validate it's a supported type
			const ext = path.extname(entryFile).toLowerCase();
			if (!SUPPORTED_EXTENSIONS.includes(ext)) {
				throw new Error(`ComponentService: Unsupported file type '${ext}'. Supported: ${SUPPORTED_EXTENSIONS.join(', ')}`);
			}
		} else {
			// 3b. If no entryFile, check folder has at least one supported file
			const hasSupportedFile = folderContents.some(file => {
				const ext = path.extname(file).toLowerCase();
				return SUPPORTED_EXTENSIONS.includes(ext);
			});
			if (!hasSupportedFile) {
				throw new Error(`ComponentService: No supported component files found in folder. Supported: ${SUPPORTED_EXTENSIONS.join(', ')}`);
			}
		}

		// ====================================================================
		// PIPELINE STEP 4: Entry File Resolution
		// ====================================================================
		if (!entryFile) {
			try {
				entryFile = await detectEntryFile(folderPath);
			} catch (error) {
				throw new Error(`ComponentService: Could not auto-detect entry file: ${error}`);
			}
		}

		// ====================================================================
		// PIPELINE STEP 5: Component Name Resolution
		// ====================================================================
		// Priority: request.componentName > derived from entryFile (capitalized)
		let componentName = request.componentName;
		if (!componentName) {
			const baseName = entryFile.replace(/\.[^/.]+$/, '');
			componentName = baseName.charAt(0).toUpperCase() + baseName.slice(1);
		}

		// ====================================================================
		// PIPELINE STEP 6: Canvas ID Resolution
		// ====================================================================
		// Priority: request.canvasId > active canvas > create new canvas
		let canvasId: string | undefined = request.canvasId;

		if (!canvasId) {
			// Try to get active/focused canvas (returns string | null)
			const activeCanvasId = await this.canvasService.getFocusedCanvasIdAsync();
			if (activeCanvasId) {
				canvasId = activeCanvasId;
			}
		}

		if (!canvasId) {
			// No canvas provided and no active canvas - create new canvas with componentName
			const newCanvas = await this.canvasService.createCanvas(componentName);
			canvasId = newCanvas.canvasId;
		}

		// At this point canvasId is guaranteed to be defined
		const resolvedCanvasId = canvasId as string;

		// ====================================================================
		// PIPELINE STEP 7: Framework Detection
		// ====================================================================
		let framework = request.framework;
		if (!framework) {
			try {
				const entryFilePath = path.join(folderPath, entryFile);
				framework = await detectFramework(entryFilePath);
				// this.logger.debug('Framework detected', { entryFile, framework });
			} catch (error) {
				this.logger.warn('Framework detection failed, using unknown', { error });
				framework = 'unknown';
			}
		}

		// ====================================================================
		// PIPELINE STEP 8: Content Hash Computation
		// ====================================================================
		const hashResult = await computeContentHashFromFolder(folderPath);
		const { hash: contentHash, filesSkipped, warnings } = hashResult;

		if (filesSkipped > 0) {
			this.logger.warn('Hash computation skipped files', { filesSkipped });
		}
		if (warnings.length > 0) {
			this.logger.warn('Hash computation warnings', { warnings });
		}

		// ====================================================================
		// PIPELINE STEP 9: Generate Component ID
		// ====================================================================
		const componentId = request.componentId || generateComponentId(componentName);
		const now = Date.now();

		// ====================================================================
		// SAVE: Create ComponentReference and persist to canvas file
		// ====================================================================
		const reference: ComponentReference = {
			componentName,
			folderPath,
			entryFile,
			framework: framework || 'unknown',
			position: { x: 0, y: 0, zIndex: 0 },
			buildState: { status: 'building' },
			contentHash,
			origin: request.origin,
			createdAt: now,
			updatedAt: now
		};

		await this.storageService.addComponentReference(resolvedCanvasId, componentId, reference);

		// ====================================================================
		// REGISTRY: Create in-memory Component object
		// ====================================================================
		const resolvedFramework = framework || 'unknown';
		const component: Component = {
			id: componentId,
			canvasId: resolvedCanvasId,
			folderPath,
			entryFile,
			framework: resolvedFramework,
			buildState: { status: 'building' }, // Initial state
			contentHash,                        // Always computed
			componentName,
			origin: request.origin,
			createdAt: now,
			updatedAt: now
		};

		// Add to in-memory registry
		this.components.set(componentId, component);

		// Emit created event
		this._onComponentCreated.fire({ component });

		// ====================================================================
		// POST-SAVE: Register file watcher and queue build
		// ====================================================================
		try {
			this.fileWatcher.registerFolderWatch(componentId, folderPath, resolvedCanvasId);
		} catch (error) {
			this.logger.warn('Could not register folder watch', { componentId, error });
		}

		// Queue build (async, result via event)
		this.buildQueue.enqueue({
			componentId,
			canvasId: resolvedCanvasId,
			trigger: 'create',
			priority: 'high',
			createdAt: now
		});

		this.logger.info('Component added', { componentId, componentName });
		return component;
	}

	/**
	 * Add multiple components in batch
	 * More efficient than calling addComponent() in a loop
	 */
	async addComponents(requests: AddComponentRequest[]): Promise<Component[]> {
		this.ensureInitialized();

		if (requests.length === 0) {
			return [];
		}

		// Pause file watcher during batch operation
		this.fileWatcher.pause();

		const components: Component[] = [];
		try {
			for (const request of requests) {
				const component = await this.addComponent(request);
				components.push(component);
			}
		} finally {
			this.fileWatcher.resume();
		}

		this.logger.info('Batch add complete', { count: components.length });
		return components;
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
		} catch (error) {
			this.logger.warn('Could not unregister folder watch', { componentId: id, error });
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

		try {
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

			const buildOutput = await this.buildService.build({
				id: componentId,
				files: sourceResult.files,
				entryFile: component.entryFile,
				framework: component.framework,
				dependencies: {}
			});

			await this.storageService.saveBundleCache(canvasId, componentId, {
				bundledCode: buildOutput.bundledCode,
				buildMeta: {
					componentId,
					canvasId,
					contentHash: component.contentHash || '', // Will update with new hash below
					cdnUrls: buildOutput.cdnUrls,
					buildTime: buildOutput.buildTime,
					bundleSize: buildOutput.bundleSize,
					builtAt: Date.now()
				}
			});

			const hashResult = await computeContentHashFromFolder(component.folderPath);

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
			this.logger.info('Build succeeded', {
				componentId: result.componentId,
				buildTime: result.buildTime,
				bundleSize: result.bundleSize
			});
		} else {
			this.logger.error('Build failed', {
				componentId: result.componentId,
				error: result.errorInfo?.message
			});
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

		this.logger.debug('File changed', { componentId, file, changeType });

		// Find component
		const component = this.components.get(componentId);
		if (!component) {
			this.logger.warn('Component not found for file change', { componentId });
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
					canvasId: canvas.id,
					folderPath: ref.folderPath,
					entryFile: ref.entryFile,
					framework: ref.framework,
					buildState: ref.buildState,
					contentHash: ref.contentHash,
					componentName: ref.componentName,
					origin: ref.origin,
					createdAt: ref.createdAt,
					updatedAt: ref.updatedAt
				};

				this.components.set(componentId, component);

				// Register folder watch for this component
				try {
					this.fileWatcher.registerFolderWatch(componentId, ref.folderPath, canvas.id);
				} catch (error) {
					this.logger.warn('Could not register watch for component', { componentId, error });
				}
			}
		}
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

	// ========================================================================
	// Component Info (Unified API for AI agents)
	// ========================================================================

	/**
	 * Get comprehensive component info in a single call
	 * This is the primary API for AI agents to understand component state.
	 */
	async getComponentInfo(id: string): Promise<ComponentInfo> {
		this.ensureInitialized();

		const component = this.components.get(id);
		if (!component) {
			throw new Error(`Component not found: ${id}`);
		}

		// Check if currently building
		const isBuilding = this.buildQueue.isBuilding(id);

		// Try to load cache to get build stats
		const bundle = await this.storageService.loadBundleCache(component.canvasId, id);

		// Determine cache validity
		const cacheValid = bundle !== null && bundle.buildMeta.contentHash === component.contentHash;

		// Map buildState.status to ComponentInfo.buildStatus
		// 'pending' maps to 'building' (both mean "not ready yet")
		const rawStatus = component.buildState.status;
		const buildStatus: 'building' | 'ready' | 'error' =
			rawStatus === 'pending' ? 'building' : rawStatus;

		// Extract error message (only exists when status === 'error')
		const buildError = component.buildState.status === 'error'
			? component.buildState.error
			: null;

		// Extract build error info if present
		let buildErrorInfo: BuildErrorInfo | undefined;
		if (buildError) {
			buildErrorInfo = {
				message: buildError,
				errors: [{ message: buildError, category: 'unknown' }],
				buildTime: 0
			};
		}

		return {
			// Basic info
			id: component.id,
			canvasId: component.canvasId,
			componentName: component.componentName,
			folderPath: component.folderPath,
			entryFile: component.entryFile,
			framework: component.framework,
			origin: component.origin,
			createdAt: component.createdAt,
			updatedAt: component.updatedAt,

			// Build status
			buildStatus,
			isBuilding,
			buildError,
			buildErrorInfo,

			// Cache status
			cacheValid,
			contentHash: component.contentHash,

			// Build output (from cache if available)
			cdnUrls: bundle?.buildMeta.cdnUrls || [],
			lastBuildTime: bundle?.buildMeta.buildTime || 0,
			bundleSize: bundle?.buildMeta.bundleSize || 0,
			lastBuiltAt: bundle?.buildMeta.builtAt || 0
		};
	}

	// ========================================================================
	// Update
	// ========================================================================

	/**
	 * Update component display name
	 */
	async updateComponentName(id: string, componentName: string): Promise<void> {
		this.ensureInitialized();
		const component = this.components.get(id);
		if (!component) {
			throw new Error(`Component not found: ${id}`);
		}

		component.componentName = componentName;
		component.updatedAt = Date.now();

		await this.storageService.updateComponentReference(component.canvasId, id, {
			componentName,
			updatedAt: component.updatedAt
		});

		this._onComponentUpdated.fire({ component, changes: ['componentName'] });
	}
}
