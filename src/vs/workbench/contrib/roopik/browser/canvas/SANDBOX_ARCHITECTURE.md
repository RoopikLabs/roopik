# Sandbox Architecture & Live Editing Design

This document captures the architectural decisions and design patterns for the Roopik Canvas sandbox system, including live editing, hot reload, and AI integration.

> **⚠️ Design Principle: Framework-Agnostic**
>
> Roopik is NOT a React-only IDE. It supports **any frontend technology**:
> - Plain HTML/JS/CSS
> - React (JSX)
> - Vue (SFC)
> - Svelte
> - Angular
> - Lit, Preact, Solid, and more...
>
> All architecture decisions must be framework-agnostic and extensible.

---

## Table of Contents

1. [Framework-Agnostic Design](#framework-agnostic-design)
2. [Core Concept: Session Code as Source of Truth](#core-concept-session-code-as-source-of-truth)
3. [Sandbox Communication Architecture](#sandbox-communication-architecture)
4. [Two Types of Live Changes](#two-types-of-live-changes)
5. [Fullscreen Mode Design](#fullscreen-mode-design)
6. [Hot Reload Strategy](#hot-reload-strategy)
7. [Properties Panel Integration](#properties-panel-integration)
8. [AI Chat Integration](#ai-chat-integration)
9. [View Modes](#view-modes)
10. [Implementation Roadmap](#implementation-roadmap)

---

## Framework-Agnostic Design

### Core Philosophy

The sandbox system is designed to be **completely framework-agnostic**. We use **CDN injection** instead of bundled dependencies to:

1. **Avoid version conflicts** - Each sandbox can use different library versions
2. **Support any framework** - Just change the CDN URLs
3. **Simplify architecture** - No need for bundler per sandbox
4. **Future-proof** - New frameworks can be added without core changes

### Supported Frameworks

| Framework | CDN URLs | Transpilation |
|-----------|----------|---------------|
| **Vanilla JS/HTML** | None required | None |
| **React** | react.js, react-dom.js | Babel (JSX → JS) |
| **Vue 3** | vue.global.js | Vue compiler (SFC → JS) |
| **Svelte** | svelte.js | Svelte compiler (future) |
| **Preact** | preact.js | Babel (JSX → JS) |
| **Lit** | lit.js | None (uses tagged templates) |
| **Alpine.js** | alpine.js | None (uses attributes) |

### Sandbox Data Model (Framework-Aware)

```typescript
interface Sandbox {
  id: string;
  componentId: string;
  x, y: number;
  width, height: number;
  zIndex: number;
  state: SandboxState;

  // ⭐ SOURCE OF TRUTH - Framework-agnostic
  sessionCode: string;

  // ⭐ CDN INJECTION - Framework-specific dependencies
  cdnUrls: string[];

  // ⭐ FRAMEWORK HINT - Helps with transpilation and rendering
  framework?: FrameworkType;

  errorMessage?: string;
}

type FrameworkType =
  | 'vanilla'    // Plain HTML/JS/CSS
  | 'react'      // React with JSX
  | 'vue'        // Vue 3 SFC or Options API
  | 'svelte'     // Svelte components
  | 'preact'     // Preact (React-like)
  | 'lit'        // Lit web components
  | 'alpine'     // Alpine.js
  | 'angular';   // Angular (future)
```

### CDN URLs by Framework

```typescript
const FRAMEWORK_CDNS: Record<FrameworkType, string[]> = {
  vanilla: [],  // No external dependencies

  react: [
    'https://unpkg.com/react@18/umd/react.production.min.js',
    'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js'
  ],

  vue: [
    'https://unpkg.com/vue@3/dist/vue.global.prod.js'
  ],

  preact: [
    'https://unpkg.com/preact@10/dist/preact.umd.js',
    'https://unpkg.com/preact@10/hooks/dist/hooks.umd.js'
  ],

  lit: [
    'https://unpkg.com/lit@2/lit-all.min.js'
  ],

  alpine: [
    'https://unpkg.com/alpinejs@3/dist/cdn.min.js'
  ],

  svelte: [], // Requires compile step, handled differently

  angular: [] // Requires full build, Project Mode only
};
```

### Transpilation Layer (Framework-Specific)

The **only** framework-specific part is the transpilation/rendering logic in the webview:

```javascript
// In webview sandbox
function renderComponent(code, framework) {
  switch (framework) {
    case 'vanilla':
      // Direct HTML injection - no transpilation
      root.innerHTML = code;
      break;

    case 'react':
    case 'preact':
      // Babel transform for JSX
      const transpiled = Babel.transform(code, {
        presets: ['react']
      }).code;
      // ... render with React/Preact
      break;

    case 'vue':
      // Vue template compilation
      const { createApp } = Vue;
      const App = { template: code };
      createApp(App).mount(root);
      break;

    case 'lit':
      // Tagged template literals - no transform needed
      eval(code);
      break;

    case 'alpine':
      // Alpine uses attributes - just set HTML
      root.innerHTML = code;
      Alpine.initTree(root);
      break;
  }
}
```

### Example: Same Button, Different Frameworks

**Vanilla HTML/JS:**
```html
<button class="btn" onclick="alert('Clicked!')">
  Click me
</button>
<style>
  .btn { background: #3b82f6; color: white; padding: 12px 24px; }
</style>
```

**React (JSX):**
```jsx
export default function Button() {
  return (
    <button
      className="btn"
      onClick={() => alert('Clicked!')}
      style={{ background: '#3b82f6', color: 'white', padding: '12px 24px' }}
    >
      Click me
    </button>
  );
}
```

**Vue 3:**
```vue
<template>
  <button class="btn" @click="handleClick">
    Click me
  </button>
</template>

<script setup>
const handleClick = () => alert('Clicked!');
</script>

<style>
.btn { background: #3b82f6; color: white; padding: 12px 24px; }
</style>
```

**Lit:**
```javascript
import { LitElement, html, css } from 'lit';

class MyButton extends LitElement {
  static styles = css`
    button { background: #3b82f6; color: white; padding: 12px 24px; }
  `;

  render() {
    return html`<button @click=${() => alert('Clicked!')}>Click me</button>`;
  }
}
customElements.define('my-button', MyButton);
```

### Framework Detection

The system can auto-detect framework from code patterns:

```typescript
function detectFramework(code: string): FrameworkType {
  // React/Preact - JSX syntax
  if (code.includes('import React') || code.includes('useState') ||
      /<\w+[\s>]/.test(code) && code.includes('export default')) {
    return 'react';
  }

  // Vue - <template> or Vue.createApp
  if (code.includes('<template>') || code.includes('createApp')) {
    return 'vue';
  }

  // Lit - LitElement or html``
  if (code.includes('LitElement') || code.includes('html`')) {
    return 'lit';
  }

  // Alpine - x-data attributes
  if (code.includes('x-data') || code.includes('x-on:')) {
    return 'alpine';
  }

  // Svelte - <script> with $: reactive
  if (code.includes('$:') && code.includes('<script>')) {
    return 'svelte';
  }

  // Default: treat as vanilla HTML/JS
  return 'vanilla';
}
```

### Extensibility for Future Frameworks

Adding a new framework requires:

1. **Add CDN URLs** to `FRAMEWORK_CDNS`
2. **Add transpilation case** in `renderComponent()`
3. **Add detection pattern** in `detectFramework()`
4. **Update TypeScript type** `FrameworkType`

No core architecture changes needed!

---

## Core Concept: Session Code as Source of Truth

The `sandbox.sessionCode` is the **single source of truth** for each component. All changes (manual, AI, or property panel) ultimately modify this code.

```
┌─────────────────────────────────────────────────────────────┐
│                    Sandbox Data Model                        │
├─────────────────────────────────────────────────────────────┤
│  interface Sandbox {                                         │
│    id: string;                                               │
│    componentId: string;                                      │
│    x, y: number;              // Position on canvas          │
│    width, height: number;     // Size                        │
│    zIndex: number;            // Layer order                 │
│    state: SandboxState;       // loading | ready | error     │
│                                                              │
│    sessionCode: string;       // ⭐ SOURCE OF TRUTH          │
│    cdnUrls: string[];         // External dependencies       │
│    errorMessage?: string;     // Last error if any           │
│  }                                                           │
└─────────────────────────────────────────────────────────────┘
```

### Why Session Code?

| Approach | Description | Pros | Cons |
|----------|-------------|------|------|
| **File-based** | Read from disk each time | Always fresh | Slow, needs file watcher |
| **Session Code** ⭐ | In-memory, synced to file | Fast, instant updates | Must sync to disk |
| **Derived State** | Transform on render | Pure | Slow, no caching |

**Decision**: Session Code provides the best balance of speed and simplicity for live editing.

---

## Sandbox Communication Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Canvas Editor (Host)                           │
│                                                                          │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────────┐ │
│  │ Properties     │  │ AI Chat        │  │ Code Editor (Monaco)       │ │
│  │ Panel          │  │                │  │                            │ │
│  └───────┬────────┘  └───────┬────────┘  └─────────────┬──────────────┘ │
│          │                   │                         │                 │
│          │ updateStyle       │ updateCode              │ updateCode      │
│          │ (CSS only)        │ (full code)             │ (full code)     │
│          │                   │                         │                 │
│          ▼                   ▼                         ▼                 │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                    Fullscreen Controller                          │  │
│  │                                                                   │  │
│  │   ┌─────────────────────────────────────────────────────────┐    │  │
│  │   │         sandbox.sessionCode (Source of Truth)           │    │  │
│  │   │                                                         │    │  │
│  │   │  // User's React component code                         │    │  │
│  │   │  export default function Button() {                     │    │  │
│  │   │    return <button className="btn">Click me</button>     │    │  │
│  │   │  }                                                      │    │  │
│  │   └─────────────────────────────────────────────────────────┘    │  │
│  │                              │                                    │  │
│  │              ┌───────────────┴───────────────┐                   │  │
│  │              │                               │                   │  │
│  │              ▼                               ▼                   │  │
│  │     ┌─────────────────┐            ┌─────────────────┐          │  │
│  │     │  updateStyle    │            │   updateCode    │          │  │
│  │     │  (Fast Path)    │            │   (Full Path)   │          │  │
│  │     │                 │            │                 │          │  │
│  │     │ • CSS injection │            │ • Update code   │          │  │
│  │     │ • No re-render  │            │ • Re-transpile  │          │  │
│  │     │ • Keeps state   │            │ • Re-render     │          │  │
│  │     │ • ~1ms          │            │ • ~50-100ms     │          │  │
│  │     └────────┬────────┘            └────────┬────────┘          │  │
│  │              │                               │                   │  │
│  │              └───────────────┬───────────────┘                   │  │
│  │                              │                                    │  │
│  │                              ▼                                    │  │
│  │                    postMessage to Webview                         │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                  │                                       │
└──────────────────────────────────┼───────────────────────────────────────┘
                                   │
                                   ▼
                    ┌─────────────────────────────┐
                    │       Webview Sandbox       │
                    │                             │
                    │  ┌───────────────────────┐  │
                    │  │ Message Handler       │  │
                    │  │                       │  │
                    │  │ • 'init' → full load  │  │
                    │  │ • 'update' → re-render│  │
                    │  │ • 'updateStyle' → CSS │  │
                    │  │ • 'inspectElement'    │  │
                    │  │ • 'highlightElement'  │  │
                    │  └───────────────────────┘  │
                    │              │              │
                    │              ▼              │
                    │  ┌───────────────────────┐  │
                    │  │ Babel Transpiler      │  │
                    │  │ (in-browser)          │  │
                    │  └───────────────────────┘  │
                    │              │              │
                    │              ▼              │
                    │  ┌───────────────────────┐  │
                    │  │ React Component       │  │
                    │  │ (rendered)            │  │
                    │  └───────────────────────┘  │
                    │                             │
                    └─────────────────────────────┘
```

---

## Two Types of Live Changes

### Type 1: Style Updates (Fast Path)

For visual-only changes that don't affect component logic.

```typescript
// Host sends style update
webview.postMessage({
    type: 'updateStyle',
    selector: '.btn-primary',
    styles: {
        backgroundColor: '#ff0000',
        borderRadius: '8px',
        padding: '12px 24px'
    }
});
```

```javascript
// Webview handles it (no re-render!)
window.addEventListener('message', (event) => {
    if (event.data.type === 'updateStyle') {
        const el = document.querySelector(event.data.selector);
        if (el) {
            Object.assign(el.style, event.data.styles);
            // Component state preserved!
            vscode.postMessage({ type: 'styleUpdated' });
        }
    }
});
```

**Characteristics:**
- ⚡ ~1ms latency
- ✅ Preserves React component state
- ✅ No flicker
- ⚠️ Only works for CSS properties
- ⚠️ Changes not reflected in sessionCode (temporary)

**Use Cases:**
- Properties panel slider adjustments
- Color picker changes
- Live preview while dragging

### Type 2: Code Updates (Full Path)

For structural changes that require re-rendering.

```typescript
// Host sends code update
sandbox.sessionCode = newCode;  // Update source of truth
webview.postMessage({
    type: 'update',
    code: sandbox.sessionCode
});
```

```javascript
// Webview re-transpiles and re-renders
window.addEventListener('message', (event) => {
    if (event.data.type === 'update') {
        // Full re-render pipeline
        const transpiled = Babel.transform(event.data.code, {
            presets: ['react']
        }).code;

        const Component = new Function('React', 'ReactDOM',
            transpiled + '\nreturn Component;'
        )(React, ReactDOM);

        ReactDOM.createRoot(root).render(
            React.createElement(Component)
        );
    }
});
```

**Characteristics:**
- ⏱️ ~50-100ms latency
- ❌ Loses React component state
- ⚠️ Brief flicker possible
- ✅ Works for any change
- ✅ sessionCode stays in sync

**Use Cases:**
- AI code modifications
- Manual code editing
- Structural changes (add/remove elements)
- Prop changes

---

## Fullscreen Mode Design

### Two Levels of Fullscreen

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│  Level 1: Editor Fullscreen (Default)                                   │
│  ─────────────────────────────────────                                  │
│  • Fills the editor pane area                                           │
│  • Activity bar, sidebar still accessible                               │
│  • Command palette works (Ctrl+Shift+P)                                 │
│  • Best for normal editing workflow                                      │
│                                                                          │
│  ┌──────┬───────────────────────────────────────────────────────────┐   │
│  │      │  ┌─────────────────────────────────────────────────────┐  │   │
│  │  A   │  │ [Component] [Auto][Desktop][Tablet][Mobile] [⛶]    │  │   │
│  │  c   │  ├─────────────────────────────────────────────────────┤  │   │
│  │  t   │  │                                                     │  │   │
│  │  i   │  │              Component Preview                      │  │   │
│  │  v   │  │                                                     │  │   │
│  │  i   │  ├─────────────────────────────────────────────────────┤  │   │
│  │  t   │  │ [Select][Inspect] │ [AI ✨        ] │ [Prev][Code] │  │   │
│  │  y   │  └─────────────────────────────────────────────────────┘  │   │
│  │      │                                                            │   │
│  │  B   │                                                            │   │
│  │  a   │                                                            │   │
│  │  r   │                                                            │   │
│  └──────┴───────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│  Level 2: True Fullscreen (Optional)                                    │
│  ────────────────────────────────────                                   │
│  • Covers entire VSCode window                                          │
│  • Complete isolation/distraction-free                                  │
│  • Triggered by [⛶] button or F11                                      │
│  • ESC to exit                                                          │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ [Component Name] [Auto][Desktop][Tablet][Mobile] [- 100% +] [X]  │  │
│  ├───────────────────────────────────────────────────────────────────┤  │
│  │                                                                   │  │
│  │                                                                   │  │
│  │                     Component Preview                             │  │
│  │                     (Full Screen)                                 │  │
│  │                                                                   │  │
│  │                                                                   │  │
│  ├───────────────────────────────────────────────────────────────────┤  │
│  │ [Select][Inspect][Rect] │ [AI ✨ Ask AI...      ] │ [Prev][Code] │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Fullscreen Layout with Properties Panel

```
┌─────────────────────────────────────────────────────────────────────────┐
│ [Button Component]  [Auto][Desktop][Tablet][Mobile]            [⛶] [X] │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────────────────────────────┬────────────────────────┐│
│  │                                            │   Properties Panel     ││
│  │                                            │   ──────────────────   ││
│  │                                            │                        ││
│  │                                            │   backgroundColor      ││
│  │           Component Preview                │   [████████] #3b82f6   ││
│  │                                            │                        ││
│  │              ┌──────────┐                  │   borderRadius         ││
│  │              │  Button  │                  │   ──────●────── 8px    ││
│  │              └──────────┘                  │                        ││
│  │                                            │   padding              ││
│  │                                            │   [12] x [24] px       ││
│  │                                            │                        ││
│  │                                            │   fontSize             ││
│  │                                            │   ────────●── 16px     ││
│  │                                            │                        ││
│  │                                            │   fontWeight           ││
│  │                                            │   [▼ 600 Semi-Bold  ]  ││
│  │                                            │                        ││
│  └────────────────────────────────────────────┴────────────────────────┘│
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│ [Select][Inspect][Rect] │ [AI ✨ Make it more vibrant  ] │ [Prev][Code]│
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Hot Reload Strategy

### Comparison of Approaches

| Approach | Latency | State | Complexity | Use Case |
|----------|---------|-------|------------|----------|
| **Full Refresh** | ~50-100ms | ❌ Lost | Low | Code changes |
| **CSS Injection** | ~1ms | ✅ Kept | Low | Style tweaks |
| **React Fast Refresh** | ~10ms | ✅ Kept | High | N/A (needs bundler) |
| **Vite HMR** | ~20ms | ✅ Kept | Very High | Project Mode only |

### Decision: Hybrid Approach

```
┌─────────────────────────────────────────────────────────────────┐
│                     Change Type Router                           │
│                                                                  │
│   User Action                                                    │
│       │                                                          │
│       ▼                                                          │
│   ┌─────────────────────────────────────────┐                   │
│   │ Is it a style-only change?              │                   │
│   │ (color, size, spacing, etc.)            │                   │
│   └────────────────┬────────────────────────┘                   │
│                    │                                             │
│          ┌────────┴────────┐                                    │
│          │                 │                                    │
│         YES               NO                                    │
│          │                 │                                    │
│          ▼                 ▼                                    │
│   ┌─────────────┐   ┌─────────────────┐                        │
│   │ Fast Path   │   │ Full Path       │                        │
│   │             │   │                 │                        │
│   │ updateStyle │   │ updateCode      │                        │
│   │ ~1ms        │   │ ~50-100ms       │                        │
│   │ Keep state  │   │ Lose state      │                        │
│   └─────────────┘   └─────────────────┘                        │
│                                                                  │
│   Note: Style changes via Properties Panel use Fast Path        │
│         AI edits and code changes use Full Path                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Why Not React Fast Refresh?

React Fast Refresh requires:
1. A bundler (Webpack/Vite) with HMR runtime
2. Module boundary awareness
3. Hot module replacement protocol

Our sandboxes are **isolated webviews** with in-browser Babel transpilation - no bundler. The complexity of adding Fast Refresh outweighs the benefit for our use case (component previews, not full app development).

---

## Properties Panel Integration

### Element Inspection Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│  1. User clicks "Inspect" in action bar                                 │
│                                                                          │
│      [Select] [Inspect ✓] [Rect]                                        │
│                    │                                                     │
│                    ▼                                                     │
│  2. Host sends inspect mode message                                      │
│                                                                          │
│      webview.postMessage({ type: 'enterInspectMode' })                  │
│                    │                                                     │
│                    ▼                                                     │
│  3. Webview adds hover listeners + highlight overlay                     │
│                                                                          │
│      document.addEventListener('mouseover', highlightElement)           │
│      document.addEventListener('click', selectElement)                  │
│                    │                                                     │
│                    ▼                                                     │
│  4. User hovers over element → highlight shown                          │
│                                                                          │
│              ┌──────────────────┐                                       │
│              │ ┌──────────────┐ │ ← Blue highlight overlay              │
│              │ │   Button     │ │                                       │
│              │ └──────────────┘ │                                       │
│              │    .btn-primary  │ ← Selector tooltip                    │
│              └──────────────────┘                                       │
│                    │                                                     │
│                    ▼                                                     │
│  5. User clicks element → selection locked                              │
│                                                                          │
│      vscode.postMessage({                                               │
│          type: 'elementSelected',                                       │
│          selector: '.btn-primary',                                      │
│          tagName: 'button',                                             │
│          className: 'btn btn-primary',                                  │
│          computedStyles: {                                              │
│              backgroundColor: 'rgb(59, 130, 246)',                      │
│              borderRadius: '8px',                                       │
│              padding: '12px 24px',                                      │
│              fontSize: '16px',                                          │
│              ...                                                        │
│          },                                                             │
│          boundingRect: { x, y, width, height }                         │
│      })                                                                 │
│                    │                                                     │
│                    ▼                                                     │
│  6. Host updates Properties Panel with values                           │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Property Change Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│  Properties Panel                                                        │
│  ┌─────────────────────────────────┐                                    │
│  │ backgroundColor                  │                                    │
│  │ [████████████] #3b82f6          │ ← User changes color               │
│  └─────────────────────────────────┘                                    │
│                    │                                                     │
│                    ▼                                                     │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                     Decision Point                               │    │
│  │                                                                  │    │
│  │   Is "Live Preview" enabled?                                    │    │
│  │                                                                  │    │
│  │   [✓] Live Preview (instant, temporary)                         │    │
│  │   [ ] Apply to Code (slower, permanent)                         │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                    │                                                     │
│          ┌────────┴────────┐                                            │
│          │                 │                                            │
│    Live Preview       Apply to Code                                     │
│          │                 │                                            │
│          ▼                 ▼                                            │
│   ┌─────────────┐   ┌─────────────────────────────────────────────┐    │
│   │ updateStyle │   │ 1. Parse sessionCode AST                    │    │
│   │ (fast path) │   │ 2. Find style definition                    │    │
│   │             │   │ 3. Update value                             │    │
│   │ Temporary   │   │ 4. Regenerate code                          │    │
│   │ preview     │   │ 5. updateCode (full path)                   │    │
│   └─────────────┘   └─────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## AI Chat Integration

### AI Edit Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│  User types in AI chat: "Make the button more vibrant with a gradient"  │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ [AI ✨ Make the button more vibrant with a gradient         ⏎ ]  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                    │                                                     │
│                    ▼                                                     │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                        AI Service                                  │  │
│  │                                                                    │  │
│  │   Input:                                                          │  │
│  │   • Current sessionCode                                           │  │
│  │   • Selected element (if any)                                     │  │
│  │   • User prompt                                                   │  │
│  │   • Component context (props schema, etc.)                        │  │
│  │                                                                    │  │
│  │   Output:                                                         │  │
│  │   • Modified code                                                 │  │
│  │   • Explanation of changes                                        │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                    │                                                     │
│                    ▼                                                     │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                     Code Diff Preview                              │  │
│  │                                                                    │  │
│  │   - background: '#3b82f6',                                        │  │
│  │   + background: 'linear-gradient(135deg, #667eea 0%, #764ba2)',   │  │
│  │                                                                    │  │
│  │                            [Apply] [Reject]                       │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                    │                                                     │
│              User clicks [Apply]                                        │
│                    │                                                     │
│                    ▼                                                     │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │   1. sandbox.sessionCode = newCode                                │  │
│  │   2. webview.postMessage({ type: 'update', code: newCode })       │  │
│  │   3. Component re-renders with gradient                           │  │
│  │   4. Optionally sync to file system                               │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Context-Aware AI Prompts

The AI receives rich context for better edits:

```typescript
interface AIEditContext {
    // The component code
    sessionCode: string;

    // Selected element info (if any)
    selectedElement?: {
        selector: string;
        tagName: string;
        className: string;
        computedStyles: Record<string, string>;
    };

    // Component metadata
    componentId: string;
    componentName: string;

    // Available props/schema (future)
    propsSchema?: PropSchema[];

    // User's request
    userPrompt: string;
}
```

---

## View Modes

### Three View Modes in Fullscreen

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│   [Preview] [Split] [Code]                                              │
│       │        │       │                                                │
│       │        │       └─────────────────────────────────────────────┐  │
│       │        │                                                     │  │
│       │        └─────────────────────────────────┐                   │  │
│       │                                          │                   │  │
│       ▼                                          ▼                   ▼  │
│  ┌──────────────┐  ┌──────────────────────────────────┐  ┌──────────┐  │
│  │              │  │              │                   │  │          │  │
│  │              │  │              │                   │  │          │  │
│  │   Preview    │  │   Preview    │   Code Editor     │  │   Code   │  │
│  │   Only       │  │   (50%)      │   (Monaco)        │  │   Only   │  │
│  │              │  │              │   (50%)           │  │          │  │
│  │              │  │              │                   │  │          │  │
│  │              │  │              │                   │  │          │  │
│  └──────────────┘  └──────────────────────────────────┘  └──────────┘  │
│                                                                          │
│   Best for:         Best for:                           Best for:       │
│   - Viewing         - Live editing                      - Reading       │
│   - Testing         - AI changes                        - Copying       │
│   - Presenting      - Learning                          - Debugging     │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Split View Communication

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│  ┌─────────────────────────────┐   ┌─────────────────────────────────┐  │
│  │                             │   │                                 │  │
│  │      Preview Webview        │◄──┤      Monaco Code Editor         │  │
│  │                             │   │                                 │  │
│  │  • Renders component        │   │  • Shows sessionCode            │  │
│  │  • Receives updates         │   │  • User edits trigger update    │  │
│  │  • Sends element selections │   │  • Syntax highlighting          │  │
│  │                             │   │  • Error squiggles              │  │
│  └──────────────┬──────────────┘   └───────────────┬─────────────────┘  │
│                 │                                   │                    │
│                 │         ┌─────────────┐          │                    │
│                 └────────►│  Debounced  │◄─────────┘                    │
│                           │   Sync      │                               │
│                           │  (300ms)    │                               │
│                           └──────┬──────┘                               │
│                                  │                                       │
│                                  ▼                                       │
│                      ┌─────────────────────┐                            │
│                      │ sandbox.sessionCode │                            │
│                      │ (Source of Truth)   │                            │
│                      └─────────────────────┘                            │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Roadmap

### Phase 1: Editor Fullscreen (Current Priority)
- [ ] Refactor fullscreen to use `position: absolute` within editor container
- [ ] Keep bottom action bar visible in fullscreen
- [ ] Add device preset buttons to top bar
- [ ] Implement ESC to exit

### Phase 2: Inspect Mode
- [ ] Add inspect mode toggle to action bar
- [ ] Implement hover highlighting in webview
- [ ] Implement click-to-select in webview
- [ ] Show selector tooltip on hover

### Phase 3: Properties Panel
- [ ] Create properties panel component
- [ ] Implement `inspectElement` message handler
- [ ] Add common CSS properties (color, size, spacing)
- [ ] Implement `updateStyle` for live preview

### Phase 4: View Modes
- [ ] Add Preview/Split/Code toggle
- [ ] Integrate Monaco editor for code view
- [ ] Implement debounced sync between views
- [ ] Add syntax highlighting and error display

### Phase 5: AI Chat Integration
- [ ] Add AI chat input to action bar
- [ ] Connect to AI service
- [ ] Implement code diff preview
- [ ] Add Apply/Reject UI

### Phase 6: Advanced Features
- [ ] Property schemas for components
- [ ] Undo/redo for changes
- [ ] File system sync
- [ ] Multi-component selection

---

## File Storage Architecture

### Why Real Files (Not Embedded JSON)?

| Factor | Embedded in JSON | Real Files |
|--------|------------------|------------|
| **AI Context** | Must parse large JSON | Direct file read |
| **Git Diffs** | Messy, hard to review | Clean, per-component |
| **Export** | Need extraction logic | Already separate |
| **Import** | Need injection logic | Just copy files |
| **Monaco Editing** | Must extract/inject | Direct file editing |
| **Collaboration** | Merge conflicts | Standard git flow |
| **VSCode Integration** | Custom handling | Native file explorer |

**Decision: Real Files** - Leverages VSCode's native file handling, simplifies AI context, enables standard git workflows.

### Directory Structure

```
project/
├── .roopik/
│   ├── canvases/
│   │   ├── login-design.canvas.json        # Canvas 1 manifest
│   │   └── dashboard-components.canvas.json # Canvas 2 manifest
│   │
│   ├── scratch/                             # Unsaved/temp components
│   │   └── untitled-1.tmp.json              # Temporary until saved
│   │
│   └── autosave/                            # Crash recovery
│       └── sandbox-abc123.tmp.json          # Auto-saved session code
│
├── components/                              # Real component files
│   ├── Button/
│   │   ├── Button.jsx                       # React component
│   │   └── Button.module.css                # Optional styles
│   │
│   ├── LoginForm/
│   │   └── LoginForm.vue                    # Vue SFC (all-in-one)
│   │
│   ├── Header/                              # Vanilla HTML/JS/CSS
│   │   ├── Header.html
│   │   ├── Header.js
│   │   └── Header.css
│   │
│   └── Card/
│       └── Card.jsx
```

### Canvas Manifest Schema

The canvas manifest is a **lightweight JSON** that stores layout/metadata only, with references to real component files:

```typescript
interface CanvasManifest {
  // Canvas metadata
  id: string;
  name: string;
  createdAt: string;      // ISO timestamp
  updatedAt: string;

  // Viewport state (for restoring view)
  viewport: {
    x: number;
    y: number;
    scale: number;
  };

  // Visual settings
  backgroundColor: string;
  backgroundPattern: 'dots' | 'grid' | 'plain';

  // Sandboxes with component references
  sandboxes: SandboxReference[];
}

interface SandboxReference {
  id: string;

  // Component reference (NOT the code itself)
  component: ComponentReference;

  // Layout on canvas
  position: { x: number; y: number };
  size: { width: number; height: number };
  zIndex: number;
}

interface ComponentReference {
  // Path relative to project root
  path: string;           // e.g., "components/Button/Button.jsx"

  // Framework for rendering
  framework: FrameworkType;

  // All files that make up this component
  files: string[];        // e.g., ["Button.jsx", "Button.module.css"]

  // Entry file for multi-file components
  entryFile?: string;     // e.g., "Header.html" for vanilla
}
```

### Example Canvas Manifest

```json
{
  "id": "login-design",
  "name": "Login Design",
  "createdAt": "2024-11-29T10:00:00Z",
  "updatedAt": "2024-11-29T15:30:00Z",
  "viewport": { "x": 100, "y": 50, "scale": 0.8 },
  "backgroundColor": "#1a1a1a",
  "backgroundPattern": "dots",

  "sandboxes": [
    {
      "id": "sandbox-1",
      "component": {
        "path": "components/LoginForm/LoginForm.vue",
        "framework": "vue",
        "files": ["LoginForm.vue"]
      },
      "position": { "x": 0, "y": 0 },
      "size": { "width": 400, "height": 300 },
      "zIndex": 1
    },
    {
      "id": "sandbox-2",
      "component": {
        "path": "components/Button/Button.jsx",
        "framework": "react",
        "files": ["Button.jsx", "Button.module.css"]
      },
      "position": { "x": 450, "y": 0 },
      "size": { "width": 400, "height": 300 },
      "zIndex": 2
    },
    {
      "id": "sandbox-3",
      "component": {
        "path": "components/Header",
        "framework": "vanilla",
        "files": ["Header.html", "Header.js", "Header.css"],
        "entryFile": "Header.html"
      },
      "position": { "x": 0, "y": 350 },
      "size": { "width": 850, "height": 300 },
      "zIndex": 3
    }
  ]
}
```

### Multi-File Component Handling

Different frameworks require different file structures:

```
┌─────────────────────────────────────────────────────────────────┐
│                Framework File Patterns                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  SINGLE-FILE FRAMEWORKS                                          │
│  ───────────────────────                                         │
│                                                                  │
│  React (.jsx/.tsx)     Vue (.vue)          Svelte (.svelte)     │
│  ┌──────────────┐      ┌──────────────┐    ┌──────────────┐     │
│  │ Button.jsx   │      │ Card.vue     │    │ Modal.svelte │     │
│  │              │      │ <template>   │    │ <script>     │     │
│  │ // styles +  │      │ <script>     │    │ // logic     │     │
│  │ // logic +   │      │ <style>      │    │ </script>    │     │
│  │ // markup    │      │              │    │ <style>      │     │
│  └──────────────┘      └──────────────┘    └──────────────┘     │
│                                                                  │
│  MULTI-FILE FRAMEWORKS                                           │
│  ─────────────────────                                           │
│                                                                  │
│  Vanilla HTML/JS/CSS          React + CSS Modules               │
│  ┌──────────────────┐         ┌──────────────────┐              │
│  │ Header/          │         │ Button/          │              │
│  │ ├── Header.html  │ ←entry  │ ├── Button.jsx   │ ←entry      │
│  │ ├── Header.js    │         │ └── Button.css   │              │
│  │ └── Header.css   │         └──────────────────┘              │
│  └──────────────────┘                                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Compilation to Session Code

When loading a canvas, files are compiled into `sessionCode`:

```typescript
async function compileToSessionCode(
  component: ComponentReference
): Promise<string> {
  switch (component.framework) {
    case 'react':
    case 'vue':
    case 'svelte':
      // Single file - just read it
      return await readFile(component.path);

    case 'vanilla':
      // Multi-file - merge into single HTML
      const html = await readFile(`${component.path}/${component.entryFile}`);
      const js = await readFile(`${component.path}/*.js`);
      const css = await readFile(`${component.path}/*.css`);

      return `
        <style>${css}</style>
        ${html}
        <script>${js}</script>
      `;

    default:
      return await readFile(component.path);
  }
}
```

### Save Back to Files

When saving sessionCode changes back to disk:

```typescript
async function saveSessionCode(
  component: ComponentReference,
  sessionCode: string
): Promise<void> {
  switch (component.framework) {
    case 'react':
    case 'vue':
    case 'svelte':
      // Single file - just write it
      await writeFile(component.path, sessionCode);
      break;

    case 'vanilla':
      // Multi-file - split and write separately
      const { html, js, css } = parseVanillaSessionCode(sessionCode);
      await writeFile(`${component.path}/${component.entryFile}`, html);
      if (js) await writeFile(`${component.path}/*.js`, js);
      if (css) await writeFile(`${component.path}/*.css`, css);
      break;
  }
}
```

### Scratch Components (Unsaved)

For components created but not yet saved to real files:

```json
// .roopik/scratch/untitled-1.tmp.json
{
  "id": "scratch-abc123",
  "tempName": "Untitled Component",
  "framework": "react",
  "createdAt": "2024-11-29T15:30:00Z",
  "sessionCode": "export default function Button() { ... }",
  "cdnUrls": ["react.js", "react-dom.js"],
  "isDirty": true,

  // Canvas placement (if on a canvas)
  "canvasId": "login-design",
  "position": { "x": 900, "y": 0 },
  "size": { "width": 400, "height": 300 }
}
```

**Scratch Workflow:**
1. User creates new component → stored in `.roopik/scratch/`
2. User edits (sessionCode updated, isDirty = true)
3. User clicks "Save" → prompted for name/location
4. Moves to `components/ComponentName/` as real file
5. Canvas manifest updated with real path
6. Scratch file deleted

### Auto-Save for Crash Recovery

```json
// .roopik/autosave/sandbox-abc123.tmp.json
{
  "sandboxId": "sandbox-abc123",
  "componentPath": "components/Button/Button.jsx",
  "sessionCode": "// unsaved changes...",
  "timestamp": "2024-11-29T15:45:00Z"
}
```

**Auto-Save Flow:**
1. On sessionCode change → debounce 5 seconds
2. Write to `.roopik/autosave/{sandboxId}.tmp.json`
3. On explicit save → delete autosave file
4. On canvas load → check for autosave, prompt to restore

### Activity Bar Tree Structure

```
┌──────────────────────────────────────┐
│ ROOPIK: DASHBOARD                    │
├──────────────────────────────────────┤
│                                      │
│ CANVASES                             │
│ ▼ Login Design                       │  ← Click canvas: show all sandboxes
│   ├── LoginForm.vue       [vue]      │  ← Click: focus this sandbox
│   ├── Button.jsx          [react]    │
│   └── Header/             [vanilla]  │  ← Folder icon for multi-file
│       ├── Header.html                │
│       ├── Header.js                  │
│       └── Header.css                 │
│                                      │
│ ▶ Dashboard Components               │  ← Collapsed canvas
│ ▶ Component Library                  │
│                                      │
│ PROJECTS                             │
│   E-commerce App          [vite]     │
│   Dashboard UI            [next]     │
│                                      │
│ SCRATCH (unsaved)                    │
│   └── Untitled Component  ●          │  ← Dirty indicator
│                                      │
└──────────────────────────────────────┘
```

### AI Agent Context Strategy

When user asks AI to edit a component, we provide focused context:

```typescript
interface AIEditContext {
  // The component being edited
  component: {
    path: string;              // "components/Button/Button.jsx"
    framework: FrameworkType;  // "react"
    files: string[];           // ["Button.jsx", "Button.module.css"]
  };

  // File contents (AI reads all related files)
  fileContents: Map<string, string>;  // Direct file contents

  // Currently selected element (if inspect mode active)
  selectedElement?: {
    selector: string;
    tagName: string;
    computedStyles: Record<string, string>;
    boundingRect: DOMRect;
  };

  // User's request
  userPrompt: string;

  // Optional: other components in same canvas (just paths)
  relatedComponents?: string[];
}
```

**Why this helps AI:**
- **Direct file paths** → AI knows exactly what to edit
- **Separate files** → smaller context, focused edits
- **Framework hint** → AI generates correct syntax
- **Selected element** → precise CSS targeting
- **No JSON parsing** → cleaner diffs, easier review

### Load/Save Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        LOAD CANVAS                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Read .roopik/canvases/{name}.canvas.json                    │
│                           │                                      │
│                           ▼                                      │
│  2. For each sandbox in manifest:                                │
│     ┌─────────────────────────────────────────────────────┐     │
│     │ a. Read component files from disk                    │     │
│     │ b. Compile to sessionCode (merge if multi-file)      │     │
│     │ c. Load CDN URLs based on framework                  │     │
│     │ d. Check .roopik/autosave/ for unsaved changes       │     │
│     │    → If found, prompt user to restore                │     │
│     └─────────────────────────────────────────────────────┘     │
│                           │                                      │
│                           ▼                                      │
│  3. Render sandboxes on canvas with restored viewport           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                       SAVE COMPONENT                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Is this a scratch component?                                 │
│     ├─ YES → Prompt for save location (components/{name}/)      │
│     └─ NO  → Use existing path                                  │
│                           │                                      │
│                           ▼                                      │
│  2. Write sessionCode back to file(s):                          │
│     ├─ Single-file (React/Vue/Svelte) → Write directly          │
│     └─ Multi-file (Vanilla) → Split HTML/JS/CSS, write each     │
│                           │                                      │
│                           ▼                                      │
│  3. Update canvas manifest if path changed                       │
│                           │                                      │
│                           ▼                                      │
│  4. Clear autosave file for this sandbox                        │
│                           │                                      │
│                           ▼                                      │
│  5. Clear dirty flag                                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Design Principles

### 1. **Session Code is Truth**
All changes ultimately modify `sessionCode`. This ensures consistency and makes undo/redo straightforward.

### 2. **Fast Path When Possible**
Use CSS injection for style-only changes to provide instant feedback without losing component state.

### 3. **Progressive Enhancement**
Start with simple features (fullscreen, inspect) and build toward complex ones (AI editing, properties panel).

### 4. **Non-Blocking UI**
All heavy operations (transpilation, AI calls) should show loading states and not freeze the UI.

### 5. **Context-Rich AI**
Provide AI with as much context as possible (selected element, computed styles, component metadata) for better edits.

---

## Open Questions

1. **Should style changes via Properties Panel update sessionCode immediately or only on "Apply"?**
   - Immediate: More seamless but might create many small changes
   - On Apply: More controlled but less "live"
   - Recommendation: Add toggle for "Live Preview" mode

2. **How to handle unsaved changes when exiting fullscreen?**
   - Auto-save to sessionCode (current approach)
   - Prompt user to save/discard
   - Keep changes in memory until explicit save

3. **Should we support multiple selected elements?**
   - Single selection is simpler
   - Multi-select enables bulk property changes
   - Recommendation: Start with single, add multi-select later

---

*Last updated: November 2024*
*Authors: Roopik Team + Claude*
