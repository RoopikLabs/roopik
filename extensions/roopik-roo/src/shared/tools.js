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
    "skill", // skill tool parameter
    "start_line",
    "end_line",
    "todos",
    "prompt",
    "image",
    // read_file parameters (native protocol)
    "operations", // search_and_replace parameter for multiple operations
    "patch", // apply_patch parameter
    "file_path", // search_replace and edit_file parameter
    "old_string", // search_replace and edit_file parameter
    "new_string", // search_replace and edit_file parameter
    "replace_all", // edit tool parameter for replacing all occurrences
    "expected_replacements", // edit_file parameter for multiple occurrences
    "timeout", // execute_command parameter
    "artifact_id", // read_command_output parameter
    "search", // read_command_output parameter for grep-like search
    "offset", // read_command_output and read_file parameter
    "limit", // read_command_output and read_file parameter
    // read_file indentation mode parameters
    "indentation",
    "anchor_line",
    "max_levels",
    "include_siblings",
    "include_header",
    "max_lines",
    // read_file legacy format parameter (backward compatibility)
    "files",
    "line_ranges",
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
];
export const TOOL_DISPLAY_NAMES = {
    execute_command: "run commands",
    read_file: "read files",
    read_command_output: "read command output",
    write_to_file: "write files",
    apply_diff: "apply changes",
    edit: "edit files",
    search_and_replace: "apply changes using search and replace",
    search_replace: "apply single search and replace",
    edit_file: "edit files using search and replace",
    apply_patch: "apply patches using codex format",
    search_files: "search files",
    list_files: "list files",
    use_mcp_tool: "use mcp tools",
    access_mcp_resource: "access mcp resources",
    ask_followup_question: "ask questions",
    attempt_completion: "complete tasks",
    switch_mode: "switch modes",
    new_task: "create new task",
    codebase_search: "codebase search",
    update_todo_list: "update todo list",
    run_slash_command: "run slash command",
    skill: "load skill",
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
};
// Define available tool groups.
export const TOOL_GROUPS = {
    read: {
        tools: ["read_file", "search_files", "list_files", "codebase_search"],
    },
    edit: {
        tools: ["apply_diff", "write_to_file", "generate_image"],
        customTools: ["edit", "search_replace", "edit_file", "apply_patch"],
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
};
// Tools that are always available to all modes.
export const ALWAYS_AVAILABLE_TOOLS = [
    "ask_followup_question",
    "attempt_completion",
    "switch_mode",
    "new_task",
    "update_todo_list",
    "run_slash_command",
    "skill",
];
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
export const TOOL_ALIASES = {
    write_file: "write_to_file",
    search_and_replace: "edit",
};
//# sourceMappingURL=tools.js.map