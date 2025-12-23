# Canvas Component Architecture V2

## Executive Summary

This document defines the **metadata-only architecture** for canvas components. Source code lives at its original location; `.roopik/` stores only references and metadata.

**Key Principles:**
1. `.roopik/` = metadata only (no source code copying)
2. Build cache = AppData (not workspace)
3. Components can live anywhere
4. Two-level metadata (registry + per-canvas file)

---

## Final Architecture

### Workspace Structure (`.roopik/`)

```
.roopik/
├── canvases.json                    # Canvas registry (lightweight)
└── canvases/
    ├── login-ui.json                # Full canvas data + all components
    ├── dashboard-experiment.json
    └── onboarding-screens.json
```

**That's it!** No source files, no build outputs, no nested folders.

### Build Cache (AppData - unchanged)

```
~/.vscode/roopik-data/{workspace-hash}/
└── canvases/
    └── {canvas-id}/
        └── components/
            └── {component-id}/
                ├── bundle.js        # Bundled code
                └── build.json       # Build metadata (hash, time, etc.)
```

Build cache stays in AppData - we don't pollute the workspace.

---

## Metadata Schema

### canvases.json (Registry)

```typescript
// .roopik/canvases.json
interface CanvasRegistry {
  version: 1;
  canvases: CanvasEntry[];
}

interface CanvasEntry {
  id: string;           // "login-ui"
  name: string;         // "Login UI"
  updatedAt: number;    // Last modified timestamp
}
```

**Purpose:** Quick listing without reading all canvas files.

### {canvas-id}.json (Per-Canvas)

```typescript
// .roopik/canvases/login-ui.json
interface CanvasFile {
  id: string;                      // "login-ui"
  name: string;                    // "Login UI"
  createdAt: number;
  updatedAt: number;
  description?: string;
  icon?: string;
  color?: string;

  components: Record<string, ComponentReference>;
}

interface ComponentReference {
  // === REQUIRED (Minimal) ===
  name: string;                    // "Button"
  folderPath: string;              // "/src/components/Button" (folder containing component)
  entryFile: string;               // "Button.tsx" (relative to folderPath)

  // === AUTO-DETECTED ===
  framework: Framework;            // "react" | "vue" | "svelte" | etc.

  // === CANVAS-SPECIFIC ===
  position?: {
    x: number;
    y: number;
    zIndex?: number;
  };

  // === TIMESTAMPS ===
  createdAt: number;
  updatedAt: number;

  // === OPTIONAL (Future) ===
  source?: ComponentSource;        // For GitHub/Figma/npm imports
}

// Source types for future imports
type ComponentSource =
  | { type: 'local' }                                    // Default
  | { type: 'github'; repo: string; branch?: string; commit?: string }
  | { type: 'figma'; fileId: string; nodeId: string }
  | { type: 'npm'; package: string; exportName?: string };

type Framework = 'react' | 'vue' | 'svelte' | 'solid' | 'html' | 'unknown';
```

### Why `folderPath` + `entryFile`?

| Approach | Example | Pros | Cons |
|----------|---------|------|------|
| Single `path` | `/src/Button.tsx` | Simple | Can't handle multi-file |
| `folderPath` + `entryFile` | `/src/Button/` + `index.tsx` | Multi-file ready, clear | Slightly more fields |

**Benefits of folder-based:**
1. **Multi-file ready**: CSS, tests, stories can be in same folder
2. **File watching**: Watch the folder, catch all related changes
3. **Clear entry point**: Know exactly which file to build from
4. **Future-proof**: Add files without changing structure

---

## Data Flow

### Adding Component to Canvas

```
User/Agent specifies:
├── canvasId: "login-ui"
├── folderPath: "/src/components/Button"
└── entryFile: "Button.tsx" (or auto-detect)
        │
        ▼
ComponentService.addToCanvas()
        │
        ├─ Validate folder exists
        ├─ Auto-detect entryFile if not specified
        ├─ Detect framework from imports
        │
        ▼
Save reference to .roopik/canvases/login-ui.json
        │
        ├─ Add to components: { "comp_abc": { ... } }
        ├─ Update updatedAt
        │
        ▼
FileWatcher.watchFolder(folderPath)
        │
        ├─ Watch entire folder for changes
        │
        ▼
BuildService.build(folderPath, entryFile)
        │
        ├─ Read source from ORIGINAL location
        ├─ Bundle with ESBuild
        ├─ Save to AppData cache
        │
        ▼
Fire onComponentBuilt event
        │
        └─ UI receives bundled code, renders in iframe
```

### File Change → Rebuild

```
User edits /src/components/Button/Button.tsx
        │
        ▼
FileWatcher detects change in watched folder
        │
        ├─ Lookup: Which component watches this folder?
        ├─ Find: comp_abc in login-ui canvas
        │
        ▼
ComponentService.rebuildComponent("comp_abc")
        │
        ├─ Read from ORIGINAL folderPath
        ├─ Bundle
        ├─ Update cache
        │
        ▼
Fire onComponentBuilt event
        │
        └─ Hot reload in canvas UI
```

### Build Cache (Unchanged)

```
BuildService completes:
        │
        ▼
storageService.saveBundleCache(canvasId, componentId, bundle)
        │
        ├─ Writes to AppData (NOT workspace)
        ├─ ~/.vscode/roopik-data/{hash}/canvases/{canvas}/components/{comp}/
        │
        ▼
Later, loadBundleCache() retrieves it
        │
        └─ Cache validated by content hash
```

---

## File Watcher Strategy

### Option 1: Watch Specific Folders (Recommended)

```typescript
class ComponentFileWatcher {
  // Map: folderPath → { componentId, canvasId }
  private watchedFolders = new Map<string, WatchInfo>();

  watchComponent(componentId: string, canvasId: string, folderPath: string): void {
    if (this.watchedFolders.has(folderPath)) {
      return; // Already watching
    }

    const watcher = fs.watch(folderPath, { recursive: true }, (event, filename) => {
      if (this.isSourceFile(filename)) {
        this._onFileChanged.fire({ componentId, canvasId, file: filename });
      }
    });

    this.watchedFolders.set(folderPath, { componentId, canvasId, watcher });
  }

  unwatchComponent(folderPath: string): void {
    const info = this.watchedFolders.get(folderPath);
    if (info) {
      info.watcher.close();
      this.watchedFolders.delete(folderPath);
    }
  }

  private isSourceFile(filename: string): boolean {
    const ext = path.extname(filename).toLowerCase();
    return ['.ts', '.tsx', '.js', '.jsx', '.vue', '.svelte', '.css', '.scss'].includes(ext);
  }
}
```

**When to watch/unwatch:**
- Component added to canvas → `watchComponent()`
- Component removed from canvas → `unwatchComponent()`
- Canvas loaded → Watch all its components
- Canvas closed → Optionally keep watching (for background rebuilds)

---

## MCP Tools for Canvas (Proposed)

### Core Tools

```typescript
// Create/manage canvases
roopik_createCanvas({ name: string }) → { canvasId, success }
roopik_listCanvases() → { canvases: CanvasEntry[] }
roopik_deleteCanvas({ canvasId: string }) → { success }

// Add/remove components
roopik_addComponentToCanvas({
  canvasId?: string,           // Uses active canvas if not specified
  folderPath: string,          // "/src/components/Button"
  entryFile?: string,          // Auto-detect if not specified
  name?: string                // Defaults to folder name
}) → { componentId, success }

roopik_removeComponentFromCanvas({
  componentId: string
}) → { success }

// Read/modify components
roopik_getComponentSource({
  componentId: string
}) → { files: Record<string, string>, entryFile, folderPath }

roopik_updateComponentSource({
  componentId: string,
  files: Record<string, string>  // Writes to ORIGINAL location
}) → { success }

// List components
roopik_listComponents({
  canvasId?: string            // Uses active canvas if not specified
}) → { components: ComponentInfo[] }

// Get active canvas
roopik_getActiveCanvas() → { canvasId, name } | null
```

### Agent Workflow Example

```
Agent: "Create 3 button variants in a new canvas"

1. Create canvas
   roopik_createCanvas({ name: "Button Variants" })
   → { canvasId: "button-variants" }

2. Create component files (using standard file tools)
   Write /src/components/buttons/PrimaryButton/PrimaryButton.tsx
   Write /src/components/buttons/SecondaryButton/SecondaryButton.tsx
   Write /src/components/buttons/GhostButton/GhostButton.tsx

3. Add to canvas
   roopik_addComponentToCanvas({
     canvasId: "button-variants",
     folderPath: "/src/components/buttons/PrimaryButton"
   })
   roopik_addComponentToCanvas({
     canvasId: "button-variants",
     folderPath: "/src/components/buttons/SecondaryButton"
   })
   roopik_addComponentToCanvas({
     canvasId: "button-variants",
     folderPath: "/src/components/buttons/GhostButton"
   })

4. Modify if needed (edits ORIGINAL files)
   roopik_updateComponentSource({
     componentId: "comp_abc",
     files: { "PrimaryButton.tsx": "...updated code..." }
   })
```

---

## Migration Path

### From Current (3-level + file copying) to New (2-level + references)

1. **Read existing components**
   - Scan `.roopik/canvases/{id}/components/{id}/`
   - Extract source files

2. **Determine original location**
   - If `sourceInfo.originalPath` exists → use it
   - If not → keep files in `.roopik/` as "orphaned" (user can move)

3. **Create new structure**
   - Generate `{canvas-id}.json` with component references
   - Update `canvases.json` registry

4. **Clean up old structure**
   - Remove `.roopik/canvases/{id}/components/` folders
   - Remove `meta.json`, `index.json` files

---

## Comparison: Before vs After

| Aspect | Before (Current) | After (New) |
|--------|-----------------|-------------|
| **Source storage** | Copied to `.roopik/` | Original location |
| **Metadata files** | 3 levels (canvas + index + component) | 2 levels (registry + canvas) |
| **File watching** | Only `.roopik/` | Original folders |
| **Build cache** | AppData ✓ | AppData ✓ (unchanged) |
| **Agent workflow** | Confusing (which file?) | Clear (original path) |
| **Disk usage** | High (duplicates) | Low (references only) |
| **Multi-file components** | Supported but complex | Simple (folder-based) |

---

## Summary

**Minimal metadata, maximum flexibility:**

```
.roopik/
├── canvases.json                    # Quick listing
└── canvases/
    └── {canvas-id}.json             # Full canvas + component references
```

**Each component reference:**
```json
{
  "name": "Button",
  "folderPath": "/src/components/Button",
  "entryFile": "Button.tsx",
  "framework": "react",
  "position": { "x": 100, "y": 200 },
  "createdAt": 1699999999999,
  "updatedAt": 1699999999999
}
```

**Build cache:** AppData (unchanged, not in workspace)

**File watching:** Per-folder, only registered components
