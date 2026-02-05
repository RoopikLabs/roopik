/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { getAgentDebugService } from './agentDebugService';
import type {
	IDebugCommandPayload,
	IDebugCommandResponse,
	IDebugContext,
	IBreakpointInfo,
	IEvaluateResult,
	IStartDebugArgs,
	ISetBreakpointArgs,
	IStepArgs,
	IRunUntilArgs,
	IEvaluateArgs
} from './types';
import { Logger } from '../../logger';

/**
 * Debug IPC Handler
 *
 * Registers VS Code commands that serve as the IPC bridge between
 * Electron Main process (MCP Server) and the Extension Host (Debug Service).
 *
 * Architecture:
 *   MCP Tool → Main Process → vscode.commands.executeCommand() → This Handler → AgentDebugService
 */
export class DebugIPCHandler {
	private readonly debugService = getAgentDebugService();
	private readonly logger = Logger.getInstance();
	private disposables: vscode.Disposable[] = [];

	constructor() {
		this.registerCommands();
	}

	/**
	 * Register all debug IPC commands
	 */
	private registerCommands(): void {
		// Main unified command for all debug operations
		this.disposables.push(
			vscode.commands.registerCommand(
				'roopik.debug.execute',
				async (payload: IDebugCommandPayload): Promise<IDebugCommandResponse> => {
					return this.handleCommand(payload);
				}
			)
		);

		// Also register convenience commands for direct access
		this.registerConvenienceCommands();
	}

	/**
	 * Handle incoming debug command
	 */
	private async handleCommand(payload: IDebugCommandPayload): Promise<IDebugCommandResponse> {
		const { id, command, args } = payload;
		const startTime = Date.now();

		this.logger.debug('DebugIPC', `Executing command: ${command}`, { id, args });

		try {
			let result: any;

			switch (command) {
				case 'START_AND_WAIT':
					result = await this.debugService.startAndWaitForBreakpoint(args as IStartDebugArgs);
					break;

				case 'STOP':
					result = await this.debugService.stop();
					break;

				case 'SET_BREAKPOINT':
					result = await this.debugService.setBreakpoint(args as ISetBreakpointArgs);
					break;

				case 'REMOVE_BREAKPOINT':
					result = await this.debugService.removeBreakpoint(args as string);
					break;

				case 'LIST_BREAKPOINTS':
					result = await this.debugService.listBreakpoints();
					break;

				case 'STEP_SMART':
					result = await this.debugService.stepSmart(args as IStepArgs);
					break;

				case 'STEP_INTO':
					result = await this.debugService.stepInto();
					break;

				case 'STEP_OUT':
					result = await this.debugService.stepOut();
					break;

				case 'RUN_UNTIL_LINE':
					result = await this.debugService.runUntilLine(args as IRunUntilArgs);
					break;

				case 'CONTINUE':
					result = await this.debugService.continue(args?.timeout);
					break;

				case 'PAUSE':
					result = await this.debugService.pause();
					break;

				case 'GET_CONTEXT':
					result = await this.debugService.getContext();
					break;

				case 'EVALUATE':
					result = await this.debugService.evaluate(args as IEvaluateArgs);
					break;

				default:
					throw new Error(`Unknown debug command: ${command}`);
			}

			const duration = Date.now() - startTime;
			this.logger.debug('DebugIPC', `Command ${command} completed in ${duration}ms`);

			return {
				id,
				success: true,
				result
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			const errorStack = error instanceof Error ? error.stack : undefined;

			this.logger.error('DebugIPC', `Command ${command} failed: ${errorMessage}`);

			return {
				id,
				success: false,
				error: errorMessage,
				stack: errorStack
			};
		}
	}

	/**
	 * Register convenience commands for easier testing/debugging
	 * These can be called directly without the unified payload format
	 */
	private registerConvenienceCommands(): void {
		// Start and wait
		this.disposables.push(
			vscode.commands.registerCommand(
				'roopik.debug.startAndWait',
				async (args: IStartDebugArgs): Promise<IDebugContext> => {
					return this.debugService.startAndWaitForBreakpoint(args);
				}
			)
		);

		// Stop
		this.disposables.push(
			vscode.commands.registerCommand(
				'roopik.debug.stop',
				async (): Promise<{ success: boolean }> => {
					return this.debugService.stop();
				}
			)
		);

		// Set breakpoint
		this.disposables.push(
			vscode.commands.registerCommand(
				'roopik.debug.setBreakpoint',
				async (args: ISetBreakpointArgs): Promise<IBreakpointInfo> => {
					return this.debugService.setBreakpoint(args);
				}
			)
		);

		// Remove breakpoint
		this.disposables.push(
			vscode.commands.registerCommand(
				'roopik.debug.removeBreakpoint',
				async (id: string): Promise<{ success: boolean }> => {
					return this.debugService.removeBreakpoint(id);
				}
			)
		);

		// List breakpoints
		this.disposables.push(
			vscode.commands.registerCommand(
				'roopik.debug.listBreakpoints',
				async () => {
					return this.debugService.listBreakpoints();
				}
			)
		);

		// Step smart
		this.disposables.push(
			vscode.commands.registerCommand(
				'roopik.debug.stepSmart',
				async (args?: IStepArgs): Promise<IDebugContext> => {
					return this.debugService.stepSmart(args);
				}
			)
		);

		// Step into
		this.disposables.push(
			vscode.commands.registerCommand(
				'roopik.debug.stepInto',
				async (): Promise<IDebugContext> => {
					return this.debugService.stepInto();
				}
			)
		);

		// Step out
		this.disposables.push(
			vscode.commands.registerCommand(
				'roopik.debug.stepOut',
				async (): Promise<IDebugContext> => {
					return this.debugService.stepOut();
				}
			)
		);

		// Run until line
		this.disposables.push(
			vscode.commands.registerCommand(
				'roopik.debug.runUntilLine',
				async (args: IRunUntilArgs): Promise<IDebugContext> => {
					return this.debugService.runUntilLine(args);
				}
			)
		);

		// Continue
		this.disposables.push(
			vscode.commands.registerCommand(
				'roopik.debug.continue',
				async (timeout?: number): Promise<IDebugContext> => {
					return this.debugService.continue(timeout);
				}
			)
		);

		// Get context
		this.disposables.push(
			vscode.commands.registerCommand(
				'roopik.debug.getContext',
				async (): Promise<IDebugContext> => {
					return this.debugService.getContext();
				}
			)
		);

		// Evaluate
		this.disposables.push(
			vscode.commands.registerCommand(
				'roopik.debug.evaluate',
				async (args: IEvaluateArgs): Promise<IEvaluateResult> => {
					return this.debugService.evaluate(args);
				}
			)
		);
	}

	/**
	 * Get all disposables for cleanup
	 */
	getDisposables(): vscode.Disposable[] {
		return this.disposables;
	}

	/**
	 * Dispose handler and all registered commands
	 */
	dispose(): void {
		this.disposables.forEach(d => d.dispose());
		this.disposables = [];
		this.debugService.dispose();
	}
}

// Singleton instance
let instance: DebugIPCHandler | null = null;

export function initializeDebugIPCHandler(): DebugIPCHandler {
	if (!instance) {
		instance = new DebugIPCHandler();
	}
	return instance;
}

export function getDebugIPCHandler(): DebugIPCHandler | null {
	return instance;
}
