/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import type { ComponentInput, TransformedComponent, SandboxJob, QueueStatus, ValidationResult } from '../types/pipeline';

/**
 * CoreBridgeService - Bridge between Extension and Core's Sandbox Pipeline
 *
 * Handles communication with Core services via commands:
 * - roopik.pipeline.buildComponent (one-shot build)
 * - roopik.pipeline.processComponent (async job submission)
 * - roopik.pipeline.waitForCompletion (wait for job)
 * - roopik.pipeline.getJobStatus (check job status)
 *
 * NOTE: GridManager stays LOCAL in extension for 60fps performance!
 */
export class CoreBridgeService {
	private static instance: CoreBridgeService;

	private constructor() { }

	public static getInstance(): CoreBridgeService {
		if (!CoreBridgeService.instance) {
			CoreBridgeService.instance = new CoreBridgeService();
		}
		return CoreBridgeService.instance;
	}

	/**
	 * Build a component through Core's ESBuild pipeline (one-shot)
	 * Convenience method that submits job and waits for result
	 *
	 * @param input ComponentInput with files, framework, dependencies
	 * @param timeout Optional timeout in ms (default 30000)
	 * @returns TransformedComponent with bundled code ready for sandbox execution
	 */
	async buildComponent(input: ComponentInput, timeout?: number): Promise<TransformedComponent> {
		console.log('[CoreBridgeService] 🚀 Calling roopik.pipeline.buildComponent:', {
			inputId: input.id,
			framework: input.framework,
			files: Object.keys(input.files),
			dependencies: input.dependencies,
			timeout: timeout || 30000
		});

		try {
			const startTime = Date.now();
			const result = await vscode.commands.executeCommand<TransformedComponent>(
				'roopik.pipeline.buildComponent',
				input,
				timeout || 30000
			);
			const elapsed = Date.now() - startTime;

			if (!result) {
				console.error('[CoreBridgeService] ❌ No result from Core pipeline');
				throw new Error('No result from pipeline');
			}

			console.log('[CoreBridgeService] ✅ Core pipeline returned result:', {
				inputId: input.id,
				framework: result.framework,
				bundledCodeLength: result.bundledCode?.length || 0,
				cdnUrls: result.cdnUrls,
				transformTime: result.metadata?.transformTime,
				totalElapsed: elapsed
			});

			return result;
		} catch (error) {
			console.error('[CoreBridgeService] ❌ Build failed:', error);
			throw error;
		}
	}

	/**
	 * Submit a component for processing (async)
	 * Returns job ID immediately, use waitForCompletion to get result
	 *
	 * @param input ComponentInput
	 * @returns Job ID for tracking
	 */
	async processComponent(input: ComponentInput): Promise<string> {
		try {
			const jobId = await vscode.commands.executeCommand<string>(
				'roopik.pipeline.processComponent',
				input
			);
			if (!jobId) {
				throw new Error('No job ID returned from pipeline');
			}
			return jobId;
		} catch (error) {
			console.error('[CoreBridgeService] Process failed:', error);
			throw error;
		}
	}

	/**
	 * Wait for a job to complete
	 *
	 * @param jobId Job ID from processComponent
	 * @param timeout Optional timeout in ms (default 30000)
	 * @returns TransformedComponent when job completes
	 */
	async waitForCompletion(jobId: string, timeout?: number): Promise<TransformedComponent> {
		try {
			const result = await vscode.commands.executeCommand<TransformedComponent>(
				'roopik.pipeline.waitForCompletion',
				jobId,
				timeout || 30000
			);
			if (!result) {
				throw new Error('No result from pipeline');
			}
			return result;
		} catch (error) {
			console.error('[CoreBridgeService] Wait for completion failed:', error);
			throw error;
		}
	}

	/**
	 * Get job status
	 *
	 * @param jobId Job ID
	 * @returns SandboxJob with status info
	 */
	async getJobStatus(jobId: string): Promise<SandboxJob | undefined> {
		try {
			return await vscode.commands.executeCommand<SandboxJob | undefined>(
				'roopik.pipeline.getJobStatus',
				jobId
			);
		} catch (error) {
			console.error('[CoreBridgeService] Get job status failed:', error);
			return undefined;
		}
	}

	/**
	 * Get all jobs in queue
	 *
	 * @returns Array of SandboxJob
	 */
	async getAllJobs(): Promise<SandboxJob[]> {
		try {
			const jobs = await vscode.commands.executeCommand<SandboxJob[]>(
				'roopik.pipeline.getAllJobs'
			);
			return jobs || [];
		} catch (error) {
			console.error('[CoreBridgeService] Get all jobs failed:', error);
			return [];
		}
	}

	/**
	 * Get queue status
	 *
	 * @returns QueueStatus with counts
	 */
	async getQueueStatus(): Promise<QueueStatus> {
		try {
			const status = await vscode.commands.executeCommand<QueueStatus>(
				'roopik.pipeline.getQueueStatus'
			);
			return status || { queued: 0, processing: 0, completed: 0, failed: 0 };
		} catch (error) {
			console.error('[CoreBridgeService] Get queue status failed:', error);
			return { queued: 0, processing: 0, completed: 0, failed: 0 };
		}
	}

	/**
	 * Validate a component without building
	 *
	 * @param input ComponentInput
	 * @returns ValidationResult
	 */
	async validateComponent(input: ComponentInput): Promise<ValidationResult> {
		try {
			const result = await vscode.commands.executeCommand<ValidationResult>(
				'roopik.pipeline.validateComponent',
				input
			);
			return result || { valid: false, errors: ['No validation result'] };
		} catch (error) {
			console.error('[CoreBridgeService] Validate failed:', error);
			return { valid: false, errors: [String(error)] };
		}
	}

	/**
	 * Cancel a queued job
	 *
	 * @param jobId Job ID
	 * @returns true if cancelled
	 */
	async cancelJob(jobId: string): Promise<boolean> {
		try {
			const result = await vscode.commands.executeCommand<boolean>(
				'roopik.pipeline.cancelJob',
				jobId
			);
			return result || false;
		} catch (error) {
			console.error('[CoreBridgeService] Cancel job failed:', error);
			return false;
		}
	}

	/**
	 * Clear completed and failed jobs from queue
	 *
	 * @returns Number of jobs cleared
	 */
	async clearCompletedJobs(): Promise<number> {
		try {
			const count = await vscode.commands.executeCommand<number>(
				'roopik.pipeline.clearCompletedJobs'
			);
			return count || 0;
		} catch (error) {
			console.error('[CoreBridgeService] Clear jobs failed:', error);
			return 0;
		}
	}

	/**
	 * Open a file in the editor
	 */
	async openFile(filePath: string, line?: number, column?: number): Promise<void> {
		try {
			const uri = vscode.Uri.file(filePath);
			const document = await vscode.workspace.openTextDocument(uri);
			const editor = await vscode.window.showTextDocument(document);

			if (line !== undefined) {
				const position = new vscode.Position(line - 1, (column || 1) - 1);
				editor.selection = new vscode.Selection(position, position);
				editor.revealRange(
					new vscode.Range(position, position),
					vscode.TextEditorRevealType.InCenter
				);
			}
		} catch (error) {
			console.error('[CoreBridgeService] Open file failed:', error);
			vscode.window.showErrorMessage(`Failed to open file: ${filePath}`);
		}
	}
}
