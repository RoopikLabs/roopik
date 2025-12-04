/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Canvas Pipeline Commands
 *
 * Exposes Core's SandboxPipelineService to extensions via commands.
 * Extensions call these commands to build components.
 *
 * Architecture:
 * - Extension sends ComponentInput via command
 * - Core builds with ESBuild pipeline
 * - Core returns TransformedComponent
 */

import { localize2 } from '../../../../../nls.js';
import { registerAction2, Action2 } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ISandboxPipelineService } from '../../common/sandboxPipeline/sandboxPipelineService.js';
import type { ComponentInput, TransformedComponent, ValidationResult, SandboxJob, QueueStatus } from '../../common/sandboxPipeline/types.js';

/**
 * Process a component through the ESBuild pipeline
 *
 * Usage from extension:
 * const jobId = await vscode.commands.executeCommand('roopik.pipeline.processComponent', input);
 */
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'roopik.pipeline.processComponent',
			title: localize2('roopik.pipeline.processComponent', 'Process Component'),
			category: localize2('roopik.category', 'Roopik'),
			f1: false // Internal command, not shown in command palette
		});
	}

	async run(accessor: ServicesAccessor, input: ComponentInput): Promise<string> {
		const pipelineService = accessor.get(ISandboxPipelineService);
		return pipelineService.processComponent(input);
	}
});

/**
 * Wait for a job to complete and get the result
 *
 * Usage from extension:
 * const result = await vscode.commands.executeCommand('roopik.pipeline.waitForCompletion', jobId, timeout);
 */
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'roopik.pipeline.waitForCompletion',
			title: localize2('roopik.pipeline.waitForCompletion', 'Wait For Completion'),
			category: localize2('roopik.category', 'Roopik'),
			f1: false
		});
	}

	async run(accessor: ServicesAccessor, jobId: string, timeout?: number): Promise<TransformedComponent> {
		const pipelineService = accessor.get(ISandboxPipelineService);
		return pipelineService.waitForCompletion(jobId, timeout);
	}
});

/**
 * Validate a component without processing
 *
 * Usage from extension:
 * const validation = await vscode.commands.executeCommand('roopik.pipeline.validateComponent', input);
 */
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'roopik.pipeline.validateComponent',
			title: localize2('roopik.pipeline.validateComponent', 'Validate Component'),
			category: localize2('roopik.category', 'Roopik'),
			f1: false
		});
	}

	async run(accessor: ServicesAccessor, input: ComponentInput): Promise<ValidationResult> {
		const pipelineService = accessor.get(ISandboxPipelineService);
		return pipelineService.validateComponent(input);
	}
});

/**
 * Get job status by ID
 *
 * Usage from extension:
 * const job = await vscode.commands.executeCommand('roopik.pipeline.getJobStatus', jobId);
 */
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'roopik.pipeline.getJobStatus',
			title: localize2('roopik.pipeline.getJobStatus', 'Get Job Status'),
			category: localize2('roopik.category', 'Roopik'),
			f1: false
		});
	}

	async run(accessor: ServicesAccessor, jobId: string): Promise<SandboxJob | undefined> {
		const pipelineService = accessor.get(ISandboxPipelineService);
		return pipelineService.getJobStatus(jobId);
	}
});

/**
 * Get all jobs
 *
 * Usage from extension:
 * const jobs = await vscode.commands.executeCommand('roopik.pipeline.getAllJobs');
 */
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'roopik.pipeline.getAllJobs',
			title: localize2('roopik.pipeline.getAllJobs', 'Get All Jobs'),
			category: localize2('roopik.category', 'Roopik'),
			f1: false
		});
	}

	async run(accessor: ServicesAccessor): Promise<SandboxJob[]> {
		const pipelineService = accessor.get(ISandboxPipelineService);
		return pipelineService.getAllJobs();
	}
});

/**
 * Get queue status
 *
 * Usage from extension:
 * const status = await vscode.commands.executeCommand('roopik.pipeline.getQueueStatus');
 */
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'roopik.pipeline.getQueueStatus',
			title: localize2('roopik.pipeline.getQueueStatus', 'Get Queue Status'),
			category: localize2('roopik.category', 'Roopik'),
			f1: false
		});
	}

	async run(accessor: ServicesAccessor): Promise<QueueStatus> {
		const pipelineService = accessor.get(ISandboxPipelineService);
		return pipelineService.getQueueStatus();
	}
});

/**
 * Cancel a queued job
 *
 * Usage from extension:
 * const success = await vscode.commands.executeCommand('roopik.pipeline.cancelJob', jobId);
 */
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'roopik.pipeline.cancelJob',
			title: localize2('roopik.pipeline.cancelJob', 'Cancel Job'),
			category: localize2('roopik.category', 'Roopik'),
			f1: false
		});
	}

	async run(accessor: ServicesAccessor, jobId: string): Promise<boolean> {
		const pipelineService = accessor.get(ISandboxPipelineService);
		return pipelineService.cancelJob(jobId);
	}
});

/**
 * Clear completed and failed jobs
 *
 * Usage from extension:
 * const count = await vscode.commands.executeCommand('roopik.pipeline.clearCompletedJobs');
 */
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'roopik.pipeline.clearCompletedJobs',
			title: localize2('roopik.pipeline.clearCompletedJobs', 'Clear Completed Jobs'),
			category: localize2('roopik.category', 'Roopik'),
			f1: false
		});
	}

	async run(accessor: ServicesAccessor): Promise<number> {
		const pipelineService = accessor.get(ISandboxPipelineService);
		return pipelineService.clearCompletedJobs();
	}
});

/**
 * Convenience command: Process and wait in one call
 *
 * Usage from extension:
 * const result = await vscode.commands.executeCommand('roopik.pipeline.buildComponent', input);
 */
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'roopik.pipeline.buildComponent',
			title: localize2('roopik.pipeline.buildComponent', 'Build Component'),
			category: localize2('roopik.category', 'Roopik'),
			f1: false
		});
	}

	async run(accessor: ServicesAccessor, input: ComponentInput, timeout?: number): Promise<TransformedComponent> {
		const pipelineService = accessor.get(ISandboxPipelineService);
		const jobId = await pipelineService.processComponent(input);
		return pipelineService.waitForCompletion(jobId, timeout || 30000);
	}
});
