# Component Flow Documentation

This document describes the complete data flows for component operations in Roopik.

**Legend:**
- `[E]` = Extension (runs in VSCode extension host)
- `[C]` = Core (runs in VSCode main/renderer process)
- `[W]` = Webview (runs in sandboxed browser context)

---

## Table of Contents
1. [Local File Import (Activity Panel)](#1-local-file-import-activity-panel)
2. [Drag-Drop Import (OS File Manager)](#2-drag-drop-import-os-file-manager)
3. [Rebuild Component](#3-rebuild-component)
4. [Save Component File (Code Editor)](#4-save-component-file-code-editor)
5. [Canvas Restore on Startup](#5-canvas-restore-on-startup)

---

## 1. Local File Import (Activity Panel)

User clicks "Import Component" in the Activity Panel tree view.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  USER: Clicks "Import Component" in Activity Panel                           │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  1. ACTIVITY PANEL (roopikViewPane.ts)                                  [E]  │
│     Checks: Is there a focused/active canvas?                                │
│       • YES → Use that canvas automatically                                  │
│       • NO  → Show QuickPick list of canvases for user to select             │
│                                                                              │
│     Then: Shows file picker dialog                                           │
│     Reads selected file(s) from disk                                         │
│                                                                              │
│     Calls: vscode.commands.executeCommand('roopik.core.createComponent', [A])│
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │ VSCode Command
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  2. CORE COMMAND (componentCommands.ts)                                 [C]  │
│     roopik.core.createComponent                                              │
│                                                                              │
│     Calls: componentService.createComponent([A])                             │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │ Service Call
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  3. COMPONENT SERVICE (componentService.ts)                             [C]  │
│     createComponent():                                                       │
│       • importService.import(sourceData) → [B]                               │
│       • storageService.saveComponentSource() → writes to .roopik/            │
│       • storageService.saveComponentMeta() → writes meta.json                │
│       • this.components.set(id, [C]) → in-memory registry                    │
│       • _onComponentCreated.fire([D]) → event                                │
│       • buildQueue.enqueue() → async build                                   │
│                                                                              │
│     Returns: [C] Component                                                   │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │ Event: onComponentCreated
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  4. EXTENSION MANAGER (roopikExtensionManager.ts)                       [E]  │
│     Event listener routes to correct CanvasPanel by canvasId                 │
│                                                                              │
│     Calls: canvasPanel.onComponentCreated([D])                               │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │ Method Call
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  5. CANVAS PANEL (canvasPanel.ts)                                       [E]  │
│     onComponentCreated() → postToWebview('componentCreated', [E])            │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │ postMessage
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  6. WEBVIEW (ComponentView.tsx)                                         [W]  │
│     Creates Sandbox with buildStatus: 'building' (shows spinner)             │
└──────────────────────────────────────────────────────────────────────────────┘

                    ══════════════════════════════════════
                         ASYNC: Build Completes
                    ══════════════════════════════════════

┌──────────────────────────────────────────────────────────────────────────────┐
│  7. COMPONENT SERVICE (componentService.ts)                             [C]  │
│     Build queue completes → _onComponentBuilt.fire([F])                      │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │ Event: onComponentBuilt
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  8. CANVAS PANEL (canvasPanel.ts)                                       [E]  │
│     onComponentBuilt() → reads bundle from bundlePath                        │
│     postToWebview('componentBuilt', [G])                                     │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │ postMessage
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  9. WEBVIEW (ComponentView.tsx)                                         [W]  │
│     Updates Sandbox: buildStatus: 'ready', bundledCode: ...                  │
│     Renders component in iframe                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Drag-Drop Import (OS File Manager)

User drags a .tsx/.jsx file from OS file manager onto the canvas.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  USER: Drags file onto canvas from OS file manager                           │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  1. WEBVIEW (ComponentView.tsx)                                         [W]  │
│     handleDrop() → reads file via Browser File API (file.text())             │
│     Derives componentName from fileName                                      │
│                                                                              │
│     Sends: postMessage('dropComponent', [H])                                 │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │ postMessage
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  2. CANVAS PANEL (canvasPanel.ts)                                       [E]  │
│     handleDropComponent() → constructs sourceData                            │
│                                                                              │
│     Calls: manager.createComponent([I])                                      │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │ Method Call
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  3. EXTENSION MANAGER (roopikExtensionManager.ts)                       [E]  │
│     createComponent() → executes VSCode command                              │
│                                                                              │
│     Calls: vscode.commands.executeCommand('roopik.core.createComponent', [A])│
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │ VSCode Command
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  4. CORE COMMAND (componentCommands.ts)                                 [C]  │
│     roopik.core.createComponent                                              │
│                                                                              │
│     Calls: componentService.createComponent([A])                             │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │ Service Call
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  5-9. SAME AS LOCAL IMPORT (Steps 3-9 above)                                 │
│     Import → Save → Build → Event → Webview                                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Rebuild Component

User clicks "Rebuild" button on a sandbox card.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  USER: Clicks Rebuild button on sandbox                                      │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  1. WEBVIEW (ComponentView.tsx)                                         [W]  │
│     handleSandboxRebuild()                                                   │
│       • Sets sandbox buildStatus: 'building'                                 │
│       • Sends: postMessage('rebuildComponent', [J])                          │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │ postMessage
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  2. CANVAS PANEL (canvasPanel.ts)                                       [E]  │
│     handleRebuildComponent()                                                 │
│                                                                              │
│     Calls: manager.rebuildComponent(componentId)                             │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │ Method Call
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  3. EXTENSION MANAGER (roopikExtensionManager.ts)                       [E]  │
│     rebuildComponent()                                                       │
│                                                                              │
│     Calls: vscode.commands.executeCommand('roopik.core.rebuildComponent', id)│
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │ VSCode Command
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  4. CORE COMMAND (componentCommands.ts)                                 [C]  │
│     roopik.core.rebuildComponent                                             │
│                                                                              │
│     Calls: componentService.rebuildComponent(componentId)                    │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │ Service Call
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  5. COMPONENT SERVICE (componentService.ts)                             [C]  │
│     rebuildComponent():                                                      │
│       • component = this.components.get(id) → lookup from Map                │
│       • storageService.invalidateCache() → clears cached bundle              │
│       • buildQueue.enqueue() → queues fresh build                            │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │ Build Completes → Event
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  6-7. SAME AS BUILD COMPLETE (Steps 7-9 from Local Import)                   │
│     onComponentBuilt event → CanvasPanel → Webview                           │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Save Component File (Code Editor)

User edits a file in the code popup and clicks Save.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  USER: Edits file in CodePopup, clicks Save                                  │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  1. WEBVIEW (CodePopup.tsx)                                             [W]  │
│     handleSave() → sends saveComponentFile message                           │
│                                                                              │
│     Sends: postMessage('saveComponentFile', [M])                             │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │ postMessage
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  2. CANVAS PANEL (canvasPanel.ts)                                       [E]  │
│     handleSaveComponentFile()                                                │
│       • Writes file to disk via fs.writeFileSync()                           │
│       • Path: .roopik/canvases/{canvasId}/components/{componentId}/{file}    │
│                                                                              │
│     Sends: postToWebview('componentFileSaved', [N])                          │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │
              ┌────────────────┴────────────────┐
              ▼                                 ▼
┌─────────────────────────────┐   ┌─────────────────────────────────────────────┐
│  3a. WEBVIEW            [W] │   │  3b. FILE WATCHER (fileWatcher.ts)      [C] │
│                             │   │                                             │
│  Receives 'componentFile-   │   │  Detects file change via fs.watch()         │
│  Saved' → sets sandbox      │   │  Debounces (300ms)                          │
│  buildStatus: 'building'    │   │  Fires onFileChanged event                  │
└─────────────────────────────┘   └─────────────────────────────────────────────┘
                                                │ Event
                                                ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  4. COMPONENT SERVICE (componentService.ts)                             [C]  │
│     handleFileChange()                                                       │
│       • Looks up component from Map                                          │
│       • Sets buildState: 'building'                                          │
│       • buildQueue.enqueue() with trigger: 'file-change'                     │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │ Build Completes → Event
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  5-6. SAME AS BUILD COMPLETE (Steps 7-9 from Local Import)                   │
│     onComponentBuilt event → CanvasPanel → Webview                           │
│     Sandbox updates: buildStatus: 'ready', new bundledCode                   │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Canvas Restore on Startup

IDE restarts, user opens an existing canvas.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  USER: Opens existing canvas (or IDE restarts)                               │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  1. COMPONENT SERVICE (componentService.ts) - On IDE Startup            [C]  │
│     initialize():                                                            │
│       • loadAllComponents() → scans .roopik/canvases/*/                      │
│       • For each component: reads meta.json, reconstructs [C]                │
│       • this.components.set(id, component) → rebuilds in-memory Map          │
└──────────────────────────────────────────────────────────────────────────────┘

                    ══════════════════════════════════════
                         User Opens Canvas Panel
                    ══════════════════════════════════════

┌──────────────────────────────────────────────────────────────────────────────┐
│  2. CANVAS PANEL (canvasPanel.ts) - On Panel Create                     [E]  │
│     constructor():                                                           │
│       • loadCanvasStateFromFile() → reads index.json                         │
│       • Extracts: preferences, sandboxPositions, loadedComponents [K]        │
└──────────────────────────────────────────────────────────────────────────────┘

                    ══════════════════════════════════════
                         Webview Ready
                    ══════════════════════════════════════

┌──────────────────────────────────────────────────────────────────────────────┐
│  3. WEBVIEW (ComponentView.tsx)                                         [W]  │
│     Sends: postMessage('ready')                                              │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │ postMessage
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  4. CANVAS PANEL (canvasPanel.ts)                                       [E]  │
│     handleWebviewMessage('ready'):                                           │
│       • sendPreferencesToWebview() → [L]                                     │
│       • postToWebview('canvasLoadingStarted')                                │
│       • loadExistingComponents() → for each component...                     │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  5. FOR EACH COMPONENT:                                                 [E]  │
│                                                                              │
│     a) postToWebview('componentCreated', [E]) → creates sandbox (spinner)    │
│                                                                              │
│     b) componentLoader.loadExistingComponent() →                             │
│        Checks cache (bundle-cache.json):                                     │
│          • sourceHash matches contentHash? → CACHE HIT                       │
│          • sourceHash mismatch? → CACHE MISS                                 │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │
              ┌────────────────┴────────────────┐
              ▼                                 ▼
┌─────────────────────────────┐   ┌─────────────────────────────────────────────┐
│  CACHE HIT              [E] │   │  CACHE MISS                             [E] │
│                             │   │                                             │
│  Reads bundledCode from     │   │  Calls: manager.rebuildComponent(id)        │
│  bundle-cache.json          │   │  → triggers rebuild via Core [C]            │
│                             │   │  → onComponentBuilt event later             │
│  postToWebview(             │   │                                             │
│    'componentBuilt', [G]    │   │                                             │
│  )                          │   │                                             │
└─────────────────────────────┘   └─────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  6. CANVAS PANEL (canvasPanel.ts)                                       [E]  │
│     postToWebview('canvasLoadingComplete')                                   │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │ postMessage
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  7. WEBVIEW (ComponentView.tsx)                                         [W]  │
│     All sandboxes restored with positions from [L]                           │
│     fitAllSandboxes() → auto-zooms to fit all components                     │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Interfaces

### [A] CreateComponentRequest
```typescript
// Extension → Core (via command)
interface CreateComponentRequest {
  name: string;
  canvasId?: string;
  source: ComponentSource;        // 'import' | 'drag-drop' | 'ai' | 'upload'
  sourceData: SourceData;
  framework?: Framework;
  dependencies?: Record<string, string>;
}
```

### [B] ImportResult
```typescript
// ImportService output
interface ImportResult {
  files: Record<string, string>;  // filename → content
  entryFile: string;
  framework: Framework;
  dependencies: Record<string, string>;
  sourceInfo?: { originalPath?: string; originalName?: string };
}
```

### [C] Component
```typescript
// Core in-memory object (stored in Map)
interface Component {
  id: string;
  name: string;
  canvasId: string;
  source: ComponentSource;
  storagePath: string;
  entryFile: string;
  files: string[];
  framework: Framework;
  dependencies: Record<string, string>;
  buildState: BuildState;
  contentHash: string;
  createdAt: number;
  updatedAt: number;
}
```

### [D] ComponentCreatedEvent
```typescript
// Core → Extension (event)
interface ComponentCreatedEvent {
  componentId: string;
  canvasId: string;
  component: Component;
}
```

### [E] componentCreated Message
```typescript
// Extension → Webview (postMessage)
{
  type: 'componentCreated';
  payload: {
    componentId: string;
    canvasId: string;
    name?: string;
  }
}
```

### [F] ComponentBuildEvent
```typescript
// Core → Extension (event)
interface ComponentBuildEvent {
  componentId: string;
  canvasId: string;
  success: boolean;
  trigger: 'create' | 'update' | 'rebuild' | 'file-change';
  result?: {
    cdnUrls: string[];
    buildTime: number;
    bundleSize: number;
    bundlePath: string;
  };
  errorInfo?: BuildErrorInfo;
}
```

### [G] componentBuilt Message
```typescript
// Extension → Webview (postMessage)
{
  type: 'componentBuilt';
  payload: {
    componentId: string;
    result: {
      bundledCode: string;
      cdnUrls: string[];
      framework: Framework;
      buildTime: number;
      bundleSize: number;
    }
  }
}
```

### [H] dropComponent Message
```typescript
// Webview → Extension (postMessage)
{
  type: 'dropComponent';
  payload: {
    fileName: string;       // "MyButton.tsx"
    content: string;        // Full file content
    componentName: string;  // "MyButton"
  }
}
```

### [I] CreateComponentOptions
```typescript
// CanvasPanel → Manager (method call)
interface CreateComponentOptions {
  canvasId: string;
  name: string;
  sourceData: {
    type: 'drag-drop';
    fileName: string;
    content: string;
  };
}
```

### [J] rebuildComponent Message
```typescript
// Webview → Extension (postMessage)
{
  type: 'rebuildComponent';
  payload: {
    componentId: string;
  }
}
```

### [K] ComponentLoadInfo
```typescript
// Extracted from index.json for restore
interface ComponentLoadInfo {
  componentId: string;
  contentHash: string;
  name?: string;
}
```

### [L] canvasPreferencesLoaded Message
```typescript
// Extension → Webview (postMessage)
{
  type: 'canvasPreferencesLoaded';
  payload: {
    preferences: {
      backgroundColor: string;
      backgroundPattern: 'grid' | 'dots' | 'plain';
      viewport: { x: number; y: number; scale: number };
    };
    sandboxPositions?: {
      [componentId: string]: { x: number; y: number; zIndex: number };
    };
  }
}
```

### [M] saveComponentFile Message
```typescript
// Webview → Extension (postMessage)
{
  type: 'saveComponentFile';
  payload: {
    componentId: string;
    filename: string;    // e.g., "index.tsx"
    content: string;     // Full file content
  }
}
```

### [N] componentFileSaved Message
```typescript
// Extension → Webview (postMessage)
{
  type: 'componentFileSaved';
  payload: {
    componentId: string;
    filename: string;
    success: boolean;
  }
}
```

---

## Communication Channels Summary

| From | To | Channel |
|------|----|---------|
| Webview `[W]` | Extension `[E]` | `vscode.postMessage()` |
| Extension `[E]` | Webview `[W]` | `panel.webview.postMessage()` |
| Extension `[E]` | Core `[C]` | `vscode.commands.executeCommand()` |
| Core `[C]` | Extension `[E]` | Event emitters (`onComponentCreated`, `onComponentBuilt`, etc.) |

---

## File Locations

| Layer | File |
|-------|------|
| Webview `[W]` | `extensions/roopik/webview/src/componentView/ComponentView.tsx` |
| Webview Types `[W]` | `extensions/roopik/webview/src/canvasView/types/index.ts` |
| Code Popup `[W]` | `extensions/roopik/webview/src/canvasView/components/CodePopup/CodePopup.tsx` |
| Extension Panel `[E]` | `extensions/roopik/src/canvasPanel.ts` |
| Extension Manager `[E]` | `extensions/roopik/src/roopikExtensionManager.ts` |
| Extension Loader `[E]` | `extensions/roopik/src/componentLoader.ts` |
| Core Commands `[C]` | `src/vs/workbench/contrib/roopik/browser/commands/componentCommands.ts` |
| Core Service `[C]` | `src/vs/workbench/contrib/roopik/electron-main/component/componentService.ts` |
| Core FileWatcher `[C]` | `src/vs/workbench/contrib/roopik/electron-main/watch/fileWatcher.ts` |
| Core Types `[C]` | `src/vs/workbench/contrib/roopik/common/component/types.ts` |
