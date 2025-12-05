# Canvas Storage Architecture

> **Version**: 2.0
> **Status**: Approved
> **Last Updated**: 2024

---

## Overview

This document describes the storage architecture for Roopik's Canvas Mode (Mode 1). The design separates **source code** (user workspace) from **build artifacts** (VS Code storage) to achieve:

- Clean, git-friendly user workspace
- AI/user editable source files
- Fast canvas loading via bundle caching
- Automatic rebuild on source changes

### Responsibility Split

| Layer | Responsibility |
|-------|----------------|
| **Core** (Main Process) | File reading, framework detection, dependency resolution, CDN URL generation, ESBuild bundling |
| **Extension** (Node.js) | UI rendering, cache management, file watching, triggering Core for tasks |
| **Webview** (React) | Canvas UI, sandbox rendering, user interactions |

Extension does NOT do heavy lifting - it orchestrates and renders. Core does all the processing.

---

## Design Principles

### 1. Clean User Workspace
**Problem**: Current design stores bundled code, CDN URLs, and source code all in one JSON file. This creates:
- Bloated files (50KB+ per canvas)
- Git commits with build artifacts
- AI agents reading unnecessary data

**Solution**: User workspace contains ONLY source code and metadata. Build artifacts live in VS Code storage (hidden from user).

### 2. Single Monitoring Point
**Problem**: If we store data in multiple locations, file watching becomes complex and error-prone.

**Solution**: FileWatcher monitors ONLY user workspace. VS Code storage is checked passively (on-demand), never actively watched.

### 3. Mirrored Structure
**Problem**: Different folder structures between workspace and cache makes debugging difficult.

**Solution**: VS Code storage mirrors the exact same path structure as user workspace:
```
Workspace: roopik-workspace/canvases/Login/components/LoginForm/
Storage:   ~/.vscode/.../roopik/canvases/Login/components/LoginForm/
```

### 4. Resilient Design
**Problem**: Missing files or corrupted JSON could crash the system.

**Solution**:
- If `component.json` missing → auto-generate from folder contents
- If cache missing → rebuild automatically
- If hash mismatch → rebuild automatically

### 5. AI-Friendly
**Problem**: Dot-prefixed folders (`.roopik`) are often ignored by AI agents.

**Solution**: Use `roopik-workspace/` (no dot prefix) for user-facing files that AI needs to read/edit.

---

## Directory Structure

### User Workspace (Monitored by FileWatcher)

```
project/
└── roopik-workspace/
    └── canvases/
        └── {canvas-name}/
            ├── canvas.meta.json
            └── components/
                └── {component-name}/
                    ├── {component-name}.tsx   ← Source code
                    ├── styles.css             ← Optional additional files
                    ├── utils.ts               ← Optional additional files
                    └── component.json         ← Component metadata
```

### VS Code Storage (Cache - Not Monitored)

```
~/.vscode/workspaceStorage/{workspace-hash}/roopik/
└── canvases/                                  ← Mirrors workspace structure
    └── {canvas-name}/
        └── components/
            └── {component-name}/
                ├── bundle.js                  ← Compiled code (with inspect hooks)
                └── bundle.meta.json           ← Build metadata + source hash
```

**Note on Storage Cleanup**: VS Code does not auto-delete storage when workspace is removed. A dedicated "Clear Roopik Cache" command is provided (see Phase 5) to manage storage cleanup, especially important when AI generates many components.

---

## File Schemas

### canvas.meta.json

**Location**: User workspace
**Purpose**: Canvas-level configuration and component layout
**Who writes**: Extension (on canvas create, component add/move, viewport change)

```json
{
  "id": "canvas-123",
  "name": "Login",
  "viewport": {
    "x": 0,
    "y": 0,
    "scale": 1
  },
  "backgroundColor": "#1a1a1a",
  "backgroundPattern": "dots",
  "layout": [
    {
      "componentId": "LoginForm",
      "x": 100,
      "y": 100,
      "width": 500,
      "height": 500,
      "zIndex": 1
    },
    {
      "componentId": "SignupButton",
      "x": 700,
      "y": 100,
      "width": 500,
      "height": 500,
      "zIndex": 2
    }
  ],
  "createdAt": 1234567890,
  "updatedAt": 1234567890
}
```

### component.json

**Location**: User workspace (inside component folder)
**Purpose**: Component-specific configuration for bundling
**Who writes**: Extension (on component create/import)

```json
{
  "id": "loginform-123",
  "framework": "react",
  "entryFile": "LoginForm.tsx",
  "files": [
    "LoginForm.tsx",
    "styles.css"
  ],
  "dependencies": {
    "react": "18.2.0",
    "react-dom": "18.2.0"
  },
  "source": "ai-generated",
  "createdAt": 1234567890
}
```

**Field Descriptions**:
- `framework`: Used by Core to select correct bundler plugins
- `entryFile`: The main file that exports the component
- `files`: List of all files belonging to this component (used for hashing and bundling)
- `dependencies`: npm packages needed (resolved to CDN URLs by Core)
- `source`: Origin of component (`ai-generated`, `imported`, `sample`)

**Resilience**: If `component.json` is missing, extension will:
1. Scan folder for source files (`.tsx`, `.jsx`, `.vue`, `.svelte`, `.css`)
2. Auto-detect framework from file extension
3. Generate `component.json` with sensible defaults

**Note**: Framework detection, dependency resolution, and CDN URL generation are handled by **Core**, not Extension. Extension's role is UI rendering and triggering Core for tasks.

### bundle.meta.json

**Location**: VS Code storage
**Purpose**: Cache validation and build metadata
**Who writes**: Extension (after successful build)

```json
{
  "sourceHash": "sha256:abc123def456...",
  "bundledAt": 1234567890,
  "framework": "react",
  "cdnUrls": [
    "https://esm.sh/react@18.2.0",
    "https://esm.sh/react-dom@18.2.0"
  ],
  "size": 4523
}
```

**Field Descriptions**:
- `sourceHash`: SHA256 hash of all source files (for cache invalidation)
- `bundledAt`: Timestamp of when bundle was created
- `cdnUrls`: CDN URLs used (stored here, NOT in user workspace)
- `size`: Bundle size in bytes (for debugging)

---

## Data Flow

### Canvas Load Flow

```
1. User opens canvas
2. Extension reads canvas.meta.json from workspace
3. For each component in layout:
   a. Read component.json from workspace
   b. Read all source files listed in "files"
   c. Compute SHA256 hash of source files
   d. Check VS Code storage for bundle.meta.json
   e. Compare sourceHash:
      - MATCH → Load bundle.js from storage (skip Core)
      - MISMATCH → Queue for rebuild
4. Send cached components to webview immediately
5. Trigger builds for components with cache miss
6. Update webview as builds complete
```

### File Change Flow

```
1. FileWatcher detects change in roopik-workspace/
2. Debounce 500ms (avoid rapid rebuilds while typing)
3. Extract canvas name and component name from path
4. Read all source files for that component
5. Compute new hash
6. Compare with stored sourceHash in bundle.meta.json
7. If different:
   a. Send source to Core pipeline
   b. Receive bundled code
   c. Save bundle.js to VS Code storage
   d. Update bundle.meta.json with new sourceHash
   e. Send componentBuilt message to webview
   f. UI updates automatically
```

### Force Rebuild Flow (Manual Reload Button)

```
1. User clicks reload button on sandbox
2. Extension receives forceRebuild message
3. Read source files (fresh)
4. SKIP hash comparison
5. Send to Core pipeline
6. Save new bundle + update hash
7. Send to webview
```

---

## Configuration Constants

All configurable values should be defined as constants for easy modification:

```typescript
// Paths
const WORKSPACE_ROOT = 'roopik-workspace';
const CANVASES_DIR = 'canvases';
const COMPONENTS_DIR = 'components';

// Files
const CANVAS_META_FILE = 'canvas.meta.json';
const COMPONENT_META_FILE = 'component.json';
const BUNDLE_FILE = 'bundle.js';
const BUNDLE_META_FILE = 'bundle.meta.json';

// Behavior
const FILE_WATCHER_DEBOUNCE_MS = 500;
const BUILD_TIMEOUT_MS = 30000;

// File extensions
const SOURCE_EXTENSIONS = ['.tsx', '.jsx', '.vue', '.svelte', '.ts', '.js', '.css'];
```

---

## Implementation Phases

### Phase 1: Storage Service
**Goal**: Create infrastructure for VS Code storage operations

- Create `BundleCacheService` class
- Implement storage path resolution (mirroring workspace structure)
- Add bundle read/write methods
- Implement SHA256 hash computation for source files
- Add cache validation (compare hashes)

### Phase 2: File Watcher
**Goal**: Detect source file changes and trigger rebuilds

- Create `SourceFileWatcher` class
- Watch `roopik-workspace/**/*` for changes
- Implement debouncing (500ms)
- Extract canvas/component info from file paths
- Integrate with BundleCacheService for hash comparison
- Trigger rebuild on cache invalidation

### Phase 3: Canvas Load with Cache
**Goal**: Load canvas using cache when available

- Modify canvas loading to check cache first
- Implement parallel loading (cached components load immediately)
- Queue cache misses for building
- Update webview incrementally as builds complete

### Phase 4: UI Enhancements
**Goal**: User-facing improvements

- Add reload button on SandboxCard header
- Add "building" status indicator
- Add "cached" indicator (dev mode)
- Handle component.json auto-generation for missing files

### Phase 5: Cache Management
**Goal**: Provide cache cleanup command for storage management

- Add `roopik.cache.clear` command ("Roopik: Clear Cache")
- Clear all bundles from VS Code storage for current workspace
- Add `roopik.cache.clearAll` command ("Roopik: Clear All Cache")
- Clear bundles across all workspaces (global cleanup)
- Show confirmation dialog with cache size before clearing
- Log cleanup results (files deleted, space freed)

**Why this matters**: AI agents generate many components (100s potentially). Without cleanup, VS Code storage grows unbounded. This command ensures users can reclaim disk space.

---

## Migration Strategy

1. **Parallel Operation**: New system runs alongside existing `.roopik/` system
2. **Gradual Adoption**: New components use new system, existing continue working
3. **Validation Period**: Both systems active for testing
4. **Deprecation**: Remove old `.roopik/canvas-state.json` after validation
5. **Cleanup**: Move `.roopik/logs/` to VS Code storage (separate task)

---

## Future Considerations

- **Export Feature**: Easy to implement since source files are already in proper folder structure
- **Multi-file Components**: Already supported via `files` array in component.json
- **Hot Reload**: FileWatcher + fast hash comparison enables near-instant updates
- **Cache Size Limits**: Could add LRU eviction if storage grows too large
- **Offline Support**: Bundles cached locally, works without network after first build
