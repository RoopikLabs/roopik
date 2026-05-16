/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Tool Executor Module
 *
 * Central dispatcher for MCP tool execution.
 * Routes tool calls to unified tool services.
 *
 * NOTE: Old executor classes (BrowserExecutor, CanvasExecutor, ProjectExecutor)
 * have been removed. Tool implementation now lives in electron-main/tools/*.
 */

// Types
export type {
	ToolResult,
	ImageResult,
	BrowserOpenResult,
	BrowserScreenshotResult,
	BrowserNavigateResult,
	BrowserActionResult,
	BrowserConsoleLogsResult,
	BrowserErrorsResult,
	BrowserPerformanceResult,
	BrowserStateResult,
	BrowserViewportResult,
	BrowserNetworkRequestsResult,
	NetworkRequestEntry,
	ElementInspectionResult,
	ScriptExecutionResult,
	CanvasInfo,
	CanvasListResult,
	ComponentInfo,
	ComponentListResult,
	ProjectServerInfo,
	ProjectStartResult,
	ProjectStopResult,
} from './types.js';

// Main Executor
export { ToolExecutor } from './toolExecutor.js';
export type { ToolCall, ToolCallResult } from './toolExecutor.js';
