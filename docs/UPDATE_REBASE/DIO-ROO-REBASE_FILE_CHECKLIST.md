# Roopik Rebase File Checklist

Quick reference for files containing Roopik/Dio customizations when rebasing from upstream Roo-Code.

**Base Path:** `extensions/roopik-roo/`

---

## 1. Packages (`packages/`)

| Status | File Path | Your Changes |
|--------|-----------|--------------|
| 📝 Modified | `packages/types/src/tool.ts` | `ToolName` type union includes roopik tools, `toolGroups` has "roopik" |
| 📝 Modified | `packages/types/src/global-settings.ts` | `alwaysAllowRoopik` in GlobalSettings schema |
| 📝 Modified | `packages/types/src/mode.ts` | "roopik" allowed in mode groups array |
| 📝 Modified | `packages/types/src/vscode-extension-host.ts` | `ClineSayTool` type has 28 Roopik tool names + Roopik properties (url, selector, action, coordinate, componentId, canvasId, projectPath, name, text). **MIGRATED from deleted `ExtensionMessage.ts`** |

---

## 2. Source (`src/`)

### Created Files (100% your code)

| Status | File Path | Purpose |
|--------|-----------|---------|
| ✨ Created | `src/services/roopik/RoopikToolClient.ts` | IPC client - calls VSCode commands |
| ✨ Created | `src/services/roopik/roopik-tools.ts` | Exports client instance |
| ✨ Created | `src/core/tools/roopik/RoopikToolHandler.ts` | Tool execution & result formatting |
| ✨ Created | `src/core/tools/roopik/index.ts` | Exports handler |
| ✨ Created | `src/core/prompts/tools/roopik/roopik-tools.ts` | `ROOPIK_TOOL_NAMES`, `RoopikToolName` type, `isRoopikTool()` **(KEEP! XML functions inside can be removed)** |
| ✨ Created | `src/core/prompts/tools/native-tools/roopik.ts` | Native tool definitions (JSON schema) |

### Modified Files

| Status | File Path | Your Changes |
|--------|-----------|--------------|
| 📝 Modified | `src/activate/CodeActionProvider.ts` | Inline editor titles: "Roo Code" → "Dio" |
| 📝 Modified | `src/core/prompts/instructions/create-mode.ts` | `roopik` in customModes tool groups list |
| 📝 Modified | `src/core/prompts/sections/capabilities.ts` | Roopik Dio agent capabilities description |
| 📝 Modified | `src/core/prompts/tools/native-tools/index.ts` | Imports & spreads `roopikNativeTools` |
| ⚠️ Deprecated | `src/core/prompts/tools/index.ts` | ~~Roopik XML imports in `toolDescriptionMap`~~ **(NO LONGER NEEDED - whole file removed by upstream!)** |
| 📝 Modified | `src/core/assistant-message/presentAssistantMessage.ts` | Roopik tool dispatcher switch cases |
| 📝 Modified | `src/core/assistant-message/NativeToolCallParser.ts` | Roopik tools in `createPartialToolUse` + `parseToolCall` switch statements (24 cases each) |
| 📝 Modified | `src/core/auto-approval/index.ts` | `alwaysAllowRoopik` approval logic |
| 📝 Modified | `src/shared/tools.ts` | `TOOL_GROUPS.roopik` with 24 tools |
| ✅ Migrated | `src/shared/ExtensionMessage.ts` | **FILE REMOVED BY UPSTREAM!** `ClineSayTool` moved to `packages/types/src/vscode-extension-host.ts` - Roopik tools added there. `alwaysAllowRoopik` in `ExtensionState` is picked from `GlobalSettings`. |
| ⚠️ Critical | `src/core/webview/ClineProvider.ts` | `alwaysAllowRoopik` state + **ALL asset paths prefixed with `"dist"`** in both `getHtmlContent()` and `getHMRHtmlContent()`: codicons, material-icons, images, audio, script, styles. Upstream uses `["assets", ...]`, we need `["dist", "assets", ...]` because extensionUri points to extension root, not dist/ |
| 📝 Modified | `src/extension.ts` | ChatPanel registration for auxiliary bar, `roodio.openChatPanel` command, worktree auto-open |
| ⚠️ Critical | `src/activate/registerCommands.ts` | `externalContext` command handler + **panel icon paths prefixed with `"dist"`**: `"dist", "assets", "icons", "panel_light.png"` and `panel_dark.png`. Upstream uses `"assets", "icons", ...` |

### Assets (REVERT ALL)

| Status | File Path | Action |
|--------|-----------|--------|
| 🔄 Revert | `src/assets/icons/*` | Revert ALL icons to Roopik/Dio branding |

> ⚠️ **Important:** If upstream changes any icons, revert them all. These are custom Roopik/Dio branded icons.

---

## 3. Webview UI (`webview-ui/`)

### Components

| Status | File Path | Your Changes |
|--------|-----------|--------------|
| 📝 Modified | `webview-ui/src/components/chat/ChatRow.tsx` | Roopik tool display cases (28 tools: 14 browser, 3 project, 4 canvas, 7 component) |
| 📝 Modified | `webview-ui/src/components/chat/AutoApproveDropdown.tsx` | "Roopik Tools" dropdown option |
| 📝 Modified | `webview-ui/src/components/chat/ChatView.tsx` | Passes `alwaysAllowRoopik` state |
| 📝 Modified | `webview-ui/src/components/settings/AutoApproveSettings.tsx` | Roopik toggle in settings panel |
| 📝 Modified | `webview-ui/src/components/settings/AutoApproveToggle.tsx` | Handles `alwaysAllowRoopik` state |
| 📝 Modified | `webview-ui/src/components/settings/SettingsView.tsx` | Renders Roopik settings |
| 📝 Modified | `webview-ui/src/components/settings/__tests__/AutoApproveToggle.spec.tsx` | Tests for Roopik toggle |
| 📝 Modified | `webview-ui/src/components/welcome/WelcomeViewProvider.tsx` | Integration note info box |
| 📝 Modified | `webview-ui/src/components/settings/About.tsx` | Integration note in About section |
| 🔄 Disabled | `webview-ui/src/components/common/DismissibleUpsell.tsx` | Returns null to disable Code Cloud upsell banners |
| 🔄 Disabled | `webview-ui/src/components/cloud/CloudUpsellDialog.tsx` | Returns null to disable Code Cloud popup dialog |

### Context & Hooks

| Status | File Path | Your Changes |
|--------|-----------|--------------|
| 📝 Modified | `webview-ui/src/context/ExtensionStateContext.tsx` | `alwaysAllowRoopik` in context |
| 📝 Modified | `webview-ui/src/hooks/useAutoApprovalState.ts` | Manages Roopik state logic |
| 📝 Modified | `webview-ui/src/hooks/useAutoApprovalToggles.ts` | Roopik toggle handlers |

### i18n / Localization

| Status | File Path | Your Changes |
|--------|-----------|--------------|
| 📝 Modified | `webview-ui/src/i18n/locales/en/chat.json` | `roopik.*` translations for browser, project, canvas, component tools |
| 📝 Modified | `webview-ui/src/i18n/locales/en/settings.json` | `alwaysAllowRoopik` label + `about.integrationNote` |
| 📝 Modified | `webview-ui/src/i18n/locales/en/welcome.json` | `landing.integrationNote` |

### Build Config

| Status | File Path | Your Changes |
|--------|-----------|--------------|
| ⚠️ Critical | `webview-ui/turbo.json` | `outputs: ["./build/**"]` (NOT `../src/webview-ui/**`) |

---

## 4. Root Config Files

| Status | File Path | Your Changes |
|--------|-----------|--------------|
| 📝 Modified | `package.json` | `roodio.*` namespace, `main: dist/extension.js`, `build` vs `build:all` scripts, ChatPanel menus |
| 📝 Modified | `esbuild.mjs` | Output to `dist/`, asset copy paths |
| 📝 Modified | `webview-ui/package.json` | Build script order, clean path |
| 📝 Modified | `webview-ui/vite.config.ts` | `outDir: ./build` |
| ⚠️ Critical | `webview-ui/src/vite-plugins/sourcemapPlugin.ts` | Output path `./build` (NOT `../src/webview-ui/build`) — must match vite.config.ts outDir |

---

## Quick Check Commands

```bash
# Check all uncommitted changes for keywords
git diff -G"roopik|dio|alwaysAllowRoopik|roodio" --name-only

# Check specific folder
git diff -G"roopik|dio|alwaysAllowRoopik" --name-only -- "extensions/roopik-roo/src/"
git diff -G"roopik|dio|alwaysAllowRoopik" --name-only -- "extensions/roopik-roo/webview-ui/"
git diff -G"roopik|dio|alwaysAllowRoopik" --name-only -- "extensions/roopik-roo/packages/"

# Show lines being REMOVED (danger!)
git diff --unified=0 | grep -E "^-" | grep -iE "roopik|dio|alwaysAllowRoopik"
```

---

## Keywords to Watch

- `roopik` / `Roopik` / `ROOPIK`
- `dio` / `Dio` / `DIO`
- `roodio` / `Roodio`
- `alwaysAllowRoopik`
- `externalContext`
- `integrationNote`
- `TOOL_GROUPS.roopik`
- `RoopikTool`

---

**Legend:**
- ✨ Created = 100% your code, don't lose it
- 📝 Modified = Has your additions mixed with upstream
- 🔄 Revert = Always revert to your version (don't accept upstream)
- ⚠️ Critical = Wrong value will break build
- ⚠️ Deprecated = Can be deleted (XML support removed, native tools only)
- ✅ Migrated = Upstream moved this code; your changes now live elsewhere
