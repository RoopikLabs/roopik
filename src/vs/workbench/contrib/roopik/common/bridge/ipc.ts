/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Main ↔ Renderer ↔ Extension Host Bridge - Shared Types
 *
 * This module defines the IPC protocol for communication between:
 * - Main Process (MCP Server, native menus, etc.)
 * - Renderer Process (Workbench UI)
 * - Extension Host (Extensions, vscode.commands)
 *
 * The Renderer acts as a bridge, using ICommandService to route
 * commands to the Extension Host automatically.
 *
 * Flow:
 *   Main → ipc('roopik:execute-command') → Renderer
 *   Renderer → ICommandService → Extension Host
 *   Extension Host → result → Renderer
 *   Renderer → ipc('roopik:command-response:${requestId}') → Main
 */

// ============================================================================
// IPC Channel Names
// NOTE: VS Code's sandbox only allows channels starting with 'vscode:'
// See: src/vs/base/parts/sandbox/electron-browser/preload.ts
// ============================================================================

/**
 * Channel for sending command execution requests from Main to Renderer
 */
export const MAIN_TO_RENDERER_COMMAND_CHANNEL = 'vscode:roopik-execute-command';

/**
 * Channel prefix for responses from Renderer to Main
 * Full channel: `${RENDERER_TO_MAIN_RESPONSE_PREFIX}${requestId}`
 */
export const RENDERER_TO_MAIN_RESPONSE_PREFIX = 'vscode:roopik-command-response:';

// ============================================================================
// Request/Response Types
// ============================================================================

/**
 * Request payload sent from Main to Renderer
 */
export interface IMainToRendererCommandRequest {
	/** Unique request ID for correlation */
	requestId: string;

	/** VS Code command ID to execute (e.g., 'roopik.debug.startAndWait') */
	commandId: string;

	/** Arguments to pass to the command */
	args?: any[];

	/** Timeout in milliseconds (optional, default handled by caller) */
	timeout?: number;
}

/**
 * Response payload sent from Renderer to Main
 */
export interface IRendererToMainCommandResponse {
	/** Request ID (matches the request) */
	requestId: string;

	/** Whether the command executed successfully */
	success: boolean;

	/** Result data on success */
	result?: any;

	/** Error message on failure */
	error?: string;

	/** Error stack on failure (for debugging) */
	stack?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
	return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Get the response channel for a given request ID
 */
export function getResponseChannel(requestId: string): string {
	return `${RENDERER_TO_MAIN_RESPONSE_PREFIX}${requestId}`;
}
