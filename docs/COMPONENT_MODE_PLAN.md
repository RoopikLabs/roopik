# Component Mode (Mode 1) - Architecture & Implementation Plan

> **Canvas-based component design workspace with AI-powered generation and editing**

---

## Overview

Component Mode is an infinite canvas workspace where users can:
1. **Generate** UI components via AI prompts
2. **Preview** components in isolated sandbox environments
3. **Compare** multiple variations side-by-side on the canvas
4. **Edit** components using AI or manual inspection tools
5. **Export** finalized components to their project

This mode operates independently of any dev server - components render in isolated iframe sandboxes with client-side transpilation.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  VSCode Window                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  CanvasEditor (EditorPane - VSCode Tab)                               │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │  │  Webview (Embedded Chromium Browser)                            │  │  │
│  │  │  ┌───────────────────────────────────────────────────────────┐  │  │  │
│  │  │  │  React App (Infinite Canvas)                              │  │  │  │
│  │  │  │                                                           │  │  │  │
│  │  │  │  ┌─────────────────────────────────────────────────────┐  │  │  │  │
│  │  │  │  │  Canvas Layer (pan/zoom, grid background)           │  │  │  │  │
│  │  │  │  │                                                     │  │  │  │  │
│  │  │  │  │  ┌──────────┐  ┌──────────┐  ┌──────────┐          │  │  │  │  │
│  │  │  │  │  │ Sandbox  │  │ Sandbox  │  │ Sandbox  │          │  │  │  │  │
│  │  │  │  │  │ (iframe) │  │ (iframe) │  │ (iframe) │          │  │  │  │  │
│  │  │  │  │  │Component1│  │Component2│  │Component3│          │  │  │  │  │
│  │  │  │  │  └──────────┘  └──────────┘  └──────────┘          │  │  │  │  │
│  │  │  │  │                                                     │  │  │  │  │
│  │  │  │  └─────────────────────────────────────────────────────┘  │  │  │  │
│  │  │  │                                                           │  │  │  │
│  │  │  │  ┌───────────────────────────────────────────────────┐   │  │  │  │
│  │  │  │  │  Bottom Action Bar (mode controls)                │   │  │  │  │
│  │  │  │  └───────────────────────────────────────────────────┘   │  │  │  │
│  │  │  └───────────────────────────────────────────────────────────┘  │  │  │
│  │  └─────────────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  Services (Renderer Process - browser/)                                     │
│  ├── CanvasStateService      - Canvas viewport, sandbox positions           │
│  ├── ComponentStorageService - Save/load components from .roopik/           │
│  └── ComponentPreviewService - Babel transpilation, sandbox messaging       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                              │
                              │ IPC (renderer ↔ main process)
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Main Process (electron-main/)                                              │
│  └── CanvasFileService - File I/O for .roopik/ folder                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## View Modes

### 1. Gallery Mode (Default)
- Infinite canvas with grid/dots background
- All components displayed as cards in grid layout
- Pan with mouse drag / touchpad scroll
- Zoom with mouse wheel / touchpad pinch
- Click to select, double-click to enter Focus Mode

### 2. Focus Mode
- Single component fills ~80% of viewport
- Action Bar visible at bottom
- Full editing capabilities (AI, inspect, manual)
- Press Escape or double-click to return to Gallery

### 3. Compare Mode (Future)
- 2-4 components side by side
- Useful for variant comparison
- Select best option or combine features

### 4. Compose Mode (Future)
- Drag-drop component arrangement
- Generate glue code via AI
- Build pages from components

---

## Communication Strategy

### Layer Communication

```
┌─────────────────────────────────────────────────────────────────┐
│  React App (Webview)                                            │
│  └── Uses: vscode.postMessage() API                             │
└────────────────────────┬────────────────────────────────────────┘
                         │ postMessage
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  CanvasEditor (browser/ - Renderer Process)                     │
│  └── Receives via: webview.onDidReceiveMessage()                │
│  └── Sends via: webview.postMessage()                           │
│  └── Uses DI services for business logic                        │
└────────────────────────┬────────────────────────────────────────┘
                         │ IPC (if needed for file I/O)
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  Main Process (electron-main/)                                  │
│  └── File system operations                                     │
└─────────────────────────────────────────────────────────────────┘
```

### Sandbox Communication

```
┌─────────────────────────────────────────────────────────────────┐
│  React Canvas App                                               │
│  └── Creates iframes with srcdoc                                │
│  └── Sends: iframe.contentWindow.postMessage()                  │
│  └── Receives: window.addEventListener('message')               │
└────────────────────────┬────────────────────────────────────────┘
                         │ postMessage (iframe boundary)
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  Sandbox Iframe                                                 │
│  └── Babel Standalone for transpilation                         │
│  └── React/Vue/Svelte runtime (CDN loaded)                      │
│  └── Receives: window.addEventListener('message')               │
│  └── Sends: window.parent.postMessage()                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Message Types

### Webview → CanvasEditor (Renderer Process)

```typescript
type WebviewMessage =
  // Component CRUD
  | { type: 'component:save'; component: RoopikComponent }
  | { type: 'component:load'; componentId: string }
  | { type: 'component:delete'; componentId: string }
  | { type: 'component:list' }

  // Canvas State
  | { type: 'canvas:saveState'; state: CanvasState }
  | { type: 'canvas:loadState'; canvasId: string }

  // AI Integration (Future)
  | { type: 'ai:generate'; prompt: string; framework: Framework }
  | { type: 'ai:edit'; componentId: string; prompt: string }
  | { type: 'ai:variants'; componentId: string; count: number }

  // Export
  | { type: 'export:clipboard'; componentId: string }
  | { type: 'export:project'; componentId: string; targetPath: string }

  // Errors
  | { type: 'error'; message: string; details?: any };
```

### CanvasEditor → Webview

```typescript
type HostMessage =
  // Component responses
  | { type: 'component:loaded'; component: RoopikComponent }
  | { type: 'component:saved'; componentId: string }
  | { type: 'component:deleted'; componentId: string }
  | { type: 'component:list'; components: ComponentInfo[] }

  // Canvas State
  | { type: 'canvas:stateLoaded'; state: CanvasState }

  // AI responses (Future)
  | { type: 'ai:generated'; component: RoopikComponent }
  | { type: 'ai:edited'; component: RoopikComponent }
  | { type: 'ai:variants'; components: RoopikComponent[] }

  // Errors
  | { type: 'error'; message: string };
```

### Canvas App → Sandbox Iframe

```typescript
type SandboxMessage =
  | { type: 'init'; code: string; cdnUrls: string[] }
  | { type: 'update'; code: string }
  | { type: 'inspect:enable' }
  | { type: 'inspect:disable' }
  | { type: 'inspect:highlight'; selector: string };
```

### Sandbox Iframe → Canvas App

```typescript
type SandboxResponse =
  | { type: 'ready' }
  | { type: 'rendered' }
  | { type: 'error'; message: string; stack?: string }
  | { type: 'inspect:element'; data: ElementInfo }
  | { type: 'inspect:hover'; selector: string };
```

---

## Data Types

### Core Types

```typescript
// Supported frameworks (loosely coupled - easy to add more)
type Framework = 'react' | 'vue' | 'svelte' | 'html';

// Component complexity levels
type ComponentType = 'atomic' | 'composite' | 'page';
// atomic: button, input, badge
// composite: card, form, navbar
// page: login page, dashboard, landing page

// Component definition
interface RoopikComponent {
  id: string;                    // Unique ID: "btn_primary_001"
  name: string;                  // Display name: "Primary Button"
  type: ComponentType;
  framework: Framework;
  code: string;                  // Source code

  // Variant tracking
  variantOf?: string;            // Parent component ID if this is a variant
  variants?: string[];           // Child variant IDs

  // Metadata
  meta: {
    description: string;
    tags: string[];
    createdAt: number;
    updatedAt: number;
    aiGenerated: boolean;
    aiPrompt?: string;           // Original prompt if AI generated
  };

  // Dependencies (for CDN loading)
  dependencies: {
    cdnUrls: string[];           // ['https://unpkg.com/react@18...']
    npmPackages?: string[];      // For future npm-based rendering
  };
}

// Sandbox instance on canvas
interface Sandbox {
  id: string;                    // Same as component ID
  componentId: string;           // Reference to RoopikComponent

  // Canvas positioning
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;

  // Render state
  state: 'loading' | 'ready' | 'error';
  errorMessage?: string;
}

// Canvas state
interface CanvasState {
  id: string;                    // Canvas ID
  name: string;                  // "My Components"

  // Sandboxes on this canvas
  sandboxes: Sandbox[];

  // Viewport transform
  viewport: {
    x: number;
    y: number;
    scale: number;
  };

  // UI state
  selectedSandboxId: string | null;
  focusedSandboxId: string | null;   // Currently in focus mode

  // Preferences
  backgroundColor: string;
  backgroundPattern: 'grid' | 'dots' | 'plain';

  // Timestamps
  createdAt: number;
  updatedAt: number;
}

// Component info for listings
interface ComponentInfo {
  id: string;
  name: string;
  type: ComponentType;
  framework: Framework;
  thumbnailPath?: string;
  updatedAt: number;
}
```

---

## Storage Structure

All component data stored in workspace `.roopik/` folder:

```
workspace/
├── .roopik/
│   │
│   ├── components/                      # Component library
│   │   ├── index.json                   # Component manifest/index
│   │   │
│   │   ├── btn_primary_001/
│   │   │   ├── component.tsx            # Source code
│   │   │   ├── meta.json                # Metadata
│   │   │   └── thumbnail.png            # Auto-generated preview
│   │   │
│   │   ├── btn_primary_001_v1/          # Variant
│   │   │   ├── component.tsx
│   │   │   └── meta.json                # { variantOf: "btn_primary_001" }
│   │   │
│   │   └── login_form_002/
│   │       ├── component.tsx
│   │       └── meta.json
│   │
│   ├── canvas/                          # Canvas states
│   │   ├── default.canvas.json          # Default workspace canvas
│   │   └── experiments.canvas.json      # User-created canvas
│   │
│   ├── compositions/                    # Future: Combined components
│   │   └── landing_page_001/
│   │       ├── composition.json
│   │       └── generated.tsx
│   │
│   └── cache/                           # Regenerable cache
│       ├── transpiled/                  # Babel output cache
│       └── thumbnails/                  # Component preview images
│
├── src/                                 # User's project code
└── package.json
```

### index.json Structure

```json
{
  "version": "1.0",
  "components": [
    {
      "id": "btn_primary_001",
      "name": "Primary Button",
      "type": "atomic",
      "framework": "react",
      "path": "btn_primary_001/",
      "updatedAt": 1701234567890
    }
  ],
  "lastUpdated": 1701234567890
}
```

### meta.json Structure

```json
{
  "id": "btn_primary_001",
  "name": "Primary Button",
  "type": "atomic",
  "framework": "react",
  "description": "A primary action button with hover effects",
  "tags": ["button", "primary", "interactive"],
  "createdAt": 1701234567890,
  "updatedAt": 1701234567890,
  "aiGenerated": true,
  "aiPrompt": "Create a primary button with blue background and white text",
  "dependencies": {
    "cdnUrls": [
      "https://unpkg.com/react@18/umd/react.production.min.js",
      "https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"
    ]
  },
  "variantOf": null,
  "variants": ["btn_primary_001_v1", "btn_primary_001_v2"]
}
```

---

## File Structure (Core)

```
src/vs/workbench/contrib/roopik/
│
├── common/
│   ├── canvas/
│   │   ├── canvasTypes.ts               # All TypeScript interfaces
│   │   ├── canvasTools.ts               # AI tool definitions (for roopikAgent)
│   │   └── canvasIpc.ts                 # IPC channel definitions
│   │
│   └── ... (existing common/)
│
├── browser/
│   ├── canvas/
│   │   │
│   │   ├── canvasEditor.ts              # EditorPane (hosts webview)
│   │   ├── canvasInput.ts               # EditorInput (canvas file association)
│   │   ├── canvasWebviewContent.ts      # Generates webview HTML
│   │   │
│   │   └── services/
│   │       ├── canvasStateService.ts    # Canvas viewport, sandbox positions
│   │       ├── componentStorageService.ts # Component CRUD operations
│   │       └── componentPreviewService.ts # Transpilation, sandbox management
│   │
│   └── ... (existing browser/)
│
├── electron-main/
│   └── canvas/
│       └── canvasFileService.ts         # File I/O for .roopik/ folder
│
└── media/
    └── canvas/
        ├── canvas.js                    # Bundled React app
        ├── canvas.css                   # Styles
        └── sandbox-template.html        # Iframe sandbox template
```

---

## React App Structure (Webview)

The React app is built separately and bundled into `media/canvas/`:

```
webview-canvas/                          # Separate build project
├── src/
│   ├── main.tsx                         # Entry point
│   ├── App.tsx                          # Main app with view modes
│   │
│   ├── components/
│   │   ├── InfiniteCanvas.tsx           # Pan/zoom canvas
│   │   ├── SandboxPreview.tsx           # Component card with iframe
│   │   ├── FloatingToolbar.tsx          # Top toolbar (optional)
│   │   ├── StatusBar.tsx                # Bottom zoom controls
│   │   ├── BottomActionBar.tsx          # Mode controls
│   │   └── DeleteConfirmModal.tsx       # Confirmation dialogs
│   │
│   ├── hooks/
│   │   ├── useFPS.ts                    # Performance monitor
│   │   ├── useCanvas.ts                 # Canvas state management
│   │   └── useVSCodeAPI.ts              # PostMessage bridge
│   │
│   ├── utils/
│   │   ├── colors.ts                    # Light/dark detection
│   │   ├── grid.ts                      # Grid layout calculations
│   │   └── sandboxTemplate.ts           # Iframe HTML generator
│   │
│   └── types/
│       └── index.ts                     # TypeScript types
│
├── vite.config.ts                       # Build config
└── package.json
```

---

## Implementation Phases

### Phase 1: Foundation (MVP)

**Goal:** Basic canvas with component rendering

| Task | Files | Description |
|------|-------|-------------|
| 1.1 | `common/canvas/canvasTypes.ts` | Define all TypeScript interfaces |
| 1.2 | `browser/canvas/canvasInput.ts` | EditorInput for canvas files |
| 1.3 | `browser/canvas/canvasEditor.ts` | EditorPane hosting webview |
| 1.4 | `browser/canvas/canvasWebviewContent.ts` | Generate webview HTML |
| 1.5 | `media/canvas/*` | Copy React app from extension |
| 1.6 | `roopik.contribution.ts` | Register editor, commands |
| 1.7 | Adapt postMessage bridge | VSCode core webview API |

**Deliverable:** Open canvas, see infinite grid, sandboxes render components

### Phase 2: Storage

**Goal:** Persist components to `.roopik/` folder

| Task | Files | Description |
|------|-------|-------------|
| 2.1 | `browser/canvas/services/componentStorageService.ts` | Component CRUD |
| 2.2 | `browser/canvas/services/canvasStateService.ts` | Canvas state persistence |
| 2.3 | `electron-main/canvas/canvasFileService.ts` | File I/O operations |
| 2.4 | IPC setup | Wire renderer ↔ main process |

**Deliverable:** Components saved/loaded from `.roopik/components/`

### Phase 3: Focus Mode & Action Bar

**Goal:** Full-screen editing with tools

| Task | Files | Description |
|------|-------|-------------|
| 3.1 | Focus mode in React app | Double-click to zoom, action bar visible |
| 3.2 | Inspect mode | Click elements, see details |
| 3.3 | Export functionality | Copy code, save to project |
| 3.4 | Keyboard shortcuts | Delete, Escape, etc. |

**Deliverable:** Full editing workflow in focus mode

### Phase 4: AI Integration (Future)

**Goal:** Generate and edit components via AI

| Task | Files | Description |
|------|-------|-------------|
| 4.1 | AI prompt input | UI for entering prompts |
| 4.2 | Integration with roopikAgent | Tool definitions, execution |
| 4.3 | Variant generation | "Give me 5 variations" |
| 4.4 | Edit mode | "Make button blue" |

**Deliverable:** AI-powered component generation

### Phase 5: Multi-Framework (Future)

**Goal:** Support Vue, Svelte, HTML

| Task | Files | Description |
|------|-------|-------------|
| 5.1 | Framework-specific sandbox templates | Vue, Svelte runtime loading |
| 5.2 | Transpilation adapters | Different compilers |
| 5.3 | Framework detection | Auto-detect from code |

**Deliverable:** Generate components in any framework

### Phase 6: Composition Mode (Future)

**Goal:** Build pages from components

| Task | Files | Description |
|------|-------|-------------|
| 6.1 | Drag-drop between sandboxes | Composition UI |
| 6.2 | Layout generator | AI generates page structure |
| 6.3 | Export to project | Full page export |

**Deliverable:** Compose complex pages from components

---

## Canvas Features (From Extension)

### Already Implemented (Copy from extension)

- [x] Infinite canvas with CSS transforms
- [x] Pan with mouse drag / touchpad scroll
- [x] Zoom with mouse wheel / touchpad pinch (smooth accumulation)
- [x] Grid/dots/plain background patterns
- [x] Adaptive pattern color (light/dark backgrounds)
- [x] Component cards with glass-morphism design
- [x] Drag-drop sandbox positioning
- [x] Grid layout (4 columns, auto-arrange)
- [x] Focus mode (double-click to zoom)
- [x] Selection and z-index management
- [x] Delete confirmation modal
- [x] FPS monitor
- [x] Keyboard shortcuts (Delete, Escape)
- [x] Viewport state persistence
- [x] Session preferences (background color/pattern)

### To Implement in Core

- [ ] Webview bridge for core VSCode API
- [ ] Component storage service (.roopik/ folder)
- [ ] Canvas state service
- [ ] Integration with RoopikEventService
- [ ] Bottom Action Bar functionality
- [ ] Inspect mode (reuse from Project Mode)
- [ ] AI integration (roopikAgent tools)

---

## Framework Support Strategy

### Loosely Coupled Design

```typescript
// Framework adapter interface
interface FrameworkAdapter {
  name: Framework;
  fileExtension: string;
  cdnUrls: string[];
  transpile(code: string): string;
  getSandboxTemplate(): string;
}

// React adapter
const reactAdapter: FrameworkAdapter = {
  name: 'react',
  fileExtension: '.tsx',
  cdnUrls: [
    'https://unpkg.com/react@18/umd/react.production.min.js',
    'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js'
  ],
  transpile(code) {
    return Babel.transform(code, { presets: ['react'] }).code;
  },
  getSandboxTemplate() {
    return REACT_SANDBOX_TEMPLATE;
  }
};

// Vue adapter (future)
const vueAdapter: FrameworkAdapter = {
  name: 'vue',
  fileExtension: '.vue',
  cdnUrls: ['https://unpkg.com/vue@3/dist/vue.global.js'],
  // ...
};

// Registry for easy extension
const frameworkRegistry = new Map<Framework, FrameworkAdapter>();
frameworkRegistry.set('react', reactAdapter);
// frameworkRegistry.set('vue', vueAdapter);
```

---

## Integration Points

### With Project Mode (Mode 2)

```
Canvas Mode                          Project Mode
┌─────────────┐                     ┌─────────────┐
│ Component   │  ───Export───────▶  │ Project     │
│ Library     │                     │ Files       │
│             │  ◀──Import───────   │             │
└─────────────┘                     └─────────────┘
```

- Export component from canvas → Save to project `src/components/`
- Import component from project → Add to canvas for editing

### With Roopik Agent (Future)

```typescript
// Tool definitions for AI agent
const CANVAS_TOOLS = [
  {
    name: 'canvas.generateComponent',
    description: 'Generate a new UI component',
    parameters: {
      prompt: 'string',
      framework: 'react | vue | svelte',
      type: 'atomic | composite | page'
    }
  },
  {
    name: 'canvas.editComponent',
    description: 'Modify an existing component',
    parameters: {
      componentId: 'string',
      prompt: 'string'
    }
  },
  {
    name: 'canvas.generateVariants',
    description: 'Generate multiple variations',
    parameters: {
      componentId: 'string',
      count: 'number'
    }
  }
];
```

---

## Success Criteria

### Phase 1 Complete When:
- [ ] Canvas opens in VSCode tab
- [ ] Infinite canvas renders with grid background
- [ ] Can pan and zoom smoothly
- [ ] Sample components render in sandboxes
- [ ] Components arranged in grid layout

### Phase 2 Complete When:
- [ ] Components persist to `.roopik/components/`
- [ ] Canvas state persists to `.roopik/canvas/`
- [ ] Components survive VSCode restart
- [ ] Can delete components

### Phase 3 Complete When:
- [ ] Focus mode works (double-click to zoom)
- [ ] Action bar visible in focus mode
- [ ] Can inspect elements in sandbox
- [ ] Can export component code

### Phase 4 Complete When:
- [ ] Can generate component via AI prompt
- [ ] Can edit component via AI prompt
- [ ] Can generate N variants

---

## Notes

### Why Webview + React?

1. **Performance:** 60fps pan/zoom requires optimized rendering
2. **Complexity:** Infinite canvas with drag-drop is complex UI
3. **Isolation:** Sandbox iframes need proper DOM environment
4. **Reuse:** Extension React code is already built and tested

### Why .roopik/ Folder?

1. **User visible:** Users can see and manage their components
2. **Natural cleanup:** Delete project = delete components
3. **Git friendly:** Can commit or gitignore
4. **No size limits:** AI generates lots of code
5. **Industry standard:** Like IntelliJ's `.idea/`, VS's `.vs/`

### Why Loosely Coupled Framework Support?

1. **Future proof:** Easy to add Vue, Svelte, etc.
2. **Maintainable:** Each framework is isolated adapter
3. **Testable:** Can test frameworks independently

---

*Document Version: 1.0*
*Last Updated: November 2024*
*Status: Planning*
