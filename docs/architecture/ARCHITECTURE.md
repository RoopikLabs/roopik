# 🎨 Roopik IDE - Complete Architecture & Requirements

## 🌟 Core Concept

**Roopik is NOT a traditional canvas editor like Figma.** It's an AI-native IDE where the infinite canvas serves as a **gallery of live, interactive sandboxed environments**.

---

## 🏗️ Architecture Overview

### **Infinite Canvas = Gallery of Live Sandboxes**

```
Infinite Canvas (React Pan/Zoom Layer)
│
├── Sandbox 1 (iframe) - Login Screen Variation A
│   ├── Full React/HTML/CSS environment
│   ├── Live, interactive preview
│   └── Isolated execution context
│
├── Sandbox 2 (iframe) - Login Screen Variation B
│   ├── Full React/HTML/CSS environment
│   ├── Live, interactive preview
│   └── Isolated execution context
│
├── Sandbox 3 (iframe) - Button Component Variation A
│   └── ...
│
└── ... (potentially 100+ sandboxes)
```

---

## 📦 What is a "Sandbox"?

Each sandbox on the infinite canvas is:

1. **An isolated iframe** running a complete web environment
2. **A single component OR entire screen** (button, form, login page, dashboard, etc.)
3. **Fully interactive** - users can click buttons, type in inputs, see hover effects, etc.
4. **Live compiled code** - changes reflect in real-time
5. **Independent** - runs separately from other sandboxes

### **NOT:**
- ❌ Individual UI elements (buttons, inputs) placed directly on canvas
- ❌ Static design mockups
- ❌ Figma-style drag-and-drop components

---

## 🎯 User Workflow

### **1. AI Generation (Primary Flow)**

**User Request:**
> "Build me a login screen with email/password fields, modern design, show me 6 variations"

**System Response:**
- AI generates 6 COMPLETE login screen implementations
- Each variation has different:
  - Layout structure
  - Color schemes
  - Button styles
  - Typography
  - Spacing
- All 6 appear as separate sandboxes on the infinite canvas
- User can pan around to see all variations side-by-side

---

### **2. Selection & Focus**

**When user selects a specific sandbox:**
- That sandbox becomes the "active" one
- Displayed prominently (centered, highlighted border)
- Only the selected sandbox runs at full performance
- Off-screen sandboxes are paused/frozen

---

### **3. Editing - Two Approaches**

#### **Approach A: AI-Assisted Editing**

**Scenario:** User wants to change button color from red to blue in Variation 3

**Flow:**
1. User selects Sandbox 3 (Login Screen Variation C)
2. User opens chat interface (sidebar/bottom panel)
3. User types: "Change the login button color from red to blue"
4. **System sends ONLY Variation 3's code** as context to AI (not all 6 variations)
5. AI modifies the code
6. Sandbox 3 recompiles and updates live
7. User sees the change immediately

**Context Management (CRITICAL):**
- Track which sandbox is currently selected
- Send ONLY that sandbox's code to AI
- Include metadata: component type, current state, dependencies
- AI returns updated code for THAT specific sandbox only

---

#### **Approach B: Direct Manipulation (Manual Editing)**

**Scenario:** User wants to adjust button size manually

**Flow:**
1. User selects Sandbox 3
2. User clicks on the button inside the sandbox
3. **Properties panel appears** (right sidebar or bottom bar) showing:
   - Width: 200px
   - Height: 48px
   - Background: #FF0000
   - Border Radius: 8px
   - Font Size: 16px
   - Padding: 12px 24px
4. User drags slider or inputs new value: Width → 250px
5. **Code updates in real-time**
6. **Sandbox re-renders immediately** with new width

**Component Selection Inside Sandbox:**
- User can click individual elements inside the iframe
- System detects which component was clicked (button, input, div, etc.)
- Properties panel populates with that component's editable properties
- Changes update the underlying code directly

---

## 🧪 Error Handling

### **Browser Native Errors**

**Question:** Do we need to build custom error overlays?

**Answer:** NO - browsers provide this automatically!

When code has errors:
- **Browser's built-in error handling** shows in the iframe
- Console errors appear naturally
- Red error screens (like React error boundaries) work out-of-box
- We just need to ensure iframes have proper error boundaries

**Our Responsibility:**
- Render the code we receive (from AI or user edits)
- Compile it properly (using esbuild/Vite)
- Display it in the sandbox iframe
- Browser handles the rest!

---

## ⚡ Performance Strategy

### **Viewport-Based Rendering**

**Only render what's visible:**

1. **Visible sandboxes** (in viewport):
   - Fully mounted and running
   - Interactive
   - Real-time updates

2. **Selected sandbox** (focused):
   - Always runs at full performance
   - Even if off-screen
   - Priority rendering

3. **Off-screen sandboxes**:
   - Frozen/paused
   - Not executing JavaScript
   - Rendered as static thumbnails OR completely unmounted
   - Wake up when scrolled into view

**Why:**
- Running 100 React apps simultaneously = performance disaster
- Only 3-5 sandboxes visible at once
- Massive performance savings

---

## 🎨 Infinite Canvas Capabilities

**Users can:**
- ✅ Pan around to explore all variations
- ✅ Zoom in/out (with scale limits: 0.1x - 10x)
- ✅ Click on any sandbox to select/focus it
- ✅ Compare variations side-by-side
- ✅ Drag sandboxes to rearrange (future feature)
- ✅ Delete variations they don't like
- ✅ Duplicate a variation to create a new one

---

## 🔄 Real-Time Compilation Pipeline

### **Code → Preview Flow**

```
User/AI Code Changes
        ↓
   Code Editor
        ↓
   Bundler (esbuild/Vite)
   - Compiles React/JS/CSS
   - Bundles dependencies
   - Hot Module Replacement
        ↓
   Iframe Sandbox
   - Receives bundled code
   - Executes in isolation
   - Renders component
        ↓
   Live Preview
   (User sees changes instantly)
```

**Technology Stack:**
- **Bundler:** esbuild or Vite (for speed)
- **Preview:** iframe sandboxes
- **HMR:** Hot Module Replacement for instant updates
- **Isolation:** Each iframe has its own execution context

---

## 🏛️ Sandbox File System Architecture (HYBRID APPROACH)

### **The Decision: Option C - Hybrid Model**

We're using a **hybrid architecture** that combines the flexibility of full file systems with the simplicity of bundled output.

### **Storage Layer (What We Save)**

```typescript
interface Sandbox {
  id: string;                    // "sandbox_123"
  name: string;                  // "Login Screen - Variation A"

  // Full file system storage
  files: {
    [path: string]: string;      // File path → File content
  };

  // Examples:
  // "src/components/Button.tsx": "export const Button = () => { ... }"
  // "src/components/Input.tsx": "export const Input = () => { ... }"
  // "src/App.tsx": "import { Button } from './components/Button'; ..."
  // "src/styles.css": ".button { background: blue; }"
  // "package.json": "{ \"dependencies\": { \"react\": \"^18.0.0\" } }"

  entryPoint: string;            // "src/App.tsx" or "index.html"

  // Compiled output (cached after bundling)
  compiled?: {
    html: string;                // Single bundled HTML
    css: string;                 // Single bundled CSS
    js: string;                  // Single bundled JS (all imports resolved)
    errors?: string[];           // Compilation errors if any
  };

  position: { x: number; y: number; };  // Canvas position
  size: { width: number; height: number; };
  isSelected: boolean;           // Currently focused?
  isVisible: boolean;            // In viewport?
  createdAt: number;
  updatedAt: number;
}

interface CanvasState {
  id: string;                    // Canvas ID
  name: string;                  // "Login Flow Design"
  sandboxes: Sandbox[];          // Array of all sandboxes
  selectedSandboxId: string | null;  // Currently focused sandbox
  viewport: {
    x: number;
    y: number;
    scale: number;
  };
}
```

### **Why Hybrid Approach?**

✅ **Handles Complex Projects:** Multi-file React apps, npm packages, nested folders
✅ **Simple Preview:** Iframe only receives 3 bundled files (HTML/CSS/JS)
✅ **AI-Friendly:** Clear file paths for tool calling
✅ **Version Control:** Git tracks individual file changes
✅ **Performance:** esbuild/Vite optimizes output
✅ **Scalable:** Works for both simple and complex projects

### **File Storage Format**

Files are stored as strings with preserved indentation:

```typescript
files: {
  "src/Button.tsx": `import React from 'react';

export const Button = ({ children }: { children: string }) => {
  return (
    <button className="btn">
      {children}
    </button>
  );
};`,

  "src/styles.css": `.btn {
  padding: 12px 24px;
  background: #3B82F6;
  color: white;
  border-radius: 8px;
}`
}
```

When rendered in Monaco editor or saved to disk, indentation is perfectly preserved.

---

## 🔄 Compilation Pipeline

### **How Files Become Previews**

```
┌─────────────────────────────────────────┐
│  AI Generates Multiple Files            │
│  - src/App.tsx                           │
│  - src/components/Button.tsx             │
│  - src/styles.css                        │
│  - package.json                          │
└─────────────────┬───────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│  Storage Layer (Sandbox.files)          │
│  {                                       │
│    "src/App.tsx": "...",                 │
│    "src/components/Button.tsx": "...",   │
│    "src/styles.css": "..."               │
│  }                                       │
└─────────────────┬───────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│  Bundler (esbuild/Vite)                 │
│  - Resolves imports                      │
│  - Bundles dependencies                  │
│  - Optimizes output                      │
│  - Hot Module Replacement                │
└─────────────────┬───────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│  Compiled Output (Sandbox.compiled)     │
│  {                                       │
│    html: "<html>...</html>",             │
│    css: ".btn { ... }",                  │
│    js: "bundled code..."                 │
│  }                                       │
└─────────────────┬───────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│  Iframe Sandbox                          │
│  Receives only 3 files:                  │
│  - index.html (with inline CSS/JS)       │
│  - Live, interactive preview             │
└─────────────────────────────────────────┘
```

### **Sandboxing Technology**

- **WebView2** (Electron's Chromium) for iframe isolation
- **NOT WebContainers** - we run esbuild/Vite on Node.js side (extension)
- Simpler, faster, and we already have the infrastructure

---

## 🤖 AI Context Management (CRITICAL)

### **The Problem:**
If user has 6 variations and selects Variation 3 to edit, AI must know:
- Which variation is being edited
- Current code state of THAT variation only (not all files!)
- NOT the other 5 variations

### **The Solution: Smart Context with Tool Calling**

**When user asks AI to make changes:**
```typescript
function sendToAI(userPrompt: string) {
  const selectedSandbox = canvasState.sandboxes.find(
    s => s.id === canvasState.selectedSandboxId
  );

  // Build smart context (NOT all files!)
  const context = {
    sandboxId: selectedSandbox.id,
    sandboxName: selectedSandbox.name,

    // File tree structure (NO content)
    fileTree: Object.keys(selectedSandbox.files),
    // Example: ["src/App.tsx", "src/components/Button.tsx", "src/styles.css"]

    // ONLY send currently open/visible files
    activeFiles: {
      [currentlyOpenFile]: selectedSandbox.files[currentlyOpenFile]
    },

    // Entry point info
    entryPoint: selectedSandbox.entryPoint,

    // Available tools AI can use
    availableTools: [
      'readFile',      // AI can request additional files
      'editFile',      // Edit specific file with search/replace
      'createFile',    // Create new file
      'deleteFile',    // Delete file
      'listFiles'      // Get file tree
    ],

    userPrompt: userPrompt
  };

  // Send ONLY this context to AI
  ai.chat(context);
}
```

### **Why NOT Send All Files?**

❌ **Large projects** = 100+ files = exceeds context limits
❌ **Inefficient** - wastes tokens on irrelevant code
❌ **Context pollution** - AI gets confused with too much info

✅ **Instead:** AI sees file tree + currently open file(s), then requests more via tools

### **AI Tool Calling Examples**

#### **Tool 1: Read File**
```typescript
{
  "tool": "readFile",
  "sandboxId": "sandbox_123",
  "filePath": "src/components/Button.tsx"
}
```

#### **Tool 2: Edit File (Search & Replace)**
```typescript
{
  "tool": "editFile",
  "sandboxId": "sandbox_123",
  "filePath": "src/components/Button.tsx",
  "operation": "search_replace",
  "search": "backgroundColor: '#FF0000'",
  "replace": "backgroundColor: '#3B82F6'"
}
```

#### **Tool 3: Multi-File Edit**
```typescript
{
  "tool": "editFiles",
  "sandboxId": "sandbox_123",
  "changes": [
    {
      "filePath": "src/components/Button.tsx",
      "operation": "search_replace",
      "search": "...",
      "replace": "..."
    },
    {
      "filePath": "src/styles.css",
      "operation": "append",
      "content": ".button-primary { background: blue; }"
    }
  ]
}
```

#### **Tool 4: Create File**
```typescript
{
  "tool": "createFile",
  "sandboxId": "sandbox_123",
  "filePath": "src/components/Input.tsx",
  "content": "export const Input = () => { return <input />; };"
}
```

### **Tool Calling Best Practices**

We follow industry standards from Cursor, Bolt.new, and CodeSandbox:

1. **Search/Replace** - No line numbers (fragile), use distinct code blocks
2. **Patch Format** - Diff-style edits (OpenAI cookbook, April 2025)
3. **File Paths** - Always absolute from project root
4. **Batch Operations** - Multiple edits in single tool call for efficiency
5. **Context Window Management** - Request files on-demand, not upfront

### **AI Response Format**
```typescript
interface AIResponse {
  sandboxId: string;             // Which sandbox was modified
  toolCalls: ToolCall[];         // All tools used
  filesChanged: string[];        // List of modified file paths
  summary: string;               // "Changed button color to blue"
  needsRecompile: boolean;       // Trigger bundler if true
}
```

---

## 📊 Reference Examples (Similar Apps)

### **Fiddle.com** ✅
- Multi-variation preview
- Side-by-side comparison
- Live editing
- **Closest to Roopik's vision**

### **CodeSandbox** ✅
- Live iframe previews
- Real-time compilation
- Isolated execution

### **StackBlitz** ✅
- WebContainer technology
- In-browser Node.js
- Instant dev environments

### **Storybook** ✅
- Component variations
- Different states/props
- Interactive previews

### **Builder.io** ✅ (partial)
- Visual editing
- Component properties panel
- Live preview
- **Note:** More drag-and-drop focused than Roopik

---

## 🎛️ Properties Panel (Direct Manipulation UI)

### **When user selects a component inside a sandbox:**

**Example: Button Selected**

```
┌─────────────────────────┐
│   BUTTON PROPERTIES     │
├─────────────────────────┤
│ Width:      [200px] ▼   │
│ Height:     [48px]  ▼   │
│ Background: [#FF0000] 🎨 │
│ Color:      [#FFFFFF] 🎨 │
│ Font Size:  [16px]  ▼   │
│ Padding:    [12px 24px] │
│ Border Radius: [8px] ▼   │
│ Text:       [Login]     │
└─────────────────────────┘
```

**Features:**
- ✅ Dropdowns for predefined values
- ✅ Color pickers
- ✅ Sliders for numbers
- ✅ Text inputs
- ✅ Live preview as user types
- ✅ Updates underlying code automatically

---

## 🚀 Initial Implementation Plan

### **Phase 1: Foundation** (Week 1-2)
- [x] Infinite canvas with pan/zoom ✅
- [ ] Single sandbox rendering (hardcoded HTML)
- [ ] Iframe isolation setup
- [ ] Basic bundler integration (esbuild)

### **Phase 2: Multiple Sandboxes** (Week 3-4)
- [ ] Render multiple sandboxes on canvas
- [ ] Sandbox selection/focus system
- [ ] Viewport-based rendering (show/hide)
- [ ] Performance optimization

### **Phase 3: Live Editing** (Week 5-6)
- [ ] Properties panel UI
- [ ] Component detection inside iframe
- [ ] Real-time code updates
- [ ] HMR (Hot Module Replacement)

### **Phase 4: AI Integration** (Week 7-8)
- [ ] Context management system
- [ ] AI chat interface
- [ ] Code generation from prompts
- [ ] Variation creation

### **Phase 5: Polish** (Week 9-10)
- [ ] Error handling
- [ ] Code editor (Monaco)
- [ ] Export functionality
- [ ] User testing

---

## 🎯 Success Criteria

**Roopik is successful when:**

1. ✅ User can ask AI: "Build a login form with 6 variations"
2. ✅ All 6 variations appear as live, interactive sandboxes
3. ✅ User can pan around and click into any variation
4. ✅ User can select a button inside a sandbox and change its color via properties panel
5. ✅ User can ask AI: "Make the button bigger" and it updates ONLY the selected variation
6. ✅ 100+ sandboxes can exist on canvas without performance issues
7. ✅ Code errors show naturally in the browser (no custom error UI needed)
8. ✅ Changes compile and render in <1 second

---

## 🔑 Key Differentiators

**Roopik vs Figma:**
- Figma = Static design mockups
- Roopik = Live, functional code that actually works

**Roopik vs CodeSandbox:**
- CodeSandbox = Single environment
- Roopik = Dozens of variations side-by-side

**Roopik vs Builder.io:**
- Builder.io = Drag-and-drop page builder
- Roopik = AI-generated code with infinite variations

**Roopik vs Fiddle:**
- Fiddle = Component playground
- Roopik = Full IDE with AI assistance + infinite canvas exploration

---

## 💡 Critical Technical Decisions

### **1. Bundler Choice**
- **esbuild** (fast, simple) vs **Vite** (feature-rich, HMR built-in)
- **Recommendation:** Start with esbuild, migrate to Vite if needed

### **2. Iframe Communication**
- Use `postMessage` API for parent ↔ iframe communication
- Pass code updates, user interactions, component selections

### **3. Code Storage**
- Each sandbox stores code as: `{ files: { [path]: string }, entryPoint: string }`
- Full file system with multiple files per sandbox
- Compiled output cached separately
- Version history for undo/redo
- Save to `.roopik/canvases/<canvasId>/sandboxes/<sandboxId>/`
  - `files.json` - All source files
  - `compiled.json` - Cached bundled output (HTML/CSS/JS)
  - `metadata.json` - Position, size, timestamps

### **4. Component Detection**
- Use AST parsing (Babel) to detect components in code
- Map DOM elements to code structure
- Enable click-to-select inside iframe

---

## ⚠️ IMPORTANT NOTE

**These are initial architectural discussions and decisions based on our current understanding.**

This document represents our **starting point**, not absolute truth. As we:
- Build the actual implementation
- Discover new requirements
- Encounter real-world constraints
- Learn from user feedback
- Find better approaches

**We will iterate and improve this architecture.**

The core principles (hybrid file system, smart AI context, tool calling, viewport-based rendering) are solid, but specific implementations, data structures, and technical choices may evolve.

**Don't treat this as unchangeable law - treat it as a living document that grows with the project.**

---

**Last Updated:** November 16, 2025
**Document Version:** 2.0
**Status:** Hybrid Architecture Defined ✅
