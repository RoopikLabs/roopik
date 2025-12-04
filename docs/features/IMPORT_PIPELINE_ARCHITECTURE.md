# Import Pipeline Architecture

> **Unified Component Import System with Adapter Pattern**

This document describes the architecture for importing components from various sources into the Roopik Canvas. The system uses the **Adapter Pattern** to provide a unified interface regardless of the source.

---

## Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           IMPORT SOURCES                                     │
├──────────────┬──────────────┬──────────────┬──────────────┬────────────────┤
│   Local      │   GitHub     │    Figma     │   AI Agent   │   UI Library   │
│   Files      │   Repo       │   Design     │   Generated  │   (MUI, Ant)   │
└──────┬───────┴──────┬───────┴──────┬───────┴──────┬───────┴───────┬────────┘
       │              │              │              │               │
       ▼              ▼              ▼              ▼               ▼
┌──────────────┬──────────────┬──────────────┬──────────────┬────────────────┐
│ LocalFile    │ GitHub       │ Figma        │ AIAgent      │ UILibrary      │
│ Adapter      │ Adapter      │ Adapter      │ Adapter      │ Adapter        │
└──────┬───────┴──────┬───────┴──────┬───────┴──────┬───────┴───────┬────────┘
       │              │              │              │               │
       └──────────────┴──────────────┴──────┬───────┴───────────────┘
                                            │
                                            ▼
                              ┌─────────────────────────┐
                              │     ComponentInput      │
                              │  (Unified Data Model)   │
                              └────────────┬────────────┘
                                           │
                                           ▼
                              ┌─────────────────────────┐
                              │   Staging Directory     │
                              │  (.roopik/components/)  │
                              └────────────┬────────────┘
                                           │
                                           ▼
                              ┌─────────────────────────┐
                              │   Sandbox Pipeline      │
                              │   (ESBuild Transform)   │
                              └────────────┬────────────┘
                                           │
                                           ▼
                              ┌─────────────────────────┐
                              │   Canvas Sandbox        │
                              │   (Live Preview)        │
                              └─────────────────────────┘
```

---

## Key Architecture Decisions

### 1. Extension Passes Path, Core Handles Everything

The extension layer stays thin - it only captures file paths and forwards to Core.

```
┌─────────────────────────────────────────────────────────────┐
│  WEBVIEW (Canvas)                                            │
│  → Capture drop event / file picker                          │
│  → Extract file path(s)                                      │
│  → postMessage({ type: 'importFile', path: '...' })         │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼ postMessage
┌─────────────────────────────────────────────────────────────┐
│  EXTENSION (CanvasPanel.ts)                                  │
│  → Receive path                                              │
│  → Forward to Core via command                               │
│  → NO file reading, NO validation (just pass-through)        │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼ executeCommand('roopik.import.component', path)
┌─────────────────────────────────────────────────────────────┐
│  CORE (ImportService)                                        │
│  → Read file                                                 │
│  → Validate framework                                        │
│  → Scan for .css/.js imports                                 │
│  → Copy to staging directory                                 │
│  → Build via pipeline                                        │
│  → Return result or error                                    │
└─────────────────────────────────────────────────────────────┘
```

**Benefits:**
- Extension stays thin (just UI rendering)
- Core has all file access + validation logic
- Easier to test (Core logic is isolated)
- Same flow works for drag-drop AND file import button

### 2. Staging Directory (Never Edit Original Files)

All imported components are copied to a staging area. User's original files are **never** modified.

```
.roopik/
├── canvases.json
├── my-canvas/
│   ├── canvas-state.json
│   └── components/                    ← STAGING AREA
│       ├── Button/
│       │   ├── Button.tsx             ← Copied from original
│       │   ├── Button.css             ← Resolved dependency
│       │   └── _meta.json             ← Tracking metadata
│       └── Card/
│           ├── Card.tsx
│           ├── utils.js
│           └── _meta.json
```

### 3. Component Metadata Tracking

Each imported component has a `_meta.json` file:

```json
{
  "originalPath": "C:/projects/my-app/src/components/Button.tsx",
  "importedAt": 1701619200000,
  "dependencies": ["Button.css"],
  "framework": "react",
  "status": "imported"
}
```

**Status Values:**
| Status | Description |
|--------|-------------|
| `imported` | Fresh import, no changes made |
| `modified` | User has edited the component (dirty) |
| `exported` | User has exported back to original or new location |

### 4. Self-Contained Components Only

**Allowed file types for import:**
- `.tsx` - React/Solid/Preact
- `.jsx` - React/Solid/Preact
- `.vue` - Vue Single File Component (SFC only, not .vue.js)
- `.svelte` - Svelte

**Blocked:**
- `.html` + `.css` + `.js` (vanilla HTML) - Too complex to bundle
- Folders - Must select individual files
- Components with local component imports

### 5. Smart Dependency Resolution

Core scans imports and auto-resolves `.css` and `.js` dependencies:

```typescript
// Core: ImportService.ts
async importComponent(componentPath: string): Promise<ImportResult> {
  // 1. Validate file extension (.tsx, .jsx, .vue, .svelte only)
  const ext = path.extname(componentPath);
  if (!['.tsx', '.jsx', '.vue', '.svelte'].includes(ext)) {
    return { error: 'UNSUPPORTED_FORMAT', message: 'Only .tsx, .jsx, .vue, .svelte allowed' };
  }

  // 2. Read the file
  const code = await fs.readFile(componentPath, 'utf-8');
  const componentDir = path.dirname(componentPath);

  // 3. Scan for local imports
  const imports = this.scanImports(code);

  // 4. Categorize imports
  const localCss = imports.filter(i => i.endsWith('.css') || i.endsWith('.scss'));
  const localJs = imports.filter(i => i.endsWith('.js') || i.endsWith('.ts'));
  const localComponents = imports.filter(i =>
    i.endsWith('.tsx') || i.endsWith('.jsx') ||
    i.endsWith('.vue') || i.endsWith('.svelte')
  );

  // 5. Block if has component dependencies
  if (localComponents.length > 0) {
    return {
      error: 'HAS_COMPONENT_DEPS',
      message: `Component imports other components: ${localComponents.join(', ')}`,
      dependencies: localComponents
    };
  }

  // 6. Resolve .css/.js files (they're allowed)
  const files: Record<string, string> = {};
  files[path.basename(componentPath)] = code;

  for (const cssImport of localCss) {
    const cssPath = path.resolve(componentDir, cssImport);
    try {
      files[cssImport] = await fs.readFile(cssPath, 'utf-8');
    } catch {
      return { error: 'MISSING_DEP', message: `CSS file not found: ${cssImport}` };
    }
  }

  for (const jsImport of localJs) {
    const jsPath = path.resolve(componentDir, jsImport);
    try {
      files[jsImport] = await fs.readFile(jsPath, 'utf-8');
    } catch {
      return { error: 'MISSING_DEP', message: `JS file not found: ${jsImport}` };
    }
  }

  // 7. Copy to staging and process
  return this.copyToStagingAndBuild(files, componentPath);
}
```

---

## Import Policy Summary

| Action | Single Framework File | With .css/.js deps | Has Component deps | Folder | Vanilla HTML |
|--------|----------------------|-------------------|-------------------|--------|--------------|
| **Drag & Drop** | ✅ Allow | ✅ Auto-resolve | ❌ Block | ❌ Block | ❌ Block |
| **File Import** | ✅ Allow | ✅ Auto-resolve | ❌ Block | ❌ Block | ❌ Block |
| **AI Generation** | ✅ Allow | N/A | N/A | N/A | ✅ Allow (inline) |

---

## Core Design: Adapter Pattern

### Why Adapter Pattern?

1. **Single Unified Interface**: All import sources produce the same `ComponentInput` object
2. **Easy Extension**: Add new sources (MaterialUI, Ant Design, Chakra) without touching internal code
3. **Framework Agnostic**: Each adapter handles source-specific complexity internally
4. **Testable**: Each adapter can be tested in isolation
5. **Maintainable**: Changes to one source don't affect others

---

## The Unified Data Model: `ComponentInput`

All adapters produce this standardized output:

```typescript
interface ComponentInput {
  id: string;                           // Unique identifier
  source: ComponentSource;              // 'ai' | 'user' | 'upload' | 'import'
  framework?: Framework;                // 'react' | 'vue' | 'svelte' | 'solid' | 'preact' | 'html'
  files: { [filename: string]: string }; // File contents map
  entryFile?: string;                   // Main entry file (auto-detected if not provided)
  priority?: JobPriority;               // 'high' | 'normal' | 'low'
  dependencies?: Record<string, string>; // Package versions (e.g., {"react": "19.0.0"})
}
```

### Key Fields

| Field | Purpose | Example |
|-------|---------|---------|
| `files` | All component files as a map | `{ "Button.tsx": "...", "styles.css": "..." }` |
| `framework` | Target framework (auto-detected if not set) | `'react'` |
| `entryFile` | Main file to render (auto-detected if not set) | `'Button.tsx'` |
| `dependencies` | NPM packages with versions | `{ "lucide-react": "0.460.0" }` |

---

## Adapter Interface

```typescript
interface IComponentImportAdapter {
  /** Unique adapter identifier */
  readonly id: string;

  /** Human-readable name for UI */
  readonly displayName: string;

  /** Supported file extensions (for local adapter) or identifiers */
  readonly supportedTypes: string[];

  /**
   * Import component from source and normalize to ComponentInput
   * @param source - Source-specific input (file path, URL, design ID, etc.)
   * @param options - Adapter-specific options
   * @returns Normalized ComponentInput ready for sandbox pipeline
   */
  import(source: unknown, options?: AdapterOptions): Promise<ComponentInput>;

  /**
   * Validate if the adapter can handle this source
   */
  canHandle(source: unknown): boolean;
}

interface AdapterOptions {
  /** Override framework detection */
  framework?: Framework;
  /** Override entry file detection */
  entryFile?: string;
  /** Additional dependencies to include */
  dependencies?: Record<string, string>;
}
```

---

## Adapter Implementations

### 1. LocalFileAdapter (Phase 1 - MVP)

Imports components from local filesystem.

```typescript
class LocalFileAdapter implements IComponentImportAdapter {
  id = 'local-file';
  displayName = 'Local Files';
  supportedTypes = ['.tsx', '.jsx', '.vue', '.svelte'];  // NO .html

  async import(filePath: string, options?: AdapterOptions): Promise<ComponentInput> {
    // 1. Validate extension
    // 2. Read file from filesystem
    // 3. Scan imports for .css/.js dependencies
    // 4. Block if has component dependencies
    // 5. Resolve and include .css/.js files
    // 6. Detect framework (reuse ComponentParser.detectFramework)
    // 7. Copy to staging directory
    // 8. Return normalized ComponentInput
  }
}
```

**File Picker Restrictions:**

```typescript
// File picker with strict filters
const result = await vscode.window.showOpenDialog({
  canSelectMany: false,       // Single file only
  canSelectFolders: false,    // NO folders
  filters: {
    'Components': ['tsx', 'jsx', 'vue', 'svelte']  // Only these extensions
  },
  title: 'Import Component'
});
```

### 2. GitHubAdapter (Phase 2)

Imports components from GitHub repositories or gists.

```typescript
class GitHubAdapter implements IComponentImportAdapter {
  id = 'github';
  displayName = 'GitHub';
  supportedTypes = ['github.com', 'gist.github.com'];

  async import(url: string, options?: AdapterOptions): Promise<ComponentInput> {
    // 1. Parse GitHub URL (repo path, gist ID, etc.)
    // 2. Fetch raw files via GitHub API
    // 3. Detect framework from files
    // 4. Parse package.json for dependencies (if present)
    // 5. Return normalized ComponentInput
  }
}
```

**Supported URLs**:
- `https://github.com/user/repo/blob/main/src/Button.tsx`
- `https://gist.github.com/user/abc123`
- `https://github.com/user/repo/tree/main/src/components/Button`

### 3. FigmaAdapter (Phase 3)

Imports designs from Figma and generates code.

```typescript
class FigmaAdapter implements IComponentImportAdapter {
  id = 'figma';
  displayName = 'Figma Design';
  supportedTypes = ['figma.com'];

  async import(figmaUrl: string, options?: AdapterOptions): Promise<ComponentInput> {
    // 1. Parse Figma URL for file/node IDs
    // 2. Fetch design via Figma API
    // 3. Convert to code (via AI or deterministic converter)
    // 4. Return normalized ComponentInput
  }
}
```

### 4. AIAgentAdapter (Phase 4)

Receives generated components from AI agents.

```typescript
class AIAgentAdapter implements IComponentImportAdapter {
  id = 'ai-agent';
  displayName = 'AI Generated';
  supportedTypes = ['ai-generated'];

  async import(generation: AIGenerationResult, options?: AdapterOptions): Promise<ComponentInput> {
    // 1. Extract files from AI response
    // 2. Use AI-provided framework hint
    // 3. Use AI-provided dependencies
    // 4. Return normalized ComponentInput
  }
}
```

**AI Agent Integration**:
```typescript
// AI Agent generates component
const aiResult = await agent.generateComponent("Create a dark mode toggle button");

// Adapter normalizes to ComponentInput
const input = await aiAgentAdapter.import(aiResult);

// Send to sandbox pipeline
await sandboxPipeline.process(input);
```

### 5. UILibraryAdapter (Future)

Pre-built components from popular UI libraries.

```typescript
class UILibraryAdapter implements IComponentImportAdapter {
  id = 'ui-library';
  displayName = 'UI Libraries';
  supportedTypes = ['material-ui', 'ant-design', 'chakra-ui', 'shadcn'];

  async import(component: LibraryComponentRef, options?: AdapterOptions): Promise<ComponentInput> {
    // 1. Fetch component template from library
    // 2. Include library-specific dependencies
    // 3. Apply theme/customization options
    // 4. Return normalized ComponentInput
  }
}
```

**Example Usage**:
```typescript
// User selects "Material UI Button" from component library panel
const input = await uiLibraryAdapter.import({
  library: 'material-ui',
  component: 'Button',
  variant: 'contained',
  theme: 'dark'
});
```

---

## Import Scanning (Dependency Resolution)

```typescript
class ImportScanner {
  /**
   * Scan code for local imports
   * Returns list of relative import paths
   */
  scanImports(code: string): string[] {
    const imports: string[] = [];

    // ES6 imports: import X from './file'
    const esImportRegex = /import\s+(?:[\w{},\s*]+\s+from\s+)?['"](\.[^'"]+)['"]/g;

    // CSS imports: import './styles.css'
    const cssImportRegex = /import\s+['"](\.[^'"]+\.s?css)['"]/g;

    // Require: require('./file')
    const requireRegex = /require\(['"](\.[^'"]+)['"]\)/g;

    let match;
    while ((match = esImportRegex.exec(code)) !== null) {
      imports.push(match[1]);
    }
    while ((match = cssImportRegex.exec(code)) !== null) {
      imports.push(match[1]);
    }
    while ((match = requireRegex.exec(code)) !== null) {
      imports.push(match[1]);
    }

    return imports;
  }

  /**
   * Categorize imports by type
   */
  categorizeImports(imports: string[]): {
    css: string[];
    js: string[];
    components: string[];
  } {
    return {
      css: imports.filter(i => /\.s?css$/.test(i)),
      js: imports.filter(i => /\.(js|ts)$/.test(i) && !/\.(tsx|jsx)$/.test(i)),
      components: imports.filter(i => /\.(tsx|jsx|vue|svelte)$/.test(i))
    };
  }
}
```

---

## Framework Detection (Reusable)

We already have robust framework detection in `ComponentParser`:

```typescript
class ComponentParser {
  /**
   * Detects framework based on file extensions and imports.
   * Uses a scoring system to avoid false positives.
   *
   * Priority order:
   * 1. Definitive file extensions (.vue, .svelte)
   * 2. Definitive imports (solid-js, preact)
   * 3. Scoring system for ambiguous cases
   * 4. Vanilla HTML/CSS/JS detection
   */
  detectFramework(files: { [filename: string]: string }): Framework {
    // Extension-based detection (highest confidence)
    if (filename.endsWith('.vue')) return 'vue';
    if (filename.endsWith('.svelte')) return 'svelte';

    // Import-based detection
    if (/from\s+['"]solid-js['"]/.test(code)) return 'solid';
    if (/from\s+['"]preact['"]/.test(code)) return 'preact';
    if (/from\s+['"]react['"]/.test(code)) scores.react += 2;

    // Vanilla HTML detection
    if (!hasFrameworkImport && !hasJsxTsx && hasHtml) return 'html';

    // Scoring fallback for ambiguous cases
    return highestScore;
  }
}
```

**All adapters should use `ComponentParser.detectFramework()`** rather than implementing their own detection logic.

---

## User Workflow

### Import Flow

```
1. User clicks "Import" button or drops file onto canvas
   └── Webview captures file path, sends to Extension

2. Extension forwards path to Core
   └── executeCommand('roopik.import.component', { path, canvasId })

3. Core validates and processes
   └── Read file → Scan imports → Validate → Copy to staging

4. If SUCCESS:
   └── Create sandbox at drop position or default location
   └── Component is now editable in Canvas

5. If ERROR:
   └── Show error notification with details
   └── "Component imports Card.tsx. Only self-contained components allowed."
```

### Edit Flow

```
1. User edits component in Canvas sandbox
   └── Changes saved to staging copy (.roopik/canvas/components/Button/)

2. _meta.json status updated to "modified"
   └── Tracks that user has made changes

3. Original file remains UNTOUCHED
   └── Safe experimentation
```

### Export Flow

```
1. User clicks "Export" on component toolbar
   └── Shows export options

2. Export Options:
   ┌─────────────────────────────────────────────────────────┐
   │  $(file)  Replace Original                              │
   │           C:/projects/my-app/src/components/Button.tsx  │
   ├─────────────────────────────────────────────────────────┤
   │  $(folder) Save to Location...                          │
   │            Choose a new folder                          │
   ├─────────────────────────────────────────────────────────┤
   │  $(clippy) Copy to Clipboard                            │
   │            Copy component code                          │
   └─────────────────────────────────────────────────────────┘

3. After export, _meta.json status updated to "exported"
```

---

## Error Messages

```typescript
const IMPORT_ERRORS = {
  UNSUPPORTED_FORMAT: 'Only .tsx, .jsx, .vue, .svelte files supported. Vanilla HTML import not available.',
  FOLDER_NOT_ALLOWED: 'Folder import not supported. Please select a single component file.',
  HAS_COMPONENT_DEPS: 'Component imports other components ({deps}). Only self-contained components allowed.',
  MISSING_DEP: 'Required file not found: {file}. Make sure all dependencies exist.',
  PARSE_ERROR: 'Failed to parse component: {error}',
  STAGING_ERROR: 'Failed to copy to staging directory: {error}'
};
```

---

## Drag-and-Drop Implementation

### Webview (Canvas) - Capture Drop

```typescript
// CanvasView.tsx
const handleDrop = (event: React.DragEvent) => {
  event.preventDefault();

  const files = Array.from(event.dataTransfer.files);

  // Validate: single file only
  if (files.length !== 1) {
    showError('Please drop a single component file');
    return;
  }

  const file = files[0];
  const ext = file.name.split('.').pop()?.toLowerCase();

  // Validate extension in webview (fast feedback)
  if (!['tsx', 'jsx', 'vue', 'svelte'].includes(ext || '')) {
    showError('Only .tsx, .jsx, .vue, .svelte files supported');
    return;
  }

  // Get drop position in canvas coordinates
  const dropPosition = screenToCanvas(event.clientX, event.clientY);

  // Send to extension with path
  vscode.postMessage({
    type: 'importFile',
    payload: {
      path: file.path,  // File path from drag event
      position: dropPosition
    }
  });
};
```

### Extension - Pass to Core

```typescript
// CanvasPanel.ts
case 'importFile': {
  const { path, position } = message.payload;

  // Forward to Core - let Core handle all logic
  const result = await this.commandService.executeCommand(
    'roopik.import.component',
    {
      path,
      canvasId: this.canvasId,
      position
    }
  );

  if (result.error) {
    // Show error in webview
    this.postMessage({
      type: 'importError',
      payload: { error: result.error, message: result.message }
    });
  }
  // Success is handled by Core sending sandbox creation event
  break;
}
```

---

## Implementation Roadmap

### Phase 1: Local File Import (MVP) ✅ COMPLETE

**Core Architecture (Adapter Pattern):**
- [x] `IComponentImportAdapter` interface - `common/import/importTypes.ts`
- [x] `ImportService` orchestrator - `electron-main/import/importService.ts`
- [x] `LocalFileAdapter` - `electron-main/import/localFileAdapter.ts`
- [x] `ImportAdapterRegistry` - `electron-main/import/importAdapterRegistry.ts`
- [x] `ImportScanner` (dependency resolution) - `common/import/importScanner.ts`
- [x] `ImportServiceClient` (browser IPC proxy) - `browser/import/importServiceClient.ts`

## Architecture Flow:

```
Import Request
      │
      ▼
ImportService (Orchestrator)
      │
      ├── ImportAdapterRegistry.findAdapter(source)
      │           │
      │           ▼
      │   LocalFileAdapter.canHandle(source)?
      │           │
      │           ▼ (Yes)
      └── LocalFileAdapter.import(source, options)
                  │
                  ├── Validate file
                  ├── Check duplicates
                  ├── Scan dependencies
                  ├── Block component imports
                  ├── Resolve .css/.js
                  ├── Copy to staging
                  ├── Save _meta.json
                  │
                  ▼
          ComponentInput (Unified Output)

```

**Functionality:**
- [x] Staging directory management (`.roopik/{canvas}/components/`)
- [x] `_meta.json` tracking (originalPath, status, dependencies)
- [x] Duplicate detection with user prompt (Replace/Cancel)
- [x] Add "Import" button to Activity Pane
- [x] File picker with extension filter (.tsx, .jsx, .vue, .svelte)
- [x] Canvas selector when importing from Activity Pane
- [ ] Drag-and-drop support (deferred to Phase 1.5)
- [x] Export functionality (replace, saveas, clipboard)

**Extension Implementation:**
The extension has its own import implementation (mirrors LocalFileAdapter) because:
- Extension runs in extension host, Core services run in main process
- IPC channel setup would be needed for cross-process communication

When IPC is set up, the extension can use `ImportServiceClient` to delegate to Core.

### Phase 1.5: Drag-and-Drop
- [ ] Canvas drop zone detection
- [ ] File path extraction from drag event
- [ ] Position calculation from drop coordinates
- [ ] Integration with import flow

### Phase 2: GitHub Import
- [ ] Implement `GitHubAdapter`
- [ ] GitHub URL parsing
- [ ] GitHub API integration
- [ ] Handle rate limiting / auth

### Phase 3: Figma Import
- [ ] Implement `FigmaAdapter`
- [ ] Figma API integration
- [ ] Design-to-code conversion

### Phase 4: AI Agent Integration
- [ ] Implement `AIAgentAdapter`
- [ ] Agent → Canvas flow
- [ ] Real-time generation preview

### Phase 5: UI Library Browser
- [ ] Implement `UILibraryAdapter`
- [ ] Component library panel UI
- [ ] MaterialUI, Ant Design, Chakra support
- [ ] Theme customization

---

## File Structure

```
src/vs/workbench/contrib/roopik/
├── common/import/
│   ├── importTypes.ts          # Types, interfaces, IComponentImportAdapter
│   └── importScanner.ts        # Dependency scanning
│
├── browser/import/
│   └── importServiceClient.ts  # IPC proxy for browser process
│
└── electron-main/import/
    ├── importService.ts        # Orchestrator (uses adapters)
    ├── importAdapterRegistry.ts # Manages available adapters
    └── localFileAdapter.ts     # Local file import adapter

extensions/roopik-extension/
└── src/
    └── extension.ts            # Contains import implementation (mirrors LocalFileAdapter)
```

---

## Benefits of This Architecture

1. **Safety**: User's original files never touched until explicit export
2. **Clean Separation**: Extension = UI only, Core = all logic
3. **Smart Dependencies**: Auto-resolve .css/.js, block component deps
4. **Traceability**: Know where each component came from via _meta.json
5. **Extensibility**: New sources = new adapter file, no core changes
6. **Consistency**: All sources produce identical `ComponentInput`
7. **Testability**: Each adapter and service tested independently
8. **Future-Proof**: Ready for MaterialUI, Ant Design, Tailwind UI, etc.

---

*Last updated: December 2024*
*Status: Phase 1 Architecture COMPLETE - Adapter Pattern implemented in Core*
