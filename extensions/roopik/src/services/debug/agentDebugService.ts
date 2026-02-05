/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { VariableParser } from './variableParser';
import { getSecurityValidator } from './securityValidator';
import type {
	IDebugContext,
	IBreakpointInfo,
	IStartDebugArgs,
	ISetBreakpointArgs,
	IStepArgs,
	IRunUntilArgs,
	IEvaluateArgs,
	IEvaluateResult,
	IStackFrame,
	IExceptionInfo,
	IThreadInfo
} from './types';

/**
 * AgentDebugService
 *
 * Provides programmatic debugging capabilities for AI agents.
 * Uses the "Promise Trap" pattern to make async debugging events
 * appear synchronous to the calling agent.
 *
 * Key features:
 * - Start debug sessions and wait for breakpoint hits
 * - Macro operations (step N times, run until line)
 * - Full context capture (variables, stack, console output, exceptions)
 * - Auto UI sync (yellow line moves, variables panel updates)
 */
export class AgentDebugService {
	private readonly variableParser: VariableParser;
	private capturedOutput: string[] = [];
	private trackerDisposable: vscode.Disposable | null = null;
	private trackedBreakpoints: Map<string, vscode.Breakpoint> = new Map();

	constructor() {
		this.variableParser = new VariableParser({
			maxDepth: 2,
			maxWidth: 20,
			timeout: 5000
		});
	}

	// ============================================================================
	// Session Management
	// ============================================================================

	/**
	 * Start a debug session and wait for the first breakpoint hit
	 * This is the primary "entry point" for agent debugging
	 */
	async startAndWaitForBreakpoint(args: IStartDebugArgs): Promise<IDebugContext> {
		// Security validation
		const security = getSecurityValidator();
		security.validateStartArgs(args);

		// Default stopOnEntry to false when a specific breakpoint line is provided,
		// so execution runs to the requested line instead of pausing at the first statement.
		const { file, line, timeout = 30000, stopOnEntry = false, debugType, launchConfig = {} } = args;

		// Auto-stop any existing debug session so agents don't need to call stop first.
		// This is a common pattern: agent calls start_and_wait multiple times in a row.
		if (vscode.debug.activeDebugSession) {
			await vscode.debug.stopDebugging();
			this.cleanup();
			// Brief delay to let the debug adapter fully tear down
			await new Promise(resolve => setTimeout(resolve, 500));
		}

		// Clear previous output buffer
		this.capturedOutput = [];

		// 1. Set initial breakpoint
		const bp = new vscode.SourceBreakpoint(
			new vscode.Location(
				vscode.Uri.file(file),
				new vscode.Position(line - 1, 0) // 0-indexed
			)
		);
		vscode.debug.addBreakpoints([bp]);
		this.trackedBreakpoints.set(`${file}:${line}`, bp);

		// 2. Prepare launch configuration
		const type = debugType || this.detectDebugType(file);
		const config: vscode.DebugConfiguration = {
			type,
			request: 'launch',
			name: 'Roopik Agent Debug',
			program: file,
			stopOnEntry,
			...launchConfig
		};

		// 3. Start debug session
		const started = await vscode.debug.startDebugging(undefined, config);
		if (!started) {
			return this.createErrorContext('Failed to start debug session');
		}

		// 4. Wait for stopped event using Promise Trap
		return this.waitForStopAndCapture(timeout);
	}

	/**
	 * Stop the active debug session
	 */
	async stop(): Promise<{ success: boolean }> {
		await vscode.debug.stopDebugging();
		this.cleanup();
		return { success: true };
	}

	// ============================================================================
	// Breakpoint Management
	// ============================================================================

	/**
	 * Set a breakpoint at specified location
	 */
	async setBreakpoint(args: ISetBreakpointArgs): Promise<IBreakpointInfo> {
		// Security validation
		const security = getSecurityValidator();
		security.validateBreakpointArgs(args);

		const { file, line, enabled = true, condition, hitCondition, logMessage } = args;

		const location = new vscode.Location(
			vscode.Uri.file(file),
			new vscode.Position(line - 1, 0)
		);

		let bp: vscode.Breakpoint;

		if (logMessage) {
			// Create logpoint
			bp = new vscode.SourceBreakpoint(location, enabled, condition, hitCondition, logMessage);
		} else if (condition || hitCondition) {
			// Create conditional breakpoint
			bp = new vscode.SourceBreakpoint(location, enabled, condition, hitCondition);
		} else {
			// Create simple breakpoint
			bp = new vscode.SourceBreakpoint(location, enabled);
		}

		vscode.debug.addBreakpoints([bp]);
		const key = `${file}:${line}`;
		this.trackedBreakpoints.set(key, bp);

		return {
			id: key,
			verified: true, // Will be updated by debug adapter
			location: { file, line },
			condition,
			hitCondition,
			logMessage
		};
	}

	/**
	 * Remove a breakpoint by ID, or remove ALL breakpoints (including user-set) if id is "all"
	 */
	async removeBreakpoint(id: string): Promise<{ success: boolean; removed?: number }> {
		// Special case: remove ALL breakpoints in the IDE (agent-set + user-set)
		if (id === 'all') {
			const allInIde = vscode.debug.breakpoints;
			const count = allInIde.length;
			if (count > 0) {
				vscode.debug.removeBreakpoints(allInIde);
				this.trackedBreakpoints.clear();
			}
			return { success: true, removed: count };
		}

		// Try tracked first (agent-set)
		const bp = this.trackedBreakpoints.get(id);
		if (bp) {
			vscode.debug.removeBreakpoints([bp]);
			this.trackedBreakpoints.delete(id);
			return { success: true, removed: 1 };
		}

		// Try to find by id "filePath:line" in IDE breakpoints (user-set or from other source)
		const allBps = vscode.debug.breakpoints;
		for (const b of allBps) {
			if (b instanceof vscode.SourceBreakpoint) {
				const loc = b.location;
				const bpId = `${loc.uri.fsPath}:${loc.range.start.line + 1}`;
				if (bpId === id) {
					vscode.debug.removeBreakpoints([b]);
					this.trackedBreakpoints.delete(bpId);
					return { success: true, removed: 1 };
				}
			}
		}
		return { success: false, removed: 0 };
	}

	/**
	 * List ALL breakpoints in the IDE (agent-set and user-set).
	 * ID format: "filePath:line" (1-indexed line). Use this id in remove_breakpoint to clear one, or "all" to clear all.
	 */
	async listBreakpoints(): Promise<IBreakpointInfo[]> {
		const result: IBreakpointInfo[] = [];
		const allBps = vscode.debug.breakpoints;
		for (const bp of allBps) {
			if (bp instanceof vscode.SourceBreakpoint) {
				const loc = bp.location;
				const line1 = loc.range.start.line + 1;
				const id = `${loc.uri.fsPath}:${line1}`;
				result.push({
					id,
					verified: true,
					location: {
						file: loc.uri.fsPath,
						line: line1
					},
					condition: bp.condition,
					hitCondition: bp.hitCondition,
					logMessage: bp.logMessage
				});
			}
		}
		return result;
	}

	// ============================================================================
	// Execution Control - Macro Operations
	// ============================================================================

	/**
	 * Step over N times (macro operation to reduce LLM calls)
	 */
	async stepSmart(args: IStepArgs = {}): Promise<IDebugContext> {
		const { count = 1 } = args;
		const session = vscode.debug.activeDebugSession;

		if (!session) {
			return this.createErrorContext('No active debug session');
		}

		for (let i = 0; i < count; i++) {
			// Get current thread ID
			const threadId = await this.getActiveThreadId(session);

			// Send step command
			await session.customRequest('next', { threadId });

			// Wait for stop
			const context = await this.waitForStopAndCapture(5000);

			// If we hit breakpoint or exception early, stop stepping
			if (context.reason === 'breakpoint' || context.reason === 'exception') {
				return context;
			}
		}

		// Return final context after all steps
		return this.captureContext(session);
	}

	/**
	 * Step into function
	 */
	async stepInto(): Promise<IDebugContext> {
		const session = vscode.debug.activeDebugSession;
		if (!session) {
			return this.createErrorContext('No active debug session');
		}

		const threadId = await this.getActiveThreadId(session);
		await session.customRequest('stepIn', { threadId });

		return this.waitForStopAndCapture(5000);
	}

	/**
	 * Step out of current function
	 */
	async stepOut(): Promise<IDebugContext> {
		const session = vscode.debug.activeDebugSession;
		if (!session) {
			return this.createErrorContext('No active debug session');
		}

		const threadId = await this.getActiveThreadId(session);
		await session.customRequest('stepOut', { threadId });

		return this.waitForStopAndCapture(10000);
	}

	/**
	 * Run until specified line (O(1) using temporary breakpoint)
	 * CRITICAL FIX: Uses temp breakpoint instead of stepping loop
	 */
	async runUntilLine(args: IRunUntilArgs): Promise<IDebugContext> {
		// Security validation
		const security = getSecurityValidator();
		security.validateRunUntilArgs(args);

		const { line, file, timeout = 30000 } = args;
		const session = vscode.debug.activeDebugSession;

		if (!session) {
			return this.createErrorContext('No active debug session');
		}

		// Get current context to determine file and check line position
		const currentContext = await this.captureContext(session);
		let targetFile = file || currentContext.file;

		if (!targetFile) {
			return this.createErrorContext('Could not determine target file');
		}

		// If target line is behind or equal to current line in the same file,
		// return immediately with a helpful error instead of timing out
		const isSameFile = !file || (currentContext.file &&
			targetFile.toLowerCase() === currentContext.file.toLowerCase());
		if (isSameFile && currentContext.line && line <= currentContext.line) {
			return {
				...currentContext,
				error: `Target line ${line} is at or before current line ${currentContext.line}. ` +
					`Execution only moves forward. Use debug_start_and_wait to restart from the beginning.`
			};
		}

		// Create TEMPORARY breakpoint at target line
		const tempBp = new vscode.SourceBreakpoint(
			new vscode.Location(
				vscode.Uri.file(targetFile),
				new vscode.Position(line - 1, 0)
			)
		);

		vscode.debug.addBreakpoints([tempBp]);

		try {
			// Press "Continue" - FAST! O(1) teleport
			const threadId = await this.getActiveThreadId(session);
			await session.customRequest('continue', { threadId });

			// Wait for stop at our temp breakpoint
			const context = await this.waitForStopAndCapture(timeout);

			return context;
		} finally {
			// ALWAYS clean up: Remove temporary breakpoint
			vscode.debug.removeBreakpoints([tempBp]);
		}
	}

	/**
	 * Continue execution until next breakpoint
	 */
	async continue(timeout: number = 30000): Promise<IDebugContext> {
		// Validate and clamp timeout
		const security = getSecurityValidator();
		timeout = security.validateAndClampTimeout(timeout);

		const session = vscode.debug.activeDebugSession;
		if (!session) {
			return this.createErrorContext('No active debug session');
		}

		const threadId = await this.getActiveThreadId(session);
		await session.customRequest('continue', { threadId });

		return this.waitForStopAndCapture(timeout);
	}

	/**
	 * Pause execution
	 */
	async pause(): Promise<IDebugContext> {
		const session = vscode.debug.activeDebugSession;
		if (!session) {
			return this.createErrorContext('No active debug session');
		}

		const threadId = await this.getActiveThreadId(session);
		await session.customRequest('pause', { threadId });

		return this.waitForStopAndCapture(5000);
	}

	// ============================================================================
	// State Inspection
	// ============================================================================

	/**
	 * Get current debug context without moving execution
	 */
	async getContext(): Promise<IDebugContext> {
		const session = vscode.debug.activeDebugSession;
		if (!session) {
			return this.createErrorContext('No active debug session');
		}

		return this.captureContext(session);
	}

	/**
	 * Evaluate expression in current debug context.
	 * Fetches a fresh frame ID from the current stack so the adapter doesn't return "Stack frame not found".
	 */
	async evaluate(args: IEvaluateArgs): Promise<IEvaluateResult> {
		// Security validation - block dangerous expressions
		const security = getSecurityValidator();
		security.validateEvaluateArgs(args);

		const { expression, frameId, context = 'repl' } = args;
		const session = vscode.debug.activeDebugSession;

		if (!session) {
			throw new Error('No active debug session');
		}

		const runEvaluate = async (frameIdToUse: number) => {
			return session!.customRequest('evaluate', {
				expression,
				frameId: frameIdToUse,
				context
			});
		};

		const getTopFrameId = async (): Promise<number> => {
			const threadId = await this.getActiveThreadId(session!);
			const stackReply = await session!.customRequest('stackTrace', {
				threadId,
				startFrame: 0,
				levels: 1
			});
			if (!stackReply.stackFrames || stackReply.stackFrames.length === 0) {
				throw new Error('No stack frames available. Session may not be paused.');
			}
			return stackReply.stackFrames[0].id;
		};

		// Prefer fresh frame ID so we don't use a stale one after step/continue
		let targetFrameId = frameId;
		if (targetFrameId === undefined) {
			targetFrameId = await getTopFrameId();
		}

		try {
			const reply = await runEvaluate(targetFrameId);
			return {
				expression,
				result: reply.result,
				type: reply.type,
				variablesReference: reply.variablesReference
			};
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			// Adapter can return "Stack frame not found" when frameId is stale (e.g. after step/continue)
			const isFrameError = /stack frame|frame not found|frameId|Invalid frame/i.test(msg);
			if (isFrameError) {
				// Retry once with a freshly resolved frame ID
				targetFrameId = await getTopFrameId();
				const reply = await runEvaluate(targetFrameId);
				return {
					expression,
					result: reply.result,
					type: reply.type,
					variablesReference: reply.variablesReference
				};
			}
			throw err;
		}
	}

	// ============================================================================
	// Promise Trap Pattern - Core Implementation
	// ============================================================================

	/**
	 * Wait for debugger to stop and capture full context
	 * This is the "Promise Trap" - blocks until stopped event received
	 */
	private waitForStopAndCapture(timeoutMs: number): Promise<IDebugContext> {
		return new Promise((resolve) => {
			let resolved = false;
			let stopReason = 'unknown';
			let stoppedBody: any = null;

			// Timeout safety net
			const timeout = setTimeout(() => {
				if (!resolved) {
					resolved = true;
					this.cleanupTracker();
					resolve({
						status: 'timeout',
						reason: 'timeout',
						variables: {},
						consoleLogs: [...this.capturedOutput],
						error: `Timeout after ${timeoutMs}ms`
					});
				}
			}, timeoutMs);

			// Create tracker to intercept DAP messages
			this.trackerDisposable = vscode.debug.registerDebugAdapterTrackerFactory('*', {
				createDebugAdapterTracker: (session) => ({
					onDidSendMessage: (message: any) => {
						// Capture console output (stdout/stderr/console)
						if (message.type === 'event' && message.event === 'output') {
							const category = message.body?.category;
							if (category === 'stdout' || category === 'stderr' || category === 'console') {
								this.capturedOutput.push(message.body.output);
								// Keep last 50 lines
								if (this.capturedOutput.length > 50) {
									this.capturedOutput.shift();
								}
							}
						}

						// DAP sends "stopped" event when execution pauses
						if (message.type === 'event' && message.event === 'stopped') {
							if (!resolved) {
								resolved = true;
								stopReason = message.body?.reason || 'unknown';
								stoppedBody = message.body;
								clearTimeout(timeout);
								this.cleanupTracker();

								// Capture full context
								this.captureContextWithReason(session, stopReason, stoppedBody)
									.then(resolve)
									.catch((err) => {
										resolve(this.createErrorContext(err.message));
									});
							}
						}

						// Handle session termination (e.g. uncaught exception, process exit)
						if (message.type === 'event' && message.event === 'terminated') {
							if (!resolved) {
								resolved = true;
								clearTimeout(timeout);
								this.cleanupTracker();
								resolve({
									status: 'stopped',
									reason: 'exception', // Most common cause of unexpected termination
									variables: {},
									consoleLogs: [...this.capturedOutput],
									error: 'Debug session terminated (process may have exited due to uncaught exception)'
								});
							}
						}
					}
				})
			});
		});
	}

	/**
	 * Capture full debug context with reason info
	 */
	private async captureContextWithReason(
		session: vscode.DebugSession,
		reason: string,
		stoppedBody: any
	): Promise<IDebugContext> {
		try {
			// Get thread ID from stopped event or default to 1
			const threadId = stoppedBody?.threadId || 1;

			// Get stack trace
			const stackReply = await session.customRequest('stackTrace', {
				threadId,
				startFrame: 0,
				levels: 10
			});

			if (!stackReply.stackFrames || stackReply.stackFrames.length === 0) {
				return {
					status: 'stopped',
					reason: reason as any,
					variables: {},
					consoleLogs: [...this.capturedOutput],
					error: 'No stack frames available'
				};
			}

			const topFrame = stackReply.stackFrames[0];

			// Parse stack frames
			const stack: IStackFrame[] = stackReply.stackFrames.map((f: any) => ({
				id: f.id,
				name: f.name,
				file: f.source?.path,
				line: f.line,
				column: f.column
			}));

			// Get local variables
			const variables = await this.variableParser.parseScopesForFrame(session, topFrame.id);

			// Get exception info if stopped on exception
			let exception: IExceptionInfo | null = null;
			if (reason === 'exception') {
				exception = await this.getExceptionInfo(session, threadId, stoppedBody);
			}

			// Get thread info
			const threads = await this.getThreadInfo(session);

			return {
				status: 'stopped',
				reason: reason as any,
				file: topFrame.source?.path,
				line: topFrame.line,
				column: topFrame.column,
				functionName: topFrame.name,
				variables,
				stack,
				consoleLogs: [...this.capturedOutput],
				exception,
				threads
			};
		} catch (err) {
			return this.createErrorContext(err instanceof Error ? err.message : String(err));
		}
	}

	/**
	 * Capture current context (without waiting for stop event)
	 */
	private async captureContext(session: vscode.DebugSession): Promise<IDebugContext> {
		// This reuses the same logic but with 'step' as default reason
		return this.captureContextWithReason(session, 'step', null);
	}

	// ============================================================================
	// Helper Methods
	// ============================================================================

	/**
	 * Get the currently active thread ID
	 */
	private async getActiveThreadId(session: vscode.DebugSession): Promise<number> {
		try {
			const threadsReply = await session.customRequest('threads');
			if (threadsReply.threads && threadsReply.threads.length > 0) {
				return threadsReply.threads[0].id;
			}
		} catch {
			// Fall back to thread 1
		}
		return 1;
	}

	/**
	 * Get exception info when stopped on exception
	 */
	private async getExceptionInfo(
		session: vscode.DebugSession,
		threadId: number,
		stoppedBody: any
	): Promise<IExceptionInfo> {
		try {
			const exInfo = await session.customRequest('exceptionInfo', { threadId });
			return {
				id: exInfo.exceptionId,
				description: exInfo.description,
				breakMode: exInfo.breakMode,
				details: exInfo.details?.message || stoppedBody?.text || 'Unknown exception'
			};
		} catch {
			// exceptionInfo not supported by all debug adapters
			return {
				description: stoppedBody?.text || 'Exception occurred (details unavailable)'
			};
		}
	}

	/**
	 * Get available threads
	 */
	private async getThreadInfo(session: vscode.DebugSession): Promise<IThreadInfo[]> {
		try {
			const threadsReply = await session.customRequest('threads');
			return (threadsReply.threads || []).map((t: any) => ({
				id: t.id,
				name: t.name
			}));
		} catch {
			return [];
		}
	}

	/**
	 * Detect debug type from file extension
	 */
	private detectDebugType(file: string): string {
		const ext = file.split('.').pop()?.toLowerCase();
		switch (ext) {
			case 'ts':
			case 'js':
			case 'mjs':
			case 'cjs':
				return 'pwa-node';
			case 'py':
				return 'python';
			case 'go':
				return 'go';
			default:
				return 'pwa-node'; // Default to Node.js
		}
	}

	/**
	 * Create an error context response
	 */
	private createErrorContext(error: string): IDebugContext {
		return {
			status: 'error',
			variables: {},
			consoleLogs: [...this.capturedOutput],
			error
		};
	}

	/**
	 * Cleanup tracker disposable
	 */
	private cleanupTracker(): void {
		if (this.trackerDisposable) {
			this.trackerDisposable.dispose();
			this.trackerDisposable = null;
		}
	}

	/**
	 * Full cleanup
	 */
	private cleanup(): void {
		this.cleanupTracker();
		this.capturedOutput = [];
		this.trackedBreakpoints.clear();
	}

	/**
	 * Dispose service
	 */
	dispose(): void {
		this.cleanup();
	}
}

// Singleton instance
let instance: AgentDebugService | null = null;

export function getAgentDebugService(): AgentDebugService {
	if (!instance) {
		instance = new AgentDebugService();
	}
	return instance;
}
