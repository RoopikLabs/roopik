/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Tool Schemas - Single Source of Truth
 *
 * All MCP tool definitions using Zod v4.
 * This file is the canonical source for tool schemas across:
 * - WebSocket MCP (mcpRequestRouter.ts) - converts to JSON Schema via .toJsonSchema()
 * - HTTP MCP (browserTools.ts) - uses Zod directly with MCP SDK
 * - STDIO Binary (tools.ts) - copies/imports these definitions
 *
 * DRY Principle: Define once, use everywhere.
 */

import { z } from 'zod';

// ============================================================================
// Browser Tool Schemas (14)
// ============================================================================

export const browserOpenSchema = z.object({
	url: z.string().optional().describe('Optional URL to navigate to')
});

export const browserNavigateSchema = z.object({
	url: z.string().describe('URL to navigate to')
});

export const browserReloadSchema = z.object({
	ignoreCache: z.boolean().optional().describe('Whether to ignore cache when reloading')
});

export const browserActionInputSchema = z.object({
	action: z.enum(['click', 'right_click', 'double_click', 'hover', 'drag', 'type', 'press', 'scroll'])
		.describe('The action to perform'),
	coordinate: z.string().optional().describe('Coordinates in "x,y" format for click/hover actions'),
	text: z.string().optional().describe('Text to type (for type action)'),
	key: z.string().optional().describe('Key to press (for press action)'),
	modifiers: z.array(z.string()).optional().describe('Modifier keys (ctrl, alt, shift, meta)'),
	deltaX: z.number().optional().describe('Horizontal scroll delta'),
	deltaY: z.number().optional().describe('Vertical scroll delta')
});

export const browserExecuteScriptSchema = z.object({
	script: z.string().describe('JavaScript code to execute')
});

export const browserInspectElementSchema = z.object({
	selector: z.string().describe('CSS selector for the element'),
	includeInherited: z.boolean().optional().describe('Include inherited styles')
});

export const browserGetErrorsSchema = z.object({
	limit: z.number().optional().describe('Maximum number of errors to return')
});

export const browserGetConsoleLogsSchema = z.object({
	types: z.array(z.string()).optional().describe('Filter by log types (log, warn, error, etc.)'),
	since: z.number().optional().describe('Get logs since timestamp'),
	limit: z.number().optional().describe('Maximum number of logs'),
	clear: z.boolean().optional().describe('Clear logs after getting')
});

export const browserSetViewportSchema = z.object({
	width: z.number().optional().describe('Viewport width in pixels. Omit to clear override.'),
	height: z.number().optional().describe('Viewport height in pixels. Omit to clear override.'),
	deviceScaleFactor: z.number().optional().describe('Device scale factor (default: 1)'),
	mobile: z.boolean().optional().describe('Emulate mobile device (default: false)')
});

export const browserGetNetworkRequestsSchema = z.object({
	urlFilter: z.string().optional().describe('Filter requests by URL substring'),
	method: z.string().optional().describe('Filter by HTTP method (GET, POST, etc.)'),
	statusFilter: z.enum(['success', 'error', 'all']).optional()
		.describe('Filter by status: success (2xx-3xx), error (4xx-5xx or failed), all'),
	limit: z.number().optional().describe('Maximum number of requests to return (default: 100, max: 500)')
});

// Empty schemas for tools with no parameters
export const emptySchema = z.object({});

// ============================================================================
// Canvas Tool Schemas (3)
// ============================================================================

export const canvasListSchema = z.object({
	nameFilter: z.string().optional().describe('Filter by name'),
	sortBy: z.enum(['name', 'updatedAt', 'createdAt', 'componentCount']).optional().describe('Sort field'),
	sortDirection: z.enum(['asc', 'desc']).optional().describe('Sort direction')
});

export const canvasCreateSchema = z.object({
	name: z.string().describe('Canvas name')
});

// ============================================================================
// Component Tool Schemas (6)
// ============================================================================

export const componentAddSchema = z.object({
	canvasId: z.string().optional().describe('Target canvas ID (uses active if not provided)'),
	folderPath: z.string().describe('Path to component folder'),
	name: z.string().optional().describe('Component name (auto-detected if not provided)'),
	entryFile: z.string().optional().describe('Entry file (auto-detected if not provided)'),
	framework: z.enum(['react', 'vue', 'svelte', 'solid', 'preact', 'html']).optional()
		.describe('Framework (auto-detected if not provided)')
});

export const componentAddBatchSchema = z.object({
	components: z.array(z.object({
		canvasId: z.string().optional(),
		folderPath: z.string(),
		name: z.string().optional(),
		entryFile: z.string().optional(),
		framework: z.enum(['react', 'vue', 'svelte', 'solid', 'preact', 'html']).optional()
	})).describe('Array of components to add')
});

export const componentRemoveSchema = z.object({
	componentId: z.string().describe('Component ID'),
	deleteSourceCode: z.boolean().optional().describe('Also delete source files')
});

export const componentGetInfoSchema = z.object({
	componentId: z.string().describe('Component ID')
});

export const componentListSchema = z.object({
	canvasId: z.string().describe('Canvas ID')
});

export const componentRebuildSchema = z.object({
	componentId: z.string().describe('Component ID')
});

// ============================================================================
// Project Tool Schemas (3)
// ============================================================================

export const projectStartSchema = z.object({
	projectPath: z.string().describe('Path to project (relative or absolute)'),
	port: z.number().optional().describe('Optional port number')
});

// ============================================================================
// Tool Definitions Interface
// ============================================================================

export interface ToolDefinition {
	name: string;
	description: string;
	schema: z.ZodType;
}

// ============================================================================
// Complete Tool Definitions Array
// ============================================================================

export const TOOL_DEFINITIONS: ToolDefinition[] = [
	// ========== Browser Tools (14) ==========
	{
		name: 'browser_open',
		description: 'Open the browser view. Optionally navigate to a URL.',
		schema: browserOpenSchema
	},
	{
		name: 'browser_close',
		description: 'Close the browser view.',
		schema: emptySchema
	},
	{
		name: 'browser_screenshot',
		description: 'Take a screenshot of the current browser view. Returns base64 PNG image.',
		schema: emptySchema
	},
	{
		name: 'browser_navigate',
		description: 'Navigate to a URL in the browser.',
		schema: browserNavigateSchema
	},
	{
		name: 'browser_reload',
		description: 'Reload the current page.',
		schema: browserReloadSchema
	},
	{
		name: 'browser_action_input',
		description: 'Perform browser input actions (click, type, scroll, etc.).',
		schema: browserActionInputSchema
	},
	{
		name: 'browser_execute_script',
		description: 'Execute JavaScript in the browser context.',
		schema: browserExecuteScriptSchema
	},
	{
		name: 'browser_inspect_element',
		description: 'Inspect CSS styles of an element with source file resolution. Returns exact file:line:column where styles are defined (requires source maps).',
		schema: browserInspectElementSchema
	},
	{
		name: 'browser_get_errors',
		description: 'Get combined console errors and network failures.',
		schema: browserGetErrorsSchema
	},
	{
		name: 'browser_get_console_logs',
		description: 'Get browser console logs.',
		schema: browserGetConsoleLogsSchema
	},
	{
		name: 'browser_get_performance',
		description: 'Get browser performance metrics (Web Vitals: LCP, CLS, FCP, TTFB and runtime metrics).',
		schema: emptySchema
	},
	{
		name: 'browser_get_state',
		description: 'Get browser state information (open/closed, current URL, title).',
		schema: emptySchema
	},
	{
		name: 'browser_set_viewport',
		description: 'Set or clear browser viewport override. Provide width/height to set a specific size (e.g., mobile 375x812). Call with NO parameters to clear override and restore natural browser size.',
		schema: browserSetViewportSchema
	},
	{
		name: 'browser_get_network_requests',
		description: 'Get captured network requests and responses. Requires CDP monitoring.',
		schema: browserGetNetworkRequestsSchema
	},

	// ========== Canvas Tools (3) ==========
	{
		name: 'canvas_list',
		description: 'List all canvases.',
		schema: canvasListSchema
	},
	{
		name: 'canvas_get_active',
		description: 'Get the currently active/focused canvas.',
		schema: emptySchema
	},
	{
		name: 'canvas_create',
		description: 'Create a new canvas or get existing one with same name.',
		schema: canvasCreateSchema
	},

	// ========== Component Tools (6) ==========
	{
		name: 'component_add',
		description: 'Add a component to a canvas for live preview.',
		schema: componentAddSchema
	},
	{
		name: 'component_add_batch',
		description: 'Add multiple components at once.',
		schema: componentAddBatchSchema
	},
	{
		name: 'component_remove',
		description: 'Remove a component from canvas.',
		schema: componentRemoveSchema
	},
	{
		name: 'component_get_info',
		description: 'Get detailed component information including build state.',
		schema: componentGetInfoSchema
	},
	{
		name: 'component_list',
		description: 'List all components in a canvas.',
		schema: componentListSchema
	},
	{
		name: 'component_rebuild',
		description: 'Trigger rebuild of a component.',
		schema: componentRebuildSchema
	},

	// ========== Project Tools (3) ==========
	{
		name: 'project_get_active',
		description: 'Check if a dev server is running and get its info.',
		schema: emptySchema
	},
	{
		name: 'project_start',
		description: 'Start a development server for a project.',
		schema: projectStartSchema
	},
	{
		name: 'project_stop',
		description: 'Stop the running development server.',
		schema: emptySchema
	}
];

// ============================================================================
// Helper: Convert to JSON Schema format for MCP protocol
// Uses Zod v4 native .toJSONSchema() method
// ============================================================================

export function getToolDefinitionsAsJsonSchema(): Array<{
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
}> {
	return TOOL_DEFINITIONS.map(tool => ({
		name: tool.name,
		description: tool.description,
		inputSchema: tool.schema.toJSONSchema() as Record<string, unknown>
	}));
}

// Total: 26 Tools
