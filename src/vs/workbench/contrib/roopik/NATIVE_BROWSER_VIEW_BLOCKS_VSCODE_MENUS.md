# Native Browser View Blocks VSCode Menus

## Problem: WebContentsView Renders On Top of Everything

Roopik's browser preview uses Electron's `WebContentsView` - a native Chromium view that renders at the OS level. This creates a fundamental limitation:

**Native views ALWAYS render on top of HTML/CSS content.**

When VSCode opens menus, dialogs, or overlays (which are HTML-based), they appear BEHIND the browser view:

```
┌─────────────────────────────────────────┐
│  VSCode Window                          │
│  ┌───────────────────────────────────┐  │
│  │  Command Palette (HTML) ← HIDDEN! │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │                             │  │  │
│  │  │   WebContentsView (Native)  │  │  │  ← Always on top
│  │  │   Browser blocks everything │  │  │
│  │  │                             │  │  │
│  │  └─────────────────────────────┘  │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

## Solution: "Browsing Paused" Overlay

When UI elements open, we hide the native browser and show an HTML overlay:

1. **Detect** when menus/dialogs open
2. **Hide** WebContentsView via `setBrowserVisible(false)`
3. **Show** "Browsing Paused" overlay (HTML, renders correctly)
4. **Resume** when UI closes

```
┌─────────────────────────────────────────┐
│  VSCode Window                          │
│  ┌───────────────────────────────────┐  │
│  │  Command Palette (HTML) ← VISIBLE │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │                             │  │  │
│  │  │      ⏸ Browsing paused      │  │  │  ← HTML overlay
│  │  │                             │  │  │
│  │  └─────────────────────────────┘  │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

This is the same approach used by **Cursor IDE**.

## What's Detected

| UI Element | Detection Method | Status |
|------------|------------------|--------|
| Command Palette (Ctrl+Shift+P) | `IQuickInputService.onShow/onHide` | ✅ Working |
| Context Menus (right-click) | `IContextMenuService.onDidShow/HideContextMenu` | ✅ Working |
| Native Menu Bar (File, Edit...) | Needs main process IPC | ❌ Not implemented |

## Why Native Menu Bar Is Not Handled

The native Electron menu (File, Edit, View, Help...) is rendered by the **operating system**, not the renderer process. There are no JavaScript events when it opens/closes.

**To fix this would require:**
1. Modify `src/vs/platform/menubar/electron-main/menubar.ts` (main process)
2. Add `menu-will-show`/`menu-will-close` event handlers
3. Create IPC channel to broadcast to renderer
4. Subscribe in editor

**Why we skip this:**
- Touches core VSCode infrastructure
- High risk of rebase conflicts
- Edge case (most users use keyboard shortcuts)
- Command palette covers most use cases

## Implementation

### Files
- [projectModeV2Editor.ts](browser/projectModeV2/projectModeV2Editor.ts) - `setupBrowserPauseDetection()`

### Key Code
```typescript
private setupBrowserPauseDetection(): void {
    // Command Palette
    this._register(this.quickInputService.onShow(() => this.pauseBrowser()));
    this._register(this.quickInputService.onHide(() => this.resumeBrowser()));

    // Context Menus
    this._register(this.contextMenuService.onDidShowContextMenu(() => this.pauseBrowser()));
    this._register(this.contextMenuService.onDidHideContextMenu(() => this.resumeBrowser()));
}

private pauseBrowser(): void {
    this.browserService.setBrowserVisible(this.browserViewId, false);
    this.showPausedOverlay();
}

private resumeBrowser(): void {
    this.hidePausedOverlay();
    this.browserService.setBrowserVisible(this.browserViewId, true);
}
```

## Why Not Pause on Window Blur?

We initially tried `IHostService.onDidChangeFocus` to pause when window loses focus. **Removed because:**

- Alt-Tab: Users want to see browser while switching apps
- Clicking outside: Browser should stay visible
- Native menus don't blur: On Windows, native menus don't trigger blur events

## Technical Background

### Why WebContentsView?
- Real Chromium browser (not iframe)
- Full DevTools support
- Native performance
- Proper cookie/session handling

### Why It Blocks HTML
- WebContentsView is a native OS window/surface
- Electron composites it on top of the renderer
- No CSS z-index can override native layer ordering
- This is an Electron/Chromium architectural limitation
