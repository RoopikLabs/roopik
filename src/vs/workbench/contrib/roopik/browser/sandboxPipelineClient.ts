/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ISandboxPipelineService } from '../common/sandboxPipeline/sandboxPipelineService.js';
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

	constructor() {
		super();
	}

	/**
	 * Process a component (sends to main process)
	 * TODO: Implement actual IPC communication
	 */
	async processComponent(input: ComponentInput): Promise<string> {
		// Placeholder - will be implemented with VSCode's IPC in Phase 4
		throw new Error('SandboxPipelineClient: IPC not yet implemented. Use in Phase 4.');
	}

	/**
	 * Validate a component without processing
	 */
	async validateComponent(input: ComponentInput): Promise<ValidationResult> {
		throw new Error('SandboxPipelineClient: IPC not yet implemented. Use in Phase 4.');
	}

	/**
	 * Get job status by ID
	 */
	async getJobStatus(jobId: string): Promise<SandboxJob | undefined> {
		throw new Error('SandboxPipelineClient: IPC not yet implemented. Use in Phase 4.');
	}

	/**
	 * Get all jobs
	 */
	async getAllJobs(): Promise<SandboxJob[]> {
		throw new Error('SandboxPipelineClient: IPC not yet implemented. Use in Phase 4.');
	}

	/**
	 * Get queue statistics
	 */
	async getQueueStatus(): Promise<QueueStatus> {
		throw new Error('SandboxPipelineClient: IPC not yet implemented. Use in Phase 4.');
	}

	/**
	 * Wait for job completion
	 */
	async waitForCompletion(jobId: string, timeout?: number): Promise<TransformedComponent> {
		throw new Error('SandboxPipelineClient: IPC not yet implemented. Use in Phase 4.');
	}

	/**
	 * Cancel a queued job
	 */
	async cancelJob(jobId: string): Promise<boolean> {
		throw new Error('SandboxPipelineClient: IPC not yet implemented. Use in Phase 4.');
	}

	/**
	 * Clear completed and failed jobs
	 */
	async clearCompletedJobs(): Promise<number> {
		throw new Error('SandboxPipelineClient: IPC not yet implemented. Use in Phase 4.');
	}

	override dispose(): void {
		super.dispose();
	}
}
