# Browser Communication Architecture

> **Purpose**: Define how the browser (BrowserView) communicates with the outside world (VSCode panels, AI agent, etc.) for inspect mode, element selection, key events, drag-drop, and future features.
>
> **Status**: ✅ **Phase 1 Implemented** - CDP-based inspect mode with event-driven element selection and key handling. No polling!

---

## Table of Contents

1. [Current State](#current-state)
2. [Available Communication Mechanisms](#available-communication-mechanisms)
   - CDP (Chrome DevTools Protocol)
   - `before-input-event` (Electron API)
   - CDP `Runtime.bindingCalled` (Recommended for Script Communication)
   - Script Injection (Legacy)
   - Electron Overlay
   - Preload + contextBridge
3. [What CDP Can and Cannot Do](#what-cdp-can-and-cannot-do)
4. [Recommended Architecture](#recommended-architecture)
5. [Migration Plan](#migration-plan)
6. [Future Features](#future-features)

---

## Current State

### What We Have Today (After Phase 1)

| Feature | Implementation | Mechanism | Status |
|---------|---------------|-----------|--------|
| Hover highlight (inspect) | Injected script | Custom overlay UI | ✅ Event-driven |
| Element click selection | `Runtime.bindingCalled` | CDP event via `__roopikBridge` | ✅ Event-driven |
| ESC key handling | `before-input-event` | Electron API | ✅ Event-driven |
| CSS style inspection | CDP | `CSS.getMatchedStylesForNode` | ✅ Event-driven |
| Click-to-source | Build-time attribute | `data-roopik-source` via Vite plugin | ✅ Works well |
| Open file in editor | CDP + IPC | Context menu → IPC event | ✅ Works well |
| Key press capture | `before-input-event` | Electron webContents event | ✅ Event-driven |

### What Changed (Phase 1 Migration)

| Old Approach | New Approach |
|-------------|--------------|
| Script injection for hover highlight | Unified inspect script with custom overlays |
| Polling `window.__roopikStyleInspectResult` | CDP `Runtime.bindingCalled` via `__roopikBridge` |
| Injected ESC key handler | Script notifies via `__roopikBridge` + `before-input-event` |
| 100ms polling loop | Event-driven (zero CPU waste) |

### Remaining Opportunities

1. **Drag-and-drop** - Still needs minimal injection (CDP has no drag events)
2. **AST tree sync** - Can use `DOM.documentUpdated` for real-time sync
3. **AI agent context** - Can use CDP for rich context extraction

---

## Available Communication Mechanisms

### 1. CDP (Chrome DevTools Protocol)

**What it is**: The protocol Chrome DevTools uses internally. We connect via Electron's debugger API.

**Direction**: Bidirectional (Main Process ↔ Browser)

```
┌─────────────────────────────────────────────────────────────┐
│  Main Process (Node.js)                                      │
│  browserView.webContents.debugger.sendCommand(...)          │
│  browserView.webContents.debugger.on('message', ...)        │
└─────────────────────────────────────────────────────────────┘
                         ↑↓ CDP
┌─────────────────────────────────────────────────────────────┐
│  BrowserView (Chromium)                                      │
│  - Receives commands                                        │
│  - Sends events                                             │
└─────────────────────────────────────────────────────────────┘
```

**Can do**:
- Read DOM tree (`DOM.getDocument`)
- Read/write styles (`CSS.getMatchedStylesForNode`, `CSS.setStyleTexts`)
- Highlight elements (`Overlay.highlightNode`)
- Enable inspect mode (`Overlay.setInspectMode`)
- Receive element selection events (`Overlay.inspectNodeRequested`)
- Execute JavaScript (`Runtime.evaluate`)
- Listen to DOM changes (`DOM.documentUpdated`)

**Cannot do**:
- Generate custom UI (no chat boxes, no custom toolbars)
- Capture drag events (no native drag event in CDP)
- Know source file locations (that's our `data-roopik-source`)


### 2. `before-input-event` (Electron API)

**What it is**: Electron event that fires BEFORE any keyboard input reaches the page.

**Direction**: Browser → Main Process (one-way, event-driven)

```
┌─────────────────────────────────────────────────────────────┐
│  User presses key                                            │
│         ↓                                                    │
│  Electron intercepts (before-input-event)  ← We catch here  │
│         ↓                                                    │
│  Key reaches page (if not prevented)                         │
└─────────────────────────────────────────────────────────────┘
```

**Can do**:
- Capture ALL key presses before page sees them
- Capture key combinations (Ctrl+S, Ctrl+Shift+P, etc.)
- Prevent keys from reaching page
- Works even if page is frozen

**Cannot do**:
- Capture mouse events (use CDP or injection for that)
- Generate UI


### 3. CDP Runtime.bindingCalled (Recommended for Script Communication)

**What it is**: CDP feature that creates a native binding on `window` object, allowing injected scripts to send events to main process without polling.

**Direction**: Bidirectional, event-driven

```
┌─────────────────────────────────────────────────────────────┐
│  Main Process (setup once)                                   │
│  debugger.sendCommand('Runtime.addBinding',                 │
│                        { name: '__roopikBridge' })          │
│  debugger.on('message', handler for 'Runtime.bindingCalled')│
└─────────────────────────────────────────────────────────────┘
                         ↓ Creates window.__roopikBridge()
┌─────────────────────────────────────────────────────────────┐
│  BrowserView (page context)                                  │
│  Injected script calls:                                     │
│  window.__roopikBridge(JSON.stringify({                     │
│    type: 'element-selected',                                │
│    selector: '...',                                         │
│    html: '...'                                              │
│  }))                                                        │
└─────────────────────────────────────────────────────────────┘
                         ↑ CDP Runtime.bindingCalled event (instant!)
┌─────────────────────────────────────────────────────────────┐
│  Main Process                                                │
│  Receives event with payload, forwards via IPC              │
└─────────────────────────────────────────────────────────────┘
```

**Can do**:
- Event-driven communication (NO polling!)
- Hidden from users (not visible in console)
- Full access to page DOM via injected script
- Custom overlays with our styling
- Handle any event (click, hover, drag, etc.)
- Read our `data-roopik-source` attributes

**This is what we use for inspect mode!**


### 4. Script Injection (`executeScript`) - Legacy

**What it is**: Running JavaScript code inside the webpage context.

**Direction**: Main Process → Browser (command), Browser → Main Process (via polling or console)

```
┌─────────────────────────────────────────────────────────────┐
│  Main Process                                                │
│  webContents.executeJavaScript(`...`)                       │
└─────────────────────────────────────────────────────────────┘
                         ↓ Inject
┌─────────────────────────────────────────────────────────────┐
│  BrowserView (page context)                                  │
│  - Script runs inside page                                  │
│  - Can access DOM, window, etc.                             │
│  - Sets window.__result = data                              │
└─────────────────────────────────────────────────────────────┘
                         ↑ Poll (BAD) or Console (leaks)
┌─────────────────────────────────────────────────────────────┐
│  Main Process                                                │
│  - Polls for window.__result every 100ms                    │
│  - OR listens to console-message (visible to user)          │
└─────────────────────────────────────────────────────────────┘
```

**Can do**:
- Full access to page DOM
- Create custom UI inside page
- Handle any event (click, drag, hover, etc.)
- Read our `data-roopik-source` attributes

**Drawbacks**:
- Visible in DevTools (unprofessional)
- Can conflict with page scripts
- Needs polling for communication (CPU waste) OR console.log (leaks to user)
- Needs cleanup on navigation

**Note**: Use CDP `Runtime.bindingCalled` instead for event-driven communication!


### 6. Electron Overlay (`createOverlayView`)

**What it is**: A separate WebContentsView positioned ON TOP of the browser. It's a different Electron view, not injection into the page.

**Direction**: Fully controlled by Main Process

```
┌─────────────────────────────────────────────────────────────┐
│  Electron Window                                             │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  BrowserView (webpage)                                  │ │
│  │  - User's page content                                  │ │
│  │  - NO injection                                         │ │
│  │                                                         │ │
│  │  ┌───────────────────────┐ ← Overlay (separate view)   │ │
│  │  │  Floating toolbar     │    Positioned on top         │ │
│  │  │  [Edit] [Delete] [AI] │    Transparent background    │ │
│  │  └───────────────────────┘                              │ │
│  │                                                         │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**Can do**:
- Show custom UI on top of browser (toolbar, menus)
- Fully controlled by us (HTML/CSS/JS we write)
- Not visible in page's DevTools
- Click-through to browser when needed

**Cannot do**:
- Interact with page content directly (it's a separate view)
- Know what element is under it (need CDP for that)

**We already have this**: `createOverlayView()` in browserViewService.ts


### 7. Preload + contextBridge (Electron API)

**What it is**: A script that runs before the page loads, creating a secure bridge for IPC.

**Direction**: Bidirectional (event-driven)

```
┌─────────────────────────────────────────────────────────────┐
│  Page JavaScript                                             │
│  window.roopikBridge.send('element-clicked', data)          │
└─────────────────────────────────────────────────────────────┘
                         ↓ contextBridge (secure)
┌─────────────────────────────────────────────────────────────┐
│  Preload Script                                              │
│  ipcRenderer.send('element-clicked', data)                  │
└─────────────────────────────────────────────────────────────┘
                         ↓ IPC
┌─────────────────────────────────────────────────────────────┐
│  Main Process                                                │
│  webContents.on('ipc-message', handler)                     │
└─────────────────────────────────────────────────────────────┘
```

**Can do**:
- Event-driven communication (no polling!)
- Secure (only exposes what we define)
- Works for any custom event

**Drawbacks**:
- Must be set at BrowserView creation time
- Still requires script in page context (though preload, not injection)
- More setup complexity

---

## What CDP Can and Cannot Do

### CDP CAN Do (Use These!)

| Capability | CDP Method | Use Case |
|------------|-----------|----------|
| Get DOM tree | `DOM.getDocument` | Build AST tree for panel |
| Find element by selector | `DOM.querySelector` | Locate elements |
| Get element info | `DOM.describeNode` | Get tag, attributes, etc. |
| Get computed styles | `CSS.getComputedStyleForNode` | Show in style panel |
| Get matched CSS rules | `CSS.getMatchedStylesForNode` | Show which CSS file |
| **Live edit styles** | `CSS.setStyleTexts` | Preview changes |
| **Highlight element** | `Overlay.highlightNode` | Hover effect |
| **Enable inspect mode** | `Overlay.setInspectMode` | Click-to-select |
| **Element selected event** | `Overlay.inspectNodeRequested` | Know what user clicked |
| Listen to DOM changes | `DOM.documentUpdated` | Keep AST in sync |
| Execute JavaScript | `Runtime.evaluate` | Read `data-roopik-source` |
| Take screenshot | `Page.captureScreenshot` | For AI context |

### CDP CANNOT Do (Need Other Solutions)

| Capability | Why Not | Alternative |
|------------|---------|-------------|
| Generate custom UI | CDP is protocol, not renderer | Electron Overlay |
| Show chat input box | Not a UI framework | Electron Overlay or VSCode panel |
| Capture drag events | No drag domain in CDP | Minimal script injection |
| Know source file location | CDP sees runtime DOM only | Our `data-roopik-source` attribute |
| Show floating toolbar | Not a UI framework | Electron Overlay |

---

## Recommended Architecture

### Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│  USER INTERACTION                                                        │
│  (keyboard, mouse, etc.)                                                │
└─────────────────────────────────────────────────────────────────────────┘
         │                    │                         │
         ▼                    ▼                         ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐
│ before-input-   │  │ CDP Overlay     │  │ Minimal Script (only when   │
│ event           │  │                 │  │ CDP can't do it)            │
│                 │  │                 │  │                             │
│ • All key press │  │ • Hover highlight│  │ • Read data-roopik-source  │
│ • Key combos    │  │ • Click select  │  │ • Drag events (future)     │
│ • Shortcuts     │  │ • Inspect mode  │  │                             │
└─────────────────┘  └─────────────────┘  └─────────────────────────────┘
         │                    │                         │
         └────────────────────┴─────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  MAIN PROCESS (BrowserViewService)                                       │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  Unified Event Emitter                                            │  │
│  │                                                                   │  │
│  │  onBrowserKeyEvent        ← from before-input-event              │  │
│  │  onElementSelected        ← from CDP Overlay.inspectNodeRequested│  │
│  │  onElementHover           ← from CDP (if needed)                 │  │
│  │  onDOMChanged             ← from CDP DOM.documentUpdated         │  │
│  │  onDragEvent              ← from minimal script (future)         │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                              │ IPC
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  RENDERER (editor.ts, panels, AI agent)                                  │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  browserService.onBrowserKeyEvent(...)                            │  │
│  │  browserService.onElementSelected(...)                            │  │
│  │  browserService.onDOMChanged(...)                                 │  │
│  │                                                                   │  │
│  │  → Update Style Panel                                             │  │
│  │  → Update AST Tree                                                │  │
│  │  → Send to AI Agent                                               │  │
│  │  → Handle shortcuts                                               │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### UI Layers

```
┌─────────────────────────────────────────────────────────────────────────┐
│  VSCode Window                                                           │
│  ┌────────────────────────────────────────────────────┬────────────────┐ │
│  │  Browser (WebContentsView)                         │ Style Panel    │ │
│  │  ┌────────────────────────────────────────────────┐│ (Native DOM)   │ │
│  │  │                                                ││                │ │
│  │  │  Webpage content                               ││ • AST Tree     │ │
│  │  │  (No injection visible)                        ││ • CSS Rules    │ │
│  │  │                                                ││ • Properties   │ │
│  │  │  ┌──────────────────┐ ← CDP Overlay highlight  ││                │ │
│  │  │  │ [Selected elem]  │   (not our code)         ││                │ │
│  │  │  └──────────────────┘                          ││                │ │
│  │  │                                                ││                │ │
│  │  │  ┌──────────────────┐ ← Electron Overlay       ││                │ │
│  │  │  │ [Edit] [AI] [x]  │   (our floating toolbar) ││                │ │
│  │  │  └──────────────────┘                          ││                │ │
│  │  │                                                ││                │ │
│  │  └────────────────────────────────────────────────┘│                │ │
│  ├────────────────────────────────────────────────────┴────────────────┤ │
│  │  Bottom Panel (Native DOM)                                          │ │
│  │  ┌────────────────────────────────────────────────────────────────┐ │ │
│  │  │ 💬 "Make this button larger" [Send]                            │ │ │
│  │  │ Context: <button class="btn"> from Button.tsx:15               │ │ │
│  │  └────────────────────────────────────────────────────────────────┘ │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘

Legend:
- CDP Overlay: Browser's native highlight (controlled via CDP, not our UI)
- Electron Overlay: Our custom UI (separate WebContentsView on top)
- Style Panel: VSCode native DOM panel (right side)
- Bottom Panel: VSCode native DOM panel (bottom)
```

---

## Migration Plan

### Phase 1: Replace Inspect Mode with CDP ✅ IMPLEMENTED

**Goal**: Remove runtime script injection for hover/select, use CDP instead.

| Old | New | Status |
|-----|-----|--------|
| Inject `STYLE_INSPECT_SCRIPT` | `Overlay.setInspectMode` | ✅ Done |
| Poll `window.__roopikStyleInspectResult` | Listen to `Overlay.inspectNodeRequested` | ✅ Done |
| Injected hover highlight | `Overlay.highlightNode` via CDP | ✅ Done |
| Injected ESC handler | `before-input-event` fires `onBrowserKeyEvent` | ✅ Done |

**Files changed**:
- `common/projectMode/types.ts` - Added `InspectElementSelectedEvent`, `BrowserKeyEvent`
- `common/projectMode/ipc.ts` - Added `onInspectElementSelected`, `onBrowserKeyEvent`, inspect mode methods
- `electron-main/projectMode/browserViewService.ts` - CDP inspect mode implementation
- `electron-main/projectMode/projectModeChannel.ts` - IPC channel handlers
- `browser/projectMode/serviceBridge.ts` - Service proxy for new methods
- `browser/projectMode/features/styleInspect.ts` - Event-driven approach, no polling

**Kept as-is**:
- `data-roopik-source` attribute (build-time, for click-to-source)
- CSS inspection (already CDP)


### Phase 2: Unified Event System

**Goal**: Single event bus for all browser → outside communication.

```typescript
// common/projectMode/browserEvents.ts

export type BrowserEventType =
  | 'element-selected'      // CDP: Overlay.inspectNodeRequested
  | 'element-hover'         // CDP: mouse tracking (optional)
  | 'key-press'             // Electron: before-input-event
  | 'dom-changed'           // CDP: DOM.documentUpdated
  | 'navigation'            // Already have: onNavigationStateChanged
  | 'drag-start'            // Future: minimal injection
  | 'drag-move'             // Future: minimal injection
  | 'drag-end';             // Future: minimal injection

export interface BrowserEvent<T = unknown> {
  type: BrowserEventType;
  browserViewId: number;
  timestamp: number;
  data: T;
}
```


### Phase 3: AST Tree Panel

**Goal**: Show component tree like Cursor does.

**Implementation**:
1. Use `DOM.getDocument({ depth: -1 })` to get full DOM tree
2. Transform to our AST format
3. Show in Style Panel (top section, collapsible tree)
4. Sync with `DOM.documentUpdated` events


### Phase 4: Floating Toolbar (Electron Overlay)

**Goal**: Show quick actions when element is selected.

**Implementation**:
1. Use existing `createOverlayView()`
2. Position near selected element
3. Buttons: Edit, Delete, AI Chat, etc.
4. Click actions → IPC to main process


### Phase 5: Bottom Panel Chat

**Goal**: AI-powered editing with context.

**Implementation**:
1. Native DOM panel (like Style Panel)
2. Shows selected element context
3. Chat input for AI instructions
4. Sends to AI agent with full context:
   - Element selector
   - Source location (`data-roopik-source`)
   - Current styles
   - AST context

---

## Future Features

### Drag-and-Drop Elements

**Challenge**: CDP doesn't have drag events.

**Solution**: Minimal script injection ONLY for drag:
```javascript
// Only inject this, nothing else
document.addEventListener('dragstart', (e) => {
  window.__roopikDragData = { /* minimal data */ };
});
```
Then use CDP `Runtime.evaluate` to read the data (no polling, just on-demand read).

**Alternative**: Use CDP Input domain to synthesize drag events (complex).


### Live Style Editing

**Already possible with CDP**:
```typescript
// Edit style live (preview)
await sendCDPCommand('CSS.setStyleTexts', {
  edits: [{
    styleSheetId: '...',
    range: { startLine: 10, startColumn: 0, endLine: 10, endColumn: 50 },
    text: 'color: red;'
  }]
});
```


### AI Agent Integration

**Flow**:
1. User selects element (CDP event)
2. Get context:
   - DOM info (CDP)
   - Source location (`data-roopik-source`)
   - Styles (CDP)
   - Screenshot (CDP)
3. User types instruction (Bottom Panel)
4. Send to AI with context
5. AI returns code changes
6. Apply to source files (for local projects)

---

## Summary Table

| Feature | Mechanism | Event-Driven? | Injection? |
|---------|-----------|---------------|------------|
| Hover highlight | Injected script (custom overlay) | N/A (visual only) | Runtime |
| Element selection | CDP `Runtime.bindingCalled` | ✅ Yes | Runtime (uses `__roopikBridge`) |
| Key press | `before-input-event` | ✅ Yes | No |
| CSS inspection | CDP `CSS.*` | ✅ Yes | No |
| Click-to-source | `data-roopik-source` | N/A (attribute) | Build-time only |
| AST tree | CDP `DOM.getDocument` | ✅ Yes (sync) | No |
| Floating toolbar | Electron Overlay | N/A (our UI) | No |
| Bottom panel | Native DOM | N/A (our UI) | No |
| Drag-drop | Minimal injection | Read on-demand | Minimal |
| Live edit preview | CDP `CSS.setStyleTexts` | N/A (command) | No |

---

## References

- [Chrome DevTools Protocol Documentation](https://chromedevtools.github.io/devtools-protocol/)
- [CDP Overlay Domain](https://chromedevtools.github.io/devtools-protocol/tot/Overlay/)
- [CDP DOM Domain](https://chromedevtools.github.io/devtools-protocol/tot/DOM/)
- [CDP CSS Domain](https://chromedevtools.github.io/devtools-protocol/tot/CSS/)
- [Electron webContents.debugger](https://www.electronjs.org/docs/latest/api/debugger)
- [Electron before-input-event](https://www.electronjs.org/docs/latest/api/web-contents#event-before-input-event)
