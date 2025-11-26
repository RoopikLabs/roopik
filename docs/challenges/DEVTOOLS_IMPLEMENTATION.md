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

---
---

# DevTools Attached Mode (Docked)

> **UPDATE November 2025**: We discovered a much simpler and more feature-rich approach - using Electron's built-in docked DevTools mode instead of managing a separate WebContentsView.

**Status**: IMPLEMENTED (Default Mode)
**Date**: November 2025

---

## The Problem with Detached Mode

While the detached mode (documented above) works, it has significant limitations:

1. **No Device Toolbar** - The responsive design toggle button is NOT available
2. **No Close Button** - Users can't close DevTools from within the panel itself
3. **Manual Resize Handling** - We had to implement custom drag handles for resizing
4. **Complex Bounds Management** - Required tracking and updating bounds on every resize
5. **More Code to Maintain** - Custom WebContentsView lifecycle management

### Why Device Toolbar is Missing in Detached Mode

After research, we discovered this is a **Chromium/Electron limitation**:

> In `detach` mode, DevTools has no connection to the browser window dimensions. The Device Toolbar toggle requires knowing the viewport size to emulate devices - but in detached mode, DevTools doesn't know where or how big the browser is.

This is why Cursor IDE has the Device Toolbar and close button - they use **docked/attached mode**!

---

## The Solution: Attached (Docked) Mode

Instead of creating a separate WebContentsView and managing it ourselves, we let Electron handle everything by using `openDevTools({ mode: 'bottom' })`.

### Key Advantages

| Feature | Detached Mode | Attached Mode |
|---------|--------------|---------------|
| **Device Toolbar** | ❌ Not available | ✅ Full responsive design tools |
| **Close Button** | ❌ Must implement | ✅ Built-in (X button in DevTools) |
| **Resize Handle** | ❌ Must implement | ✅ Built-in drag handle |
| **Bounds Management** | ❌ Manual tracking | ✅ Electron handles automatically |
| **Code Complexity** | High | Low |
| **Device Emulation UI** | ❌ No visual picker | ✅ Full device dropdown |

### What You Get with Attached Mode

1. **Device Toolbar Toggle** - Click the device icon in DevTools to toggle responsive mode
2. **Device Presets** - iPhone, iPad, Pixel, Galaxy, and custom dimensions
3. **Built-in Close Button** - X button in the DevTools header
4. **Native Resize** - Drag the border between browser and DevTools
5. **Dock Position Options** - Bottom, Left, Right (via DevTools menu)

---

## Implementation

### Type Definitions

**File**: `src/vs/workbench/contrib/roopik/common/projectModeV2/types.ts`

```typescript
/**
 * DevTools mode configuration
 *
 * - 'attached': DevTools is docked inside the BrowserWindow (bottom).
 *   This gives access to Device Toolbar toggle and close button.
 *   DevTools shares the browser window space.
 *
 * - 'detached': DevTools is rendered in a separate WebContentsView.
 *   We have full control over positioning and sizing.
 *   Device Toolbar toggle is NOT available in this mode.
 */
export type DevToolsMode = 'attached' | 'detached';

/**
 * DevTools open options
 */
export interface DevToolsOptions {
    /**
     * Mode for DevTools rendering
     * - 'attached': Docked inside browser window (has device toolbar, close button)
     * - 'detached': Separate WebContentsView (full control over layout)
     * @default 'attached'
     */
    mode: DevToolsMode;

    /**
     * Bounds for the DevTools view (only used in 'detached' mode)
     * In 'attached' mode, Electron manages the DevTools position
     */
    bounds?: ViewBounds;
}
```

### Configuration Flag

**File**: `src/vs/workbench/contrib/roopik/browser/projectModeV2/projectModeV2Editor.ts`

```typescript
/**
 * DevTools mode configuration flag
 *
 * - 'attached': DevTools docked inside browser window (has Device Toolbar toggle, close button)
 *   Electron manages the DevTools layout. Resize handle is NOT needed.
 *
 * - 'detached': DevTools in separate WebContentsView (full layout control, no Device Toolbar)
 *   We control the DevTools position and size. Resize handle IS needed.
 *
 * TODO: In the future, this will be a user setting preference.
 * For now, we default to 'attached' mode for the Device Toolbar feature.
 */
const DEVTOOLS_MODE: DevToolsMode = 'attached';
```

### Toggle Handler (Renderer Process)

**File**: `projectModeV2Editor.ts`

```typescript
private async toggleDevTools(): Promise<void> {
    if (!this.browserViewId) {
        return;
    }

    if (this.devtoolsVisible) {
        // CLOSE DevTools
        await this.browserService.closeDevTools(this.browserViewId);

        // In detached mode, hide our custom container and resize handle
        if (DEVTOOLS_MODE === 'detached' && this.devtoolsContainer) {
            this.devtoolsContainer.style.display = 'none';
            if (this.devtoolsResizeHandle) {
                this.devtoolsResizeHandle.style.display = 'none';
            }
        }

        this.devtoolsVisible = false;
    } else {
        // OPEN DevTools
        if (DEVTOOLS_MODE === 'attached') {
            // ATTACHED MODE: Electron manages DevTools layout
            // DevTools will dock at bottom of browser window
            // Device Toolbar toggle and close button will be available!
            await this.browserService.openDevTools(this.browserViewId, {
                mode: 'attached'
            });
            this.devtoolsVisible = true;
        } else {
            // DETACHED MODE: We manage DevTools layout
            // (Original implementation - see above documentation)
            // ...
        }
    }
}
```

**Key Insight**: In attached mode, we don't need to:
- Show/hide DOM containers
- Calculate bounds
- Manage resize handles
- Update bounds on window resize

Electron handles ALL of this automatically!

### IPC Layer

**File**: `projectModeV2ServiceBridge.ts`

```typescript
async openDevTools(browserViewId: number, options: DevToolsOptions): Promise<DevToolsViewResult> {
    return this.channel.call('openDevTools', { browserViewId, options });
}
```

**File**: `projectModeV2Channel.ts`

```typescript
case 'openDevTools':
    return this.service.openDevTools(arg.browserViewId, arg.options);
```

### Main Process Handler

**File**: `browserViewServiceV2.ts`

```typescript
async openDevTools(browserViewId: number, options: DevToolsOptions): Promise<DevToolsViewResult> {
    const browserView = this.browserViews.get(browserViewId);
    const window = this.browserWindows.get(browserViewId);

    if (!browserView || !window) {
        throw new Error(`Browser view ${browserViewId} not found`);
    }

    // Validate options
    if (!options || !options.mode) {
        throw new Error(`DevTools options are required`);
    }

    // Close existing DevTools if any
    await this.closeDevTools(browserViewId);

    // Store the mode for this browser view
    this.devtoolsModes.set(browserViewId, options.mode);

    if (options.mode === 'attached') {
        // =========================================================
        // ATTACHED MODE: DevTools docked inside browser window
        // Device Toolbar toggle and close button are available!
        // =========================================================

        // Open DevTools docked at bottom of the browser window
        // This gives us the Device Toolbar toggle and close button
        browserView.webContents.openDevTools({ mode: 'bottom' });

        // In attached mode, we don't create a separate view - Electron manages it
        // Return -1 as devtoolsViewId to indicate attached mode
        return { devtoolsViewId: -1 };
    } else {
        // DETACHED MODE: (Original implementation)
        // Creates separate WebContentsView with setDevToolsWebContents()
        // ...
    }
}
```

---

## Data Flow: Attached Mode

```
User clicks DevTools button
        │
        ▼
browserControlBarV2.ts: onDevTools callback
        │
        ▼
projectModeV2Editor.ts: toggleDevTools()
        │
        └── if (DEVTOOLS_MODE === 'attached')
                │
                ▼
projectModeV2ServiceBridge.ts: openDevTools(browserViewId, { mode: 'attached' })
        │
        ▼ (IPC Channel)
        │
projectModeV2Channel.ts: routes to service
        │
        ▼
browserViewServiceV2.ts: openDevTools()
        │
        └── browserView.webContents.openDevTools({ mode: 'bottom' })
                │
                ▼
Electron docks DevTools at bottom with:
  ✅ Device Toolbar toggle
  ✅ Close button
  ✅ Native resize handle
  ✅ Automatic bounds management
```

---

## Electron DevTools Mode Options

| Mode | Description | Use Case |
|------|-------------|----------|
| `'left'` | Docked to left side | Side-by-side layout |
| `'right'` | Docked to right side | Code inspection focus |
| `'bottom'` | Docked to bottom | **Our default** - best for responsive design |
| `'undocked'` | Separate window | Multi-monitor setups |
| `'detach'` | Required for `setDevToolsWebContents()` | Custom container (no Device Toolbar) |

We use `'bottom'` because:
1. Most familiar layout for web developers
2. Best for responsive design testing (width is preserved)
3. Matches Chrome/Firefox default behavior

---

## Closing DevTools in Attached Mode

```typescript
async closeDevTools(browserViewId: number): Promise<void> {
    const browserView = this.browserViews.get(browserViewId);
    const mode = this.devtoolsModes.get(browserViewId);

    // Close DevTools on browser webContents (works for both modes)
    if (browserView && !browserView.webContents.isDestroyed()) {
        browserView.webContents.closeDevTools();
    }

    // In detached mode, we also need to cleanup our WebContentsView
    if (mode === 'detached') {
        // ... cleanup WebContentsView
    }

    // Clear mode tracking
    this.devtoolsModes.delete(browserViewId);
}
```

In attached mode, closing is simple - just call `closeDevTools()` on the webContents. Electron handles all cleanup.

---

## Future: User Preference Setting

Currently, the mode is controlled by a constant:

```typescript
const DEVTOOLS_MODE: DevToolsMode = 'attached';
```

In the future, this will become a user setting:

```json
{
    "roopik.devtools.mode": "attached" | "detached"
}
```

This allows power users who need custom DevTools layout to use detached mode, while most users benefit from the simpler attached mode with Device Toolbar.

---

## Summary: Why Attached Mode is Better

| Aspect | Before (Detached) | After (Attached) |
|--------|-------------------|------------------|
| **Lines of Code** | ~100+ for resize handling | ~10 lines |
| **Device Toolbar** | ❌ Missing | ✅ Available |
| **Close Button** | ❌ Missing | ✅ Built-in |
| **Resize** | Custom drag handle | Native Electron |
| **Bounds Tracking** | Manual ResizeObserver | Automatic |
| **User Experience** | Functional but limited | Full Chrome DevTools experience |

**The attached mode gives users the complete Chrome DevTools experience they expect, with responsive design tools, device emulation, and native controls - all with simpler code!**
