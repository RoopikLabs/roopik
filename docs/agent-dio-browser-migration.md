# Agent-Dio Browser Architecture Analysis & Migration Plan

## Migration Status: COMPLETED

**Date:** December 2024

### What We Did

Instead of redirecting their `browser_action` tool to our Roopik tools (which would require adapter code), we simply **disabled their native browser tool**. Since our Roopik browser tools are already integrated via the `roopik` tool group, the AI agent now automatically uses our superior browser implementation.

### Files Changed

| File | Change |
|------|--------|
| `core/prompts/tools/native-tools/index.ts` | Commented out `browserAction` import and removed from tools array |
| `core/prompts/tools/index.ts` | Commented out `getBrowserActionDescription` import and map entry |
| `core/assistant-message/presentAssistantMessage.ts` | Commented out `browserActionTool` import and case handler |
| `core/assistant-message/NativeToolCallParser.ts` | Commented out both `browser_action` case blocks |
| `shared/tools.ts` | Emptied the `browser` group: `tools: []` |
| `webview/.../SettingsView.tsx` | Commented out Browser Settings tab (import, section name, icon, content) |

### How It Works Now

- The `browser` tool group is now empty (`tools: []`)
- All modes (architect, code, ask, debug) still reference `browser` group but get nothing from it
- All modes also reference `roopik` group which provides our 12 browser tools
- Agent only sees Roopik browser tools: `browser_open`, `browser_screenshot`, `browser_action_input`, etc.
- No adapter code needed - our tools work as-is

### Why This Approach

1. **Zero adapter code** - No need to map their result format to ours
2. **Clean separation** - Their Puppeteer code is disconnected but preserved
3. **Minimal changes** - Just comment out, easy to revert if needed
4. **Future-proof** - Their `BrowserSession.ts` still exists for reference

---

## Overview

Agent-dio (fork of roo-code) has its own embedded browser system using Puppeteer. Since Roopik IDE has a native browser (Electron BrowserView), we need to disconnect their browser and connect to ours.

---

## Their Browser Architecture

### Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| Browser Engine | `puppeteer-core` v23.4.0 | Headless Chromium automation |
| Chromium Resolver | `puppeteer-chromium-resolver` v24.0.0 | Auto-download Chromium binary |
| Storage | `globalStoragePath/puppeteer/.chromium-browser-snapshots` | ~170MB Chromium binary |

### Key Characteristics

- **Headless**: Browser is invisible to user
- **Agent-only**: Only the AI agent sees screenshots
- **No user interaction**: User cannot click/scroll in the browser
- **WebP screenshots**: Uses WebP at 75% quality for smaller payloads
- **Cursor indicator**: Draws SVG cursor on screenshots to show mouse position

### Main Files

```
extensions/roopik-dio/
├── src/services/browser/
│   ├── BrowserSession.ts       # Puppeteer wrapper (911 lines)
│   └── browserDiscovery.ts     # Remote Chrome detection
├── src/core/tools/
│   └── BrowserActionTool.ts    # Tool executor (284 lines)
├── webview/src/components/settings/
│   └── BrowserSettings.tsx     # Settings UI
└── src/shared/
    └── browserUtils.ts         # Coordinate scaling
```

---

## Their Tool: `browser_action`

Single unified tool with 10 actions:

| Action | Implementation | Parameters |
|--------|---------------|------------|
| `launch` | `launchBrowser()` + `navigateToUrl()` | `url` (required) |
| `click` | `page.mouse.click(x, y)` | `coordinate` ("x,y@WIDTHxHEIGHT") |
| `hover` | `page.mouse.move(x, y)` | `coordinate` |
| `type` | `page.keyboard.type(text)` | `text` |
| `press` | `page.keyboard.press(key)` with modifiers | `text` (e.g., "Ctrl+C") |
| `scroll_down` | `window.scrollBy(0, viewportHeight)` | none |
| `scroll_up` | `window.scrollBy(0, -viewportHeight)` | none |
| `resize` | `page.setViewport()` | `size` ("width,height") |
| `screenshot` | `page.screenshot({ path })` | `path` (file path) |
| `close` | `browser.close()` | none |

### Coordinate System

Format: `"x,y@WIDTHxHEIGHT"` where WIDTH/HEIGHT are screenshot dimensions

```typescript
// Example: Click at (450, 300) on a 1000x625 screenshot
coordinate = "450,300@1000x625"

// Scaled to actual viewport (900x600):
scaledX = (450 / 1000) * 900 = 405
scaledY = (300 / 625) * 600 = 288
```

This is necessary because:
1. Screenshot is captured at one size
2. API may downscale the image for the LLM
3. LLM reports coordinates on the downscaled image
4. Agent must scale back to actual viewport

---

## Their Settings

Stored in `globalState`:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `browserToolEnabled` | boolean | true | Enable/disable browser tool |
| `browserViewportSize` | string | "900x600" | Viewport dimensions |
| `screenshotQuality` | number | 75 | WebP quality (1-100) |
| `remoteBrowserEnabled` | boolean | false | Use remote Chrome |
| `remoteBrowserHost` | string | undefined | Remote Chrome URL |

### Viewport Options

- 1280x800 (Large Desktop)
- 900x600 (Small Desktop) - default
- 768x1024 (Tablet)
- 360x640 (Mobile)

---

## Our Browser Architecture (Roopik)

### Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| Browser Engine | Electron WebContentsView | Real browser in IDE |
| Automation | CDP via `webContents.debugger` | Chrome DevTools Protocol |
| UI | Editor pane in VSCode | User can see and interact |

### Key Characteristics

- **Visible**: Browser is visible to user in editor pane
- **Interactive**: User can click, scroll, type in browser
- **Real DevTools**: Full Chrome DevTools available
- **CSS Source Mapping**: THE MOAT - maps styles to source files
- **PNG screenshots**: Returns base64 data URL (not file)

### Main Files

```
src/vs/workbench/contrib/roopik/
├── electron-main/projectMode/
│   └── browserViewService.ts    # Main browser service
├── electron-main/channel/
│   └── roopikToolsChannel.ts    # Tool executor
├── electron-main/mcp/tools/
│   └── browserTools.ts          # MCP tool registration
└── browser/commands/
    └── roopikToolsCommands.ts   # VSCode command bridge
```

---

## Our Tools (12 Browser Tools)

| Tool | Description | Status |
|------|-------------|--------|
| `browser_open` | Open browser editor, optionally navigate | Ready |
| `browser_close` | Close browser (proper cleanup chain) | Ready |
| `browser_navigate` | Navigate to URL | Ready |
| `browser_reload` | Reload page (optional hard reload) | Ready |
| `browser_screenshot` | Take screenshot with viewport metadata | Ready |
| `browser_action_input` | Click, hover, type, press, scroll, drag | Ready |
| `browser_execute_script` | Execute JavaScript | Ready |
| `browser_inspect_element` | Deep CSS inspection (THE MOAT) | Ready |
| `browser_get_errors` | Console + network errors | Ready |
| `browser_get_console_logs` | Console logs | Ready |
| `browser_get_performance` | Web Vitals metrics | Ready |
| `browser_get_cdp_info` | CDP connection info | Ready |

### Our Coordinate System

Same format: `"x,y@WIDTHxHEIGHT"`

Our `sendMouseEvent` in `browserViewService.ts` handles scaling:
```typescript
async sendMouseEvent(
    browserViewId: number,
    action: 'click' | 'right_click' | 'double_click' | 'hover' | ...,
    x: number,
    y: number,
    refWidth?: number,   // Screenshot width
    refHeight?: number   // Screenshot height
)
```

---

## Tool Mapping: Theirs vs Ours

| Their Action | Our Equivalent | Notes |
|--------------|---------------|-------|
| `launch` | `browser_open` + `browser_navigate` | We separate open and navigate |
| `click` | `browser_action_input` (action: click) | Same coordinate format |
| `hover` | `browser_action_input` (action: hover) | Same coordinate format |
| `type` | `browser_action_input` (action: type) | Same text parameter |
| `press` | `browser_action_input` (action: press) | We use `key` + `modifiers` |
| `scroll_down` | `browser_action_input` (action: scroll) | We use `deltaY: +pixels` |
| `scroll_up` | `browser_action_input` (action: scroll) | We use `deltaY: -pixels` |
| `resize` | **MISSING** | Need to add |
| `screenshot` | `browser_screenshot` | We return data URL, they save to file |
| `close` | `browser_close` | Same |

### Missing from Ours

1. **`resize`** - Set viewport size
   - They: `page.setViewport({ width, height })`
   - We need: Add to `browserViewService.ts`

2. **Screenshot to file** - Save screenshot to disk
   - They: Save directly to file path
   - We: Return base64 data URL (agent can save if needed)

---

## Key Differences

### Screenshot Format

**Theirs (Puppeteer)**:
```typescript
// WebP with quality setting
screenshot = await page.screenshot({
    type: "webp",
    quality: screenshotQuality ?? 75,
    encoding: "base64"
})
return `data:image/webp;base64,${screenshot}`
```

**Ours (Electron)**:
```typescript
// PNG (Electron's capturePage returns PNG)
const image = await browserView.webContents.capturePage()
return image.toDataURL()  // data:image/png;base64,...
```

### Viewport Metadata

**Theirs**: Returns from page.viewport()
```typescript
return {
    screenshot,
    viewportWidth: viewport?.width,
    viewportHeight: viewport?.height,
    currentMousePosition
}
```

**Ours**: Returns CSS viewport from window
```typescript
return {
    image: image.toDataURL(),
    width: viewportWidth,      // window.innerWidth
    height: viewportHeight,    // window.innerHeight
    devicePixelRatio
}
```

### Browser Lifecycle

**Theirs**:
```
launch → navigateToUrl → (actions) → close
         ↓
    Puppeteer downloads Chromium if needed
    Launches headless browser
    Creates new page
```

**Ours**:
```
browser_open → browser_navigate → (actions) → browser_close
    ↓
    Opens editor tab with BrowserView
    User sees the browser
    Uses existing Electron renderer
```

---

## Migration Strategy

### Option 1: Redirect `browser_action` to Roopik (Recommended)

Modify `BrowserActionTool.ts` to call `RoopikToolClient` instead of `BrowserSession`:

```typescript
// BEFORE (Puppeteer)
case "launch":
    await cline.browserSession.launchBrowser()
    browserActionResult = await cline.browserSession.navigateToUrl(url)
    break

// AFTER (Roopik)
case "launch":
    await roopikClient.browserOpen(url)
    browserActionResult = { /* format result */ }
    break
```

**Pros**:
- Minimal changes to agent prompts
- Keep their settings UI (disable remote browser)
- Gradual migration

**Cons**:
- Need to map result formats

### Option 2: Replace Tool Entirely

Remove `browser_action` tool, use only Roopik tools.

**Pros**:
- Clean separation
- More capabilities (inspect, errors, performance)

**Cons**:
- Need to update all agent prompts
- Breaking change

---

## Files to Modify

### For Option 1 (Redirect)

| File | Changes |
|------|---------|
| `BrowserActionTool.ts` | Replace `cline.browserSession.*` with `roopikClient.*` |
| `BrowserSettings.tsx` | Hide remote browser options (not applicable) |
| `BrowserSession.ts` | Keep but don't use (for reference) |
| `Task.ts` | Remove `browserSession` initialization |

### Settings to Keep

- `browserToolEnabled` - Enable/disable browser
- `browserViewportSize` - Pass to resize tool (when we add it)
- `screenshotQuality` - We use PNG, but could add WebP later

### Settings to Remove/Hide

- `remoteBrowserEnabled` - Not applicable (we use Electron)
- `remoteBrowserHost` - Not applicable

---

## Result Format Mapping

### Their Result

```typescript
interface BrowserActionResult {
    screenshot?: string           // data:image/webp;base64,...
    logs?: string                 // Console logs joined with \n
    currentUrl?: string           // Current page URL
    currentMousePosition?: string // "x,y"
    viewportWidth?: number        // Viewport width
    viewportHeight?: number       // Viewport height
}
```

### Our Result

```typescript
interface RoopikToolResult<T> {
    success: boolean
    data?: T
    error?: string
}

// Screenshot data
interface ScreenshotData {
    image: string              // data:image/png;base64,...
    format: "data-url"
    viewport?: {
        width: number
        height: number
        devicePixelRatio: number
    }
}
```

### Adapter Function

```typescript
function convertToTheirFormat(roopikResult: RoopikToolResult): BrowserActionResult {
    if (!roopikResult.success) {
        return { logs: `Error: ${roopikResult.error}` }
    }

    const data = roopikResult.data as ScreenshotData
    return {
        screenshot: data.image,
        viewportWidth: data.viewport?.width,
        viewportHeight: data.viewport?.height,
        // currentUrl and currentMousePosition need to be tracked separately
    }
}
```

---

## Unique Roopik Features (Not in Puppeteer)

1. **CSS Source Mapping** (`browser_inspect_element`)
   - Returns which CSS file/line defines each style
   - Handles SCSS, CSS-in-JS, inline styles
   - THE MOAT - no other tool has this

2. **Web Vitals** (`browser_get_performance`)
   - LCP, FID, CLS, FCP, TTFB metrics
   - Performance insights for optimization

3. **Console/Error Separation** (`browser_get_errors`, `browser_get_console_logs`)
   - Separate tools for errors vs logs
   - Filter by type (warn, error, etc.)

4. **Script Execution** (`browser_execute_script`)
   - Run arbitrary JavaScript
   - Get return value

5. **User Visibility**
   - User can see what agent is doing
   - User can intervene if needed

---

## Next Steps

1. Add `resize` tool to our browser
2. Modify `BrowserActionTool.ts` to use `RoopikToolClient`
3. Update `BrowserSettings.tsx` to hide irrelevant options
4. Test all actions work through the redirect
5. Eventually deprecate `BrowserSession.ts`
