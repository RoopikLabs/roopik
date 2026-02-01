/**
 * Roopik Tool Names and Types
 *
 * This file contains the Roopik tool name constants and type definitions
 * used for tool validation and routing.
 *
 * Tool Categories:
 * - Browser (14): open, close, action, navigate, reload, screenshot, execute_script, inspect_element,
 *                 get_errors, get_console_logs, get_performance, get_state, set_viewport, get_network_requests
 * - Project (3): get_active, start, stop
 * - Canvas (3): list, get_active, create
 * - Component (8): add, add_batch, remove, get_info, list, rebuild, validate_components, screenshot
 */

// =============================================================================
// DEPRECATED XML TOOL DESCRIPTIONS - COMMENTED OUT
// =============================================================================
// The XML-style tool descriptions below are no longer used.
// Roo Code upstream removed XML tool support in favor of native JSON schema tools.
// Native tool definitions are now in: src/core/prompts/tools/native-tools/roopik.ts
//
// The import from "../types" (ToolArgs) was also removed by upstream.
// Keeping this code commented for reference during transition.
// =============================================================================

/*
// DEPRECATED: XML tool description functions
// These were used to generate XML-style tool descriptions for the LLM system prompt.
// Now replaced by native tool definitions in native-tools/roopik.ts

import { ToolArgs } from "../types"  // File deleted by Roo Code upstream

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
Description: [Roopik IDE] Take a screenshot of the browser preview. Returns base64-encoded image with viewport metadata (width, height, devicePixelRatio). Use this for visual verification and to get coordinates for browser_action_input.
Parameters: None
Usage:
<browser_screenshot>
</browser_screenshot>`
}

export function getBrowserCloseDescription(): string {
	return `## browser_close
Description: [Roopik IDE] Close the browser view. Use this when done with browser testing or to free resources.
Parameters: None
Usage:
<browser_close>
</browser_close>`
}

export function getRoopikBrowserActionDescription(): string {
	return `## browser_action_input
Description: [Roopik IDE] Perform native input events in the browser. Supports click, right_click, double_click, hover, drag, type, press, scroll.

Coordinate format: 'x,y@WIDTHxHEIGHT' where WIDTH/HEIGHT are from browser_screenshot viewport.
Example: '450,203@900x600' means click at (450,203) on a 900x600 viewport.

Actions:
- click/right_click/double_click/hover: requires 'coordinate'
- drag: requires 'coordinate' (start) + 'deltaX'/'deltaY' (offset to end)
- type: requires 'text'
- press: requires 'key' (e.g., 'Enter', 'Escape', 'Tab'), optional 'modifiers' (['ctrl', 'shift'])
- scroll: requires 'deltaX' and/or 'deltaY' (negative = up/left)

Parameters:
- action: (required) The action to perform: click, right_click, double_click, hover, drag, type, press, scroll
- coordinate: (optional) Coordinate string: 'x,y' or 'x,y@WIDTHxHEIGHT' for scaled coordinates
- text: (optional) Text to type (for 'type' action)
- key: (optional) Key to press (for 'press' action): Enter, Escape, Tab, ArrowDown, etc.
- modifiers: (optional) JSON array of modifier keys: ["ctrl", "shift", "alt", "meta"]
- deltaX: (optional) Horizontal offset for drag/scroll (negative = left)
- deltaY: (optional) Vertical offset for drag/scroll (negative = up)

Usage:
<browser_action_input>
<action>action type</action>
<coordinate>x,y@WIDTHxHEIGHT (optional)</coordinate>
<text>text to type (optional)</text>
</browser_action_input>

Example: Click at coordinates
<browser_action_input>
<action>click</action>
<coordinate>450,203@900x600</coordinate>
</browser_action_input>

Example: Type text
<browser_action_input>
<action>type</action>
<text>Hello World</text>
</browser_action_input>

Example: Press Enter
<browser_action_input>
<action>press</action>
<key>Enter</key>
</browser_action_input>`
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
Description: [Roopik IDE - Projects Only] Start a FULL APPLICATION's dev server and preview in the integrated Browser (NOT used for Canvas components). Use for complete runnable vite based projects with routing/navigation (e.g., todo app with multiple pages). The browser shows the running app at localhost. For ISOLATED UI components/screens, use component_add instead.
Parameters:
- projectPath: (required) Path to the project directory. Supports both absolute paths and relative paths from workspace root
- port: (optional) Port to run the dev server on. Default is auto-detected or 5173.
Usage:
<project_start>
<projectPath>path/to/project</projectPath>
<port>port number (optional)</port>
</project_start>`
}

export function getProjectStopDescription(): string {
	return `## project_stop
Description: [Roopik IDE] Stop the currently running dev server. Use when switching projects or cleaning up. This works only if project was started with project_start.
Parameters: None
Usage:
<project_stop>
</project_stop>`
}

export function getCanvasListDescription(): string {
	return `## canvas_list
Description: [Roopik IDE] List all canvases in the current workspace. Canvases are containers for organizing and previewing isolated components in sandbox environment (component builder).
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
Description: [Roopik IDE] Create a new canvas for organizing components. If a canvas with the same name exists, returns the existing one.  Canvases are containers for organizing and previewing multiple isolated components in sandbox environment (component builder).
Parameters:
- name: (required) Name for the canvas
Usage:
<canvas_create>
<name>Canvas name</name>
</canvas_create>`
}

export function getComponentAddDescription(): string {
	return `## component_add
Description: [Roopik IDE - Canvas Only] Add an ISOLATED UI component to the Canvas for preview in the IDE's Canvas UI. Use for individual screens/sections (login, onboarding, card, hero, etc.). The Canvas automatically shows the preview - this is a sandbox environment for previewing isolated components.
Parameters:
- folderPath: (required) Path to the component folder. Supports both absolute paths and relative paths from workspace root
- canvasId: (optional) Canvas to add the component to. Uses active canvas if not specified.
- name: (optional) Display name for the component.  Always try to pass logical short name (one word or max 2-3 words) for the component.
- entryFile: (optional) Entry file name (e.g., index.tsx). Auto-detected in IDE if not specified.
- framework: (optional) Force framework: react, vue, svelte, vanilla. Auto-detected in IDE if not specified.
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
Description: [Roopik IDE - Canvas Only] Batch add multiple ISOLATED UI components to Canvas (NOT for projects). Use when creating variations (e.g., 3 login screens). Each component appears in the Canvas UI automatically.
Parameters:
- components: (required) Array of component objects, each with: folderPath (required, absolute or relative to workspace), canvasId, name, entryFile, framework (all optional)
Usage:
<component_add_batch>
<components>[{"folderPath": "path/to/comp1"}, {"folderPath": "path/to/comp2", "name": "MyComponent"}]</components>
</component_add_batch>`
}

export function getComponentRemoveDescription(): string {
	return `## component_remove
Description: [Roopik IDE] Remove a component from its canvas. Set deleteSourceCode=true to automatically delete source files from disk - DO NOT manually delete files with terminal commands.
Parameters:
- componentId: (required) The component's unique ID (from component_list)
- deleteSourceCode: (optional) Set to true to delete source code from disk (default: false). When true, both UI removal and file deletion are handled automatically internally.
Usage:
<component_remove>
<componentId>component-id</componentId>
<deleteSourceCode>true</deleteSourceCode>
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

export function getRoopikToolDescriptions(args: ToolArgs): string {
	const descriptions = [
		// Browser (12 tools)
		getBrowserOpenDescription(),
		getBrowserCloseDescription(),
		getRoopikBrowserActionDescription(),
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

	return `# Roopik IDE Tools

These tools integrate with Roopik IDE's browser preview, canvas, and component features. They provide visual verification, CSS inspection with source mapping, and component management.

## Workflow Patterns

**Browser Workflow (for testing/verifying changes):**
1. \`browser_open\` - Open browser (optionally with URL)
2. \`browser_screenshot\` - Capture current state for visual verification
3. \`browser_action_input\` - Interact with elements (click, type, etc.)
4. \`browser_get_errors\` - Check for JavaScript/network errors
5. \`browser_close\` - Close when done (optional, browser persists between messages)
- Optional advanced: \`browser_execute_script\` for running arbitrary JS in the browser, \`browser_get_console_logs\`, \`browser_get_performance\`, \`browser_get_cdp_info\` for detailed debugging and performance analysis

**Project Workflow (for running full projects):**
1. \`project_start\` - Start dev server and open browser preview
2. \`browser_navigate\` - Navigate to specific routes (/login, /dashboard)
3. \`browser_screenshot\` - Verify UI renders correctly
4. \`browser_inspect_element\` - Get CSS details with source file locations
5. Edit files based on inspection results
6. \`browser_reload\` - Refresh to see changes (HMR usually auto-refreshes, not needed)
7. \`project_stop\` - Stop server when switching projects or when done or if user asks to stop/close
- Note: All browser_* tools are available when a project is running for debugging, testing, and inspection

**CSS Debugging Flow (fast, precise edits):**
1. \`browser_inspect_element\` with selector - Get exact CSS rules + source files
2. Review the matched rules (which file:line defines each style)
3. Edit the correct CSS file at the correct line
4. \`browser_reload\` with ignoreCache=true if needed

**Component Canvas Workflow:**
1. \`canvas_create\` or \`canvas_get_active\` - Get/create canvas (first try to get active canvas, if not found create a new one, use your judgment to determine better canvas short generic name)
2. \`component_add\` - Add component folder to canvas (Once you write a component code, pass the path to the component folder - can be absolute or relative to workspace root - to show live preview in the canvas UI).
3. \`component_list\` - See all components on canvas (this will show the list of all components added to the canvas to you if you need to see the list of components added to the canvas or get info about a specific component use \`component_get_info\`)
4. \`component_rebuild\` - Force rebuild after changes (use this tool if you make changes to the component code and want to rebuild the component)
5. \`component_remove\` - Remove component (set deleteSourceCode=true to delete files automatically - never use terminal commands to delete files)
6. User views live preview in canvas UI
- **IMPORTANT**: DO NOT use browser_open or browser_screenshot for canvas components. The canvas UI shows live preview automatically after component_add. Browser tools are only for projects with dev servers.

${descriptions.join("\n\n")}`
}
*/

// =============================================================================
// ACTIVE EXPORTS - Used for tool validation and routing
// =============================================================================

/**
 * List of all Roopik tool names.
 * Used for tool validation and routing.
 */
export const ROOPIK_TOOL_NAMES = [
	// Browser (14 tools)
	"browser_open",
	"browser_close",
	"browser_action_input",
	"browser_navigate",
	"browser_reload",
	"browser_screenshot",
	"browser_execute_script",
	"browser_inspect_element",
	"browser_get_errors",
	"browser_get_console_logs",
	"browser_get_performance",
	"browser_get_state",
	"browser_set_viewport",
	"browser_get_network_requests",
	// Project (3 tools)
	"project_get_active",
	"project_start",
	"project_stop",
	// Canvas (5 tools)
	"canvas_list",
	"canvas_get_active",
	"canvas_create",
	"canvas_open",
	"canvas_validate_components",
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
