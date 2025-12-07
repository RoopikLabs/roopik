# Browser View Reload Lifecycle: From did-start-loading to VS Code Lifecycle Service

## The Problem

When reloading the IDE (Ctrl+Shift+P → "Reload Window"), the embedded browser preview (`WebContentsView`) would become a "ghost view" - remaining visible and running even after the IDE reloaded. This caused:

- **Ghost browser views** floating above the IDE UI
- **YouTube videos continuing to play** after IDE reload
- **Memory leaks** from orphaned browser processes
- **User confusion** - browser appears "stuck" and unresponsive

## Root Cause: Electron's Multi-Process Architecture

```
┌─────────────────────────────────────────┐
│          Main Process (Node.js)         │
│  - WebContentsView lives here           │
│  - NEVER stops running                  │
│  - Has no knowledge of renderer state   │
│  - Browser views persist here           │
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

**Key Insight:** When you reload the IDE:
1. Renderer process dies and restarts
2. Main process keeps running (by design - for stability)
3. Main process has **no idea** the renderer "died"
4. `WebContentsView` remains attached to the `BrowserWindow`
5. Ghost view appears

This is **not a bug** - it's a trade-off for stability. If your renderer crashes, background processes (like music) keep playing.

---

## Initial Solution: The `did-start-loading` Safety Leash

### The Approach

We attached a "safety leash" to the main window's `webContents` that would auto-destroy browser views when certain events fired:

```typescript
private attachSafetyLeash(window: BrowserWindow, browserViewId: number): void {
    const autoDestruct = (reason: string) => {
        console.log('[ProjectMode][Main] Safety leash auto-destroy triggered', {
            reason,
            windowId: window.id,
            browserViewId
        });
        this.destroyBrowserViewSync(browserViewId, `safety-leash:${reason}`);
    };

    // KEY EVENT: 'did-start-loading' fires immediately when IDE reloads
    window.webContents.once('did-start-loading', () => {
        autoDestruct('did-start-loading');
    });

    // Backup: Window closed
    window.once('closed', () => autoDestruct('window-closed'));

    // Backup: Renderer crashed
    window.webContents.once('render-process-gone', (_event, details) => {
        autoDestruct(`render-process-gone:${details?.reason ?? 'unknown'}`);
    });

    // Backup: WebContents destroyed
    window.webContents.once('destroyed', () => {
        autoDestruct('webcontents-destroyed');
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

### The Problem: False Positives

**The critical flaw:** `did-start-loading` fires on **ANY** workbench reload, not just IDE-wide reloads. This includes:

- Extension activity panel refreshes
- Dev server restarts
- Webview panel navigations
- Any internal workbench navigation

**Result:** Browser views were being destroyed when they shouldn't be, causing:

```
[ProjectMode][Main] Safety leash auto-destroy triggered {
    reason: 'did-start-loading',
    windowId: 1,
    browserViewId: 22
}
[ProjectMode][Main] navigate() FAILED: browserView not found for ID 22
```

**User Experience:**
1. User opens browser preview → Works fine ✅
2. User interacts with extension panel → Browser dies ❌
3. User tries to navigate → "Browser view not found" error ❌
4. User has to close and reopen the browser tab

### Why This Happened

The `did-start-loading` event is **too broad** - it's a low-level Electron event that fires whenever the main workbench window's `webContents` starts loading **anything**, including:

- Extension webviews loading
- Dev server iframes refreshing
- Internal VS Code navigation
- Extension host communication

We needed a **higher-level, semantic event** that only fires on actual IDE reloads.

---

## The Correct Solution: VS Code Lifecycle Service

### Understanding VS Code Lifecycle

VS Code has a sophisticated lifecycle management system that tracks window states and provides **semantic events** for different lifecycle phases:

#### Lifecycle Phases

```typescript
enum LifecycleMainPhase {
    Starting = 1,      // App is starting
    Ready = 2,        // App is ready
    AfterWindowOpen = 3,  // Window opened
    Eventually = 4    // Final phase
}
```

#### Key Lifecycle Events

**Main Process (`ILifecycleMainService`):**
- `onBeforeShutdown` - Fires before shutdown (can be vetoed)
- `onWillShutdown` - Fires when shutdown is confirmed
- `onWillLoadWindow` - **Fires when a window is about to load/reload** ⭐
- `onBeforeCloseWindow` - Fires before window closes

**Renderer Process (`ILifecycleService`):**
- `onBeforeShutdown` - Renderer-side shutdown preparation
- `onWillShutdown` - Renderer-side shutdown (can join async operations)
- `onDidShutdown` - Shutdown complete

### The Window Load Event

The `onWillLoadWindow` event provides exactly what we need:

```typescript
interface WindowLoadEvent {
    window: ICodeWindow;      // The window being loaded
    workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | undefined;
    reason: LoadReason;       // Why the window is loading
}

enum LoadReason {
    INITIAL = 1,    // First time opening
    LOAD = 2,       // Loading different workspace
    RELOAD = 3      // Window reload (Ctrl+R / Reload Window) ⭐
}
```

**Key Insight:** `LoadReason.RELOAD` only fires on **actual IDE reloads**, not on extension activity or internal navigation!

### Implementation

```typescript
export class BrowserViewService extends Disposable implements IProjectModeService {
    constructor(private readonly lifecycleMainService?: ILifecycleMainService) {
        super();
        this.setupLifecycleHooks();
    }

    /**
     * Setup lifecycle hooks to gracefully destroy browser views before window reload
     * This follows Cursor's approach: destroy BEFORE reload, not during
     */
    private setupLifecycleHooks(): void {
        if (!this.lifecycleMainService) {
            console.warn('[ProjectMode][Main] ILifecycleMainService not provided, skipping lifecycle hooks');
            return;
        }

        // Listen for window reload events - destroy browser views BEFORE reload happens
        // This is the key: we clean up gracefully before the window reloads, not during
        this._register(this.lifecycleMainService.onWillLoadWindow(e => {
            if (e.reason === LoadReason.RELOAD) {
                // Get Electron BrowserWindow ID (not VS Code window ID)
                const electronWindowId = e.window.win?.id;
                if (electronWindowId !== undefined) {
                    console.log('[ProjectMode][Main] Window reload detected, destroying all browser views for window', electronWindowId);
                    this.destroyAllBrowserViewsForWindow(electronWindowId);
                } else {
                    console.warn('[ProjectMode][Main] Window reload detected but Electron BrowserWindow not available');
                }
            }
        }));
    }

    /**
     * Destroy all browser views associated with a specific window
     * Used when window is reloading to prevent ghost browser views
     */
    private destroyAllBrowserViewsForWindow(windowId: number): void {
        const browserViewIdsToDestroy: number[] = [];

        // Find all browser views for this window
        for (const [browserViewId, window] of this.browserWindows.entries()) {
            if (window.id === windowId) {
                browserViewIdsToDestroy.push(browserViewId);
            }
        }

        console.log('[ProjectMode][Main] Destroying browser views for window reload', {
            windowId,
            browserViewIds: browserViewIdsToDestroy
        });

        // Destroy each browser view synchronously (window is reloading, no time for async)
        for (const browserViewId of browserViewIdsToDestroy) {
            this.destroyBrowserViewSync(browserViewId, 'window-reload');
        }
    }
}
```

### Key Differences from `did-start-loading`

| Aspect | `did-start-loading` | `onWillLoadWindow` |
|--------|-------------------|-------------------|
| **Semantic Level** | Low-level Electron event | High-level VS Code event |
| **Scope** | Any workbench navigation | Only actual window loads |
| **Reload Detection** | Fires on extension activity | Only fires on `LoadReason.RELOAD` |
| **False Positives** | Many (extension panels, etc.) | None |
| **Timing** | During reload | **Before reload** (graceful cleanup) |
| **Integration** | Direct Electron API | VS Code lifecycle system |

### Why This Works

1. **Semantic Events:** `LoadReason.RELOAD` is a **semantic** event - it only fires when VS Code itself determines a reload is happening, not on low-level navigation.

2. **Graceful Cleanup:** The event fires **before** the window reloads, giving us time to clean up synchronously.

3. **No False Positives:** Extension activity, dev server refreshes, and internal navigation don't trigger `LoadReason.RELOAD`.

4. **Standard Pattern:** This is how VS Code itself manages lifecycle - we're using the same infrastructure.

---

## The Journey: What We Learned

### Lesson 1: Low-Level vs High-Level Events

**Low-level events** (like `did-start-loading`) are **too broad** - they fire on many scenarios, not just the one you care about.

**High-level events** (like `onWillLoadWindow` with `LoadReason.RELOAD`) are **semantic** - they represent the actual intent, not just a technical side-effect.

### Lesson 2: Use Framework Lifecycle, Not Raw Electron Events

VS Code has a sophisticated lifecycle system for a reason - it handles edge cases, provides semantic events, and integrates with the rest of the framework.

**Don't:** Hook into raw Electron events directly
```typescript
window.webContents.once('did-start-loading', ...)  // Too broad!
```

**Do:** Use framework lifecycle services
```typescript
lifecycleMainService.onWillLoadWindow(e => {
    if (e.reason === LoadReason.RELOAD) { ... }  // Semantic!
})
```

### Lesson 3: Destroy Before, Not During

The old approach destroyed browser views **during** the reload (when `did-start-loading` fired). The new approach destroys them **before** the reload (when `onWillLoadWindow` fires with `RELOAD` reason).

This gives us:
- **Graceful cleanup** - time to synchronously destroy views
- **Clean state** - no orphaned views during reload
- **Better UX** - no ghost views appearing

### Lesson 4: Study How Others Do It

We learned this approach by studying **Cursor IDE's** implementation. They use the same pattern:
1. Listen to `onWillLoadWindow`
2. Destroy browser views before reload
3. Recreate them after reload

This is the **industry standard** for managing embedded browser views in Electron apps.

---

## VS Code Lifecycle Concepts Explained

### The Lifecycle Service Architecture

VS Code's lifecycle system is designed to handle complex scenarios:

```
┌─────────────────────────────────────────┐
│     ILifecycleMainService (Main)      │
│  - Manages app-wide lifecycle          │
│  - Coordinates window lifecycle         │
│  - Handles shutdown sequences          │
└─────────────────────────────────────────┘
                    │
                    │ Coordinates
                    │
┌─────────────────────────────────────────┐
│      ILifecycleService (Renderer)       │
│  - Manages renderer lifecycle           │
│  - Handles window-specific events       │
│  - Provides shutdown hooks               │
└─────────────────────────────────────────┘
```

### Window Lifecycle Flow

```
Window Created
    │
    ▼
onWillLoadWindow (reason: INITIAL)
    │
    ▼
Window Loaded
    │
    ▼
[User Works]
    │
    ▼
User Presses Ctrl+R / Reload Window
    │
    ▼
onWillLoadWindow (reason: RELOAD) ⭐
    │
    ▼
[Our Code: Destroy Browser Views]
    │
    ▼
Window Unloads
    │
    ▼
Window Reloads
    │
    ▼
onWillLoadWindow (reason: INITIAL)
    │
    ▼
[Our Code: Browser Views Recreated by Renderer]
```

### Why Lifecycle Services Exist

1. **Coordination:** Multiple services need to know about lifecycle events
2. **Cleanup:** Services need to clean up resources before shutdown
3. **Veto Support:** Some operations can prevent shutdown/reload
4. **Async Operations:** Services can join shutdown with async cleanup
5. **Semantic Events:** High-level events that represent user intent

### Integration Points

Services register lifecycle hooks to:
- **Save state** before shutdown
- **Clean up resources** (like our browser views)
- **Cancel operations** that shouldn't survive reload
- **Prepare for shutdown** (close connections, etc.)

---

## Implementation Details

### Service Registration

The lifecycle service is injected into `BrowserViewService` via dependency injection:

```typescript
// In app.ts
const projectModeService = new BrowserViewService(accessor.get(ILifecycleMainService));
```

### Disposable Pattern

`BrowserViewService` extends `Disposable` to automatically clean up lifecycle hooks:

```typescript
export class BrowserViewService extends Disposable {
    constructor(private readonly lifecycleMainService?: ILifecycleMainService) {
        super();
        this.setupLifecycleHooks();
    }

    private setupLifecycleHooks(): void {
        // Automatically disposed when BrowserViewService is disposed
        this._register(this.lifecycleMainService.onWillLoadWindow(...));
    }
}
```

### Window ID Mapping

**Important:** VS Code window IDs (`ICodeWindow.id`) are different from Electron `BrowserWindow` IDs. We need the Electron ID:

```typescript
// Get Electron BrowserWindow from ICodeWindow
const electronWindowId = e.window.win?.id;  // Electron BrowserWindow ID
// NOT: e.window.id (VS Code window ID)
```

### Synchronous Destruction

During window reload, we must destroy browser views **synchronously** - there's no time for async operations:

```typescript
// Synchronous destruction (no await)
for (const browserViewId of browserViewIdsToDestroy) {
    this.destroyBrowserViewSync(browserViewId, 'window-reload');
}
```

---

## Testing the Solution

### Test Scenario 1: IDE Reload
1. Open browser preview
2. Navigate to a website
3. Press Ctrl+Shift+P → "Reload Window"
4. **Expected:** Browser view destroyed before reload, no ghost view
5. **Result:** ✅ Works perfectly

### Test Scenario 2: Extension Activity
1. Open browser preview
2. Navigate to a website
3. Open extension activity panel
4. Refresh dev server
5. **Expected:** Browser view remains active
6. **Result:** ✅ No false positives

### Test Scenario 3: Multiple Browser Views
1. Open multiple browser preview tabs
2. Reload IDE
3. **Expected:** All browser views destroyed
4. **Result:** ✅ All views cleaned up

---

## Comparison: Before vs After

### Before (did-start-loading)

```typescript
// ❌ Too broad - fires on extension activity
window.webContents.once('did-start-loading', () => {
    destroyBrowserView();  // False positive!
});
```

**Problems:**
- Browser dies when extension panel refreshes
- Browser dies when dev server restarts
- Browser dies on any workbench navigation
- User has to constantly reopen browser tabs

### After (VS Code Lifecycle)

```typescript
// ✅ Semantic - only fires on actual reloads
lifecycleMainService.onWillLoadWindow(e => {
    if (e.reason === LoadReason.RELOAD) {
        destroyAllBrowserViewsForWindow(e.window.win?.id);
    }
});
```

**Benefits:**
- Only fires on actual IDE reloads
- No false positives
- Graceful cleanup before reload
- Industry-standard pattern

---

## Code Locations

- **Main Process Service:** `src/vs/workbench/contrib/roopik/electron-main/projectMode/browserViewService.ts`
- **Lifecycle Hook Setup:** `setupLifecycleHooks()` method
- **Window Reload Handler:** `destroyAllBrowserViewsForWindow()` method
- **Service Registration:** `src/vs/code/electron-main/app.ts` (line ~1251)

---

## References

- [VS Code Lifecycle Service](https://github.com/microsoft/vscode/blob/main/src/vs/platform/lifecycle/)
- [Electron WebContentsView Docs](https://www.electronjs.org/docs/latest/api/web-contents-view)
- [Electron Process Model](https://www.electronjs.org/docs/latest/tutorial/process-model)
- Cursor IDE's browser view lifecycle implementation (inspiration)

---

## Browser View Restoration After Reload

### The Restoration Flow

After destroying browser views before reload, we need to **restore** them after reload. VS Code provides an editor serialization system for this:

```
Before Reload:
1. Browser view exists with URL "https://example.com"
2. EditorTabInput has URL stored
3. EditorTabInputSerializer.serialize() saves URL to storage
4. onWillLoadWindow fires → destroy browser view

After Reload:
1. VS Code restores editor state from storage
2. EditorTabInputSerializer.deserialize() recreates EditorTabInput with saved URL
3. Editor.setInput() called with restored input
4. Browser view doesn't exist → initializeBrowserView()
5. Navigate to restored URL
```

### Implementation: Editor Serialization

**EditorTabInputSerializer** (`editorTabInputSerializer.ts`):

```typescript
export class EditorTabInputSerializer implements IEditorSerializer {
    serialize(editorInput: EditorInput): string {
        if (editorInput instanceof EditorTabInput) {
            return JSON.stringify({
                url: editorInput.url,
                pageTitle: editorInput.pageTitle
            });
        }
        return '';
    }

    deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): EditorInput {
        const data = JSON.parse(serializedEditorInput);
        const input = EditorTabInput.getInstance();
        input.setUrl(data.url);  // Restore URL
        input.setPageTitle(data.pageTitle);  // Restore page title
        return input;
    }
}
```

**Registration** (in `roopik.contribution.ts`):

```typescript
Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory)
    .registerEditorSerializer(EditorTabInput.ID, EditorTabInputSerializer);
```

### How It Works

1. **Before Reload:**
   - User has browser preview open with URL "https://example.com"
   - VS Code calls `EditorTabInputSerializer.serialize()` → saves URL to storage
   - `onWillLoadWindow` fires → browser view destroyed

2. **After Reload:**
   - VS Code restores editor state from storage
   - Calls `EditorTabInputSerializer.deserialize()` → recreates `EditorTabInput` with saved URL
   - Calls `Editor.setInput()` with restored input
   - Editor sees `browserViewId` doesn't exist → initializes new browser view
   - Editor navigates to restored URL

### Key Points

- **Automatic:** VS Code handles serialization/deserialization automatically
- **State Preservation:** URL and page title are preserved
- **Seamless UX:** User sees the same page after reload
- **No Manual Work:** Editor automatically navigates to restored URL in `setInput()`

### Testing Restoration

1. Open browser preview
2. Navigate to a website (e.g., `https://example.com`)
3. Reload IDE (Ctrl+Shift+P → "Reload Window")
4. **Expected:** Browser preview reopens with the same URL
5. **Result:** ✅ Works perfectly

---

## Summary

**The Problem:** Browser views became ghost views after IDE reload.

**Initial Solution:** Used `did-start-loading` event - worked but caused false positives.

**Final Solution:** Use VS Code's `ILifecycleMainService.onWillLoadWindow` with `LoadReason.RELOAD` - semantic, reliable, no false positives.

**Restoration:** Use VS Code's editor serialization system (`IEditorSerializer`) to save/restore URL state.

**Key Takeaway:** Always use framework lifecycle services instead of raw Electron events when available. They provide semantic events that represent user intent, not just technical side-effects.

---

## URL Serialization Issue: Stale URLs After Reload

### The Problem

After reload, the browser would restore to only the hostname (e.g., `youtube.com`) instead of the full URL (e.g., `www.youtube.com/shorts/pJpzd8bJVks`). This happened because `EditorTabInput.url` was only updated during initial navigation, not when the browser navigated (including redirects).

### The Fix

Update `EditorTabInput.url` in `handleNavigationStateChanged()` whenever the browser URL changes. This ensures the full URL (including path, query params, etc.) is always saved, not just the initial navigation URL.

```typescript
// In handleNavigationStateChanged()
if (currentUrl !== this.lastKnownUrl) {
    this.lastKnownUrl = currentUrl;

    // Update input URL so it gets serialized correctly on reload
    const input = this.input as EditorTabInput;
    if (input && currentUrl && currentUrl !== 'about:blank') {
        input.setUrl(currentUrl);
    }
}
```

**Result:** The complete URL is now saved and restored correctly after reload.
