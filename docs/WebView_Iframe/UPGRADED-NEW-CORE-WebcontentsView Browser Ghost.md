# Roopik Development Challenges

This document chronicles significant technical challenges encountered during Roopik development and their solutions.

---

## Ghost Browser Process Issue

### The Problem

When implementing the browser preview feature using Electron's `WebContentsView`, we encountered a critical issue where the browser instance would continue running in the background even after closing the tab. The symptoms were:

- Audio from videos continued playing after tab close
- The Chromium renderer process remained alive
- Memory leak as processes accumulated with each open/close cycle
- Visual hiding worked, but the underlying process was never destroyed

### What Was Wrong

The original implementation only **visually hid** the `WebContentsView` by setting its bounds to `0x0` dimensions. While this made the browser invisible to the user, it did not actually destroy the underlying Electron `WebContents` or terminate the Chromium renderer process. This meant websites continued executing JavaScript, playing media, and consuming system resources invisibly.

**Original problematic code pattern:**
```typescript
// This only hides the view, doesn't destroy it!
private hideViews(): void {
    if (this.browserViewId) {
        this.browserService.setBrowserBounds(this.browserViewId, { x: 0, y: 0, width: 0, height: 0 });
    }
}
```

### The Solution

The fix involved implementing proper lifecycle management with three key changes:

#### 1. Explicit Destruction on Tab Close

Updated `clearInput()` method in [`projectModeEditor.ts:243-255`](../src/vs/workbench/contrib/roopik/browser/projectMode/projectModeEditor.ts#L243-L255) to explicitly destroy views when the editor input is cleared (which happens when closing the tab):

```typescript
override clearInput(): void {
    super.clearInput();
    if (this.controlBar) this.controlBar.setUrl('');

    // FIX 2: Destroy views to permanently close the browser instance and stop audio
    if (this.browserViewId && this.devtoolsViewId) {
        this.browserService.destroyViews(this.browserViewId, this.devtoolsViewId)
            .catch(err => this.logger.error('Failed to destroy views in clearInput', err));

        this.browserViewId = undefined;
        this.devtoolsViewId = undefined;
    }
}
```

#### 2. Nuclear Cleanup in Main Process

Enhanced the `destroyViews()` method in [`roopikBrowserMainService.ts:122-195`](../src/vs/workbench/contrib/roopik/electron-main/roopikBrowserMainService.ts#L122-L195) to perform complete cleanup:

```typescript
async destroyViews(browserViewId: number, devtoolsViewId: number): Promise<void> {
    const killView = async (view: WebContentsView, viewId: number, name: string) => {
        const webContents = view.webContents;
        const parentWindow = this.viewWindows.get(viewId);

        // 1. Remove from window using STORED reference
        if (parentWindow && !parentWindow.isDestroyed() && parentWindow.contentView) {
            parentWindow.contentView.removeChildView(view);
        }

        // 2. Get process ID BEFORE destroying
        let processId: number | undefined;
        if (webContents && !webContents.isDestroyed()) {
            processId = webContents.getOSProcessId();
        }

        // 3. Destroy webContents
        if (webContents && !webContents.isDestroyed()) {
            webContents.stop();
            webContents.setAudioMuted(true);
            (webContents as any).destroy();
        }

        // 4. NUCLEAR: Kill the OS process directly
        if (processId) {
            process.kill(processId, 'SIGKILL');
        }
    };

    // Execute killView for both browser and devtools views
    if (browserView) {
        await killView(browserView, browserViewId, 'BrowserView');
        this.browserViews.delete(browserViewId);
        this.viewWindows.delete(browserViewId);
    }

    if (devtoolsView) {
        await killView(devtoolsView, devtoolsViewId, 'DevToolsView');
        this.devtoolsViews.delete(devtoolsViewId);
        this.viewWindows.delete(devtoolsViewId);
    }
}
```

**Key steps in the cleanup process:**
1. **Remove from window**: Detach the view from the parent window's contentView
2. **Capture process ID**: Get the OS process ID before destroying (can't retrieve after)
3. **Destroy WebContents**: Call `destroy()` on the webContents object
4. **Nuclear option**: Forcibly kill the OS process with `SIGKILL` to ensure no zombie processes

#### 3. Fresh Instance on Re-open

Modified `setInput()` method in [`projectModeEditor.ts:227-241`](../src/vs/workbench/contrib/roopik/browser/projectMode/projectModeEditor.ts#L227-L241) to create fresh instances:

```typescript
override async setInput(input: EditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
    await super.setInput(input, options, context, token);

    // Initialize views if they don't exist (e.g. first open or after clearInput)
    if (!this.browserViewId) {
        await this.initializeBrowserViews();
    }

    if (input instanceof ProjectModeInput && input.url && this.controlBar) {
        this.controlBar.setUrl(input.url);
        if (input.url !== 'about:blank') {
            this.navigate(input.url);
        }
    }
}
```

This ensures that every time you open the browser tab, you get a clean, fresh instance instead of potentially reconnecting to a stale or broken session.

### Why Multiple Approaches Were Needed

We tried several methods before finding the complete solution:

1. ❌ `webContents.destroy()` alone - didn't stop the process
2. ❌ `webContents.forcefullyCrashRenderer()` - process continued running
3. ❌ `webContents.close()` (documented method) - still didn't work
4. ❌ Navigate to `about:blank`, mute audio, then close - insufficient
5. ✅ **Final solution**: Remove from window + destroy + SIGKILL on OS process

The issue required attacking from multiple angles because Electron's WebContents can have complex lifecycle dependencies. The combination of proper view removal, webContents destruction, and OS-level process termination ensures complete cleanup.

### Lessons Learned

1. **Visual hiding ≠ Destroying**: Setting bounds to `0x0` only hides the view visually; it doesn't free resources
2. **Process lifecycle management**: Always capture process IDs before destroying objects that provide them
3. **Nuclear option sometimes necessary**: When documented APIs fail, OS-level process termination may be required
4. **Fresh instances are safer**: Re-initializing views on each open prevents state pollution
5. **Store references**: Keeping window references prevents expensive lookups and object identity issues

### Related Files

- [`projectModeEditor.ts`](../src/vs/workbench/contrib/roopik/browser/projectMode/projectModeEditor.ts) - Renderer-side editor component
- [`roopikBrowserMainService.ts`](../src/vs/workbench/contrib/roopik/electron-main/roopikBrowserMainService.ts) - Main process service managing WebContentsView lifecycle
- [`roopikBrowserService.ts`](../src/vs/workbench/contrib/roopik/common/roopikBrowserService.ts) - Service interface
- [`roopikBrowserServiceBridge.ts`](../src/vs/workbench/contrib/roopik/browser/services/roopikBrowserServiceBridge.ts) - IPC bridge

---

## Terminal Overlap Issue

### The Problem

The browser content container was overlapping with the terminal header at the bottom of the screen, making it impossible to interact with the terminal's output channel selector.

### The Solution

Applied CSS properties inspired by Cursor IDE's implementation:

1. **Height calculation**: Changed from `height: 90%` to `height: calc(100% - 2px)` to precisely control container height
2. **Z-index stacking**: Added `zIndex: '-1'` to ensure browser stays behind terminal in the stacking order
3. **Tab index**: Set `tabIndex = -1` to allow focus management
4. **Flex properties**: Used `flex: '1 1 0%'` for proper flex-based sizing
5. **Rounding strategy**: Used `Math.floor()` instead of `Math.round()` for height to avoid rounding up and overlapping

**Key code in [`projectModeEditor.ts:97-115`](../src/vs/workbench/contrib/roopik/browser/projectMode/projectModeEditor.ts#L97-L115):**
```typescript
const contentContainer = document.createElement('div');
contentContainer.tabIndex = -1;
contentContainer.style.display = 'flex';
contentContainer.style.flexDirection = 'column';
contentContainer.style.height = 'calc(100% - 2px)'; // Prevent overlap
contentContainer.style.position = 'relative';
contentContainer.style.zIndex = '-1'; // Stay behind terminal
contentContainer.style.overflow = 'hidden';
```

This combination ensures the browser content respects terminal boundaries and doesn't interfere with UI interaction.
