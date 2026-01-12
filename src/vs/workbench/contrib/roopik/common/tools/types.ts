/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Roopik Tools Types
 *
 * Shared types and constants for Roopik tools IPC channel.
 * These are used by both the main process (RoopikToolsChannel) and
 * browser/renderer process (roopikToolsCommands).
 *
 * Tool Naming Convention: category_action (e.g., browser_navigate, component_add)
 */

// Channel name for IPC registration
export const ROOPIK_TOOLS_CHANNEL_NAME = 'roopik.tools';

/**
 * Standard result format for all tool calls
 */
export interface RoopikToolResult<T = unknown> {
	success: boolean;
	data?: T;
	error?: string;
}
