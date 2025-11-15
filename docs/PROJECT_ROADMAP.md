# ROOPIK DETAILED IMPLEMENTATION PLAN

## Overview
Building an AI-native, canvas-first IDE on VS Code fork. Focus on **resilient, independent features** that work flawlessly before moving forward. No compromise on quality.

---

## PHASE 1: FOUNDATION (Weeks 1-4)
**Goal**: Prove VS Code fork works, create extension scaffold

### Week 1: Environment Setup
- Install dependencies (`npm install`)
- Build VS Code (`npm run watch-client`)
- Launch dev instance (`.\scripts\code.bat`)
- Verify Windows toolchain
- Create `extensions/roopik/` folder structure

### Week 2: Extension Scaffold
- Basic extension activation
- Register custom editor for `.roopik` files
- Create webview panel
- Setup React dev environment (Vite)
- PostMessage communication working

### Week 3-4: Development Workflow
- Hot reload for extension code
- Hot reload for React webview
- Debugging setup (extension + webview)
- Build pipeline for production
- Extension packaging

**Challenges**: Build system complexity, Windows toolchain issues, hot reload configuration
**Success Criteria**: Can edit extension/webview code with instant feedback

---

## PHASE 2: INFINITE CANVAS ENGINE (Weeks 5-10)
**Goal**: Flawless 60fps canvas with 1000+ elements

### Challenge #1: Rendering Architecture
**Options**:
- HTML/CSS (DOM-based) - Easier, slower
- Canvas 2D - Fast, manual text rendering
- WebGL - Fastest, complex
- React + Virtualization - Hybrid

**Recommendation**: Start DOM, migrate to Canvas 2D if needed

### Week 5-6: Basic Canvas
- Pan/zoom with mouse (transform matrix)
- Render 100 static rectangles
- Selection system (click/drag)
- Bounding box calculations
- FPS monitoring

**Technical Deep Dive**:
```typescript
// Transform matrix for pan/zoom
interface Transform {
  x: number;      // Pan X
  y: number;      // Pan Y
  scale: number;  // Zoom level
}

// Viewport culling (only render visible)
function getVisibleNodes(
  allNodes: Node[],
  viewport: Rect,
  transform: Transform
): Node[] {
  // Only return nodes in viewport bounds
}
```

### Week 7-8: Performance Optimization
- Viewport culling (only render visible)
- Spatial indexing (R-tree or grid)
- Lazy rendering (RAF batching)
- Web Worker for layout calculations
- Achieve 60fps with 1000+ nodes

**Performance Targets**:
- 1000 nodes @ 60fps
- Pan/zoom latency < 16ms
- Selection response < 10ms

### Week 9-10: Interaction System
- Multi-select (shift+click, drag box)
- Resize handles (8-point)
- Rotation handles
- Snap-to-grid
- Alignment guides
- Keyboard shortcuts (arrow keys, delete)

**Challenges**: Hit detection accuracy, handle z-ordering, transform math, event handling complexity

**Success Criteria**: Canvas feels as responsive as Figma

---

## PHASE 3: COMPONENT SYSTEM (Weeks 11-14)
**Goal**: Visual components with full type safety

### Challenge #2: Component Representation
**Data Model**:
```typescript
interface ComponentNode {
  id: string;                    // Unique ID
  type: 'Button' | 'Input' | ...; // Component type
  props: Record<string, any>;     // Component props
  layout: {
    x: number;
    y: number;
    width: string | number;       // Support px, %, auto
    height: string | number;
  };
  styles: CSSProperties;
  children: ComponentNode[];
  variants: Record<string, Partial<ComponentNode>>;
}

interface CanvasState {
  components: ComponentNode[];
  selectedIds: string[];
  clipboard: ComponentNode[];
  history: CanvasState[];       // For undo/redo
  designSystem: {
    colors: Record<string, string>;
    spacing: number[];
    typography: Record<string, CSSProperties>;
  };
}
```

### Week 11: Component Palette
- Draggable component list
- Basic components (Button, Input, Text, Container)
- Drag-and-drop to canvas
- Component instantiation
- Props initialization

### Week 12: Component Tree Panel
- Hierarchical tree view
- Parent-child relationships
- Drag to reorder
- Collapse/expand
- Sync with canvas selection

### Week 13: Inspector Panel
- Props editor (text, number, boolean, select)
- Style editor (color picker, slider, input)
- Layout editor (x, y, width, height)
- Live updates (debounced)
- Type validation

### Week 14: State Management
- Zustand/Redux for canvas state
- Time-travel debugging
- State persistence
- Canvas JSON save/load

**Challenges**: Type inference for props, nested component updates, state sync performance, undo/redo granularity

**Success Criteria**: Can build complex UI (20+ nested components) without bugs

---

## PHASE 4: PREVIEW ENGINE (Weeks 15-20)
**Goal**: Live, isolated component previews with HMR

### Challenge #3: Component Compilation
**Architecture**:
```
Canvas State (JSON)
   ↓
Code Generator (Canvas → JSX)
   ↓
Bundler (esbuild/Vite)
   ↓
Preview Iframe (isolated sandbox)
```

### Week 15-16: Code Generation
**Input**: Canvas JSON
**Output**: Clean JSX/TSX

```typescript
function generateCode(node: ComponentNode): string {
  // Example output:
  return `
import { Button } from './components';

export default function Preview() {
  return (
    <Button
      variant="primary"
      onClick={() => alert('Clicked')}
    >
      Click Me
    </Button>
  );
}`;
}
```

**Challenges**:
- Handling dynamic expressions (onClick, state)
- Import resolution
- TypeScript types
- Preserving user logic
- Deterministic output (same JSON → same code)

### Week 17-18: Bundler Integration
- esbuild in-memory bundling
- Virtual file system
- Import resolution
- CSS handling (Tailwind, CSS modules)
- Source maps

**Technical Approach**:
```typescript
import { build } from 'esbuild';

async function bundleComponent(code: string) {
  const result = await build({
    stdin: {
      contents: code,
      loader: 'tsx',
      resolveDir: process.cwd()
    },
    bundle: true,
    format: 'esm',
    write: false,
    plugins: [virtualFileSystemPlugin]
  });

  return result.outputFiles[0].text;
}
```

### Week 19-20: Iframe Sandbox
- Iframe creation/management
- Security (CSP, sandbox attributes)
- HMR (hot module replacement)
- Error boundaries
- Runtime error reporting

**iframe Setup**:
```html
<iframe
  sandbox="allow-scripts allow-same-origin"
  src="preview.html"
  id="preview-1"
></iframe>
```

**HMR Communication**:
```typescript
// Canvas → iframe
iframe.contentWindow.postMessage({
  type: 'hmr-update',
  code: newBundledCode,
  props: { variant: 'secondary' }
}, '*');

// iframe → canvas (errors)
window.addEventListener('message', (e) => {
  if (e.data.type === 'runtime-error') {
    showError(e.data.error);
  }
});
```

**Challenges**: iframe security, HMR state preservation, import resolution, error reporting, performance

**Success Criteria**: Change canvas → see preview update in < 200ms

---

## PHASE 5: CODE ↔ CANVAS SYNC (Weeks 21-28)
**Goal**: Bidirectional sync between code and canvas

### Challenge #4: AST Parsing & Structural Diff
**The Diamond Rule**:
- Canvas owns: Component structure, layout, styles, props (data)
- Code owns: Event handlers, hooks, logic, state

### Week 21-22: AST Parsing (Code → Canvas)
**Tool**: Babel

```typescript
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';

function parseComponentCode(code: string): ComponentNode {
  const ast = parse(code, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript']
  });

  let rootNode: ComponentNode;

  traverse(ast, {
    JSXElement(path) {
      // Extract component type, props, children
      const node = {
        type: path.node.openingElement.name.name,
        props: extractProps(path.node.openingElement.attributes),
        children: path.node.children.map(parseJSXChild)
      };
      rootNode = node;
    }
  });

  return rootNode;
}
```

**Challenges**:
- Handling dynamic props (`{...spread}`)
- Extracting layout from styles
- Conditional rendering (`{condition && <Component />}`)
- Loops (`.map()`)
- Preserving logic (event handlers, hooks)

### Week 23-24: Structural Diff Algorithm
**Goal**: Detect what changed (structure vs logic)

```typescript
interface Diff {
  type: 'structural' | 'logic';
  path: string[];               // ['Button', 'children', 0]
  oldValue: any;
  newValue: any;
}

function diffAST(
  oldAST: ComponentNode,
  newAST: ComponentNode
): Diff[] {
  // Deep comparison
  // Classify changes as structural or logic
}
```

**Rules**:
- Structural change → Update canvas, regenerate code
- Logic change → Preserve in code, don't touch canvas
- Conflict → Ask user

### Week 25-26: Bidirectional Sync Engine
**Scenarios**:

1. **User edits canvas** → Regenerate code
2. **User edits code (structure)** → Update canvas
3. **User edits code (logic)** → Preserve, don't sync
4. **Both edited** → Conflict resolution UI

**Sync Flow**:
```typescript
// Watch file changes
vscode.workspace.onDidChangeTextDocument((e) => {
  if (e.document.fileName.endsWith('.tsx')) {
    const newAST = parseComponentCode(e.document.getText());
    const diffs = diffAST(currentCanvasAST, newAST);

    for (const diff of diffs) {
      if (diff.type === 'structural') {
        updateCanvas(diff);
      }
    }
  }
});

// Watch canvas changes
canvasStore.subscribe((newState) => {
  const newCode = generateCode(newState);
  writeToFile(newCode);
});
```

### Week 27-28: Conflict Resolution
- Detect conflicts (both canvas & code changed)
- Show diff UI (3-way merge)
- User chooses: Keep canvas, keep code, or manual merge
- Undo/redo support

**Challenges**: Accurately classifying changes, preserving formatting, handling edge cases (fragments, portals), performance with large files

**Success Criteria**: Can freely edit canvas or code, sync is seamless

---

## PHASE 6: AI AGENT SYSTEM (Weeks 29-36)
**Goal**: AI that thinks in tools, not raw code

### Challenge #5: Intent Detection & Tool Design
**Architecture**:
```
User Prompt
   ↓
Intent Classifier (Claude)
   ↓
Multi-Step Planner
   ↓
Tool Executor (editLayout, editProps, etc.)
   ↓
Canvas State Update
   ↓
Preview Update
```

### Week 29-30: Tool Schema Design
**Tools**:

```typescript
const tools = [
  {
    name: 'generateComponent',
    description: 'Create a new component from scratch',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['Button', 'Input', ...] },
        props: { type: 'object' },
        layout: { type: 'object' },
        styles: { type: 'object' },
        parentId: { type: 'string' }
      },
      required: ['type']
    }
  },
  {
    name: 'editLayout',
    description: 'Change position, size, or layout properties',
    input_schema: {
      type: 'object',
      properties: {
        componentId: { type: 'string' },
        changes: {
          type: 'object',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            width: { type: 'string' },
            height: { type: 'string' }
          }
        }
      },
      required: ['componentId', 'changes']
    }
  },
  // ... editProps, editStyles, addVariant, deleteComponent, etc.
];
```

### Week 31-32: Claude API Integration
**Setup**:
```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

async function executeAIPrompt(
  userPrompt: string,
  canvasContext: CanvasState
) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 4096,
    tools: tools,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: buildContext(canvasContext) },
          { type: 'text', text: userPrompt }
        ]
      }
    ]
  });

  // Parse tool calls
  for (const block of response.content) {
    if (block.type === 'tool_use') {
      executeToolCall(block.name, block.input);
    }
  }
}
```

### Week 33-34: Multi-Step Planning
**Cursor-style Agent**:
1. **Plan** phase: Break complex request into steps
2. **Execute** phase: Run tools sequentially
3. **Reflect** phase: Validate results
4. **Iterate** phase: Fix issues

**Example**:
```
User: "Create a login form with email, password, and submit button"

Plan:
1. Generate Form container
2. Generate Input (type=email)
3. Generate Input (type=password)
4. Generate Button (submit)
5. Apply consistent spacing
6. Add form validation logic

Execute: [Run each tool]
Reflect: [Check if form looks correct]
Iterate: [Adjust spacing if needed]
```

### Week 35-36: Context Building
**What to include in context**:
- Current canvas state (selected components, nearby components)
- Design system (colors, spacing, typography)
- Recent user actions (for continuity)
- Project conventions (naming patterns, structure)

**Context Optimization**:
- Limit to 10k tokens max
- Prioritize relevant components
- Summarize large structures

**Challenges**: Token limits, context relevance, tool call accuracy, latency, cost optimization

**Success Criteria**: AI can handle 80%+ of design requests correctly

---

## PHASE 7: VARIANT SYSTEM (Weeks 37-40)
**Goal**: Component variations like Figma

### Challenge #6: Variant Data Model
**Architecture**:
```typescript
interface ComponentNode {
  // ... existing fields
  variants: {
    default: {
      props: { variant: 'primary' },
      styles: { backgroundColor: 'blue' }
    },
    secondary: {
      props: { variant: 'secondary' },
      styles: { backgroundColor: 'gray' }
    },
    large: {
      layout: { width: '300px', height: '60px' }
    }
  };
  activeVariant: 'default' | 'secondary' | 'large';
}
```

### Week 37: Variant Creation
- Add variant UI (bottom bar like Fiddle)
- Create new variant (duplicate current state)
- Switch between variants
- Delete variants

### Week 38: Variant Inheritance
**Rules**:
- Variants inherit from base
- Changes to base propagate to variants
- Variant overrides are preserved

```typescript
function getEffectiveProps(node: ComponentNode): any {
  const base = node.props;
  const variantOverrides = node.variants[node.activeVariant]?.props || {};
  return { ...base, ...variantOverrides };
}
```

### Week 39-40: Multi-Preview System
- Render multiple variants side-by-side
- Preview iframe per variant
- Sync interactions across variants
- Performance with 3-4 simultaneous previews

**Challenges**: State synchronization across variants, performance with multiple iframes, variant-specific logic

**Success Criteria**: Can create 5+ variants, preview simultaneously without lag

---

## PHASE 8: ADVANCED FEATURES (Weeks 41-48)

### Week 41-42: Shadow Workspace (Cursor-style)
**Goal**: Validate AI changes before applying

```
Real Workspace (user's project)
   ↓
Shadow Workspace (temp copy)
   ↓
AI makes changes
   ↓
Validate (linting, tests, build)
   ↓
If valid → Merge to real workspace
If invalid → Show error, rollback
```

**Implementation**:
- Create temp folder
- Copy relevant files
- Apply AI changes
- Run validation
- Show diff
- User approves/rejects

### Week 43-44: Design Memory
**Goal**: AI learns project patterns

```typescript
interface DesignMemory {
  componentPatterns: {
    Button: {
      defaultProps: { variant: 'primary' },
      commonStyles: { borderRadius: '8px' },
      spacing: { padding: '16px' }
    }
  };
  namingConventions: {
    components: 'PascalCase',
    props: 'camelCase'
  };
  colorPalette: {
    primary: '#3B82F6',
    secondary: '#6B7280'
  };
}
```

**Learning**:
- Extract patterns from existing components
- Reinforce with user corrections
- Update AI context with memory
- Export/import design systems

### Week 45-46: Multi-Framework Support
**Goal**: React, Vue, Svelte adapters

**Architecture**:
```typescript
interface FrameworkAdapter {
  generateCode(node: ComponentNode): string;
  parseCode(code: string): ComponentNode;
  bundlePreview(code: string): Promise<string>;
}

class ReactAdapter implements FrameworkAdapter { /*...*/ }
class VueAdapter implements FrameworkAdapter { /*...*/ }
class SvelteAdapter implements FrameworkAdapter { /*...*/ }
```

**Start with React**, add others later.

### Week 47-48: Polish & Performance
- Undo/redo (Ctrl+Z, Ctrl+Shift+Z)
- Keyboard shortcuts (full set)
- Accessibility (ARIA labels, keyboard nav)
- Performance profiling
- Memory leak hunting
- Error handling (graceful degradation)
- Telemetry (anonymous usage data)

---

## PHASE 9: CORE INTEGRATION (Optional, Weeks 49-56)
**Only if extension performance insufficient**

### Week 49-50: CanvasPart (Core Modification)
```typescript
// src/vs/workbench/contrib/canvas/browser/canvasPart.ts
export class CanvasPart extends Part {
  constructor() {
    super('roopik.canvas', { hasTitle: false });
  }

  override createContentArea(parent: HTMLElement) {
    // Direct DOM rendering (no iframe)
    this.canvasContainer = dom.append(parent, $('.canvas-container'));
    this.initializeCanvas(this.canvasContainer);
  }
}
```

**Benefits**:
- No iframe overhead
- Direct DOM access (60fps guaranteed)
- Full control over rendering

### Week 51-52: Service Layer
```typescript
// src/vs/workbench/contrib/canvas/common/canvasService.ts
export interface ICanvasService {
  readonly canvas: IObservable<CanvasState>;
  updateComponent(id: string, changes: Partial<ComponentNode>): void;
  generateCode(): string;
}
```

### Week 53-54: AI Integration (Direct)
- Bypass extension host
- Run Claude API directly in renderer
- Reduce latency from ~10ms to ~1ms

### Week 55-56: Testing & Migration
- Migrate extension code to core
- Performance benchmarks
- User testing

---

## RISK MITIGATION

### Performance Risks
**Risk**: Canvas lags with 1000+ nodes
**Mitigation**:
- Benchmark at every phase
- Implement virtualization early
- Profile with Chrome DevTools
- Have Canvas 2D/WebGL as backup

### AI Latency Risks
**Risk**: AI responses too slow (> 5s)
**Mitigation**:
- Stream responses
- Show loading states
- Cache common operations
- Use smaller models for simple tasks

### Sync Complexity Risks
**Risk**: Code ↔ canvas sync has bugs
**Mitigation**:
- Extensive testing
- Start with simple components
- Add complexity gradually
- Always allow manual override

### Scope Creep Risks
**Risk**: Feature bloat delays MVP
**Mitigation**:
- This plan is the scope - no additions
- Each phase must complete before next
- Regular milestone reviews

---

## SUCCESS CRITERIA (Per Phase)

1. **Foundation**: Extension hot reload < 1s
2. **Canvas**: 60fps with 1000 nodes
3. **Components**: Build 20+ component UI without bugs
4. **Preview**: Canvas change → preview update < 200ms
5. **Sync**: Edit code/canvas freely, sync seamless
6. **AI**: 80%+ prompt success rate
7. **Variants**: 5+ variants, no lag
8. **Advanced**: All features polished

---

## TIMELINE SUMMARY

- **Weeks 1-4**: Foundation (4 weeks)
- **Weeks 5-10**: Canvas Engine (6 weeks)
- **Weeks 11-14**: Component System (4 weeks)
- **Weeks 15-20**: Preview Engine (6 weeks)
- **Weeks 21-28**: Code ↔ Canvas Sync (8 weeks)
- **Weeks 29-36**: AI Agent System (8 weeks)
- **Weeks 37-40**: Variant System (4 weeks)
- **Weeks 41-48**: Advanced Features (8 weeks)
- **Weeks 49-56**: Core Integration (Optional, 8 weeks)

**Total**: 48 weeks (MVP), 56 weeks (with core integration)

---

## NEXT STEPS

1. Review this plan
2. Discuss any concerns
3. Start Week 1: Install dependencies, build VS Code
4. Create extension scaffold
5. Report progress weekly

This is our roadmap to revolutionize frontend development. Let's build it right. 🚀

---

## Key Highlights

### 🎯 Zero Compromises
- Each phase builds a resilient, independent feature
- No moving forward until current phase is flawless
- Success criteria defined for every phase

### 🏗️ Logical Progression
1. **Foundation** - Prove the toolchain works
2. **Canvas Engine** - Core rendering (hardest problem first)
3. **Component System** - Visual building blocks
4. **Preview Engine** - Live component rendering
5. **Sync Engine** - Bidirectional code ↔ canvas
6. **AI System** - Intelligent generation (after foundation is solid)
7. **Variants** - Advanced design features
8. **Polish** - Production-ready

### 🔬 Technical Deep Dives
I've identified and planned for 6 major challenges:
- **Rendering Architecture** - DOM vs Canvas 2D vs WebGL
- **Component Representation** - Type-safe data model
- **Component Compilation** - Canvas JSON → JSX → Bundled code
- **AST Parsing** - Code → Canvas sync with "Diamond Rule"
- **Intent Detection** - AI tool-calling system
- **Variant Data Model** - Figma-style variations

### 💡 Learning Path Built-In
As a backend dev learning frontend, you'll master:
- TypeScript & Node.js (VS Code Extension API)
- React & modern frontend (Canvas UI)
- Compiler design (AST parsing, code generation)
- AI engineering (Tool-calling, context building)
- Performance optimization (60fps rendering)

### ✅ VS Code Fork Validated
My deep architecture analysis confirms:
- ✅ Webview system supports everything we need
- ✅ No technical showstoppers found
- ✅ Extension-first approach is correct
- ✅ Can migrate to core later if needed
