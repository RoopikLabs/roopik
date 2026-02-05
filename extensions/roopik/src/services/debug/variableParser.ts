/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import type { IVariableParserOptions } from './types';

/**
 * VariableParser
 *
 * Recursively parses DAP variable references into clean JSON for agents.
 * Handles the complexity of variablesReference IDs returned by debuggers.
 *
 * Key features:
 * - Depth limiting (prevents infinite recursion on circular refs)
 * - Width limiting (prevents memory bloat on large arrays)
 * - Timeout protection
 * - Getter warning (some properties trigger code execution)
 */
export class VariableParser {
	private readonly maxDepth: number;
	private readonly maxWidth: number;
	private readonly timeout: number;

	constructor(options: IVariableParserOptions = {}) {
		this.maxDepth = options.maxDepth ?? 2;
		this.maxWidth = options.maxWidth ?? 20;
		this.timeout = options.timeout ?? 5000;
	}

	/**
	 * Parse variables from a debug session
	 *
	 * @param session - Active debug session
	 * @param variables - Array of DAP Variable objects
	 * @param depth - Current recursion depth
	 * @returns Parsed variables as clean JSON object
	 */
	async parseVariables(
		session: vscode.DebugSession,
		variables: any[],
		depth: number = 0
	): Promise<Record<string, any>> {
		// Depth limit check
		if (depth >= this.maxDepth) {
			return { __truncated: `Max depth (${this.maxDepth}) reached` };
		}

		if (!variables || variables.length === 0) {
			return {};
		}

		const result: Record<string, any> = {};

		// Width limit: Only process first maxWidth items
		const limitedVars = variables.slice(0, this.maxWidth);
		const wasLimited = variables.length > this.maxWidth;

		for (const v of limitedVars) {
			try {
				const parsed = await this.parseVariable(session, v, depth);
				result[v.name] = parsed;
			} catch (err) {
				// Handle parsing errors gracefully
				result[v.name] = `<error: ${err instanceof Error ? err.message : String(err)}>`;
			}
		}

		// Indicate truncation to agent
		if (wasLimited) {
			result.__truncated = `[... ${variables.length - this.maxWidth} more items]`;
		}

		return result;
	}

	/**
	 * Parse a single variable
	 */
	private async parseVariable(
		session: vscode.DebugSession,
		variable: any,
		depth: number
	): Promise<any> {
		// Simple value (no children) - string, number, boolean, null, undefined
		if (variable.variablesReference === 0) {
			return this.parseSimpleValue(variable.value, variable.type);
		}

		// Complex value (object, array) - need to expand children
		// WARNING: Some properties are getters that execute code when accessed!
		// Check for potential getter indicators
		if (this.isLikelyGetter(variable)) {
			return `<getter: ${variable.value}>`;
		}

		// Fetch children with timeout protection
		try {
			const childVars = await Promise.race([
				session.customRequest('variables', {
					variablesReference: variable.variablesReference
				}),
				this.createTimeout('Variable fetch timeout')
			]);

			// Recursively parse children
			return await this.parseVariables(session, childVars.variables, depth + 1);
		} catch (err) {
			// If we can't expand, return the preview value
			return variable.value || '<unexpandable>';
		}
	}

	/**
	 * Parse a simple (non-reference) value into appropriate JS type
	 */
	private parseSimpleValue(value: string, type?: string): any {
		if (value === 'undefined') return undefined;
		if (value === 'null') return null;
		if (value === 'true') return true;
		if (value === 'false') return false;

		// Check for number types
		if (type === 'number' || type === 'int' || type === 'float') {
			const num = parseFloat(value);
			if (!isNaN(num)) return num;
		}

		// Check for string with quotes (debugger often adds quotes)
		if (value.startsWith('"') && value.endsWith('"')) {
			return value.slice(1, -1);
		}
		if (value.startsWith("'") && value.endsWith("'")) {
			return value.slice(1, -1);
		}

		// Try to parse as number if it looks like one
		if (/^-?\d+(\.\d+)?$/.test(value)) {
			return parseFloat(value);
		}

		// Return as string
		return value;
	}

	/**
	 * Check if a variable is likely a getter (accessing it would execute code)
	 *
	 * Pro Tip from reviewer: Getters can be slow and cause hangs.
	 * We detect common patterns and avoid expanding them.
	 */
	private isLikelyGetter(variable: any): boolean {
		const value = variable.value || '';
		const name = variable.name || '';

		// Common getter indicators
		if (value.includes('[Getter]') || value.includes('(...)')) {
			return true;
		}

		// Computed property syntax
		if (name.startsWith('get ') || name.includes('()')) {
			return true;
		}

		// Presentation hint
		if (variable.presentationHint?.lazy) {
			return true;
		}

		return false;
	}

	/**
	 * Create a timeout promise
	 */
	private createTimeout(message: string): Promise<never> {
		return new Promise((_, reject) => {
			setTimeout(() => reject(new Error(message)), this.timeout);
		});
	}

	/**
	 * Variable names to exclude from local scope output.
	 * These are typically the global `this` object or Node.js module wrappers
	 * that produce massive noise (100+ properties) without value for debugging.
	 */
	private static readonly EXCLUDED_LOCAL_VARS = new Set([
		'this',       // Global object in Node.js (Buffer, crypto, fetch, etc.)
		'exports',    // CJS module wrapper
		'module',     // CJS module wrapper
		'require',    // CJS module wrapper
		'__dirname',  // CJS module wrapper
		'__filename', // CJS module wrapper
	]);

	/**
	 * Parse scopes from a frame and return local variables
	 *
	 * @param session - Active debug session
	 * @param frameId - Stack frame ID
	 * @returns Parsed local variables
	 */
	async parseScopesForFrame(
		session: vscode.DebugSession,
		frameId: number
	): Promise<Record<string, any>> {
		try {
			// Get scopes for the frame
			const scopesReply = await session.customRequest('scopes', { frameId });

			if (!scopesReply.scopes || scopesReply.scopes.length === 0) {
				return {};
			}

			// Find Local scope (most relevant for debugging)
			const localScope = scopesReply.scopes.find(
				(s: any) => s.name === 'Local' || s.name === 'Locals'
			);

			if (!localScope) {
				// Fall back to first scope if no Local scope found
				const firstScope = scopesReply.scopes[0];
				const varsReply = await session.customRequest('variables', {
					variablesReference: firstScope.variablesReference
				});
				return await this.parseVariables(session, varsReply.variables);
			}

			// Get variables from Local scope
			const varsReply = await session.customRequest('variables', {
				variablesReference: localScope.variablesReference
			});

			// Filter out noisy module-wrapper and global variables
			// These bloat the response with 100+ Node.js global properties
			const filteredVars = (varsReply.variables || []).filter(
				(v: any) => !VariableParser.EXCLUDED_LOCAL_VARS.has(v.name)
			);

			return await this.parseVariables(session, filteredVars);
		} catch (err) {
			return { __error: err instanceof Error ? err.message : String(err) };
		}
	}
}

// Default singleton instance
let defaultParser: VariableParser | null = null;

export function getVariableParser(options?: IVariableParserOptions): VariableParser {
	if (!defaultParser || options) {
		defaultParser = new VariableParser(options);
	}
	return defaultParser;
}
