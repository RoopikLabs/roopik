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

## Extension Side (agent-dio / roopik-roo)

**Total: 17 files** (6 created new ✨, 11 modified 📝)

Files in `extensions/roopik-dio/src/` or `extensions/roopik-roo/src/`:

| # | File | Purpose | Status |
|---|------|---------|--------|
| 1 | `services/roopik/RoopikToolClient.ts` | IPC client - calls VSCode commands to reach Core | ✨ Created |
| 2 | `services/roopik/index.ts` | Exports client instance | ✨ Created |
| 3 | `core/tools/roopik/RoopikToolHandler.ts` | Handles tool execution, approval, result formatting | ✨ Created |
| 4 | `core/tools/roopik/index.ts` | Exports handler | ✨ Created |
| 5 | `core/prompts/tools/roopik/index.ts` | XML tool definitions (legacy protocol) | ✨ Created |
| 6 | `core/prompts/tools/native-tools/roopik.ts` | Native tool definitions (JSON schema) | ✨ Created |
| 7 | `core/prompts/tools/native-tools/index.ts` | Imports and spreads roopikNativeTools | 📝 Modified |
| 8 | `core/prompts/tools/index.ts` | Tool description map - maps tool names to description functions | 📝 Modified |
| 9 | `core/assistant-message/presentAssistantMessage.ts` | Tool dispatcher - routes tools to handler, UI display | 📝 Modified |
| 10 | `core/auto-approval/index.ts` | Auto-approval logic - checks tool prefixes for approval | 📝 Modified |
| 11 | `packages/types/src/tool.ts` | ToolName type union, "roopik" in toolGroups | 📝 Modified |
| 12 | `packages/types/src/global-settings.ts` | GlobalSettings schema with alwaysAllowRoopik | 📝 Modified |
| 13 | `shared/tools.ts` | Tool group definitions, TOOL_GROUPS.roopik with all 24 tools | 📝 Modified |
| 14 | `shared/ExtensionMessage.ts` | ClineSayTool interface + ExtensionState alwaysAllowRoopik | 📝 Modified |
| 15 | `packages/types/src/mode.ts` | Mode config schema - allows "roopik" in groups array for modes like architect, code, etc. | 📝 Modified |
| 16 | `src/core/webview/ClineProvider.ts` | Main provider - reads/writes alwaysAllowRoopik state from settings | 📝 Modified |
| 17 | `src/core/webview/index.ts` | Exports ClineProvider | ℹ️ Reference

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

**Core (2 files) → MCP (1 file) → Extension (14 files)**

```
1. Core: Add handler in roopikToolsChannel.ts
2. Core: Add command in roopikToolsCommands.ts
3. MCP: Add tool in appropriate MCP tools file (browserTools.ts, projectTools.ts, canvasTools.ts)
4. Extension: Add client method in RoopikToolClient.ts (if new file, create it ✨)
5. Extension: Add case in RoopikToolHandler.ts (if new file, create it ✨)
6. Extension: Add XML definition in prompts/tools/roopik/index.ts (if new file, create it ✨)
7. Extension: Add native definition in native-tools/roopik.ts (if new file, create it ✨)
8. Extension: Add to native-tools/index.ts (import and spread tools)
9. Extension: Add to tool description map in prompts/tools/index.ts
10. Extension: Add to dispatcher in presentAssistantMessage.ts (add case statement)
11. Extension: Add to ClineSayTool in ExtensionMessage.ts (add to type union)
12. Extension: Add to TOOL_GROUPS in shared/tools.ts (add to roopik array)
13. Extension: Add to ToolName type in packages/types/src/tool.ts (add to array)
14. Extension: Update auto-approval in auto-approval/index.ts (if new prefix)
15. Extension: Update global-settings.ts (if new auto-approval setting needed)
16. Extension: Update mode.ts if enabling roopik tools in specific modes
17. Extension: Update ClineProvider.ts if adding new state management for auto-approval
```

**Note:** Files 4-7 only need creation (✨) during initial integration. For adding individual tools later, these files already exist and just need updates.

---

## Flow: Renaming Tools

**All files that need updating when renaming tools (Total: 19 files)**

**Core (2 files):**
1. `roopikToolsChannel.ts` - switch cases
2. `roopikToolsCommands.ts` - command names and channel.call() strings

**MCP (3 files):**
3. `browserTools.ts` - server.tool() names and error messages (includes CDP tools)
4. `projectTools.ts` - server.tool() names and error messages
5. `canvasTools.ts` - server.tool() names and error messages (canvas + component tools)

**Extension (14 files):**
6. `RoopikToolClient.ts` - method names (optional, internal only)
7. `RoopikToolHandler.ts` - switch cases in dispatcher
8. `roopik/index.ts` - XML tool definitions and function names
9. `native-tools/roopik.ts` - JSON schema tool names and properties
10. `prompts/tools/index.ts` - toolDescriptionMap keys (must match tool names)
11. `presentAssistantMessage.ts` - switch cases for routing (must match tool names)
12. `auto-approval/index.ts` - prefix checks (if changing category prefix)
13. `ExtensionMessage.ts` - ClineSayTool type union (for UI display)
14. `shared/tools.ts` - TOOL_GROUPS.roopik array (must match tool names)
15. `packages/types/src/tool.ts` - ToolName type union (must match tool names)
16. `packages/types/src/global-settings.ts` - Only if adding new auto-approval setting
17. `packages/types/src/mode.ts` - Only if tool group name changes
18. `src/core/webview/ClineProvider.ts` - alwaysAllowRoopik state management
19. `src/core/webview/index.ts` - No changes needed (just exports provider)

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
