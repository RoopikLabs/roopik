/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Debug Context - Returned by all debugging operations
 * Provides complete state snapshot for AI agent decision-making
 */
export interface IDebugContext {
	/** Current status: 'stopped', 'running', 'timeout', 'error' */
	status: 'stopped' | 'running' | 'timeout' | 'error';

	/** Reason for stopping: 'breakpoint', 'step', 'exception', 'pause', 'entry' */
	reason?: 'breakpoint' | 'step' | 'exception' | 'pause' | 'entry' | 'timeout';

	/** Current source file path */
	file?: string;

	/** Current line number (1-indexed) */
	line?: number;

	/** Current column number */
	column?: number;

	/** Current function/method name */
	functionName?: string;

	/** Local variables (parsed to depth limit) */
	variables: Record<string, any>;

	/** Call stack frames */
	stack?: IStackFrame[];

	/** Console output captured during execution (last 50 lines) */
	consoleLogs: string[];

	/** Exception info if stopped on exception */
	exception?: IExceptionInfo | null;

	/** Available threads */
	threads?: IThreadInfo[];

	/** Error message if status is 'error' */
	error?: string;
}

/**
 * Stack frame information
 */
export interface IStackFrame {
	/** Frame ID */
	id: number;

	/** Function name */
	name: string;

	/** Source file path */
	file?: string;

	/** Line number (1-indexed) */
	line: number;

	/** Column number */
	column?: number;
}

/**
 * Exception information
 */
export interface IExceptionInfo {
	/** Exception ID/type */
	id?: string;

	/** Human-readable description */
	description: string;

	/** Break mode (always, uncaught, etc.) */
	breakMode?: string;

	/** Additional details/message */
	details?: string;
}

/**
 * Thread information
 */
export interface IThreadInfo {
	/** Thread ID */
	id: number;

	/** Thread name */
	name: string;
}

/**
 * Breakpoint information returned after setting
 */
export interface IBreakpointInfo {
	/** Breakpoint ID (for removal) */
	id: string;

	/** Whether breakpoint was verified by debug adapter */
	verified: boolean;

	/** Actual location (may differ from requested) */
	location: {
		file: string;
		line: number;
		column?: number;
	};

	/** Condition expression (if conditional breakpoint) */
	condition?: string;

	/** Hit condition (if hit count breakpoint) */
	hitCondition?: string;

	/** Log message (if logpoint) */
	logMessage?: string;
}

/**
 * Arguments for starting a debug session
 */
export interface IStartDebugArgs {
	/** File to debug (entry point) */
	file: string;

	/** Line number for initial breakpoint */
	line: number;

	/** Timeout in milliseconds (default: 30000) */
	timeout?: number;

	/** Whether to pause immediately on start */
	stopOnEntry?: boolean;

	/** Debug adapter type (default: auto-detect) */
	debugType?: 'node' | 'python' | 'chrome' | string;

	/** Additional launch configuration */
	launchConfig?: Record<string, any>;
}

/**
 * Arguments for setting a breakpoint
 */
export interface ISetBreakpointArgs {
	/** Source file path */
	file: string;

	/** Line number (1-indexed) */
	line: number;

	/** Whether breakpoint is enabled */
	enabled?: boolean;

	/** Condition expression (e.g., "x > 5") */
	condition?: string;

	/** Hit condition (e.g., ">=5" for 5th hit) */
	hitCondition?: string;

	/** Log message (converts to logpoint) */
	logMessage?: string;
}

/**
 * Arguments for stepping
 */
export interface IStepArgs {
	/** Number of steps to execute (default: 1) */
	count?: number;
}

/**
 * Arguments for run until
 */
export interface IRunUntilArgs {
	/** Target line number */
	line: number;

	/** Target file (optional, uses current file if not specified) */
	file?: string;

	/** Timeout in milliseconds */
	timeout?: number;
}

/**
 * Arguments for evaluate
 */
export interface IEvaluateArgs {
	/** Expression to evaluate */
	expression: string;

	/** Stack frame ID (optional, uses top frame if not specified) */
	frameId?: number;

	/** Evaluation context */
	context?: 'watch' | 'repl' | 'hover';
}

/**
 * Result of expression evaluation
 */
export interface IEvaluateResult {
	/** The expression that was evaluated */
	expression: string;

	/** Result value as string */
	result: string;

	/** Result type */
	type?: string;

	/** Variable reference for complex objects */
	variablesReference?: number;
}

/**
 * Debug command types for IPC
 */
export type DebugCommand =
	| 'START_AND_WAIT'
	| 'STOP'
	| 'SET_BREAKPOINT'
	| 'REMOVE_BREAKPOINT'
	| 'STEP_SMART'
	| 'STEP_INTO'
	| 'STEP_OUT'
	| 'RUN_UNTIL_LINE'
	| 'CONTINUE'
	| 'PAUSE'
	| 'GET_CONTEXT'
	| 'EVALUATE';

/**
 * IPC payload for debug commands
 */
export interface IDebugCommandPayload {
	/** Unique request ID for response matching */
	id: string;

	/** Command type */
	command: DebugCommand;

	/** Command arguments */
	args: any;
}

/**
 * IPC response from debug service
 */
export interface IDebugCommandResponse {
	/** Request ID (matches payload.id) */
	id: string;

	/** Whether operation succeeded */
	success: boolean;

	/** Result data on success */
	result?: any;

	/** Error message on failure */
	error?: string;

	/** Error stack trace on failure */
	stack?: string;
}

/**
 * Variable parser options
 */
export interface IVariableParserOptions {
	/** Maximum depth for nested objects (default: 2) */
	maxDepth?: number;

	/** Maximum width for arrays (default: 20) */
	maxWidth?: number;

	/** Timeout for variable fetching (default: 5000ms) */
	timeout?: number;
}
