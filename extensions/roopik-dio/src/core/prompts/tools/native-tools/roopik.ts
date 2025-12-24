import type OpenAI from "openai"

// ============================================================================
// Browser Tools
// ============================================================================

export const rpk_screenshot: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "rpk_screenshot",
		description:
			"[Roopik IDE] Take a screenshot of the browser preview. Returns a base64-encoded image of the current browser state. Use this for visual verification after making UI changes or to see what the user sees.",
		strict: true,
		parameters: {
			type: "object",
			properties: {},
			required: [],
			additionalProperties: false,
		},
	},
}

export const rpk_navigate: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "rpk_navigate",
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

export const rpk_reload: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "rpk_reload",
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

export const rpk_executeScript: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "rpk_executeScript",
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

export const rpk_inspectElement: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "rpk_inspectElement",
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

// ============================================================================
// CDP Tools
// ============================================================================

export const rpk_getErrors: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "rpk_getErrors",
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

export const rpk_getConsoleLogs: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "rpk_getConsoleLogs",
		description:
			"[Roopik IDE] Get console output from the browser (console.log, console.warn, console.info, etc.). Use type filter to focus on specific log types. For errors only, prefer rpk_getErrors.",
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

// ============================================================================
// Project Tools
// ============================================================================

export const rpk_getActiveProject: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "rpk_getActiveProject",
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

export const rpk_startProject: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "rpk_startProject",
		description:
			"[Roopik IDE] Start a project's dev server and open it in the browser preview. Automatically detects the project's framework (React, Vue, Next.js, etc.) and starts the appropriate dev server.",
		strict: true,
		parameters: {
			type: "object",
			properties: {
				projectPath: {
					type: "string",
					description: "Path to the project directory (absolute or relative to workspace)",
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

export const rpk_stopProject: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "rpk_stopProject",
		description:
			"[Roopik IDE] Stop the currently running dev server. Use when switching projects or cleaning up.",
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
// Canvas Tools
// ============================================================================

export const rpk_listCanvases: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "rpk_listCanvases",
		description:
			"[Roopik IDE] List all canvases in the workspace. Canvases are containers for organizing components in Mode 1 (component builder).",
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

export const rpk_getActiveCanvas: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "rpk_getActiveCanvas",
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

export const rpk_createCanvas: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "rpk_createCanvas",
		description:
			"[Roopik IDE] Create a new canvas for organizing components. If a canvas with the same name exists, returns the existing one.",
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

// ============================================================================
// Component Tools
// ============================================================================

export const rpk_addComponent: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "rpk_addComponent",
		description:
			"[Roopik IDE] Add a component to a canvas. The component will be built and made available for preview. Automatically detects the framework (React, Vue, etc.) from the code.",
		strict: true,
		parameters: {
			type: "object",
			properties: {
				folderPath: {
					type: "string",
					description: "Path to the component folder (contains the component files)",
				},
				canvasId: {
					type: "string",
					description: "Canvas to add the component to. Uses active canvas if not specified.",
				},
				name: {
					type: "string",
					description: "Display name for the component. Inferred from folder if not specified.",
				},
				entryFile: {
					type: "string",
					description: "Entry file name (e.g., index.tsx). Auto-detected if not specified.",
				},
				framework: {
					type: "string",
					description:
						"Force framework: react, vue, svelte, angular, vanilla. Auto-detected if not specified.",
					enum: ["react", "vue", "svelte", "angular", "vanilla"],
				},
			},
			required: ["folderPath"],
			additionalProperties: false,
		},
	},
}

export const rpk_addComponents: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "rpk_addComponents",
		description:
			"[Roopik IDE] Add multiple components at once. More efficient than calling rpk_addComponent multiple times.",
		strict: false,
		parameters: {
			type: "object",
			properties: {
				components: {
					type: "array",
					description:
						"Array of component objects, each with: folderPath (required), canvasId, name, entryFile, framework (all optional)",
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

export const rpk_removeComponent: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "rpk_removeComponent",
		description:
			"[Roopik IDE] Remove a component from its canvas. This stops the build watcher but does not delete the source files.",
		strict: true,
		parameters: {
			type: "object",
			properties: {
				componentId: {
					type: "string",
					description: "The component's unique ID (from rpk_listComponents)",
				},
			},
			required: ["componentId"],
			additionalProperties: false,
		},
	},
}

export const rpk_getComponentInfo: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "rpk_getComponentInfo",
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

export const rpk_listComponents: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "rpk_listComponents",
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

export const rpk_rebuildComponent: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "rpk_rebuildComponent",
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

// ============================================================================
// Export all Roopik tools
// ============================================================================

export const roopikNativeTools: OpenAI.Chat.ChatCompletionTool[] = [
	// Browser
	rpk_screenshot,
	rpk_navigate,
	rpk_reload,
	rpk_executeScript,
	rpk_inspectElement,
	// CDP
	rpk_getErrors,
	rpk_getConsoleLogs,
	// Project
	rpk_getActiveProject,
	rpk_startProject,
	rpk_stopProject,
	// Canvas
	rpk_listCanvases,
	rpk_getActiveCanvas,
	rpk_createCanvas,
	// Component
	rpk_addComponent,
	rpk_addComponents,
	rpk_removeComponent,
	rpk_getComponentInfo,
	rpk_listComponents,
	rpk_rebuildComponent,
]
