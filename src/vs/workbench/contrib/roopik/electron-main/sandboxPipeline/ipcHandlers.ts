/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { IpcMainInvokeEvent, ipcMain } from 'electron';
import { SandboxPipelineMainService } from './sandboxPipelineMainService.js';
import { ComponentInput } from '../../common/sandboxPipeline/types.js';

/**
 * IPC Handlers for Sandbox Pipeline
 *
 * Registers IPC channels that the browser process can call.
 * Routes requests to the main process pipeline service.
 */
export class SandboxPipelineIPCHandlers {

	constructor(
		private readonly pipelineService: SandboxPipelineMainService
	) {
		this.registerHandlers();
	}

	private registerHandlers(): void {
		// Process component
		ipcMain.handle('sandboxPipeline:processComponent', async (event: IpcMainInvokeEvent, input: ComponentInput) => {
			return this.pipelineService.processComponent(input);
		});

		// Validate component
		ipcMain.handle('sandboxPipeline:validateComponent', async (event: IpcMainInvokeEvent, input: ComponentInput) => {
			return this.pipelineService.validateComponent(input);
		});

		// Get job status
		ipcMain.handle('sandboxPipeline:getJobStatus', async (event: IpcMainInvokeEvent, jobId: string) => {
			return this.pipelineService.getJobStatus(jobId);
		});

		// Get all jobs
		ipcMain.handle('sandboxPipeline:getAllJobs', async (event: IpcMainInvokeEvent) => {
			return this.pipelineService.getAllJobs();
		});

		// Get queue status
		ipcMain.handle('sandboxPipeline:getQueueStatus', async (event: IpcMainInvokeEvent) => {
			return this.pipelineService.getQueueStatus();
		});

		// Wait for completion
		ipcMain.handle('sandboxPipeline:waitForCompletion', async (event: IpcMainInvokeEvent, jobId: string, timeout?: number) => {
			return this.pipelineService.waitForCompletion(jobId, timeout);
		});

		// Cancel job
		ipcMain.handle('sandboxPipeline:cancelJob', async (event: IpcMainInvokeEvent, jobId: string) => {
			return this.pipelineService.cancelJob(jobId);
		});

		// Clear completed jobs
		ipcMain.handle('sandboxPipeline:clearCompletedJobs', async (event: IpcMainInvokeEvent) => {
			return this.pipelineService.clearCompletedJobs();
		});
	}

	dispose(): void {
		// Remove all handlers
		ipcMain.removeHandler('sandboxPipeline:processComponent');
		ipcMain.removeHandler('sandboxPipeline:validateComponent');
		ipcMain.removeHandler('sandboxPipeline:getJobStatus');
		ipcMain.removeHandler('sandboxPipeline:getAllJobs');
		ipcMain.removeHandler('sandboxPipeline:getQueueStatus');
		ipcMain.removeHandler('sandboxPipeline:waitForCompletion');
		ipcMain.removeHandler('sandboxPipeline:cancelJob');
		ipcMain.removeHandler('sandboxPipeline:clearCompletedJobs');
	}
}
