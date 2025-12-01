/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { IServerChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import { SandboxPipelineMainService } from './sandboxPipelineMainService.js';

/**
 * IPC Channel for Sandbox Pipeline
 *
 * Routes calls from renderer process to main process SandboxPipelineMainService.
 */
export class SandboxPipelineChannel implements IServerChannel {
	constructor(private service: SandboxPipelineMainService) { }

	listen(_: unknown, event: string): Event<any> {
		// No events exposed directly via channel yet
		// We could expose job status updates here if needed
		return Event.None;
	}

	call(_: unknown, command: string, arg?: any): Promise<any> {
		switch (command) {
			case 'processComponent':
				return this.service.processComponent(arg);
			case 'validateComponent':
				return this.service.validateComponent(arg);
			case 'getJobStatus':
				return this.service.getJobStatus(arg);
			case 'getAllJobs':
				return this.service.getAllJobs();
			case 'getQueueStatus':
				return this.service.getQueueStatus();
			case 'waitForCompletion':
				// Expecting arg to be [jobId, timeout]
				if (Array.isArray(arg)) {
					return this.service.waitForCompletion(arg[0], arg[1]);
				}
				return this.service.waitForCompletion(arg);
			case 'cancelJob':
				return this.service.cancelJob(arg);
			case 'clearCompletedJobs':
				return this.service.clearCompletedJobs();
			default:
				throw new Error(`[SandboxPipelineChannel] Unknown command: ${command}`);
		}
	}
}
