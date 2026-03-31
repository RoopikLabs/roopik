import type OpenAI from "openai"

// ============================================================================
// Browser Tools (16)
// ============================================================================

export const browser_open: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "browser_open",
		description:
			"[Roopik IDE] Open a browser tab. If the browser is not open, opens it. If already open, opens a new tab. Optionally provide a URL to navigate immediately.\n\nExamples:\n- `{}` — open a blank tab (or launch browser if closed)\n- `{url: \"https://example.com\"}` — open a new tab at the given URL",
		strict: true,
		parameters: {
			type: "object",
			properties: {
				url: {
					type: "string",
					description: "URL to navigate to in the new tab. If omitted, opens a blank tab.",
				},
			},
			required: [],
			additionalProperties: false,
		},
	},
}

export const browser_navigate: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "browser_navigate",
		description:
			"[Roopik IDE] Navigate to a URL in a browser tab. For local projects, use project_start first — it returns the server URL.",
		strict: true,
		parameters: {
			type: "object",
			properties: {
				url: {
					type: "string",
					description:
						"The URL to navigate to (e.g., http://localhost:5173/login or just /login for relative paths)",
				},
				waitUntil: {
					type: "string",
					enum: ["load", "domcontentloaded", "networkidle"],
					description: 'When to consider navigation done. "load" (default) = all resources, "domcontentloaded" = DOM parsed, "networkidle" = no requests for 500ms.',
				},
				tabId: {
					type: "number",
					description: "Target tab ID. Omit for active tab. Use browser_get_state to see all open tabs.",
				},
			},
			required: ["url"],
			additionalProperties: false,
		},
	},
}

export const browser_reload: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "browser_reload",
		description:
			"[Roopik IDE] Reload a browser tab.",
		strict: true,
		parameters: {
			type: "object",
			properties: {
				ignoreCache: {
					type: "boolean",
					description: "Set to true for hard reload (clears cache). Default is false.",
				},
				waitUntil: {
					type: "string",
					enum: ["load", "domcontentloaded", "networkidle"],
					description: 'When to consider reload done. "load" (default) = all resources, "domcontentloaded" = DOM parsed, "networkidle" = no requests for 500ms.',
				},
				tabId: {
					type: "number",
					description: "Target tab ID. Omit for active tab. Use browser_get_state to see all open tabs.",
				},
			},
			required: [],
			additionalProperties: false,
		},
	},
}

export const browser_screenshot: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "browser_screenshot",
		description:
			"[Roopik IDE] Take a screenshot of a browser tab. Returns base64 PNG image with tabId.",
		strict: true,
		parameters: {
			type: "object",
			properties: {
				tabId: {
					type: "number",
					description: "Target tab ID. Omit for active tab. Use browser_get_state to see all open tabs.",
				},
			},
			required: [],
			additionalProperties: false,
		},
	},
}

export const browser_close: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "browser_close",
		description:
			"[Roopik IDE] Close browser tabs. With tabId: closes that specific tab. Without tabId: closes ALL open browser tabs.",
		strict: true,
		parameters: {
			type: "object",
			properties: {
				tabId: {
					type: "number",
					description: "Tab ID to close. Omit to close ALL open browser tabs. Use browser_get_state to see all open tabs.",
				},
			},
			required: [],
			additionalProperties: false,
		},
	},
}

export const browser_action_input: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "browser_action_input",
		description: `[Roopik IDE] Perform native input events in the browser. Supports click, right_click, double_click, hover, drag, type, press, scroll.

Coordinate format: 'x,y@WIDTHxHEIGHT' where WIDTH/HEIGHT are from browser_screenshot viewport.
Example: '450,203@900x600' means click at (450,203) on a 900x600 viewport.

Actions:
- click/right_click/double_click/hover: requires 'coordinate' or 'selector' (selector re-resolves at action time)
- drag: requires 'coordinate' (start) + 'deltaX'/'deltaY' (offset to end)
- type: requires 'text'
- press: requires 'key' (e.g., 'Enter', 'Escape', 'Tab'), optional 'modifiers' (['ctrl', 'shift'])
- scroll: requires 'deltaX' and/or 'deltaY' (negative = up/left)`,
		strict: false,
		parameters: {
			type: "object",
			properties: {
				action: {
					type: "string",
					description: "The action to perform: click, right_click, double_click, hover, drag, type, press, scroll",
					enum: ["click", "right_click", "double_click", "hover", "drag", "type", "press", "scroll"],
				},
				coordinate: {
					type: "string",
					description: "Coordinate string: 'x,y' or 'x,y@WIDTHxHEIGHT' for scaled coordinates",
				},
				selector: {
					type: "string",
					description: "Smart selector (alternative to coordinate). Re-resolved at action time. Supports: css=, text=, role= prefixes.",
				},
				text: {
					type: "string",
					description: "Text to type (for 'type' action)",
				},
				key: {
					type: "string",
					description: "Key to press (for 'press' action): Enter, Escape, Tab, ArrowDown, etc.",
				},
				modifiers: {
					type: "array",
					items: { type: "string" },
					description: "Modifier keys (for 'press' action): ['ctrl', 'shift', 'alt', 'meta']",
				},
				deltaX: {
					type: "number",
					description: "Horizontal offset for drag/scroll (negative = left)",
				},
				deltaY: {
					type: "number",
					description: "Vertical offset for drag/scroll (negative = up)",
				},
				tabId: {
					type: "number",
					description: "Target tab ID. Omit for active tab. Use browser_get_state to see all open tabs.",
				},
			},
			required: ["action"],
			additionalProperties: false,
		},
	},
}

export const browser_execute_script: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "browser_execute_script",
		description:
			"[Roopik IDE] Execute JavaScript in a browser tab context.",
		strict: true,
		parameters: {
			type: "object",
			properties: {
				script: {
					type: "string",
					description: "JavaScript code to execute in the browser",
				},
				tabId: {
					type: "number",
					description: "Target tab ID. Omit for active tab. Use browser_get_state to see all open tabs.",
				},
			},
			required: ["script"],
			additionalProperties: false,
		},
	},
}

export const browser_inspect_element: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "browser_inspect_element",
		description:
			"[Roopik IDE] Inspect CSS styles of an element with source file resolution. Returns exact file:line:column where styles are defined (requires source maps).",
		strict: true,
		parameters: {
			type: "object",
			properties: {
				selector: {
					type: "string",
					description:
						'CSS selector to find the element (e.g., ".btn-primary", "#header", "[data-testid=\'submit\']")',
				},
				includeInherited: {
					type: "boolean",
					description: "Include inherited styles from parent elements. Default is true.",
				},
				tabId: {
					type: "number",
					description: "Target tab ID. Omit for active tab. Use browser_get_state to see all open tabs.",
				},
			},
			required: ["selector"],
			additionalProperties: false,
		},
	},
}

export const browser_get_errors: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "browser_get_errors",
		description:
			"[Roopik IDE] Get console errors and network failures from a tab. Auto-clears on page reload.",
		strict: true,
		parameters: {
			type: "object",
			properties: {
				limit: {
					type: "number",
					description: "Maximum errors to return. Default is 50.",
				},
				tabId: {
					type: "number",
					description: "Target tab ID. Omit for active tab. Use browser_get_state to see all open tabs.",
				},
			},
			required: [],
			additionalProperties: false,
		},
	},
}

export const browser_get_console_logs: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "browser_get_console_logs",
		description:
			"[Roopik IDE] Get browser console logs from a tab.",
		strict: true,
		parameters: {
			type: "object",
			properties: {
				limit: {
					type: "number",
					description: "Maximum logs to return. Default is 50.",
				},
				type: {
					type: "string",
					description: "Filter by log type: log, debug, info, warn, error",
					enum: ["log", "debug", "info", "warn", "error"],
				},
				tabId: {
					type: "number",
					description: "Target tab ID. Omit for active tab. Use browser_get_state to see all open tabs.",
				},
			},
			required: [],
			additionalProperties: false,
		},
	},
}

export const browser_get_performance: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "browser_get_performance",
		description:
			"[Roopik IDE] Get browser performance metrics (Web Vitals: LCP, CLS, FCP, TTFB and runtime metrics) from a tab.",
		strict: true,
		parameters: {
			type: "object",
			properties: {
				tabId: {
					type: "number",
					description: "Target tab ID. Omit for active tab. Use browser_get_state to see all open tabs.",
				},
			},
			required: [],
			additionalProperties: false,
		},
	},
}

export const browser_get_state: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "browser_get_state",
		description:
			"[Roopik IDE] Get browser state: open/closed, dev server status, active tab ID, and all tabs with URLs, titles, loading status, and viewport sizes. Pass tabId to get only that tab's info.",
		strict: true,
		parameters: {
			type: "object",
			properties: {
				tabId: {
					type: "number",
					description: "Target tab ID. Omit for active tab. Use browser_get_state to see all open tabs.",
				},
			},
			required: [],
			additionalProperties: false,
		},
	},
}

export const browser_set_viewport: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "browser_set_viewport",
		description:
			"[Roopik IDE] Set or clear browser viewport override on a tab. Provide width/height to set a specific size (e.g., mobile 375x812). Call with NO parameters to clear override.",
		strict: true,
		parameters: {
			type: "object",
			properties: {
				width: {
					type: "number",
					description: "Viewport width in pixels. Omit to clear override.",
				},
				height: {
					type: "number",
					description: "Viewport height in pixels. Omit to clear override.",
				},
				deviceScaleFactor: {
					type: "number",
					description: "Device scale factor (default: 1)",
				},
				mobile: {
					type: "boolean",
					description: "Emulate mobile device (default: false)",
				},
				tabId: {
					type: "number",
					description: "Target tab ID. Omit for active tab. Use browser_get_state to see all open tabs.",
				},
			},
			required: [],
			additionalProperties: false,
		},
	},
}

export const browser_get_network_requests: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "browser_get_network_requests",
		description:
			"[Roopik IDE] Get network requests from a tab. Use includeStaticAssets to show all assets.",
		strict: false,
		parameters: {
			type: "object",
			properties: {
				includeStaticAssets: {
					type: "boolean",
					description: "Include static assets (JS/CSS/images). Default: false (only API calls shown)",
				},
				urlFilter: {
					type: "string",
					description: "Filter requests by URL substring",
				},
				method: {
					type: "string",
					description: "Filter by HTTP method (GET, POST, etc.)",
				},
				statusFilter: {
					type: "string",
					description: "Filter by status: success (2xx-3xx), error (4xx-5xx or failed), all",
					enum: ["success", "error", "all"],
				},
				limit: {
					type: "number",
					description: "Maximum number of requests to return (default: 100, max: 500)",
				},
				tabId: {
					type: "number",
					description: "Target tab ID. Omit for active tab. Use browser_get_state to see all open tabs.",
				},
			},
			required: [],
			additionalProperties: false,
		},
	},
}

// ============================================================================
// Project Tools (3)
// ============================================================================

export const project_get_active: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "project_get_active",
		description:
			"[Roopik IDE] Get information about the currently running project. Returns project path, URL, port, framework detection, and server state. Use this to understand the current context.",
		strict: true,
		parameters: {
			type: "object",
			properties: {},
			required: [],
			additionalProperties: false,
		},
	},
}

export const browser_find_element: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "browser_find_element",
		description:
			'[Roopik IDE] Find elements using smart selectors with shadow DOM piercing. Supports: css= (default), text=, role=, xpath=, id=, data-testid= prefixes. Returns coordinates for clicking.\n\nExamples:\n- `"text=Submit"` — find by visible text\n- `"role=button[name=\\"Save\\"]"` — find by ARIA role\n- `"#login-form"` — CSS selector (default)\n- `"data-testid=hero"` — by test ID',
		strict: true,
		parameters: {
			type: "object",
			properties: {
				selector: {
					type: "string",
					description: "Smart selector string. Prefix with text=, role=, xpath=, id=, data-testid= or use plain CSS.",
				},
				tabId: {
					type: "number",
					description: "Target tab ID. Omit for active tab.",
				},
			},
			required: ["selector"],
			additionalProperties: false,
		},
	},
}

export const browser_wait_for_element: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "browser_wait_for_element",
		description:
			"[Roopik IDE] Wait for a CSS selector to appear and become visible, with timeout. Useful after navigation or dynamic content loading.",
		strict: true,
		parameters: {
			type: "object",
			properties: {
				selector: {
					type: "string",
					description: "CSS selector to wait for.",
				},
				timeout: {
					type: "number",
					description: "Timeout in milliseconds (default: 5000).",
				},
				tabId: {
					type: "number",
					description: "Target tab ID. Omit for active tab.",
				},
			},
			required: ["selector"],
			additionalProperties: false,
		},
	},
}

export const project_start: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "project_start",
		description:
			"[Roopik IDE - Projects Only] Start a FULL APPLICATION's dev server and preview in the integrated Browser (NOT used for Canvas components). Use for complete runnable vite based projects with routing/navigation (e.g., todo app with multiple pages). The browser shows the running app at localhost. For ISOLATED UI components/screens, use component_add instead.",
		strict: true,
		parameters: {
			type: "object",
			properties: {
				projectPath: {
					type: "string",
					description: "Path to the project directory. Supports both absolute paths and relative paths from workspace root",
				},
				port: {
					type: "number",
					description: "Port to run the dev server on. Default is auto-detected or 5173.",
				},
			},
			required: ["projectPath"],
			additionalProperties: false,
		},
	},
}

export const project_stop: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "project_stop",
		description:
			"[Roopik IDE] Stop the currently running dev server. Use when switching projects or cleaning up. This works only if project was started with project_start.",
		strict: true,
		parameters: {
			type: "object",
			properties: {},
			required: [],
			additionalProperties: false,
		},
	},
}

// ============================================================================
// Canvas Tools (4)
// ============================================================================

export const canvas_list: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "canvas_list",
		description:
			"[Roopik IDE] List all canvases in the current workspace. Canvases are containers for organizing and previewing isolated components in sandbox environment (component builder).",
		strict: true,
		parameters: {
			type: "object",
			properties: {
				nameFilter: {
					type: "string",
					description: "Filter canvases by name (partial match)",
				},
				sortBy: {
					type: "string",
					description: "Sort by: name, createdAt, updatedAt. Default is updatedAt.",
					enum: ["name", "createdAt", "updatedAt"],
				},
				sortDirection: {
					type: "string",
					description: "Sort direction: asc or desc. Default is desc.",
					enum: ["asc", "desc"],
				},
			},
			required: [],
			additionalProperties: false,
		},
	},
}

export const canvas_get_active: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "canvas_get_active",
		description:
			"[Roopik IDE] Get the currently focused canvas. Returns canvas details including id, name, component count, and state.",
		strict: true,
		parameters: {
			type: "object",
			properties: {},
			required: [],
			additionalProperties: false,
		},
	},
}

export const canvas_create: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "canvas_create",
		description:
			"[Roopik IDE] Create a new canvas for organizing components. If a canvas with the same name exists, returns the existing one.  Canvases are containers for organizing and previewing multiple isolated components in sandbox environment (component builder)",
		strict: true,
		parameters: {
			type: "object",
			properties: {
				name: {
					type: "string",
					description: "Name for the canvas",
				},
			},
			required: ["name"],
			additionalProperties: false,
		},
	},
}

export const canvas_open: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "canvas_open",
		description:
			"[Roopik IDE] Open an existing canvas by ID or name. Opens the canvas panel in the UI and returns canvas info with all components (id, name, path, status).",
		strict: true,
		parameters: {
			type: "object",
			properties: {
				canvasId: {
					type: "string",
					description: "Canvas ID to open",
				},
				name: {
					type: "string",
					description: "Canvas name to open (will look up by name)",
				},
			},
			required: [],
			additionalProperties: false,
		},
	},
}

// ============================================================================
// Component Tools (6)
// ============================================================================

export const component_add: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "component_add",
		description:
			"[Roopik IDE - Canvas Only] Add an ISOLATED UI component to the Canvas for preview in the IDE's Canvas UI. Use for individual screens/sections (login, onboarding, card, hero, etc.). The Canvas automatically shows the preview - this is a sandbox environment for previewing isolated components.",
		strict: true,
		parameters: {
			type: "object",
			properties: {
				folderPath: {
					type: "string",
					description: "Path to the component folder. Supports both absolute paths and relative paths from workspace root",
				},
				canvasId: {
					type: "string",
					description: "Canvas to add the component to. Uses active canvas if not specified.",
				},
				name: {
					type: "string",
					description: "Display name for the component. Always try to pass logical short name (one word or max 2-3 words) for the component.",
				},
				entryFile: {
					type: "string",
					description: "Entry file name (e.g., index.tsx). Auto-detected in IDE if not specified.",
				},
				framework: {
					type: "string",
					description:
						"Force framework: react, vue, svelte, vanilla. Auto-detected in IDE if not specified.",
					enum: ["react", "vue", "svelte", "vanilla"],
				},
			},
			required: ["folderPath"],
			additionalProperties: false,
		},
	},
}

export const component_add_batch: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "component_add_batch",
		description:
			"[Roopik IDE - Canvas Only] Batch add multiple ISOLATED UI components to Canvas (NOT for projects). Use when creating variations (e.g., 3 login screens). Each component appears in the Canvas UI automatically.",
		strict: false,
		parameters: {
			type: "object",
			properties: {
				components: {
					type: "array",
					description:
						"Array of component objects, each with: folderPath (required, absolute or relative to workspace), canvasId, name, entryFile, framework (all optional)",
					items: {
						type: "object",
						properties: {
							folderPath: { type: "string" },
							canvasId: { type: "string" },
							name: { type: "string" },
							entryFile: { type: "string" },
							framework: { type: "string" },
						},
						required: ["folderPath"],
					},
				},
			},
			required: ["components"],
			additionalProperties: false,
		},
	},
}

export const component_remove: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "component_remove",
		description:
			"[Roopik IDE] Remove component from canvas. Set deleteSourceCode=true to automatically delete source files - do NOT use terminal commands to delete files manually.",
		strict: true,
		parameters: {
			type: "object",
			properties: {
				componentId: {
					type: "string",
					description: "The component's unique ID (from component_list)",
				},
				deleteSourceCode: {
					type: "boolean",
					description: "If true, also delete the source code files from disk (default: false)",
				},
			},
			required: ["componentId"],
			additionalProperties: false,
		},
	},
}

export const component_get_info: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "component_get_info",
		description:
			"[Roopik IDE] Get detailed information about a specific component, including build state, file paths, and metadata.",
		strict: true,
		parameters: {
			type: "object",
			properties: {
				componentId: {
					type: "string",
					description: "The component's unique ID",
				},
			},
			required: ["componentId"],
			additionalProperties: false,
		},
	},
}

export const component_list: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "component_list",
		description:
			"[Roopik IDE] List all components in a canvas. Returns component IDs, names, frameworks, and build states.",
		strict: true,
		parameters: {
			type: "object",
			properties: {
				canvasId: {
					type: "string",
					description: "The canvas ID to list components from",
				},
			},
			required: ["canvasId"],
			additionalProperties: false,
		},
	},
}

export const component_rebuild: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "component_rebuild",
		description:
			"[Roopik IDE] Force rebuild a component. Use after making changes that weren't picked up by the file watcher, or to refresh after errors.",
		strict: true,
		parameters: {
			type: "object",
			properties: {
				componentId: {
					type: "string",
					description: "The component's unique ID",
				},
			},
			required: ["componentId"],
			additionalProperties: false,
		},
	},
}

export const canvas_validate_components: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "canvas_validate_components",
		description:
			"[Roopik IDE] Validate all components in a canvas in a single efficient call. **IMPORTANT: Use this tool immediately after calling `component_add_batch` or when adding multiple components sequentially to verify their build and runtime health.** Returns a summary (total, success, failed, building counts) plus detailed error information for any failed components, including syntax errors and runtime failures. This is significantly more efficient than polling individual `component_get_info` calls. Use this to catch errors early and ensure users see a working UI.",
		strict: true,
		parameters: {
			type: "object",
			properties: {
				canvasId: {
					type: "string",
					description: "Canvas ID to validate. Omit to use the currently active canvas.",
				},
			},
			required: [],
			additionalProperties: false,
		},
	},
}

// ============================================================================
// Export all Roopik tools
// ============================================================================

export const roopikNativeTools: OpenAI.Chat.ChatCompletionTool[] = [
	// Browser (16 tools)
	browser_open,
	browser_close,
	browser_action_input,
	browser_navigate,
	browser_reload,
	browser_screenshot,
	browser_execute_script,
	browser_inspect_element,
	browser_get_errors,
	browser_get_console_logs,
	browser_get_performance,
	browser_get_state,
	browser_set_viewport,
	browser_get_network_requests,
	browser_find_element,
	browser_wait_for_element,
	// Project (3 tools)
	project_get_active,
	project_start,
	project_stop,
	// Canvas (5 tools)
	canvas_list,
	canvas_get_active,
	canvas_create,
	canvas_open,
	canvas_validate_components,
	// Component (6 tools)
	component_add,
	component_add_batch,
	component_remove,
	component_get_info,
	component_list,
	component_rebuild,
]
