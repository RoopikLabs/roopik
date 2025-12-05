# TODO: Phase 2.5 - IPC Cleanup & Architecture Fix

> **Goal**: Remove file content from IPC. Only send paths and events.
> **Status**: In Progress
> **Priority**: HIGH (Blocking Phase 3)

---

## Current Problem

File content travels unnecessarily through IPC:

```
CURRENT (WRONG):
Disk → Extension → Webview → Extension → Core → Extension → Webview
       reads file   stores    sends back   builds   receives   stores
                    content   content              bundledCode bundledCode
```

**Issues**:
1. Source code sent over IPC multiple times
2. Bundled code sent over IPC
3. Webview stores file content in React state
4. Wasteful, slow, memory-intensive

---

## Desired Architecture

```
NEW (CORRECT):
Core reads from disk → Core writes bundledCode to disk → Extension reads from disk
                       ↓ Event only (no file content)
               Extension notifies webview: "component ready"
```

**Principles**:
1. ❌ NO file content over IPC
2. ✅ Only paths and events over IPC
3. ✅ Core reads/writes to disk
4. ✅ Extension reads from disk (for rendering)

---

## File Locations

| Data | Location | Who Writes | Who Reads |
|------|----------|------------|-----------|
| **Source code** | `roopik-workspace/canvases/{canvas}/components/{id}/` | Core (import), User/AI | Core (build), FileWatcher |
| **Bundled code** | VS Code storage (mirrored path) | **Core** | Extension |
| **Bundle metadata** | VS Code storage (mirrored path) | **Core** | Extension |

### Mirrored Folder Structure

```
USER WORKSPACE:                              VS CODE STORAGE:
roopik-workspace/                            {storageUri}/roopik/
└── canvases/                                └── canvases/
    └── Login/                                   └── Login/
        └── components/                              └── components/
            └── LoginForm/                               └── LoginForm/
                ├── LoginForm.tsx  ← Source                  ├── bundle.js      ← Bundled
                ├── styles.css                               └── bundle.meta.json
                └── component.json
```

**Key Insight**:
- Folder structure is **mirrored exactly** for easy debugging
- Extension provides the `bundlePath` (from `context.storageUri`) to Core
- Core writes directly to that path
- No bundled code in user workspace
- No reliance on user gitignore
- Proprietary code stays hidden

---

## Tasks

### Phase 2.5.1: Core Changes

- [ ] **Add `roopik.pipeline.buildFromPath` command**
  - Location: `src/vs/workbench/contrib/roopik/browser/canvas/canvasCommands.ts`
  - Input:
    ```typescript
    {
      sourcePath: string,   // Where to read source: roopik-workspace/.../
      bundlePath: string,   // Where to write bundle: VS Code storage path
      componentId: string,  // Component identifier
      sourceHash: string    // Hash computed by Extension (for race condition handling)
    }
    ```
  - Behavior:
    1. Read all source files from `sourcePath`
    2. Detect framework
    3. Build using existing pipeline
    4. Write `bundle.js` to `bundlePath`
    5. Write `bundle.meta.json` to `bundlePath` (include `sourceHash`)
    6. Return: `{ success: true, sourceHash }` or `{ success: false, error: string }`
  - **Return includes sourceHash so Extension can verify it's still current!**
  - **NO bundled code in return value!**
  - **Extension provides bundlePath from its storageUri**

- [ ] **Update LocalFileAdapter staging path**
  - Location: `src/vs/workbench/contrib/roopik/electron-main/import/localFileAdapter.ts`
  - Change: `.roopik/{canvas}/components/{name}` → `roopik-workspace/canvases/{canvas}/components/{name}`
  - Remove: Don't return `componentInput.files` content
  - Add: Return `stagingPath` for Extension to use

- [ ] **Update ImportResult type**
  - Remove: `componentInput.files` (or make it optional/empty)
  - Add: `componentPath: string` (the staging path)

### Phase 2.5.2: Extension Changes

- [ ] **Update `roopik.canvas.importComponent` handler**
  - Location: `extensions/roopik/src/extension.ts`
  - Remove: Reading file content
  - Change: Just receive path from Core, pass to webview
  - Trigger: `buildFromPath` after webview confirms sandbox created

- [ ] **Add `CoreBridgeService.buildFromPath()`**
  - Location: `extensions/roopik/src/services/CoreBridgeService.ts`
  - Calls: `roopik.pipeline.buildFromPath` command
  - Input:
    ```typescript
    {
      sourcePath: string,   // roopik-workspace/.../component/
      bundlePath: string,   // from context.storageUri
      componentId: string
    }
    ```
  - Returns: `{ success: boolean, error?: string }`
  - **Extension computes bundlePath from storageUri before calling**

- [ ] **Update `BundleCacheService`**
  - Change: Read bundled code from `.roopik/cache/` instead of VS Code storage
  - Why: Core writes there, Extension reads from there
  - Alternative: Keep VS Code storage but copy from Core's output

- [ ] **Update `ComponentRebuildService`**
  - Change: Call `buildFromPath` instead of `buildComponent`
  - Remove: Reading file content for ComponentInput

- [ ] **Remove `handleBuildComponent` from canvasPanel.ts**
  - This handler receives file content from webview - no longer needed
  - Replace with: `handleComponentAdded` that triggers `buildFromPath`

### Phase 2.5.3: Webview Changes

- [ ] **Remove `addImportedComponent` with file content**
  - Location: `extensions/roopik/webview/src/componentView/ComponentView.tsx`
  - Replace with: `componentAdded` message (just id, path, position)

- [ ] **Remove `buildComponent` message sending**
  - Webview no longer sends file content to Extension
  - Extension handles all building

- [ ] **Update Sandbox type**
  - Remove: `componentInput.files` from state
  - Keep: `componentInput.id`, `componentInput.framework`, etc.
  - Add: `componentPath: string`

- [ ] **Update `SandboxCard`**
  - Remove: Any reference to `sandbox.componentInput.files`
  - Keep: `sandbox.bundledCode` (received from Extension after build)

### Phase 2.5.4: Type Updates

- [ ] **Update `ComponentInput` type**
  - Make `files` optional or remove
  - Add `path?: string` for path-based operations

- [ ] **Update message types**
  - Remove: `buildComponent` message type
  - Add: `componentAdded` message type
  - Update: `componentBuilt` to not include bundledCode (just success/error)

- [ ] **Add `componentReady` message**
  - Sent when Extension has loaded bundledCode from disk
  - Includes: `{ componentId, bundledCode }` (Extension reads, sends to webview)

---

## Testing Checklist

- [ ] Import component from local file → renders correctly
- [ ] Load sample component → renders correctly
- [ ] FileWatcher detects change → rebuilds → renders
- [ ] Force rebuild button → works
- [ ] Multiple components → all work independently
- [ ] Canvas reload → components load from cache

---

## Notes

1. **Why VS Code storage for bundled code?**
   - User workspace stays completely clean (only source code)
   - Proprietary/injected code hidden from user
   - No reliance on user gitignore
   - Extension tells Core where to write (passes `storageUri` path)
   - Core writes, Extension reads - both can access the path

2. **Why not send bundledCode over IPC?**
   - Bundled code can be 50KB-500KB per component
   - 100 components = 50MB over IPC
   - Disk read is faster and more memory-efficient

3. **How Core writes to VS Code storage?**
   - Extension knows `context.storageUri` (e.g., `~/.vscode/workspaceStorage/{hash}/roopik/`)
   - Extension passes this path to Core in the `buildFromPath` command
   - Core writes directly to that filesystem path
   - It's just a regular filesystem path - Core can write anywhere!

4. **Why mirror the folder structure?**
   - Easy to debug: same path in both locations
   - Easy to correlate: source ↔ bundle
   - Example:
     - Source: `roopik-workspace/canvases/Login/components/LoginForm/`
     - Bundle: `{storageUri}/roopik/canvases/Login/components/LoginForm/`
   - Just replace prefix, rest of path is identical!

5. **Hash-based race condition handling**
   - **Problem**: User edits rapidly, multiple build requests in flight
   - **Solution**: Extension writes hash to meta BEFORE sending to Core
   - **Flow**:
     ```
     1. File changes
     2. Extension computes hash: "abc123"
     3. Extension writes to bundle.meta.json: { pendingHash: "abc123" }
     4. Extension sends build request to Core
     5. User changes file again!
     6. Extension computes new hash: "xyz789"
     7. Extension updates meta: { pendingHash: "xyz789" }
     8. Extension sends another build request
     9. Core finishes first build, sends event with hash "abc123"
     10. Extension checks: pendingHash="xyz789" ≠ "abc123" → STALE, ignore!
     11. Core finishes second build, sends event with hash "xyz789"
     12. Extension checks: pendingHash="xyz789" = "xyz789" → VALID, update bundle!
     ```
   - **Key**: Hash in meta = "what we're expecting"
   - **Result**: Only accept builds matching current source state

---

# Separator: Remaining Phase 3, 4, 5 Work

> After Phase 2.5 is complete, continue with:

---

## Phase 3: Canvas Load with Cache

- [ ] Modify canvas loading to check cache first
- [ ] Read bundled code from `.roopik/cache/`
- [ ] Parallel loading (cached components load immediately)
- [ ] Queue cache misses for building
- [ ] Update webview incrementally as builds complete

---

## Phase 4: UI Enhancements

- [ ] Add reload button on SandboxCard header
- [ ] Add "building" status indicator
- [ ] Add "cached" indicator (dev mode)
- [ ] Handle component.json auto-generation for missing files

---

## Phase 5: Cache Management

- [ ] Add `roopik.cache.clear` command
- [ ] Add `roopik.cache.clearAll` command
- [ ] Show confirmation dialog with cache size
- [ ] Log cleanup results

---

## Migration Notes

1. Keep old system working during migration
2. Test thoroughly before removing old code
3. Update documentation after complete

