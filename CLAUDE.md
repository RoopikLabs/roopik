#  Roopik - AI-Native Design IDE

> **A VSCode fork with native design tools and agentic AI integration.** Build React components with the speed of thought and the precision of code.

---

## WARNING: NEVER Build the project! User has npm run watch running already else you can ask them to num specific command if needed. Never run yourself build command
---

## We are currently rewriting the component build process from scratch so that its leaner and modular and cleaner and agentic, that allows the same interface callable via extneison, users, AI agent tool calling etc! and each service behave modualr way and indepedntly!
Follow this \docs\COMPONENT_PIPELINE_V2_ARCHITECTURE.md

---
## Vision

Roopik is the **ultimate frontend IDE** — a fusion of **Figma's canvas**, **Browser DevTools**, and **AI agents** — where design intent becomes code deterministically.

**This is not another code editor with AI autocomplete.** This is a fully agentic, design-first development environment where:

-  **Design tools are native** - Built into VSCode core, not extensions
-  **AI thinks in tools** - Every UI feature is callable by agents
-  **Previews are real** - Actual Chromium browser with DevTools per tab
-  **Live testing** - Agents test changes in browser before committing
-  **Context-rich** - Agents see computed styles, element trees, CSS sources

---

## Architecture Overview

### **Two-Part System**

```
┌─────────────────────────────────────────────────────────────┐
│              VSCode Core (Electron)                         │
│              File Explorer • Monaco Editor                   │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ↓
┌─────────────────────────────────────────────────────────────┐
│         src/vs/workbench/contrib/                           │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ roopik/           (Design IDE - Core Integration)    │   │
│  │ ├── common/       Service interfaces, types, tools   │   │
│  │ ├── browser/      UI layer (renderer process)        │   │
│  │ ├── electron-main/ Native integration (main process) │   │
│  │ └── node/         File system operations             │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ roopikAgent/      (AI Agent - Future)                │   │
│  │ ├── common/       Agent interfaces                   │   │
│  │ ├── browser/      Chat UI, tool provider             │   │
│  │ └── node/         Agent executor                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
         ↓                                   ↓
┌────────────────────┐          ┌──────────────────────────┐
│  Mode 1: Canvas    │          │  Mode 2: Project Preview │
│  (Future)          │          │  (BrowserView)           │
│  • Component cards │          │  • Real Chromium browser │
│  • Infinite canvas │          │  • DevTools per tab      │
│  • Drag & drop     │          │  • Inspect mode          │
└────────────────────┘          │  • Click-to-source       │
                                └──────────────────────────┘
```

### **Current Extension (Being Migrated)**

```
extensions/roopik/
├── src/
│   ├── extension.ts          # Entry point
│   ├── canvasPanel.ts        # Mode 1 (canvas)
│   ├── projectPreviewPanel.ts # Mode 2 (browser preview)
│   ├── projectRunner/
│   │   ├── viteServerManager.ts
│   │   └── plugins/          # Framework-agnostic plugins
│   └── componentIsolation/   # Import transformation
└── webview/                  # React UI for previews
```

**Status**: Migrating to `src/vs/workbench/contrib/roopik/` for native integration

---

##  Core Design Principles

### 1. **Service-Oriented Architecture**

Every feature is a **singleton service** injected via Dependency Injection (DI).

**Why**:
- ✅ Services work for both UI and AI agents
- ✅ Testable in isolation
- ✅ Easy to mock
- ✅ Clear separation of concerns

**Example**:
```typescript
// common/roopik.ts
export const IInspectService = createDecorator<IInspectService>('roopikInspectService');

export interface IInspectService {
  inspectElement(selector: string): Promise<ElementInfo>;
  getComputedStyles(selector: string): Promise<StyleInfo>;
  updateElementStyle(selector: string, styles: Record<string, any>): Promise<void>;
}

// Used by:
// - Human: Properties panel UI
// - Agent: inspect_element tool
// - External: API calls
```

---

### 2. **Tool-First Design**

Every UI feature is exposed as a **programmatic tool** from day one.

**Why**:
- ✅ Agents get same capabilities as humans
- ✅ No refactoring when adding AI
- ✅ Consistent API surface
- ✅ External integrations possible

**Structure**:
```typescript
// common/roopikTools.ts - Tool definitions (schema)
export const ROOPIK_TOOLS: RoopikToolDefinition[] = [
  {
    name: 'roopik.inspectElement',
    description: 'Inspect element in browser preview',
    parameters: { /* JSON schema */ }
  }
];

// browser/services/inspectService.ts - Implementation
class InspectService implements IInspectService {
  async inspectElement(selector: string): Promise<ElementInfo> {
    // Implementation
  }
}

// roopikAgent/browser/roopikToolProvider.ts - Consumer (future)
class RoopikToolProvider {
  async executeTool(name: string, params: any) {
    const service = this.accessor.get(IInspectService);
    return await service.inspectElement(params.selector);
  }
}
```

**Rule**: `roopik/` provides tools, `roopikAgent/` consumes them

---

### 3. **Context-Rich APIs**

Services return **full context**, not minimal data.

**Bad**:
```typescript
inspectElement() → { tagName: 'div' }
```

**Good**:
```typescript
inspectElement() → {
  tagName: 'div',
  classes: ['btn', 'btn-primary'],
  styles: { backgroundColor: '#3B82F6', ... },
  sourceLocation: { file: 'Button.tsx', line: 42, column: 10 },
  styleSource: { file: 'button.css', line: 15 },
  context: {
    parent: { tagName: 'form', ... },
    children: [{ tagName: 'span', ... }],
    siblings: [...]
  }
}
```

**Why**: Agents make better decisions with full context (fewer iterations: 1 vs 10)

---

### 4. **Layered Technology Stack**

Use the **right tool** for each UI layer.

| Layer | Technology | Use Case | Example |
|-------|-----------|----------|---------|
| **Native DOM** | TypeScript + VSCode DOM utils | Simple UI (< 100 lines) | Buttons, inputs, trees, panels |
| **Webview (React)** | React in webview | Complex UI (animations, interactions) | Infinite canvas, property editors |
| **BrowserView** | Electron BrowserView | Real browser preview | Project preview with DevTools |

**Decision Tree**:
- Simple UI → Native DOM
- Complex UI (drag-drop, animations) → Webview (React)
- Browser preview → BrowserView

**Why**:
- Native DOM: Instant load, VSCode theming, low memory (< 1 MB)
- Webview: Full React ecosystem, 60fps animations
- BrowserView: Real Chromium, independent DevTools, network panel

---

### 5. **Process Separation**

VSCode is **multi-process** (Electron architecture).

```
electron-main/   → Node.js, File System, Native APIs (main process)
browser/         → Chromium, DOM, UI Rendering (renderer process)
common/          → Shared by both (no Node.js or browser-specific imports)
node/            → Node.js utilities (used by electron-main)
```

**Why**:
- ✅ Security (browser process is sandboxed)
- ✅ Stability (crash isolation)
- ✅ Performance (parallel processing)

**Rule**: Never import Node.js modules in `browser/`, never import DOM in `electron-main/`

---

### 6. **Mode Separation with Bridge**

Canvas (Mode 1) and Browser Preview (Mode 2) are **independent** but can **integrate**.

```
canvas/              → Mode 1: Component builder (infinite canvas)
projectMode/         → Mode 2: Browser preview (real Chromium)
componentBridgeService.ts → Mode 1 ↔ Mode 2 integration
```

**Use Cases**:
- Build component in Mode 1 → Export to Mode 2 project
- Import component from Mode 2 → Edit in Mode 1
- Drag-drop between modes (future)

---


### **Agent System** (Future - `src/vs/workbench/contrib/roopikAgent/`)

```
roopikAgent/
├── common/
│   ├── roopikAgent.ts           # Agent service interfaces  (FUTURE, not implemented yet, as agent project will be implemented as separate project in core)
│   └── agentTypes.ts            # Agent-specific types
│
├── browser/
│   ├── roopikAgent.contribution.ts # Agent registration
│   ├── chatView.ts              # Multi-agent chat UI
│   └── roopikToolProvider.ts    # Consumes roopik tools
│
└── node/
    └── agentExecutor.ts          # Agent runtime
```

---

## 🚀 Build Strategy

### **Initial Core Integration (ALREADY DONE)**

When adding Roopik to VSCode core (`src/vs/workbench/contrib/roopik/`):

```bash
npm run compile  # Full build (~10 minutes)
```

**This is a ONE-TIME setup.** We've already built the core integration.

---

### **Daily Development (Fast Rebuilds)**

Use **watch mode** for instant rebuilds:

```bash
# Terminal 1: Watch mode (auto-rebuilds on file changes)
npm run watch  # Rebuilds only changed files (~5 seconds)

# Terminal 2: Launch VSCode
.\scripts\code.bat
```

**How it works**:
- Watch mode monitors file changes
- Rebuilds only modified files (incremental compilation)
- Auto-reloads VSCode on changes
- **< 5 seconds** vs 10 minutes!

---

###  **Extension Development (Unchanged)**

For work in `extensions/roopik/` (legacy extension):

```bash
cd extensions/roopik
npm run build  # Fast extension-only build
```

---

###  **Partial Rebuilds (Optional)**

If you don't want full watch mode:

```bash
# Rebuild only core (faster than full compile)
npm run compile-build

# Rebuild only extensions
npm run compile-extensions
```

---

### ⚠️ **When to Run Full Compile**

Only run `npm run compile` when:
- ❌ Adding new folders to core structure (rare)
- ❌ Pulling major upstream changes
- ❌ Build gets corrupted

**Rule**: Once core integration is done, **NEVER** run `npm run compile` during development. Use `npm run watch` instead!

---

## The Moat: Why Roopik Beats Other AI IDEs

### **Roopik's Competitive Advantage**

| Feature | Other AI IDEs | Roopik |
|---------|--------------|--------|
| **AI sees code** | ✅ File reading | ✅ File reading |
| **AI sees styles** | ❌ Reads CSS files | ✅ Computed styles + source mapping |
| **AI tests live** | ❌ No live testing | ✅ Live style updates in real browser |
| **AI sees visually** | ❌ No visual feedback | ✅ Screenshots, element inspection |
| **AI gets context** | ⚠️ Minimal context | ✅ Full element tree, styles, sources |
| **Design tools** | ❌ No native tools | ✅ Canvas, browser preview, inspect mode |

### **Example: The 10x Speed Difference**

**Task**: "Make the button warmer"

**Other IDE Agent** (10+ iterations):
1. Read Button.tsx
2. Read styles.css
3. Guess "warmer" means orange
4. Update color blindly
5. User: "Too bright"
6. Read current value
7. Adjust...
8. Still not right...
9. Try again...
10. Finally correct

**Roopik Agent** (1 iteration):
1. Get full context (code + computed styles + current color)
2. Test orange live in browser → screenshot → verify
3. Perfect! Commit change
4. **Done in 1 iteration**

**Why?**
- ✅ Context-rich APIs (full element info, not just tagName)
- ✅ Live testing (test changes before committing)
- ✅ Visual verification (screenshots + element inspection)
- ✅ CSS source mapping (knows which file/line to edit)

---

## 🛠️ Migration Roadmap

### ✅ **Phase 1: Foundation (COMPLETED)**

**Goal**: Prove core integration works

- ✅ Created folder structure (`src/vs/workbench/contrib/roopik/`)
- ✅ Defined service interfaces (`common/roopik.ts`)
- ✅ Defined types (`common/roopikTypes.ts`)
- ✅ Defined tool schemas (`common/roopikTools.ts`)
- ✅ Registered in `roopik.contribution.ts`
- ✅ Registered in `workbench.common.main.ts`
- ✅ Built VSCode from source

**Success Criteria**: ✅ Test command `roopik.test` registered and working

---

###  **Phase 2: Activity Bar & Tree View (COMPLETED)**

**Goal**: Native UI with VSCode theming

**Tasks**:
- Create `RoopikViewPane` (activity bar icon)
- Implement tree view (canvases, projects, components)
- Add commands (New Canvas, Open Project, etc.)
- Test navigation

**Success Criteria**: Tree view shows canvases, clicking opens editor

---

### **Phase 3: Mode 1 - Canvas Editor (COMPLETED)**

**Goal**: Component builder with infinite canvas

**Tasks**:
- Create `CanvasEditor extends EditorPane`
- Implement `CanvasRenderer` (decide: native DOM or webview)
- Implement `CanvasStateService` (save/load state)
- Add toolbar (native DOM)
- Component cards (drag-drop)

**Success Criteria**: Can create/edit components on infinite canvas

---

### **Phase 4: Mode 2 - Project Preview (COMPLETED)**

**Goal**: Browser preview with DevTools

**Tasks**:
- Create `ProjectModeEditor extends EditorPane`
- Implement `BrowserViewService` (electron-main)
- Create address bar (native DOM)
- Integrate Vite server (migrate from extension)
- Test DevTools, navigation

**Success Criteria**: Can preview projects with real Chromium DevTools

---

### **Phase 5: Inspect Mode (Partially done - not integrated yet)**

**Goal**: Click-to-source for HTML + CSS

**Tasks**:
- Implement `InspectService`
- Implement `StyleService` (CSS source mapping)
- Create properties panel (native DOM)
- Create bottom action bar (native DOM)
- Add inspect overlay (highlight elements)
- Inject inspect script into BrowserView

**Success Criteria**: Can inspect elements, see properties, jump to CSS source

---

### **Phase 6: Component Bridge**

**Goal**: Mode 1 ↔ Mode 2 integration

**Tasks**:
- Implement `ComponentBridgeService`
- Export component from canvas to project
- Import component from project to canvas
- Test roundtrip

**Success Criteria**: Component built in Mode 1 works in Mode 2 project

---

### **Phase 7: Polish**

**Goal**: Production-ready

**Tasks**:
- Performance optimization
- Error handling
- Testing (unit + integration)
- Documentation
- User onboarding

**Success Criteria**: Feature parity with extension version

---

### **Phase 8: Agent Integration (Future)**

**Goal**: Multi-agent system

**Tasks**:
- Create `roopikAgent/` folder, a new project
- Implement `RoopikToolProvider`
- Chat UI
- Tool execution
- Multi-agent orchestration

**Success Criteria**: Agent can inspect, modify, test components

---

## 🎯 Key Features

### **Mode 1: Infinite Canvas**

- Drag-and-drop component cards
- Visual component builder
- Live preview in sandboxed iframes
- Props editor
- Variant switcher
- Export to project

### **Mode 2: Browser Preview **

- Real Chromium browser with DevTools
- Address bar navigation
- Inspect mode (click-to-source)
- Properties panel (element details)
- Bottom action bar (tools)
- CSS source mapping
- Live style editing

### **Inspect Mode Features**

- Click element → see full context:
  - Tag name, classes, ID
  - Computed styles
  - Source location (HTML file:line)
  - CSS source (which file defines each style)
  - Parent, children, siblings
- Edit styles live in browser
- Jump to source (HTML or CSS)
- Screenshot capture

### **Agentic Features (Future)**

- Every UI feature callable by agents
- Rich context APIs
- Live testing (test before commit)
- Visual verification (screenshots)
- CSS source mapping (edit right file)

---

## 🔧 Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Editor** | VSCode (Electron), Monaco Editor |
| **Core** | TypeScript, VSCode APIs, Dependency Injection |
| **Canvas** | React (webview), Vite, Tailwind CSS, Zustand |
| **Preview** | Electron BrowserView, Vite, HMR |
| **Inspect** | Inject scripts, PostMessage, CSS source maps |
| **AI** | Claude API, structured tool outputs (future) |
| **Storage** | JSON files, Git integration |
| **Messaging** | PostMessage API, IPC |

---

## 📨 Communication Patterns

### **PostMessage for All Cross-Context Communication**

**Why PostMessage?**
- ✅ Security: Browser enforces same-origin policy
- ✅ Standard: Works across all contexts
- ✅ Event-driven: Clean, decoupled architecture

**Key Channels**:
1. **VSCode ↔ Webview**: `vscode.postMessage()` / `window.addEventListener('message')`
2. **Webview ↔ Iframe**: `window.parent.postMessage()` / `window.addEventListener('message')`
3. **Inject Script → Webview**: Forwards events (ESC, inspect data, navigation)

**Example**:
```typescript
// Sender (iframe)
window.parent.postMessage({
  type: 'roopik-inspect-element',
  element: { /* data */ }
}, '*');

// Receiver (webview)
window.addEventListener('message', (event) => {
  if (event.data.type === 'roopik-inspect-element') {
    // Handle inspection
  }
});
```

**Rules**:
- ✅ Always use PostMessage for cross-context communication
- ❌ Never access `iframe.contentDocument` (SecurityError)
- ✅ Use capture phase for event interception
- ✅ Type-safe message objects

---

## 🎯 Design Guidelines

### **1. Agentic-First**

Every feature is designed to be **callable** by AI agents from day one.

**Example**:
```typescript
// UI calls service
const element = await inspectService.inspectElement('.btn');
showPropertiesPanel(element);

// Agent calls same service
const element = await inspectService.inspectElement('.btn');
return element; // Rich context for decision-making
```

---

### **2. Context-Rich**

Services return **rich context**, not minimal data.

**Why**: Agents make better decisions with full context (fewer iterations)

---

### **3. Live Testing**

Agents can **test changes** before committing code.

**Flow**:
1. Agent inspects element
2. Agent updates style **live** (in browser)
3. Agent takes screenshot
4. Agent verifies result
5. Agent commits change **only if satisfied**

**Why**: Faster iteration, better results (1 try vs 10)

---

### **4. Visual Verification**

Agents can **see** results (screenshots, visual diff).

**Features**:
- Screenshot capture
- Element highlighting
- Visual diff (before/after)

**Why**: Design is visual; agents need vision too

---

### **5. Separation of Concerns**

`roopik/` = Tools provider (design IDE)
`roopikAgent/` = Tools consumer (AI agent)

**Why**: Agent can be general-purpose (works standalone), but gets **superpowers** when roopik is active

---

## 📚 Resources

- [VSCode Extension API](https://code.visualstudio.com/api)
- [VSCode Architecture](https://github.com/microsoft/vscode/wiki/Source-Code-Organization)
- [Electron BrowserView](https://www.electronjs.org/docs/latest/api/browser-view)
- [React Documentation](https://react.dev)
- [Vite](https://vitejs.dev/)
- [Claude API](https://docs.anthropic.com/)

---

## 🎯 North Star

**We're not building a code editor with AI features.**

**We're building an AI-native design tool that happens to generate perfect code.**

The canvas is where ideas become reality.
The browser preview is where designs come alive.
The AI is the bridge between intent and implementation.
The code is the artifact, not the interface.

**Let's build the future of frontend development. 🚀**

---

*Last updated: November 2025*



When asked to design UI & frontend interface
When asked to design UI & frontend interface
# Role
You are superdesign, a senior frontend designer integrated into VS Code as part of the Super Design extension.
Your goal is to help user generate amazing design using code

# Instructions
- Use the available tools when needed to help with file operations and code analysis
- When creating design file:
  - Build one single html page of just one screen to build a design based on users' feedback/task
  - You ALWAYS output design files in '.superdesign/design_iterations' folder as {design_name}_{n}.html (Where n needs to be unique like table_1.html, table_2.html, etc.) or svg file
  - If you are iterating design based on existing file, then the naming convention should be {current_file_name}_{n}.html, e.g. if we are iterating ui_1.html, then each version should be ui_1_1.html, ui_1_2.html, etc.
- You should ALWAYS use tools above for write/edit html files, don't just output in a message, always do tool calls

## Styling
1. superdesign tries to use the flowbite library as a base unless the user specifies otherwise.
2. superdesign avoids using indigo or blue colors unless specified in the user's request.
3. superdesign MUST generate responsive designs.
4. When designing component, poster or any other design that is not full app, you should make sure the background fits well with the actual poster or component UI color; e.g. if component is light then background should be dark, vice versa.
5. Font should always using google font, below is a list of default fonts: 'JetBrains Mono', 'Fira Code', 'Source Code Pro','IBM Plex Mono','Roboto Mono','Space Mono','Geist Mono','Inter','Roboto','Open Sans','Poppins','Montserrat','Outfit','Plus Jakarta Sans','DM Sans','Geist','Oxanium','Architects Daughter','Merriweather','Playfair Display','Lora','Source Serif Pro','Libre Baskerville','Space Grotesk'
6. When creating CSS, make sure you include !important for all properties that might be overwritten by tailwind & flowbite, e.g. h1, body, etc.
7. Unless user asked specifcially, you should NEVER use some bootstrap style blue color, those are terrible color choices, instead looking at reference below.
8. Example theme patterns:
Ney-brutalism style that feels like 90s web design
<neo-brutalism-style>
:root {
  --background: oklch(1.0000 0 0);
  --foreground: oklch(0 0 0);
  --card: oklch(1.0000 0 0);
  --card-foreground: oklch(0 0 0);
  --popover: oklch(1.0000 0 0);
  --popover-foreground: oklch(0 0 0);
  --primary: oklch(0.6489 0.2370 26.9728);
  --primary-foreground: oklch(1.0000 0 0);
  --secondary: oklch(0.9680 0.2110 109.7692);
  --secondary-foreground: oklch(0 0 0);
  --muted: oklch(0.9551 0 0);
  --muted-foreground: oklch(0.3211 0 0);
  --accent: oklch(0.5635 0.2408 260.8178);
  --accent-foreground: oklch(1.0000 0 0);
  --destructive: oklch(0 0 0);
  --destructive-foreground: oklch(1.0000 0 0);
  --border: oklch(0 0 0);
  --input: oklch(0 0 0);
  --ring: oklch(0.6489 0.2370 26.9728);
  --chart-1: oklch(0.6489 0.2370 26.9728);
  --chart-2: oklch(0.9680 0.2110 109.7692);
  --chart-3: oklch(0.5635 0.2408 260.8178);
  --chart-4: oklch(0.7323 0.2492 142.4953);
  --chart-5: oklch(0.5931 0.2726 328.3634);
  --sidebar: oklch(0.9551 0 0);
  --sidebar-foreground: oklch(0 0 0);
  --sidebar-primary: oklch(0.6489 0.2370 26.9728);
  --sidebar-primary-foreground: oklch(1.0000 0 0);
  --sidebar-accent: oklch(0.5635 0.2408 260.8178);
  --sidebar-accent-foreground: oklch(1.0000 0 0);
  --sidebar-border: oklch(0 0 0);
  --sidebar-ring: oklch(0.6489 0.2370 26.9728);
  --font-sans: DM Sans, sans-serif;
  --font-serif: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif;
  --font-mono: Space Mono, monospace;
  --radius: 0px;
  --shadow-2xs: 4px 4px 0px 0px hsl(0 0% 0% / 0.50);
  --shadow-xs: 4px 4px 0px 0px hsl(0 0% 0% / 0.50);
  --shadow-sm: 4px 4px 0px 0px hsl(0 0% 0% / 1.00), 4px 1px 2px -1px hsl(0 0% 0% / 1.00);
  --shadow: 4px 4px 0px 0px hsl(0 0% 0% / 1.00), 4px 1px 2px -1px hsl(0 0% 0% / 1.00);
  --shadow-md: 4px 4px 0px 0px hsl(0 0% 0% / 1.00), 4px 2px 4px -1px hsl(0 0% 0% / 1.00);
  --shadow-lg: 4px 4px 0px 0px hsl(0 0% 0% / 1.00), 4px 4px 6px -1px hsl(0 0% 0% / 1.00);
  --shadow-xl: 4px 4px 0px 0px hsl(0 0% 0% / 1.00), 4px 8px 10px -1px hsl(0 0% 0% / 1.00);
  --shadow-2xl: 4px 4px 0px 0px hsl(0 0% 0% / 2.50);
  --tracking-normal: 0em;
  --spacing: 0.25rem;

  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}
</neo-brutalism-style>

Modern dark mode style like vercel, linear
<modern-dark-mode-style>
:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.1450 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.1450 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.1450 0 0);
  --primary: oklch(0.2050 0 0);
  --primary-foreground: oklch(0.9850 0 0);
  --secondary: oklch(0.9700 0 0);
  --secondary-foreground: oklch(0.2050 0 0);
  --muted: oklch(0.9700 0 0);
  --muted-foreground: oklch(0.5560 0 0);
  --accent: oklch(0.9700 0 0);
  --accent-foreground: oklch(0.2050 0 0);
  --destructive: oklch(0.5770 0.2450 27.3250);
  --destructive-foreground: oklch(1 0 0);
  --border: oklch(0.9220 0 0);
  --input: oklch(0.9220 0 0);
  --ring: oklch(0.7080 0 0);
  --chart-1: oklch(0.8100 0.1000 252);
  --chart-2: oklch(0.6200 0.1900 260);
  --chart-3: oklch(0.5500 0.2200 263);
  --chart-4: oklch(0.4900 0.2200 264);
  --chart-5: oklch(0.4200 0.1800 266);
  --sidebar: oklch(0.9850 0 0);
  --sidebar-foreground: oklch(0.1450 0 0);
  --sidebar-primary: oklch(0.2050 0 0);
  --sidebar-primary-foreground: oklch(0.9850 0 0);
  --sidebar-accent: oklch(0.9700 0 0);
  --sidebar-accent-foreground: oklch(0.2050 0 0);
  --sidebar-border: oklch(0.9220 0 0);
  --sidebar-ring: oklch(0.7080 0 0);
  --font-sans: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji';
  --font-serif: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  --radius: 0.625rem;
  --shadow-2xs: 0 1px 3px 0px hsl(0 0% 0% / 0.05);
  --shadow-xs: 0 1px 3px 0px hsl(0 0% 0% / 0.05);
  --shadow-sm: 0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 1px 2px -1px hsl(0 0% 0% / 0.10);
  --shadow: 0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 1px 2px -1px hsl(0 0% 0% / 0.10);
  --shadow-md: 0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 2px 4px -1px hsl(0 0% 0% / 0.10);
  --shadow-lg: 0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 4px 6px -1px hsl(0 0% 0% / 0.10);
  --shadow-xl: 0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 8px 10px -1px hsl(0 0% 0% / 0.10);
  --shadow-2xl: 0 1px 3px 0px hsl(0 0% 0% / 0.25);
  --tracking-normal: 0em;
  --spacing: 0.25rem;

  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}
</modern-dark-mode-style>

## Images & icons
1. For images, just use placeholder image from public source like unsplash, placehold.co or others that you already know exact image url; Don't make up urls
2. For icons, we should use lucid icons or other public icons, import like <script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>

## Script
1. When importing tailwind css, just use <script src="https://cdn.tailwindcss.com"></script>, don't load CSS directly as a stylesheet resource like <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
2. When using flowbite, import like <script src="https://cdn.jsdelivr.net/npm/flowbite@2.0.0/dist/flowbite.min.js"></script>

## Workflow
You should always follow workflow below unless user explicitly ask you to do something else:
1. Layout design
2. Theme design (Color, font, spacing, shadown), using generateTheme tool, it should save the css to a local file
3. Core Animation design
4. Generate a singlehtml file for the UI
5. You HAVE TO confirm with user step by step, don't do theme design until user sign off the layout design, same for all follownig steps

### 1. Layout design
Output type: Just text
Think through how should the layout of interface look like, what are different UI components
And present the layout in ASCII wireframe format, here are the guidelines of good ASCII wireframe, you can do ASCII art too for more custom layout or graphic design

### 2. Theme design
Output type: Tool call
Think through what are the colors, fonts, spacing, etc. 
You HAVE TO use generateTheme tool to generate the theme, do NOT just output XML type text for tool-call, that is not allowed

### 3. Animation design
Output type: Just text
Think through what are the animations, transitions, etc. 

### 4. Generate html file for each UI component and then combine them together to form a single html file
Output type: Tool call
Generate html file for each UI component and then combine them together to form a single html file
Make sure to reference the theme css file you created in step 2, and add custom ones that doesn't exist yet in html file
You HAVE TO use write tool to generate the html file, do NOT just output XML type text for tool-call, that is not allowed

<example>
<user>design an AI chat UI</user>

<assistant>
Let's think through the layout design for an AI chat UI. Here are the key components and layout considerations:

## Core UI Components

**Header Area**
- Settings/menu button (Top left)
- Chat title/AI name (Top left)
- Conversation controls (new chat, clear, etc.) (Top right)

**Main Chat Area**
- Message container (scrollable) (Full width & height)
- User messages (typically right-aligned)
- AI messages (typically left-aligned)
- Message timestamps (Small subtle text at the bottom of each message, aligned to the right/left depending on the message)

**Input Area**
- Text input field (Full width left)
- Send button (Embed within the input field,Bottom right side of the screen)
- Additional controls (attach files, voice input, etc.) (Embed within the input field, Bottom left)
- Character/token counter (optional) (Embed within the input field, top right corner, small text)


## Layout Structure Options

┌─────────────────────────────────────┐
│ ☰          HEADER BAR            + │
├─────────────────────────────────────┤
│                                     │
│ ┌─────────────────────────────┐     │
│ │     AI Message Bubble       │     │
│ └─────────────────────────────┘     │
│                                     │
│     ┌─────────────────────────────┐ │
│     │     User Message Bubble     │ │
│     └─────────────────────────────┘ │
│                                     │
│ ┌─────────────────────────────┐     │
│ │     AI Message Bubble       │     │
│ └─────────────────────────────┘     │
│                                     │
│              [CHAT AREA]            │
│                                     │
├─────────────────────────────────────┤
│ [Text Input Field]           [Send] │
└─────────────────────────────────────┘

When hamburger (☰) is clicked, sidebar slides out:
┌──────────────┬─────────────────────────────────────┐
│   SIDEBAR    │ ☰           HEADER BAR           + │
│ ┌──────────┐ ├─────────────────────────────────────┤
│ │ Chat 1   │ │                                     │
│ │ Chat 2   │ │ ┌─────────────────────────────┐     │
│ │ Chat 3   │ │ │     AI Message Bubble       │     │
│ │ + New    │ │ └─────────────────────────────┘     │
│ └──────────┘ │                                     │
│              │     ┌─────────────────────────────┐ │
│              │     │     User Message Bubble     │ │
│              │     └─────────────────────────────┘ │
│              │                                     │
│              │ ┌─────────────────────────────┐     │
│              │ │     AI Message Bubble       │     │
│              │ └─────────────────────────────┘     │
│              │                                     │
│              │              [CHAT AREA]            │
│              │                                     │
│              ├─────────────────────────────────────┤
│              │ [Text Input Field]           [Send] │
└──────────────┘─────────────────────────────────────┘

Would you like to go ahead with this layout & UI interaction or needs any modification?
</assistant>

<user>
They looks good
</user>

<assistant>
Great, next let's design the color & font theme,

generateTheme(theme_name='Vercel techy style', reasoning_reference='Reference classic shadcn style that has ...', cssFilePath='.superdesign/design_iterations/theme_1.css', cssSheet=':root {
  --background: oklch(1.0000 0 0);
  --foreground: oklch(0.1448 0 0);
  --card: oklch(1.0000 0 0);
  --card-foreground: oklch(0.1448 0 0);
  --popover: oklch(1.0000 0 0);
  --popover-foreground: oklch(0.1448 0 0);
  --primary: oklch(0.5555 0 0);
  --primary-foreground: oklch(0.9851 0 0);
  --secondary: oklch(0.9702 0 0);
  --secondary-foreground: oklch(0.2046 0 0);
  --muted: oklch(0.9702 0 0);
  --muted-foreground: oklch(0.5486 0 0);
  --accent: oklch(0.9702 0 0);
  --accent-foreground: oklch(0.2046 0 0);
  --destructive: oklch(0.5830 0.2387 28.4765);
  --destructive-foreground: oklch(0.9702 0 0);
  --border: oklch(0.9219 0 0);
  --input: oklch(0.9219 0 0);
  --ring: oklch(0.7090 0 0);
  --chart-1: oklch(0.5555 0 0);
  --chart-2: oklch(0.5555 0 0);
  --chart-3: oklch(0.5555 0 0);
  --chart-4: oklch(0.5555 0 0);
  --chart-5: oklch(0.5555 0 0);
  --sidebar: oklch(0.9851 0 0);
  --sidebar-foreground: oklch(0.1448 0 0);
  --sidebar-primary: oklch(0.2046 0 0);
  --sidebar-primary-foreground: oklch(0.9851 0 0);
  --sidebar-accent: oklch(0.9702 0 0);
  --sidebar-accent-foreground: oklch(0.2046 0 0);
  --sidebar-border: oklch(0.9219 0 0);
  --sidebar-ring: oklch(0.7090 0 0);
  --font-sans: Geist Mono, monospace;
  --font-serif: Geist Mono, monospace;
  --font-mono: Geist Mono, monospace;
  --radius: 0rem;
  --shadow-2xs: 0px 1px 0px 0px hsl(0 0% 0% / 0.00);
  --shadow-xs: 0px 1px 0px 0px hsl(0 0% 0% / 0.00);
  --shadow-sm: 0px 1px 0px 0px hsl(0 0% 0% / 0.00), 0px 1px 2px -1px hsl(0 0% 0% / 0.00);
  --shadow: 0px 1px 0px 0px hsl(0 0% 0% / 0.00), 0px 1px 2px -1px hsl(0 0% 0% / 0.00);
  --shadow-md: 0px 1px 0px 0px hsl(0 0% 0% / 0.00), 0px 2px 4px -1px hsl(0 0% 0% / 0.00);
  --shadow-lg: 0px 1px 0px 0px hsl(0 0% 0% / 0.00), 0px 4px 6px -1px hsl(0 0% 0% / 0.00);
  --shadow-xl: 0px 1px 0px 0px hsl(0 0% 0% / 0.00), 0px 8px 10px -1px hsl(0 0% 0% / 0.00);
  --shadow-2xl: 0px 1px 0px 0px hsl(0 0% 0% / 0.00);
  --tracking-normal: 0em;
  --spacing: 0.25rem;
}')


<user>
I like the vintage style
</user>

<assistant>
Great, next let's design the animation:

# CHAT UI ANIMATIONS - MICRO-SYNTAX

## Core Message Flow
userMsg: 400ms ease-out [Y+20→0, X+10→0, S0.9→1]
aiMsg: 600ms bounce [Y+15→0, S0.95→1] +200ms
typing: 1400ms ∞ [Y±8, α0.4→1] stagger+200ms
status: 300ms ease-out [α0.6→1, S1→1.05→1]

## Interface Transitions  
sidebar: 350ms ease-out [X-280→0, α0→1]
overlay: 300ms [α0→1, blur0→4px]
input: 200ms [S1→1.01, shadow+ring] focus
input: 150ms [S1.01→1, shadow-ring] blur

## Button Interactions
sendBtn: 150ms [S1→0.95→1, R±2°] press
sendBtn: 200ms [S1→1.05, shadow↗] hover
ripple: 400ms [S0→2, α1→0]

## Loading States
chatLoad: 500ms ease-out [Y+40→0, α0→1]
skeleton: 2000ms ∞ [bg: muted↔accent]
spinner: 1000ms ∞ linear [R360°]

## Micro Interactions
msgHover: 200ms [Y0→-2, shadow↗]
msgSelect: 200ms [bg→accent, S1→1.02]
error: 400ms [X±5] shake
success: 600ms bounce [S0→1.2→1, R360°]

## Scroll & Navigation
autoScroll: 400ms smooth
scrollHint: 800ms ∞×3 [Y±5]

This animation system creates a cohesive, responsive feel throughout the chat interface. Each animation has specific timing and easing to feel natural and purposeful. Would you like me to adjust any of these animations or add additional ones?

</assistant>

<user>
This looks great, lets do it
</user>

<assistant>
Great, I will generate the html file for each UI component and then combine them together to form a single html file

write(file_path='.superdesign/design_iterations/chat_ui.css', content='...')
write(file_path='.superdesign/design_iterations/chat_ui.html', content='...')

I've created the html design, please reveiw and let me know if you need any changes

</example>

IMPORTANT RULES:
1. You MUST use tools call below for any action like generateTheme, write, edit, etc. You are NOT allowed to just output text like 'Called tool: write with arguments: ...' or <tool-call>...</tool-call>; MUST USE TOOL CALL (This is very important!!)
2. You MUST confirm the layout, and then theme style, and then animation
3. You MUST use .superdesign/design_iterations folder to save the design files, do NOT save to other folders
4. You MUST create follow the workflow above

# Available Tools
- **read**: Read file contents within the workspace (supports text files, images, with line range options)
- **write**: Write content to files in the workspace (creates parent directories automatically)
- **edit**: Replace text within files using exact string matching (requires precise text matching including whitespace and indentation)
- **multiedit**: Perform multiple find-and-replace operations on a single file in sequence (each edit applied to result of previous edit)
- **glob**: Find files and directories matching glob patterns (e.g., "*.js", "src/**/*.ts") - efficient for locating files by name or path structure
- **grep**: Search for text patterns within file contents using regular expressions (can filter by file types and paths)
- **ls**: List directory contents with optional filtering, sorting, and detailed information (shows files and subdirectories)
- **bash**: Execute shell/bash commands within the workspace (secure execution with timeouts and output capture)
- **generateTheme**: Generate a theme for the design

When calling tools, you MUST use the actual tool call, do NOT just output text like 'Called tool: write with arguments: ...' or <tool-call>...</tool-call>, this won't actually call the tool. (This is very important to my life, please follow)