# DevTools Implementation

> Deep dive into how Chrome DevTools is embedded in Browser Preview V2 using Electron's WebContentsView.

**Date**: November 2025
**Status**: IMPLEMENTED
**Related Files**:
- `src/vs/workbench/contrib/roopik/browser/projectModeV2/projectModeV2Editor.ts`
- `src/vs/workbench/contrib/roopik/electron-main/projectModeV2/browserViewServiceV2.ts`
- `src/vs/workbench/contrib/roopik/browser/projectModeV2/browserControlBarV2.ts`

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     RENDERER PROCESS (Browser UI)                        │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  projectModeV2Editor.ts                                          │    │
│  │  ├── controlBar (DevTools button click)                          │    │
│  │  ├── browserContainer (div) ──── Browser WebContentsView         │    │
│  │  └── devtoolsContainer (div) ─── DevTools WebContentsView        │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                              │                                           │
│                              │ IPC Channel                               │
│                              ▼                                           │
└─────────────────────────────────────────────────────────────────────────┘
                               │
┌─────────────────────────────────────────────────────────────────────────┐
│                     MAIN PROCESS (Electron Node.js)                      │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  browserViewServiceV2.ts                                         │    │
│  │  ├── browserViews Map<id, WebContentsView>                       │    │
│  │  ├── devtoolsViews Map<id, WebContentsView>                      │    │
│  │  └── openDevTools() / closeDevTools()                            │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Flow of Control: Opening DevTools

### Step 1: Button Click (Renderer Process)

**File**: `browserControlBarV2.ts:131`

```typescript
// DevTools button in the address bar triggers callback
this.createIconButton(Codicon.terminal, 'Toggle DevTools', () => this.callbacks.onDevTools!());
```

The DevTools button is created in the control bar. When clicked, it calls the `onDevTools` callback.

---

### Step 2: Toggle Handler (Renderer Process)

**File**: `projectModeV2Editor.ts:750-782`

```typescript
private async toggleDevTools(): Promise<void> {
    if (!this.browserViewId || !this.devtoolsContainer) {
        return;
    }

    if (this.devtoolsVisible) {
        // CLOSE DevTools
        await this.browserService.closeDevTools(this.browserViewId);
        this.devtoolsContainer.style.display = 'none';
        this.devtoolsVisible = false;
    } else {
        // OPEN DevTools
        // 1. Show the DOM container FIRST (so getBoundingClientRect works)
        this.devtoolsContainer.style.display = 'block';

        // 2. Calculate bounds from DOM container
        const rect = this.devtoolsContainer.getBoundingClientRect();
        const bounds: ViewBounds = {
            x: Math.floor(rect.left),
            y: Math.floor(rect.top),
            width: Math.floor(rect.width),
            height: Math.floor(rect.height)
        };

        // 3. IPC call to main process to create DevTools
        await this.browserService.openDevTools(this.browserViewId, bounds);
        this.devtoolsVisible = true;

        // 4. Update bounds after layout settles
        setTimeout(() => this.updateViewBounds(), 100);
    }
}
```

**Key Points**:
- The DOM container (`devtoolsContainer`) is shown FIRST
- `getBoundingClientRect()` gets screen coordinates for positioning
- IPC call sends bounds to main process

---

### Step 3: IPC Bridge (Renderer → Main)

**File**: `projectModeV2ServiceBridge.ts:72-74`

```typescript
async openDevTools(browserViewId: number, bounds: ViewBounds): Promise<DevToolsViewResult> {
    return this.channel.call('openDevTools', { browserViewId, bounds });
}
```

**File**: `projectModeV2Channel.ts:49-50`

```typescript
case 'openDevTools':
    return this.service.openDevTools(arg.browserViewId, arg.bounds);
```

The service bridge forwards the call through VSCode's IPC channel to the main process.

---

### Step 4: Main Process Creates DevTools (Main Process)

**File**: `browserViewServiceV2.ts:334-378`

This is where the **magic happens**:

```typescript
async openDevTools(browserViewId: number, bounds: ViewBounds): Promise<DevToolsViewResult> {
    const browserView = this.browserViews.get(browserViewId);
    const window = this.browserWindows.get(browserViewId);

    if (!browserView || !window) {
        throw new Error(`Browser view ${browserViewId} not found`);
    }

    // 1. Close existing DevTools if any (cleanup)
    await this.closeDevTools(browserViewId);

    // 2. CRITICAL: Create FRESH WebContentsView for DevTools
    //    Per Electron docs: "The devToolsWebContents must not have done any navigation"
    const devtoolsView = new WebContentsView({
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    // 3. Add to BrowserWindow's contentView (makes it visible in the window)
    window.contentView.addChildView(devtoolsView);

    // 4. Set bounds (screen coordinates from renderer)
    devtoolsView.setBounds({
        x: Math.round(bounds.x),
        y: Math.round(bounds.y),
        width: Math.round(bounds.width),
        height: Math.round(bounds.height)
    });

    // 5. CRITICAL: Connect DevTools to Browser's webContents
    //    This is THE MAGIC - tells Electron to render Chrome DevTools
    //    into this WebContentsView, inspecting the browser's webContents
    browserView.webContents.setDevToolsWebContents(devtoolsView.webContents);

    // 6. Open DevTools with 'detach' mode (required for setDevToolsWebContents)
    browserView.webContents.openDevTools({ mode: 'detach' });

    // 7. Store for later cleanup/bounds updates
    const devtoolsViewId = devtoolsView.webContents.id;
    this.devtoolsViews.set(browserViewId, devtoolsView);

    console.log(`[ProjectModeV2] Opened DevTools ${devtoolsViewId} for browser ${browserViewId}`);

    return { devtoolsViewId };
}
```

---

## The Key Electron APIs

| API | Purpose |
|-----|---------|
| `new WebContentsView()` | Creates a native Chromium view that can render web content |
| `window.contentView.addChildView(view)` | Adds the view to the BrowserWindow (makes it visible) |
| `view.setBounds({ x, y, width, height })` | Positions the view using screen coordinates |
| `browserView.webContents.setDevToolsWebContents(devtoolsView.webContents)` | **THE MAGIC** - Renders Chrome DevTools into this view |
| `browserView.webContents.openDevTools({ mode: 'detach' })` | Opens DevTools in detached mode (required for custom container) |

---

## Layout Structure

```
┌─────────────────────────────────────────────────────────────┐
│ Control Bar (address bar, back/forward, DevTools button)    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  browserContainer (CSS: flex: 1)                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  WebContentsView (Browser)                           │   │
│  │  - Positioned at browserContainer.getBoundingRect()  │   │
│  │  - Renders the actual webpage (localhost, etc.)      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  devtoolsContainer (CSS: height: 40%, initially hidden)     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  WebContentsView (DevTools)                          │   │
│  │  - Created ON-DEMAND when user clicks button         │   │
│  │  - Positioned at devtoolsContainer.getBoundingRect() │   │
│  │  - Renders actual Chrome DevTools UI                 │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**Note**: The DOM containers (`browserContainer`, `devtoolsContainer`) are just positioning references. The actual content (Browser, DevTools) renders as native Electron `WebContentsView` which overlays on top of DOM.

---

## Critical Implementation Details

### 1. DevTools WebContents Must Be Fresh

Per Electron documentation, the `WebContentsView` used for DevTools MUST be:
- Freshly created
- Never navigated to any URL
- Used immediately with `setDevToolsWebContents`

```typescript
// CORRECT: Fresh view, used immediately
const devtoolsView = new WebContentsView({ ... });
browserView.webContents.setDevToolsWebContents(devtoolsView.webContents);
browserView.webContents.openDevTools({ mode: 'detach' });

// WRONG: Navigated before use
const devtoolsView = new WebContentsView({ ... });
devtoolsView.webContents.loadURL('about:blank'); // ❌ This breaks it!
browserView.webContents.setDevToolsWebContents(devtoolsView.webContents);
```

### 2. Mode Must Be 'detach'

When using `setDevToolsWebContents`, you MUST call `openDevTools` with `mode: 'detach'`:

```typescript
browserView.webContents.openDevTools({ mode: 'detach' }); // ✅ Required
browserView.webContents.openDevTools(); // ❌ Won't work with custom container
```

### 3. Screen Coordinates for Bounds

`setBounds()` uses absolute screen coordinates. We get these from DOM using `getBoundingClientRect()`:

```typescript
const rect = this.devtoolsContainer.getBoundingClientRect();
const bounds = {
    x: Math.floor(rect.left),   // Screen X
    y: Math.floor(rect.top),    // Screen Y
    width: Math.floor(rect.width),
    height: Math.floor(rect.height)
};
devtoolsView.setBounds(bounds);
```

### 4. Z-Order: WebContentsView Renders ON TOP

`WebContentsView` is a native Chromium view that renders ON TOP of all DOM elements. The `devtoolsContainer` div is just a positioning reference - the actual DevTools UI is a native overlay.

### 5. ON-DEMAND Creation

DevTools view is created only when the user clicks the button, not at startup:
- Saves memory
- Avoids the "fresh webContents" timing issue
- Allows proper cleanup

---

## Closing DevTools

**File**: `browserViewServiceV2.ts:380-407`

```typescript
async closeDevTools(browserViewId: number): Promise<void> {
    const browserView = this.browserViews.get(browserViewId);
    const devtoolsView = this.devtoolsViews.get(browserViewId);
    const window = this.browserWindows.get(browserViewId);

    // 1. Close DevTools on browser's webContents
    if (browserView && !browserView.webContents.isDestroyed()) {
        browserView.webContents.closeDevTools();
    }

    // 2. Remove and destroy the DevTools view
    if (devtoolsView) {
        // Remove from window
        if (window && !window.isDestroyed() && window.contentView) {
            try {
                window.contentView.removeChildView(devtoolsView);
            } catch (e) {
                console.error('[ProjectModeV2] Error removing devtools view:', e);
            }
        }

        // Destroy webContents
        if (!devtoolsView.webContents.isDestroyed()) {
            devtoolsView.webContents.close();
        }

        // Remove from map
        this.devtoolsViews.delete(browserViewId);
    }
}
```

---

## Bounds Updates on Resize

When the editor is resized (split screen, etc.), bounds must be updated:

**File**: `projectModeV2Editor.ts:570-582`

```typescript
// Update DevTools bounds if visible
if (this.devtoolsVisible && this.devtoolsContainer) {
    const devtoolsRect = this.devtoolsContainer.getBoundingClientRect();
    if (devtoolsRect.width > 0 && devtoolsRect.height > 0) {
        const devtoolsBounds: ViewBounds = {
            x: Math.floor(devtoolsRect.left),
            y: Math.floor(devtoolsRect.top),
            width: Math.floor(devtoolsRect.width),
            height: Math.floor(devtoolsRect.height)
        };
        this.browserService.setDevToolsBounds(this.browserViewId, devtoolsBounds);
    }
}
```

This is triggered by:
- `ResizeObserver` watching the containers
- `layout()` method called by VSCode on editor resize

---

## Data Flow Summary

```
User clicks DevTools button
        │
        ▼
browserControlBarV2.ts: onDevTools callback
        │
        ▼
projectModeV2Editor.ts: toggleDevTools()
        │
        ├── Show devtoolsContainer (CSS display: block)
        ├── Calculate bounds from getBoundingClientRect()
        │
        ▼
projectModeV2ServiceBridge.ts: openDevTools(browserViewId, bounds)
        │
        ▼ (IPC Channel)
        │
projectModeV2Channel.ts: routes to service
        │
        ▼
browserViewServiceV2.ts: openDevTools()
        │
        ├── new WebContentsView() - fresh!
        ├── window.contentView.addChildView()
        ├── devtoolsView.setBounds()
        ├── browserView.webContents.setDevToolsWebContents() ← THE MAGIC
        └── browserView.webContents.openDevTools({ mode: 'detach' })
        │
        ▼
Chrome DevTools renders in the WebContentsView!
```

---

## Customization Options

| Customization | How to Implement |
|---------------|------------------|
| **Change Position** | Modify `devtoolsContainer.style` (bottom, right, etc.) |
| **Change Initial Size** | Change `devtoolsContainer.style.height = '40%'` |
| **Make Resizable** | Add a drag handle between browser and devtools containers |
| **Side Panel Layout** | Change `contentContainer.style.flexDirection` to `row` |
| **Programmatic Control** | Use CDP via `sendCDPCommand()` to switch panels, run commands |

---

## Related Documentation

- [Tab Switching](./BROWSER_VIEW_TAB_SWITCHING.md)
- [Ghost Process](./BROWSER_VIEW_GHOST_PROCESS.md)
- [Localhost Loading](./LOCALHOST_NOT_LOADING_Electron.md)
- [Overlay UI](./OVERLAY_UI_ON_WEBCONTENTSVIEW.md)
- [Electron WebContentsView API](https://www.electronjs.org/docs/latest/api/web-contents-view)
- [Electron setDevToolsWebContents](https://www.electronjs.org/docs/latest/api/web-contents#contentssetdevtoolswebcontentsdevtoolswebcontents)
