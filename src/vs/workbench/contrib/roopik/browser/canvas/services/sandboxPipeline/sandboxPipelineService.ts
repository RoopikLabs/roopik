/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Event } from '../../../../../base/common/event.js';
import { ComponentInput, SandboxJob, TransformedComponent, QueueStatus, ValidationResult } from './types.js';
import { ComponentParser } from './componentParser.js';
import { CodeTransformer } from './codeTransformer.js';
import { SandboxQueue } from './sandboxQueue.js';

/**
 * Sandbox Pipeline Service
 *
 * Main orchestrator for component transformation pipeline.
 * This is the primary API for processing components from any source.
 *
 * Usage:
 * ```typescript
 * // Process a component
 * const jobId = await pipeline.processComponent({
 *   id: 'comp-123',
 *   source: 'ai',
 *   files: new Map([['Button.jsx', code]])
 * });
 *
 * // Wait for completion
 * const result = await pipeline.waitForCompletion(jobId);
 * ```
 */
export class SandboxPipelineService extends Disposable {

	private readonly parser: ComponentParser;
	private readonly transformer: CodeTransformer;
	private readonly queue: SandboxQueue;

	constructor() {
		super();

		// Initialize services
		this.parser = new ComponentParser();
		this.transformer = new CodeTransformer(this.parser);
		this.queue = this._register(new SandboxQueue(this.transformer));
	}

	// ============================================
	// Public API
	// ============================================

	/**
	 * Process a component
	 *
	 * This is the main entry point for the pipeline.
	 * Can be called by:
	 * - AI agents
	 * - Users uploading components
	 * - IDE importing components
	 *
	 * @param input Component input data
	 * @returns Job ID for tracking
	 */
	async processComponent(input: ComponentInput): Promise<string> {
		// Validate input
		const validation = this.validateComponent(input);
		if (!validation.valid) {
			throw new Error(`Invalid component: ${validation.errors.join(', ')}`);
		}

		// Enqueue for processing
		const jobId = await this.queue.enqueue(input);

		return jobId;
	}

	/**
	 * Validate a component without processing it
	 *
	 * Useful for pre-flight checks before enqueueing
	 */
	validateComponent(input: ComponentInput): ValidationResult {
		return this.parser.validate(input);
	}

	/**
	 * Get job status
	 *
	 * @param jobId Job ID returned from processComponent
	 * @returns Job object with current status
	 */
	getJobStatus(jobId: string): SandboxJob | undefined {
		return this.queue.getJob(jobId);
	}

	/**
	 * Get all jobs
	 *
	 * Useful for debugging or displaying queue status in UI
	 */
	getAllJobs(): SandboxJob[] {
		return this.queue.getAllJobs();
	}

	/**
	 * Get queue statistics
	 */
	getQueueStatus(): QueueStatus {
		return this.queue.getStatus();
	}

	/**
	 * Wait for job completion
	 *
	 * Polls the job status until it completes or fails.
	 *
	 * @param jobId Job ID to wait for
	 * @param timeout Timeout in milliseconds (default: 30000)
	 * @returns Transformed component
	 * @throws Error if job fails or times out
	 */
	async waitForCompletion(jobId: string, timeout: number = 30000): Promise<TransformedComponent> {
		const startTime = Date.now();

		while (Date.now() - startTime < timeout) {
			const job = this.getJobStatus(jobId);

			if (!job) {
				throw new Error(`Job not found: ${jobId}`);
			}

			if (job.status === 'completed') {
				if (!job.result) {
					throw new Error(`Job completed but no result available: ${jobId}`);
				}
				return job.result;
			}

			if (job.status === 'failed') {
				throw new Error(`Job failed: ${job.error || 'Unknown error'}`);
			}

			// Wait a bit before checking again
			await this.sleep(100);
		}

		throw new Error(`Timeout waiting for job completion: ${jobId}`);
	}

	/**
	 * Cancel a job
	 *
	 * Only queued jobs can be cancelled.
	 *
	 * @param jobId Job ID to cancel
	 * @returns true if cancelled, false if job not found or already processing
	 */
	cancelJob(jobId: string): boolean {
		return this.queue.cancelJob(jobId);
	}

	/**
	 * Clear completed and failed jobs
	 *
	 * Useful for cleaning up memory after processing many components
	 *
	 * @returns Number of jobs cleared
	 */
	clearCompletedJobs(): number {
		return this.queue.clearCompletedJobs();
	}

	// ============================================
	// Events
	// ============================================

	/**
	 * Event fired when a job is queued
	 */
	get onJobQueued(): Event<SandboxJob> {
		return this.queue.onJobQueued;
	}

	/**
	 * Event fired when a job starts processing
	 */
	get onJobStarted(): Event<SandboxJob> {
		return this.queue.onJobStarted;
	}

	/**
	 * Event fired when a job completes successfully
	 */
	get onJobCompleted(): Event<SandboxJob> {
		return this.queue.onJobCompleted;
	}

	/**
	 * Event fired when a job fails
	 */
	get onJobFailed(): Event<SandboxJob> {
		return this.queue.onJobFailed;
	}

	// ============================================
	// Helper Methods
	// ============================================

	/**
	 * Sleep for specified milliseconds
	 */
	private sleep(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	/**
	 * Dispose the service
	 */
	override dispose(): void {
		super.dispose();
	}
}
