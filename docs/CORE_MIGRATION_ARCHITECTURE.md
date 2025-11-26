# Roopik Core Migration Architecture

**Version**: 2.0
**Date**: November 2025
**Status**: Planning Phase

---

## 🎯 **Vision**

Migrate Roopik from a **VSCode extension** to a **core workbench feature** (`src/vs/workbench/contrib/roopik/`) to unlock:

- ✅ **Native Browser Integration**: Real Chromium DevTools per tab (not possible in extensions)
- ✅ **Direct DOM Rendering**: 60fps canvas performance (no webview overhead for simple UI)
- ✅ **Tight VSCode Integration**: Direct service access, terminal integration, problems panel
- ✅ **Agentic Architecture**: Every UI feature is also a programmatic tool for AI agents
- ✅ **Future-Proof Design**: Clean separation for multi-agent system (roopikAgent)

---

## 🏗️ **High-Level Architecture**

```
┌─────────────────────────────────────────────────────────────┐
│              VSCode Core (Electron)                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  src/vs/workbench/contrib/                                  │
│  │                                                           │
│  ├── roopik/              (Design IDE - Modes 1 & 2)        │
│  │   ├── common/          Services, Types, Tool Definitions │
│  │   ├── browser/         UI Layer (Renderer Process)       │
│  │   ├── electron-main/   Native Integration (Main Process) │
│  │   └── node/            File System Operations            │
│  │                                                           │
│  └── roopikAgent/         (AI Agent - Future)               │
│      ├── common/          Agent Interfaces                  │
│      ├── browser/         Chat UI, Tool Provider            │
│      └── node/            Agent Executor                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 📦 **Folder Structure**

### **roopik/** - Design IDE (Core Features)

```
src/vs/workbench/contrib/roopik/
│
├── common/
│   ├── roopik.ts                      # Service interfaces (DI)
│   ├── roopikTypes.ts                 # All TypeScript types
│   ├── roopikTools.ts                 # Tool definitions for agents
│   └── roopikConfiguration.ts         # Settings schema
│
├── browser/                           # Renderer Process (UI)
│   ├── roopik.contribution.ts         # ⭐ Main registration file
│   │
│   ├── roopikViewPane.ts              # Activity bar tree view
│   ├── canvasEditor.ts                # Mode 1: Component canvas
│   ├── livePreviewEditor.ts           # Mode 2: Browser preview
│   │
│   ├── services/                      # Business logic services
│   │   ├── inspectService.ts          # Element inspection
│   │   ├── styleService.ts            # CSS source mapping + live edit
│   │   ├── canvasStateService.ts      # Canvas state management
│   │   ├── componentBridgeService.ts  # Mode 1 ↔ Mode 2 integration
│   │   └── contextGatherer.ts         # Rich context for agents
│   │
│   ├── canvas/                        # Mode 1: Infinite Canvas
│   │   ├── canvasRenderer.ts          # Main canvas (native DOM)
│   │   ├── componentCard.ts           # Component cards
│   │   ├── canvasToolbar.ts           # Toolbar (native DOM)
│   │   └── sandboxManager.ts          # Iframe sandboxes
│   │
│   ├── livePreview/                   # Mode 2: Browser Preview
│   │   ├── addressBar.ts              # Navigation controls (native DOM)
│   │   ├── propertiesPanel.ts         # Element inspector (native DOM)
│   │   ├── actionBar.ts               # Bottom toolbar (native DOM)
│   │   └── inspectOverlay.ts          # Transparent overlay (small webview)
│   │
│   └── widgets/                       # Reusable UI components
│       ├── treeView.ts
│       └── propertyEditor.ts
│
├── electron-main/                     # Main Process (Node.js)
│   ├── browserViewService.ts          # BrowserView management
│   ├── viteServerService.ts           # Dev server lifecycle
│   ├── screenshotService.ts           # Screenshot capture
│   │
│   └── plugins/                       # Vite plugins (unchanged)
│       ├── authMiddleware.js
│       ├── roopikInjectPlugin.js
│       ├── reactSourcePlugin.js
│       ├── pluginFactory.js
│       └── frameworkDetector.js
│
└── node/
    └── styleContextGatherer.ts        # CSS file discovery
```

---

### **roopikAgent/** - AI Agent (Future)

```
src/vs/workbench/contrib/roopikAgent/
│
├── common/
│   ├── roopikAgent.ts                 # Agent service interfaces
│   └── agentTypes.ts                  # Agent-specific types
│
├── browser/
│   ├── roopikAgent.contribution.ts    # Agent registration
│   ├── chatView.ts                    # Multi-agent chat UI
│   └── roopikToolProvider.ts          # Consumes roopik tools
│
└── node/
    └── agentExecutor.ts                # Agent runtime
```

---

## 🎨 **Design Patterns**

### **1. Service-Oriented Architecture**

**Why**: Every feature is a **service** (singleton), injected via Dependency Injection (DI).

**Benefits**:
- ✅ Services work for both UI and agents
- ✅ Testable in isolation
- ✅ Easy to mock for testing
- ✅ Clear separation of concerns

**Example**: `IInspectService` used by:
- Human UI: Properties panel
- AI Agent: `inspect_element` tool
- External: API calls

---

### **2. Tool-First Design**

**Why**: Every feature exposed as a **programmatic tool** from day one.

**Benefits**:
- ✅ Agents get same capabilities as humans
- ✅ No refactoring when adding AI
- ✅ Consistent API surface
- ✅ External integrations possible

**Structure**:
```
common/roopikTools.ts  →  Tool definitions (name, schema)
browser/services/      →  Tool implementations (services)
roopikAgent/          →  Tool consumers (future)
```

---

### **3. Layered Technology Stack**

**Why**: Use the **right tool** for each UI layer.

| Layer | Technology | Use Case |
|-------|-----------|----------|
| **Native DOM** | Pure TypeScript + VSCode DOM utils | Simple UI (buttons, inputs, trees) |
| **Webview (React)** | React in webview | Complex UI (infinite canvas) |
| **BrowserView** | Electron BrowserView | Real browser preview |

**Decision Tree**:
- Simple UI (< 100 lines) → Native DOM
- Complex UI (animations, drag-drop) → Webview (React)
- Browser preview → BrowserView

---

### **4. Process Separation**

**Why**: VSCode is **multi-process** (Electron architecture).

```
electron-main/   → Node.js, File System, Native APIs
browser/         → Chromium, DOM, UI Rendering
common/          → Shared by both (no imports)
```

**Benefits**:
- ✅ Security (browser process is sandboxed)
- ✅ Stability (crash isolation)
- ✅ Performance (parallel processing)

---

### **5. Mode Separation with Bridge**

**Why**: Canvas (Mode 1) and Browser (Mode 2) are **independent** but can **integrate**.

**Structure**:
```
canvas/              → Mode 1: Component builder
livePreview/         → Mode 2: Browser preview
componentBridgeService.ts → Mode 1 ↔ Mode 2 integration
```

**Use Cases**:
- Build component in Mode 1 → Export to Mode 2 project
- Import component from Mode 2 → Edit in Mode 1
- Drag-drop between modes (future)

---

## 🚀 **Migration Strategy**

### **Phase 1: Foundation** (Week 1)
**Goal**: Prove core integration works

- ✅ Create folder structure
- ✅ Define service interfaces (`common/roopik.ts`)
- ✅ Define types (`common/roopikTypes.ts`)
- ✅ Define tool schemas (`common/roopikTools.ts`)
- ✅ Register in `roopik.contribution.ts`
- ✅ Test with simple command

**Success Criteria**: Can execute `roopik.openCanvas` from command palette

---

### **Phase 2: Activity Bar & Tree View** (Week 2)
**Goal**: Native UI with VSCode theming

- ✅ Create `RoopikViewPane` (activity bar icon)
- ✅ Implement tree view (canvases, projects, components)
- ✅ Add commands (New Canvas, Open Project, etc.)
- ✅ Test navigation

**Success Criteria**: Tree view shows canvases, clicking opens editor

---

### **Phase 3: Mode 1 - Canvas Editor** (Week 3-4)
**Goal**: Component builder with infinite canvas

- ✅ Create `CanvasEditor extends EditorPane`
- ✅ Implement `CanvasRenderer` (native DOM or webview)
- ✅ Implement `CanvasStateService` (save/load state)
- ✅ Add toolbar (native DOM)
- ✅ Component cards (drag-drop)

**Success Criteria**: Can create/edit components on infinite canvas

---

### **Phase 4: Mode 2 - Live Preview** (Week 5-6)
**Goal**: Browser preview with DevTools

- ✅ Create `LivePreviewEditor extends EditorPane`
- ✅ Implement `BrowserViewService` (electron-main)
- ✅ Create address bar (native DOM)
- ✅ Integrate Vite server
- ✅ Test DevTools, navigation

**Success Criteria**: Can preview projects with real Chromium DevTools

---

### **Phase 5: Inspect Mode** (Week 7)
**Goal**: Click-to-source for HTML + CSS

- ✅ Implement `InspectService`
- ✅ Implement `StyleService` (CSS source mapping)
- ✅ Create properties panel (native DOM)
- ✅ Create bottom action bar (native DOM)
- ✅ Add transparent overlay (inspect highlights)
- ✅ Inject inspect script into BrowserView

**Success Criteria**: Can inspect elements, see properties, jump to CSS source

---

### **Phase 6: Component Bridge** (Week 8)
**Goal**: Mode 1 ↔ Mode 2 integration

- ✅ Implement `ComponentBridgeService`
- ✅ Export component from canvas to project
- ✅ Import component from project to canvas
- ✅ Test roundtrip

**Success Criteria**: Component built in Mode 1 works in Mode 2 project

---

### **Phase 7: Polish** (Week 9-10)
**Goal**: Production-ready

- ✅ Performance optimization
- ✅ Error handling
- ✅ Testing (unit + integration)
- ✅ Documentation
- ✅ User onboarding

**Success Criteria**: Feature parity with extension version

---

### **Phase 8: Agent Integration** (Future)
**Goal**: Multi-agent system

- ⏳ Create `roopikAgent/` folder
- ⏳ Implement `RoopikToolProvider`
- ⏳ Chat UI
- ⏳ Tool execution
- ⏳ Multi-agent orchestration

**Success Criteria**: Agent can inspect, modify, test components

---

## 🎯 **Design Principles**

### **1. Agentic-First**
Every feature is designed to be **callable** by AI agents from day one.

**Example**: `InspectService.inspectElement()` used by:
- Human: Click inspect button → UI shows properties
- Agent: Call tool → Returns structured data

---

### **2. Context-Rich**
Services return **rich context**, not just minimal data.

**Bad**:
```typescript
inspectElement() → { tagName: 'div' }
```

**Good**:
```typescript
inspectElement() → {
  tagName: 'div',
  classes: [...],
  styles: {...},
  sourceLocation: { file, line, column },
  styleSource: { cssFile, line },
  context: { parent, children, siblings }
}
```

**Why**: Agents make better decisions with full context (fewer iterations).

---

### **3. Live Testing**
Agents can **test changes** before committing code.

**Flow**:
1. Agent inspects element
2. Agent updates style **live** (in browser)
3. Agent takes screenshot
4. Agent verifies result
5. Agent commits change **only if satisfied**

**Why**: Faster iteration, better results.

---

### **4. Visual Verification**
Agents can **see** results (screenshots, visual diff).

**Features**:
- Screenshot capture
- Element highlighting
- Visual diff (before/after)

**Why**: Design is visual; agents need vision too.

---

### **5. Separation of Concerns**
`roopik/` = Tools provider
`roopikAgent/` = Tools consumer

**Why**: Agent can be general-purpose (works without roopik), but gets **superpowers** when roopik is active.

---

## 🔑 **Key Differentiators**

### **vs. Other AI IDEs**

| Feature | Other IDEs | Roopik |
|---------|-----------|--------|
| **AI sees code** | ✅ File reading | ✅ File reading |
| **AI sees styles** | ❌ Reads CSS files | ✅ Computed styles + source mapping |
| **AI tests live** | ❌ No | ✅ Live style updates in browser |
| **AI sees visually** | ❌ No | ✅ Screenshots, element inspection |
| **AI gets context** | ⚠️ Minimal | ✅ Full component tree, styles, props |
| **Design tools** | ❌ No | ✅ Infinite canvas, visual builder |

---

## 📐 **Technical Decisions**

### **1. Why Native DOM for Simple UI?**
- ✅ Instant load (no React bundle)
- ✅ VSCode theming (automatic)
- ✅ Low memory (< 1 MB)
- ✅ Native performance

**Use for**: Buttons, inputs, trees, panels

---

### **2. Why Webview for Canvas?**
- ✅ Complex interactions (drag-drop, zoom, pan)
- ✅ Animations (smooth 60fps)
- ✅ React ecosystem (existing code)

**Use for**: Infinite canvas, property editors

---

### **3. Why BrowserView for Preview?**
- ✅ Real Chromium browser
- ✅ Independent DevTools per tab
- ✅ Network panel, console, performance profiler
- ✅ Can browse any website (not just localhost)

**Use for**: Project preview, browser testing

---

### **4. Why Service-Based Architecture?**
- ✅ Dependency Injection (DI)
- ✅ Services used by UI and agents
- ✅ Testable in isolation
- ✅ Extensible

**Use for**: All business logic

---

### **5. Why Separate roopikAgent?**
- ✅ General-purpose coding agent (works standalone)
- ✅ Gets **extra tools** when roopik is active
- ✅ Clean separation of concerns
- ✅ Can be developed independently

**Use for**: AI agent system

---

## 🎨 **The Moat**

**Roopik's Competitive Advantage**:

1. **Design-Oriented Context**: Agent sees styles, layout, visual hierarchy (not just code)
2. **Live Testing**: Agent tests changes in real browser before committing
3. **Visual Verification**: Agent uses screenshots to verify design matches intent
4. **Full Integration**: Agent can inspect, modify, test, verify - complete loop
5. **Speed**: Rich context = fewer iterations (1 iteration vs 10)

**Example**:
```
User: "Make the button warmer"

Other IDE Agent:
- Read Button.tsx (iteration 1)
- Read styles.css (iteration 2)
- Guess "warmer" means orange (iteration 3)
- Update color (iteration 4)
- User: "Too bright" (iteration 5)
- Adjust... (iteration 6+)

Roopik Agent:
- Get full context (code + styles + current color) (iteration 1)
- Test orange live → screenshot → verify
- Commit change
- Done! (1 iteration)
```

---

## 📊 **Success Metrics**

### **Migration Success**
- ✅ Feature parity with extension
- ✅ Better performance (60fps canvas)
- ✅ DevTools per tab working
- ✅ Click-to-source for HTML + CSS
- ✅ Mode 1 ↔ Mode 2 integration

### **Agentic Success** (Future)
- ✅ All UI features callable by agents
- ✅ Rich context APIs working
- ✅ Live testing functional
- ✅ Screenshot/vision working
- ✅ 80%+ reduction in agent iterations

---

## 🚦 **Current Status**

- ✅ Architecture designed
- ✅ Migration plan defined
- ⏳ Implementation: **Ready to start Phase 1**

---

## 📚 **Related Documentation**

- [Extension Architecture](ROOPIK_EXTENSION_ARCHITECTURE.md) - Current extension structure
- [Mode 2 Architecture](MODE2_ARCHITECTURE.md) - Browser preview details
- [Plugin Architecture](PLUGIN_ARCHITECTURE.md) - Framework-agnostic plugins
- [Security](MODE2_SECURITY.md) - Two-layer security system

---

**Last Updated**: November 2025
**Status**: Planning Complete, Ready for Implementation
**Next Step**: Phase 1 - Foundation
