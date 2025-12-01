/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ISandboxPipelineService } from '../../common/sandboxPipeline/sandboxPipelineService.js';
import { ComponentInput, SandboxJob, TransformedComponent, QueueStatus, ValidationResult } from '../../common/sandboxPipeline/types.js';
import { ComponentParser } from '../../common/sandboxPipeline/componentParser.js';
import { ESBuildTransformer } from './esbuildTransformer.js';
import { SandboxQueue } from './sandboxQueue.js';

/**
 * Sandbox Pipeline Service (Main Process Implementation)
 *
 * Runs in electron-main process.
 * Handles all component transformation with ESBuild.
 */
export class SandboxPipelineMainService extends Disposable implements ISandboxPipelineService {

	declare readonly _serviceBrand: undefined;

	private readonly parser: ComponentParser;
	private readonly transformer: ESBuildTransformer;
	private readonly queue: SandboxQueue;

	constructor() {
		super();

		this.parser = new ComponentParser();
		this.transformer = new ESBuildTransformer(this.parser);
		this.queue = this._register(new SandboxQueue(this.transformer));
	}

	async processComponent(input: ComponentInput): Promise<string> {
		const validation = await this.validateComponent(input);
		if (!validation.valid) {
			throw new Error(`Invalid component: ${validation.errors.join(', ')}`);
		}

		return await this.queue.enqueue(input);
	}

	async validateComponent(input: ComponentInput): Promise<ValidationResult> {
		return this.parser.validate(input);
	}

	async getJobStatus(jobId: string): Promise<SandboxJob | undefined> {
		return this.queue.getJob(jobId);
	}

	async getAllJobs(): Promise<SandboxJob[]> {
		return this.queue.getAllJobs();
	}

	async getQueueStatus(): Promise<QueueStatus> {
		return this.queue.getStatus();
	}

	async waitForCompletion(jobId: string, timeout: number = 30000): Promise<TransformedComponent> {
		const startTime = Date.now();

		while (Date.now() - startTime < timeout) {
			const job = await this.getJobStatus(jobId);

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

			await this.sleep(100);
		}

		throw new Error(`Timeout waiting for job completion: ${jobId}`);
	}

	async cancelJob(jobId: string): Promise<boolean> {
		return this.queue.cancelJob(jobId);
	}

	async clearCompletedJobs(): Promise<number> {
		return this.queue.clearCompletedJobs();
	}

	private sleep(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	override dispose(): void {
		super.dispose();
	}
}
