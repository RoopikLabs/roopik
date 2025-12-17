# Centralized Browser Key Handling

> **Architecture document for event-driven key handling from BrowserView**

## Overview

All key presses from the BrowserView (browser preview) are intercepted at the Electron main process level and forwarded to the renderer via IPC events. This provides a single point of control for keyboard shortcuts and key-based interactions.

## Why Centralized Key Handling?

### Problem: Scattered Key Listeners

Before centralization, key handling was scattered across:
- Injected scripts in BrowserView (e.g., ESC to exit inspect mode)
- DOM listeners in UI panels (e.g., ESC to close style panel)
- Various feature modules

This caused issues:
1. **Race conditions**: Multiple listeners fighting for the same key
2. **Inconsistent behavior**: ESC might exit inspect mode but not close the panel
3. **Hard to extend**: Adding new shortcuts required changes in multiple places
4. **Hard to debug**: Key events could be swallowed by one listener before reaching another

### Solution: Single Event Pipeline

```
┌─────────────────────────────────────────────────────────────────────┐
│  BrowserView (Chromium)                                             │
│  User presses key                                                   │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Electron Main Process                                              │
│  before-input-event interceptor                                     │
│  (browserViewService.ts → setupZoomHandlers)                        │
│                                                                     │
│  Captures: key, code, modifiers (ctrl/alt/shift/meta), type         │
│  Fires: _onBrowserKeyPress.fire({ browserViewId, key, ... })        │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ IPC Event
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  IPC Channel (projectModeChannel.ts)                                │
│  Routes 'onBrowserKeyPress' event to renderer                       │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Renderer Process (serviceBridge.ts)                                │
│  Exposes: onBrowserKeyPress event                                   │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Central Key Handler (editor.ts)                                    │
│  setupBrowserKeyHandler() → handleBrowserKey()                      │
│                                                                     │
│  • Filters by browserViewId (only handles keys for this instance)   │
│  • Dispatches to feature handlers based on key                      │
│  • Single place to add new keyboard shortcuts                       │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
              ┌──────────┐   ┌──────────┐   ┌──────────┐
              │  ESC     │   │  F5      │   │ Ctrl+R   │
              │  Handler │   │  Handler │   │ Handler  │
              │          │   │ (future) │   │ (future) │
              └──────────┘   └──────────┘   └──────────┘
                    │
                    ▼
        ┌─────────────────────┐
        │ • Exit inspect mode │
        │ • Close style panel │
        │ • Update button UI  │
        └─────────────────────┘
```

## File Structure

```
src/vs/workbench/contrib/roopik/
├── common/projectMode/
│   ├── types.ts                 # BrowserKeyEvent interface
│   └── ipc.ts                   # onBrowserKeyPress event declaration
│
├── electron-main/projectMode/
│   ├── browserViewService.ts    # Key interception (before-input-event)
│   └── projectModeChannel.ts    # IPC event routing
│
└── browser/projectMode/
    ├── serviceBridge.ts         # IPC event listener
    └── editor.ts                # Central key handler
```

## Key Files and Their Roles

### 1. `types.ts` - Event Type Definition

```typescript
export interface BrowserKeyEvent {
  browserViewId: number;
  key: string;           // e.g., 'Escape', 'F12', 'a'
  code: string;          // e.g., 'Escape', 'F12', 'KeyA'
  modifiers: {
    ctrl: boolean;
    alt: boolean;
    shift: boolean;
    meta: boolean;       // Cmd on Mac, Win on Windows
  };
  type: 'keyDown' | 'keyUp';
}
```

### 2. `browserViewService.ts` - Main Process Interceptor

```typescript
private setupZoomHandlers(browserView: WebContentsView): void {
  const wc = browserView.webContents;
  const browserViewId = wc.id;

  wc.on('before-input-event', (event, input) => {
    // Forward ALL key events to renderer
    if (input.type === 'keyDown' || input.type === 'keyUp') {
      this._onBrowserKeyPress.fire({
        browserViewId,
        key: input.key,
        code: input.code,
        modifiers: {
          ctrl: input.control,
          alt: input.alt,
          shift: input.shift,
          meta: input.meta
        },
        type: input.type
      });
    }

    // Local handling for zoom shortcuts (affects webContents directly)
    // Ctrl++, Ctrl+-, Ctrl+0
  });
}
```

### 3. `editor.ts` - Central Key Handler

```typescript
private setupBrowserKeyHandler(): void {
  this._register(this.browserService.onBrowserKeyPress((event) => {
    // Filter by browserViewId
    if (event.browserViewId !== this.browserViewId) {
      return;
    }

    // Only handle keyDown
    if (event.type !== 'keyDown') {
      return;
    }

    this.handleBrowserKey(event.key, event.code, event.modifiers);
  }));
}

private handleBrowserKey(key: string, code: string, modifiers: Modifiers): void {
  if (key === 'Escape') {
    this.handleEscapeKey();
    return;
  }

  // Add more key handlers here...
}

private handleEscapeKey(): void {
  // Exit inspect mode if active
  if (this.inspectMode.getIsActive()) {
    if (this.browserViewId) {
      this.inspectMode.disable(this.browserViewId);
    }
    this.controlBar?.setInspectModeActive(false);
  }

  // Close style panel if visible
  if (this.styleInspect.isPanelVisible()) {
    this.styleInspect.hidePanel();
  }
}
```

## Adding New Keyboard Shortcuts

To add a new keyboard shortcut (e.g., F5 for refresh):

### Step 1: Add Handler in `editor.ts`

```typescript
private handleBrowserKey(key: string, code: string, modifiers: Modifiers): void {
  if (key === 'Escape') {
    this.handleEscapeKey();
    return;
  }

  // NEW: F5 for refresh
  if (key === 'F5') {
    this.handleRefresh(modifiers.shift); // Shift+F5 = hard refresh
    return;
  }

  // NEW: Ctrl+Shift+C for toggle inspect mode
  if (key === 'c' && modifiers.ctrl && modifiers.shift) {
    this.toggleInspectMode();
    return;
  }
}

private handleRefresh(hardRefresh: boolean): void {
  if (this.browserViewId) {
    this.browserService.reload(this.browserViewId, hardRefresh);
  }
}
```

That's it! No changes needed in main process or IPC layer.

## Current Key Bindings

| Key | Action |
|-----|--------|
| ESC | Exit inspect mode + close style panel |
| Ctrl++ | Zoom in (handled locally in main process) |
| Ctrl+- | Zoom out (handled locally in main process) |
| Ctrl+0 | Reset zoom (handled locally in main process) |

## Future Key Bindings (Planned)

| Key | Action |
|-----|--------|
| F5 | Refresh page |
| Shift+F5 | Hard refresh (clear cache) |
| Ctrl+Shift+C | Toggle inspect mode |
| Ctrl+Shift+I | Toggle DevTools |
| Ctrl+R | Refresh page |
| Ctrl+Shift+R | Hard refresh |

## Design Decisions

### Why `before-input-event` instead of DOM listeners?

1. **Reliability**: Captures keys before page JavaScript can intercept them
2. **Consistency**: Works regardless of page content or focus state
3. **No injection**: No need to inject key listeners into every page
4. **Security**: Page scripts can't block or modify our key handling

### Why IPC instead of direct handling in main process?

1. **Separation of concerns**: Main process doesn't know about UI state
2. **Flexibility**: Renderer can decide what to do based on current context
3. **Testability**: Can mock events for testing
4. **Extensibility**: Easy to add new handlers without touching main process

### Why filter by `browserViewId`?

Multiple browser previews can exist (e.g., multiple editor tabs). Each editor instance should only handle keys from its own BrowserView.

## Troubleshooting

### Keys not being captured

1. Check that `browserViewId` matches between event and handler
2. Verify `before-input-event` listener is attached in `setupZoomHandlers`
3. Check IPC channel routing in `projectModeChannel.ts`

### Key handled but nothing happens

1. Verify the feature state (e.g., `inspectMode.getIsActive()`)
2. Check that the action method is being called
3. Look for errors in DevTools console

### Key handled multiple times

1. Check for duplicate event subscriptions
2. Verify `_register()` is used for proper disposal
3. Ensure `browserViewId` filter is working

## Related Documentation

- [Browser Communication Architecture](./BROWSER_COMMUNICATION_ARCHITECTURE.md)
- [CDP Inspect Mode Requirements](./CDP_INSPECT_MODE_REQUIREMENTS.md)
