/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ComponentInput, SandboxJob, QueueStatus } from '../../common/sandboxPipeline/types.js';
import { ESBuildTransformer } from './esbuildTransformer.js';

/**
 * Sandbox Queue
 *
 * Manages job queue with load balancing.
 * Runs in electron-main process.
 */
export class SandboxQueue extends Disposable {

	private readonly maxConcurrent = 10;
	private readonly queue: SandboxJob[] = [];
	private readonly processing = new Set<string>();

	private readonly _onJobCompleted = this._register(new Emitter<SandboxJob>());
	private readonly _onJobFailed = this._register(new Emitter<SandboxJob>());

	readonly onJobCompleted = this._onJobCompleted.event;
	readonly onJobFailed = this._onJobFailed.event;

	constructor(
		private readonly transformer: ESBuildTransformer
	) {
		super();
	}

	async enqueue(input: ComponentInput): Promise<string> {
		const job: SandboxJob = {
			id: this.generateJobId(),
			input,
			status: 'queued',
			createdAt: Date.now()
		};

		// Priority queue
		if (input.priority === 'high') {
			const firstNormalIndex = this.queue.findIndex(j =>
				j.status === 'queued' && j.input.priority !== 'high'
			);
			if (firstNormalIndex === -1) {
				this.queue.push(job);
			} else {
				this.queue.splice(firstNormalIndex, 0, job);
			}
		} else if (input.priority === 'low') {
			this.queue.push(job);
		} else {
			const firstLowIndex = this.queue.findIndex(j =>
				j.status === 'queued' && j.input.priority === 'low'
			);
			if (firstLowIndex === -1) {
				this.queue.push(job);
			} else {
				this.queue.splice(firstLowIndex, 0, job);
			}
		}

		this.processNext();
		return job.id;
	}

	getJob(jobId: string): SandboxJob | undefined {
		return this.queue.find(j => j.id === jobId);
	}

	getAllJobs(): SandboxJob[] {
		return [...this.queue];
	}

	getStatus(): QueueStatus {
		return {
			queued: this.queue.filter(j => j.status === 'queued').length,
			processing: this.processing.size,
			completed: this.queue.filter(j => j.status === 'completed').length,
			failed: this.queue.filter(j => j.status === 'failed').length
		};
	}

	cancelJob(jobId: string): boolean {
		const job = this.getJob(jobId);
		if (!job || job.status !== 'queued') {
			return false;
		}

		job.status = 'failed';
		job.error = 'Cancelled by user';
		job.completedAt = Date.now();

		this._onJobFailed.fire(job);
		return true;
	}

	clearCompletedJobs(): number {
		const initialLength = this.queue.length;
		const toKeep = this.queue.filter(j =>
			j.status === 'queued' || j.status === 'processing'
		);
		this.queue.length = 0;
		this.queue.push(...toKeep);
		return initialLength - this.queue.length;
	}

	private async processNext(): Promise<void> {
		if (this.processing.size >= this.maxConcurrent) {
			return;
		}

		const job = this.queue.find(j => j.status === 'queued');
		if (!job) {
			return;
		}

		job.status = 'processing';
		this.processing.add(job.id);

		try {
			const result = await this.transformer.transform(job.input);
			job.result = result;
			job.status = 'completed';
			job.completedAt = Date.now();
			this._onJobCompleted.fire(job);
		} catch (error) {
			job.status = 'failed';
			job.error = error instanceof Error ? error.message : String(error);
			job.completedAt = Date.now();
			this._onJobFailed.fire(job);
		} finally {
			this.processing.delete(job.id);
			this.processNext();
		}
	}

	private generateJobId(): string {
		return `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
	}

	override dispose(): void {
		this.queue.length = 0;
		this.processing.clear();
		super.dispose();
	}
}
