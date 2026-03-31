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
// Common field: tabId (used by all browser tools that target a specific tab)
// ============================================================================

const tabIdField = z.number().optional().describe(
	'Target tab ID. Omit to use the active tab. Use browser_get_state to see all open tabs.'
);

// ============================================================================
// Browser Tool Schemas (14)
// ============================================================================

export const browserOpenSchema = z.object({
	url: z.string().optional().describe('URL to navigate to in the new tab. If omitted, opens a blank tab.')
});

const waitUntilField = z.enum(['load', 'domcontentloaded', 'networkidle']).optional()
	.describe('When to consider navigation done. "load" (default) = all resources loaded, "domcontentloaded" = DOM parsed, "networkidle" = no requests for 500ms');

export const browserNavigateSchema = z.object({
	url: z.string().describe('URL to navigate to'),
	waitUntil: waitUntilField,
	tabId: tabIdField
});

export const browserReloadSchema = z.object({
	ignoreCache: z.boolean().optional().describe('Whether to ignore cache when reloading'),
	waitUntil: waitUntilField,
	tabId: tabIdField
});

export const browserActionInputSchema = z.object({
	action: z.enum(['click', 'right_click', 'double_click', 'hover', 'drag', 'type', 'press', 'scroll'])
		.describe('The action to perform'),
	coordinate: z.string().optional().describe('Coordinates in "x,y" format for click/hover actions'),
	text: z.string().optional().describe('Text to type (for type action)'),
	key: z.string().optional().describe('Key to press (for press action)'),
	modifiers: z.array(z.string()).optional().describe('Modifier keys (ctrl, alt, shift, meta)'),
	deltaX: z.number().optional().describe('Horizontal scroll delta'),
	deltaY: z.number().optional().describe('Vertical scroll delta'),
	tabId: tabIdField
});

export const browserExecuteScriptSchema = z.object({
	script: z.string().describe('JavaScript code to execute'),
	tabId: tabIdField
});

export const browserInspectElementSchema = z.object({
	selector: z.string().describe('CSS selector for the element'),
	includeInherited: z.boolean().optional().describe('Include inherited styles'),
	tabId: tabIdField
});

export const browserGetErrorsSchema = z.object({
	limit: z.number().optional().describe('Maximum number of errors to return'),
	tabId: tabIdField
});

export const browserGetConsoleLogsSchema = z.object({
	types: z.array(z.string()).optional().describe('Filter by log types (log, warn, error, etc.)'),
	since: z.number().optional().describe('Get logs since timestamp'),
	limit: z.number().optional().describe('Maximum number of logs'),
	clear: z.boolean().optional().describe('Clear logs after getting'),
	tabId: tabIdField
});

export const browserSetViewportSchema = z.object({
	width: z.number().optional().describe('Viewport width in pixels. Omit to clear override.'),
	height: z.number().optional().describe('Viewport height in pixels. Omit to clear override.'),
	deviceScaleFactor: z.number().optional().describe('Device scale factor (default: 1)'),
	mobile: z.boolean().optional().describe('Emulate mobile device (default: false)'),
	tabId: tabIdField
});

export const browserGetNetworkRequestsSchema = z.object({
	includeStaticAssets: z.boolean().optional().describe('Include static assets (JS/CSS/images). Default: false (only API calls shown)'),
	urlFilter: z.string().optional().describe('Filter requests by URL substring'),
	method: z.string().optional().describe('Filter by HTTP method (GET, POST, etc.)'),
	statusFilter: z.enum(['success', 'error', 'all']).optional()
		.describe('Filter by status: success (2xx-3xx), error (4xx-5xx or failed), all'),
	limit: z.number().optional().describe('Maximum number of requests to return (default: 100, max: 500)'),
	tabId: tabIdField
});

export const browserTabIdOnlySchema = z.object({
	tabId: tabIdField
});

export const browserCloseSchema = z.object({
	tabId: z.number().optional().describe('Tab ID to close. Omit to close ALL open browser tabs. Use browser_get_state to see all open tabs.')
});

export const browserFindElementSchema = z.object({
	selector: z.string().describe('Smart selector. Supports: css= (default), text=, role=, xpath=, id=, data-testid= prefixes. Examples: "text=Submit", "role=button[name=\\"Save\\"]", "#login-form", "data-testid=hero"'),
	tabId: tabIdField
});

export const browserWaitForElementSchema = z.object({
	selector: z.string().describe('CSS selector to wait for'),
	timeout: z.number().optional().describe('Timeout in ms (default: 5000)'),
	tabId: tabIdField
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
	// ========== Browser Tools (16) ==========
	{
		name: 'browser_open',
		description: 'Open a browser tab. If the browser is not open, opens it. If already open, opens a new tab. Optionally provide a URL to navigate immediately.',
		schema: browserOpenSchema
	},
	{
		name: 'browser_close',
		description: 'Close browser tabs. With tabId: closes that specific tab. Without tabId: closes ALL open browser tabs.',
		schema: browserCloseSchema
	},
	{
		name: 'browser_screenshot',
		description: 'Take a screenshot of a browser tab. Returns base64 PNG image with tabId.',
		schema: browserTabIdOnlySchema
	},
	{
		name: 'browser_navigate',
		description: 'Navigate to a URL in a browser tab. For local projects: use project_start for Vite, or start a server and use http://localhost.',
		schema: browserNavigateSchema
	},
	{
		name: 'browser_reload',
		description: 'Reload a browser tab.',
		schema: browserReloadSchema
	},
	{
		name: 'browser_action_input',
		description: 'Perform browser input actions (click, type, scroll, etc.) on a tab.',
		schema: browserActionInputSchema
	},
	{
		name: 'browser_execute_script',
		description: 'Execute JavaScript in a browser tab context.',
		schema: browserExecuteScriptSchema
	},
	{
		name: 'browser_inspect_element',
		description: 'Inspect CSS styles of an element with source file resolution. Returns exact file:line:column where styles are defined (requires source maps).',
		schema: browserInspectElementSchema
	},
	{
		name: 'browser_get_errors',
		description: 'Get console errors and network failures from a tab. Auto-clears on page reload.',
		schema: browserGetErrorsSchema
	},
	{
		name: 'browser_get_console_logs',
		description: 'Get browser console logs from a tab.',
		schema: browserGetConsoleLogsSchema
	},
	{
		name: 'browser_get_performance',
		description: 'Get browser performance metrics (Web Vitals: LCP, CLS, FCP, TTFB and runtime metrics) from a tab.',
		schema: browserTabIdOnlySchema
	},
	{
		name: 'browser_get_state',
		description: 'Get browser state: open/closed, dev server status, active tab ID, and all tabs with URLs, titles, loading status, and viewport sizes. Pass tabId to get only that tab\'s info.',
		schema: browserTabIdOnlySchema
	},
	{
		name: 'browser_set_viewport',
		description: 'Set or clear browser viewport override on a tab. Provide width/height to set a specific size (e.g., mobile 375x812). Call with NO parameters to clear override.',
		schema: browserSetViewportSchema
	},
	{
		name: 'browser_get_network_requests',
		description: 'Get network requests from a tab. Use includeStaticAssets to show all assets.',
		schema: browserGetNetworkRequestsSchema
	},
	{
		name: 'browser_find_element',
		description: 'Find elements using smart selectors with shadow DOM piercing. Supports: css= (default), text=, role=, xpath=, id=, data-testid= prefixes. Returns coordinates for clicking. Examples: "text=Submit", "role=button[name=\\"Save\\"]", "#login-form".',
		schema: browserFindElementSchema
	},
	{
		name: 'browser_wait_for_element',
		description: 'Wait for a CSS selector to appear and become visible, with timeout. Useful after navigation or dynamic content loading.',
		schema: browserWaitForElementSchema
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

	// ========== Component Tools (7) ==========
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

	// ========== Guide Tool (1) ==========
	{
		name: 'roopik_get_guide',
		description: 'Fetch workflow instructions for Roopik tools. IMPORTANT: Call this FIRST if you are unsure when to use canvas mode vs project mode, or how to structure components. Returns detailed step-by-step guidance.',
		schema: roopikGetGuideSchema
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

// Total: 31 Tools (16 Browser + 4 Canvas + 7 Component + 3 Project + 1 Guide)
