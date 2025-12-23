# Component Creation Flow - Complete Trace

## 🔍 COMPONENT CREATION FLOW - TRACE

### 1. User clicks "Import Component"
- **File:** `importCommands.ts`
- **Method:** `handleLocalFileImport()`
- **Action:** Shows file picker, extracts folderPath + entryFile
- **Calls:** `componentService.addComponent(request)`

### 2. ComponentService.addComponent()
- **File:** `componentService.ts` (electron-main)
- **Line:** 185-305
- **Actions:**
  - Validates folder exists
  - Detects entry file (if not provided)
  - Detects framework
  - Computes content hash
  - Generates componentId
  - Creates ComponentReference object
  - **Calls: `storageService.addComponentReference()`** ← Step 3
  - Adds to in-memory registry
  - Registers file watcher
  - **Enqueues build** ← Goes to Step 5

### 3. StorageService.addComponentReference()
- **File:** `storageService.ts` (electron-main)
- **Line:** 126
- **Delegates to:** `workspaceStorage.addComponentReference()`

### 4. WorkspaceStorage.addComponentReference()
- **File:** `workspaceStorage.ts`
- **Line:** 305-323
- **Actions:**
  - Loads canvas file from `.roopik/canvases/{id}.json`
  - Adds component reference to `canvasFile.components[componentId]`
  - Saves canvas file back
  - **NO FOLDER CREATION - just JSON update**

### 5. Build Queue processes build
- **File:** `componentService.ts`
- **Method:** `executeBuild()` (line 430)
- **Actions:**
  - Loads source files from original folderPath
  - Calls `buildService.build()`
  - **Calls: `storageService.saveBundleCache()`** ← Step 6

### 6. StorageService.saveBundleCache()
- **File:** `storageService.ts`
- **Line:** 154
- **Delegates to:** `appDataStorage.saveBundleCache()`

### 7. AppDataStorage.saveBundleCache()
- **File:** `appDataStorage.ts`
- **Line:** 114-131
- **Actions:**
  - Gets cache path: `getCacheComponentPath(workspacePath, canvasId, componentId)`
  - **Creates folder**: `AppData/roopik/workspaces/{hash}/canvases/{canvasId}/components/{componentId}/`
  - Writes `bundle.js` and `build.json` to cache
  - **THIS CREATES FOLDERS IN APP DATA, NOT WORKSPACE**

---

## 📁 PATHS ANALYSIS

**getCacheComponentPath** returns:
```
AppData/roopik/workspaces/{hash}/canvases/{canvasId}/components/{componentId}/
```

This is **CORRECT** - cache in app data.

**BUT THE USER SEES:**
```
.roopik/canvases/yo/components/index.json  ← IN WORKSPACE!
```

This structure is **NOT** created by current code!

---

## ✅ CONCLUSION

**The folders you're seeing are from OLD CODE or EXTERNAL processes.**

Current code flow:
- ✅ **Workspace:** Only creates `.roopik/canvases/{id}.json` files (NO FOLDERS)
- ✅ **App Data:** Creates cache folders (CORRECT location)

**Possible causes:**
1. **Old compiled code still running** - rebuild needed
2. **VS Code extension code** - maybe the webview/extension side is creating folders?
3. **File watchers or sync tools** creating folders
4. **Git or other tools** creating empty folders

---

## 🎯 COMPLETE FLOW TRACE (VISUAL)

### Import Flow (CURRENT/CORRECT):
```
1. importCommands.ts::handleLocalFileImport()
   ↓ Calls componentService.addComponent()

2. componentService.ts::addComponent() (line 185)
   ↓ Calls storageService.addComponentReference()

3. storageService.ts::addComponentReference() (line 126)
   ↓ Delegates to workspaceStorage

4. workspaceStorage.ts::addComponentReference() (line 305)
   ✅ Updates .roopik/canvases/{id}.json (NO FOLDERS!)

5. buildQueue → executeBuild() (line 430)
   ↓ Calls storageService.saveBundleCache()

6. storageService.ts::saveBundleCache() (line 154)
   ↓ Delegates to appDataStorage

7. appDataStorage.ts::saveBundleCache() (line 114)
   ✅ Creates AppData/.../canvases/{id}/components/{id}/ (CORRECT!)
```

### OLD EXTENSION (CULPRIT):
```
📁 extensions/roopik/
   ├── constants.ts - Uses OLD paths!
   │   ├── getCanvasPath() → roopik-workspace/canvases/{name}/ ❌
   │   └── getComponentPath() → .../canvases/{name}/components/{name}/ ❌
   │
   ├── services/CanvasStateManager.ts - OLD canvas management
   └── package.json - Gets activated on startup!
```

---

## 🐛 ROOT CAUSE IDENTIFIED

The old `extensions/roopik/` extension is creating the folders!

**Evidence:**
- `extensions/roopik/src/constants.ts` has functions:
  - `getCanvasPath()` → `roopik-workspace/canvases/{name}/`
  - `getComponentPath()` → `roopik-workspace/canvases/{name}/components/{name}/`
- `extensions/roopik/src/services/CanvasStateManager.ts` manages canvas state using old structure
- `extensions/roopik/package.json` has `activationEvents: ["onStartupFinished"]` - gets activated automatically!

**This is a separate, OLD extension that conflicts with the new built-in Roopik code in `src/vs/workbench/contrib/roopik/`**

---

## 💡 SOLUTION

You need to either:

1. **DISABLE the extension** - remove it from activationEvents
2. **DELETE the extension folder** entirely (`extensions/roopik/`)
3. **UPDATE the extension** to use new architecture

**RECOMMENDED:** **Delete** the old extension folder since the new built-in Roopik is now in `src/vs/workbench/contrib/roopik/`.

The old extension was a prototype/POC that's now superseded by the built-in workbench contribution.
