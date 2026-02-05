/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Debug Tool Service - Electron Main Process
 *
 * Routes MCP debug tool calls to the Extension Host via VS Code commands.
 * The actual debugging logic lives in the roopik extension's AgentDebugService.
 *
 * Architecture:
 *   MCP Tool Call → This Service → vscode.commands.executeCommand() → Extension Host
 */

import type { ToolResult } from '../mcp/executor/types.js';

/**
 * Interface for debug command payloads
 */
interface IDebugCommandPayload {
	id: string;
	command: string;
	args: any;
}

/**
 * Interface for debug command responses
 */
interface IDebugCommandResponse {
	id: string;
	success: boolean;
	result?: any;
	error?: string;
}

/**
 * Arguments for starting a debug session
 */
export interface IStartDebugArgs {
	file: string;
	line: number;
	timeout?: number;
	stopOnEntry?: boolean;
	debugType?: 'node' | 'python' | 'chrome';
}

/**
 * Arguments for setting a breakpoint
 */
export interface ISetBreakpointArgs {
	file: string;
	line: number;
	enabled?: boolean;
	condition?: string;
	hitCondition?: string;
	logMessage?: string;
}

/**
 * Arguments for stepping
 */
export interface IStepArgs {
	count?: number;
}

/**
 * Arguments for run until
 */
export interface IRunUntilArgs {
	line: number;
	file?: string;
	timeout?: number;
}

/**
 * Arguments for evaluate
 */
export interface IEvaluateArgs {
	expression: string;
	frameId?: number;
	context?: 'watch' | 'repl' | 'hover';
}

/**
 * CommandService interface for executing VS Code commands
 * This is injected from the main process's command service
 */
export interface ICommandExecutor {
	executeCommand<T>(commandId: string, ...args: any[]): Promise<T>;
}

/**
 * DebugToolService
 *
 * Routes debug tool calls to the Extension Host via VS Code commands.
 */
export class DebugToolService {
	private requestCounter = 0;

	constructor(
		private readonly commandExecutor: ICommandExecutor
	) { }

	/**
	 * Generate a unique request ID
	 */
	private generateRequestId(): string {
		return `debug-req-${Date.now()}-${++this.requestCounter}`;
	}

	/**
	 * Execute a debug command via Extension Host
	 */
	private async executeDebugCommand(command: string, args: any = {}): Promise<ToolResult<any>> {
		try {
			const payload: IDebugCommandPayload = {
				id: this.generateRequestId(),
				command,
				args
			};

			// Execute command in Extension Host
			const response = await this.commandExecutor.executeCommand<IDebugCommandResponse>(
				'roopik.debug.execute',
				payload
			);

			if (response.success) {
				return {
					success: true,
					data: response.result
				};
			} else {
				return {
					success: false,
					error: response.error || 'Debug command failed'
				};
			}
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error executing debug command'
			};
		}
	}

	// ============================================================================
	// Session Management
	// ============================================================================

	/**
	 * Start a debug session and wait for breakpoint hit
	 */
	async startAndWait(args: IStartDebugArgs): Promise<ToolResult<any>> {
		return this.executeDebugCommand('START_AND_WAIT', args);
	}

	/**
	 * Stop the active debug session
	 */
	async stop(): Promise<ToolResult<any>> {
		return this.executeDebugCommand('STOP');
	}

	// ============================================================================
	// Breakpoint Management
	// ============================================================================

	/**
	 * Set a breakpoint
	 */
	async setBreakpoint(args: ISetBreakpointArgs): Promise<ToolResult<any>> {
		return this.executeDebugCommand('SET_BREAKPOINT', args);
	}

	/**
	 * Remove a breakpoint
	 */
	async removeBreakpoint(id: string): Promise<ToolResult<any>> {
		return this.executeDebugCommand('REMOVE_BREAKPOINT', id);
	}

	// ============================================================================
	// Execution Control
	// ============================================================================

	/**
	 * Step over N times (macro operation)
	 */
	async stepSmart(args: IStepArgs = {}): Promise<ToolResult<any>> {
		return this.executeDebugCommand('STEP_SMART', args);
	}

	/**
	 * Step into function
	 */
	async stepInto(): Promise<ToolResult<any>> {
		return this.executeDebugCommand('STEP_INTO');
	}

	/**
	 * Step out of function
	 */
	async stepOut(): Promise<ToolResult<any>> {
		return this.executeDebugCommand('STEP_OUT');
	}

	/**
	 * Run until specified line (uses temporary breakpoint - O(1))
	 */
	async runUntilLine(args: IRunUntilArgs): Promise<ToolResult<any>> {
		return this.executeDebugCommand('RUN_UNTIL_LINE', args);
	}

	/**
	 * Continue execution until next breakpoint
	 */
	async continue(timeout?: number): Promise<ToolResult<any>> {
		return this.executeDebugCommand('CONTINUE', { timeout });
	}

	// ============================================================================
	// State Inspection
	// ============================================================================

	/**
	 * Get current debug context
	 */
	async getContext(): Promise<ToolResult<any>> {
		return this.executeDebugCommand('GET_CONTEXT');
	}

	/**
	 * Evaluate expression in debug context
	 */
	async evaluate(args: IEvaluateArgs): Promise<ToolResult<any>> {
		return this.executeDebugCommand('EVALUATE', args);
	}
}
