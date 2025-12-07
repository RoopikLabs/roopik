# Browser View Ghost Process Challenge

> Documentation of the "ghost browser view" issue where WebContentsView persisted after IDE reload.

**Date**: November 2025
**Status**: RESOLVED
**Related Files**:
- `src/vs/workbench/contrib/roopik/electron-main/projectModeV2/browserViewServiceV2.ts`

---

## Problem Summary

When reloading the IDE (Ctrl+R or "Reload Window"), the WebContentsView would persist as a "ghost" - visible on screen but uncontrollable. The browser would keep playing content but couldn't be interacted with or closed.

---

## The Ghost Process Issue

### Symptom
1. Open Browser Preview V2
2. Load a website (e.g., YouTube video playing)
3. Press Ctrl+R to reload IDE
4. After reload: Ghost browser view still visible, video still playing
5. Can't interact with it, can't close it
6. Opening new Browser Preview creates ANOTHER view on top

### Root Cause: Electron Process Architecture

```
┌─────────────────────────────────────────────────────┐
│                  MAIN PROCESS                        │
│          (Node.js - Never dies on reload)           │
│                                                      │
│   ┌─────────────────────────────────────────────┐   │
│   │         WebContentsView (Browser)            │   │
│   │    - Lives in main process memory            │   │
│   │    - Has NO connection to renderer           │   │
│   │    - Doesn't know IDE "died"                 │   │
│   └─────────────────────────────────────────────┘   │
│                                                      │
└─────────────────────────────────────────────────────┘
                          ↕
              IPC (breaks on reload)
                          ↕
┌─────────────────────────────────────────────────────┐
│               RENDERER PROCESS                       │
│        (VS Code Window - Dies on reload)            │
│                                                      │
│   ┌─────────────────────────────────────────────┐   │
│   │         ProjectModeV2Editor                  │   │
│   │    - Lives in renderer memory                │   │
│   │    - Destroyed when IDE reloads              │   │
│   │    - Loses browserViewId reference           │   │
│   └─────────────────────────────────────────────┘   │
│                                                      │
└─────────────────────────────────────────────────────┘
```

When you reload the IDE:
1. **Renderer process DIES** - All JS objects, including `ProjectModeV2Editor`, are destroyed
2. **Main process KEEPS RUNNING** - WebContentsView still exists in memory
3. **IPC breaks** - No way to communicate with the orphaned view
4. **Ghost appears** - View is visible but uncontrollable

---

## Solution: The Safety Leash

The fix is to attach lifecycle listeners to the parent window that automatically destroy the browser view when the window reloads or closes.

### Implementation

```typescript
/**
 * CRITICAL: THE SAFETY LEASH
 *
 * Auto-destroy views when parent window reloads or closes.
 * This is the KEY fix for ghost browser views!
 */
private attachSafetyLeash(window: BrowserWindow, browserViewId: number): void {
    const autoDestruct = () => {
        console.log(`[ProjectModeV2] SAFETY LEASH TRIGGERED - Auto-destroying browser view ${browserViewId}`);
        this.destroyBrowserViewSync(browserViewId);
    };

    // 1. MOST IMPORTANT: fires immediately when IDE reloads
    window.webContents.once('did-start-loading', () => {
        console.log(`[ProjectModeV2] Window did-start-loading -> triggering safety leash`);
        autoDestruct();
    });

    // 2. If the IDE window is closed entirely
    window.once('closed', () => {
        console.log(`[ProjectModeV2] Window closed -> triggering safety leash`);
        autoDestruct();
    });

    // 3. If the renderer process crashes
    window.webContents.once('render-process-gone', (_event, details) => {
        console.log(`[ProjectModeV2] Renderer process gone (${details.reason}) -> triggering safety leash`);
        autoDestruct();
    });

    // 4. If webContents is destroyed
    window.webContents.once('destroyed', () => {
        console.log(`[ProjectModeV2] WebContents destroyed -> triggering safety leash`);
        autoDestruct();
    });
}
```

### Key Event: `did-start-loading`

The `did-start-loading` event fires the **MILLISECOND** you press reload, BEFORE the new UI is ready. This gives us a clean visual wipe - the browser view is destroyed before the new IDE appears.

### Synchronous Destroy

We use a synchronous destroy method that never throws:

```typescript
private destroyBrowserViewSync(browserViewId: number): void {
    // Must be robust and never throw - the window is dying anyway

    // 1. Close DevTools
    try { browserView.webContents.closeDevTools(); } catch {}

    // 2. Remove from window
    try { window.contentView.removeChildView(browserView); } catch {}

    // 3. Stop loading and close
    try {
        browserView.webContents.stop();
        browserView.webContents.close();
    } catch {}

    // 4. Cleanup maps
    this.browserViews.delete(browserViewId);
    this.browserWindows.delete(browserViewId);
}
```

---

## Events That Trigger Cleanup

| Event | When Fired | What It Means |
|-------|-----------|---------------|
| `did-start-loading` | Millisecond you press reload | IDE is reloading |
| `closed` | Window X button clicked | IDE is closing |
| `render-process-gone` | Renderer crashes | Process died unexpectedly |
| `destroyed` | WebContents garbage collected | Cleanup time |

---

## Why This Works

1. **Events fire in main process** - Where the browser view lives
2. **Events fire BEFORE renderer dies** - We can still cleanup
3. **Synchronous cleanup** - No await, no chance for errors
4. **Robust error handling** - Try/catch everything, window might be dead

---

## Testing the Fix

### Before Fix
1. Open Browser Preview, load YouTube
2. Press Ctrl+R
3. **Result**: Ghost video playing, uncontrollable

### After Fix
1. Open Browser Preview, load YouTube
2. Press Ctrl+R
3. **Result**: Clean slate, no ghost

### Console Logs
```
[ProjectModeV2] Window did-start-loading -> triggering safety leash
[ProjectModeV2] SAFETY LEASH TRIGGERED - Auto-destroying browser view 2
[ProjectModeV2] Sync destroying browser view 2
[ProjectModeV2] Browser view 2 sync destroyed
```

---

## Alternative Approaches Considered

### 1. Cleanup in dispose()
**Problem**: `dispose()` runs in renderer - if renderer crashes, dispose never runs.

### 2. Periodic health checks
**Problem**: Polling is inefficient, might miss rapid reload.

### 3. Store state and restore
**Problem**: Complex, doesn't actually solve the ghost issue.

### Why Safety Leash is Best
- **Proactive**: Cleans up BEFORE ghost can appear
- **Event-driven**: No polling, instant response
- **Robust**: Works even if renderer crashes
- **Simple**: Just a few event listeners

---

## Related Documentation

- [Browser View Tab Switching](./BROWSER_VIEW_TAB_SWITCHING.md)
- [Mode 2 Security](../MODE2_SECURITY.md)
