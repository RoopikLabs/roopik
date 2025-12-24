# Roopik Tools: File Reference

> Quick reference for adding/updating Roopik IDE tools that use IPC between agent-dio extension and Core.

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
| 8 | `core/prompts/tools/index.ts` | Adds "roopik" group to getToolsForMode() |
| 9 | `core/assistant-message/presentAssistantMessage.ts` | Tool dispatcher - routes rpk_* to handler |
| 10 | `packages/types/src/tool.ts` | ToolName type union |
| 11 | `shared/tools.ts` | NativeToolArgs type definitions |
| 12 | `shared/ExtensionMessage.ts` | ClineSayTool interface (for UI display) |

---

## Core Side (Roopik IDE)

Files in `src/vs/`:

| # | File | Purpose |
|---|------|---------|
| 1 | `workbench/contrib/roopik/browser/commands/roopikToolsCommands.ts` | VSCode command handlers (renderer process) |
| 2 | `workbench/contrib/roopik/browser/commands/index.ts` | Exports/registers commands |
| 3 | `workbench/contrib/roopik/electron-main/channel/roopikToolsChannel.ts` | IPC channel handlers (main process) |
| 4 | `code/electron-main/app.ts` | Registers IPC channel |

---

## Flow: Adding a New Tool

```
1. Core: Add handler in roopikToolsChannel.ts
2. Core: Add command in roopikToolsCommands.ts
3. Extension: Add client method in RoopikToolClient.ts
4. Extension: Add case in RoopikToolHandler.ts
5. Extension: Add XML definition in prompts/tools/roopik/index.ts
6. Extension: Add native definition in native-tools/roopik.ts
7. Extension: Add to dispatcher in presentAssistantMessage.ts
8. Extension: Add to ClineSayTool in ExtensionMessage.ts (for UI)
```

---

## Flow: Updating an Existing Tool

```
1. Core: Update handler in roopikToolsChannel.ts (change logic/response)
2. Extension: Update client method in RoopikToolClient.ts (if params changed)
3. Extension: Update definitions in roopik/index.ts and native-tools/roopik.ts (if schema changed)
4. Extension: Update handler in RoopikToolHandler.ts (if result formatting changed)
```

---

## Quick Grep Commands

```bash
# Find all rpk_ tool references in extension
grep -r "rpk_" extensions/roopik-dio/src/ --include="*.ts"

# Find all tool handlers in Core
grep -r "case 'rpk_" src/vs/ --include="*.ts"

# Find tool definitions
grep -r "name.*rpk_" extensions/roopik-dio/src/ --include="*.ts"
```
