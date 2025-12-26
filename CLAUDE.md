# Roopik - AI-Native Design IDE

> **A VSCode fork with native design tools and agentic AI integration.** Build UI components/projects with the speed of thought and the precision of code.

---

## WARNING: NEVER Build the project! User has npm run watch running already else you can ask them to num specific command if needed. Never run yourself build command

## ALSO, never use ASCII characters or emoticons
---

## Vision

Roopik is the **ultimate frontend IDE** — a fusion of **Figma's canvas**, **Browser DevTools**, and **AI agents** — where design intent becomes code deterministically.

**This is not another code editor with AI autocomplete.** This is a fully agentic, design-first development environment where:

- **Design tools are native** - Built into VSCode core, not extensions
- **AI thinks in tools** - Every UI feature is callable by agents
- **Previews are real** - Actual Chromium browser with DevTools per tab
- **Live testing** - Agents test changes in browser before committing
- **Context-rich** - Agents see computed styles, element trees, CSS sources

---

## Architecture Overview

### **Two-Part System**

````
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
└─────────────────────────────────────────────────────────────┘
                         │
                         ↓
┌─────────────────────────────────────────────────────────────┐
│         extensions/agent-dio/  (AI Coding Agent)            │
│         Separate extension, calls Core via MCP tools        │
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
--------


## Core Design Principles

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
export const IInspectService = createDecorator<IInspectService>(
	"roopikInspectService"
);

export interface IInspectService {
	inspectElement(selector: string): Promise<ElementInfo>;
	getComputedStyles(selector: string): Promise<StyleInfo>;
	updateElementStyle(
		selector: string,
		styles: Record<string, any>
	): Promise<void>;
}

// Used by:
// - Human: Properties panel UI
// - Agent: inspect_element tool
// - External: API calls
````

---

### 2. **Tool-First Design**

Every UI/Core feature is exposed as a **programmatic tool** from day one.

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
		name: "roopik.inspectElement",
		description: "Inspect element in browser preview",
		parameters: {
			/* JSON schema */
		},
	},
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

| Layer               | Technology                    | Use Case                              | Example                           |
| ------------------- | ----------------------------- | ------------------------------------- | --------------------------------- |
| **Native DOM**      | TypeScript + VSCode DOM utils | Simple UI (< 100 lines)               | Buttons, inputs, trees, panels    |
| **Webview (React)** | React in webview              | Complex UI (animations, interactions) | Infinite canvas, property editors |
| **BrowserView**     | Electron BrowserView          | Real browser preview                  | Project preview with DevTools     |

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

### **Agent System** (Separate Extension: `extensions/agent-dio/`)

**agent-dio** is a separate VS Code extension :
- Coding agent with agentic loop (planning, execution, verification)
- Calls Core services via MCP tools
- Chat UI for user interaction
- Independent from Core (can be disabled/enabled)

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

### **Extension Development (Unchanged)**

For work in `extensions/roopik/` (legacy extension):

```bash
cd extensions/roopik
npm run build  # Fast extension-only build
```

---

### **Partial Rebuilds (Optional)**

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

| Feature              | Other AI IDEs         | Roopik                                   |
| -------------------- | --------------------- | ---------------------------------------- |
| **AI sees code**     | ✅ File reading       | ✅ File reading                          |
| **AI sees styles**   | ❌ Reads CSS files    | ✅ Computed styles + source mapping      |
| **AI tests live**    | ❌ No live testing    | ✅ Live style updates in real browser    |
| **AI sees visually** | ❌ No visual feedback | ✅ Screenshots, element inspection       |
| **AI gets context**  | ⚠️ Minimal context    | ✅ Full element tree, styles, sources    |
| **Design tools**     | ❌ No native tools    | ✅ Canvas, browser preview, inspect mode |

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

## 🎯 Key Features

### **Mode 1: Infinite Canvas**
- Import Components
- AI generated components
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

### **Agentic Features**

- Every UI feature callable by agents
- Rich context APIs
- Live testing (test before commit)
- Visual verification (screenshots)
- CSS source mapping (edit right file)

---

## 🔧 Tech Stack

| Layer         | Technologies                                  |
| ------------- | --------------------------------------------- |
| **Editor**    | VSCode (Electron), Monaco Editor              |
| **Core**      | TypeScript, VSCode APIs, Dependency Injection |
| **Canvas**    | React (webview), Vite, Tailwind CSS, Zustand  |
| **Preview**   | Electron BrowserView, Vite, HMR               |
| **Inspect**   | Inject scripts, PostMessage, CSS source maps  |
| **AI**        | structured tool outputs, mcp                  |
| **Storage**   | JSON files, Git integration                   |
| **Messaging** | PostMessage API, IPC                          |

---


## 🎯 Design Guidelines

### **1. Agentic-First**

Every feature is designed to be **callable** by AI agents from day one.

**Example**:

```typescript
// UI calls service
const element = await inspectService.inspectElement(".btn");
showPropertiesPanel(element);

// Agent calls same service
const element = await inspectService.inspectElement(".btn");
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
`roopik-dio/` = Tools consumer (AI agent in Extension)

**Why**: Agent can be general-purpose (works standalone), but gets **superpowers** when roopik is active

---

## 📚 Resources

- [VSCode Extension API](https://code.visualstudio.com/api)
- [VSCode Architecture](https://github.com/microsoft/vscode/wiki/Source-Code-Organization)
- [Electron BrowserView](https://www.electronjs.org/docs/latest/api/browser-view)
- [React Documentation](https://react.dev)
- [Vite](https://vitejs.dev/)


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
