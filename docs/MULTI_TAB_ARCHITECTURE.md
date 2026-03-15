# Multi-Tab Browser Architecture

> Completed: 2026-03-14 | Status: **Production-ready (Both Embedded & External Modes)**

## Overview

Roopik supports multiple browser tabs in **two modes**, both behind a single `IBrowserBackend` abstraction:

- **Embedded Mode** — `WebContentsView` inside the IDE (default). 3 tab limit, source-map CSS inspection.
- **External Mode** — Chrome launched with `--remote-debugging-port`, controlled via CDP WebSocket. Unlimited tabs, universal CSS inspection on any site.

The tools layer (`BrowserToolService`, `RoopikToolsChannel`, `ToolExecutor`) **never knows** which backend is active. All 15 browser tools work identically in both modes.

---

## Architecture Diagram

```
                    Agent / MCP / IPC / Extension Command
                              │
                    ┌─────────┴─────────┐
                    │  tabId (optional)  │
                    └─────────┬─────────┘
                              │
                ┌─────────────┴──────────────┐
                │     BrowserToolService     │  resolveTarget(tabId) → browserViewId
                │  (Single Source of Truth)   │  All tools route through here
                └─────────────┬──────────────┘
                              │
                ┌─────────────┴──────────────┐
                │      IBrowserBackend       │  Abstract interface
                └──────┬────────────┬────────┘
                       │            │
            Embedded   │            │  External
     ┌─────────────────┴┐    ┌─────┴──────────────────┐
     │ BrowserViewService│    │ ExternalBrowserBackend  │
     │                   │    │                         │
     │ Tab 1 → View 42  │    │ Tab 1 → CDPSession A    │
     │ Tab 2 → View 57  │    │ Tab 2 → CDPSession B    │
     │ Tab 3 → View 68  │    │ Tab 3 → CDPSession C    │
     │                   │    │ Tab 4 → CDPSession D    │
     │ MAX_TABS = 3      │    │ NO LIMIT (Chrome tabs)  │
     │ Electron managed  │    │ Chrome + CDP WebSocket  │
     └───────────────────┘    └─────────────────────────┘
```

## Unified Code Paths

**All browser operations** — whether from MCP, native IPC, or UI button — go through the same path:

```
┌──────────────────┐     ┌───────────────────┐     ┌────────────────────┐
│  MCP WebSocket   │     │  Extension IPC     │     │  UI Button Click   │
│  (toolExecutor)  │     │  (roopikTools      │     │  (browserCommands) │
│                  │     │   Channel)         │     │                    │
└────────┬─────────┘     └────────┬───────────┘     └────────┬───────────┘
         │                        │                          │
         └────────────────────────┼──────────────────────────┘
                                  │
                                  ▼
                     ┌────────────────────────┐
                     │  BrowserToolService    │
                     │  .open()  .close()     │
                     │  .navigate()  etc.     │
                     └────────────┬───────────┘
                                  │
                                  ▼
                     ┌────────────────────────┐
                     │  IBrowserBackend       │
                     └────────────────────────┘
```

This eliminates the class of bugs where different callers produced different behavior (e.g., IPC returning wrong tabId while MCP returned correct one).

---

## Backend Selection (Factory in `app.ts`)

```
Settings: roopik.browser.mode → "embedded" | "external"
                    ↓
         app.ts reads config
                    ↓
    ┌───────────────┴───────────────┐
    │ "embedded"                    │ "external"
    │ new BrowserViewService()      │ new ExternalBrowserBackend()
    │ (WebContentsView + Electron)  │ (Chrome + CDP WebSocket)
    └───────────┬───────────────────┘
                ↓
      browserBackend: IBrowserBackend
                ↓
    ┌───────────┼──────────────┐
    │           │              │
  McpServer  ToolsChannel  ToolExecutor
  Service                  ├─ BrowserToolService
                           ├─ CDPMonitorService
                           └─ ProjectToolService
```

The `ProjectModeChannel` (renderer IPC for editor tabs) is only registered in embedded mode — external mode has no renderer editor tabs.

On IDE shutdown, `app.ts` calls `browserBackend.dispose()` via `onWillShutdown`. In embedded mode this is a no-op (Electron handles cleanup). In external mode, this **kills the Chrome process** we spawned (but leaves user-launched Chrome alone).

---

## Key Design Decisions

### 1. Stable `tabId` (not `browserViewId`)

Agents reference tabs by `tabId` — a stable auto-incrementing integer that **never changes**, even when the underlying `browserViewId` changes (e.g., view recreation on drag between editor groups).

```
Agent sees:  tabId: 1, tabId: 2, tabId: 3        (stable, never changes)
Backend has: tabId 1 → browserViewId 42           (internal, may change)
             tabId 2 → browserViewId 57
```

**Translation:** `BrowserToolService.resolveTarget(tabId)` calls `backend.resolveTabId(tabId)` → returns `browserViewId`. Every tool method uses this.

**External mode note:** `tabId === pageId === browserViewId`. No mapping needed — the `resolveTabId()` call just validates existence.

### 2. Tab Limit (Embedded Only)

```typescript
export const MAX_BROWSER_TABS = 3;
```

- **Embedded**: Enforced. Each `WebContentsView` is a full Chromium process consuming ~100-200MB.
- **External**: No limit. Chrome manages its own tabs natively.

### 3. Background Tab Interaction

CDP operates at the `webContents` level, not the visual layer. Agents can screenshot, click, navigate, and read console logs on **any tab** regardless of which is "active" (visible). `view.setVisible(false)` hides the view but the webContents is fully live.

### 4. Atomic Tab Creation

`openNewTab()` doesn't return immediately — it waits for the tab to be fully connected before returning the tabId.

**Embedded mode:** Fires a `requestBrowserOpen` event to the renderer, then waits for the `onTabCreated` event to fire back with the real tabId.

**External mode:** Calls CDP `Target.createTarget`, then uses `waitForTarget()` — a polling-based helper that checks `targetIdToPageId` every 50ms until the browser monitor's `Target.targetCreated` event handler connects the new page. Falls back to manual `discoverAndConnectPages()` at 5s timeout.

---

## Embedded vs External: Comparison

| Aspect | Embedded | External |
|--------|----------|----------|
| **Backend class** | `BrowserViewService` | `ExternalBrowserBackend` |
| **Browser engine** | `WebContentsView` (Electron) | Chrome via CDP WebSocket |
| **Tab limit** | 3 (MAX_BROWSER_TABS) | Unlimited |
| **CDP connection** | `webContents.debugger.attach()` | Direct WebSocket (`ws://127.0.0.1:<port>/devtools/page/<id>`) |
| **Tab discovery** | Renderer creates tabs via IPC | Browser monitor (`Target.setDiscoverTargets`) auto-detects all tabs |
| **CSS inspection** | Source-map resolution (file:line:column via Vite) | Universal via CDP CSS domain (any website) |
| **Tab UI** | IDE editor tabs (EditorTabInput) | Chrome's own tab bar |
| **Renderer IPC** | ProjectModeChannel registered | No ProjectModeChannel (no renderer events) |
| **IDE shutdown** | Electron cleans up views | `dispose()` kills Chrome process tree |
| **`attachDebugger()`** | Attaches Electron debugger | No-op (CDP is always connected) |
| **`requestBrowserClose()`** | Fires renderer event to close editor tab | No-op (Chrome manages its own tab UI) |
| **`requestBrowserOpen()`** | Fires renderer event to open editor tab | Calls `launchOrConnect()` to spawn/attach Chrome |

---

## External Browser: Architecture Deep Dive

### Connection Model

```
┌─────────────┐     HTTP /json/version      ┌──────────────┐
│   Roopik    │ ──────────────────────────►  │    Chrome     │
│   (main     │     Browser-level WS         │  (--remote-   │
│   process)  │ ◄════════════════════════►  │  debugging-   │
│             │     Target.setDiscoverTargets │  port=9222)   │
│             │                              │               │
│  CDPSession │     Per-page WS              │  Tab 1 (/page/A)
│  (page A)   │ ◄════════════════════════►  │  Tab 2 (/page/B)
│  CDPSession │     Per-page WS              │  Tab 3 (/page/C)
│  (page B)   │ ◄════════════════════════►  │               │
│  CDPSession │     Per-page WS              │               │
│  (page C)   │ ◄════════════════════════►  │               │
└─────────────┘                              └──────────────┘
```

- **Browser-level session:** One WebSocket to Chrome's browser endpoint. Subscribes to `Target.setDiscoverTargets` for real-time tab open/close/change events.
- **Per-page sessions:** One WebSocket per tab to `ws://127.0.0.1:<port>/devtools/page/<targetId>`. Used for all CDP commands (Page, Runtime, Network, CSS, DOM, Input, Emulation).

### Chrome Lifecycle

```
launchOrConnect(url?)
    │
    ├─ Has live active session? → navigate(url) and return
    │
    ├─ tryAttachToExisting() → Chrome already running on CDP port?
    │   ├─ Yes → connectBrowserMonitor() + discoverAndConnectPages()
    │   └─ No  → continue
    │
    └─ spawn Chrome with args:
         --remote-debugging-port=<cdpPort>
         --user-data-dir=<profilePath>
         --no-first-run
         --no-default-browser-check
         │
         ├─ waitForCDP() — polls /json/version every 200ms (max 30 attempts)
         ├─ connectBrowserMonitor() — browser-level WS + Target discovery
         └─ discoverAndConnectPages() — per-page WS connections
```

### Discovery Serialization

`discoverAndConnectPages()` is serialized via a `discoveryInProgress` lock. This prevents a race condition where the `Target.targetCreated` event handler and a direct call from `launchOrConnect()` / `connectToNewTarget()` both discover the same target simultaneously and create duplicate page entries.

```typescript
private discoverAndConnectPages(): Promise<void> {
    if (this.discoveryInProgress) {
        return this.discoveryInProgress;  // Coalesce concurrent calls
    }
    this.discoveryInProgress = this._discoverAndConnectPagesImpl().finally(() => {
        this.discoveryInProgress = null;
    });
    return this.discoveryInProgress;
}
```

Inside the implementation, targets are deduped by both WebSocket URL and target ID.

### Tab Event Flow (External)

```
Chrome user opens new tab
    │
    ▼
Target.targetCreated event (browser monitor)
    │
    ├─ Filter: type !== 'page' → skip
    │
    ├─ connectToNewTarget(targetId)
    │   └─ discoverAndConnectPages() (serialized)
    │       ├─ fetch /json/list
    │       ├─ Skip already-connected targets (by wsUrl + targetId)
    │       ├─ Create CDPSession + connect WS
    │       ├─ Enable Page, Runtime, Network domains
    │       ├─ Listen for Page.frameNavigated + Page.loadEventFired
    │       │   └─ Update stored target URL/title for listTabs()
    │       ├─ session.onClose → removePage()
    │       ├─ pages.set(pageId, { session, target })
    │       ├─ targetIdToPageId.set(targetId, pageId)
    │       └─ Fire onBrowserViewCreated + onTabCreated
    │
    ▼
Tab is now tracked and available via listTabs()
```

### URL/Title Freshness

`listTabs()` returns current URLs/titles because stored `page.target` is updated in three places:
1. **`Target.targetInfoChanged`** (browser monitor) — Chrome fires this on navigation
2. **`Page.frameNavigated`** (per-page listener) — main frame only, updates URL immediately
3. **`Page.loadEventFired`** (per-page listener) — updates both URL and title after load completes

---

## External Browser: CSS Inspection (Universal)

Unlike embedded mode which uses Vite source maps to trace styles back to source files (`file:line:column`), external mode uses Chrome's CDP CSS domain directly. This means **it works on any website** — GitHub, YouTube, production sites, etc.

**Trade-off:** No source file locations (no source maps available), but full matched CSS rules, selectors, inline styles, inherited styles, and computed values straight from Chrome's rendering engine.

**CDP Flow:**
```
DOM.enable → CSS.enable
    │
    ├─ Selector target: DOM.getDocument → DOM.querySelector
    ├─ Coordinate target: DOM.getNodeForLocation
    │
    ▼
DOM.describeNode → tagName, id, classes
    │
    ├─ CSS.getMatchedStylesForNode → matched rules, inline styles, inherited
    ├─ CSS.getComputedStyleForNode → computed pixel values
    └─ DOM.getBoxModel → bounding box
```

**Inherited styles:** Ancestor element descriptions (`div#main`, `body.dark`, etc.) are collected via a single `Runtime.evaluate` call that walks `parentElement` up the DOM, matching the order of the CDP `inherited[]` array.

---

## IDE Shutdown: External Chrome Cleanup

When the IDE closes, `app.ts` fires `browserBackend.dispose()`:

- **Embedded:** No-op (Electron destroys `WebContentsView` instances automatically)
- **External:**
  1. `disconnectAll()` — close all CDP WebSocket connections
  2. Kill Chrome process tree (only if **we** spawned it — `chromeProcess !== null`)
     - **Windows:** `taskkill /pid <pid> /T /F` (tree kill, force)
     - **Unix:** `process.kill(-pid, 'SIGTERM')` (process group)
  3. If we attached to a user-launched Chrome instance, we just disconnect — Chrome stays open

---

## Tab Lifecycle

### Opening Tabs

| Action | Behavior |
|--------|----------|
| User clicks "Browse Web" | Opens NEW tab (up to limit in embedded) |
| `browser_open()` (no params) | Opens first tab if none exist, otherwise returns active tab |
| `browser_open({ newTab: true })` | Creates NEW tab (up to limit in embedded) |
| `browser_open({ tabId: 2 })` | Focuses tab 2, navigates if URL given |
| Dev server starts | Navigates active tab if blank, opens new tab if active has content |

### Closing Tabs

| Action | Behavior |
|--------|----------|
| `browser_close({ tabId: 2 })` | Closes specific tab |
| `browser_close()` (no tabId) | Closes ALL tabs (3-phase in embedded) |
| User clicks X on editor tab | Closes that specific tab (embedded only) |

### Active Tab on Close

When the active tab is closed, `removePage()` / `closeTab()` automatically selects the last remaining tab as the new active:
```typescript
if (this.activePage === pageId) {
    const remaining = Array.from(this.pages.keys());
    this.activePage = remaining.length > 0 ? remaining[remaining.length - 1] : undefined;
    if (this.activePage) this._onActiveTabChanged.fire({ tabId: this.activePage });
}
```

### 3-Phase Close-All (Embedded Only)

When closing all tabs, a naive per-tab loop causes cascading re-activation (VS Code activates the next editor tab when one closes). The fix:

```
Phase 1: Clean up CDP monitors for ALL tabs (no re-activation side effects)
Phase 2: Destroy ALL backend views (WebContentsView objects)
Phase 3: Single requestBrowserClose() event → renderer closes all editor tabs at once
```

In external mode, close-all simply iterates tabs and calls `Page.close` / `/json/close/<targetId>` per tab. No renderer coordination needed.

---

## File Map

### Backend (electron-main)

| File | Purpose |
|------|---------|
| [browserBackend.ts](../src/vs/workbench/contrib/roopik/electron-main/projectMode/browserBackend.ts) | `IBrowserBackend` interface, `TabInfo` type, `MAX_BROWSER_TABS`, `dispose()` |
| [browserViewService.ts](../src/vs/workbench/contrib/roopik/electron-main/projectMode/browserViewService.ts) | Embedded implementation — tab maps, view lifecycle, visibility |
| [externalBrowserBackend.ts](../src/vs/workbench/contrib/roopik/electron-main/projectMode/externalBrowserBackend.ts) | External Chrome — CDP sessions, Chrome launcher, browser monitor, CSS inspection |
| [browserToolService.ts](../src/vs/workbench/contrib/roopik/electron-main/tools/browserToolService.ts) | Unified tool layer — `resolveTarget()`, all tool methods |
| [cdpMonitorService.ts](../src/vs/workbench/contrib/roopik/electron-main/tools/cdpMonitorService.ts) | Per-tab CDP monitoring (console, errors, network) |
| [projectToolService.ts](../src/vs/workbench/contrib/roopik/electron-main/tools/projectToolService.ts) | Dev server start/stop — multi-tab aware navigation |
| [roopikToolsChannel.ts](../src/vs/workbench/contrib/roopik/electron-main/channel/roopikToolsChannel.ts) | IPC bridge — delegates all calls to tool services |
| [toolExecutor.ts](../src/vs/workbench/contrib/roopik/electron-main/mcp/executor/toolExecutor.ts) | MCP tool executor — extracts tabId, routes to tool services |
| [toolSchemas.ts](../src/vs/workbench/contrib/roopik/electron-main/mcp/toolSchemas.ts) | Zod schemas with `tabId` field on all browser tools |

### Renderer (browser) — Embedded mode only

| File | Purpose |
|------|---------|
| [editorTabInput.ts](../src/vs/workbench/contrib/roopik/browser/projectMode/editorTabInput.ts) | Per-tab editor input (not singleton) — `tabId` → `URI` |
| [editor.ts](../src/vs/workbench/contrib/roopik/browser/projectMode/editor.ts) | Single editor pane, per-tab state map, tab switching |
| [browserCommands.ts](../src/vs/workbench/contrib/roopik/browser/commands/browserCommands.ts) | `openBrowserEditor()` — focus existing or create new |
| [projectModeContribution.ts](../src/vs/workbench/contrib/roopik/browser/contributions/projectModeContribution.ts) | Dev server events → backend-delegated navigation |

### Backend Selection (factory)

| File | Purpose |
|------|---------|
| [app.ts](../src/vs/code/electron-main/app.ts) | Reads `roopik.browser.mode`, creates backend, hooks `dispose()` to shutdown |

---

## Data Flow: `browser_open({ newTab: true, url: "http://localhost:3000" })`

### Embedded Mode

```
1. Agent calls browser_open via MCP or IPC
          │
2. ToolExecutor / RoopikToolsChannel
   extracts { newTab: true, url: "..." }
          │
3. BrowserToolService.open()
   sees newTab=true → calls backend.openNewTab(url)
          │
4. BrowserViewService.openNewTab()
   a) Checks MAX_BROWSER_TABS (reject if at limit)
   b) Fires _onBrowserOpenRequested event (→ renderer)
   c) Waits for _onTabCreated event (← renderer)
          │                                    │
          │                     5. Renderer: openBrowserEditor()
          │                        creates EditorTabInput(tabId)
          │                        opens editor pane
          │                                    │
          │                     6. Editor.setInput()
          │                        calls IPC createBrowserView(windowId, tabId)
          │                                    │
          │                     7. BrowserViewService.createBrowserView()
          │                        creates WebContentsView
          │                        maps tabId → browserViewId
          │                        fires _onTabCreated event ──────┐
          │                                                        │
          ◄────────────────────────────────────────────────────────┘
          │
8. openNewTab() resolves with tabId
          │
9. BrowserToolService navigates:
   browserViewId = resolveTabId(tabId)
   backend.navigate(browserViewId, url)
          │
10. Returns { success: true, data: { tabId, url, ... } }
```

### External Mode

```
1. Agent calls browser_open via MCP or IPC
          │
2. ToolExecutor / RoopikToolsChannel
   extracts { newTab: true, url: "..." }
          │
3. BrowserToolService.open()
   sees newTab=true → calls backend.openNewTab(url)
          │
4. ExternalBrowserBackend.openNewTab(url)
   a) If Chrome not running → launchOrConnect(url)
   b) browserSession.send('Target.createTarget', { url })
          │
5. waitForTarget(targetId, 5000)
   polls targetIdToPageId every 50ms
          │                                    │
          │           Target.targetCreated event fires
          │           connectToNewTarget(targetId)
          │           discoverAndConnectPages() (serialized)
          │           CDPSession connects to page WS
          │           pages.set(pageId, { session, target })
          │           targetIdToPageId.set(targetId, pageId) ──────┐
          │                                                        │
          ◄────────────────────────────────────────────────────────┘
          │
6. waitForTarget resolves with pageId (= tabId)
   activePage = pageId
   fires onActiveTabChanged
          │
7. Returns { success: true, data: { tabId, url, ... } }
```

Note: No renderer involvement in external mode. No editor tabs, no IPC to renderer process.

---

## Edge Cases Handled

### Tab Drag Between Split Groups (Embedded Only)

VS Code reuses a single Editor pane and calls `setInput()` on every tab switch. When dragging a browser tab to a split group:

1. Old editor `dispose()` fires — but the tab is **not closed**, just moved
2. New editor `setInput()` receives same `EditorTabInput(tabId)` — tabId is stable
3. Backend `createBrowserView()` may assign new `browserViewId` but tabId stays the same
4. CDP monitoring transfers via `transferCDPMonitoring(oldId, newId)`

### Window Reload (Ctrl+Shift+P → Reload)

- All views destroyed (existing behavior)
- Tab maps cleared, old tabIds invalid
- Agents must call `browser_list_tabs` to rediscover current state

### Invalid tabId from Agent

`resolveTabId()` throws a clear error:
```
"Tab 5 not found. Use browser_list_tabs to see available tabs."
```
`BrowserToolService` catches this → returns `{ success: false, error: "..." }`

### Tab Limit Reached (Embedded Only)

- `openNewTab()` returns error: "Tab limit reached (max 3)"
- User "Browse Web" button: Shows warning notification instead of error
- External mode: No limit — Chrome handles its own tabs

### Duplicate Tab Discovery (External Only)

`discoverAndConnectPages()` is serialized via `discoveryInProgress` lock. Without this, concurrent calls from `Target.targetCreated` events and direct `launchOrConnect()` calls would both connect to the same Chrome tab and create duplicate page entries (e.g., 4 entries for 1 real tab).

### Chrome Already Running (External Only)

`launchOrConnect()` checks `tryAttachToExisting()` before spawning. If Chrome is already running on the CDP port (from a previous session or user-launched), we attach to it instead of spawning a new instance. On IDE shutdown, `dispose()` only kills Chrome if we spawned it (`chromeProcess !== null`).

---

## Bugs Solved During Implementation

### 1. Wrong tabId Returned from `browser_open`

**Symptom:** First `browser_open` returned no tabId. Subsequent `browser_open({ newTab: true })` always returned `tabId: 1`.

**Root cause:** The IPC channel (`roopikToolsChannel.ts`) had its own independent `handleBrowserOpen()` with a polling loop, separate from `BrowserToolService.open()` used by MCP. The channel path used `requestBrowserOpen()` + polling (which didn't capture the real tabId), while MCP used `openNewTab()` with event-based resolution.

**Fix:** Removed the channel's independent implementation entirely. All paths now delegate to `BrowserToolService.open()`.

### 2. `browser_close()` Only Closed Active Tab

**Symptom:** Calling `browser_close()` without a tabId closed only the active tab instead of all tabs.

**Root cause:** The per-tab close loop called both `closeTab()` (backend) AND `requestBrowserClose(tabId)` (renderer) per tab. Closing one editor tab triggers VS Code to activate the next tab in the group, causing cascading re-activation that interfered with subsequent closes.

**Fix:** 3-phase close-all approach — clean all CDP, destroy all views, then single renderer close event.

### 3. Renderer Handling Navigation Directly

**Symptom:** Race conditions and inconsistent behavior when renderer navigated the browser view instead of the backend.

**Root cause:** `projectModeContribution.ts` was calling `browserPane.navigateToUrl()` directly. `roopikToolsCommands.ts` had a `setTimeout(500ms)` hack to navigate after editor opened.

**Fix:** All navigation delegated to backend via IPC: `channel.call('browser_navigate', { url })`. Renderer only manages editor panes.

### 4. CDPMonitorService Single-Tab Cleanup

**Symptom:** Opening a second tab would destroy monitoring on the first tab.

**Root cause:** `ensureMonitoring()` had a loop that cleaned up monitors for all browserViewIds except the current one — a leftover from single-tab design.

**Fix:** Removed the cleanup loop. Each tab maintains independent CDP monitoring.

### 5. Cross-Tab State Leaking in Editor

**Symptom:** Navigation events from one tab could update the URL bar of another tab.

**Root cause:** Editor wasn't filtering events by `browserViewId`.

**Fix:** All event handlers check `event.browserViewId !== this.browserViewId` before processing.

### 6. Double-Close Wrong Tab (External Only)

**Symptom:** `browser_close({ tabId: 2 })` would close tab 2 AND whatever became the active tab next.

**Root cause:** `BrowserToolService.close(tabId)` calls `closeTab(tabId)` then `requestBrowserClose(tabId)`. After `closeTab(2)` removed tab 2, `requestBrowserClose()` called `closeActivePage()` — closing whatever was now active.

**Fix:** Made `requestBrowserClose()` a no-op in external mode. Removed dead `closeActivePage()` method.

### 7. Duplicate Tab Entries (External Only)

**Symptom:** `project_start` opened 1 Chrome tab but `browser_list_tabs` showed 4 entries.

**Root cause:** `discoverAndConnectPages()` was called concurrently from `Target.targetCreated` event handler and directly from `launchOrConnect()`. Both saw the same target as "not yet connected" and created duplicate CDP sessions.

**Fix:** Serialization lock (`discoveryInProgress`) ensures only one discovery runs at a time. Added `targetIdToPageId` check as secondary guard.

### 8. Stale URL/Title in `listTabs()` (External Only)

**Symptom:** `browser_list_tabs` returned the original URL from when the tab was discovered, not the current URL after navigation.

**Fix:** Update stored `page.target.url` and `page.target.title` in three event handlers: `Target.targetInfoChanged`, `Page.frameNavigated`, and `Page.loadEventFired`.

### 9. Fragile 500ms Sleep in `openNewTab` (External Only)

**Symptom:** `openNewTab()` used `setTimeout(500)` to wait for target discovery. Too slow on fast machines, too fast on slow ones.

**Fix:** Replaced with `waitForTarget()` — polls `targetIdToPageId` every 50ms until the browser monitor's event handler populates it. Falls back to manual discovery at 5s timeout.

---

## Tool Reference

### All 15 Browser Tools

| Tool | Schema | Description |
|------|--------|-------------|
| `browser_open` | `{ url?, tabId?, newTab? }` | Open browser, focus tab, or create new tab |
| `browser_close` | `{ tabId? }` | Close specific tab, or ALL tabs if no tabId |
| `browser_navigate` | `{ url, tabId? }` | Navigate to URL |
| `browser_reload` | `{ ignoreCache?, tabId? }` | Reload page |
| `browser_screenshot` | `{ tabId? }` | Capture screenshot |
| `browser_action_input` | `{ action, coordinate?, text?, key?, tabId? }` | Click, type, scroll, etc. |
| `browser_execute_script` | `{ script, tabId? }` | Run JavaScript |
| `browser_inspect_element` | `{ selector, tabId? }` | CSS inspection (source-map or universal) |
| `browser_get_console_logs` | `{ types?, limit?, tabId? }` | Read console output |
| `browser_get_errors` | `{ limit?, tabId? }` | Read JS errors |
| `browser_get_network_requests` | `{ urlFilter?, method?, tabId? }` | Read network activity |
| `browser_get_performance` | `{ tabId? }` | Performance metrics |
| `browser_get_state` | `{ tabId? }` | Current URL, title, loading state |
| `browser_set_viewport` | `{ width?, height?, mobile?, tabId? }` | Change viewport size |
| `browser_list_tabs` | (none) | List all open tabs with tabId, URL, title, isActive |

All tools default to the **active tab** when `tabId` is omitted. All 15 tools work identically in both embedded and external modes.
