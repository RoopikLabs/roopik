# Roopik Communication Architecture

> **How different layers communicate in Roopik's browser preview system**

This document explains the communication strategies between all layers of Roopik's ProjectMode (browser preview). Understanding this is essential for extending features or debugging issues.

---

## Quick Concept: IPC Channels

### The Problem

VSCode (Electron) has **two separate processes** that cannot directly call each other:

| Process | Runtime | Has Access To |
|---------|---------|---------------|
| **Main Process** | Node.js | File system, Electron APIs, BrowserView, native modules |
| **Renderer Process** | Chromium | DOM, VSCode UI, Monaco Editor |

**They cannot share memory or call functions directly.**

### The Solution: IPC Channels

IPC (Inter-Process Communication) Channels are **named message pipes** that allow cross-process communication.

```
┌─────────────────────────────────────────────────────────────────┐
│  RENDERER PROCESS (browser/)                                    │
│                                                                 │
│  DevServerBridge ─────── uses ───────► IChannel                 │
│  (client proxy)                        (VSCode's IPC client)    │
│                                                                 │
│  channel.call('startServer', args)  ◄── method calls            │
│  channel.listen('onLog')            ◄── event subscriptions     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │  IPC (serialized messages)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  MAIN PROCESS (electron-main/)                                  │
│                                                                 │
│  DevServerChannel ──── wraps ────► DevServerService             │
│  (IServerChannel)                  (actual implementation)      │
│                                                                 │
│  call('startServer') → service.startServer()                    │
│  listen('onLog')     → service.onLog                            │
└─────────────────────────────────────────────────────────────────┘
```

### How Channels Are Registered (app.ts)

```typescript
// 1. Create the actual service (runs in main process)
const devServerService = new DevServerService();

// 2. Create the channel (routes IPC calls to service)
const devServerChannel = new DevServerChannel(devServerService);

// 3. Register with a unique name so renderer can find it
mainProcessElectronServer.registerChannel(DEV_SERVER_CHANNEL, devServerChannel);
// DEV_SERVER_CHANNEL = 'roopik.devServer'
```

### How Renderer Uses Channels (editor.ts)

```typescript
// 1. Get the channel by name
const channel = mainProcessService.getChannel(DEV_SERVER_CHANNEL);

// 2. Create bridge that uses the channel
this.devServerService = new DevServerBridge(channel);

// 3. Now calls go through IPC automatically
await this.devServerService.startServer({...}); // → IPC → main process
```

### Our Two Main Channels

| Channel Name | Constant | Purpose |
|--------------|----------|---------|
| `roopik.projectMode` | `PROJECT_MODE_CHANNEL` | BrowserView management (create, navigate, DevTools, CDP) |
| `roopik.devServer` | `DEV_SERVER_CHANNEL` | Vite dev server lifecycle (start, stop, logs, status) |

### Channel Components

Each channel requires these files:

| File | Location | Purpose |
|------|----------|---------|
| **Interface** | `common/` | TypeScript interface defining methods & events |
| **Service** | `electron-main/` | Actual implementation (runs in main process) |
| **Channel** | `electron-main/` | IPC router (maps calls to service methods) |
| **Bridge** | `browser/` | Client proxy (renderer uses this) |

---

## Layer Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        RENDERER PROCESS                                  │
│  (VSCode Window - Chromium Renderer)                                    │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  Editor.ts (EditorPane)                                           │   │
│  │  - UI components (BrowserControlBar, ActionBar)                   │   │
│  │  - Feature classes (InspectMode, Bookmarks, BrowserPause)         │   │
│  │  - ServiceBridge (IPC proxy)                                      │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                              │                                           │
│                              │ IPC Channel                               │
│                              │ (roopikProjectMode)                       │
└──────────────────────────────┼──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         MAIN PROCESS                                     │
│  (Node.js - Electron Main)                                              │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  BrowserViewService                                               │   │
│  │  - Manages WebContentsView lifecycle                              │   │
│  │  - Handles navigation, DevTools, CDP                              │   │
│  │  - Creates/destroys overlay views                                 │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                              │                                           │
│                              │ WebContentsView                           │
│                              │ (Electron Native)                         │
└──────────────────────────────┼──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     BROWSER PAGE (WebContentsView)                       │
│  (Chromium - Isolated Renderer Process)                                 │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  User's Web Page (e.g., localhost:5173)                           │   │
│  │  - React/Vue/etc application                                      │   │
│  │  - Injected scripts (inspect mode, etc.)                          │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                     OVERLAY VIEW (WebContentsView)                       │
│  (Chromium - Separate Renderer Process)                                 │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  Action Bar (bottomActionBar.ts)                                  │   │
│  │  - Floating toolbar rendered ON TOP of browser                    │   │
│  │  - Transparent background, only UI elements visible               │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Communication Strategies

### 1. Editor ↔ Main Process (IPC Channel)

**Technology**: Electron IPC via VSCode's `IChannel` abstraction

**Files**:
- `serviceBridge.ts` (renderer-side proxy)
- `browserViewService.ts` (main process implementation)
- `projectModeChannel.ts` (IPC router)
- `ipc.ts` (interface definitions)

**Pattern**: Request/Response + Events

```typescript
// RENDERER → MAIN (Request)
// serviceBridge.ts
async navigate(browserViewId: number, url: string): Promise<void> {
    return this.channel.call('navigate', { browserViewId, url });
}

// MAIN → RENDERER (Events)
// browserViewService.ts
this._onNavigationStateChanged.fire({
    browserViewId,
    url: webContents.getURL(),
    title: webContents.getTitle(),
    isLoading: false,
    ...
});

// serviceBridge.ts (subscribes)
this.onNavigationStateChanged = this.channel.listen<NavigationStateChangedEvent>('onNavigationStateChanged');
```

**Why IPC?**
- ✅ Type-safe with TypeScript interfaces
- ✅ Async/await support
- ✅ Built into VSCode's architecture
- ✅ Event-driven (no polling)
- ✅ Process isolation (security)

---

### 2. Main Process ↔ Browser Page (executeScript)

**Technology**: Electron's `webContents.executeJavaScript()`

**Files**:
- `browserViewService.ts` (executeScript method)
- `inspectMode.ts` (inject inspect mode script)

**Pattern**: Fire-and-forget OR Query-response

```typescript
// INJECT SCRIPT (Fire-and-forget)
// inspectMode.ts
await this.browserService.executeScript(browserViewId, INSPECT_MODE_SCRIPT);

// QUERY DATA (Request/Response)
// inspectMode.ts
const html = await this.browserService.executeScript(
    browserViewId,
    'window.__roopikLastInspectedHtml || null'
);
```

**Why executeScript?**
- ✅ **Bi-directional**: Returns result from page to main process
- ✅ **Native Electron API**: No custom messaging layer
- ✅ **Synchronous feel**: async/await, no callbacks
- ✅ **No console pollution**: Unlike console.log bridge
- ✅ **On-demand**: Query when needed, not broadcast constantly

**Anti-pattern we REMOVED**:
```typescript
// ❌ OLD: Console.log bridge (REMOVED)
// Page would broadcast: console.log('[ROOPIK_MSG]' + JSON.stringify({type, data}))
// Main process would listen: webContents.on('console-message', ...)
// Problems: Console pollution, parsing overhead, always broadcasting
```

---

### 3. Main Process ↔ Overlay View (executeScriptOnOverlay)

**Technology**: Same as browser page - `webContents.executeJavaScript()`

**Files**:
- `browserViewService.ts` (executeScriptOnOverlay method)
- `bottomActionBar.ts` (HTML content with inline JS)

**Pattern**: Query overlay state on-demand

```typescript
// QUERY OVERLAY STATE
const state = await this.browserService.executeScriptOnOverlay(
    overlayViewId,
    'window.getActionBarState()'
);

// SET OVERLAY STATE
await this.browserService.executeScriptOnOverlay(
    overlayViewId,
    `window.setActiveMode('${mode}')`
);
```

**Why separate overlay view?**
- ✅ Renders ON TOP of browser (native z-ordering)
- ✅ Transparent background (only UI visible)
- ✅ Independent from page content (no DOM conflicts)
- ✅ Can't be affected by page CSS/JS

---

### 4. Injected Scripts in Browser Page

**Technology**: JavaScript injection via executeScript

**Files**:
- `inspectMode.ts` (INSPECT_MODE_SCRIPT)

**Pattern**: Self-contained scripts with cleanup

```typescript
const INSPECT_MODE_SCRIPT = `
(function() {
    // 1. Cleanup any existing instance
    if (window.__roopikInspectCleanup) {
        window.__roopikInspectCleanup();
    }

    // 2. Create UI elements (overlay, label, toast)
    const overlay = document.createElement('div');
    // ... style and append

    // 3. Setup event handlers (capture phase)
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('click', onClick, true);
    // ...

    // 4. Cleanup function (exposed globally)
    function cleanup() {
        document.removeEventListener('mousemove', onMouseMove, true);
        // ... remove all listeners and elements
        delete window.__roopikInspectCleanup;
    }

    window.__roopikInspectCleanup = cleanup;

    // 5. Store data for later retrieval
    window.__roopikLastInspectedHtml = html;

    return 'Inspect mode enabled';
})();
`;
```

**Key principles**:
- ✅ **IIFE**: Immediately invoked, no global pollution
- ✅ **Cleanup function**: Exposed globally for re-injection safety
- ✅ **Capture phase**: `addEventListener(..., true)` to intercept before page
- ✅ **Data storage**: Use `window.__roopik*` for later retrieval
- ✅ **Return value**: Confirms successful injection

---

### 5. Native Electron Events (Main Process)

**Technology**: Electron's webContents events

**Files**:
- `browserViewService.ts` (setupBrowserEvents)

**Pattern**: Listen to native events, fire to renderer

```typescript
// NAVIGATION EVENTS
webContents.on('did-navigate', () => {
    this.fireNavigationStateChanged(browserViewId);
});

webContents.on('did-start-loading', () => {
    this.fireNavigationStateChanged(browserViewId, true); // isLoading = true
});

webContents.on('did-stop-loading', () => {
    this.fireNavigationStateChanged(browserViewId, false); // isLoading = false
});

// DEVTOOLS EVENTS
webContents.on('devtools-closed', () => {
    this._onDevToolsClosed.fire({ browserViewId });
});
```

**Why native events?**
- ✅ **No polling**: Events fire when state changes
- ✅ **Reliable**: Electron guarantees delivery
- ✅ **Efficient**: No CPU wasted checking state

---

## Communication Flow Examples

### Example 1: User Navigates to URL

```
User types URL → BrowserControlBar
                      │
                      ▼
              Editor.navigate(url)
                      │
                      ▼ IPC call
              ServiceBridge.navigate()
                      │
                      ▼
              BrowserViewService.navigate()
                      │
                      ▼
              webContents.loadURL(url)
                      │
                      ▼ Native event
              'did-navigate' fires
                      │
                      ▼
              fireNavigationStateChanged()
                      │
                      ▼ IPC event
              onNavigationStateChanged
                      │
                      ▼
              Editor updates UI (URL bar, title, etc.)
```

### Example 2: Inspect Mode

```
User clicks Inspect button
              │
              ▼
       Editor.enableInspectMode()
              │
              ▼
       InspectMode.enable()
              │
              ▼ IPC call
       executeScript(INSPECT_MODE_SCRIPT)
              │
              ▼
       Script injects into page
       (overlay, event handlers)
              │
              ▼
       User hovers/clicks element
              │
              ▼
       Script copies to clipboard
       Script stores in window.__roopikLastInspectedHtml
       Script auto-cleans up
              │
              ▼ (Later, if needed)
       executeScript('window.__roopikLastInspectedHtml')
              │
              ▼
       Returns HTML to editor
```

### Example 3: Action Bar Interaction

```
User clicks Edit Mode toggle
              │
              ▼
       Editor.toggleEditModeToolbar(true)
              │
              ▼
       ActionBar.create() or .show()
              │
              ▼ IPC call
       createOverlayView(bounds, htmlContent)
              │
              ▼
       Main process creates WebContentsView
       Loads HTML content
       Positions on top of browser
              │
              ▼
       User interacts with action bar
              │
              ▼ (When editor needs state)
       executeScriptOnOverlay('getState()')
              │
              ▼
       Returns state to editor
```

---

## Why These Strategies?

### Why IPC (not direct calls)?

| Approach | Pros | Cons |
|----------|------|------|
| **IPC Channel** | Type-safe, async, events | Slight overhead |
| Direct calls | Fast | Can't cross process boundary |

**Decision**: IPC is required because renderer and main are separate processes.

### Why executeScript (not console.log bridge)?

| Approach | Pros | Cons |
|----------|------|------|
| **executeScript** | Native, bi-directional, clean | None significant |
| console.log bridge | Works | Console pollution, parsing overhead, always broadcasting |
| PostMessage | Standard | Needs listener setup, more boilerplate |

**Decision**: executeScript is Electron's native solution, returns values directly, no console pollution.

### Why Overlay WebContentsView (not DOM injection)?

| Approach | Pros | Cons |
|----------|------|------|
| **Overlay WebContentsView** | Renders on top, isolated, transparent | More resources |
| DOM injection in page | Lighter | Can be affected by page CSS/JS, z-index wars |
| Shadow DOM | CSS isolation | Still in page's DOM, still z-index issues |

**Decision**: WebContentsView overlays render natively on top of the browser view, completely isolated from page content.

### Why Native Events (not polling)?

| Approach | Pros | Cons |
|----------|------|------|
| **Native events** | Efficient, immediate | None |
| Polling | Simple | CPU waste, delayed updates |

**Decision**: Native Electron events are always preferred. We removed all polling in favor of events.

---

## Adding New Communication

### To add a new IPC method:

1. Add to `ipc.ts` (interface):
```typescript
myNewMethod(param: string): Promise<Result>;
```

2. Add to `serviceBridge.ts` (renderer proxy):
```typescript
async myNewMethod(param: string): Promise<Result> {
    return this.channel.call('myNewMethod', param);
}
```

3. Add to `browserViewService.ts` (implementation):
```typescript
async myNewMethod(param: string): Promise<Result> {
    // Implementation
}
```

4. Add to `projectModeChannel.ts` (router):
```typescript
case 'myNewMethod':
    return this.service.myNewMethod(arg);
```

### To add a new event:

1. Add to `types.ts`:
```typescript
export interface MyNewEvent {
    browserViewId: number;
    data: string;
}
```

2. Add emitter to `browserViewService.ts`:
```typescript
private readonly _onMyNewEvent = new Emitter<MyNewEvent>();
readonly onMyNewEvent: Event<MyNewEvent> = this._onMyNewEvent.event;
```

3. Add to `ipc.ts`:
```typescript
readonly onMyNewEvent: Event<MyNewEvent>;
```

4. Add to `serviceBridge.ts`:
```typescript
readonly onMyNewEvent: Event<MyNewEvent>;
// In constructor:
this.onMyNewEvent = this.channel.listen<MyNewEvent>('onMyNewEvent');
```

5. Add to `projectModeChannel.ts`:
```typescript
case 'onMyNewEvent':
    return this.service.onMyNewEvent;
```

### To inject a new script:

```typescript
const MY_SCRIPT = `
(function() {
    // Cleanup existing
    if (window.__roopikMyFeatureCleanup) {
        window.__roopikMyFeatureCleanup();
    }

    // Your feature code...

    // Cleanup function
    function cleanup() {
        // Remove listeners, elements
        delete window.__roopikMyFeatureCleanup;
    }
    window.__roopikMyFeatureCleanup = cleanup;

    // Store data for retrieval
    window.__roopikMyFeatureData = { ... };

    return 'Feature enabled';
})();
`;

// Inject
await browserService.executeScript(browserViewId, MY_SCRIPT);

// Query later
const data = await browserService.executeScript(browserViewId, 'window.__roopikMyFeatureData');
```

---

## Summary

| Layer | Technology | Direction |
|-------|-----------|-----------|
| Editor ↔ Main | IPC Channel | Bidirectional (calls + events) |
| Main ↔ Browser Page | executeScript | Bidirectional (inject + query) |
| Main ↔ Overlay | executeScriptOnOverlay | Bidirectional (inject + query) |
| Within Main | Native Electron events | One-way (webContents → service) |

**Philosophy**:
- **Event-driven**: No polling, react to changes
- **On-demand queries**: Ask when needed, don't broadcast constantly
- **Fire-and-forget**: Inject scripts that handle their own lifecycle
- **Clean separation**: Each layer has clear responsibilities

---

*Last updated: November 2024*
