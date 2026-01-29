/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Tool Executor Types
 *
 * Common types for unified tool execution across all transports (HTTP MCP, WebSocket).
 */

// ============================================================================
// Tool Result Types
// ============================================================================

/**
 * Base result from any tool execution
 */
export interface ToolResult<T = unknown> {
	success: boolean;
	data?: T;
	error?: string;
}

/**
 * Result with image data (screenshots)
 */
export interface ImageResult {
	image: string;  // base64 or data-url
	format: 'base64' | 'data-url';
	width?: number;
	height?: number;
	devicePixelRatio?: number;
}

/**
 * Browser open result
 */
export interface BrowserOpenResult {
	browserViewId?: number;
	url?: string;
	message: string;
}

/**
 * Browser screenshot result
 */
export interface BrowserScreenshotResult extends ImageResult {
	viewport: {
		width: number;
		height: number;
		devicePixelRatio: number;
	};
}

/**
 * Browser navigation result
 */
export interface BrowserNavigateResult {
	browserViewId: number;
	url: string;
	message: string;
}

/**
 * Browser action result
 */
export interface BrowserActionResult {
	browserViewId: number;
	action: string;
	success: boolean;
	message: string;
}

/**
 * Console log entry
 */
export interface ConsoleLogEntry {
	id: string;
	timestamp: number;
	type: 'log' | 'debug' | 'info' | 'warn' | 'error' | 'dir' | 'dirxml' | 'table' | 'trace' | 'clear' | 'assert';
	message: string;
	args?: unknown[];
	location?: string;
}

/**
 * Browser console logs result
 */
export interface BrowserConsoleLogsResult {
	logs: ConsoleLogEntry[];
	count: number;
}

/**
 * Browser errors result (combines console errors + network failures)
 */
export interface BrowserErrorsResult {
	errors: Array<{
		id: string;
		timestamp: number;
		source: 'console' | 'network';
		type: string;
		message: string;
		location?: string;
		url?: string;
		method?: string;
	}>;
	count: number;
}

/**
 * Browser performance metrics result
 */
export interface BrowserPerformanceResult {
	webVitals: {
		lcp?: number;
		cls?: number;
		fcp?: number;
		ttfb?: number;
		domContentLoaded?: number;
		load?: number;
	};
	runtimeMetrics: {
		jsHeapUsedSize?: number;
		jsHeapTotalSize?: number;
		domNodes?: number;
		layoutCount?: number;
		recalcStyleCount?: number;
		layoutDuration?: number;
		recalcStyleDuration?: number;
		scriptDuration?: number;
		taskDuration?: number;
	};
}

/**
 * Browser CDP info result
 */
export interface BrowserCdpInfoResult {
	browserOpen: boolean;
	browserViewId?: number;
	currentUrl?: string;
	devServerRunning: boolean;
	availableTools: string[];
	message: string;
}

/**
 * Element inspection result
 * Matches the structure from browserTools.ts getElementStyles
 * Uses 'unknown' for complex nested types to avoid tight coupling
 */
export interface ElementInspectionResult {
	selector: string;
	element: {
		tag?: string;
		classes?: string[];
		componentName?: string;
		componentSource?: unknown;  // CSSSourceLocation from cssResolvers/types.ts
	};
	matchedRules?: Array<{
		selector: string;
		file?: string;
		location?: unknown;  // CSSSourceLocation type
		properties: unknown[];
		specificity?: unknown;  // Can be string or number[]
		origin?: string;
	}>;
	inlineStyles?: unknown;
	inheritedStyles?: unknown;
	properties?: unknown[];
	cssInJs?: unknown;
}

/**
 * Script execution result
 */
export interface ScriptExecutionResult {
	result: unknown;
	type: string;
}

// ============================================================================
// Canvas Result Types
// ============================================================================

/**
 * Canvas info
 */
export interface CanvasInfo {
	id: string;
	name: string;
	description?: string;
	componentCount: number;
}

/**
 * Canvas list result
 */
export interface CanvasListResult {
	canvases: CanvasInfo[];
	count: number;
}

/**
 * Component info
 */
export interface ComponentInfo {
	id: string;
	name?: string;  // componentName can be undefined
	path: string;
	canvasId: string;
	status: 'pending' | 'building' | 'ready' | 'error';
}

/**
 * Component list result
 */
export interface ComponentListResult {
	components: ComponentInfo[];
	count: number;
}

// ============================================================================
// Project Result Types
// ============================================================================

/**
 * Project server info
 */
export interface ProjectServerInfo {
	url?: string;  // May be undefined during 'starting' state
	projectRoot: string;
	framework?: string;
	status: 'starting' | 'running' | 'stopping' | 'stopped';
}

/**
 * Project start result
 */
export interface ProjectStartResult {
	url: string;
	projectRoot: string;
	framework?: string;
	message: string;
}

/**
 * Project stop result
 */
export interface ProjectStopResult {
	stopped: boolean;
	message: string;
}
