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
| Custom Menu Bar (File, Edit...) | `IMenubarStateService` via `ITitleService.onMenubarFocusStateChange` | ✅ Working |

## Custom Menu Bar Detection

On Windows and Linux with custom titlebar (`"window.titleBarStyle": "custom"`), VSCode renders an **HTML-based menubar** instead of the native OS menu. This menubar is implemented in `MenuBar` class (`base/browser/ui/menu/menubar.ts`).

**Our solution:** Listen to the `onFocusStateChange` event from the custom menubar:

1. `MenuBar` class fires `onFocusStateChange(true)` when a menu opens
2. `MenubarControl` in titlebar forwards this as `onFocusStateChange`
3. `BrowserTitlebarPart` exposes `onMenubarFocusStateChange` event
4. `IMenubarStateService` listens to `ITitleService.onMenubarFocusStateChange`
5. `editor.ts` subscribes to `IMenubarStateService.onDidOpenMenu/onDidCloseMenu`

## Implementation

### Files
- [titlebarPart.ts](../../../../browser/parts/titlebar/titlebarPart.ts) - `ITitlebarPart.onMenubarFocusStateChange` event
- [menubarStateService.ts](../../../../services/menubar/electron-browser/menubarStateService.ts) - Listens to ITitleService
- [editor.ts](browser/projectMode/editor.ts) - `setupBrowserPauseDetection()`

### Key Code

**Titlebar Part (titlebarPart.ts):**
```typescript
export interface ITitlebarPart extends IDisposable {
    readonly onMenubarVisibilityChange: Event<boolean>;
    readonly onMenubarFocusStateChange: Event<boolean>;  // <-- New event
    // ...
}

// In BrowserTitlebarPart.installMenubar():
this._register(this.customMenubar.value.onFocusStateChange(focused =>
    this._onMenubarFocusStateChange.fire(focused)
));
```

**MenubarStateService (menubarStateService.ts):**
```typescript
constructor(@ITitleService private readonly titleService: ITitleService) {
    this._register(this.titleService.onMenubarFocusStateChange(focused => {
        if (focused) {
            this._onDidOpenMenu.fire();
        } else {
            this._onDidCloseMenu.fire();
        }
    }));
}
```

**Editor (editor.ts):**
```typescript
private setupBrowserPauseDetection(): void {
    // Command Palette
    this._register(this.quickInputService.onShow(() => this.pauseBrowser()));
    this._register(this.quickInputService.onHide(() => this.resumeBrowser()));

    // Context Menus
    this._register(this.contextMenuService.onDidShowContextMenu(() => this.pauseBrowser()));
    this._register(this.contextMenuService.onDidHideContextMenu(() => this.resumeBrowser()));

    // Custom Menu Bar
    this._register(this.menubarStateService.onDidOpenMenu(() => this.pauseBrowser()));
    this._register(this.menubarStateService.onDidCloseMenu(() => this.resumeBrowser()));
}
```

## Why Not Use Native Menu Events (IPC)?

We initially tried hooking into Electron's native menu events (`menu-will-show`/`menu-will-close`) and broadcasting via IPC. **This approach was abandoned because:**

1. **Windows uses custom menubar**: On Windows with custom titlebar, VSCode uses an HTML-based menubar, not native Electron menus
2. **Electron limitation**: The `menu-will-show`/`menu-will-close` events only fire for **submenus**, not top-level menu clicks
3. **Simpler approach**: Using the existing `onFocusStateChange` event from the custom menubar is cleaner and doesn't require IPC

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
