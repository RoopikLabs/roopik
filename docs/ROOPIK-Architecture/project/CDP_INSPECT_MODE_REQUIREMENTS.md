# CDP Inspect Mode - Requirements & Architecture

## Overview

This document captures requirements, learnings, and architecture decisions for the CDP-based inspect mode migration in Roopik.

---

## Current State (Before Migration)

### Old Approach: Script Injection + Polling

**How it worked:**
1. Inject JavaScript into browser via `executeScript()`
2. Script creates DOM overlay elements for highlighting
3. Script listens for mouse events (hover, click)
4. On click, stores result in `window.__roopikStyleInspectResult`
5. Renderer polls every 100ms to check for results
6. Script shows toast notifications in the browser

**Problems:**
- ❌ Polling is inefficient and wasteful
- ❌ Console.log leaks to DevTools (unprofessional)
- ❌ Injected script visible in DevTools Sources panel
- ❌ Limited highlighting (outline only, no margin/padding/content visualization)
- ❌ Two separate modes: "Inspect" (copy HTML) and "Style Inspect" (CSS panel)
- ❌ No native feel - custom overlay looks different from Chrome DevTools

### Two Separate Icons
1. **Inspect Mode** (`Codicon.inspect`): Copies `outerHTML` to clipboard
2. **Style Inspect** (`Codicon.symbolColor`): Opens CSS sources panel

---

## Requirements

### Functional Requirements

#### FR1: Unified Inspect Mode
- Single icon in toolbar that combines both copy + style panel
- Click element → copies CSS selector + opens style panel
- No more two separate modes

#### FR2: CDP-Based Highlighting
- Use CDP `Overlay.setInspectMode` for hover highlighting
- Native DevTools-quality highlighting showing:
  - Content area (blue)
  - Padding (green)
  - Border (yellow)
  - Margin (orange)
- Element info tooltip on hover

#### FR3: Event-Driven Architecture
- No polling! Use CDP events:
  - `Overlay.inspectNodeRequested` → element clicked
  - `before-input-event` → keyboard events (ESC to exit)
- Zero script injection for inspect mode

#### FR4: Selection Persistence
- After clicking element:
  - Disable hover highlighting
  - Show persistent "selected" highlight (different from hover)
  - User can move mouse without losing selection
- Selection clears when:
  - User presses ESC
  - User closes panel
  - User selects new element (re-enable inspect mode first)

#### FR5: Custom Selection Style
- Selected element should have distinct visual style
- Differentiate from Chrome's native inspect (our branding)
- Options explored:
  - Dotted blue outline (like Cursor) - **CDP doesn't support this natively**
  - Solid blue outline only (no fill colors) - **Works with CDP**
  - Custom DOM overlay for selection - **Future enhancement**

#### FR6: Future Features Foundation
- Drag-and-drop elements (need persistent selection)
- AI agent integration (tools for inspect, get styles, etc.)
- AST tree panel
- Live CSS editing

### Non-Functional Requirements

#### NFR1: No Console Pollution
- No console.log visible in browser DevTools
- All logging only in VS Code's Developer Console

#### NFR2: No Visible Injection
- Nothing visible in browser's Sources panel
- Clean, professional appearance

#### NFR3: Performance
- Event-driven, zero polling
- Minimal IPC calls

---

## Architecture

### Process Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Renderer Process (browser/)                                 │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  StyleInspect Feature                                    ││
│  │  - Subscribes to CDP events via IPC                     ││
│  │  - Manages StyleInspectPanel UI                         ││
│  │  - Coordinates enable/disable flow                      ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                              │ IPC Events
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Main Process (electron-main/)                               │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  BrowserViewService                                      ││
│  │  - Manages CDP debugger attachment                      ││
│  │  - Sends CDP commands (Overlay, DOM, CSS domains)       ││
│  │  - Listens for CDP events                               ││
│  │  - Fires IPC events to renderer                         ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                              │ CDP
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  BrowserView (Chromium)                                      │
│  - CDP Overlay domain handles highlighting                  │
│  - CDP DOM domain provides node info                        │
│  - CDP CSS domain provides style info                       │
└─────────────────────────────────────────────────────────────┘
```

### CDP Domains Used

| Domain | Purpose |
|--------|---------|
| `Overlay` | Element highlighting, inspect mode |
| `DOM` | Node traversal, attributes, document tree |
| `CSS` | Stylesheet info, matched styles, source maps |

### Key CDP Commands

```typescript
// Enable inspect mode with hover highlighting
Overlay.setInspectMode({
  mode: 'searchForNode',
  highlightConfig: {
    showInfo: true,
    contentColor: { r: 111, g: 168, b: 220, a: 0.66 },
    paddingColor: { r: 147, g: 196, b: 125, a: 0.55 },
    borderColor: { r: 255, g: 229, b: 153, a: 0.66 },
    marginColor: { r: 246, g: 178, b: 107, a: 0.66 }
  }
})

// Disable inspect mode
Overlay.setInspectMode({ mode: 'none', highlightConfig: {} })

// Highlight specific element (for selection)
Overlay.highlightNode({
  nodeId: 123,
  highlightConfig: { /* custom config */ }
})

// Clear highlight
Overlay.hideHighlight()

// Get document root (required before DOM operations)
DOM.getDocument({ depth: 0 })

// Convert backendNodeId to nodeId
DOM.pushNodesByBackendIdsToFrontend({ backendNodeIds: [456] })

// Get element attributes
DOM.getAttributes({ nodeId: 123 })
```

### Key CDP Events

```typescript
// Fired when user clicks element in inspect mode
Overlay.inspectNodeRequested → { backendNodeId: number }

// Keyboard events captured via Electron
webContents.on('before-input-event', (event, input) => {
  // Capture ESC, shortcuts, etc.
})
```

---

## Learnings from Failed Attempt

### What Went Wrong

1. **Too many changes at once** - Modified 8+ files simultaneously
2. **Lost track of flow** - Hard to debug when multiple pieces changed
3. **CDP highlight limitations** - Didn't realize CDP doesn't support dotted outlines
4. **Race conditions** - Calling highlight before inspect mode disabled

### CDP Limitations Discovered

1. **No dotted/dashed borders** for element highlights (only for CSS Grid)
2. **Single highlight at a time** - Can't show both hover and selection
3. **Must call DOM.getDocument first** - Before any DOM operations
4. **backendNodeId vs nodeId** - Need to convert using `pushNodesByBackendIdsToFrontend`

### What Cursor Does (Speculation)

Cursor likely uses:
- CDP for getting element info (DOM, CSS domains)
- **Custom DOM overlay** for the dotted outline visualization
- Their own script injection for the selection highlight
- CDP inspect mode disabled, custom hover handling

This gives them full control over the visual style while still using CDP for data.

---

## Implementation Plan

### Phase 1: CDP Foundation
1. Add CDP event infrastructure to BrowserViewService
2. Add IPC events: `onInspectElementSelected`, `onBrowserKeyEvent`
3. Add CDP methods: `enableInspectMode`, `disableInspectMode`, `highlightElement`, `clearHighlight`
4. Test: Verify CDP events fire correctly

### Phase 2: Basic Inspect Mode
1. Update StyleInspect to use CDP events (remove polling)
2. Enable CDP inspect mode on icon click
3. Handle `inspectNodeRequested` event
4. Get element styles via existing `getElementStyles` IPC
5. Test: Click element, see style panel

### Phase 3: Merge Icons
1. Remove old InspectMode class (script injection)
2. Single icon triggers CDP-based StyleInspect
3. Add selector copy to clipboard on element select
4. Test: Single icon, copies selector + shows panel

### Phase 4: Selection Highlight
1. Implement selection highlight (CDP `highlightNode` with distinct style)
2. Disable inspect mode after selection (so highlight persists)
3. Clear selection on ESC or panel close
4. Test: Selection persists when moving mouse

### Phase 5: Custom Visual Style (Future)
1. Create custom DOM overlay for selection (dotted outline)
2. Inject minimal script for overlay management
3. Use CDP for data, custom overlay for visuals
4. Test: Dotted blue outline like Cursor

---

## Files to Modify

### Main Process (electron-main/)
- `browserViewService.ts` - CDP commands and events

### Common (shared types)
- `projectMode/types.ts` - Event types
- `projectMode/ipc.ts` - Service interface

### IPC Channel
- `projectModeChannel.ts` - Route new methods

### Renderer (browser/)
- `serviceBridge.ts` - Client proxy
- `features/styleInspect.ts` - Main feature class
- `editor.ts` - Toolbar config
- `components/browserControlBar.ts` - Icon configuration

### Remove
- `features/inspectMode.ts` - Old script injection approach

---

## Testing Checklist

- [ ] CDP debugger attaches successfully
- [ ] Hover highlighting shows margin/padding/content/border
- [ ] Click fires `onInspectElementSelected` event
- [ ] ESC key fires `onBrowserKeyEvent`
- [ ] Style panel opens with correct element info
- [ ] Selector copied to clipboard
- [ ] Selection highlight visible after click
- [ ] Selection persists when moving mouse
- [ ] Selection clears on ESC
- [ ] No console.log in browser DevTools
- [ ] No injected scripts in Sources panel

---

## References

- [CDP Overlay Domain](https://chromedevtools.github.io/devtools-protocol/tot/Overlay/)
- [CDP DOM Domain](https://chromedevtools.github.io/devtools-protocol/tot/DOM/)
- [CDP CSS Domain](https://chromedevtools.github.io/devtools-protocol/tot/CSS/)
- [Electron Debugger API](https://www.electronjs.org/docs/latest/api/debugger)

---

*Document created: December 2024*
*Last updated: December 2024*
