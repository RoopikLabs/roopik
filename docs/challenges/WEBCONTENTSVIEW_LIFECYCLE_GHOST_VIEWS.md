# WebContentsView Lifecycle: The Ghost Browser View Problem

## The Problem

When using Electron's `WebContentsView` for embedded browser previews, the view persists as a "ghost" even after:
- Closing the editor tab
- Reloading the IDE (Ctrl+Shift+P → Reload Window)
- The parent container is destroyed

The ghost view:
- Floats above all IDE UI elements
- Has highest z-index (native OS window)
- Cannot be interacted with or dismissed
- Blocks access to IDE menus and panels

## Root Cause

**Electron's Multi-Process Architecture:**

```
┌─────────────────────────────────────────┐
│          Main Process (Node.js)         │
│  - WebContentsView lives here           │
│  - NEVER stops running                  │
│  - Has no knowledge of renderer state   │
└─────────────────────────────────────────┘
                    │
                    │ IPC
                    │
┌─────────────────────────────────────────┐
│        Renderer Process (Chromium)      │
│  - VS Code UI lives here                │
│  - Dies and restarts on reload          │
│  - Cannot directly kill Main Process    │
└─────────────────────────────────────────┘
```

When you reload the IDE:
1. Renderer process dies
2. Main process keeps running (by design - for stability)
3. Main process has no idea the renderer "died"
4. WebContentsView remains attached to the BrowserWindow
5. Ghost view appears

**This is NOT a bug - it's a trade-off for stability.** If your renderer crashes, background processes (like music) keep playing.

## Failed Attempts

### Attempt 1: Dispose in Editor
```typescript
override dispose(): void {
    this.browserService.destroyBrowserView(this.browserViewId);
    super.dispose();
}
```
**Result:** Works for tab close, but `dispose()` is never called on reload.

### Attempt 2: beforeunload listener
```typescript
window.addEventListener('beforeunload', () => {
    this.browserService.destroyBrowserView(this.browserViewId);
});
```
**Result:** Inconsistent - sometimes fires, sometimes doesn't.

### Attempt 3: Multiple lifecycle events
```typescript
window.webContents.on('did-start-navigation', onCleanup);
window.webContents.on('render-process-gone', onCleanup);
window.webContents.once('destroyed', onCleanup);
```
**Result:** Still inconsistent - events fire after the view is already orphaned.

## The Solution: The Safety Leash

The key insight: **`did-start-loading` fires the MILLISECOND the reload starts**, before the new UI is ready.

```typescript
private attachSafetyLeash(window: BrowserWindow, browserViewId: number): void {
    const autoDestruct = () => {
        console.log(`[ProjectModeV2] SAFETY LEASH TRIGGERED`);
        this.destroyBrowserViewSync(browserViewId);
    };

    // KEY EVENT: Fires immediately on reload
    window.webContents.once('did-start-loading', () => {
        console.log(`[ProjectModeV2] Window did-start-loading -> triggering safety leash`);
        autoDestruct();
    });

    // Backup: Window closed
    window.once('closed', () => {
        autoDestruct();
    });

    // Backup: Renderer crashed
    window.webContents.once('render-process-gone', (_event, details) => {
        autoDestruct();
    });

    // Backup: WebContents destroyed
    window.webContents.once('destroyed', () => {
        autoDestruct();
    });
}
```

### Why `did-start-loading`?

| Event | When it fires | Reliability |
|-------|--------------|-------------|
| `beforeunload` | Before page unload | Inconsistent |
| `did-start-navigation` | After navigation starts | Too late |
| `render-process-gone` | After renderer dies | Sometimes too late |
| **`did-start-loading`** | **Millisecond reload starts** | **Most reliable** |

## The Three Rules of View Management

Every Electron app with embedded views must implement:

1. **The Registry** - Track all active views
   ```typescript
   private browserViews = new Map<number, WebContentsView>();
   ```

2. **The Kill Switch** - Robust destruction that never throws
   ```typescript
   private destroyBrowserViewSync(browserViewId: number): void {
       // Wrapped in try/catch - window might be dead
       try {
           window.contentView.removeChildView(browserView);
           browserView.webContents.close();
       } catch (e) {
           // Ignore - cleanup best effort
       }
   }
   ```

3. **The Dead Man's Switch** - Auto-trigger on parent death
   ```typescript
   window.webContents.once('did-start-loading', autoDestruct);
   ```

## Implementation Location

- **Main Process Service:** `src/vs/workbench/contrib/roopik/electron-main/projectModeV2/browserViewServiceV2.ts`
- **Key Method:** `attachSafetyLeash()`
- **Cleanup Method:** `destroyBrowserViewSync()`

## Lessons Learned

1. **WebContentsView is a native window** - Not part of DOM hierarchy, always highest z-index
2. **Main and Renderer are separate universes** - IPC is the only bridge
3. **`did-start-loading` is the golden event** - Fires earliest during reload
4. **Every Electron app faces this** - VS Code, Slack, Discord all have View Manager classes
5. **There's no "auto-close" setting** - Manual lifecycle management is the industry standard

## References

- [Electron WebContentsView Docs](https://www.electronjs.org/docs/latest/api/web-contents-view)
- [Electron Process Model](https://www.electronjs.org/docs/latest/tutorial/process-model)
- VS Code's own webview management: `src/vs/workbench/contrib/webview/`
