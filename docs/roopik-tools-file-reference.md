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
| 2 | `services/roopik/roopik-tools.ts` | Exports client instance | ✨ Created |
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

## Webview UI Side (React Frontend)

**Total: 9 files** (all modified 📝 to add alwaysAllowRoopik state/UI)

Files in `extensions/roopik-dio/webview-ui/src/` or `extensions/roopik-roo/webview-ui/src/`:

| # | File | Purpose | Status |
|---|------|---------|--------|
| 1 | `components/chat/AutoApproveDropdown.tsx` | Dropdown UI component - includes "Roopik Tools" option | 📝 Modified |
| 2 | `components/chat/ChatView.tsx` | Main chat view - passes alwaysAllowRoopik state to components | 📝 Modified |
| 3 | `components/settings/AutoApproveSettings.tsx` | Auto-approve settings panel - displays Roopik toggle | 📝 Modified |
| 4 | `components/settings/AutoApproveToggle.tsx` | Toggle component - handles alwaysAllowRoopik state changes | 📝 Modified |
| 5 | `components/settings/SettingsView.tsx` | Main settings view - renders AutoApproveSettings with Roopik | 📝 Modified |
| 6 | `components/settings/__tests__/AutoApproveToggle.spec.tsx` | Unit tests - added tests for alwaysAllowRoopik toggle | 📝 Modified |
| 7 | `context/ExtensionStateContext.tsx` | React context - provides alwaysAllowRoopik state to components | 📝 Modified |
| 8 | `hooks/useAutoApprovalState.ts` | Hook - manages alwaysAllowRoopik state logic | 📝 Modified |
| 9 | `hooks/useAutoApprovalToggles.ts` | Hook - provides toggle handlers for all auto-approval settings | 📝 Modified |
| 10 | `i18n/locales/en/settings.json` | i18n strings - "Roopik Tools" label and description text | 📝 Modified |
| 11 | `turbo.json` | Turborepo config - **CRITICAL**: `outputs` must be `["./build/**"]` NOT `["../src/webview-ui/**"]` | 📝 Modified |

**Note:** These files handle the UI layer for the "Always Allow Roopik Tools" toggle that appears in settings and the auto-approve dropdown.

### Webview Build Process (IMPORTANT!)

**Build Order Issue Found:**
The `package.json` script order was incorrect:
```json
"build": "npm run bundle && npm run build:webview"  // ❌ WRONG: Copies OLD build, then builds NEW
```

**Correct order should be:**
```json
"build": "npm run build:webview && npm run bundle"  // ✅ CORRECT: Build NEW first, then copy
```

**Build Flow:**
1. `npm run build:webview` → Builds React app to `webview-ui/build/`
2. `npm run bundle` (esbuild.mjs) → Copies `webview-ui/build/` to `dist/webview-ui/`

**Critical Config:**
- `webview-ui/turbo.json` must have `outputs: ["./build/**"]` (builds to `webview-ui/build/`)
- `esbuild.mjs` copies from `webview-ui/build/` to `dist/webview-ui/`
- If `turbo.json` had `outputs: ["../src/webview-ui/**"]` it would build to wrong location!

---

### Disabling Roo Code's Browser Action

To disable Roo Code's internal browser action and ensure only Roopik's browser tools are used:

1.  **Comment out `browser_action` in `src/core/prompts/tools/index.ts`:**
    ```typescript
    // browser_action: (args) => getBrowserActionDescription(args), // DISABLED
    ```
    This removes the tool from the XML/Anthropic toolset.

2.  **Comment out `browserAction` in `src/core/prompts/tools/native-tools/index.ts`:**
    ```typescript
    // browserAction, // DISABLED
    ```
    This removes the tool from the OpenAI/native toolset.

By making these changes, the LLM will no longer have access to Roo Code's `browser_action` tool, and will default to using Roopik's dedicated browser tools when browser interaction is needed.

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

**Core (2 files) → MCP (1 file) → Extension (14 files) → Webview UI (10 files)**

```
Core:
1. Add handler in roopikToolsChannel.ts
2. Add command in roopikToolsCommands.ts

MCP:
3. Add tool in appropriate MCP tools file (browserTools.ts, projectTools.ts, canvasTools.ts)

Extension Backend:
4. Add client method in RoopikToolClient.ts (if new file, create it ✨)
5. Add case in RoopikToolHandler.ts (if new file, create it ✨)
6. Add XML definition in prompts/tools/roopik/index.ts (if new file, create it ✨)
7. Add native definition in native-tools/roopik.ts (if new file, create it ✨)
8. Add to native-tools/index.ts (import and spread tools)
9. Add to tool description map in prompts/tools/index.ts
10. Add to dispatcher in presentAssistantMessage.ts (add case statement)
11. Add to ClineSayTool in ExtensionMessage.ts (add to type union)
12. Add to TOOL_GROUPS in shared/tools.ts (add to roopik array)
13. Add to ToolName type in packages/types/src/tool.ts (add to array)
14. Update auto-approval in auto-approval/index.ts (if new prefix)
15. Update global-settings.ts (if new auto-approval setting needed)
16. Update mode.ts if enabling roopik tools in specific modes
17. Update ClineProvider.ts if adding new state management for auto-approval

Webview UI (if adding new tool category requiring UI toggle):
18. Update AutoApproveDropdown.tsx (add dropdown option)
19. Update ChatView.tsx (pass new state to components)
20. Update AutoApproveSettings.tsx (add settings toggle)
21. Update AutoApproveToggle.tsx (handle new toggle state)
22. Update SettingsView.tsx (render new settings)
23. Update AutoApproveToggle.spec.tsx (add tests)
24. Update ExtensionStateContext.tsx (add state to context)
25. Update useAutoApprovalState.ts (manage new state)
26. Update useAutoApprovalToggles.ts (provide toggle handlers)
27. Update settings.json (add i18n strings)
```

**Note:**
- Files 4-7 only need creation (✨) during initial integration
- Webview UI files (18-27) only need updates if adding a new tool category that requires its own auto-approval toggle

---

## Flow: Renaming Tools

**All files that need updating when renaming tools (Total: 29 files)**

**Core (2 files):**
1. `roopikToolsChannel.ts` - switch cases
2. `roopikToolsCommands.ts` - command names and channel.call() strings

**MCP (3 files):**
3. `browserTools.ts` - server.tool() names and error messages (includes CDP tools)
4. `projectTools.ts` - server.tool() names and error messages
5. `canvasTools.ts` - server.tool() names and error messages (canvas + component tools)

**Extension Backend (14 files):**
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

**Webview UI (10 files) - only if changing tool category name:**
20. `AutoApproveDropdown.tsx` - dropdown option labels
21. `ChatView.tsx` - state prop names
22. `AutoApproveSettings.tsx` - settings panel references
23. `AutoApproveToggle.tsx` - toggle state keys
24. `SettingsView.tsx` - settings rendering
25. `AutoApproveToggle.spec.tsx` - test assertions
26. `ExtensionStateContext.tsx` - context state keys
27. `useAutoApprovalState.ts` - state management keys
28. `useAutoApprovalToggles.ts` - toggle handler keys
29. `settings.json` - i18n string keys and labels

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
