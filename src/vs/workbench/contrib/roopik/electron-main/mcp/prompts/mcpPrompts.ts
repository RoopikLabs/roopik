/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * MCP Prompts - Workflow Guides for AI Agents
 *
 * Pre-written workflow guides that teach AI agents how to chain MCP tools effectively.
 * These are NOT tools - they're recipes/documentation for common tasks.
 *
 * This file is the SINGLE SOURCE OF TRUTH for prompts.
 * - HTTP MCP imports and registers these directly
 * - STDIO Binary copies these during build (or imports if possible)
 */

// ============================================================================
// Prompt Types
// ============================================================================

export interface McpPrompt {
	name: string;
	description: string;
	content: string;
}

// ============================================================================
// All Prompts
// ============================================================================

export const MCP_PROMPTS: McpPrompt[] = [
	// --------------------------------------------------------------
	// PROMPT: How to Start a Project
	// --------------------------------------------------------------
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
- Call **browser_get_state** to check browser state
- Call **browser_screenshot** to see the rendered page

### 4. Navigate to Specific Pages (Optional)
Once running, call **browser_navigate** to load specific routes:
- Provide the full URL (e.g., http://localhost:3000/login)
- Take screenshots to verify pages load correctly

## Common Pitfalls:
- Don't start a new project if one is already running (check project_get_active first)
- If browser doesn't open, use browser_open with the dev server URL
- Wait for the page to fully load before taking screenshots

## Example Tool Chain:
project_get_active → project_start → browser_screenshot`
	},

	// --------------------------------------------------------------
	// PROMPT: How to Create a Component (Canvas Mode)
	// --------------------------------------------------------------
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
- Returns: component info with id, buildState

### 3. Check Build Status
Call **component_get_info** with the componentId:
- Wait until buildState is 'ready' (not 'building')
- If buildState is 'error', check the error details
- Build usually takes 2-5 seconds

### 4. Verify in Browser
Once component is ready:
- The canvas should show the rendered component
- Call **browser_screenshot** to see the result
- Use **browser_inspect_element** to check CSS if needed

## Adding Multiple Components:
Use **component_add_batch** for efficiency:
- Pass an array of component definitions
- All components are added in parallel
- Check each component's build status individually

## Common Pitfalls:
- Don't add components before checking if canvas exists
- Wait for build to complete before expecting visual results
- Check component_get_info for error details if build fails

## Example Tool Chain:
canvas_get_active → canvas_create (if needed) → component_add → component_get_info → browser_screenshot`
	},

	// --------------------------------------------------------------
	// PROMPT: How to Inspect & Fix CSS
	// --------------------------------------------------------------
	{
		name: 'how-to-inspect-css',
		description: 'Step-by-step guide for inspecting CSS and finding source files to edit',
		content: `# How to Inspect & Fix CSS in Roopik

This workflow teaches you how to inspect CSS and resolve styles to their source files.

## Step-by-Step Process:

### 1. Take a Screenshot First
Call **browser_screenshot** to see the visual state:
- Helps you identify the element you want to inspect
- Note coordinates if you need to click or interact

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
- specificity: for understanding cascade order

**element**: Component information
- tag: HTML tag name
- classes: CSS classes
- componentName: React/Vue component name (if detected)
- componentSource: source file location

**cssInJs**: CSS-in-JS detection (styled-components, emotion, etc.)

### 4. Find the Source File to Edit
Look at matchedRules to find where to make changes:
- Use the **file** path to know which file to edit
- Use **location.line** and **location.column** for exact position
- Filter out origin: 'user-agent' (browser defaults)

### 5. Make the Edit
Use your file editing capabilities:
- Open the source file from matchedRules[].file
- Go to the line number
- Modify the CSS property
- Save the file

### 6. Reload and Verify
Call **browser_reload** with ignoreCache: true:
- Hot reload should apply changes automatically
- Take another screenshot to verify the fix
- Re-inspect if needed to confirm CSS changes

## Key Benefit - Source File Resolution:
- Traditional tools: "This element has color: red" (but where is it defined?)
- With source maps: "color: red is defined in button.scss at line 45:3"
- SCSS/LESS files resolve to original source locations
- Shows full cascade: what's overridden and why

## Example Tool Chain:
browser_screenshot → browser_inspect_element → (edit file) → browser_reload → browser_screenshot`
	},

	// --------------------------------------------------------------
	// PROMPT: How to Debug Errors
	// --------------------------------------------------------------
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
- Includes: source (console/network), type, message, location

### 2. Analyze Error Types

**Console Errors** (source: 'console'):
- JavaScript exceptions
- console.error() calls
- React/Vue rendering errors
- Location shows file:line:column

**Network Errors** (source: 'network'):
- HTTP 4xx/5xx responses
- Network failures (status: 0)
- Shows URL and HTTP method
- type: 'http_404', 'http_500', 'network_failure'

### 3. Get More Context
For JavaScript errors, call **browser_get_console_logs**:
- Shows all console output (log, warn, error, etc.)
- Use type filter to focus on specific log types
- Includes stack traces for errors

### 4. Check Performance Issues
Call **browser_get_performance** for:
- Web Vitals: LCP, CLS, FCP, TTFB
- Runtime metrics: heap size, DOM nodes, layout count
- Helps identify performance-related errors

### 5. Execute Debug Scripts
Call **browser_execute_script** to inspect state:
- Check variable values
- Query DOM elements
- Test fixes before editing files

### 6. Fix and Verify
After fixing the code:
- Call **browser_reload** with ignoreCache: true
- Call **browser_get_errors** again to verify fix
- Take a screenshot to confirm visual result

## Common Error Patterns:

**"Cannot read property X of undefined"**
- Null check issue
- Check the stack trace for the source file

**"Failed to fetch" / Network errors**
- API endpoint issue
- Check URL and server status
- CORS issues show as network failures

**"Module not found"**
- Import path issue
- Check package.json dependencies

## Example Tool Chain:
browser_get_errors → browser_get_console_logs → (fix code) → browser_reload → browser_get_errors`
	},

	// --------------------------------------------------------------
	// PROMPT: Full Development Workflow
	// --------------------------------------------------------------
	{
		name: 'full-dev-workflow',
		description: 'Complete workflow from starting a project to debugging and fixing issues',
		content: `# Full Development Workflow in Roopik

This workflow teaches you the complete cycle for frontend development.

## Phase 1: Start Project (Project Mode)

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
11. **Verify**: browser_screenshot

## Phase 4: Debug Issues

12. **Get errors**: browser_get_errors
13. **Get console logs**: browser_get_console_logs
14. **Check performance**: browser_get_performance
15. **Execute debug script**: browser_execute_script
16. **Fix and verify**: Edit code, reload, check errors

## Phase 5: Interactive Testing

17. **Click elements**: browser_action_input with action: 'click'
18. **Type text**: browser_action_input with action: 'type'
19. **Press keys**: browser_action_input with action: 'press'
20. **Scroll**: browser_action_input with action: 'scroll'
21. **Screenshot after action**: browser_screenshot

## Phase 6: Component Development (Canvas Mode)

22. **Get/create canvas**: canvas_get_active / canvas_create
23. **Add component**: component_add with folderPath
24. **Check build**: component_get_info
25. **View result**: browser_screenshot

## Tool Categories:

**Project Tools** (3):
- project_get_active, project_start, project_stop

**Browser Core** (6):
- browser_open, browser_close, browser_screenshot
- browser_navigate, browser_reload, browser_action_input

**Browser Debug** (4):
- browser_execute_script, browser_inspect_element
- browser_get_errors, browser_get_console_logs

**Browser Info** (4):
- browser_get_state, browser_get_performance
- browser_set_viewport, browser_get_network_requests

**Browser Selectors** (2):
- browser_find_element, browser_wait_for_element

**Canvas Tools** (4):
- canvas_list, canvas_get_active, canvas_create, canvas_open

**Component Tools** (7):
- component_add, component_add_batch, component_remove
- component_get_info, component_list, component_rebuild
- canvas_validate_components

**Guide Tool** (1):
- roopik_get_guide

## Total: 29 Tools

## Key Tips:
- Always check project_get_active before starting
- Take screenshots frequently for visual verification
- Use browser_get_errors after any page load
- browser_inspect_element provides CSS source file resolution
- Use ignoreCache: true when reloading after code changes`
	}
];

// ============================================================================
// Helper to register prompts with MCP server
// ============================================================================

/**
 * Register all prompts with an MCP server instance
 * Used by HTTP MCP and can be adapted for STDIO binary
 */
export function registerMcpPrompts(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	server: any
): void {
	for (const prompt of MCP_PROMPTS) {
		server.prompt(
			prompt.name,
			prompt.description,
			async () => ({
				messages: [{
					role: 'user' as const,
					content: {
						type: 'text' as const,
						text: prompt.content
					}
				}]
			})
		);
	}
}
