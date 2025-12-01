# Canvas Interaction Modes

This document describes the three interaction modes in the Roopik Canvas Editor.

---

## Mode Overview

| Mode | Description | Trigger | Exit |
|------|-------------|---------|------|
| **Overview** | Default - see all components | Default state | Auto (from focus/fullscreen) |
| **Focus** | Zoomed on one component | Double-click sandbox | Double-click again |
| **Fullscreen** | Component takes full screen | Click expand button (↗) | ESC or close button |

---

## 1. Overview Mode (Default)

**State**: `interactionMode = 'overview'`

### Description
The default canvas state where users can see all components as thumbnails on the infinite canvas.

### Features
- Pan canvas (click and drag)
- Zoom canvas (scroll wheel or pinch)
- See all sandboxes as glass-morphism cards
- Select sandboxes (single click)
- Drag sandboxes to reposition
- All UI visible: floating toolbar, action bars, status panel

### User Actions
- **Single click** on sandbox → Select (brings to front)
- **Double click** on sandbox → Enter Focus Mode
- **Click reload button (↻)** → Re-render component (fixes CDN errors)
- **Click expand button (↗)** → Enter Fullscreen Mode
- **Drag sandbox label** → Reposition
- **Scroll wheel** → Zoom in/out
- **Click + drag canvas** → Pan

### Code Location
- State managed in `canvasEditor.ts`
- No special handling needed (default state)

---

## 2. Focus Mode

**State**: `interactionMode = 'focus'`, `focusedSandboxId = <id>`

### Description
Zooms and centers the canvas on a single component for closer inspection while keeping the canvas context visible.

### Features
- Canvas viewport animates to center the focused component
- Component takes ~70% of screen space
- Previous viewport position is saved for restoration
- All UI remains visible
- Other sandboxes visible but dimmed/smaller due to zoom

### User Actions
- **Double click focused sandbox** → Exit to Overview Mode (restores previous viewport)
- **Double click different sandbox** → Focus on that sandbox instead
- **Click expand button (↗)** → Enter Fullscreen Mode (from focus)

### State Variables
```typescript
focusedSandboxId: string | null     // ID of focused sandbox
preFocusViewport: CanvasViewport    // Saved viewport before focus
```

### Code Flow
1. `focusSandbox(id)` called on double-click
2. Saves current viewport to `preFocusViewport`
3. Calculates focus viewport using `gridManager.calculateFocusViewport()`
4. Animates transition with `animateViewportTransition()`
5. Sets `interactionMode = 'focus'`

### Exit Flow
1. `unfocusSandbox()` called on second double-click
2. Animates back to `preFocusViewport`
3. Clears `focusedSandboxId` and `preFocusViewport`
4. Sets `interactionMode = 'overview'`

### Code Location
- `canvasEditor.ts`: `focusSandbox()`, `unfocusSandbox()`, `animateViewportTransition()`
- `gridManager.ts`: `calculateFocusViewport()`

---

## 3. Fullscreen Mode

**State**: `interactionMode = 'fullscreen'`, `editorFullscreen` active

### Description
Opens the component in an editor-contained fullscreen overlay for detailed viewing and future editing capabilities. Activity bar and sidebar remain accessible.

### Features
- Component renders in editor-contained overlay (position: absolute, z-index: 100)
- Canvas UI is hidden (except bottom action bar)
- Device presets for responsive preview (scale to fit while maintaining aspect ratio):
  - **Auto**: Fills available space
  - **Desktop**: 1280×800px (max, scales down on smaller screens)
  - **Tablet**: 768×1024px (max, scales down on smaller screens)
  - **Mobile**: 375×667px (max, scales down on smaller screens)
- Size indicator shows actual dimensions and scale percentage
- Native browser zoom (Ctrl+/-, pinch) works inside webview
- ESC key to exit
- New webview instance (independent from canvas sandbox)
- Responsive resize handling - updates dimensions on window resize

### User Actions
- **Click device buttons** → Switch preview size (scales to fit)
- **Click reload button** → Re-render component (fixes CDN errors)
- **Ctrl+/- or pinch** → Native browser zoom inside webview
- **Press ESC** → Exit to previous mode
- **Click X button** → Exit to previous mode

### UI Components
```
┌───────────────────────────────────────────────────────────────────────────┐
│ [Component Name]    [Auto][Desktop][Tablet][Mobile] 1024×640 (4:5) [↻][X] │
├───────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│                                                                           │
│                    ┌───────────────┐                                      │
│                    │               │                                      │
│                    │   Component   │  ← Scales to fit available space     │
│                    │   Preview     │    while maintaining aspect ratio    │
│                    │               │    (never scales up beyond 1:1)      │
│                    └───────────────┘                                      │
│                                                                           │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘

[↻] = Reload button (re-renders component, useful for CDN errors)
[X] = Close button (ESC also works)
Size indicator shows ratio (e.g., 1:1, 4:5, 3:4) instead of percentage
```

### State Variables
```typescript
editorFullscreen: EditorFullscreen | undefined  // Fullscreen instance
```

### Code Flow
1. `expandSandbox(id)` called when expand button clicked
2. Sets `interactionMode = 'fullscreen'`
3. Hides canvas UI with `setCanvasUIVisibility(false)` (except bottom action bar)
4. Creates `EditorFullscreen` instance
5. Fullscreen creates its own webview and renders component

### Exit Flow
1. `exitFullscreenMode()` called (via ESC or close button)
2. Disposes `editorFullscreen`
3. Restores `interactionMode` based on `focusedSandboxId`
4. Shows canvas UI with `setCanvasUIVisibility(true)`

### Code Location
- `canvasEditor.ts`: `expandSandbox()`, `exitFullscreenMode()`, `setCanvasUIVisibility()`
- `editorFullscreen.ts`: Full implementation of fullscreen UI

---

## Mode Transitions

```
                    ┌──────────────┐
                    │              │
       ┌───────────►│   Overview   │◄───────────┐
       │            │              │            │
       │            └──────┬───────┘            │
       │                   │                    │
       │           double-click                 │
       │                   │                    │
       │                   ▼                    │
       │            ┌──────────────┐            │
  double-click      │              │       ESC/close
  (same sandbox)    │    Focus     │            │
       │            │              │            │
       │            └──────┬───────┘            │
       │                   │                    │
       │            expand button               │
       │                   │                    │
       │                   ▼                    │
       │            ┌──────────────┐            │
       └────────────│              │────────────┘
                    │  Fullscreen  │
                    │              │
                    └──────────────┘
```

---

## Implementation Files

| File | Purpose |
|------|---------|
| `canvasEditor.ts` | Main editor, mode state management |
| `sandboxCard.ts` | Sandbox UI, triggers for focus/expand |
| `editorFullscreen.ts` | Editor-contained fullscreen mode |
| `gridManager.ts` | Viewport calculations for focus mode |
| `floatingToolbar.ts` | Top toolbar (hidden in fullscreen) |
| `bottomActionBar.ts` | Bottom action bar (visible in fullscreen) |
| `canvasActionButtons.ts` | Action buttons (hidden in fullscreen) |
| `canvasStatusPanel.ts` | Status panel (hidden in fullscreen) |

---

## Future Enhancements

### Focus Mode
- [ ] Dim other sandboxes when focused
- [ ] Quick navigation to adjacent components
- [ ] Mini-map showing position in canvas

### Fullscreen Mode
- [ ] Inspect mode integration (click elements to inspect)
- [ ] Edit mode (modify component code)
- [ ] Live style editing
- [ ] Screenshot capture
- [ ] Export component
- [ ] Split view (code + preview)

---

*Last updated: November 2024*
