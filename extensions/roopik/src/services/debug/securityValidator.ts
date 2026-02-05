/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Security Validator for Agent Debug Service
 *
 * Provides security validation for debug operations to prevent:
 * 1. File access outside workspace
 * 2. Dangerous expression evaluation
 * 3. Other potential security risks
 *
 * This validator is used by AgentDebugService before executing any debug operation.
 */

import * as vscode from 'vscode';
import * as path from 'path';

// ============================================================================
// Security Configuration
// ============================================================================

/**
 * Configuration for security validation
 */
export interface ISecurityConfig {
	/** Allow debugging files outside workspace (default: false) */
	allowOutsideWorkspace: boolean;

	/** Maximum timeout in milliseconds (default: 300000 = 5 minutes) */
	maxTimeout: number;

	/** Additional forbidden expression patterns */
	additionalForbiddenPatterns: RegExp[];
}

const DEFAULT_CONFIG: ISecurityConfig = {
	allowOutsideWorkspace: false,
	maxTimeout: 300000, // 5 minutes
	additionalForbiddenPatterns: []
};

// ============================================================================
// Workspace Validation
// ============================================================================

/**
 * Get the workspace root folder
 * Returns undefined if no workspace is open
 */
function getWorkspaceRoot(): string | undefined {
	const folders = vscode.workspace.workspaceFolders;
	if (!folders || folders.length === 0) {
		return undefined;
	}
	return folders[0].uri.fsPath;
}

/**
 * Check if a file path is within the workspace
 *
 * @param filePath - Absolute path to the file
 * @returns true if file is in workspace, false otherwise
 */
export function isFileInWorkspace(filePath: string): boolean {
	const workspaceRoot = getWorkspaceRoot();

	// If no workspace is open, we can't validate
	if (!workspaceRoot) {
		return true; // Allow if no workspace (single file mode)
	}

	try {
		// Normalize both paths for comparison
		const normalizedFile = path.normalize(path.resolve(filePath));
		const normalizedRoot = path.normalize(path.resolve(workspaceRoot));

		// Check if file path starts with workspace root
		// Also check for directory traversal attempts
		return normalizedFile.startsWith(normalizedRoot + path.sep) ||
			normalizedFile === normalizedRoot;
	} catch {
		return false;
	}
}

/**
 * Validate a file path for debugging
 *
 * @param filePath - Path to validate
 * @param config - Security configuration
 * @throws Error if validation fails
 */
export function validateFilePath(
	filePath: string,
	config: ISecurityConfig = DEFAULT_CONFIG
): void {
	if (!filePath) {
		throw new Error('File path is required');
	}

	// Check for obvious path traversal attempts
	if (filePath.includes('..')) {
		const normalized = path.normalize(filePath);
		if (normalized.includes('..')) {
			throw new Error('Path traversal not allowed');
		}
	}

	// Check workspace restriction
	if (!config.allowOutsideWorkspace && !isFileInWorkspace(filePath)) {
		throw new Error(
			`Security: Cannot debug files outside workspace. ` +
			`File "${path.basename(filePath)}" is not in the current workspace.`
		);
	}
}

// ============================================================================
// Expression Validation
// ============================================================================

/**
 * Patterns that are forbidden in evaluate expressions.
 * These patterns could be used to execute arbitrary code or access sensitive data.
 */
const FORBIDDEN_EXPRESSION_PATTERNS: RegExp[] = [
	// Module/require access
	/\brequire\s*\(/i,
	/\bimport\s*\(/i,
	/\bmodule\s*\.\s*exports\b/i,

	// Code execution
	/\beval\s*\(/i,
	/\bFunction\s*\(/i,
	/\bsetTimeout\s*\(/i,
	/\bsetInterval\s*\(/i,
	/\bsetImmediate\s*\(/i,

	// Process/system access
	/\bprocess\s*\.\s*env\b/i,
	/\bprocess\s*\.\s*exit\b/i,
	/\bprocess\s*\.\s*kill\b/i,
	/\bchild_process\b/i,
	/\bexec\s*\(/i,
	/\bexecSync\s*\(/i,
	/\bspawn\s*\(/i,
	/\bspawnSync\s*\(/i,

	// File system access
	/\bfs\s*\.\s*\w+\s*\(/i,
	/\bfs\s*\/\s*promises\b/i,
	/\breadFileSync\s*\(/i,
	/\bwriteFileSync\s*\(/i,
	/\bunlinkSync\s*\(/i,
	/\brmSync\s*\(/i,

	// Network access
	/\bhttp\s*\.\s*\w+\s*\(/i,
	/\bhttps\s*\.\s*\w+\s*\(/i,
	/\bfetch\s*\(/i,
	/\bXMLHttpRequest\b/i,
	/\bWebSocket\b/i,

	// Global manipulation
	/\bglobal\s*\[/i,
	/\bglobalThis\s*\[/i,
	/\bwindow\s*\[/i,

	// Dangerous properties
	/\b__dirname\b/i,
	/\b__filename\b/i,
	/\b__proto__\b/i,
	/\bconstructor\s*\.\s*constructor\b/i,

	// Prototype pollution
	/prototype\s*\[/i,
	/\bObject\s*\.\s*defineProperty\s*\(/i,
	/\bObject\s*\.\s*setPrototypeOf\s*\(/i,
	/\bReflect\s*\.\s*\w+\s*\(/i,
];

/**
 * Result of expression validation
 */
export interface IExpressionValidationResult {
	valid: boolean;
	error?: string;
	matchedPattern?: string;
}

/**
 * Validate an expression for safe evaluation
 *
 * @param expression - The expression to validate
 * @param config - Security configuration
 * @returns Validation result
 */
export function validateExpression(
	expression: string,
	config: ISecurityConfig = DEFAULT_CONFIG
): IExpressionValidationResult {
	if (!expression || expression.trim().length === 0) {
		return { valid: false, error: 'Expression cannot be empty' };
	}

	// Check length limit (prevent DoS with very long expressions)
	if (expression.length > 10000) {
		return { valid: false, error: 'Expression too long (max 10000 characters)' };
	}

	// Combine default and additional patterns
	const allPatterns = [
		...FORBIDDEN_EXPRESSION_PATTERNS,
		...config.additionalForbiddenPatterns
	];

	// Check against all forbidden patterns
	for (const pattern of allPatterns) {
		if (pattern.test(expression)) {
			return {
				valid: false,
				error: `Expression contains forbidden pattern: ${pattern.toString()}`,
				matchedPattern: pattern.toString()
			};
		}
	}

	return { valid: true };
}

/**
 * Validate and throw if expression is not safe
 *
 * @param expression - The expression to validate
 * @param config - Security configuration
 * @throws Error if expression is not safe
 */
export function assertSafeExpression(
	expression: string,
	config: ISecurityConfig = DEFAULT_CONFIG
): void {
	const result = validateExpression(expression, config);
	if (!result.valid) {
		throw new Error(`Security: Unsafe expression - ${result.error}`);
	}
}

// ============================================================================
// Timeout Validation
// ============================================================================

/**
 * Validate and clamp a timeout value
 *
 * @param timeout - Requested timeout in milliseconds
 * @param config - Security configuration
 * @returns Clamped timeout value
 */
export function validateTimeout(
	timeout: number | undefined,
	config: ISecurityConfig = DEFAULT_CONFIG
): number {
	const minTimeout = 1000;  // 1 second minimum
	const maxTimeout = config.maxTimeout;
	const defaultTimeout = 30000; // 30 seconds

	if (timeout === undefined || timeout === null) {
		return defaultTimeout;
	}

	if (typeof timeout !== 'number' || isNaN(timeout)) {
		return defaultTimeout;
	}

	return Math.max(minTimeout, Math.min(maxTimeout, timeout));
}

// ============================================================================
// Line Number Validation
// ============================================================================

/**
 * Validate a line number
 *
 * @param line - Line number to validate
 * @throws Error if line number is invalid
 */
export function validateLineNumber(line: number): void {
	if (typeof line !== 'number' || isNaN(line)) {
		throw new Error('Line number must be a number');
	}

	if (line < 1) {
		throw new Error('Line number must be at least 1');
	}

	if (line > 10000000) {
		throw new Error('Line number too large');
	}

	if (!Number.isInteger(line)) {
		throw new Error('Line number must be an integer');
	}
}

// ============================================================================
// Security Validator Class
// ============================================================================

/**
 * SecurityValidator
 *
 * Centralized security validation for debug operations.
 * Use this class to validate inputs before executing debug commands.
 */
export class SecurityValidator {
	private config: ISecurityConfig;

	constructor(config: Partial<ISecurityConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	/**
	 * Validate arguments for startAndWait
	 */
	validateStartArgs(args: { file: string; line: number; timeout?: number }): void {
		validateFilePath(args.file, this.config);
		validateLineNumber(args.line);
		args.timeout = validateTimeout(args.timeout, this.config);
	}

	/**
	 * Validate arguments for setBreakpoint
	 */
	validateBreakpointArgs(args: { file: string; line: number; condition?: string }): void {
		validateFilePath(args.file, this.config);
		validateLineNumber(args.line);

		// Validate condition if provided
		if (args.condition) {
			assertSafeExpression(args.condition, this.config);
		}
	}

	/**
	 * Validate arguments for runUntilLine
	 */
	validateRunUntilArgs(args: { line: number; file?: string; timeout?: number }): void {
		validateLineNumber(args.line);

		if (args.file) {
			validateFilePath(args.file, this.config);
		}

		args.timeout = validateTimeout(args.timeout, this.config);
	}

	/**
	 * Validate arguments for evaluate
	 */
	validateEvaluateArgs(args: { expression: string }): void {
		assertSafeExpression(args.expression, this.config);
	}

	/**
	 * Validate a generic timeout
	 */
	validateAndClampTimeout(timeout?: number): number {
		return validateTimeout(timeout, this.config);
	}

	/**
	 * Check if a file is in the workspace
	 */
	isInWorkspace(filePath: string): boolean {
		return isFileInWorkspace(filePath);
	}

	/**
	 * Get the current configuration
	 */
	getConfig(): Readonly<ISecurityConfig> {
		return { ...this.config };
	}

	/**
	 * Update configuration
	 */
	updateConfig(config: Partial<ISecurityConfig>): void {
		this.config = { ...this.config, ...config };
	}
}

// ============================================================================
// Singleton Instance
// ============================================================================

let _instance: SecurityValidator | undefined;

/**
 * Get the singleton SecurityValidator instance
 */
export function getSecurityValidator(): SecurityValidator {
	if (!_instance) {
		_instance = new SecurityValidator();
	}
	return _instance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetSecurityValidator(): void {
	_instance = undefined;
}
