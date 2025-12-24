/**
 * Roopik IDE Tool Descriptions
 *
 * XML-style tool descriptions for LLM system prompts.
 * These tools integrate with Roopik IDE's browser preview, canvas, and component features.
 *
 * Tool Categories:
 * - Browser: Screenshot, navigate, reload, execute script, inspect element
 * - CDP: Get errors, get console logs
 * - Project: Get active project, start project, stop project
 * - Canvas: List canvases, get active canvas, create canvas
 * - Component: Add, remove, list, inspect, rebuild components
 */

import { ToolArgs } from "../types"

// ============================================================================
// Browser Tool Descriptions
// ============================================================================

export function getRpkScreenshotDescription(): string {
	return `## rpk_screenshot
Description: [Roopik IDE] Take a screenshot of the browser preview. Returns a base64-encoded image of the current browser state. Use this for visual verification after making UI changes or to see what the user sees.
Parameters: None
Usage:
<rpk_screenshot>
</rpk_screenshot>`
}

export function getRpkNavigateDescription(): string {
	return `## rpk_navigate
Description: [Roopik IDE] Navigate the browser preview to a URL. Use this to load specific pages in the project (e.g., /login, /dashboard) or view different routes.
Parameters:
- url: (required) The URL to navigate to (e.g., http://localhost:5173/login or just /login for relative paths)
Usage:
<rpk_navigate>
<url>URL to navigate to</url>
</rpk_navigate>

Example: Navigate to the login page
<rpk_navigate>
<url>/login</url>
</rpk_navigate>`
}

export function getRpkReloadDescription(): string {
	return `## rpk_reload
Description: [Roopik IDE] Reload the current page in the browser preview. Use ignoreCache=true for hard reload after changing static assets like CSS or images.
Parameters:
- ignoreCache: (optional) Set to true for hard reload (clears cache). Default is false.
Usage:
<rpk_reload>
<ignoreCache>true or false (optional)</ignoreCache>
</rpk_reload>`
}

export function getRpkExecuteScriptDescription(): string {
	return `## rpk_executeScript
Description: [Roopik IDE] Execute JavaScript in the browser context. Use for DOM queries, checking application state, triggering interactions, or any browser-side logic. Returns the result of the script execution.
Parameters:
- script: (required) JavaScript code to execute in the browser
Usage:
<rpk_executeScript>
<script>JavaScript code here</script>
</rpk_executeScript>

Example: Click a button
<rpk_executeScript>
<script>document.querySelector('.submit-btn').click()</script>
</rpk_executeScript>

Example: Get current URL
<rpk_executeScript>
<script>window.location.href</script>
</rpk_executeScript>`
}

export function getRpkInspectElementDescription(): string {
	return `## rpk_inspectElement
Description: [Roopik IDE] Deep CSS inspection for an element. Returns matched CSS rules with source file locations (file:line:column), computed styles, specificity, and inheritance chain. This is THE critical tool for understanding exactly what CSS is applied to an element and WHERE it comes from - enabling precise, surgical CSS edits.
Parameters:
- selector: (required) CSS selector to find the element (e.g., ".btn-primary", "#header", "[data-testid='submit']")
- includeInherited: (optional) Include inherited styles from parent elements. Default is true.
Usage:
<rpk_inspectElement>
<selector>CSS selector</selector>
<includeInherited>true or false (optional)</includeInherited>
</rpk_inspectElement>

Example: Inspect a button's styles
<rpk_inspectElement>
<selector>.btn-primary</selector>
</rpk_inspectElement>`
}

// ============================================================================
// CDP Tool Descriptions
// ============================================================================

export function getRpkGetErrorsDescription(): string {
	return `## rpk_getErrors
Description: [Roopik IDE] Get all errors from the browser: console errors (JavaScript exceptions, console.error) AND failed network requests (4xx, 5xx, network failures). This is the primary debugging tool - shows what is broken in the application.
Parameters:
- limit: (optional) Maximum errors to return. Default is 50.
Usage:
<rpk_getErrors>
<limit>number (optional)</limit>
</rpk_getErrors>`
}

export function getRpkGetConsoleLogsDescription(): string {
	return `## rpk_getConsoleLogs
Description: [Roopik IDE] Get console output from the browser (console.log, console.warn, console.info, etc.). Use type filter to focus on specific log types. For errors only, prefer rpk_getErrors.
Parameters:
- limit: (optional) Maximum logs to return. Default is 50.
- type: (optional) Filter by log type: log, debug, info, warn, error
Usage:
<rpk_getConsoleLogs>
<limit>number (optional)</limit>
<type>log, debug, info, warn, or error (optional)</type>
</rpk_getConsoleLogs>`
}

// ============================================================================
// Project Tool Descriptions
// ============================================================================

export function getRpkGetActiveProjectDescription(): string {
	return `## rpk_getActiveProject
Description: [Roopik IDE] Get information about the currently running project. Returns project path, URL, port, framework detection, and server state. Use this to understand the current context.
Parameters: None
Usage:
<rpk_getActiveProject>
</rpk_getActiveProject>`
}

export function getRpkStartProjectDescription(args: ToolArgs): string {
	return `## rpk_startProject
Description: [Roopik IDE] Start a project's dev server and open it in the browser preview. Automatically detects the project's framework (React, Vue, Next.js, etc.) and starts the appropriate dev server.
Parameters:
- projectPath: (required) Path to the project directory (absolute or relative to ${args.cwd})
- port: (optional) Port to run the dev server on. Default is auto-detected or 5173.
Usage:
<rpk_startProject>
<projectPath>path/to/project</projectPath>
<port>port number (optional)</port>
</rpk_startProject>`
}

export function getRpkStopProjectDescription(): string {
	return `## rpk_stopProject
Description: [Roopik IDE] Stop the currently running dev server. Use when switching projects or cleaning up.
Parameters: None
Usage:
<rpk_stopProject>
</rpk_stopProject>`
}

// ============================================================================
// Canvas Tool Descriptions
// ============================================================================

export function getRpkListCanvasesDescription(): string {
	return `## rpk_listCanvases
Description: [Roopik IDE] List all canvases in the workspace. Canvases are containers for organizing components in Mode 1 (component builder).
Parameters:
- nameFilter: (optional) Filter canvases by name (partial match)
- sortBy: (optional) Sort by: name, createdAt, updatedAt. Default is updatedAt.
- sortDirection: (optional) Sort direction: asc or desc. Default is desc.
Usage:
<rpk_listCanvases>
<nameFilter>filter text (optional)</nameFilter>
<sortBy>name, createdAt, or updatedAt (optional)</sortBy>
<sortDirection>asc or desc (optional)</sortDirection>
</rpk_listCanvases>`
}

export function getRpkGetActiveCanvasDescription(): string {
	return `## rpk_getActiveCanvas
Description: [Roopik IDE] Get the currently focused canvas. Returns canvas details including id, name, component count, and state.
Parameters: None
Usage:
<rpk_getActiveCanvas>
</rpk_getActiveCanvas>`
}

export function getRpkCreateCanvasDescription(): string {
	return `## rpk_createCanvas
Description: [Roopik IDE] Create a new canvas for organizing components. If a canvas with the same name exists, returns the existing one.
Parameters:
- name: (required) Name for the canvas
Usage:
<rpk_createCanvas>
<name>Canvas name</name>
</rpk_createCanvas>`
}

// ============================================================================
// Component Tool Descriptions
// ============================================================================

export function getRpkAddComponentDescription(): string {
	return `## rpk_addComponent
Description: [Roopik IDE] Add a component to a canvas. The component will be built and made available for preview. Automatically detects the framework (React, Vue, etc.) from the code.
Parameters:
- folderPath: (required) Path to the component folder (contains the component files)
- canvasId: (optional) Canvas to add the component to. Uses active canvas if not specified.
- name: (optional) Display name for the component. Inferred from folder if not specified.
- entryFile: (optional) Entry file name (e.g., index.tsx). Auto-detected if not specified.
- framework: (optional) Force framework: react, vue, svelte, angular, vanilla. Auto-detected if not specified.
Usage:
<rpk_addComponent>
<folderPath>path/to/component</folderPath>
<canvasId>canvas-id (optional)</canvasId>
<name>Component Name (optional)</name>
<entryFile>index.tsx (optional)</entryFile>
<framework>react (optional)</framework>
</rpk_addComponent>`
}

export function getRpkAddComponentsDescription(): string {
	return `## rpk_addComponents
Description: [Roopik IDE] Add multiple components at once. More efficient than calling rpk_addComponent multiple times.
Parameters:
- components: (required) Array of component objects, each with: folderPath (required), canvasId, name, entryFile, framework (all optional)
Usage:
<rpk_addComponents>
<components>[{"folderPath": "path/to/comp1"}, {"folderPath": "path/to/comp2", "name": "MyComponent"}]</components>
</rpk_addComponents>`
}

export function getRpkRemoveComponentDescription(): string {
	return `## rpk_removeComponent
Description: [Roopik IDE] Remove a component from its canvas. This stops the build watcher but does not delete the source files.
Parameters:
- componentId: (required) The component's unique ID (from rpk_listComponents)
Usage:
<rpk_removeComponent>
<componentId>component-id</componentId>
</rpk_removeComponent>`
}

export function getRpkGetComponentInfoDescription(): string {
	return `## rpk_getComponentInfo
Description: [Roopik IDE] Get detailed information about a specific component, including build state, file paths, and metadata.
Parameters:
- componentId: (required) The component's unique ID
Usage:
<rpk_getComponentInfo>
<componentId>component-id</componentId>
</rpk_getComponentInfo>`
}

export function getRpkListComponentsDescription(): string {
	return `## rpk_listComponents
Description: [Roopik IDE] List all components in a canvas. Returns component IDs, names, frameworks, and build states.
Parameters:
- canvasId: (required) The canvas ID to list components from
Usage:
<rpk_listComponents>
<canvasId>canvas-id</canvasId>
</rpk_listComponents>`
}

export function getRpkRebuildComponentDescription(): string {
	return `## rpk_rebuildComponent
Description: [Roopik IDE] Force rebuild a component. Use after making changes that weren't picked up by the file watcher, or to refresh after errors.
Parameters:
- componentId: (required) The component's unique ID
Usage:
<rpk_rebuildComponent>
<componentId>component-id</componentId>
</rpk_rebuildComponent>`
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
		// Browser
		getRpkScreenshotDescription(),
		getRpkNavigateDescription(),
		getRpkReloadDescription(),
		getRpkExecuteScriptDescription(),
		getRpkInspectElementDescription(),
		// CDP
		getRpkGetErrorsDescription(),
		getRpkGetConsoleLogsDescription(),
		// Project
		getRpkGetActiveProjectDescription(),
		getRpkStartProjectDescription(args),
		getRpkStopProjectDescription(),
		// Canvas
		getRpkListCanvasesDescription(),
		getRpkGetActiveCanvasDescription(),
		getRpkCreateCanvasDescription(),
		// Component
		getRpkAddComponentDescription(),
		getRpkAddComponentsDescription(),
		getRpkRemoveComponentDescription(),
		getRpkGetComponentInfoDescription(),
		getRpkListComponentsDescription(),
		getRpkRebuildComponentDescription(),
	]

	return `# Roopik IDE Tools\n\nThese tools integrate with Roopik IDE's browser preview, canvas, and component features. They provide visual verification, CSS inspection with source mapping, and component management.\n\n${descriptions.join("\n\n")}`
}

/**
 * List of all Roopik tool names.
 * Used for tool validation and routing.
 */
export const ROOPIK_TOOL_NAMES = [
	// Browser
	"rpk_screenshot",
	"rpk_navigate",
	"rpk_reload",
	"rpk_executeScript",
	"rpk_inspectElement",
	// CDP
	"rpk_getErrors",
	"rpk_getConsoleLogs",
	// Project
	"rpk_getActiveProject",
	"rpk_startProject",
	"rpk_stopProject",
	// Canvas
	"rpk_listCanvases",
	"rpk_getActiveCanvas",
	"rpk_createCanvas",
	// Component
	"rpk_addComponent",
	"rpk_addComponents",
	"rpk_removeComponent",
	"rpk_getComponentInfo",
	"rpk_listComponents",
	"rpk_rebuildComponent",
] as const

export type RoopikToolName = (typeof ROOPIK_TOOL_NAMES)[number]

/**
 * Check if a tool name is a Roopik tool
 */
export function isRoopikTool(toolName: string): toolName is RoopikToolName {
	return ROOPIK_TOOL_NAMES.includes(toolName as RoopikToolName)
}
