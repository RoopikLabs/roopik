# Roopik Tools: File Reference

> Quick reference for adding/updating Roopik IDE tools that use IPC between agent-dio extension and Core.

**Tool Naming Convention:** `category_action` (e.g., `browser_screenshot`, `component_add`)

---

## Tool Inventory (24 Total)

| # | browser_* (12) | project_* (3) | canvas_* (3) | component_* (6) |
|---|----------------|---------------|--------------|-----------------|
| 1 | browser_open | project_get_active | canvas_list | component_add |
| 2 | browser_close | project_start | canvas_get_active | component_add_batch |
| 3 | browser_action_input | project_stop | canvas_create | component_remove |
| 4 | browser_screenshot | | | component_get_info |
| 5 | browser_navigate | | | component_list |
| 6 | browser_reload | | | component_rebuild |
| 7 | browser_execute_script | | | |
| 8 | browser_inspect_element | | | |
| 9 | browser_get_errors | | | |
| 10 | browser_get_console_logs | | | |
| 11 | browser_get_performance | | | |
| 12 | browser_get_cdp_info | | | |

---

## Extension Side (agent-dio)

Files in `extensions/roopik-dio/src/`:

| # | File | Purpose |
|---|------|---------|
| 1 | `services/roopik/RoopikToolClient.ts` | IPC client - calls VSCode commands to reach Core |
| 2 | `services/roopik/index.ts` | Exports client instance |
| 3 | `core/tools/roopik/RoopikToolHandler.ts` | Handles tool execution, approval, result formatting |
| 4 | `core/tools/roopik/index.ts` | Exports handler |
| 5 | `core/prompts/tools/roopik/index.ts` | XML tool definitions (legacy protocol) |
| 6 | `core/prompts/tools/native-tools/roopik.ts` | Native tool definitions (JSON schema) |
| 7 | `core/prompts/tools/native-tools/index.ts` | Imports and spreads roopikNativeTools |
| 8 | `core/prompts/tools/index.ts` | Tool description map - maps tool names to description functions |
| 9 | `core/assistant-message/presentAssistantMessage.ts` | Tool dispatcher - routes tools to handler, UI display |
| 10 | `core/auto-approval/index.ts` | Auto-approval logic - checks tool prefixes for approval |
| 11 | `packages/types/src/tool.ts` | ToolName type union |
| 12 | `shared/tools.ts` | Tool group definitions, TOOL_GROUPS array |
| 13 | `shared/ExtensionMessage.ts` | ClineSayTool interface (for UI display) |

---

## Core Side (Roopik IDE)

Files in `src/vs/workbench/contrib/roopik/`:

| # | File | Purpose |
|---|------|---------|
| 1 | `browser/commands/roopikToolsCommands.ts` | VSCode command handlers (renderer process) |
| 2 | `browser/commands/index.ts` | Exports/registers commands |
| 3 | `electron-main/channel/roopikToolsChannel.ts` | IPC channel handlers (main process) |

Files in `src/vs/code/`:

| # | File | Purpose |
|---|------|---------|
| 4 | `electron-main/app.ts` | Registers IPC channel |

---

## MCP Server Side (External Agent Access) - Add same tools here also which you added in the native

Files in `src/vs/workbench/contrib/roopik/electron-main/mcp/tools/`:

| # | File | Purpose |
|---|------|---------|
| 1 | `browserTools.ts` | 12 browser tools: browser_open, browser_close, browser_action_input, browser_screenshot, browser_navigate, browser_reload, browser_execute_script, browser_inspect_element, browser_get_errors, browser_get_console_logs, browser_get_performance, browser_get_cdp_info |
| 2 | `projectTools.ts` | 3 project tools: project_get_active, project_start, project_stop |
| 3 | `canvasTools.ts` | 9 canvas/component tools: canvas_list, canvas_get_active, canvas_create, component_add, component_add_batch, component_remove, component_get_info, component_list, component_rebuild |

---

## Flow: Adding a New Tool

```
1. Core: Add handler in roopikToolsChannel.ts
2. Core: Add command in roopikToolsCommands.ts
3. MCP: Add tool in appropriate MCP tools file (browserTools.ts, projectTools.ts, etc.)
4. Extension: Add client method in RoopikToolClient.ts
5. Extension: Add case in RoopikToolHandler.ts
6. Extension: Add XML definition in prompts/tools/roopik/index.ts
7. Extension: Add native definition in native-tools/roopik.ts
8. Extension: Add to tool description map in prompts/tools/index.ts
9. Extension: Add to dispatcher in presentAssistantMessage.ts
10. Extension: Add to ClineSayTool in ExtensionMessage.ts (for UI)
11. Extension: Add to TOOL_GROUPS in shared/tools.ts
12. Extension: Add to ToolName type in packages/types/src/tool.ts
```

---

## Flow: Renaming Tools

All files that need updating when renaming tools:

**Core (2 files):**
1. `roopikToolsChannel.ts` - switch cases
2. `roopikToolsCommands.ts` - command names and channel.call() strings

**MCP (3 files):**
3. `browserTools.ts` - server.tool() names and error messages (includes CDP tools)
4. `projectTools.ts` - server.tool() names and error messages
5. `canvasTools.ts` - server.tool() names and error messages (canvas + component tools)

**Extension (10 files):**
6. `RoopikToolClient.ts` - method names (optional, internal)
7. `RoopikToolHandler.ts` - switch cases
8. `roopik/index.ts` - XML tool definitions
9. `native-tools/roopik.ts` - JSON schema definitions
10. `prompts/tools/index.ts` - toolDescriptionMap keys
11. `presentAssistantMessage.ts` - switch cases for display
12. `auto-approval/index.ts` - prefix checks
13. `ExtensionMessage.ts` - ClineSayTool type union
14. `shared/tools.ts` - TOOL_GROUPS array
15. `packages/types/src/tool.ts` - ToolName type union

---

## Quick Grep Commands

```bash
# Find all tool references in extension (use category prefixes)
grep -rE "(browser_|project_|canvas_|component_)" extensions/roopik-dio/src/ --include="*.ts"

# Find all tool handlers in Core
grep -rE "case '(browser_|project_|canvas_|component_)" src/vs/ --include="*.ts"

# Find MCP tool definitions
grep -r "server.tool(" src/vs/workbench/contrib/roopik/electron-main/mcp/tools/ --include="*.ts"
```
