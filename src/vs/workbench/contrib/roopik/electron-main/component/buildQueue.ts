/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Build Queue
 *
 * Manages async build requests with:
 * - Deduplication: Same component → only latest request runs
 * - Concurrency limiting: Max N parallel builds
 * - Priority: User-triggered > file-watcher-triggered
 * - Cancellation: Cancel pending builds for deleted components
 */

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';

// ============================================================================
// Types
// ============================================================================

/** Priority levels for build requests */
export type BuildPriority = 'high' | 'normal';

/** What triggered the build */
export type BuildTrigger = 'create' | 'update' | 'rebuild' | 'file-change';

/**
 * Build request in the queue
 */
export interface BuildRequest {
	/** Component ID */
	componentId: string;

	/** Canvas ID */
	canvasId: string;

	/** What triggered this build */
	trigger: BuildTrigger;

	/** Priority (high = user-triggered, normal = file-watcher) */
	priority: BuildPriority;

	/** Timestamp when request was created */
	createdAt: number;
}

/**
 * Build result from executor
 */
export interface QueueBuildResult {
	/** Component ID */
	componentId: string;

	/** Canvas ID */
	canvasId: string;

	/** Success or failure */
	success: boolean;

	/** CDN URLs for dependencies (success case) */
	cdnUrls?: string[];

	/** Build time in ms */
	buildTime?: number;

	/** Bundle size in bytes */
	bundleSize?: number;

	/** Detected styling libraries for conditional CSS injection */
	styling?: {
		usesTailwind: boolean;
		usesShadcn: boolean;
		detectedLibraries: string[];
	};

	/** Structured error info (failure case) */
	errorInfo?: {
		message: string;
		errors: Array<{
			message: string;
			category: 'syntax' | 'type' | 'import' | 'transform' | 'unknown';
			location?: {
				file: string;
				line: number;
				column: number;
				length?: number;
				lineText?: string;
			};
			notes?: string[];
			stack?: string;
		}>;
		buildTime: number;
	};

	/** What triggered this build */
	trigger: BuildTrigger;
}

/**
 * Build executor function
 * Takes a request, returns a result
 */
export type BuildExecutor = (request: BuildRequest) => Promise<QueueBuildResult>;

// ============================================================================
// Build Queue Implementation
// ============================================================================

export class BuildQueue extends Disposable {
	// ========================================================================
	// Configuration
	// ========================================================================

	/** Maximum concurrent builds */
	private readonly maxConcurrent: number;

	// ========================================================================
	// State
	// ========================================================================

	/** Pending builds: componentId → request (deduplication by key) */
	private readonly pending = new Map<string, BuildRequest>();

	/** Currently running builds: componentId → Promise */
	private readonly running = new Map<string, Promise<void>>();

	/** Cancelled component IDs (builds in progress will complete but results ignored) */
	private readonly cancelled = new Set<string>();

	/** Build executor function */
	private executor: BuildExecutor | null = null;

	// ========================================================================
	// Events
	// ========================================================================

	private readonly _onBuildComplete = this._register(new Emitter<QueueBuildResult>());
	readonly onBuildComplete: Event<QueueBuildResult> = this._onBuildComplete.event;

	private readonly _onQueueEmpty = this._register(new Emitter<void>());
	readonly onQueueEmpty: Event<void> = this._onQueueEmpty.event;

	// ========================================================================
	// Constructor
	// ========================================================================

	constructor(maxConcurrent: number = 3) {
		super();
		this.maxConcurrent = maxConcurrent;
	}

	// ========================================================================
	// Configuration
	// ========================================================================

	/**
	 * Set the build executor
	 * Must be called before enqueuing builds
	 */
	setExecutor(executor: BuildExecutor): void {
		this.executor = executor;
	}

	// ========================================================================
	// Queue Operations
	// ========================================================================

	/**
	 * Enqueue a build request
	 *
	 * If a request for the same component is already pending, it's replaced
	 * (deduplication). Only the latest request for each component runs.
	 */
	enqueue(request: BuildRequest): void {
		const key = request.componentId;

		// If already running, queue for after completion
		// If already pending, replace with new request (keeps latest trigger/priority)
		const existing = this.pending.get(key);
		if (existing) {
			// Keep higher priority
			if (request.priority === 'high' || existing.priority !== 'high') {
				this.pending.set(key, request);
			}
		} else {
			this.pending.set(key, request);
		}

		// Remove from cancelled if re-enqueued
		this.cancelled.delete(key);

		// Try to process
		this.processNext();
	}

	/**
	 * Cancel pending/running build for a component
	 *
	 * - Removes from pending queue
	 * - Marks running build as cancelled (will complete but result ignored)
	 */
	cancel(componentId: string): void {
		this.pending.delete(componentId);
		if (this.running.has(componentId)) {
			this.cancelled.add(componentId);
		}
	}

	/**
	 * Cancel all pending/running builds
	 */
	cancelAll(): void {
		this.pending.clear();
		for (const componentId of this.running.keys()) {
			this.cancelled.add(componentId);
		}
	}

	// ========================================================================
	// Queue State
	// ========================================================================

	/**
	 * Get number of pending builds
	 */
	getPendingCount(): number {
		return this.pending.size;
	}

	/**
	 * Get number of running builds
	 */
	getRunningCount(): number {
		return this.running.size;
	}

	/**
	 * Get total queue size (pending + running)
	 */
	getSize(): number {
		return this.pending.size + this.running.size;
	}

	/**
	 * Check if a component has a pending or running build
	 */
	isQueued(componentId: string): boolean {
		return this.pending.has(componentId) || this.running.has(componentId);
	}

	/**
	 * Check if a component is currently building
	 */
	isBuilding(componentId: string): boolean {
		return this.running.has(componentId);
	}

	/**
	 * Check if queue is empty (no pending or running)
	 */
	isEmpty(): boolean {
		return this.pending.size === 0 && this.running.size === 0;
	}

	// ========================================================================
	// Internal: Processing
	// ========================================================================

	/**
	 * Process next items in queue
	 */
	private processNext(): void {
		if (!this.executor) {
			console.error('[BuildQueue] No executor set');
			return;
		}

		// Check if we can run more builds
		while (this.running.size < this.maxConcurrent && this.pending.size > 0) {
			// Get next request (prioritize high priority)
			const next = this.getNextRequest();
			if (!next) break;

			this.pending.delete(next.componentId);
			this.startBuild(next);
		}
	}

	/**
	 * Get next request to process (high priority first, then oldest)
	 */
	private getNextRequest(): BuildRequest | null {
		let highPriority: BuildRequest | null = null;
		let oldest: BuildRequest | null = null;

		for (const request of this.pending.values()) {
			if (request.priority === 'high') {
				if (!highPriority || request.createdAt < highPriority.createdAt) {
					highPriority = request;
				}
			} else {
				if (!oldest || request.createdAt < oldest.createdAt) {
					oldest = request;
				}
			}
		}

		return highPriority || oldest;
	}

	/**
	 * Start a build
	 */
	private startBuild(request: BuildRequest): void {
		const promise = this.runBuild(request);
		this.running.set(request.componentId, promise);

		promise.finally(() => {
			this.running.delete(request.componentId);

			// Check if more pending builds
			if (this.pending.size > 0) {
				this.processNext();
			} else if (this.running.size === 0) {
				this._onQueueEmpty.fire();
			}
		});
	}

	/**
	 * Run a build and emit result
	 */
	private async runBuild(request: BuildRequest): Promise<void> {
		if (!this.executor) {
			return;
		}

		try {
			const result = await this.executor(request);

			// Check if cancelled while building
			if (this.cancelled.has(request.componentId)) {
				this.cancelled.delete(request.componentId);
				console.log(`[BuildQueue] Build cancelled, ignoring result: ${request.componentId}`);
				return;
			}

			this._onBuildComplete.fire(result);

		} catch (error) {
			// Check if cancelled
			if (this.cancelled.has(request.componentId)) {
				this.cancelled.delete(request.componentId);
				return;
			}

			// Emit error result
			const errorMessage = error instanceof Error ? error.message : String(error);
			this._onBuildComplete.fire({
				componentId: request.componentId,
				canvasId: request.canvasId,
				success: false,
				errorInfo: {
					message: errorMessage,
					errors: [{ message: errorMessage, category: 'unknown' }],
					buildTime: 0
				},
				trigger: request.trigger
			});
		}
	}

	// ========================================================================
	// Dispose
	// ========================================================================

	override dispose(): void {
		this.cancelAll();
		super.dispose();
	}
}
