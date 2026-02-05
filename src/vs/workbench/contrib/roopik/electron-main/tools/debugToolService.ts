/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Debug Tool Service - Electron Main Process
 *
 * Routes MCP debug tool calls to the Extension Host via the Renderer Bridge.
 * The actual debugging logic lives in the roopik extension's AgentDebugService.
 *
 * Architecture:
 *   MCP Tool Call → This Service → RendererBridge → Renderer → Extension Host
 */

import type { ToolResult } from '../mcp/executor/types.js';
import type { RendererBridge } from '../bridge/rendererBridge.js';

// ============================================================================
// Debug Command Types (must match extension's DebugIPCHandler expectations)
// ============================================================================

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

// ============================================================================
// Debug Tool Service
// ============================================================================

/**
 * DebugToolService
 *
 * Routes debug tool calls to the Extension Host via the Renderer Bridge.
 * All methods return a standardized ToolResult<any> for MCP compatibility.
 */
export class DebugToolService {
	constructor(
		private readonly rendererBridge: RendererBridge
	) { }

	/**
	 * Execute a debug command via Extension Host
	 */
	private async executeCommand<T = any>(commandId: string, ...args: any[]): Promise<ToolResult<T>> {
		try {
			const result = await this.rendererBridge.executeCommand<T>(commandId, args);
			return {
				success: true,
				data: result
			};
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
		return this.executeCommand('roopik.debug.startAndWait', args);
	}

	/**
	 * Stop the active debug session
	 */
	async stop(): Promise<ToolResult<any>> {
		return this.executeCommand('roopik.debug.stop');
	}

	// ============================================================================
	// Breakpoint Management
	// ============================================================================

	/**
	 * Set a breakpoint
	 */
	async setBreakpoint(args: ISetBreakpointArgs): Promise<ToolResult<any>> {
		return this.executeCommand('roopik.debug.setBreakpoint', args);
	}

	/**
	 * Remove a breakpoint
	 */
	async removeBreakpoint(id: string): Promise<ToolResult<any>> {
		return this.executeCommand('roopik.debug.removeBreakpoint', id);
	}

	// ============================================================================
	// Execution Control
	// ============================================================================

	/**
	 * Step over N times (macro operation)
	 */
	async stepSmart(args: IStepArgs = {}): Promise<ToolResult<any>> {
		return this.executeCommand('roopik.debug.stepSmart', args);
	}

	/**
	 * Step into function
	 */
	async stepInto(): Promise<ToolResult<any>> {
		return this.executeCommand('roopik.debug.stepInto');
	}

	/**
	 * Step out of function
	 */
	async stepOut(): Promise<ToolResult<any>> {
		return this.executeCommand('roopik.debug.stepOut');
	}

	/**
	 * Run until specified line (uses temporary breakpoint - O(1))
	 */
	async runUntilLine(args: IRunUntilArgs): Promise<ToolResult<any>> {
		return this.executeCommand('roopik.debug.runUntilLine', args);
	}

	/**
	 * Continue execution until next breakpoint
	 */
	async continue(timeout?: number): Promise<ToolResult<any>> {
		return this.executeCommand('roopik.debug.continue', timeout);
	}

	// ============================================================================
	// State Inspection
	// ============================================================================

	/**
	 * Get current debug context
	 */
	async getContext(): Promise<ToolResult<any>> {
		return this.executeCommand('roopik.debug.getContext');
	}

	/**
	 * Evaluate expression in debug context
	 */
	async evaluate(args: IEvaluateArgs): Promise<ToolResult<any>> {
		return this.executeCommand('roopik.debug.evaluate', args);
	}
}
