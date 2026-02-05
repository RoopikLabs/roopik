/**
 * Tool Definitions
 *
 * AUTO-GENERATED from toolSchemas.ts - DO NOT EDIT DIRECTLY!
 * Run 'npm run sync-schemas' to update from source.
 *
 * Source: src/vs/workbench/contrib/roopik/electron-main/mcp/toolSchemas.ts
 */

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
	includeStaticAssets: z.boolean().optional().describe('Include static assets (JS/CSS/images). Default: false (only API calls shown)'),
	urlFilter: z.string().optional().describe('Filter requests by URL substring'),
	method: z.string().optional().describe('Filter by HTTP method (GET, POST, etc.)'),
	statusFilter: z.enum(['success', 'error', 'all']).optional()
		.describe('Filter by status: success (2xx-3xx), error (4xx-5xx or failed), all'),
	limit: z.number().optional().describe('Maximum number of requests to return (default: 100, max: 500)')
});

// Empty schemas for tools with no parameters
export const emptySchema = z.object({});

// ============================================================================
// Canvas Tool Schemas (4)
// ============================================================================

export const canvasListSchema = z.object({
	nameFilter: z.string().optional().describe('Filter by name'),
	sortBy: z.enum(['name', 'updatedAt', 'createdAt', 'componentCount']).optional().describe('Sort field'),
	sortDirection: z.enum(['asc', 'desc']).optional().describe('Sort direction')
});

export const canvasCreateSchema = z.object({
	name: z.string().describe('Canvas name')
});

export const canvasOpenSchema = z.object({
	canvasId: z.string().optional().describe('Canvas ID to open'),
	name: z.string().optional().describe('Canvas name to open (will look up by name)')
});

// ============================================================================
// Component Tool Schemas (6)
// ============================================================================

export const componentAddSchema = z.object({
	canvasId: z.string().optional().describe('Target canvas ID (uses active if not provided)'),
	folderPath: z.string().describe('Path to component folder'),
	name: z.string().optional().describe('Component name (auto-detected if not provided)'),
	entryFile: z.string().optional().describe('Entry file (auto-detected if not provided)'),
	framework: z.enum(['react', 'vue', 'svelte', 'solid', 'preact',]).optional()
		.describe('Framework (auto-detected if not provided)')
});

export const componentAddBatchSchema = z.object({
	components: z.array(z.object({
		canvasId: z.string().optional(),
		folderPath: z.string(),
		name: z.string().optional(),
		entryFile: z.string().optional(),
		framework: z.enum(['react', 'vue', 'svelte', 'solid', 'preact']).optional()
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

export const componentValidateSchema = z.object({
	canvasId: z.string().optional().describe('Canvas ID (uses active canvas if not provided)')
});

// TODO: Feature pending - has race condition with webview initialization
// export const componentScreenshotSchema = z.object({
// 	componentId: z.string().describe('Component ID to screenshot'),
// 	canvasId: z.string().describe('Canvas ID where the component is located')
// });

// ============================================================================
// Project Tool Schemas (3)
// ============================================================================

export const projectStartSchema = z.object({
	projectPath: z.string().describe('Path to project (relative or absolute)'),
	port: z.number().optional().describe('Optional port number')
});

// ============================================================================
// Debug Tool Schemas (11) - Autonomous Debugging for AI Agents
// ============================================================================

export const debugStartAndWaitSchema = z.object({
	file: z.string().describe('Absolute path to the file to debug (entry point)'),
	line: z.number().describe('Line number to set initial breakpoint (1-indexed)'),
	timeout: z.number().optional().describe('Timeout in ms (default: 30000)'),
	stopOnEntry: z.boolean().optional().describe('Pause immediately on start (default: true)'),
	debugType: z.enum(['node', 'python', 'chrome']).optional().describe('Debug adapter type (auto-detected if not specified)')
});

export const debugStopSchema = z.object({});

export const debugSetBreakpointSchema = z.object({
	file: z.string().describe('Absolute path to source file'),
	line: z.number().describe('Line number (1-indexed)'),
	enabled: z.boolean().optional().describe('Whether breakpoint is enabled (default: true)'),
	condition: z.string().optional().describe('Condition expression (e.g., "x > 5")'),
	hitCondition: z.string().optional().describe('Hit condition (e.g., ">=5" for 5th hit)'),
	logMessage: z.string().optional().describe('Log message (converts to logpoint, does not pause)')
});

export const debugRemoveBreakpointSchema = z.object({
	id: z.string().describe('Breakpoint ID (returned from debug_set_breakpoint or debug_list_breakpoints), or "all" to clear ALL breakpoints')
});

export const debugListBreakpointsSchema = z.object({});

export const debugStepSmartSchema = z.object({
	count: z.number().optional().describe('Number of steps to execute (default: 1). Stops early if breakpoint/exception hit.')
});

export const debugStepIntoSchema = z.object({});

export const debugStepOutSchema = z.object({});

export const debugRunUntilLineSchema = z.object({
	line: z.number().describe('Target line number to run to (1-indexed)'),
	file: z.string().optional().describe('Target file (uses current file if not specified)'),
	timeout: z.number().optional().describe('Timeout in ms (default: 30000)')
});

export const debugContinueSchema = z.object({
	timeout: z.number().optional().describe('Timeout in ms to wait for next stop (default: 30000)')
});

export const debugGetContextSchema = z.object({});

export const debugEvaluateSchema = z.object({
	expression: z.string().describe('Expression to evaluate (e.g., "user.name", "calculateTotal(items)")'),
	frameId: z.number().optional().describe('Stack frame ID (uses top frame if not specified)'),
	context: z.enum(['watch', 'repl', 'hover']).optional().describe('Evaluation context (default: repl)')
});

// ============================================================================
// Guide Tool Schema (1)
// ============================================================================

export const roopikGetGuideSchema = z.object({
	topic: z.enum(['canvas_vs_project', 'canvas_workflow', 'project_workflow', 'component_design'])
		.describe('Guide topic to fetch')
});

// ============================================================================
// Guide Content - Detailed instructions for each topic
// ============================================================================

// MCP Instructions - Sent once during initialization (MCP spec feature)
export const MCP_INSTRUCTIONS = `
# Roopik IDE - MCP Tools Guide

## You Are a Designer and Developer

You have powerful design and development tools at your disposal. **Behave like a designer and developer** - collaborate with the user!

**ASK when in doubt about:**
- Design direction: "Would you prefer a minimalist or bold style?"
- Framework choice: "Which framework? React (default), Vue, Svelte, Solid, or Preact?"
- Mode transition: "You've created some nice components. Ready to build a full project with these?"
- Color/typography: "Any brand colors or font preferences?"
- Variations: "Should I show you a few different approaches?"

**Don't assume - engage the user** in design decisions. You're collaborating, not just executing.

---

Roopik has two INDEPENDENT modes. Understanding the difference is CRITICAL.

## What is Canvas?

Canvas is an infinite design surface in the IDE where each component renders in its own **isolated sandbox**. The user sees multiple components displayed side-by-side, each in a separate sandboxed environment. This allows comparing different designs simultaneously.

Key characteristics:
- Each component = its own isolated sandbox (not a shared page)
- Components are **Single File Components (SFC)** - one file, one component
- User sees all added components side-by-side in the IDE canvas panel
- Canvas is NOT a browser - it's a built-in IDE panel with sandboxed previews

## Canvas Mode vs Project Mode

| Aspect | Canvas Mode | Project Mode |
|--------|-------------|--------------|
| What it is | Sandboxed component previews | Full Vite dev server |
| Tools | canvas_* + component_* | project_* + browser_* |
| Preview | AUTOMATIC in IDE sandboxes | Browser at localhost |
| Comparison | Multiple side-by-side | ONE project at a time |

## CRITICAL: Browser Tools vs Canvas

**Canvas Mode** - Preview is AUTOMATIC in IDE:
- After \`component_add\`, component appears in its own sandbox in IDE
- [NO] Do NOT use browser_screenshot - canvas is not in browser
- [NO] Do NOT use browser_navigate - canvas has no URL
- [NO] Do NOT use any browser_* tools for canvas
- User sees isolated component previews directly in IDE

**Project Mode** - Uses embedded browser:
- After \`project_start\`, dev server runs at localhost
- [YES] Use browser_screenshot to capture the running app
- [YES] Use browser_navigate to change pages
- [YES] Use browser_* tools to interact

## Component Requirements (CRITICAL)

Components MUST be **Single File Components (SFC)**:
- One file per component with DEFAULT EXPORT
- Supported frameworks: React (.tsx/.jsx), Vue (.vue), Svelte (.svelte), Solid, Preact
- **Default to React** if user doesn't specify a framework
- [NO] Do NOT use CDN URLs for imports (esm.sh, unpkg, etc.)
- [YES] Use standard bare imports: \`import { motion } from 'framer-motion'\`
- The build system resolves all npm dependencies internally

Example React SFC:
\`\`\`tsx
import { useState } from 'react';
import { motion } from 'framer-motion';

export default function HeroSection() {
  const [count, setCount] = useState(0);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <h1>Hero Section</h1>
    </motion.div>
  );
}
\`\`\`

## When to Use Each Mode

**Canvas Mode** (default for design work):
- "try different designs", "explore ideas", "show variations"
- Iterating on UI components (hero, card, nav bar)
- Comparing multiple designs side-by-side in isolated sandboxes

**Project Mode** (only when explicitly requested):
- "build a full app", "create a complete project"
- Needs routing, multiple pages, backend integration
- User says "Vite", "React app", "full project"

## Canvas Mode Workflow

1. \`canvas_create({ name: "Shoe Designs" })\`

2-3. **Write + Add INCREMENTALLY** (critical for good UX!):

   [OK] Write Hero -> Add Hero -> Write Card -> Add Card -> Write Nav -> Add Nav
   [BAD] Write Hero -> Write Card -> Write Nav -> Add all at end

   For each component:
   a) Write **Single File Component (SFC)**:
      - File: \`components/HeroSection/HeroSection.tsx\` (use component name, not index.tsx)
      - MUST have default export
      - Small, focused (one section) - NOT full pages
      - Use standard imports, NOT CDN URLs
   b) IMMEDIATELY call: \`component_add({ folderPath: "./components/HeroSection" })\`
   c) User sees it appear in canvas instantly - move to next component

   This gives users live feedback as each component becomes available!

4. Verify all at end: \`canvas_validate_components()\` - check build status

5. User sees each component in its own sandbox - NO browser tools!

## Canvas to Project Transition

After user has iterated on components and selected their favorites:

1. **Ask user**: "Would you like me to build a full project using these components?"
2. If yes, create project with user's preferred framework (React, Vue, etc.)
3. Copy/integrate the selected canvas components into the project
4. **Add README.md** with clean, minimal setup instructions (install, run commands)
5. Use \`project_start\` for Vite-based projects, or let user run their own dev server
6. NOW use browser_* tools to navigate, inspect, preview the full app

This is the natural workflow: **Canvas (design iteration) → Project (production build)**

## Project Mode Workflow

1. \`project_get_active()\` - check if one is running
2. \`project_start({ projectPath: "./my-app" })\` - Vite projects only
3. For non-Vite projects: user runs their own server, use \`browser_navigate\` to localhost
4. NOW use browser_* tools (screenshot, navigate, inspect, etc.)
5. \`project_stop()\` when done

## Common Mistakes
- [X] browser_screenshot for canvas (it's automatic in IDE!)
- [X] Full pages instead of focused SFC components
- [X] Missing default export
- [X] Using CDN URLs (use standard imports)
- [X] Multiple projects (only one allowed)
`;

export const GUIDE_CONTENT: Record<string, string> = {
	canvas_vs_project: `# Canvas Mode vs Project Mode - When to Use Each

## Decision Rule
When user asks for design/creative/UI work (e.g., "design a landing page", "show me some ideas", "create a dashboard"), ASK which mode they want:

**Canvas Mode** - For iterating on individual components:
- Creates small, focused UI pieces (hero section, product card, nav bar)
- Shows multiple components side-by-side for comparison
- Best for: exploring design variations, testing different approaches

**Project Mode** - For full running applications:
- Starts a complete Vite dev server
- Only ONE project can run at a time
- Best for: when user explicitly wants a full app

## When to Use Canvas Mode
- User wants to "try different designs"
- User wants to "explore ideas" or "show variations"
- User is iterating on UI components
- User hasn't specified they need a full app

## When to Use Project Mode
- User explicitly says "build me a full app"
- User says "create a Vite/React/Vue project"
- User needs routing, multiple pages, full functionality`,

	canvas_workflow: `# Canvas Mode Workflow

## Step-by-Step Process

### 1. Create a Canvas
Call **canvas_create** with a descriptive name:
\`\`\`
canvas_create({ name: "ShoeDesigns" })
\`\`\`

### 2-3. Write + Add INCREMENTALLY (Better UX!)

**IMPORTANT**: Add each component RIGHT AFTER writing it, not at the end.
This lets users see live progress as you work.

[OK] Write Hero -> Add Hero -> Write Card -> Add Card
[BAD] Write Hero -> Write Card -> Add all at end

For each component:
1. Write **Single File Component (SFC)**:
   - [OK] HeroSection.tsx (just the hero)
   - [OK] ProductCard.tsx (single card)
   - [OK] NavBar.tsx (navigation only)
   - [BAD] FullPage.tsx (too big!)
   - [BAD] CompleteSite.html (not a component!)
   - MUST have default export
   - Use standard imports, NOT CDN URLs

Each component folder should contain ONE UI element.

2. IMMEDIATELY call **component_add**:
\`\`\`
component_add({ folderPath: "./components/HeroSection" })
\`\`\`

3. User sees it appear in canvas - move to next component

### 4. Validate All at End
After all components are added, verify everything built correctly:
\`\`\`
canvas_validate_components()
\`\`\`

### 5. View Side-by-Side
The canvas displays all components together for easy comparison and iteration.

## Key Rules
- Components = small, focused pieces (one section, one card, one element)
- Canvas = container that shows all components side-by-side
- You MUST call canvas_create then component_add - don't just write HTML files
- Add components incrementally as you write them - don't batch at the end!`,

	project_workflow: `# Project Mode Workflow

## When to Use
- User explicitly wants a full running application
- User mentions "Vite", "React app", "full project"
- User needs routing, state management, multiple pages

## Step-by-Step Process

### 1. Check for Running Project
Call **project_get_active** first - only one project can run at a time.

### 2. Start the Project
Call **project_start** with the project path:
\`\`\`
project_start({ projectPath: "./my-vite-app" })
\`\`\`

### 3. View in Browser
The browser opens automatically. Use browser_screenshot to see the result.

## Limitations
- Only Vite-based projects supported (React, Vue, Svelte with Vite)
- Only ONE project can run at a time
- Cannot compare multiple projects simultaneously

## If User Wants to Compare Designs
Use Canvas Mode instead! Canvas shows multiple components side-by-side.`,

	component_design: `# Component Design Guidelines

## What Makes a Good Component for Canvas
- **Focused**: One UI element (a card, a header, a form)
- **Self-contained**: Works independently
- **Iterable**: Easy to modify and compare variations

## Examples of Good Components
- Hero section with headline and CTA
- Product card with image, title, price
- Navigation bar
- Footer
- Pricing table (single)
- Testimonial card

## Examples of BAD Components (Too Big)
- Complete landing page (800+ lines)
- Full website with multiple sections
- Entire application UI

## Structure
Each component should be in its own folder (use component name, not index.tsx):
\`\`\`
components/
  HeroSection/
    HeroSection.tsx (or .vue, .svelte)
    styles.css (optional)
  ProductCard/
    ProductCard.tsx
  NavBar/
    NavBar.tsx
\`\`\`

## For Variations
Create separate component folders:
\`\`\`
components/
  HeroSection-v1/
  HeroSection-v2/
  HeroSection-v3/
\`\`\`
Then add all three to the canvas to compare side-by-side.`
};

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
		description: 'Open the browser view. Optionally navigate to a URL. For local project files: file:// URLs are not supported. Use project_start for Vite-based projects, or manually start a server (e.g., npx serve) and use browser_navigate with the http://localhost address.',
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
		description: 'Navigate to a URL in the browser. For local project files: file:// URLs are not supported. Use project_start for Vite-based projects, or manually start a server (e.g., npx serve) and use the http://localhost address.',
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
		description: 'Get console errors and network failures. Auto-clears on page reload.',
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
		description: 'Get network requests. Use includeStaticAssets parameter to show all assets.',
		schema: browserGetNetworkRequestsSchema
	},

	// ========== Canvas Tools (4) ==========
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
		description: 'Create a canvas for component iteration. Use SHORT names (1-2 words max), either CamelCase or with spaces. Examples: "ShoeDesigns", "Dashboard Cards", "LoginForms". After creating canvas, write small SFC files then use component_add.',
		schema: canvasCreateSchema
	},
	{
		name: 'canvas_open',
		description: 'Open an existing canvas by ID or name. Opens the canvas panel in the UI and returns canvas info with all components (id, name, path, status).',
		schema: canvasOpenSchema
	},

	// ========== Component Tools (6) ==========
	{
		name: 'component_add',
		description: 'Add a component to a canvas for live preview. Components should be small, focused pieces (e.g., a hero section, a product card, a navigation bar) - NOT full pages. Each component folder should contain a single UI element that can be iterated on independently. The canvas displays all added components side-by-side for easy comparison and iteration.',
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
	{
		name: 'canvas_validate_components',
		description: 'Validate all components in a canvas. Returns summary (total, success, failed, building counts) plus detailed error info for failed components. Efficient way to check component health without individual calls.',
		schema: componentValidateSchema
	},
	// TODO: Feature pending - has race condition with webview initialization
	// {
	// 	name: 'component_screenshot',
	// 	description: 'Capture a screenshot of a specific component rendered in the canvas. Requires both componentId and canvasId. The canvas will be opened/focused if not already visible. Returns base64 data URL of the component\'s visual appearance.',
	// 	schema: componentScreenshotSchema
	// },

	// ========== Project Tools (3) ==========
	{
		name: 'project_get_active',
		description: 'Check if a dev server is running and get its info.',
		schema: emptySchema
	},
	{
		name: 'project_start',
		description: 'Start a Vite dev server. Only ONE project can run at a time. If unsure about canvas vs project workflow, call roopik_get_guide first with topic "canvas_vs_project". For design iteration/variations, use canvas mode instead.',
		schema: projectStartSchema
	},
	{
		name: 'project_stop',
		description: 'Stop the running development server.',
		schema: emptySchema
	},

	// ========== Debug Tools (11) - Autonomous Debugging ==========
	{
		name: 'debug_start_and_wait',
		description: 'Start a debug session, set a breakpoint, and WAIT until the breakpoint is hit. Returns full debug context (file, line, variables, stack, console logs). This is the primary entry point for agent debugging.',
		schema: debugStartAndWaitSchema
	},
	{
		name: 'debug_stop',
		description: 'Stop the active debug session.',
		schema: debugStopSchema
	},
	{
		name: 'debug_set_breakpoint',
		description: 'Set a breakpoint at a specific line. Supports conditions, hit counts, and logpoints. Returns breakpoint ID for removal.',
		schema: debugSetBreakpointSchema
	},
	{
		name: 'debug_remove_breakpoint',
		description: 'Remove a breakpoint by its ID, or pass id="all" to clear ALL breakpoints (including manually set in the IDE).',
		schema: debugRemoveBreakpointSchema
	},
	{
		name: 'debug_list_breakpoints',
		description: 'List ALL breakpoints currently in the IDE (agent-set and manually set). Returns id, file, line, condition for each. Use these ids with debug_remove_breakpoint, or clear all with remove id="all".',
		schema: debugListBreakpointsSchema
	},
	{
		name: 'debug_step_smart',
		description: 'Step over N times in a single call (macro operation). Reduces LLM round-trips. Stops early if breakpoint or exception is hit. Returns context after final step.',
		schema: debugStepSmartSchema
	},
	{
		name: 'debug_step_into',
		description: 'Step into a function call.',
		schema: debugStepIntoSchema
	},
	{
		name: 'debug_step_out',
		description: 'Step out of the current function to its caller. Useful for escaping framework/library code.',
		schema: debugStepOutSchema
	},
	{
		name: 'debug_run_until_line',
		description: 'Run execution until reaching a specific line. Uses temporary breakpoint for O(1) performance (instant teleport, not stepping). Returns context when stopped.',
		schema: debugRunUntilLineSchema
	},
	{
		name: 'debug_continue',
		description: 'Continue execution until the next breakpoint is hit or timeout. Returns context when stopped.',
		schema: debugContinueSchema
	},
	{
		name: 'debug_get_context',
		description: 'Get current debug context without moving execution. Returns file, line, variables, stack, console logs, and exception info if applicable.',
		schema: debugGetContextSchema
	},
	{
		name: 'debug_evaluate',
		description: 'Evaluate an expression in the current debug context (like Debug Console). Can access local variables and call functions.',
		schema: debugEvaluateSchema
	},

	// ========== Guide Tool (1) ==========
	{
		name: 'roopik_get_guide',
		description: 'Fetch workflow instructions for Roopik tools. IMPORTANT: Call this FIRST if you are unsure when to use canvas mode vs project mode, or how to structure components. Returns detailed step-by-step guidance.',
		schema: roopikGetGuideSchema
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
		name: 'canvas-vs-project-workflow',
		description: 'When to use canvas mode for component iteration vs full project mode',
		content: `# Canvas vs Project: Which Workflow to Use?

When a user asks for design/creative work (e.g., "design a landing page", "show me some UI ideas", "build a dashboard"), you must determine the right workflow.

## Decision Rule

**ASK the user** if their intent is unclear. Do NOT assume they want a full project.

### When to ASK:
- User says: "design a landing page" → unclear if they want iteration or full project
- User says: "show me some ideas for a dashboard" → sounds like exploration
- User says: "help me build a login form" → could be either

**Prompt the user with:**
"Would you like to:
1. **Canvas mode** - See a few component designs side-by-side to refine ideas first, or
2. **Project mode** - Build a full running [framework] project in the browser?"

### When to go STRAIGHT to full project:
- User explicitly says: "build me a React website"
- User explicitly says: "create a full running project"
- User explicitly says: "scaffold a Next.js app"

### When to use Canvas mode directly:
- User says: "show me some design variations"
- User says: "I want to experiment with different styles"
- User says: "let me see a few options first"

## Why This Matters

- **Canvas mode** = Fast iteration, multiple components side-by-side, quick to tweak
- **Project mode** = Full running app, routing, state management, production-like

Canvas mode is ideal for design exploration before committing to a full project structure.`
	},
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

This workflow teaches you how to inspect CSS and resolve styles to their source files.

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

## Key Benefit - Source File Resolution:
- Traditional tools: "This element has color: red" (but where is it defined?)
- With source maps: "color: red is defined in button.scss at line 45:3"

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
- **Browser Info** (4): browser_get_performance, browser_get_state, browser_set_viewport, browser_get_network_requests
- **Canvas Tools** (4): canvas_list, canvas_get_active, canvas_create, canvas_open
- **Component Tools** (7): component_add, component_add_batch, component_remove, component_get_info, component_list, component_rebuild, canvas_validate_components

## Total: 27 Tools`
	},
	{
		name: 'how-to-test-responsive',
		description: 'Step-by-step guide for testing responsive designs across different viewport sizes',
		content: `# How to Test Responsive Design in Roopik

This workflow teaches you how to test components/pages at different screen sizes.

## Step-by-Step Process:

### 1. Set Mobile Viewport
Call **browser_set_viewport** with mobile dimensions:
- width: 375, height: 812 (iPhone X)
- width: 390, height: 844 (iPhone 12/13/14)
- width: 360, height: 800 (Android common)
- mobile: true (enables touch emulation)

### 2. Take Screenshot
Call **browser_screenshot** to capture mobile view.

### 3. Test Tablet
Call **browser_set_viewport** with tablet dimensions:
- width: 768, height: 1024 (iPad)
- width: 820, height: 1180 (iPad Air)

### 4. Test Desktop
Call **browser_set_viewport** with desktop dimensions:
- width: 1280, height: 800 (laptop)
- width: 1920, height: 1080 (full HD)

### 5. Clear Viewport Override
Call **browser_set_viewport** with NO parameters to restore natural browser size.

## Common Breakpoints to Test:
- 320px - Small mobile
- 375px - iPhone
- 768px - Tablet
- 1024px - Small desktop/landscape tablet
- 1280px - Laptop
- 1920px - Full HD desktop

## Example Tool Chain:
browser_set_viewport (mobile) → browser_screenshot → browser_set_viewport (tablet) → browser_screenshot → browser_set_viewport (clear)`
	},
	{
		name: 'how-to-debug-network',
		description: 'Step-by-step guide for inspecting API calls and network requests',
		content: `# How to Debug Network Requests in Roopik

This workflow teaches you how to inspect API calls and network activity.

## Step-by-Step Process:

### 1. Get API Requests Only
Call **browser_get_network_requests** with defaults:
- By default, static assets (JS/CSS/images) are hidden
- Shows only API calls (fetch, XHR)

### 2. Filter by Status
Use statusFilter parameter:
- statusFilter: 'error' → Only failed requests (4xx, 5xx, network errors)
- statusFilter: 'success' → Only successful requests (2xx, 3xx)
- statusFilter: 'all' → Everything

### 3. Filter by URL
Use urlFilter parameter:
- urlFilter: '/api/' → Only requests containing '/api/'
- urlFilter: 'users' → Only requests containing 'users'

### 4. Filter by Method
Use method parameter:
- method: 'POST' → Only POST requests
- method: 'GET' → Only GET requests

### 5. Include Static Assets
Set includeStaticAssets: true to see everything:
- JavaScript files
- CSS files
- Images
- Fonts

## Response Data Includes:
- url: Full request URL
- method: HTTP method
- status: HTTP status code (or 'failed' for network errors)
- timing: Request duration in ms
- size: Response size in bytes

## Example Tool Chain:
browser_get_network_requests (errors only) → browser_get_network_requests (filter by URL) → (fix API issue) → browser_reload`
	},
	{
		name: 'component-design-guidelines',
		description: 'Professional design principles for creating high-quality UI components',
		content: `# Component Design Guidelines

When creating UI components, follow these professional design principles to avoid generic AI aesthetics.

## Typography (CRITICAL)
**NEVER use these fonts**: Inter, Roboto, Open Sans, Lato, Montserrat, Arial, Helvetica
**USE distinctive fonts instead**:
- Headers: Clash Display, Cabinet Grotesk, Satoshi, General Sans, Switzer
- Body: Geist, Plus Jakarta Sans, DM Sans, Outfit, Manrope
- Accent: Space Grotesk, Syne, Unbounded

Import from: https://api.fontshare.com or Google Fonts (less common ones)

## Color & Theme
- Use CSS custom properties (--color-primary, --bg-surface, etc.)
- Pick a dominant color and use 60-30-10 rule
- Avoid pure black (#000) - use dark grays (#0a0a0a, #111)
- Add subtle color tints to grays for cohesion

## Motion & Animation
- Use framer-motion for React, Vue Transition for Vue
- Stagger children animations (0.05-0.1s delays)
- Micro-interactions on hover/focus (scale, glow, color shift)
- Keep durations short: 150-300ms for UI, 300-500ms for reveals

## Spatial Composition
- Break the grid intentionally - overlap elements, use negative margins
- Vary spacing rhythm - not everything needs equal padding
- Use asymmetry for visual interest
- Layer elements with z-index for depth

## Visual Details
- Subtle gradients over flat colors
- Noise textures for depth (opacity 0.02-0.05)
- Glassmorphism: backdrop-blur + semi-transparent backgrounds
- Soft shadows with color tints, not pure black

## Component Structure
- Mobile-first responsive design
- Single File Component (SFC) format
- Self-contained with scoped styles
- No external dependencies beyond the framework

## Anti-Patterns to Avoid
- Generic card layouts with uniform spacing
- Blue primary buttons with white text
- Perfect symmetry everywhere
- Stock icon libraries without customization
- Cookie-cutter hero sections`
	}
];
