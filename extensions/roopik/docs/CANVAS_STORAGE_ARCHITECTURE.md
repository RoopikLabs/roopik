# Canvas Storage Architecture

> **Goal**: Clean user workspace with source files only. Build artifacts cached in VS Code storage.

---

## Directory Structure

### User Workspace (Monitored by FileWatcher)

```
project/
└── roopik-workspace/                          ← WORKSPACE_ROOT constant
    └── canvases/                              ← CANVASES_DIR constant
        └── {canvas-name}/
            ├── canvas.meta.json               ← Layout, viewport, component order
            └── components/                    ← COMPONENTS_DIR constant
                └── {component-name}/
                    ├── {component-name}.tsx   ← Source code (editable)
                    ├── styles.css             ← Optional
                    └── component.json         ← Position, framework, dependencies
```

### VS Code Storage (Cache, not monitored)

```
~/.vscode/workspaceStorage/{id}/roopik/        ← context.storageUri
└── canvases/                                  ← Mirror structure
    └── {canvas-name}/
        └── components/
            └── {component-name}/
                ├── bundle.js                  ← Compiled code
                └── bundle.meta.json           ← sourceHash, buildTime, cdnUrls
```

---

## File Contents

### `canvas.meta.json` (User workspace)
```json
{
  "id": "canvas-123",
  "name": "Login",
  "viewport": { "x": 0, "y": 0, "scale": 1 },
  "backgroundColor": "#1a1a1a",
  "backgroundPattern": "dots",
  "componentOrder": ["LoginForm", "SignupButton"],
  "createdAt": 1234567890,
  "updatedAt": 1234567890
}
```

### `component.json` (User workspace)
```json
{
  "id": "loginform-123",
  "framework": "react",
  "entryFile": "LoginForm.tsx",
  "position": { "x": 100, "y": 100 },
  "size": { "width": 500, "height": 500 },
  "zIndex": 1,
  "dependencies": { "react": "18.2.0", "react-dom": "18.2.0" },
  "source": "ai-generated",
  "createdAt": 1234567890
}
```

### `bundle.meta.json` (VS Code storage)
```json
{
  "sourceHash": "sha256:abc123...",
  "bundledAt": 1234567890,
  "framework": "react",
  "cdnUrls": ["https://esm.sh/react@18.2.0"],
  "size": 4523
}
```

---

## Data Flow

### Build Flow
```
Source changed → FileWatcher triggers → Compare hash → Rebuild if different → Save to VS Code storage → Send to webview
```

### Load Flow (Canvas open)
```
Read canvas.meta.json → For each component: check cache hash → Cache hit? Load bundle : Trigger build
```

### Force Rebuild
```
User clicks reload → Skip hash check → Build fresh → Update cache → Re-render
```

---

## Key Principles

| Principle | Implementation |
|-----------|----------------|
| **Clean workspace** | Only source files, no build artifacts |
| **Single monitoring point** | FileWatcher only on user workspace |
| **Passive cache** | VS Code storage checked on-demand only |
| **Mirrored structure** | VS Code storage mirrors workspace paths |
| **Git-friendly** | User can commit entire `roopik-workspace/` |
| **AI-friendly** | No dot-prefix, readable file structure |

---

## Constants

```
WORKSPACE_ROOT = "roopik-workspace"
CANVASES_DIR = "canvases"
COMPONENTS_DIR = "components"
FILE_WATCHER_DEBOUNCE_MS = 500
```

---

## Implementation Phases

### Phase 1: Storage Service
- Create `BundleCacheService` for VS Code storage read/write
- Mirror workspace structure in storage
- Implement hash computation (SHA256 of source files)
- Add cache read/write methods

### Phase 2: File Watcher
- Watch `roopik-workspace/**/*.{tsx,jsx,vue,svelte,css,json}`
- Debounce changes (500ms)
- Extract canvas/component info from path
- Trigger rebuild on source change

### Phase 3: Canvas Load with Cache
- On canvas open: check cache for each component
- Compare stored sourceHash vs current source
- Cache hit → Load bundle directly (skip Core)
- Cache miss → Build and cache

### Phase 4: UI Enhancements
- Add reload button on SandboxCard header
- Add "building" indicator when rebuilding
- Show cache status in dev mode (optional)

---

## Migration from Current System

1. **Keep current system working** during migration
2. **Add new storage alongside** existing `.roopik/`
3. **Gradual migration**: New components use new system
4. **Deprecate old**: Remove `.roopik/canvas-state.json` after validation
5. **Move logs**: Relocate `.roopik/logs/` to VS Code storage (separate task)

