import type OpenAI from "openai"

// ============================================================================
// Browser Tools (14)
// ============================================================================

export const browser_open: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "browser_open",
		description:
			"[Roopik IDE] Open the browser preview. Optionally navigate to a URL after opening. If browser is already open and URL is provided, navigates to that URL. Use this to get browser access without needing to start a dev server first.",
		strict: true,
		parameters: {
			type: "object",
			properties: {
				url: {
					type: "string",
					description: "URL to open after the browser is ready (optional)",
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
			"[Roopik IDE] Navigate the browser preview to a URL. Use this to load specific pages in the project (e.g., /login, /dashboard) or view different routes.",
		strict: true,
		parameters: {
			type: "object",
			properties: {
				url: {
					type: "string",
					description:
						"The URL to navigate to (e.g., http://localhost:5173/login or just /login for relative paths)",
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
			"[Roopik IDE] Reload the current page in the browser preview. Use ignoreCache=true for hard reload after changing static assets like CSS or images.",
		strict: true,
		parameters: {
			type: "object",
			properties: {
				ignoreCache: {
					type: "boolean",
					description: "Set to true for hard reload (clears cache). Default is false.",
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
			"[Roopik IDE] Take a screenshot of the browser preview. Returns base64-encoded image with viewport metadata (width, height, devicePixelRatio). Use this for visual verification and to get coordinates for browser_action_input.",
		strict: true,
		parameters: {
			type: "object",
			properties: {},
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
			"[Roopik IDE] Close the browser view. Use this when done with browser testing or to free resources.",
		strict: true,
		parameters: {
			type: "object",
			properties: {},
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
- click/right_click/double_click/hover: requires 'coordinate'
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
			"[Roopik IDE] Execute JavaScript in the browser context. Use for DOM queries, checking application state, triggering interactions, or any browser-side logic. Returns the result of the script execution.",
		strict: true,
		parameters: {
			type: "object",
			properties: {
				script: {
					type: "string",
					description: "JavaScript code to execute in the browser",
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
			"[Roopik IDE] Deep CSS inspection for an element. Returns matched CSS rules with source file locations (file:line:column), computed styles, specificity, and inheritance chain. This is THE critical tool for understanding exactly what CSS is applied to an element and WHERE it comes from - enabling precise, surgical CSS edits.",
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
			"[Roopik IDE] Get all errors from the browser: console errors (JavaScript exceptions, console.error) AND failed network requests (4xx, 5xx, network failures). This is the primary debugging tool - shows what is broken in the application.",
		strict: true,
		parameters: {
			type: "object",
			properties: {
				limit: {
					type: "number",
					description: "Maximum errors to return. Default is 50.",
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
			"[Roopik IDE] Get console output from the browser (console.log, console.warn, console.info, etc.). Use type filter to focus on specific log types. For errors only, prefer browser_get_errors.",
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
			"[Roopik IDE] Get performance metrics from the browser including Web Vitals (LCP, CLS) and runtime metrics (JS heap, DOM nodes, layout count). Uses Chrome DevTools Protocol for accurate measurements.",
		strict: true,
		parameters: {
			type: "object",
			properties: {},
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
			"[Roopik IDE] Get browser state information (open/closed, current URL, title).",
		strict: true,
		parameters: {
			type: "object",
			properties: {},
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
			"[Roopik IDE] Set or clear browser viewport override. Provide width/height to set a specific size (e.g., mobile 375x812). Call with NO parameters to clear override and restore natural browser size.",
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
			"[Roopik IDE] Get network requests. Use includeStaticAssets parameter to show all assets.",
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
	// Browser (14 tools)
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
