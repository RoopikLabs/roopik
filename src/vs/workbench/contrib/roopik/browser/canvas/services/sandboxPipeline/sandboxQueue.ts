/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ComponentInput, SandboxJob, JobStatus, QueueStatus } from './types.js';
import { CodeTransformer } from './codeTransformer.js';

/**
 * Sandbox Queue Service
 *
 * Manages a queue of component transformation jobs with:
 * - Load balancing (max concurrent jobs)
 * - Priority handling
 * - Event notifications
 * - Job status tracking
 */
export class SandboxQueue extends Disposable {

	/**
	 * Maximum number of concurrent jobs
	 * Prevents resource exhaustion when processing many components
	 */
	private readonly maxConcurrent = 10;

	/**
	 * Queue of all jobs (queued, processing, completed, failed)
	 */
	private readonly queue: SandboxJob[] = [];

	/**
	 * Set of currently processing job IDs
	 */
	private readonly processing = new Set<string>();

	/**
	 * Event emitters
	 */
	private readonly _onJobQueued = this._register(new Emitter<SandboxJob>());
	private readonly _onJobStarted = this._register(new Emitter<SandboxJob>());
	private readonly _onJobCompleted = this._register(new Emitter<SandboxJob>());
	private readonly _onJobFailed = this._register(new Emitter<SandboxJob>());

	/**
	 * Public events
	 */
	readonly onJobQueued: Event<SandboxJob> = this._onJobQueued.event;
	readonly onJobStarted: Event<SandboxJob> = this._onJobStarted.event;
	readonly onJobCompleted: Event<SandboxJob> = this._onJobCompleted.event;
	readonly onJobFailed: Event<SandboxJob> = this._onJobFailed.event;

	constructor(
		private readonly transformer: CodeTransformer
	) {
		super();
	}

	/**
	 * Enqueue a component for processing
	 *
	 * @param input Component input data
	 * @returns Job ID
	 */
	async enqueue(input: ComponentInput): Promise<string> {
		// Create job
		const job: SandboxJob = {
			id: this.generateJobId(),
			input,
			status: 'queued',
			createdAt: new Date()
		};

		// Add to queue based on priority
		if (input.priority === 'high') {
			// High priority: add to front of queue (after other high priority jobs)
			const firstNormalIndex = this.queue.findIndex(j =>
				j.status === 'queued' && j.input.priority !== 'high'
			);
			if (firstNormalIndex === -1) {
				this.queue.push(job);
			} else {
				this.queue.splice(firstNormalIndex, 0, job);
			}
		} else if (input.priority === 'low') {
			// Low priority: add to end of queue
			this.queue.push(job);
		} else {
			// Normal priority: add after high priority, before low priority
			const firstLowIndex = this.queue.findIndex(j =>
				j.status === 'queued' && j.input.priority === 'low'
			);
			if (firstLowIndex === -1) {
				this.queue.push(job);
			} else {
				this.queue.splice(firstLowIndex, 0, job);
			}
		}

		// Emit event
		this._onJobQueued.fire(job);

		// Start processing
		this.processNext();

		return job.id;
	}

	/**
	 * Get job by ID
	 */
	getJob(jobId: string): SandboxJob | undefined {
		return this.queue.find(j => j.id === jobId);
	}

	/**
	 * Get all jobs
	 */
	getAllJobs(): SandboxJob[] {
		return [...this.queue];
	}

	/**
	 * Get queue status
	 */
	getStatus(): QueueStatus {
		return {
			queued: this.queue.filter(j => j.status === 'queued').length,
			processing: this.processing.size,
			completed: this.queue.filter(j => j.status === 'completed').length,
			failed: this.queue.filter(j => j.status === 'failed').length
		};
	}

	/**
	 * Cancel a job
	 *
	 * Only queued jobs can be cancelled.
	 * Processing jobs cannot be cancelled.
	 */
	cancelJob(jobId: string): boolean {
		const job = this.getJob(jobId);
		if (!job) {
			return false;
		}

		if (job.status !== 'queued') {
			return false; // Can only cancel queued jobs
		}

		job.status = 'failed';
		job.error = 'Cancelled by user';
		job.completedAt = new Date();

		this._onJobFailed.fire(job);
		return true;
	}

	/**
	 * Clear completed and failed jobs
	 *
	 * Useful for cleaning up old jobs to save memory
	 */
	clearCompletedJobs(): number {
		const initialLength = this.queue.length;
		const toKeep = this.queue.filter(j =>
			j.status === 'queued' || j.status === 'processing'
		);
		this.queue.length = 0;
		this.queue.push(...toKeep);
		return initialLength - this.queue.length;
	}

	/**
	 * Process next job in queue
	 *
	 * This is called automatically when:
	 * - A new job is enqueued
	 * - A job completes (to process the next one)
	 */
	private async processNext(): Promise<void> {
		// Check if we're at max capacity
		if (this.processing.size >= this.maxConcurrent) {
			return;
		}

		// Find next queued job
		const job = this.queue.find(j => j.status === 'queued');
		if (!job) {
			return; // No jobs to process
		}

		// Mark as processing
		job.status = 'processing';
		this.processing.add(job.id);
		this._onJobStarted.fire(job);

		try {
			// Transform the component
			const result = await this.transformer.transform(job.input);

			// Mark as completed
			job.result = result;
			job.status = 'completed';
			job.completedAt = new Date();

			// Emit event
			this._onJobCompleted.fire(job);

		} catch (error) {
			// Mark as failed
			job.status = 'failed';
			job.error = error instanceof Error ? error.message : String(error);
			job.completedAt = new Date();

			// Emit event
			this._onJobFailed.fire(job);

		} finally {
			// Remove from processing set
			this.processing.delete(job.id);

			// Process next job
			this.processNext();
		}
	}

	/**
	 * Generate unique job ID
	 */
	private generateJobId(): string {
		return `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Dispose the queue
	 */
	override dispose(): void {
		this.queue.length = 0;
		this.processing.clear();
		super.dispose();
	}
}
