/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ISandboxPipelineService } from '../common/sandboxPipeline/sandboxPipelineService.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { ComponentInput, SandboxJob, TransformedComponent, QueueStatus, ValidationResult } from '../common/sandboxPipeline/types.js';

/**
 * Sandbox Pipeline Client (Browser Process)
 *
 * Acts as an IPC proxy to the main process pipeline service.
 * All heavy lifting (ESBuild, queue management) happens in the main process.
 *
 * NOTE: This is a placeholder implementation. In Phase 4, we'll integrate with
 * VSCode's actual IPC mechanism (likely via ProxyChannel or similar).
 */
export class SandboxPipelineClient extends Disposable implements ISandboxPipelineService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IMainProcessService private readonly mainProcessService: IMainProcessService
	) {
		super();
	}

	private get channel() {
		return this.mainProcessService.getChannel('sandboxPipeline');
	}

	/**
	 * Process a component (sends to main process)
	 */
	async processComponent(input: ComponentInput): Promise<string> {
		return this.channel.call('processComponent', input);
	}

	/**
	 * Validate a component without processing
	 */
	async validateComponent(input: ComponentInput): Promise<ValidationResult> {
		return this.channel.call('validateComponent', input);
	}

	/**
	 * Get job status by ID
	 */
	async getJobStatus(jobId: string): Promise<SandboxJob | undefined> {
		return this.channel.call('getJobStatus', jobId);
	}

	/**
	 * Get all jobs
	 */
	async getAllJobs(): Promise<SandboxJob[]> {
		return this.channel.call('getAllJobs');
	}

	/**
	 * Get queue statistics
	 */
	async getQueueStatus(): Promise<QueueStatus> {
		return this.channel.call('getQueueStatus');
	}

	/**
	 * Wait for job completion
	 */
	async waitForCompletion(jobId: string, timeout?: number): Promise<TransformedComponent> {
		return this.channel.call('waitForCompletion', [jobId, timeout]);
	}

	/**
	 * Cancel a queued job
	 */
	async cancelJob(jobId: string): Promise<boolean> {
		return this.channel.call('cancelJob', jobId);
	}

	/**
	 * Clear completed and failed jobs
	 */
	async clearCompletedJobs(): Promise<number> {
		return this.channel.call('clearCompletedJobs');
	}

	override dispose(): void {
		super.dispose();
	}
}
