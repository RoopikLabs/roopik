/**
 * Tool Definitions
 *
 * Defines all MCP tools that Roopik supports.
 * These mirror the tools in Roopik's ToolExecutor.
 *
 * The STDIO binary forwards these tool calls to Roopik via WebSocket.
 */

import { z } from 'zod';

// ============================================================================
// Tool Schemas (Zod)
// ============================================================================

// Browser Tools
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

// Canvas Tools
export const canvasListSchema = z.object({
	nameFilter: z.string().optional().describe('Filter by name'),
	sortBy: z.enum(['name', 'updatedAt', 'createdAt', 'componentCount']).optional().describe('Sort field'),
	sortDirection: z.enum(['asc', 'desc']).optional().describe('Sort direction')
});

export const canvasCreateSchema = z.object({
	name: z.string().describe('Canvas name')
});

// Component Tools
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

// Project Tools
export const projectStartSchema = z.object({
	projectPath: z.string().describe('Path to project (relative or absolute)'),
	port: z.number().optional().describe('Optional port number')
});

// ============================================================================
// Tool Definitions
// ============================================================================

export interface ToolDefinition {
	name: string;
	description: string;
	schema: z.ZodType;
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
	// ========== Browser Tools (12) ==========
	{
		name: 'browser_open',
		description: 'Open the browser view. Optionally navigate to a URL.',
		schema: browserOpenSchema
	},
	{
		name: 'browser_close',
		description: 'Close the browser view.',
		schema: z.object({})
	},
	{
		name: 'browser_screenshot',
		description: 'Take a screenshot of the current browser view. Returns base64 PNG image.',
		schema: z.object({})
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
		description: 'Inspect CSS styles of an element with source file resolution. THE MOAT capability - returns exact file:line:column where styles are defined.',
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
		schema: z.object({})
	},
	{
		name: 'browser_get_cdp_info',
		description: 'Get browser state information (open, URL, dev server status).',
		schema: z.object({})
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
		schema: z.object({})
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
		schema: z.object({})
	},
	{
		name: 'project_start',
		description: 'Start a development server for a project.',
		schema: projectStartSchema
	},
	{
		name: 'project_stop',
		description: 'Stop the running development server.',
		schema: z.object({})
	}
];

// ============================================================================
// Prompt Definitions (copied from Roopik for STDIO binary)
// ============================================================================

export interface PromptDefinition {
	name: string;
	description: string;
	content: string;
}

export const PROMPT_DEFINITIONS: PromptDefinition[] = [
	{
		name: 'how-to-start-project',
		description: 'Step-by-step guide for starting a development server for an existing project',
		content: `# How to Start a Project in Roopik

This workflow teaches you how to start a development server for an existing project.

## Step-by-Step Process:

### 1. Check for Running Project
First, call **project_get_active** to see if a project is already running:
- If hasActiveProject is true, you can skip starting
- Returns: url, projectPath, framework, status

### 2. Start the Development Server
Call **project_start** with the project path:
- Provide projectPath (absolute or relative to workspace)
- Optionally specify a port
- The dev server will start and browser will open automatically
- Returns: url, projectRoot, framework

### 3. Verify the Server is Running
The browser should automatically open. You can verify with:
- Call **browser_get_cdp_info** to check browser state
- Call **browser_screenshot** to see the rendered page

## Example Tool Chain:
project_get_active → project_start → browser_screenshot`
	},
	{
		name: 'how-to-create-component',
		description: 'Step-by-step guide for adding components to a canvas for live preview',
		content: `# How to Add Components in Roopik (Canvas Mode)

This workflow teaches you how to add components to a canvas for live preview.

## Step-by-Step Process:

### 1. Get or Create a Canvas
Call **canvas_get_active** to find the current canvas:
- If no active canvas, call **canvas_create** with a name
- Returns canvasId which you'll need for adding components

### 2. Add a Component
Call **component_add** with:
- canvasId: from step 1 (optional, uses active canvas if not provided)
- folderPath: path to component folder (absolute or relative to workspace)
- name: component name (optional, auto-detected)
- framework: react/vue/svelte/solid/preact/html (optional, auto-detected)

### 3. Check Build Status
Call **component_get_info** with the componentId:
- Wait until buildState is 'ready' (not 'building')
- If buildState is 'error', check the error details

## Example Tool Chain:
canvas_get_active → canvas_create (if needed) → component_add → component_get_info → browser_screenshot`
	},
	{
		name: 'how-to-inspect-css',
		description: 'Step-by-step guide for inspecting CSS and finding source files to edit',
		content: `# How to Inspect & Fix CSS in Roopik

This workflow teaches you THE MOAT capability - CSS inspection with source resolution.

## Step-by-Step Process:

### 1. Take a Screenshot First
Call **browser_screenshot** to see the visual state.

### 2. Inspect the Element's CSS
Call **browser_inspect_element** with:
- selector: CSS selector (e.g., ".btn-primary", "#header")
- includeInherited: true (to see inherited styles)

### 3. Analyze the CSS Data
The response gives you precise source information:

**matchedRules**: CSS rules that apply to this element
- selector: the CSS selector
- file: absolute path to source file
- location: { line, column } in the source file
- properties: CSS properties defined

### 4. Find the Source File to Edit
Look at matchedRules to find where to make changes:
- Use the **file** path to know which file to edit
- Use **location.line** for exact position

## Why This Is THE MOAT:
- Traditional: "This element has color: red" (but where from?)
- Roopik: "color: red is in button.scss at line 45:3"

## Example Tool Chain:
browser_screenshot → browser_inspect_element → (edit file) → browser_reload → browser_screenshot`
	},
	{
		name: 'how-to-debug-errors',
		description: 'Step-by-step guide for finding and fixing browser errors',
		content: `# How to Debug Browser Errors in Roopik

This workflow teaches you how to find and fix JavaScript and network errors.

## Step-by-Step Process:

### 1. Get All Errors
Call **browser_get_errors** to see combined errors:
- Returns both console errors AND network failures
- Sorted by timestamp (most recent first)

### 2. Analyze Error Types
**Console Errors** (source: 'console'):
- JavaScript exceptions
- React/Vue rendering errors
- Location shows file:line:column

**Network Errors** (source: 'network'):
- HTTP 4xx/5xx responses
- Network failures

### 3. Get More Context
For JavaScript errors, call **browser_get_console_logs**:
- Shows all console output
- Includes stack traces for errors

### 4. Fix and Verify
After fixing the code:
- Call **browser_reload** with ignoreCache: true
- Call **browser_get_errors** again to verify fix

## Example Tool Chain:
browser_get_errors → browser_get_console_logs → (fix code) → browser_reload → browser_get_errors`
	},
	{
		name: 'full-dev-workflow',
		description: 'Complete workflow from starting a project to debugging and fixing issues',
		content: `# Full Development Workflow in Roopik

## Phase 1: Start Project
1. **Check existing project**: project_get_active
2. **Start dev server**: project_start with projectPath
3. **Verify browser**: browser_screenshot

## Phase 2: Navigate and Explore
4. **Go to specific page**: browser_navigate with URL
5. **Take screenshot**: browser_screenshot
6. **Check for errors**: browser_get_errors

## Phase 3: Inspect and Edit CSS
7. **Inspect element**: browser_inspect_element with selector
8. **Find source file**: Look at matchedRules[].file and location
9. **Edit the file**: Use your file editing capabilities
10. **Reload**: browser_reload with ignoreCache: true

## Phase 4: Debug Issues
11. **Get errors**: browser_get_errors
12. **Get console logs**: browser_get_console_logs
13. **Check performance**: browser_get_performance

## Tool Categories:
- **Project Tools** (3): project_get_active, project_start, project_stop
- **Browser Core** (6): browser_open, browser_close, browser_screenshot, browser_navigate, browser_reload, browser_action_input
- **Browser Debug** (4): browser_execute_script, browser_inspect_element, browser_get_errors, browser_get_console_logs
- **Browser Info** (2): browser_get_performance, browser_get_cdp_info
- **Canvas Tools** (3): canvas_list, canvas_get_active, canvas_create
- **Component Tools** (6): component_add, component_add_batch, component_remove, component_get_info, component_list, component_rebuild

## Total: 24 Tools`
	}
];
