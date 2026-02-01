import { z } from "zod"

/**
 * ToolGroup
 */

export const toolGroups = ["read", "edit", "browser", "command", "mcp", "modes", "roopik"] as const

export const toolGroupsSchema = z.enum(toolGroups)

export type ToolGroup = z.infer<typeof toolGroupsSchema>

/**
 * ToolName
 */

export const toolNames = [
	"execute_command",
	"read_file",
	"read_command_output",
	"write_to_file",
	"apply_diff",
	"search_and_replace",
	"search_replace",
	"edit_file",
	"apply_patch",
	"search_files",
	"list_files",
	"browser_action",
	"use_mcp_tool",
	"access_mcp_resource",
	"ask_followup_question",
	"attempt_completion",
	"switch_mode",
	"new_task",
	"fetch_instructions",
	"codebase_search",
	"update_todo_list",
	"run_slash_command",
	"generate_image",
	"custom_tool",
	// Roopik IDE Tools - Browser (14)
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
	// Roopik IDE Tools - Project (3)
	"project_get_active",
	"project_start",
	"project_stop",
	// Roopik IDE Tools - Canvas (4)
	"canvas_list",
	"canvas_get_active",
	"canvas_create",
	"canvas_open",
	// Roopik IDE Tools - Component (7)
	"component_add",
	"component_add_batch",
	"component_remove",
	"component_get_info",
	"component_list",
	"component_rebuild",
	"canvas_validate_components",
] as const

export const toolNamesSchema = z.enum(toolNames)

export type ToolName = z.infer<typeof toolNamesSchema>

/**
 * ToolUsage
 */

export const toolUsageSchema = z.record(
	toolNamesSchema,
	z.object({
		attempts: z.number(),
		failures: z.number(),
	}),
)

export type ToolUsage = z.infer<typeof toolUsageSchema>
