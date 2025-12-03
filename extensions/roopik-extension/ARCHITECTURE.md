# Roopik Extension - Component Pipeline Architecture

## Overview

This document outlines the architecture for connecting the Canvas Extension to the Core's existing sandbox build pipeline. The goal is to leverage Core's powerful ESBuild infrastructure while keeping the Canvas UI in the extension.

---

## Architecture Decision: Core Integration (Not Hybrid)

### Why Use Core's Pipeline?

```
✅ Core already has full ESBuild pipeline (no duplication)
✅ Multi-framework support (React, Vue, Svelte, Solid, Preact)
✅ CDN resolution with AI-provided versions
✅ Priority-based job queue (max 10 concurrent)
✅ Main process isolation (won't affect Extension Host performance)
✅ Already tested and working
```

### What Extension Does

```
✅ Canvas UI (React infinite canvas)
✅ SandboxCard rendering
✅ User interactions (drag, zoom, pan)
✅ Message routing (Webview ↔ Extension Host ↔ Core)
✅ Canvas state persistence
```

---

## Complete System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        COMPONENT SOURCES                                     │
├─────────────┬─────────────┬─────────────┬─────────────┬─────────────────────┤
│  AI Agent   │  Samples    │  Drag-Drop  │   GitHub    │   Figma (Future)    │
│  (Live Gen) │  (Built-in) │  (Files)    │   (Import)  │                     │
└──────┬──────┴──────┬──────┴──────┬──────┴──────┬──────┴──────────┬──────────┘
       │             │             │             │                 │
       ▼             ▼             ▼             ▼                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     EXTENSION WEBVIEW (React Canvas)                         │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  ComponentSourceManager                                                │  │
│  │  ├── Normalizes all sources to ComponentInput                         │  │
│  │  ├── Tracks pending builds (Map<sandboxId, 'pending'|'ready'>)       │  │
│  │  └── Emits: onComponentReady(sandboxId, bundledCode)                  │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                    │                                         │
│                                    ▼ postMessage                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  CanvasView.tsx                                                        │  │
│  │  ├── sandboxes: Sandbox[] (UI state)                                  │  │
│  │  ├── pendingBuilds: Map<id, status>                                   │  │
│  │  └── Renders SandboxCard (shows spinner while pending)                │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │ postMessage('buildComponent', ComponentInput)
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     EXTENSION HOST (Node.js - Lightweight)                   │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  canvasPanel.ts                                                        │  │
│  │  ├── Receives postMessage from webview                                │  │
│  │  ├── Forwards to Core via vscode.commands                             │  │
│  │  ├── Listens for Core events (job completed)                          │  │
│  │  └── Sends bundled code back to webview                               │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                    │                                         │
│                                    ▼ vscode.commands.executeCommand()        │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     CORE MAIN PROCESS (Heavy Lifting)                        │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  SandboxPipelineMainService (EXISTING!)                               │  │
│  │  ├── processComponent(input) → jobId                                  │  │
│  │  ├── waitForCompletion(jobId) → TransformedComponent                  │  │
│  │  └── Events: onJobCompleted, onJobFailed                              │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                    │                                         │
│  ┌────────────────┬────────────────┼────────────────┬────────────────────┐  │
│  │ ComponentParser│ ESBuildTransformer              │ SandboxQueue       │  │
│  │ (Framework Det)│ (Bundle + CDN)                  │ (Priority Queue)   │  │
│  └────────────────┴────────────────┴────────────────┴────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Core Pipeline Components (Already Built)

### Location: `src/vs/workbench/contrib/roopik/`

| Component | File | Purpose |
|-----------|------|---------|
| **ISandboxPipelineService** | `common/sandboxPipeline/sandboxPipelineService.ts` | Service interface |
| **Types** | `common/sandboxPipeline/types.ts` | ComponentInput, TransformedComponent, etc. |
| **ComponentParser** | `common/sandboxPipeline/componentParser.ts` | Framework detection |
| **ESBuildTransformer** | `electron-main/sandboxPipeline/esbuildTransformer.ts` | Build engine |
| **SandboxQueue** | `electron-main/sandboxPipeline/sandboxQueue.ts` | Job queue |
| **MainService** | `electron-main/sandboxPipeline/sandboxPipelineMainService.ts` | Orchestrator |
| **IPC Channel** | `electron-main/sandboxPipeline/sandboxPipelineChannel.ts` | IPC router |
| **Browser Client** | `browser/sandboxPipelineClient.ts` | IPC proxy |

---

## Key Interfaces (From Core)

### ComponentInput (What Extension Sends)
```typescript
interface ComponentInput {
  id: string;
  source: 'ai' | 'user' | 'upload' | 'import';
  framework?: 'react' | 'vue' | 'svelte' | 'solid' | 'preact' | 'html';
  files: { [filename: string]: string };        // Source files
  entryFile?: string;                           // Which file to render
  priority?: 'high' | 'normal' | 'low';        // Job priority
  dependencies?: Record<string, string>;        // AI-provided versions
}
```

### TransformedComponent (What Extension Receives)
```typescript
interface TransformedComponent {
  id: string;
  framework: string;
  bundledCode: string;                          // ESM code ready for execution
  cdnUrls: string[];                            // External CDN imports
  metadata: {
    size: number;                               // Bundled code size
    transformTime: number;                      // Milliseconds
  };
}
```

### SandboxJob (For Tracking)
```typescript
interface SandboxJob {
  id: string;
  input: ComponentInput;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  result?: TransformedComponent;
  error?: string;
  createdAt: number;
  completedAt?: number;
}
```

---

## Data Flow for Each Source

### 1. AI Agent Generated (Most Important!)

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  AI Agent   │────▶│ Agent writes│────▶│ Core detects│────▶│ Core builds │
│  generates  │     │ to staging  │     │ new file    │     │ component   │
└─────────────┘     └─────────────┘     └─────────────┘     └──────┬──────┘
                                                                    │
                    ┌─────────────┐     ┌─────────────┐             │
                    │  Extension  │◀────│ Core emits  │◀────────────┘
                    │  renders    │     │ event       │
                    └─────────────┘     └─────────────┘
```

**Detection Methods:**

1. **File Watcher** - Core watches `.roopik/staging/` directory
2. **Command-Based** - Agent calls `roopik.canvas.addComponent`
3. **Event Bus** - Extension subscribes to `roopik.onComponentGenerated`

### 2. Samples (Built-in)

```
User clicks "Add Counter"
       ↓
Extension Webview: sends sample ComponentInput
       ↓ postMessage
Extension Host: forwards to Core
       ↓ vscode.commands
Core: processComponent() → builds → returns bundledCode
       ↓ event/callback
Extension Host: receives result
       ↓ postMessage
Extension Webview: renders SandboxCard
```

### 3. Drag-Drop from File Explorer

```
User drags Button.tsx onto canvas
       ↓
Extension Webview: onDrop, sends file path
       ↓ postMessage('importFile', path)
Extension Host: reads file via vscode.workspace.fs
       ↓ creates ComponentInput
       ↓ vscode.commands
Core: processComponent() → builds
       ↓
Extension Webview: renders SandboxCard
```

### 4. GitHub Import

```
User pastes: github.com/user/repo/blob/main/Button.tsx
       ↓
Extension Webview: sends URL
       ↓ postMessage('importGitHub', url)
Extension Host: fetches raw content via GitHub API
       ↓ creates ComponentInput with files
       ↓ vscode.commands
Core: builds → returns bundledCode
       ↓
Extension Webview: renders SandboxCard
```

---

## Canvas State Persistence

### File: `.roopik/canvas-state.json` (per workspace)

```typescript
interface CanvasState {
  canvasId: string;
  name: string;
  components: SavedComponent[];
  transform: { x: number; y: number; scale: number };
  settings: {
    pattern: 'none' | 'dots' | 'grid';
    snapMode: 'none' | 'grid' | 'component';
    backgroundColor: string;
  };
  lastModified: number;
}

interface SavedComponent {
  id: string;
  source: 'ai' | 'user' | 'upload' | 'import' | 'sample';
  sourceRef?: string;                    // GitHub URL, AI session ID, etc.
  position: { x: number; y: number };
  size: { width: number; height: number };

  // For rebuild capability
  input: ComponentInput;                 // Original input

  // For fast load (optional cache)
  bundledCode?: string;                  // Cached bundle
  lastBuilt?: number;
}
```

### Load Flow
1. Extension loads `canvas-state.json`
2. Components with `bundledCode` → render immediately
3. Components without `bundledCode` → rebuild from `input`

### Save Flow
1. On any change (position, add, delete) → debounced save (500ms)
2. Store `bundledCode` for fast reload

---

## IPC Contract (Extension ↔ Core)

### Commands Extension Calls (Implemented ✅)

```typescript
// Build a component (one-shot: submit + wait)
'roopik.pipeline.buildComponent'
  Input: ComponentInput, timeout?: number
  Returns: TransformedComponent
  Used by: CoreBridgeService.buildComponent()

// Submit component for async processing
'roopik.pipeline.processComponent'
  Input: ComponentInput
  Returns: string (jobId)

// Wait for build completion
'roopik.pipeline.waitForCompletion'
  Input: jobId: string, timeout?: number
  Returns: TransformedComponent

// Get job status
'roopik.pipeline.getJobStatus'
  Input: jobId: string
  Returns: SandboxJob | undefined

// Validate component without building
'roopik.pipeline.validateComponent'
  Input: ComponentInput
  Returns: ValidationResult

// Cancel a queued job
'roopik.pipeline.cancelJob'
  Input: jobId: string
  Returns: boolean
```

### Events Core Emits (Future - Phase 4)

```typescript
// When AI generates a new component
'roopik.onComponentGenerated'
  Payload: { input: ComponentInput, result: TransformedComponent }

// When a queued job completes
'roopik.onJobCompleted'
  Payload: { jobId: string, result: TransformedComponent }

// When a job fails
'roopik.onJobFailed'
  Payload: { jobId: string, error: string }
```

---

## Message Protocol (Webview ↔ Extension Host)

### Webview → Extension Host (Implemented ✅)

```typescript
// Webview ready
{ type: 'ready' }

// Request component build
{ type: 'buildComponent', payload: { componentId: string, input: ComponentInput } }

// Open file in editor
{ type: 'openFile', payload: { filePath: string, line?: number, column?: number } }

// Log message
{ type: 'log', payload: { level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: unknown } }

// Future: Import from file
{ type: 'importFile', payload: { path: string } }

// Future: Save canvas state
{ type: 'saveCanvas', payload: { canvasId: string, state: CanvasState } }
```

### Extension Host → Webview (Implemented ✅)

```typescript
// Component built successfully
{ type: 'componentBuilt', payload: { componentId: string, result: TransformedComponent } }

// Build error
{ type: 'componentError', payload: { componentId: string, error: string } }

// Future: Canvas state loaded
{ type: 'canvasLoaded', payload: { state: CanvasState } }

// Future: Theme changed
{ type: 'themeChanged', payload: { theme: 'light' | 'dark' | 'high-contrast' } }
```

---

## Folder Structure

### Extension (`extensions/roopik-extension/`) - Current State

```
extensions/roopik-extension/
├── src/
│   ├── extension.ts                 # Entry point
│   │
│   ├── panels/
│   │   └── CanvasPanel.ts           # ✅ Webview panel + message routing
│   │
│   ├── services/
│   │   ├── CoreBridgeService.ts     # ✅ Extension Host ↔ Core via commands
│   │   └── Logger.ts                # Logging utility
│   │
│   └── types/
│       ├── messages.ts              # ✅ Webview ↔ Extension messages
│       └── pipeline.ts              # ✅ ComponentInput, TransformedComponent
│
└── webview/
    └── src/canvasView/
        ├── CanvasView.tsx           # ✅ Main canvas orchestrator
        │
        ├── components/
        │   ├── InfiniteCanvas/
        │   │   └── InfiniteCanvas.tsx  # ✅ Pan/zoom canvas
        │   │
        │   ├── SandboxCard/
        │   │   └── SandboxCard.tsx     # ✅ Component preview (ESM execution)
        │   │
        │   ├── FloatingToolbar/
        │   │   └── FloatingToolbar.tsx # ✅ Add, samples, clear
        │   │
        │   └── StatusPanel/
        │       └── StatusPanel.tsx     # ✅ Zoom, snap mode
        │
        ├── services/
        │   └── GridManager.ts          # ✅ Grid positioning, snap
        │
        ├── data/
        │   └── sampleComponents.ts     # ✅ Built-in sample components
        │
        ├── styles/
        │   ├── canvas.css
        │   └── sandboxCard.css
        │
        └── types/
            └── index.ts                # ✅ Sandbox, Transform, etc.
```

### Core (Added for Phase 1)

```
src/vs/workbench/contrib/roopik/
├── browser/
│   └── canvas/
│       └── canvasCommands.ts        # ✅ Register roopik.pipeline.* commands
│
├── common/
│   └── sandboxPipeline/             # (Existing - ESBuild pipeline)
│       ├── sandboxPipelineService.ts
│       └── types.ts
│
└── electron-main/
    └── sandboxPipeline/             # (Existing - Build engine)
        ├── esbuildTransformer.ts
        └── sandboxQueue.ts
```

### Future Additions (Phase 2-4)

```
extensions/roopik-extension/src/
├── persistence/
│   ├── canvasStateManager.ts    # Phase 2: Save/load canvas
│   └── componentCache.ts        # Phase 2: Bundle caching
│
└── sources/
    ├── fileImporter.ts          # Phase 3: Workspace file import
    └── githubImporter.ts        # Phase 3: GitHub URL import
```

---

## Implementation Phases

### Phase 1: Core IPC Bridge (Foundation) ✅ COMPLETE

**Goal:** Extension can call Core's pipeline via commands

**Tasks:**
1. ✅ Register `roopik.pipeline.*` commands in Core
2. ✅ Create `CoreBridgeService` in Extension Host
3. ✅ Update `CanvasPanel.ts` to forward messages
4. ✅ Solve ESM execution in sandbox iframes (see `docs/challenges/esm-sandbox-execution.md`)

**Files Created/Modified:**
- `src/vs/workbench/contrib/roopik/browser/canvas/canvasCommands.ts` ✅
- `extensions/roopik-extension/src/services/CoreBridgeService.ts` ✅
- `extensions/roopik-extension/src/panels/CanvasPanel.ts` ✅
- `extensions/roopik-extension/webview/src/canvasView/components/SandboxCard/SandboxCard.tsx` ✅

**Key Achievement:** ESM code from Core pipeline renders correctly in sandbox iframes using inline `<script type="module">`.

**Success Criteria:** ✅ Sample component builds via Core and renders in extension

---

### Phase 2: Canvas State Persistence

**Goal:** Save/load canvas state for session continuity

**Tasks:**
1. Create `CanvasStateManager` in Extension Host
2. Add save/load messages to webview
3. Implement debounced auto-save
4. Handle rebuild from cached `input`

**Files to Create:**
- `extensions/roopik-extension/src/persistence/canvasStateManager.ts`
- `extensions/roopik-extension/src/persistence/componentCache.ts`

**Success Criteria:** Close and reopen extension, canvas state restored

---

### Phase 3: Multiple Sources (Import)

**Goal:** Import components from files, GitHub

**Tasks:**
1. Create `FileImporter` - read workspace files
2. Create `GitHubImporter` - fetch from GitHub API
3. Add drag-drop support to canvas
4. Add "Import" button to toolbar

**Files to Create:**
- `extensions/roopik-extension/src/sources/fileImporter.ts`
- `extensions/roopik-extension/src/sources/githubImporter.ts`
- `webview/src/canvasView/components/Toolbar/ImportDialog.tsx`

**Success Criteria:** Drag .tsx file or paste GitHub URL → component renders

---

### Phase 4: AI Agent Integration

**Goal:** AI-generated components appear on canvas automatically

**Tasks:**
1. Create file watcher in Core for `.roopik/staging/`
2. Create event emitter for `roopik.onComponentGenerated`
3. Subscribe extension to Core events
4. Handle real-time component additions

**Files to Create:**
- `src/vs/workbench/contrib/roopik/electron-main/canvas/fileWatcher.ts`
- `src/vs/workbench/contrib/roopik/browser/canvas/canvasEventEmitter.ts`
- `extensions/roopik-extension/src/bridge/eventSubscriber.ts`

**Success Criteria:** AI writes component → automatically appears on canvas

---

## Security Considerations

### Webview CSP (CanvasPanel.ts)
```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'none';
  style-src ${cspSource} 'unsafe-inline';
  script-src ${cspSource} 'unsafe-inline' 'unsafe-eval' https://esm.sh https://cdn.skypack.dev;
  frame-src blob: data: https:;
  connect-src https://esm.sh https://cdn.skypack.dev;
  img-src ${cspSource} data: https:;
">
```

### Sandbox Iframe Execution
**Important:** Blob URLs do NOT work for scripts in VSCode webviews due to CSP restrictions.

**Solution:** Inline ESM code directly in `<script type="module">`:
```html
<script type="module">
${bundledCode}  <!-- ESM with CDN imports -->
</script>
```

See: `docs/challenges/esm-sandbox-execution.md` for full details on this solution.

### File Access
- Extension can only read workspace files
- No access to system files outside workspace
- GitHub imports sanitized before processing

### CDN Trust
- Only trusted CDNs: esm.sh, skypack, jsdelivr
- Version pinning for reproducible builds

---

## Performance Optimizations

1. **Bundle Caching** - Store `bundledCode` in canvas state
2. **Priority Queue** - AI components get `high` priority
3. **Parallel Builds** - Core handles up to 10 concurrent builds
4. **Debounced Save** - 500ms delay before saving state
5. **Lazy Rebuild** - Only rebuild if `bundledCode` missing

---

## Summary

| Layer | Responsibility | Heavy Work? |
|-------|----------------|-------------|
| **Webview** | UI, user interaction | ❌ Light |
| **Extension Host** | Message routing, file I/O | ❌ Light |
| **Core Main Process** | ESBuild, transforms | ✅ Heavy (isolated) |

The key insight: **Extension Host stays lightweight** - it just routes messages. All heavy lifting (ESBuild, transforms, queue management) happens in **Core's isolated main process**.

---

*Last Updated: December 2024*
*Current Phase: Phase 1 Complete ✅ | Phase 2 Next*
