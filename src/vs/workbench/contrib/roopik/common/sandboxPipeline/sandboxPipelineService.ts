/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ComponentInput, SandboxJob, TransformedComponent, QueueStatus, ValidationResult } from './types.js';

export const ISandboxPipelineService = createDecorator<ISandboxPipelineService>('sandboxPipelineService');

/**
 * Sandbox Pipeline Service Interface
 *
 * Main service for transforming components.
 * Implemented in electron-main, consumed in browser via IPC.
 */
export interface ISandboxPipelineService {
	readonly _serviceBrand: undefined;

	/**
	 * Process a component and return a job ID
	 */
	processComponent(input: ComponentInput): Promise<string>;

	/**
	 * Validate a component without processing
	 */
	validateComponent(input: ComponentInput): Promise<ValidationResult>;

	/**
	 * Get job status by ID
	 */
	getJobStatus(jobId: string): Promise<SandboxJob | undefined>;

	/**
	 * Get all jobs
	 */
	getAllJobs(): Promise<SandboxJob[]>;

	/**
	 * Get queue statistics
	 */
	getQueueStatus(): Promise<QueueStatus>;

	/**
	 * Wait for job completion
	 */
	waitForCompletion(jobId: string, timeout?: number): Promise<TransformedComponent>;

	/**
	 * Cancel a queued job
	 */
	cancelJob(jobId: string): Promise<boolean>;

	/**
	 * Clear completed and failed jobs
	 */
	clearCompletedJobs(): Promise<number>;
}
