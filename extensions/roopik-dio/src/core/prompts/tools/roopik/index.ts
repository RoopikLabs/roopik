/**
 * Roopik IDE Tool Descriptions
 *
 * XML-style tool descriptions for LLM system prompts.
 * These tools integrate with Roopik IDE's browser preview, canvas, and component features.
 *
 * Tool Categories:
 * - Browser (10): open, navigate, reload, screenshot, execute_script, inspect_element,
 *                 get_errors, get_console_logs, get_performance, get_cdp_info
 * - Project (3): get_active, start, stop
 * - Canvas (3): list, get_active, create
 * - Component (6): add, add_batch, remove, get_info, list, rebuild
 */

import { ToolArgs } from "../types"

// ============================================================================
// Browser Tool Descriptions
// ============================================================================

export function getBrowserOpenDescription(): string {
	return `## browser_open
Description: [Roopik IDE] Open the browser preview. Optionally navigate to a URL after opening. If browser is already open and URL is provided, navigates to that URL. Use this to get browser access without needing to start a dev server first.
Parameters:
- url: (optional) URL to open after the browser is ready
Usage:
<browser_open>
<url>URL to open (optional)</url>
</browser_open>

Example: Open browser to a website
<browser_open>
<url>https://example.com</url>
</browser_open>

Example: Open empty browser
<browser_open>
</browser_open>`
}

export function getBrowserNavigateDescription(): string {
	return `## browser_navigate
Description: [Roopik IDE] Navigate the browser preview to a URL. Use this to load specific pages in the project (e.g., /login, /dashboard) or view different routes.
Parameters:
- url: (required) The URL to navigate to (e.g., http://localhost:5173/login or just /login for relative paths)
Usage:
<browser_navigate>
<url>URL to navigate to</url>
</browser_navigate>

Example: Navigate to the login page
<browser_navigate>
<url>/login</url>
</browser_navigate>`
}

export function getBrowserReloadDescription(): string {
	return `## browser_reload
Description: [Roopik IDE] Reload the current page in the browser preview. Use ignoreCache=true for hard reload after changing static assets like CSS or images.
Parameters:
- ignoreCache: (optional) Set to true for hard reload (clears cache). Default is false.
Usage:
<browser_reload>
<ignoreCache>true or false (optional)</ignoreCache>
</browser_reload>`
}

export function getBrowserScreenshotDescription(): string {
	return `## browser_screenshot
Description: [Roopik IDE] Take a screenshot of the browser preview. Returns a base64-encoded image of the current browser state. Use this for visual verification after making UI changes or to see what the user sees.
Parameters: None
Usage:
<browser_screenshot>
</browser_screenshot>`
}

export function getBrowserExecuteScriptDescription(): string {
	return `## browser_execute_script
Description: [Roopik IDE] Execute JavaScript in the browser context. Use for DOM queries, checking application state, triggering interactions, or any browser-side logic. Returns the result of the script execution.
Parameters:
- script: (required) JavaScript code to execute in the browser
Usage:
<browser_execute_script>
<script>JavaScript code here</script>
</browser_execute_script>

Example: Click a button
<browser_execute_script>
<script>document.querySelector('.submit-btn').click()</script>
</browser_execute_script>

Example: Get current URL
<browser_execute_script>
<script>window.location.href</script>
</browser_execute_script>`
}

export function getBrowserInspectElementDescription(): string {
	return `## browser_inspect_element
Description: [Roopik IDE] Deep CSS inspection for an element. Returns matched CSS rules with source file locations (file:line:column), computed styles, specificity, and inheritance chain. This is THE critical tool for understanding exactly what CSS is applied to an element and WHERE it comes from - enabling precise, surgical CSS edits.
Parameters:
- selector: (required) CSS selector to find the element (e.g., ".btn-primary", "#header", "[data-testid='submit']")
- includeInherited: (optional) Include inherited styles from parent elements. Default is true.
Usage:
<browser_inspect_element>
<selector>CSS selector</selector>
<includeInherited>true or false (optional)</includeInherited>
</browser_inspect_element>

Example: Inspect a button's styles
<browser_inspect_element>
<selector>.btn-primary</selector>
</browser_inspect_element>`
}

export function getBrowserGetErrorsDescription(): string {
	return `## browser_get_errors
Description: [Roopik IDE] Get all errors from the browser: console errors (JavaScript exceptions, console.error) AND failed network requests (4xx, 5xx, network failures). This is the primary debugging tool - shows what is broken in the application.
Parameters:
- limit: (optional) Maximum errors to return. Default is 50.
Usage:
<browser_get_errors>
<limit>number (optional)</limit>
</browser_get_errors>`
}

export function getBrowserGetConsoleLogsDescription(): string {
	return `## browser_get_console_logs
Description: [Roopik IDE] Get console output from the browser (console.log, console.warn, console.info, etc.). Use type filter to focus on specific log types. For errors only, prefer browser_get_errors.
Parameters:
- limit: (optional) Maximum logs to return. Default is 50.
- type: (optional) Filter by log type: log, debug, info, warn, error
Usage:
<browser_get_console_logs>
<limit>number (optional)</limit>
<type>log, debug, info, warn, or error (optional)</type>
</browser_get_console_logs>`
}

export function getBrowserGetPerformanceDescription(): string {
	return `## browser_get_performance
Description: [Roopik IDE] Get performance metrics from the browser including Web Vitals (LCP, CLS) and runtime metrics (JS heap, DOM nodes, layout count). Uses Chrome DevTools Protocol for accurate measurements.
Parameters: None
Usage:
<browser_get_performance>
</browser_get_performance>`
}

export function getBrowserGetCdpInfoDescription(): string {
	return `## browser_get_cdp_info
Description: [Roopik IDE] Get information about browser state and available Roopik tools for browser automation. Returns current URL, dev server status, and list of available browser tools.
Parameters: None
Usage:
<browser_get_cdp_info>
</browser_get_cdp_info>`
}

// ============================================================================
// Project Tool Descriptions
// ============================================================================

export function getProjectGetActiveDescription(): string {
	return `## project_get_active
Description: [Roopik IDE] Get information about the currently running project. Returns project path, URL, port, framework detection, and server state. Use this to understand the current context.
Parameters: None
Usage:
<project_get_active>
</project_get_active>`
}

export function getProjectStartDescription(args: ToolArgs): string {
	return `## project_start
Description: [Roopik IDE] Start a project's dev server and open it in the browser preview. Automatically detects the project's framework (React, Vue, Next.js, etc.) and starts the appropriate dev server.
Parameters:
- projectPath: (required) Path to the project directory (absolute or relative to ${args.cwd})
- port: (optional) Port to run the dev server on. Default is auto-detected or 5173.
Usage:
<project_start>
<projectPath>path/to/project</projectPath>
<port>port number (optional)</port>
</project_start>`
}

export function getProjectStopDescription(): string {
	return `## project_stop
Description: [Roopik IDE] Stop the currently running dev server. Use when switching projects or cleaning up.
Parameters: None
Usage:
<project_stop>
</project_stop>`
}

// ============================================================================
// Canvas Tool Descriptions
// ============================================================================

export function getCanvasListDescription(): string {
	return `## canvas_list
Description: [Roopik IDE] List all canvases in the workspace. Canvases are containers for organizing components in Mode 1 (component builder).
Parameters:
- nameFilter: (optional) Filter canvases by name (partial match)
- sortBy: (optional) Sort by: name, createdAt, updatedAt. Default is updatedAt.
- sortDirection: (optional) Sort direction: asc or desc. Default is desc.
Usage:
<canvas_list>
<nameFilter>filter text (optional)</nameFilter>
<sortBy>name, createdAt, or updatedAt (optional)</sortBy>
<sortDirection>asc or desc (optional)</sortDirection>
</canvas_list>`
}

export function getCanvasGetActiveDescription(): string {
	return `## canvas_get_active
Description: [Roopik IDE] Get the currently focused canvas. Returns canvas details including id, name, component count, and state.
Parameters: None
Usage:
<canvas_get_active>
</canvas_get_active>`
}

export function getCanvasCreateDescription(): string {
	return `## canvas_create
Description: [Roopik IDE] Create a new canvas for organizing components. If a canvas with the same name exists, returns the existing one.
Parameters:
- name: (required) Name for the canvas
Usage:
<canvas_create>
<name>Canvas name</name>
</canvas_create>`
}

// ============================================================================
// Component Tool Descriptions
// ============================================================================

export function getComponentAddDescription(): string {
	return `## component_add
Description: [Roopik IDE] Add a component to a canvas. The component will be built and made available for preview. Automatically detects the framework (React, Vue, etc.) from the code.
Parameters:
- folderPath: (required) Path to the component folder (contains the component files)
- canvasId: (optional) Canvas to add the component to. Uses active canvas if not specified.
- name: (optional) Display name for the component. Inferred from folder if not specified.
- entryFile: (optional) Entry file name (e.g., index.tsx). Auto-detected if not specified.
- framework: (optional) Force framework: react, vue, svelte, angular, vanilla. Auto-detected if not specified.
Usage:
<component_add>
<folderPath>path/to/component</folderPath>
<canvasId>canvas-id (optional)</canvasId>
<name>Component Name (optional)</name>
<entryFile>index.tsx (optional)</entryFile>
<framework>react (optional)</framework>
</component_add>`
}

export function getComponentAddBatchDescription(): string {
	return `## component_add_batch
Description: [Roopik IDE] Add multiple components at once. More efficient than calling component_add multiple times.
Parameters:
- components: (required) Array of component objects, each with: folderPath (required), canvasId, name, entryFile, framework (all optional)
Usage:
<component_add_batch>
<components>[{"folderPath": "path/to/comp1"}, {"folderPath": "path/to/comp2", "name": "MyComponent"}]</components>
</component_add_batch>`
}

export function getComponentRemoveDescription(): string {
	return `## component_remove
Description: [Roopik IDE] Remove a component from its canvas. This stops the build watcher but does not delete the source files.
Parameters:
- componentId: (required) The component's unique ID (from component_list)
Usage:
<component_remove>
<componentId>component-id</componentId>
</component_remove>`
}

export function getComponentGetInfoDescription(): string {
	return `## component_get_info
Description: [Roopik IDE] Get detailed information about a specific component, including build state, file paths, and metadata.
Parameters:
- componentId: (required) The component's unique ID
Usage:
<component_get_info>
<componentId>component-id</componentId>
</component_get_info>`
}

export function getComponentListDescription(): string {
	return `## component_list
Description: [Roopik IDE] List all components in a canvas. Returns component IDs, names, frameworks, and build states.
Parameters:
- canvasId: (required) The canvas ID to list components from
Usage:
<component_list>
<canvasId>canvas-id</canvasId>
</component_list>`
}

export function getComponentRebuildDescription(): string {
	return `## component_rebuild
Description: [Roopik IDE] Force rebuild a component. Use after making changes that weren't picked up by the file watcher, or to refresh after errors.
Parameters:
- componentId: (required) The component's unique ID
Usage:
<component_rebuild>
<componentId>component-id</componentId>
</component_rebuild>`
}

// ============================================================================
// Combined Export
// ============================================================================

/**
 * Get all Roopik tool descriptions for the LLM system prompt.
 * Call this to include Roopik IDE tools in the agent's available tools.
 */
export function getRoopikToolDescriptions(args: ToolArgs): string {
	const descriptions = [
		// Browser (10 tools)
		getBrowserOpenDescription(),
		getBrowserNavigateDescription(),
		getBrowserReloadDescription(),
		getBrowserScreenshotDescription(),
		getBrowserExecuteScriptDescription(),
		getBrowserInspectElementDescription(),
		getBrowserGetErrorsDescription(),
		getBrowserGetConsoleLogsDescription(),
		getBrowserGetPerformanceDescription(),
		getBrowserGetCdpInfoDescription(),
		// Project (3 tools)
		getProjectGetActiveDescription(),
		getProjectStartDescription(args),
		getProjectStopDescription(),
		// Canvas (3 tools)
		getCanvasListDescription(),
		getCanvasGetActiveDescription(),
		getCanvasCreateDescription(),
		// Component (6 tools)
		getComponentAddDescription(),
		getComponentAddBatchDescription(),
		getComponentRemoveDescription(),
		getComponentGetInfoDescription(),
		getComponentListDescription(),
		getComponentRebuildDescription(),
	]

	return `# Roopik IDE Tools\n\nThese tools integrate with Roopik IDE's browser preview, canvas, and component features. They provide visual verification, CSS inspection with source mapping, and component management.\n\n${descriptions.join("\n\n")}`
}

/**
 * List of all Roopik tool names.
 * Used for tool validation and routing.
 */
export const ROOPIK_TOOL_NAMES = [
	// Browser (10 tools)
	"browser_open",
	"browser_navigate",
	"browser_reload",
	"browser_screenshot",
	"browser_execute_script",
	"browser_inspect_element",
	"browser_get_errors",
	"browser_get_console_logs",
	"browser_get_performance",
	"browser_get_cdp_info",
	// Project (3 tools)
	"project_get_active",
	"project_start",
	"project_stop",
	// Canvas (3 tools)
	"canvas_list",
	"canvas_get_active",
	"canvas_create",
	// Component (6 tools)
	"component_add",
	"component_add_batch",
	"component_remove",
	"component_get_info",
	"component_list",
	"component_rebuild",
] as const

export type RoopikToolName = (typeof ROOPIK_TOOL_NAMES)[number]

/**
 * Check if a tool name is a Roopik tool
 */
export function isRoopikTool(toolName: string): toolName is RoopikToolName {
	return ROOPIK_TOOL_NAMES.includes(toolName as RoopikToolName)
}
