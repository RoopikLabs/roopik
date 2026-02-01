import { Anthropic } from "@anthropic-ai/sdk"

import type {
	ClineAsk,
	ToolProgressStatus,
	ToolGroup,
	ToolName,
	FileEntry,
	BrowserActionParams,
	GenerateImageParams,
} from "@roo-code/types"

export type ToolResponse = string | Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam>

export type AskApproval = (
	type: ClineAsk,
	partialMessage?: string,
	progressStatus?: ToolProgressStatus,
	forceApproval?: boolean,
) => Promise<boolean>

export type HandleError = (action: string, error: Error) => Promise<void>

export type PushToolResult = (content: ToolResponse) => void

export type AskFinishSubTaskApproval = () => Promise<boolean>

export interface TextContent {
	type: "text"
	content: string
	partial: boolean
}

export const toolParamNames = [
	"command",
	"path",
	"content",
	"regex",
	"file_pattern",
	"recursive",
	"action",
	"url",
	"coordinate",
	"text",
	"server_name",
	"tool_name",
	"arguments",
	"uri",
	"question",
	"result",
	"diff",
	"mode_slug",
	"reason",
	"line",
	"mode",
	"message",
	"cwd",
	"follow_up",
	"task",
	"size",
	"query",
	"args",
	"start_line",
	"end_line",
	"todos",
	"prompt",
	"image",
	"files", // Native protocol parameter for read_file
	"operations", // search_and_replace parameter for multiple operations
	"patch", // apply_patch parameter
	"file_path", // search_replace and edit_file parameter
	"old_string", // search_replace and edit_file parameter
	"new_string", // search_replace and edit_file parameter
	"expected_replacements", // edit_file parameter for multiple occurrences
	"artifact_id", // read_command_output parameter
	"search", // read_command_output parameter for grep-like search
	"offset", // read_command_output parameter for pagination
	"limit", // read_command_output parameter for max bytes to return
	// Roopik tool parameters
	"selector", // browser_inspect_element
	"includeInherited", // browser_inspect_element
	"script", // browser_execute_script
	"ignoreCache", // browser_reload
	"limit", // browser_get_errors, browser_get_console_logs
	"type", // browser_get_console_logs
	"projectPath", // project_start
	"port", // project_start
	"name", // canvas_create, component_add
	"nameFilter", // canvas_list
	"sortBy", // canvas_list
	"sortDirection", // canvas_list
	"canvasId", // component_add, component_list
	"folderPath", // component_add
	"entryFile", // component_add
	"framework", // component_add
	"componentId", // component_remove, component_get_info, component_rebuild
	"deleteSourceCode", // component_remove
	"components", // component_add_batch
	// browser_set_viewport parameters
	"width", // browser_set_viewport
	"height", // browser_set_viewport
	"deviceScaleFactor", // browser_set_viewport
	"mobile", // browser_set_viewport
	// browser_get_network_requests parameters
	"includeStaticAssets", // browser_get_network_requests
	"urlFilter", // browser_get_network_requests
	"method", // browser_get_network_requests
	"statusFilter", // browser_get_network_requests
	// browser_action parameters
	"key", // browser_action (press)
	"modifiers", // browser_action (press)
	"deltaX", // browser_action (drag, scroll)
	"deltaY", // browser_action (drag, scroll)
] as const

export type ToolParamName = (typeof toolParamNames)[number]

/**
 * Type map defining the native (typed) argument structure for each tool.
 * Tools not listed here will fall back to `any` for backward compatibility.
 */
export type NativeToolArgs = {
	access_mcp_resource: { server_name: string; uri: string }
	read_file: { files: FileEntry[] }
	read_command_output: { artifact_id: string; search?: string; offset?: number; limit?: number }
	attempt_completion: { result: string }
	execute_command: { command: string; cwd?: string }
	apply_diff: { path: string; diff: string }
	search_and_replace: { path: string; operations: Array<{ search: string; replace: string }> }
	search_replace: { file_path: string; old_string: string; new_string: string }
	edit_file: { file_path: string; old_string: string; new_string: string; expected_replacements?: number }
	apply_patch: { patch: string }
	list_files: { path: string; recursive?: boolean }
	new_task: { mode: string; message: string; todos?: string }
	ask_followup_question: {
		question: string
		follow_up: Array<{ text: string; mode?: string }>
	}
	browser_action: BrowserActionParams
	codebase_search: { query: string; path?: string }
	fetch_instructions: { task: string }
	generate_image: GenerateImageParams
	run_slash_command: { command: string; args?: string }
	search_files: { path: string; regex: string; file_pattern?: string | null }
	switch_mode: { mode_slug: string; reason: string }
	update_todo_list: { todos: string }
	use_mcp_tool: { server_name: string; tool_name: string; arguments?: Record<string, unknown> }
	write_to_file: { path: string; content: string }
	// Add more tools as they are migrated to native protocol

	// Roopik Browser Tools
	browser_open: { url?: string }
	browser_close: Record<string, never>
	browser_action_input: { action: string; coordinate?: [number, number]; text?: string; key?: string; modifiers?: string[]; deltaX?: number; deltaY?: number }
	browser_navigate: { url: string }
	browser_reload: { ignoreCache?: boolean }
	browser_screenshot: Record<string, never>
	browser_execute_script: { script: string }
	browser_inspect_element: { selector: string; includeInherited?: boolean }
	browser_get_errors: { limit?: number }
	browser_get_console_logs: { limit?: number; type?: string }
	browser_get_performance: Record<string, never>
	browser_get_state: Record<string, never>
	browser_set_viewport: { width?: number; height?: number; deviceScaleFactor?: number; mobile?: boolean }
	browser_get_network_requests: { includeStaticAssets?: boolean; urlFilter?: string; method?: string; statusFilter?: string; limit?: number }

	// Roopik Project Tools
	project_get_active: Record<string, never>
	project_start: { projectPath: string; port?: number }
	project_stop: Record<string, never>

	// Roopik Canvas Tools
	canvas_list: { nameFilter?: string; sortBy?: string; sortDirection?: string }
	canvas_get_active: Record<string, never>
	canvas_create: { name: string }
	canvas_open: { canvasId?: string; name?: string }
	canvas_validate_components: { canvasId?: string }

	// Roopik Component Tools
	component_add: { folderPath: string; canvasId?: string; name?: string; entryFile?: string; framework?: string }
	component_add_batch: { components: Array<{ folderPath: string; canvasId?: string; name?: string; entryFile?: string; framework?: string }> }
	component_remove: { componentId: string; deleteSourceCode?: boolean }
	component_get_info: { componentId: string }
	component_list: { canvasId?: string }
	component_rebuild: { componentId: string }
}

/**
 * Generic ToolUse interface that provides proper typing for both protocols.
 *
 * @template TName - The specific tool name, which determines the nativeArgs type
 */
export interface ToolUse<TName extends ToolName = ToolName> {
	type: "tool_use"
	id?: string // Optional ID to track tool calls
	name: TName
	/**
	 * The original tool name as called by the model (e.g. an alias like "edit_file"),
	 * if it differs from the canonical tool name used for execution.
	 * Used to preserve tool names in API conversation history.
	 */
	originalName?: string
	// params is a partial record, allowing only some or none of the possible parameters to be used
	params: Partial<Record<ToolParamName, string>>
	partial: boolean
	// nativeArgs is properly typed based on TName if it's in NativeToolArgs, otherwise never
	nativeArgs?: TName extends keyof NativeToolArgs ? NativeToolArgs[TName] : never
}

/**
 * Represents a native MCP tool call from the model.
 * In native mode, MCP tools are called directly with their prefixed name (e.g., "mcp_serverName_toolName")
 * rather than through the use_mcp_tool wrapper. This type preserves the original tool name
 * so it appears correctly in API conversation history.
 */
export interface McpToolUse {
	type: "mcp_tool_use"
	id?: string // Tool call ID from the API
	/** The original tool name from the API (e.g., "mcp_serverName_toolName") */
	name: string
	/** Extracted server name from the tool name */
	serverName: string
	/** Extracted tool name from the tool name */
	toolName: string
	/** Arguments passed to the MCP tool */
	arguments: Record<string, unknown>
	partial: boolean
}

export interface ExecuteCommandToolUse extends ToolUse<"execute_command"> {
	name: "execute_command"
	// Pick<Record<ToolParamName, string>, "command"> makes "command" required, but Partial<> makes it optional
	params: Partial<Pick<Record<ToolParamName, string>, "command" | "cwd">>
}

export interface ReadFileToolUse extends ToolUse<"read_file"> {
	name: "read_file"
	params: Partial<Pick<Record<ToolParamName, string>, "args" | "path" | "start_line" | "end_line" | "files">>
}

export interface FetchInstructionsToolUse extends ToolUse<"fetch_instructions"> {
	name: "fetch_instructions"
	params: Partial<Pick<Record<ToolParamName, string>, "task">>
}

export interface WriteToFileToolUse extends ToolUse<"write_to_file"> {
	name: "write_to_file"
	params: Partial<Pick<Record<ToolParamName, string>, "path" | "content">>
}

export interface CodebaseSearchToolUse extends ToolUse<"codebase_search"> {
	name: "codebase_search"
	params: Partial<Pick<Record<ToolParamName, string>, "query" | "path">>
}

export interface SearchFilesToolUse extends ToolUse<"search_files"> {
	name: "search_files"
	params: Partial<Pick<Record<ToolParamName, string>, "path" | "regex" | "file_pattern">>
}

export interface ListFilesToolUse extends ToolUse<"list_files"> {
	name: "list_files"
	params: Partial<Pick<Record<ToolParamName, string>, "path" | "recursive">>
}

export interface BrowserActionToolUse extends ToolUse<"browser_action"> {
	name: "browser_action"
	params: Partial<Pick<Record<ToolParamName, string>, "action" | "url" | "coordinate" | "text" | "size" | "path">>
}

export interface UseMcpToolToolUse extends ToolUse<"use_mcp_tool"> {
	name: "use_mcp_tool"
	params: Partial<Pick<Record<ToolParamName, string>, "server_name" | "tool_name" | "arguments">>
}

export interface AccessMcpResourceToolUse extends ToolUse<"access_mcp_resource"> {
	name: "access_mcp_resource"
	params: Partial<Pick<Record<ToolParamName, string>, "server_name" | "uri">>
}

export interface AskFollowupQuestionToolUse extends ToolUse<"ask_followup_question"> {
	name: "ask_followup_question"
	params: Partial<Pick<Record<ToolParamName, string>, "question" | "follow_up">>
}

export interface AttemptCompletionToolUse extends ToolUse<"attempt_completion"> {
	name: "attempt_completion"
	params: Partial<Pick<Record<ToolParamName, string>, "result">>
}

export interface SwitchModeToolUse extends ToolUse<"switch_mode"> {
	name: "switch_mode"
	params: Partial<Pick<Record<ToolParamName, string>, "mode_slug" | "reason">>
}

export interface NewTaskToolUse extends ToolUse<"new_task"> {
	name: "new_task"
	params: Partial<Pick<Record<ToolParamName, string>, "mode" | "message" | "todos">>
}

export interface RunSlashCommandToolUse extends ToolUse<"run_slash_command"> {
	name: "run_slash_command"
	params: Partial<Pick<Record<ToolParamName, string>, "command" | "args">>
}

export interface GenerateImageToolUse extends ToolUse<"generate_image"> {
	name: "generate_image"
	params: Partial<Pick<Record<ToolParamName, string>, "prompt" | "path" | "image">>
}

// Define tool group configuration
export type ToolGroupConfig = {
	tools: readonly string[]
	alwaysAvailable?: boolean // Whether this group is always available and shouldn't show in prompts view
	customTools?: readonly string[] // Opt-in only tools - only available when explicitly included via model's includedTools
}

export const TOOL_DISPLAY_NAMES: Record<string, string> = {
	execute_command: "run commands",
	read_file: "read files",
	read_command_output: "read command output",
	fetch_instructions: "fetch instructions",
	write_to_file: "write files",
	apply_diff: "apply changes",
	search_and_replace: "apply changes using search and replace",
	search_replace: "apply single search and replace",
	edit_file: "edit files using search and replace",
	apply_patch: "apply patches using codex format",
	search_files: "search files",
	list_files: "list files",
	browser_action: "use a browser",
	use_mcp_tool: "use mcp tools",
	access_mcp_resource: "access mcp resources",
	ask_followup_question: "ask questions",
	attempt_completion: "complete tasks",
	switch_mode: "switch modes",
	new_task: "create new task",
	codebase_search: "codebase search",
	update_todo_list: "update todo list",
	run_slash_command: "run slash command",
	generate_image: "generate images",
	custom_tool: "use custom tools",
	// Roopik IDE Tools - Browser (14 tools)
	browser_open: "open browser",
	browser_close: "close browser",
	browser_action_input: "perform browser input action",
	browser_navigate: "navigate browser",
	browser_reload: "reload browser page",
	browser_screenshot: "take browser screenshot",
	browser_execute_script: "execute browser script",
	browser_inspect_element: "inspect element styles",
	browser_get_errors: "get browser errors",
	browser_get_console_logs: "get console logs",
	browser_get_performance: "get browser performance metrics",
	browser_get_state: "get browser state",
	browser_set_viewport: "set browser viewport",
	browser_get_network_requests: "get network requests",
	// Roopik IDE Tools - Project (3 tools)
	project_get_active: "get active project",
	project_start: "start project",
	project_stop: "stop project",
	// Roopik IDE Tools - Canvas (5 tools)
	canvas_list: "list canvases",
	canvas_get_active: "get active canvas",
	canvas_create: "create canvas",
	canvas_open: "open canvas",
	canvas_validate_components: "validate canvas components",
	// Roopik IDE Tools - Component (7 tools)
	component_add: "add component",
	component_add_batch: "add multiple components",
	component_remove: "remove component",
	component_get_info: "get component info",
	component_list: "list components",
	component_rebuild: "rebuild component",
} as const

// Define available tool groups.
export const TOOL_GROUPS: Record<ToolGroup, ToolGroupConfig> = {
	read: {
		tools: ["read_file", "fetch_instructions", "search_files", "list_files", "codebase_search"],
	},
	edit: {
		tools: ["apply_diff", "write_to_file", "generate_image"],
		customTools: ["search_and_replace", "search_replace", "edit_file", "apply_patch"],
	},
	browser: {
		tools: ["browser_action"],
	},
	command: {
		tools: ["execute_command", "read_command_output"],
	},
	mcp: {
		tools: ["use_mcp_tool", "access_mcp_resource"],
	},
	modes: {
		tools: ["switch_mode", "new_task"],
		alwaysAvailable: true,
	},
	roopik: {
		tools: [
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
		],
	},
}

// Tools that are always available to all modes.
export const ALWAYS_AVAILABLE_TOOLS: ToolName[] = [
	"ask_followup_question",
	"attempt_completion",
	"switch_mode",
	"new_task",
	"update_todo_list",
	"run_slash_command",
] as const

/**
 * Central registry of tool aliases.
 * Maps alias name -> canonical tool name.
 *
 * This allows models to use alternative names for tools (e.g., "edit_file" instead of "apply_diff").
 * When a model calls a tool by its alias, the system resolves it to the canonical name for execution,
 * but preserves the alias in API conversation history for consistency.
 *
 * To add a new alias, simply add an entry here. No other files need to be modified.
 */
export const TOOL_ALIASES: Record<string, ToolName> = {
	write_file: "write_to_file",
} as const

export type DiffResult =
	| { success: true; content: string; failParts?: DiffResult[] }
	| ({
		success: false
		error?: string
		details?: {
			similarity?: number
			threshold?: number
			matchedRange?: { start: number; end: number }
			searchContent?: string
			bestMatch?: string
		}
		failParts?: DiffResult[]
	} & ({ error: string } | { failParts: DiffResult[] }))

export interface DiffItem {
	content: string
	startLine?: number
}

export interface DiffStrategy {
	/**
	 * Get the name of this diff strategy for analytics and debugging
	 * @returns The name of the diff strategy
	 */
	getName(): string

	/**
	 * Apply a diff to the original content
	 * @param originalContent The original file content
	 * @param diffContent The diff content in the strategy's format (string for legacy, DiffItem[] for new)
	 * @param startLine Optional line number where the search block starts. If not provided, searches the entire file.
	 * @param endLine Optional line number where the search block ends. If not provided, searches the entire file.
	 * @returns A DiffResult object containing either the successful result or error details
	 */
	applyDiff(
		originalContent: string,
		diffContent: string | DiffItem[],
		startLine?: number,
		endLine?: number,
	): Promise<DiffResult>

	getProgressStatus?(toolUse: ToolUse, result?: any): ToolProgressStatus
}
