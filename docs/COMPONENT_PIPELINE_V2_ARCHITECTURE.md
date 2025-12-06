# Component Pipeline V2 - Architecture & Implementation Plan

> **Complete redesign of the component creation, import, and build pipeline.**
>
> **Design Philosophy**: Service-first, agent-friendly, minimal layers, deterministic outputs.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Design Principles](#design-principles)
3. [Architecture Overview](#architecture-overview)
4. [Storage Architecture](#storage-architecture)
5. [Data Types & Interfaces](#data-types--interfaces)
6. [Service Responsibilities](#service-responsibilities)
7. [Component Lifecycle](#component-lifecycle)
8. [Flow Diagrams](#flow-diagrams)
9. [Folder Structure](#folder-structure)
10. [Implementation Phases](#implementation-phases)
11. [Migration Checklist](#migration-checklist)

---

## Executive Summary

### The Problem (V1)

The current architecture has critical flaws:

```
V1 Flow (8 hops!):
Core → Extension → Webview → Extension → Core → Main → Core → Extension → Webview
```

- **Ping-pong pattern**: 8 hops for one operation
- **Webview is the brain**: State lives in React, lost on reload
- **Code in IPC**: Large file contents passed through messages
- **No agent support**: Results go to webview, agents can't access
- **Tight coupling**: Can't change one part without breaking others

### The Solution (V2)

```
V2 Flow (3 layers):
Caller (Agent/UI) → ComponentService → ESBuild
       ↑                    │
       └────── Result ──────┘
```

- **Service-first**: Core service owns all state and logic
- **Path-based**: IPC passes references, not file contents
- **Event-driven**: Services emit events, consumers react
- **Agent-friendly**: Same interface for AI and UI
- **Clean separation**: Each module does one thing well

---

## Design Principles

### 1. Single Source of Truth
- `ComponentService` in Core owns all component state
- Extension canvas only manages visual layout
- No duplicate state between Core and Extension

### 2. Path-Based Communication
- Never pass file contents through IPC
- Pass component IDs and paths
- Read file contents only when needed (rendering, editing)

### 3. Storage Separation
- **Workspace** (`.roopik/`): Source code, metadata (user can see/edit)
- **App Data**: Build cache, bundles (hidden from user)

### 4. Independent Modules
- Each service/adapter can be upgraded independently
- Clear interfaces between modules
- No circular dependencies

### 5. Event-Driven Updates
- Core emits events with minimal payloads
- Consumers subscribe and react
- No request-response chains through multiple layers

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              CONSUMERS (All use same interface)                      │
│                                                                                      │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐          │
│   │  AI Agent   │    │  Canvas UI  │    │  Command    │    │  External   │          │
│   │  (Core)     │    │ (Extension) │    │  Palette    │    │  API        │          │
│   └──────┬──────┘    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘          │
│          │                  │                  │                  │                  │
│          └──────────────────┴──────────────────┴──────────────────┘                  │
│                                      │                                               │
│                                      │  IComponentService                            │
│                                      ▼                                               │
└──────────────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                              CORE (electron-main)                                     │
│                                                                                       │
│  ┌────────────────────────────────────────────────────────────────────────────────┐  │
│  │                         ComponentService                                        │  │
│  │                     (Single Source of Truth)                                    │  │
│  │                                                                                 │  │
│  │   createComponent()     getComponent()      deleteComponent()                   │  │
│  │   rebuildComponent()    getComponentSource() updateComponentSource()            │  │
│  │   getBundledCode()      getComponentsForCanvas()                                │  │
│  │                                                                                 │  │
│  │   Events: onComponentCreated, onComponentBuilt, onComponentDeleted, onBuildError│  │
│  └────────────────────────────────────────────────────────────────────────────────┘  │
│                    │                │                │                                │
│          ┌────────┴───────┐ ┌──────┴──────┐ ┌──────┴──────┐                         │
│          ▼                ▼ ▼             ▼ ▼             ▼                          │
│  ┌───────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                  │
│  │ ImportService │ │BuildService │ │StorageService│ │ FileWatcher │                  │
│  │               │ │             │ │              │ │             │                  │
│  │ Adapters:     │ │ ESBuild     │ │ Workspace    │ │ Watches     │                  │
│  │ ├─ LocalFile  │ │ Transformer │ │ (.roopik/)   │ │ components/ │                  │
│  │ ├─ GitHub     │ │             │ │              │ │ for changes │                  │
│  │ ├─ Figma      │ │ Script      │ │ AppData      │ │             │                  │
│  │ └─ AIAgent    │ │ Injector    │ │ (cache/)     │ │ → rebuild   │                  │
│  └───────────────┘ └─────────────┘ └──────────────┘ └─────────────┘                  │
│                                                                                       │
└───────────────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       │ Events (IPC) - Lean payloads!
                                       │ { id, canvasId, name } - NO code!
                                       ▼
┌───────────────────────────────────────────────────────────────────────────────────────┐
│                         EXTENSION (Smart Canvas UI)                                    │
│                                                                                        │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐  │
│  │                    ComponentServiceClient (IPC Proxy)                            │  │
│  │                                                                                  │  │
│  │   Same interface as IComponentService → forwards to Core via IPC                 │  │
│  └─────────────────────────────────────────────────────────────────────────────────┘  │
│                                       │                                                │
│                                       ▼                                                │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐  │
│  │                         CanvasPanel (Webview)                                    │  │
│  │                                                                                  │  │
│  │   SMART UI:                                                                      │  │
│  │   ✅ Subscribes to Core events                                                   │  │
│  │   ✅ Decides WHERE to place components (grid algorithm)                          │  │
│  │   ✅ Manages viewport, selection, focus                                          │  │
│  │   ✅ Requests bundled code only when rendering                                   │  │
│  │   ✅ Persists layout to .roopik/canvases/{id}/canvas.json                        │  │
│  │                                                                                  │  │
│  │   DOES NOT:                                                                      │  │
│  │   ❌ Store component source code                                                 │  │
│  │   ❌ Manage build process                                                        │  │
│  │   ❌ Know how components were created                                            │  │
│  └─────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                        │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Storage Architecture

### Two Storage Locations

| Location | Purpose | User Visible | Git Tracked |
|----------|---------|--------------|-------------|
| **Workspace** (`.roopik/`) | Source code, metadata, canvas layout | Yes | Optional |
| **App Data** | Build cache, bundled code | No | No |

### Workspace Storage (`.roopik/`)

```
project-root/
└── .roopik/
    ├── config.json                         # Workspace configuration
    │
    └── canvases/                           # All canvases
        ├── index.json                      # Canvas registry
        │
        ├── main/                           # Canvas: "main"
        │   ├── canvas.json                 # Canvas metadata + placements
        │   │                                 (Extension writes this)
        │   │
        │   └── components/                 # Components in this canvas
        │       ├── index.json              # Component registry (fast lookup)
        │       │                             (Core writes this)
        │       │
        │       ├── abc-123/                # Component folder
        │       │   ├── meta.json           # Full metadata
        │       │   ├── Button.tsx          # Source code (editable!)
        │       │   └── styles.css          # Dependencies
        │       │
        │       └── def-456/
        │           └── ...
        │
        └── experiments/                    # Canvas: "experiments"
            ├── canvas.json
            └── components/
                └── ...
```

### App Data Storage (Hidden from user)

```
Windows:  %APPDATA%/roopik/
macOS:    ~/Library/Application Support/roopik/
Linux:    ~/.config/roopik/

roopik/
└── workspaces/
    └── {workspace-hash}/                   # Hash of workspace path
        ├── workspace.json                  # Workspace reference
        │
        └── canvases/                       # Mirror of workspace structure
            ├── main/
            │   └── components/
            │       ├── abc-123/
            │       │   ├── bundle.js       # Bundled code (with injections)
            │       │   └── build.json      # Build metadata
            │       │
            │       └── def-456/
            │           └── ...
            │
            └── experiments/
                └── components/
                    └── ...
```

### File Contents

#### `.roopik/config.json`
```json
{
  "version": 1,
  "defaultCanvas": "main",
  "settings": {
    "autoBuild": true,
    "watchFiles": true,
    "cdnProvider": "esm.sh"
  }
}
```

#### `.roopik/canvases/index.json`
```json
{
  "canvases": [
    { "id": "main", "name": "Main Canvas", "createdAt": 1699999999 },
    { "id": "experiments", "name": "Experiments", "createdAt": 1699999999 }
  ]
}
```

#### `.roopik/canvases/main/canvas.json` (Extension writes)
```json
{
  "id": "main",
  "name": "Main Canvas",
  "viewport": { "x": 0, "y": 0, "scale": 1 },
  "backgroundColor": "#1a1a1a",
  "backgroundPattern": "dots",
  "placements": {
    "abc-123": {
      "position": { "x": 100, "y": 200 },
      "size": { "width": 400, "height": 300 },
      "zIndex": 1
    },
    "def-456": {
      "position": { "x": 550, "y": 200 },
      "size": { "width": 400, "height": 300 },
      "zIndex": 2
    }
  },
  "updatedAt": 1699999999
}
```

#### `.roopik/canvases/main/components/index.json` (Core writes)
```json
{
  "components": {
    "abc-123": {
      "name": "LoginButton",
      "framework": "react",
      "source": "ai-agent",
      "entryFile": "LoginButton.tsx",
      "buildState": "ready",
      "contentHash": "sha256:a1b2c3...",
      "createdAt": 1699999999,
      "updatedAt": 1699999999
    },
    "def-456": {
      "name": "UserCard",
      "framework": "react",
      "source": "local-file",
      "entryFile": "UserCard.tsx",
      "buildState": "ready",
      "contentHash": "sha256:d4e5f6...",
      "createdAt": 1699999999,
      "updatedAt": 1699999999
    }
  }
}
```

#### `.roopik/canvases/main/components/abc-123/meta.json`
```json
{
  "id": "abc-123",
  "name": "LoginButton",
  "source": "ai-agent",
  "sourceInfo": {
    "promptId": "prompt-789",
    "model": "claude-3"
  },
  "entryFile": "LoginButton.tsx",
  "files": ["LoginButton.tsx"],
  "framework": "react",
  "dependencies": {
    "react": "18.2.0",
    "react-dom": "18.2.0"
  },
  "contentHash": "sha256:a1b2c3...",
  "createdAt": 1699999999,
  "updatedAt": 1699999999
}
```

#### App Data: `build.json`
```json
{
  "componentId": "abc-123",
  "contentHash": "sha256:a1b2c3...",
  "sourceHash": "sha256:x1y2z3...",
  "cdnUrls": [
    "https://esm.sh/react@18.2.0?dev",
    "https://esm.sh/react-dom@18.2.0/client?dev"
  ],
  "buildTime": 150,
  "bundleSize": 12345,
  "builtAt": 1699999999
}
```

---

## Data Types & Interfaces

### Core Types

```typescript
// ============================================
// Component (Core's view - no placement!)
// ============================================

interface Component {
  // Identity
  id: string;                              // UUID (also folder name)
  name: string;                            // Display name
  canvasId: string;                        // Parent canvas

  // Source origin
  source: ComponentSource;
  sourceInfo: SourceInfo;

  // Files (paths only, not content!)
  storagePath: string;                     // Absolute path to component folder
  entryFile: string;                       // Main file (relative)
  files: string[];                         // All files (relative)
  framework: Framework;
  dependencies: Record<string, string>;    // npm packages

  // Build state
  buildState: BuildState;

  // Tracking
  contentHash: string;                     // Hash of all source files
  createdAt: number;
  updatedAt: number;
}

type ComponentSource =
  | 'ai-agent'
  | 'local-file'
  | 'github'
  | 'figma'
  | 'manual';

interface SourceInfo {
  // AI Agent
  promptId?: string;
  model?: string;

  // Local File
  originalPath?: string;

  // GitHub
  repoUrl?: string;
  filePath?: string;
  branch?: string;
  commitSha?: string;

  // Figma
  figmaFileId?: string;
  nodeId?: string;
}

type Framework = 'react' | 'vue' | 'svelte' | 'solid' | 'preact' | 'html';

type BuildState =
  | { status: 'pending' }
  | { status: 'building' }
  | { status: 'ready' }
  | { status: 'error'; error: string };

// ============================================
// Create Requests
// ============================================

interface CreateComponentRequest {
  name: string;
  canvasId: string;
  source: ComponentSource;
  sourceData: SourceData;

  // Optional overrides
  framework?: Framework;
  dependencies?: Record<string, string>;
}

type SourceData =
  | AIAgentSourceData
  | LocalFileSourceData
  | GitHubSourceData
  | FigmaSourceData
  | ManualSourceData;

interface AIAgentSourceData {
  type: 'ai-agent';
  code: string;                            // Single file
  files?: Record<string, string>;          // Or multiple files
  promptId?: string;
}

interface LocalFileSourceData {
  type: 'local-file';
  filePath: string;                        // Path in user's project
}

interface GitHubSourceData {
  type: 'github';
  repoUrl: string;
  filePath: string;
  branch?: string;
}

interface FigmaSourceData {
  type: 'figma';
  fileId: string;
  nodeId: string;
}

interface ManualSourceData {
  type: 'manual';
  framework: Framework;
  template?: 'blank' | 'basic' | 'with-state';
}

// ============================================
// Events (Lean payloads!)
// ============================================

interface ComponentCreatedEvent {
  id: string;
  canvasId: string;
  name: string;
  source: ComponentSource;
}

interface ComponentBuiltEvent {
  id: string;
  canvasId: string;
}

interface ComponentUpdatedEvent {
  id: string;
  canvasId: string;
  changes: ('source' | 'meta')[];
}

interface ComponentDeletedEvent {
  id: string;
  canvasId: string;
}

interface BuildErrorEvent {
  id: string;
  canvasId: string;
  error: string;
}
```

### Extension Types

```typescript
// ============================================
// Canvas State (Extension manages this!)
// ============================================

interface CanvasState {
  id: string;
  name: string;

  // Visual layout
  placements: Record<string, Placement>;
  viewport: Viewport;
  backgroundColor: string;
  backgroundPattern: BackgroundPattern;

  // Selection
  selectedComponentId: string | null;
  focusedComponentId: string | null;

  updatedAt: number;
}

interface Placement {
  position: { x: number; y: number };
  size: { width: number; height: number };
  zIndex: number;
}

interface Viewport {
  x: number;
  y: number;
  scale: number;
}

type BackgroundPattern = 'grid' | 'dots' | 'plain';
```

---

## Service Responsibilities

### ComponentService (Core - Orchestrator)

```typescript
interface IComponentService {
  readonly _serviceBrand: undefined;

  // ============================================
  // Create & Import
  // ============================================

  /**
   * Create component from any source
   * 1. Delegates to ImportService to get files
   * 2. Writes to workspace via StorageService
   * 3. Triggers build via BuildService
   * 4. Emits events
   */
  createComponent(request: CreateComponentRequest): Promise<Component>;

  /**
   * Batch create for parallel AI generation
   */
  createComponentsBatch(requests: CreateComponentRequest[]): Promise<Component[]>;

  // ============================================
  // Build
  // ============================================

  /**
   * Force rebuild (clears cache, rebuilds)
   */
  rebuildComponent(id: string): Promise<void>;

  // ============================================
  // Read (metadata only!)
  // ============================================

  getComponent(id: string): Component | undefined;
  getComponentsForCanvas(canvasId: string): Component[];
  getAllComponents(): Component[];

  // ============================================
  // Code Access (on-demand)
  // ============================================

  /**
   * Get source code for editing
   * Reads from workspace
   */
  getComponentSource(id: string): Promise<Record<string, string>>;

  /**
   * Get bundled code for rendering
   * Reads from app data cache
   */
  getBundledCode(id: string): Promise<string>;

  // ============================================
  // Update
  // ============================================

  /**
   * Update source code
   * Writes to workspace, triggers rebuild
   */
  updateComponentSource(id: string, files: Record<string, string>): Promise<void>;

  /**
   * Update metadata only (name)
   */
  updateComponentMeta(id: string, updates: { name?: string }): Promise<void>;

  // ============================================
  // Delete
  // ============================================

  deleteComponent(id: string): Promise<void>;
  deleteCanvas(canvasId: string): Promise<void>;

  // ============================================
  // Canvas Management
  // ============================================

  createCanvas(name: string): Promise<string>;  // Returns canvasId
  getCanvases(): Array<{ id: string; name: string }>;

  // ============================================
  // Events
  // ============================================

  readonly onComponentCreated: Event<ComponentCreatedEvent>;
  readonly onComponentBuilt: Event<ComponentBuiltEvent>;
  readonly onComponentUpdated: Event<ComponentUpdatedEvent>;
  readonly onComponentDeleted: Event<ComponentDeletedEvent>;
  readonly onBuildError: Event<BuildErrorEvent>;
}
```

### ImportService (Core)

```typescript
interface IImportService {
  /**
   * Import from any source, return normalized files
   */
  import(request: CreateComponentRequest): Promise<ImportResult>;

  /**
   * Register a new adapter
   */
  registerAdapter(adapter: IImportAdapter): void;
}

interface ImportResult {
  files: Record<string, string>;           // filename → content
  entryFile: string;
  framework: Framework;
  dependencies: Record<string, string>;
  sourceInfo: SourceInfo;
}

interface IImportAdapter {
  readonly sourceType: ComponentSource;

  canHandle(sourceData: SourceData): boolean;
  import(sourceData: SourceData): Promise<ImportResult>;
}
```

### BuildService (Core)

```typescript
interface IBuildService {
  /**
   * Build component, write to cache
   */
  build(component: Component): Promise<BuildResult>;

  /**
   * Get cached build (if exists and valid)
   */
  getCachedBuild(id: string, contentHash: string): BuildResult | null;

  /**
   * Invalidate cache
   */
  invalidateCache(id: string): void;
}

interface BuildResult {
  bundlePath: string;                      // Path in app data
  cdnUrls: string[];
  buildTime: number;
  bundleSize: number;
}
```

### StorageService (Core)

```typescript
interface IStorageService {
  // ============================================
  // Workspace Operations (.roopik/)
  // ============================================

  // Config
  getConfig(): WorkspaceConfig;
  updateConfig(updates: Partial<WorkspaceConfig>): Promise<void>;

  // Canvas
  getCanvases(): Array<{ id: string; name: string }>;
  createCanvas(id: string, name: string): Promise<void>;
  deleteCanvas(id: string): Promise<void>;

  // Components
  writeComponentFiles(canvasId: string, componentId: string, files: Record<string, string>): Promise<string>;
  readComponentFiles(canvasId: string, componentId: string): Promise<Record<string, string>>;
  writeComponentMeta(canvasId: string, componentId: string, meta: ComponentMeta): Promise<void>;
  readComponentMeta(canvasId: string, componentId: string): Promise<ComponentMeta | null>;
  deleteComponent(canvasId: string, componentId: string): Promise<void>;

  // Index
  getComponentIndex(canvasId: string): Promise<ComponentIndex>;
  updateComponentIndex(canvasId: string, componentId: string, data: ComponentIndexEntry): Promise<void>;

  // ============================================
  // App Data Operations (cache)
  // ============================================

  writeBundledCode(canvasId: string, componentId: string, code: string): Promise<string>;
  readBundledCode(canvasId: string, componentId: string): Promise<string | null>;
  writeBuildMeta(canvasId: string, componentId: string, meta: BuildMeta): Promise<void>;
  readBuildMeta(canvasId: string, componentId: string): Promise<BuildMeta | null>;
  invalidateBuildCache(canvasId: string, componentId: string): Promise<void>;

  // ============================================
  // Paths
  // ============================================

  getWorkspacePath(): string;
  getAppDataPath(): string;
  getComponentPath(canvasId: string, componentId: string): string;
  getCachePath(canvasId: string, componentId: string): string;
}
```

### FileWatcher (Core)

```typescript
interface IFileWatcher {
  /**
   * Start watching component folders
   */
  start(): void;

  /**
   * Stop watching
   */
  stop(): void;

  /**
   * Event: file changed
   */
  readonly onFileChanged: Event<{ canvasId: string; componentId: string; file: string }>;
}
```

---

## Component Lifecycle

```
                    ┌─────────────────┐
                    │   CREATE        │
                    │                 │
                    │ ImportService   │
                    │ imports files   │
                    │                 │
                    │ StorageService  │
                    │ writes to disk  │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │   PENDING       │
                    │                 │
                    │ Component       │
                    │ created but     │
                    │ not yet built   │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │   BUILDING      │
                    │                 │
                    │ BuildService    │◄──────────────────┐
                    │ runs ESBuild    │                   │
                    │                 │                   │
                    │ Writes bundle   │                   │
                    │ to app data     │                   │
                    └────────┬────────┘                   │
                             │                            │
                    ┌────────┴────────┐                   │
                    │                 │                   │
                    ▼                 ▼                   │
           ┌─────────────┐   ┌─────────────┐             │
           │   READY     │   │   ERROR     │             │
           │             │   │             │             │
           │ Bundle in   │   │ Build       │             │
           │ cache       │   │ failed      │             │
           │             │   │             │             │
           │ Can render  │   │ Show error  │             │
           └──────┬──────┘   └─────────────┘             │
                  │                                       │
                  │ User edits source                     │
                  │ OR FileWatcher detects change         │
                  ▼                                       │
           ┌─────────────┐                               │
           │  MODIFIED   │                               │
           │             │                               │
           │ Source      │───── rebuild ─────────────────┘
           │ changed     │
           └─────────────┘
```

---

## Flow Diagrams

### Flow 1: AI Agent Creates Component

```
AI Agent (Core)
    │
    │  componentService.createComponent({
    │    name: 'LoginButton',
    │    canvasId: 'main',
    │    source: 'ai-agent',
    │    sourceData: {
    │      type: 'ai-agent',
    │      code: 'export default function LoginButton() {...}',
    │      promptId: 'prompt-123'
    │    },
    │    framework: 'react',
    │    dependencies: { 'react': '18.2.0' }
    │  })
    │
    ▼
ComponentService
    │
    │  1. Generate ID: "abc-123"
    │  2. Call ImportService.import() → AIAgentAdapter
    │     └─► Returns: { files, entryFile, framework, dependencies, sourceInfo }
    │
    │  3. Call StorageService.writeComponentFiles()
    │     └─► Writes to: .roopik/canvases/main/components/abc-123/
    │         ├── meta.json
    │         └── LoginButton.tsx
    │
    │  4. Call StorageService.updateComponentIndex()
    │     └─► Updates: .roopik/canvases/main/components/index.json
    │
    │  5. Create Component object (in-memory)
    │     buildState: { status: 'pending' }
    │
    │  6. Emit: onComponentCreated { id: 'abc-123', canvasId: 'main', name: 'LoginButton' }
    │
    │  7. Call BuildService.build(component)
    │     │
    │     └─► ESBuildTransformer
    │         - Reads source from .roopik/canvases/main/components/abc-123/
    │         - Bundles with ESBuild
    │         - Injects inspect scripts
    │         - Writes to: %APPDATA%/roopik/workspaces/{hash}/canvases/main/components/abc-123/
    │           ├── bundle.js
    │           └── build.json
    │
    │  8. Update Component: buildState: { status: 'ready' }
    │
    │  9. Emit: onComponentBuilt { id: 'abc-123', canvasId: 'main' }
    │
    │  10. Return Component to caller
    │
    ▼
AI Agent receives:
    Component {
      id: 'abc-123',
      name: 'LoginButton',
      canvasId: 'main',
      buildState: { status: 'ready' },
      storagePath: '.roopik/canvases/main/components/abc-123'
      // NO code in response!
    }


═══════════════════════════════════════════════════════════════
  PARALLEL: Extension receives events
═══════════════════════════════════════════════════════════════

CanvasPanel subscribes to events
    │
    ▼
Event: onComponentCreated { id: 'abc-123', canvasId: 'main', name: 'LoginButton' }
    │
    │  Canvas logic:
    │  1. "New component for my canvas!"
    │  2. Calculate grid position
    │  3. Add to placements: { 'abc-123': { x: 100, y: 200, ... } }
    │  4. Show "building..." placeholder
    │
    ▼
Event: onComponentBuilt { id: 'abc-123', canvasId: 'main' }
    │
    │  Canvas logic:
    │  1. "Component ready!"
    │  2. const code = await componentService.getBundledCode('abc-123')
    │  3. Create sandbox iframe with code
    │  4. Render!
    │
    ▼
User sees component on canvas!
```

### Flow 2: User Imports Local File

```
User clicks "Import" → selects Button.tsx
    │
    ▼
Extension calls:
    componentService.createComponent({
      name: 'Button',
      canvasId: 'main',
      source: 'local-file',
      sourceData: {
        type: 'local-file',
        filePath: '/users/dev/project/src/components/Button.tsx'
      }
    })
    │
    ▼
ComponentService
    │
    │  1. Generate ID: "xyz-789"
    │
    │  2. Call ImportService.import() → LocalFileAdapter
    │     │
    │     └─► Adapter:
    │         a. Read Button.tsx
    │         b. Scan for imports (./styles.css, ./utils.ts)
    │         c. Copy all dependent files
    │         d. Detect framework (react)
    │         e. Return: {
    │              files: { 'Button.tsx': '...', 'styles.css': '...' },
    │              entryFile: 'Button.tsx',
    │              framework: 'react',
    │              dependencies: { 'react': '18.2.0' },
    │              sourceInfo: { originalPath: '/users/dev/project/src/components/Button.tsx' }
    │            }
    │
    │  3. Write to workspace: .roopik/canvases/main/components/xyz-789/
    │
    │  4. Build and emit events (same as AI flow)
    │
    ▼
Component created and rendered!
```

### Flow 3: User Edits Code

```
User edits Button.tsx in editor
    │
    ▼
FileWatcher detects change
    │
    │  Event: onFileChanged { canvasId: 'main', componentId: 'xyz-789', file: 'Button.tsx' }
    │
    ▼
ComponentService
    │
    │  1. Read updated files from disk
    │  2. Calculate new contentHash
    │  3. Update component meta
    │  4. Emit: onComponentUpdated
    │  5. Trigger rebuild
    │  6. Emit: onComponentBuilt
    │
    ▼
Canvas receives events, re-renders with new bundle
```

---

## Folder Structure

### Core (src/vs/workbench/contrib/roopik/)

```
roopik/
├── common/
│   ├── component/
│   │   └── types.ts                    # Component types (Component, Source, etc.)
│   │
│   ├── build/
│   │   ├── types.ts                    # Build types (ComponentInput, TransformedComponent)
│   │   ├── buildService.ts             # IBuildService interface
│   │   ├── componentParser.ts          # Framework/entry detection
│   │   └── index.ts                    # Re-exports
│   │
│   ├── storage/
│   │   ├── storageTypes.ts             # Storage types (Framework, ComponentSource)
│   │   └── storageService.ts           # IStorageService interface
│   │
│   ├── watch/
│   │   └── fileWatcher.ts              # IFileWatcher interface
│   │
│   └── events.ts                       # Event types
│
├── electron-main/
│   ├── componentService.ts             # ComponentService implementation (Phase 5)
│   │
│   ├── import/
│   │   ├── importService.ts            # ImportService implementation
│   │   ├── IMPORT_DESIGN.md            # Design decisions documentation
│   │   └── adapters/
│   │       ├── types.ts                # Adapter interface & base class
│   │       ├── localFileAdapter.ts     # Import from user's project
│   │       ├── aiAgentAdapter.ts       # Import from AI API response
│   │       ├── manualAdapter.ts        # Create from template
│   │       └── githubAdapter.ts        # (stub) Future GitHub import
│   │
│   ├── build/
│   │   ├── buildService.ts             # BuildService implementation (pure)
│   │   ├── esbuildTransformer.ts       # ESBuild wrapper
│   │   ├── injectors/
│   │   │   ├── types.ts                # Injector interface
│   │   │   ├── index.ts                # Pipeline creation
│   │   │   ├── errorBoundaryInjector.ts
│   │   │   ├── inspectModeInjector.ts
│   │   │   └── hmrBridgeInjector.ts
│   │   └── index.ts                    # Re-exports
│   │
│   ├── storage/
│   │   ├── storageService.ts           # StorageService implementation
│   │   ├── workspaceStorage.ts         # .roopik/ operations
│   │   ├── appDataStorage.ts           # App data cache operations
│   │   └── paths.ts                    # Path utilities
│   │
│   ├── watch/
│   │   └── fileWatcher.ts              # File watching implementation (Phase 4)
│   │
│   └── channel/
│       └── componentChannel.ts         # IPC channel registration (Phase 5)
│
└── browser/
    ├── componentServiceClient.ts       # IPC proxy for extension (Phase 6)
    └── roopik.contribution.ts          # Register client, commands
```

### Extension (extensions/roopik/)

```
roopik/
├── src/
│   ├── extension.ts                    # Activation, register commands
│   ├── canvasPanel.ts                  # Canvas webview panel
│   └── services/
│       ├── canvasStateManager.ts       # Manages canvas.json
│       └── gridManager.ts              # Smart placement algorithm
│
└── webview/
    └── src/
        └── canvasView/
            ├── App.tsx                 # Main canvas component
            ├── components/
            │   ├── InfiniteCanvas/
            │   ├── SandboxCard/
            │   └── ...
            └── hooks/
                └── useComponentService.ts  # Hook to interact with service
```

---

## Implementation Phases

### Phase 0: Cleanup (Delete Old Code)

**Goal**: Remove all existing component pipeline code except ESBuildTransformer

**Files to DELETE in Core:**

```
src/vs/workbench/contrib/roopik/
├── common/
│   ├── sandboxPipeline/
│   │   ├── types.ts                    ❌ DELETE (replace with new types)
│   │   ├── sandboxPipelineService.ts   ❌ DELETE
│   │   └── componentParser.ts          ⚠️ KEEP (may reuse detection logic)
│   │
│   └── import/
│       └── importTypes.ts              ❌ DELETE (replace with new types)
│
├── browser/
│   ├── sandboxPipelineClient.ts        ❌ DELETE
│   └── commands/
│       ├── pipelineCommands.ts         ❌ DELETE
│       └── importCommands.ts           ❌ DELETE
│
└── electron-main/
    ├── sandboxPipeline/
    │   ├── sandboxPipelineMainService.ts  ❌ DELETE
    │   ├── sandboxQueue.ts                ❌ DELETE
    │   ├── sandboxPipelineChannel.ts      ❌ DELETE
    │   ├── ipcHandlers.ts                 ❌ DELETE
    │   └── esbuildTransformer.ts          ✅ KEEP! (move to build/)
    │
    └── import/
        ├── importService.ts               ❌ DELETE
        └── localFileAdapter.ts            ❌ DELETE (rewrite)
```

**Files to DELETE in Extension:**

```
extensions/roopik/src/
├── services/
│   ├── CoreBridgeService.ts            ❌ DELETE
│   ├── ComponentRebuildService.ts      ❌ DELETE
│   ├── BundleCacheService.ts           ❌ DELETE
│   └── SourceFileWatcher.ts            ❌ DELETE (move to Core)
│
└── types/
    └── pipeline.ts                     ❌ DELETE
```

**Deliverable**: Clean slate with only ESBuildTransformer remaining

---

### Phase 0.5: Storage Service (Foundation)

**Goal**: Implement the dual storage system - this is the FOUNDATION everything else builds on

**Why First?**:
- Every other service (Import, Build, Component) needs storage
- Can't save components without knowing WHERE to save
- Can't build without knowing where source and cache live
- Storage structure defines the data model

**Tasks**:

1. **Define Storage Interface** (`common/storageService.ts`)
   ```typescript
   interface IStorageService {
     // Workspace operations (source code)
     saveComponentSource(canvasId: string, componentId: string, files: SourceFiles): Promise<string>;
     loadComponentSource(canvasId: string, componentId: string): Promise<SourceFiles>;
     deleteComponent(canvasId: string, componentId: string): Promise<void>;

     // Cache operations (bundled output)
     saveBundleCache(canvasId: string, componentId: string, bundle: BundledOutput): Promise<void>;
     loadBundleCache(canvasId: string, componentId: string): Promise<BundledOutput | null>;
     invalidateCache(canvasId: string, componentId: string): Promise<void>;

     // Canvas operations
     createCanvas(canvasId: string, name: string): Promise<void>;
     getCanvases(): Promise<CanvasInfo[]>;
     deleteCanvas(canvasId: string): Promise<void>;

     // Paths
     getWorkspacePath(): string;
     getAppDataPath(): string;
     getComponentPath(canvasId: string, componentId: string): string;
     getCachePath(canvasId: string, componentId: string): string;
   }
   ```

2. **Path Utilities** (`electron-main/storage/paths.ts`)
   - Workspace path: `{workspaceRoot}/.roopik/`
   - App data path (cross-platform):
     - Windows: `%APPDATA%/roopik/workspaces/{hash}/`
     - macOS: `~/Library/Application Support/roopik/workspaces/{hash}/`
     - Linux: `~/.config/roopik/workspaces/{hash}/`
   - Workspace hash generation (consistent across sessions)

3. **Workspace Storage** (`electron-main/storage/workspaceStorage.ts`)
   - Initialize `.roopik/` structure on first use
   - Create canvas folders: `.roopik/canvases/{canvasId}/`
   - Create component folders: `.roopik/canvases/{canvasId}/components/{componentId}/`
   - Read/write component files
   - Manage `index.json` registries

4. **App Data Storage** (`electron-main/storage/appDataStorage.ts`)
   - Initialize app data structure (mirrors workspace)
   - Write bundled code: `{appData}/canvases/{canvasId}/components/{componentId}/bundle.js`
   - Write build metadata: `{appData}/canvases/{canvasId}/components/{componentId}/build.json`
   - Cache invalidation

5. **Storage Service** (`electron-main/storage/storageService.ts`)
   - Combines WorkspaceStorage + AppDataStorage
   - Implements IStorageService
   - Single entry point for all storage operations

**Storage Structure Created**:

```
Workspace (.roopik/)                    App Data (cache)
├── config.json                         ├── workspace.json
├── canvases/                           └── canvases/
│   ├── index.json                          ├── {canvasId}/
│   └── {canvasId}/                         │   └── components/
│       ├── canvas.json (Extension)         │       └── {componentId}/
│       └── components/                     │           ├── bundle.js
│           ├── index.json                  │           └── build.json
│           └── {componentId}/
│               ├── meta.json
│               └── {source files}
```

**Deliverable**:
- Can create/delete canvases
- Can save/load component source files to workspace
- Can save/load bundled code to app data cache
- Cross-platform paths work correctly
- Storage structure matches architecture diagram exactly

**Test Checklist**:
- [ ] Create canvas creates correct folder structure
- [ ] Save component writes files to correct location
- [ ] Load component reads files correctly
- [ ] Delete component removes workspace AND cache files
- [ ] App data mirrors workspace structure
- [ ] Works on Windows, macOS, Linux

---

### Phase 1: Core Types & Interfaces

**Goal**: Define all types and service interfaces (now that we know storage structure)

**Tasks**:
1. Create `common/component.ts` - Component types
2. Create `common/componentService.ts` - IComponentService interface
3. Create `common/importService.ts` - IImportService, IImportAdapter interfaces
4. Create `common/buildService.ts` - IBuildService interface
5. Create `common/fileWatcher.ts` - IFileWatcher interface
6. Create `common/events.ts` - All event types

**Note**: `IStorageService` already defined in Phase 0.5

**Deliverable**: Complete type system, all interfaces defined

---

### Phase 2: Build Service ✅

**Goal**: Implement pure component building with ESBuild

**Design Decision**: BuildService is PURE - it takes files in and returns bundled code out.
The caller (ComponentService in Phase 5) is responsible for:
- Reading source files from workspace
- Passing files to BuildService
- Writing bundled output to app data cache
- Managing cache invalidation

**Tasks**:
1. ✅ Move `esbuildTransformer.ts` to `electron-main/build/`
2. ✅ Move `componentParser.ts` to `common/build/`
3. ✅ Move `types.ts` to `common/build/`
4. ✅ Create `electron-main/build/injectors/` pipeline
   - Inject inspect-on-hover scripts
   - Inject click-to-source scripts
   - Inject error boundary
   - Inject HMR bridge

5. ✅ Create `electron-main/build/buildService.ts`
   - Implement IBuildService
   - Pure function: `build(input) => output`
   - Calls ESBuildTransformer
   - Applies InjectorPipeline
   - Returns bundled code + CDN URLs + metadata
   - NO storage operations (caller handles)

6. ✅ Create `common/build/buildService.ts` (interface)

**Deliverable**: Pure build service that transforms source files to bundled code

---

### Phase 3: Import Service & Adapters

**Goal**: Implement all import sources

**Tasks**:
1. Create `electron-main/import/importService.ts`
   - Adapter registry
   - Dispatch to correct adapter

2. Create `electron-main/import/adapters/aiAgentAdapter.ts`
   - Accept code directly
   - Detect framework if not provided
   - Generate proper file structure

3. Create `electron-main/import/adapters/localFileAdapter.ts`
   - Read file from user's project
   - Scan for local imports (CSS, utils)
   - Block component imports (other .tsx)
   - Copy all files

4. Create `electron-main/import/adapters/manualAdapter.ts`
   - Generate template code
   - Support blank, basic, with-state templates

5. Stub `githubAdapter.ts` and `figmaAdapter.ts` for future

**Deliverable**: Can import from AI, local file, manual

---

### Phase 4: File Watcher

**Goal**: Watch component files for changes

**Tasks**:
1. Create `electron-main/watch/fileWatcher.ts`
   - Watch .roopik/canvases/*/components/*/
   - Debounce rapid changes
   - Emit file change events
   - Handle file additions/deletions

**Deliverable**: Auto-detect file changes

---

### Phase 5: Component Service (Orchestrator)

**Goal**: Main service that ties everything together

**Tasks**:
1. Create `electron-main/componentService.ts`
   - In-memory component registry
   - Coordinate ImportService, BuildService, StorageService
   - Emit all events
   - Handle file watcher events → rebuild

2. Create `electron-main/channel/componentChannel.ts`
   - Register IPC handlers
   - Expose all service methods
   - Forward events to renderer

**Deliverable**: Complete working service in Core

---

### Phase 6: Browser Client & Commands

**Goal**: Extension can call Core service

**Tasks**:
1. Create `browser/componentServiceClient.ts`
   - IPC proxy implementing IComponentService
   - Forward all calls to main process
   - Subscribe to events

2. Update `browser/roopik.contribution.ts`
   - Register ComponentServiceClient
   - Register basic commands

**Deliverable**: Extension can use service

---

### Phase 7: Extension Integration

**Goal**: Canvas uses new service

**Tasks**:
1. Update `extension.ts`
   - Remove old service initialization
   - Subscribe to ComponentService events

2. Update `canvasPanel.ts`
   - Remove build logic
   - Subscribe to events
   - Smart placement on componentCreated
   - Fetch bundle on componentBuilt

3. Update `canvasStateManager.ts`
   - Manage placements
   - Persist to canvas.json

4. Update webview React components
   - Remove build request logic
   - Pure display only

**Deliverable**: Full integration working!

---

### Phase 8: Polish & Testing

**Goal**: Production ready

**Tasks**:
1. Error handling
   - Graceful failures
   - Meaningful error messages

2. Logging
   - Structured logging
   - Debug mode

3. Performance
   - Parallel builds with concurrency limit
   - Efficient file watching

4. Testing
   - Unit tests for each service
   - Integration tests

**Deliverable**: Stable, tested system

---

## Migration Checklist

### Pre-Migration
- [ ] Document current behavior
- [ ] Backup existing code
- [ ] Create feature branch

### Phase 0: Cleanup ✅
- [x] Delete old sandboxPipeline files (except esbuildTransformer)
- [x] Delete old import files
- [x] Delete extension services (CoreBridge, BundleCache, etc.)
- [ ] Verify ESBuildTransformer still works standalone
- [ ] Clean build outputs

### Phase 0.5: Storage Service (Foundation)
- [ ] common/storageService.ts (interface)
- [ ] electron-main/storage/paths.ts
- [ ] electron-main/storage/workspaceStorage.ts
- [ ] electron-main/storage/appDataStorage.ts
- [ ] electron-main/storage/storageService.ts
- [ ] Can create .roopik/ structure
- [ ] Can write/read component files
- [ ] Can write/read cache files
- [ ] Cross-platform paths work

### Phase 1: Core Types & Interfaces
- [ ] common/component.ts
- [ ] common/componentService.ts
- [ ] common/importService.ts
- [ ] common/buildService.ts
- [ ] common/fileWatcher.ts
- [ ] common/events.ts
- [ ] TypeScript compiles without errors

### Phase 2: Build Service ✅
- [x] Move esbuildTransformer.ts to build/
- [x] Move componentParser.ts to build/
- [x] Move types.ts to build/
- [x] build/injectors/ pipeline (errorBoundary, inspectMode, hmrBridge)
- [x] build/buildService.ts (pure: takes files, returns bundled code)
- [x] common/build/buildService.ts (IBuildService interface)
- [ ] Can build React component (tested manually)
- [ ] Can build Vue component (tested manually)
- [ ] Can build Svelte component (tested manually)

### Phase 3: Import Service & Adapters ✅
- [x] import/importService.ts
- [x] adapters/types.ts (BaseImportAdapter)
- [x] adapters/aiAgentAdapter.ts (with detailed docs on when to use vs FileWatcher)
- [x] adapters/localFileAdapter.ts
- [x] adapters/manualAdapter.ts
- [x] adapters/githubAdapter.ts (stub for future)
- [x] import/IMPORT_DESIGN.md (design documentation)
- [x] Dependency scanning (in BaseImportAdapter)
- [x] Framework detection (uses ComponentParser)

### Phase 4: File Watcher ✅
- [x] common/watch/fileWatcher.ts (IFileWatcher interface)
- [x] electron-main/watch/fileWatcher.ts (implementation)
- [x] Parses path to extract canvasId/componentId
- [x] Debouncing (300ms per component)
- [x] Filters source files only (ignores meta.json, index.json)
- [x] Maps fs.watch events to create/change/delete

### Phase 5: Component Service (Orchestrator)
- [ ] componentService.ts
- [ ] channel/componentChannel.ts
- [ ] Create component works
- [ ] Delete component works
- [ ] Update component works
- [ ] Events fire correctly
- [ ] File watcher triggers rebuild

### Phase 6: Browser Client & Commands
- [ ] componentServiceClient.ts
- [ ] IPC calls work
- [ ] Events received in browser
- [ ] Commands registered

### Phase 7: Extension Integration
- [ ] extension.ts updated
- [ ] canvasPanel.ts updated
- [ ] canvasStateManager.ts updated
- [ ] Webview updated
- [ ] Full flow works end-to-end

### Phase 8: Polish & Testing
- [ ] Error handling complete
- [ ] Logging added
- [ ] Performance optimized
- [ ] Tests written
- [ ] Documentation updated

---

## Success Criteria

### Functional
- [ ] AI Agent can create components with immediate result
- [ ] User can import local files
- [ ] User can edit component code
- [ ] Changes auto-rebuild
- [ ] Canvas displays components correctly
- [ ] Multiple canvases work independently

### Non-Functional
- [ ] IPC payloads < 1KB (no file contents)
- [ ] Build time < 2 seconds for typical component
- [ ] File changes detected within 500ms
- [ ] No memory leaks on long sessions
- [ ] Works on Windows, macOS, Linux

### Architecture
- [ ] Each service testable in isolation
- [ ] No circular dependencies
- [ ] Clear separation Core vs Extension
- [ ] Events are the only cross-boundary communication

---

*Document Version: 2.0*
*Last Updated: December 2024*
*Status: Ready for Implementation*
