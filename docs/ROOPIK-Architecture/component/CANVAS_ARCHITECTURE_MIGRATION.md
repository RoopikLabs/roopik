# Canvas Architecture Migration Plan

> **Goal**: Migrate canvas UI rendering to a VSCode extension while keeping backend services in core for a hybrid architecture that solves webview persistence issues.

---

## Problem Statement

### Current Issue
When switching tabs in VSCode, canvas components **vanish** because:
1. VSCode's `EditorPane` removes DOM elements when tab loses focus
2. Plain `HTMLIFrameElement` content is lost when detached from DOM
3. `IWebviewElement` has restrictions that limit our use cases
4. Re-rendering on every tab switch is a **performance cost**

### Why Extensions Don't Have This Issue
Extension webviews use `WebviewView` or `WebviewPanel` which:
- Persist content across tab switches
- Have their own CSP (no core modifications needed)
- Maintain iframe state properly

---

## Solution: Hybrid Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    extensions/roopik/                            │
│                    (Canvas UI + Real-time Logic)                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  Webview Panel (persists across tab switches!)              ││
│  │  • Infinite canvas rendering                                ││
│  │  • Sandbox cards (iframe components)                        ││
│  │  • Fullscreen editor                                        ││
│  │  • Toolbars, action bars, status panels                     ││
│  │  • GridManager (snap, collision, layout) ← 60fps required!  ││
│  │  • Viewport math (pan/zoom)                                 ││
│  └─────────────────────────────────────────────────────────────┘│
└──────────────────────────┬──────────────────────────────────────┘
                           │ Commands / Events / IPC
                           │ (only final positions, not every frame)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│              src/vs/workbench/contrib/roopik/                    │
│              (EXISTING - Persistence & Heavy Processing)         │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  • sandboxPipelineService (code transformation)             ││
│  │  • canvasStateService (save/load positions to disk)         ││
│  │  • roopikEventService (event bus)                           ││
│  │  • electron-main/sandboxPipeline (ESBuild bundling)         ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

---

## The Golden Rule: "Who needs to know *during* the drag?"

This principle determines what goes where:

| Scenario | Extension (60fps) | Core (async) |
|----------|-------------------|--------------|
| **During drag** | GridManager calculates snap every 16ms | ❌ Too slow via IPC |
| **After drop** | Sends final `{x: 100, y: 200}` | Saves to `.roopik` file |
| **Pan/zoom** | Viewport math runs locally | ❌ Would feel "floaty" |
| **Code transform** | Requests transform | ESBuild processes code |

**If GridManager was in Core:**
```
Mouse move → IPC → Core calculates → IPC → Extension renders
           ~5ms    ~1ms              ~5ms   = 11ms per frame = LAGGY
```

**With GridManager in Extension:**
```
Mouse move → GridManager.snap() → Render
           ~0.1ms                = INSTANT
```

---

## Extension Structure

```
extensions/roopik/
├── package.json                    # Extension manifest
├── tsconfig.json                   # TypeScript config
├── esbuild.js                      # Build config
├── .vscodeignore                   # Package exclusions
│
├── src/
│   ├── extension.ts                # Extension entry point
│   ├── canvasPanel.ts              # Webview panel + message routing
│   ├── config.ts                   # Configuration manager
│   ├── logger.ts                   # Logging utility
│   │
│   └── services/
│       ├── CoreBridgeService.ts    # Bridge to core services (transform, save)
│       └── CanvasStateManager.ts   # File-based canvas persistence
│
└── webview/                        # React webview application
    ├── index.html                  # Webview HTML entry
    ├── index.tsx                   # React entry point
    ├── vite.config.ts              # Vite build config
    │
    ├── App.tsx                     # Main app component
    │
    └── src/
        ├── canvasView/
        │   ├── CanvasView.tsx      # Main canvas view
        │   ├── StatusPanel.tsx     # Status display
        │   └── FloatingToolbar.tsx # Toolbar component
        │
        └── sandboxCard/
            ├── SandboxCard.tsx     # Component card wrapper
            └── FullscreenOverlay.tsx # Fullscreen editor
```

---

## Migration Mapping

### UI + Real-time Logic (Move to Extension)

| Current File | New Location | Notes |
|--------------|--------------|-------|
| `canvasEditor.ts` | `panels/CanvasPanel.ts` | WebviewViewProvider |
| `sandboxCard.ts` | `webview/components/SandboxCard/` | React component |
| `editorFullscreen.ts` | `webview/components/EditorFullscreen/` | React component |
| `floatingToolbar.ts` | `webview/components/Toolbar/FloatingToolbar.tsx` | React component |
| `bottomActionBar.ts` | `webview/components/Toolbar/BottomActionBar.tsx` | React component |
| `canvasActionButtons.ts` | Merged into toolbar components | Simplified |
| `canvasStatusPanel.ts` | `webview/components/StatusPanel/` | React component |
| `sandboxRenderer.ts` | Logic in `SandboxCard.tsx` | Inlined |
| `deviceIcons.ts` | `webview/components/StatusPanel/DeviceSelector.tsx` | React component |
| `confirmDialog.ts` | `webview/components/shared/ConfirmDialog.tsx` | React component |
| **`gridManager.ts`** | **`src/services/GridManager.ts`** | **60fps snap/collision** |

### Persistence & Heavy Processing (Stay in Core)

| File | Location | Exposed Via | Why Core? |
|------|----------|-------------|-----------|
| `sandboxPipelineService.ts` | `common/sandboxPipeline/` | Commands | Heavy ESBuild processing |
| `canvasStateService.ts` | `browser/services/` | Commands | File I/O, save/load state |
| `roopikEventService.ts` | `browser/services/` | Events | Cross-extension events |
| `canvasTypes.ts` | `common/canvas/` | Shared types | Type definitions |
| `electron-main/sandboxPipeline/` | Main process | IPC | Node.js ESBuild |

**Note:** `gridManager.ts` moves to Extension because it needs 60fps performance for drag snapping. Core only receives **final positions** after user drops the element.

---

## Communication Protocol

### 1. Extension ↔ Core (Commands)

```typescript
// === CORE: Register commands in roopik.contribution.ts ===

import { registerAction2 } from 'vs/platform/actions/common/actions';

// Transform code command (heavy ESBuild processing)
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'roopik.core.transformCode',
            title: 'Transform Code',
            f1: false
        });
    }
    async run(accessor: ServicesAccessor, code: string, options: TransformOptions): Promise<TransformResult> {
        const pipelineService = accessor.get(ISandboxPipelineService);
        return await pipelineService.transform(code, options);
    }
});

// Save canvas state (persistence)
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'roopik.core.saveCanvasState',
            title: 'Save Canvas State',
            f1: false
        });
    }
    async run(accessor: ServicesAccessor, canvasId: string, state: CanvasState): Promise<void> {
        const canvasStateService = accessor.get(ICanvasStateService);
        return await canvasStateService.save(canvasId, state);
    }
});

// Load canvas state (persistence)
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'roopik.core.loadCanvasState',
            title: 'Load Canvas State',
            f1: false
        });
    }
    async run(accessor: ServicesAccessor, canvasId: string): Promise<CanvasState> {
        const canvasStateService = accessor.get(ICanvasStateService);
        return await canvasStateService.load(canvasId);
    }
});
```

```typescript
// === EXTENSION: Call commands in CoreBridgeService.ts ===

import * as vscode from 'vscode';

export class CoreBridgeService {
    // Heavy processing - goes to Core
    async transformCode(code: string, options: TransformOptions): Promise<TransformResult> {
        return await vscode.commands.executeCommand('roopik.core.transformCode', code, options);
    }

    // Persistence - goes to Core (after user drops element)
    async saveCanvasState(canvasId: string, state: CanvasState): Promise<void> {
        return await vscode.commands.executeCommand('roopik.core.saveCanvasState', canvasId, state);
    }

    async loadCanvasState(canvasId: string): Promise<CanvasState> {
        return await vscode.commands.executeCommand('roopik.core.loadCanvasState', canvasId);
    }
}
```

```typescript
// === EXTENSION: GridManager stays LOCAL for 60fps performance ===

// src/services/GridManager.ts
export class GridManager {
    private gridSize: number = 20;
    private mode: 'free' | 'grid' = 'free';

    // Called every 16ms during drag - MUST be local, not IPC
    snap(x: number, y: number): { x: number, y: number } {
        if (this.mode === 'free') {
            return { x, y };
        }
        return {
            x: Math.round(x / this.gridSize) * this.gridSize,
            y: Math.round(y / this.gridSize) * this.gridSize
        };
    }

    // Find next empty slot for new components
    findNextEmptySlot(components: ComponentInfo[]): { x: number, y: number } {
        // Layout algorithm here - local, instant
    }

    // Check collision during drag
    checkCollision(dragging: Rect, others: Rect[]): boolean {
        // Collision detection - local, instant
    }
}
```

### 2. Core → Extension (Events)

```typescript
// === CORE: Fire events in roopikEventService.ts ===

export interface IRoopikEventService {
    readonly onComponentUpdated: Event<ComponentUpdateEvent>;
    readonly onPipelineComplete: Event<PipelineCompleteEvent>;
    readonly onPipelineError: Event<PipelineErrorEvent>;

    fireComponentUpdated(event: ComponentUpdateEvent): void;
    firePipelineComplete(event: PipelineCompleteEvent): void;
    firePipelineError(event: PipelineErrorEvent): void;
}
```

```typescript
// === EXTENSION: Listen to events ===

// Option 1: Expose via command that returns disposable
const disposable = await vscode.commands.executeCommand('roopik.core.onPipelineComplete', (event) => {
    this.webview.postMessage({ type: 'pipelineComplete', data: event });
});

// Option 2: Use shared event emitter via extension API
const roopikApi = vscode.extensions.getExtension('roopik.roopik-core')?.exports;
roopikApi.onPipelineComplete((event) => {
    this.webview.postMessage({ type: 'pipelineComplete', data: event });
});
```

### 3. Extension ↔ Webview (PostMessage)

```typescript
// === WEBVIEW: Send message to extension ===

// Get VS Code API
const vscode = acquireVsCodeApi();

// Request code transformation
function requestTransform(code: string, componentId: string) {
    vscode.postMessage({
        type: 'transformCode',
        payload: { code, componentId }
    });
}

// Listen for responses
window.addEventListener('message', (event) => {
    const message = event.data;
    switch (message.type) {
        case 'transformComplete':
            handleTransformComplete(message.payload);
            break;
        case 'transformError':
            handleTransformError(message.payload);
            break;
    }
});
```

```typescript
// === EXTENSION: Handle webview messages in CanvasPanel.ts ===

export class CanvasPanel implements vscode.WebviewViewProvider {
    private coreBridge: CoreBridgeService;

    resolveWebviewView(webviewView: vscode.WebviewView) {
        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.type) {
                case 'transformCode':
                    try {
                        const result = await this.coreBridge.transformCode(
                            message.payload.code,
                            message.payload.options
                        );
                        webviewView.webview.postMessage({
                            type: 'transformComplete',
                            payload: { ...result, componentId: message.payload.componentId }
                        });
                    } catch (error) {
                        webviewView.webview.postMessage({
                            type: 'transformError',
                            payload: { error: error.message, componentId: message.payload.componentId }
                        });
                    }
                    break;
            }
        });
    }
}
```

---

## Message Types Reference

```typescript
// === Shared types (src/types/messages.ts) ===

// Webview → Extension
export type WebviewMessage =
    | { type: 'transformCode'; payload: { code: string; componentId: string; options?: TransformOptions } }
    | { type: 'saveCanvas'; payload: { canvasId: string; state: CanvasState } }
    | { type: 'loadCanvas'; payload: { canvasId: string } }
    | { type: 'openFile'; payload: { filePath: string; line?: number } }
    | { type: 'ready' };

// Extension → Webview
export type ExtensionMessage =
    | { type: 'transformComplete'; payload: { html: string; componentId: string } }
    | { type: 'transformError'; payload: { error: string; componentId: string } }
    | { type: 'canvasLoaded'; payload: { state: CanvasState } }
    | { type: 'canvasSaved'; payload: { success: boolean } }
    | { type: 'themeChanged'; payload: { theme: 'light' | 'dark' } }
    | { type: 'configChanged'; payload: { config: CanvasConfig } };

// NOTE: Grid calculations happen LOCALLY in Extension (GridManager)
// No IPC needed for 60fps drag snapping!
```

---

## Implementation Phases

### Phase 1: Extension Scaffold ✅ COMPLETE

**Tasks:**
- [x] Create `extensions/roopik/` folder structure
- [x] Set up `package.json` with activation events
- [x] Configure `tsconfig.json` and `esbuild.js`
- [x] Create basic `extension.ts` entry point
- [x] Create `canvasPanel.ts` WebviewViewProvider
- [x] Test extension loads in VSCode

**Files created:**
```
extensions/roopik/
├── package.json
├── tsconfig.json
├── esbuild.js
├── src/
│   ├── extension.ts
│   └── canvasPanel.ts
```

### Phase 2: Webview Setup ✅ COMPLETE

**Tasks:**
- [x] Set up Vite for webview build
- [x] Create React app scaffold
- [x] Set up Zustand store
- [x] Create basic `App.tsx` and `CanvasView.tsx`
- [x] Implement PostMessage communication
- [x] Test webview renders in panel

**Files created:**
```
extensions/roopik/webview/
├── index.html
├── index.tsx
├── vite.config.ts
├── App.tsx
└── src/
    ├── canvasView/CanvasView.tsx
    └── store/canvasStore.ts
```

### Phase 3: Core Commands + State Management ✅ COMPLETE

**Tasks:**
- [x] Register canvas commands in Core (importCommands.ts)
- [x] Create `CanvasStateManager.ts` in extension (persistence)
- [x] Create `CoreBridgeService.ts` in extension
- [x] Implement state loading/saving
- [x] Test command execution from webview

**Files modified:**
```
src/vs/workbench/contrib/roopik/browser/canvas/importCommands.ts  (commands)
```

**Files created:**
```
extensions/roopik/src/services/CoreBridgeService.ts
extensions/roopik/src/services/CanvasStateManager.ts
```

### Phase 4: Canvas Component (Day 4-5)

**Tasks:**
- [ ] Implement infinite canvas with pan/zoom
- [ ] Port background patterns
- [ ] Port viewport management
- [ ] Implement `useViewport.ts` hook
- [ ] Test canvas interactions

**Files to create:**
```
webview/components/Canvas/Canvas.tsx
webview/components/Canvas/CanvasBackground.tsx
webview/hooks/useViewport.ts
```

### Phase 5: Sandbox Cards (Day 6-7)

**Tasks:**
- [ ] Create `SandboxCard.tsx` component
- [ ] Implement iframe rendering
- [ ] Port device presets
- [ ] Implement drag functionality
- [ ] Wire up code transformation
- [ ] Test component rendering

**Files to create:**
```
webview/components/SandboxCard/SandboxCard.tsx
webview/components/SandboxCard/CardHeader.tsx
webview/components/SandboxCard/CardContent.tsx
webview/hooks/useSandbox.ts
```

### Phase 6: Toolbars & UI (Day 8)

**Tasks:**
- [ ] Port `FloatingToolbar`
- [ ] Port `BottomActionBar`
- [ ] Port `CanvasStatusPanel`
- [ ] Implement device selector
- [ ] Wire up all callbacks

**Files to create:**
```
webview/components/Toolbar/FloatingToolbar.tsx
webview/components/Toolbar/BottomActionBar.tsx
webview/components/StatusPanel/CanvasStatusPanel.tsx
webview/components/StatusPanel/DeviceSelector.tsx
```

### Phase 7: Fullscreen Editor (Day 9-10)

**Tasks:**
- [ ] Create fullscreen overlay component
- [ ] Integrate Monaco editor (or use simple textarea)
- [ ] Implement live preview
- [ ] Port tab system
- [ ] Test fullscreen mode

**Files to create:**
```
webview/components/EditorFullscreen/EditorFullscreen.tsx
webview/components/EditorFullscreen/CodeEditor.tsx
webview/components/EditorFullscreen/PreviewPane.tsx
```

### Phase 8: Polish & Testing (Day 11-12)

**Tasks:**
- [ ] Test tab switching persistence
- [ ] Performance optimization
- [ ] Error handling
- [ ] Keyboard shortcuts
- [ ] Theme integration
- [ ] Documentation

---

## Key Benefits

| Benefit | Description |
|---------|-------------|
| **Webview Persistence** | Extension webviews stay alive across tab switches |
| **Clean Separation** | UI in extension, logic in core |
| **No CSP Modifications** | Extension webviews have their own CSP |
| **Easier UI Development** | React + Vite, hot reload, modern tooling |
| **Reusable Core** | Other extensions can use roopik core services |
| **Better Testing** | UI and logic can be tested independently |

---

## Files to Keep in Core

These files remain in `src/vs/workbench/contrib/roopik/`:

```
roopik/
├── common/
│   ├── canvas/
│   │   └── canvasTypes.ts            # Shared type definitions
│   └── sandboxPipeline/
│       └── sandboxPipelineService.ts # Pipeline interface
│
├── browser/
│   ├── roopik.contribution.ts        # Register commands + services
│   └── services/
│       ├── roopikEventService.ts     # Event bus
│       └── canvasStateService.ts     # Save/load canvas state to disk
│
└── electron-main/
    └── sandboxPipeline/              # ESBuild bundling (heavy lifting)
        ├── sandboxPipelineMain.ts
        ├── esbuildService.ts
        └── transformers/
```

**Note:** `gridManager.ts` moves to Extension (not Core) for 60fps performance.

---

## Files to Deprecate

These files will be **deprecated** after migration (can be removed later):

```
# UI components moving to extension
browser/canvas/canvasEditor.ts
browser/canvas/canvasInput.ts
browser/canvas/components/sandboxCard.ts
browser/canvas/components/editorFullscreen.ts
browser/canvas/components/floatingToolbar.ts
browser/canvas/components/bottomActionBar.ts
browser/canvas/components/canvasActionButtons.ts
browser/canvas/components/canvasStatusPanel.ts
browser/canvas/components/sandboxRenderer.ts
browser/canvas/components/deviceIcons.ts
browser/canvas/components/confirmDialog.ts

# Real-time logic moving to extension (needs 60fps)
browser/canvas/services/gridManager.ts
```

---

## Testing Checklist

### Tab Persistence Test
- [ ] Open canvas in extension panel
- [ ] Add multiple sandbox cards
- [ ] Switch to another tab
- [ ] Switch back to canvas
- [ ] **Verify**: All cards still visible with content

### Code Transformation Test
- [ ] Type code in sandbox
- [ ] Click transform button
- [ ] **Verify**: Code sent to core pipeline
- [ ] **Verify**: Result rendered in iframe

### Pan/Zoom Test
- [ ] Pan canvas by dragging
- [ ] Zoom with scroll wheel
- [ ] **Verify**: Viewport updates smoothly
- [ ] Switch tabs and back
- [ ] **Verify**: Viewport position preserved

### Performance Test
- [ ] Add 10+ sandbox cards
- [ ] Pan/zoom rapidly
- [ ] **Verify**: No lag or frame drops
- [ ] Switch tabs multiple times
- [ ] **Verify**: No memory leaks

---

## Notes

### Extension Architecture
The `extensions/roopik/` extension uses a hybrid architecture:
- **Extension host**: Canvas state management, Core bridge, file I/O
- **Webview**: React-based canvas UI with Zustand state
- **Core**: Heavy processing (ESBuild bundling) via commands

### Storage Structure
```
.roopik/
├── config.json              # IDE settings
├── logs/                    # System logs
└── canvas/                  # All canvas data nested here
    ├── canvases.json        # Index of all canvases
    └── {canvas-name}/       # Individual canvas folders
        └── canvas-state.json  # Full canvas state with bundledCode
```

### Future Considerations
- Consider using Turbopack/esbuild for faster webview builds
- May want to expose canvas API for other extensions
- GridManager for 60fps snapping (if drag-drop needed in future)

---

*Document created: December 2024*
*Last updated: December 2024 - Folder renamed from roopik-extension to roopik*
*Status: Phases 1-3 COMPLETE, Phase 4+ in progress*
