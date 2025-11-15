# Week 2 - Webview + React Setup

**What we built:** Webview panel with React app and PostMessage communication

---

## Project Structure Explained

```
roopik/                          # VS Code fork (entire IDE)
├── extensions/roopik/           # OUR extension (like a plugin)
│   ├── src/                     # Extension backend (Node.js/TypeScript)
│   │   ├── extension.ts         # Entry point - activates extension
│   │   └── canvasPanel.ts       # Creates webview window
│   ├── out/                     # Compiled extension code (.js files)
│   ├── webview-ui/              # Separate React app (frontend)
│   │   ├── src/                 # React source code
│   │   │   ├── App.tsx          # Main React component
│   │   │   └── App.css          # Styles
│   │   ├── build/               # Compiled React app (HTML/JS/CSS)
│   │   ├── node_modules/        # React dependencies (isolated)
│   │   └── package.json         # React app config
│   ├── package.json             # Extension config
│   └── .gitignore               # Ignore extension build files
├── src/                         # VS Code core (we don't touch this much)
└── .gitignore                   # VS Code root ignore
```

**Yes, it's 2 nested projects!**

## The Two Projects

### 1. Extension Backend (`extensions/roopik/src/`)
- **Language**: TypeScript (Node.js runtime)
- **Runs in**: VS Code's extension host process
- **Has access to**: File system, VS Code APIs, AI APIs
- **Cannot**: Show UI directly (needs webview)

### 2. Webview Frontend (`extensions/roopik/webview-ui/`)
- **Language**: React + TypeScript
- **Runs in**: Isolated iframe (browser context)
- **Has access to**: DOM, React, canvas rendering
- **Cannot**: Access file system, VS Code APIs directly
- **Communication**: Only via PostMessage to extension backend

## How They Work Together

```
User clicks "Open Canvas"
    ↓
extension.ts → Activates
    ↓
canvasPanel.ts → Creates webview window
    ↓
Loads webview-ui/build/index.html (React app)
    ↓
React app renders in iframe
    ↓
User interacts with canvas
    ↓
React sends PostMessage → Extension backend
    ↓
Extension accesses file system/AI/etc.
    ↓
Extension sends PostMessage → React updates UI
```

## File Roles Explained

**`extension.ts`**: Extension entry point
- Registers "Roopik: Open Canvas" command
- When activated, calls `CanvasPanel.createOrShow()`

**`canvasPanel.ts`**: Webview manager
- Creates webview panel (window)
- Loads React app HTML
- Handles PostMessage communication
- Manages webview lifecycle (open/close/dispose)

**`webview-ui/`**: The infinite canvas (React app)
- This IS the infinite canvas
- Will have pan/zoom, components, variants
- Renders everything visually

## Your Questions Answered

### 1. Watcher - How It Works
**Not automatic!** You manually run:
```bash
# Terminal 1 - Run from PROJECT ROOT (roopik/)
npm run watch-extensions

# Terminal 2 - Run from webview-ui folder
cd extensions/roopik/webview-ui
npm run build -- --watch

# Terminal 3 - Keep Roopik running
.\scripts\code.bat
```

**Workflow:**
1. ✅ Roopik is running (from code.bat)
2. ✅ Watchers running in separate terminals
3. Edit code → Save
4. Watcher auto-rebuilds (you see it in terminal)
5. Press `Ctrl+R` in Roopik → Reloads with new code
6. **Don't close Roopik!** Keep it open, just reload

### 2. Dependencies - Isolated?
**YES! Completely isolated:**
- `roopik/node_modules/` = VS Code dependencies
- `extensions/roopik/webview-ui/node_modules/` = React dependencies
- No conflicts because they're separate package.json files

### 3. Multiple Tabs?
**Single webview** - one infinite canvas per window. User opens it once, sees all components there.

### 4. Do All Extensions Use React?
**No!** Most use plain HTML/CSS/JS. We chose React because:
- Complex UI (infinite canvas with 1000+ components)
- State management (component tree, variants, selections)
- Performance optimizations easier

### 5. Infinite Canvas Location?
**`webview-ui/src/App.tsx`** will become the infinite canvas. Right now it's just buttons. We'll add:
- Pan/zoom with transform matrix
- Component rendering
- Selection system
- Variant panels

### 6. AI Generated Components (Vue/Svelte/etc.)?
**Preview in isolated iframes INSIDE the canvas:**

```
Infinite Canvas (React)
  ↓
  Component Node 1 → Preview iframe (Vue component)
  Component Node 2 → Preview iframe (React component)
  Component Node 3 → Preview iframe (Svelte component)
```

Each preview runs in its own iframe sandbox. We bundle them with esbuild/Vite.

### 7. GPU Rendering / Performance?
**All in `webview-ui/`:**
- **Canvas rendering**: HTML Canvas 2D API (start) or WebGL (later)
- **Virtualization**: Only render visible components (viewport culling)
- **Threads**: Web Workers for heavy calculations
- **GPU**: CSS transforms for pan/zoom (GPU-accelerated)

We'll build this in Weeks 5-10.

## Summary

- ✅ 2 nested projects (extension backend + React frontend)
- ✅ Extension = Node.js (file access, AI)
- ✅ Webview = React (UI, canvas, rendering)
- ✅ PostMessage = only communication bridge
- ✅ Dependencies isolated (no conflicts)
- ✅ Watchers manual (you run them)
- ✅ Infinite canvas = webview-ui (React app)
- ✅ AI variants = previewed in nested iframes

---

## Files Created

- `extensions/roopik/src/canvasPanel.ts` - Webview panel manager
- `extensions/roopik/webview-ui/` - React app (Vite project)
- `extensions/roopik/webview-ui/src/App.tsx` - React component with PostMessage

## VS Code Files Modified

- `extensions/roopik/src/extension.ts` - Import and use CanvasPanel

---

## What We Achieved

1. **Webview panel working** - Opens when command runs
2. **React app loaded** - Built with Vite, loaded in webview
3. **PostMessage communication** - Bidirectional messaging between extension and webview
4. **Watch mode setup** - Auto-rebuild on code changes
5. **Isolated dependencies** - React deps separate from VS Code deps

## Key Learnings

**PostMessage = Communication Bridge**
- Webview runs in isolated iframe (no file/API access)
- Extension has file/API access but can't show UI
- PostMessage is the ONLY way they communicate

**Why React + Vite?**
- React: Complex UI with state management
- Vite: Fast builds, hot reload, modern tooling

**Development Workflow**
1. Edit extension code → Watch rebuilds → Ctrl+R to reload
2. Edit React code → Watch rebuilds → Ctrl+R to reload
3. Only builds our extension (not entire VS Code) - 10x faster

**Next Steps**
- Week 3-4: Hot reload refinement, debugging setup
- Week 5-10: Build the infinite canvas (pan/zoom/rendering)
