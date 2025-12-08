# RoopikAgent: Visual Context & Editing Strategy

**Date**: December 7, 2025
**Status**: Architectural Decision Record
**Context**: Refinement of the "Hybrid Engine" and "Multi-Modal" capabilities.

---

## 1. Core Philosophy: "The Brain, The Eye, The Hands"

To build a truly "Designer-First" AI agent, we are moving away from a generic "Chatbot" model to a specialized biological analogy:

*   **🧠 The Brain (IRoopikAgentService)**: The central orchestrator. It plans, reasons, and delegates tasks. It resides in the VS Code Core (`src/vs/workbench/contrib/roopikAgent`).
*   **👁️ The Eye (IVisualContextService)**: The differentiator. It doesn't just "read code"; it "sees" the rendered application. It bridges the gap between a pixel on the screen and the AST node in the code.
*   **✋ The Hands (IToolRegistry)**: The execution layer. It performs precise actions—editing code, running commands, or manipulating the browser—using specialized strategies for speed and safety.


```
src/vs/workbench/contrib/roopikAgent/
├── common/
│   ├── IRoopikAgentService.ts      // The Brain
│   ├── IVisualContextService.ts    // The Eye (Bridges DOM -> Code)
│   └── IToolRegistry.ts            // The Hands
├── browser/
│   ├── roopikAgentService.ts       // Implementation
│   ├── visualContextService.ts     // Handles the "Click-to-Source" logic
│   └── tools/
│       ├── standard/ (grep, read_file)
│       └── roopik/   (updatePreview, highlightComponent, getComputedStyles)
```
---

## 2. The "Hands": Hybrid Editing Strategy

We will employ a dual-track editing strategy to balance **speed** (for tweaks) with **safety** (for refactors).

### 🚀 The Fast Path ("Review Mode" / "Shadow Mode")
*Used for: UI tweaks, single-component iterations, style changes.*

**The Problem**: Traditional agents save to disk -> trigger file watcher -> rebuild -> reload. This is slow (5-10s) and risky (broken code on disk).

**The Solution**:
1.  **Dirty Buffer Edits**: The Agent applies changes to the VS Code **TextBuffer** (in-memory) but does *not* save to disk.
    *   *User Experience*: The file tab shows a dirty dot (●). The user can `Ctrl+Z` instantly to undo the agent's work.
2.  **Hot Injection**:
    *   **Mode 1 (Component)**: We `postMessage` the new code directly to the iframe's transpiler. Render is near-instant (<50ms).
    *   **Mode 2 (Project)**: We use a custom Vite middleware to inject the dirty buffer content into the Vite server's memory, triggering HMR (Hot Module Replacement) without touching the file system.
3.  **Commit**: Changes are only written to disk when the user clicks "Accept".

### 🐢 The Slow Path ("Refactor Mode")
*Used for: "Create a new page", "Refactor authentication", multi-file architectural changes.*

**The Solution**:
1.  **Git Worktree**: The Agent spins up a temporary, parallel git worktree.
2.  **Isolation**: It installs dependencies and runs tests in this isolated environment.
3.  **Merge**: Once validated, the changes are merged back into the main workspace.

---

## 3. The "Eye": True Visual Context via CDP

The "Holy Grail" of UI agents is knowing *exactly* which CSS rules affect a specific element, regardless of where they are defined (global CSS, CSS Modules, Tailwind, inline styles).

**The Problem**: `window.getComputedStyle()` is insufficient. It returns the *result* (e.g., `color: red`), not the *source* (e.g., `styles.css:42`).

**The Solution**: Direct integration with the **Chrome DevTools Protocol (CDP)**.

### The Workflow: `getComponentStyles(nodeId)`

1.  **Identify**: The user clicks an element in the Roopik Preview (Mode 1 or 2). We capture the internal `nodeId`.
2.  **Query CDP**: The Agent calls the CDP command `CSS.getMatchedStylesForNode(nodeId)`.
3.  **Analyze**: This returns a rich data structure:
    *   `matchedCSSRules`: A list of every active rule that applies to this element.
	*   `rule.origin`: Is it "user-agent" (browser default), "regular" (your code), or "inspector" (temp)?.
    *   `rule.selectorList`: The exact specific selector (e.g., `.btn-primary:hover` or `.btn-primary.active`).
    *   `rule.style.styleSheetId`: ID of the source stylesheet.
    *   `rule.style.range`: **Exact line and column numbers** in the source file.

### The "Reverse Source Map" Result
Instead of feeding the LLM 50 CSS files, we feed it a precise "Style Trace":

```json
// Context provided to Agent for "Change the button color"
{
  "element": "button#submit",
  "computed": { "backgroundColor": "blue" },
  "sources": [
    {
      "origin": "user-agent",
      "description": "Browser Default"
    },
    {
      "file": "src/global/theme.css",
      "lines": "10-15",
      "selector": "button",
      "content": "border: none; padding: 1rem;"
    },
    {
      "file": "src/components/LoginForm.module.css",
      "lines": "45-48",
      "selector": ".submitBtn",
      "content": "background-color: var(--primary-blue);"
    }
  ]
}
```
How to map it to files?
The CDP also gives you a header with styleSheetId -> sourceURL.

Scenario: You have a global styles.css and a local Button.module.css.
Agent Action: getComponentStyles(buttonId)

```
[
  {
    "file": "src/global/styles.css",
    "selector": "button",
    "properties": "border: none; padding: 10px;",
    "lines": "10-12"
  },
  {
    "file": "src/components/Button.module.css",
    "selector": ".submit-btn",
    "properties": "background-color: blue;",
    "lines": "5-7"
  }
]
```
This is the "Rich Context" you promised. Instead of dumping all CSS files into the context window, you only give the Agent the exact 15 lines of CSS that matter for that specific button.

### Implementation Note
Since Roopik Core runs on Electron, we can access the CDP session of the `WebContents` hosting the preview iframe. This allows us to query this data without injecting heavy scripts into the user's application.
