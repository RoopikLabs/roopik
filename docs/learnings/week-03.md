# Week 3 - Multi-Canvas Architecture & Independent Contexts

**What we're building:** Multiple independent canvas instances with isolated state, AI context, and performance controls

---

## The Problem We're Solving

### Why This Matters NOW
- **Foundation for everything**: State management, AI context, performance, security all depend on this
- **Cost of delay**: Implementing later = massive refactoring
- **Performance critical**: Each canvas = Chromium iframe with full React app + WebGL rendering
- **User workflow**: Login components in Tab 1, Onboarding in Tab 2, Dashboard in Tab 3 - all independent

### Week 2 Limitation
Current singleton pattern only allows **one canvas total**:
```typescript
if (CanvasPanel.currentPanel) {
    CanvasPanel.currentPanel._panel.reveal(column);
    return; // Can't open new canvas!
}
```

---

## Design Decisions

### 1. Canvas Model: ID-Based Singleton Pattern

**Decision:** Keep singleton pattern but make it **ID-based** (not global)

**Why:**
- ✅ Prevents duplicate "Login" canvas (performance)
- ✅ Allows "Login" + "Onboarding" + "Dashboard" (multiple independent canvases)
- ✅ User controls when to reuse vs create new
- ✅ Prevents accidental 20+ tabs (memory explosion)

**How:**
```typescript
// OLD: Global singleton
public static currentPanel: CanvasPanel | undefined;

// NEW: ID-based map
private static panels: Map<string, CanvasPanel> = new Map();
```

### 2. User Commands

**Three commands for different use cases:**

| Command | Behavior | Use Case |
|---------|----------|----------|
| `roopik.openCanvas` | Open/focus default canvas | Continue working on main canvas |
| `roopik.newCanvas` | Always create new (prompt for name) | Start new component set |
| `roopik.mergeCanvases` | Combine multiple canvases | Merge Login + Onboarding + Dashboard |

### 3. Independent Contexts - The Core Architecture

**Each canvas is a completely isolated universe:**

```
Canvas ID: "login"
├── State: .roopik/canvas-login.json
├── AI Context: AIContext("login")
│   ├── Design memory (colors, spacing, patterns)
│   ├── Component history (what was built)
│   └── User preferences (naming conventions, etc.)
├── Chat History: Message[]
│   └── Only conversations about login components
├── Sidebar UI: Independent chat interface
└── Webview Panel: Isolated React app + WebGL renderer
```

**Why complete isolation?**
- 🧠 **AI Efficiency**: No token waste on irrelevant context
  - Building onboarding? Don't need login component context
  - AI only sees what's relevant to THIS canvas
- 🎯 **Performance**: Each canvas manages its own memory
- 🔒 **Security**: Crash in one canvas ≠ crash in others (sandboxed)
- 💾 **State Management**: No shared state = no sync bugs

### 4. Performance Limits - Configurable Constraints

**Problem:** Each canvas = Heavy resource usage
- Chromium iframe (~50-100MB memory)
- React app + state management
- WebGL renderer for infinite canvas
- AI context + chat history

**Solution:** Configurable limits

```json
// .roopik/config.json
{
  "performance": {
    "maxCanvases": 5,              // Default: 5 parallel canvases
    "warnAtCanvases": 3,           // Warn user at 3 canvases
    "maxComponentsPerCanvas": 100, // Prevent canvas overload
    "enableGPUAcceleration": true  // WebGL on/off
  }
}
```

**Enforcement:**
```typescript
public static createOrShow(extensionUri: vscode.Uri, canvasId?: string) {
    // Check limit before creating new canvas
    const config = this.loadConfig();

    if (CanvasPanel.panels.size >= config.performance.maxCanvases) {
        vscode.window.showWarningMessage(
            `Maximum ${config.performance.maxCanvases} canvases reached. Close some before opening new ones.`
        );
        return;
    }

    // Warning at threshold
    if (CanvasPanel.panels.size >= config.performance.warnAtCanvases) {
        vscode.window.showInformationMessage(
            `You have ${CanvasPanel.panels.size} canvases open. Performance may be affected.`
        );
    }

    // Create new canvas...
}
```

### 5. Crash Isolation - Sandboxing Strategy

**Goal:** One canvas crash ≠ All canvases crash

**Architecture:**
```
Extension Host (Node.js)
├── CanvasPanel Map
│   ├── Canvas "login" → Webview iframe 1 (sandboxed)
│   ├── Canvas "onboarding" → Webview iframe 2 (sandboxed)
│   └── Canvas "dashboard" → Webview iframe 3 (sandboxed)
└── Each iframe isolated by Content Security Policy (CSP)
```

**Error Handling:**
```typescript
private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, id: string) {
    this.canvasId = id;

    // Listen for webview crashes
    this._panel.webview.onDidReceiveMessage(message => {
        if (message.type === 'error') {
            // Log error but don't crash extension
            console.error(`[Canvas ${id}] Error:`, message.error);

            // Show recovery UI in THIS canvas only
            this.showErrorRecovery(message.error);

            // Other canvases unaffected
        }
    });
}
```

### 6. Canvas Merge Feature - Future Proofing

**User Workflow:**
1. Build Login components in Canvas 1 (finalized)
2. Build Onboarding flow in Canvas 2 (finalized)
3. Build Dashboard in Canvas 3 (finalized)
4. Run "Merge Canvases" → Select which to combine
5. New merged canvas with all components, organized by namespace

**Why This Matters:**
- Users can work on isolated features in parallel
- Merge when ready to see full application
- Preserves component origin (namespace tracking)
- Allows un-merging if needed (keep original canvases)

---

## Technical Implementation Plan

### Phase 1: Multi-Canvas Foundation
1. **Refactor CanvasPanel to ID-based map**
   - Remove global singleton
   - Add `Map<string, CanvasPanel>`
   - Update `createOrShow()` to accept `canvasId`

2. **Add canvas state persistence**
   - Create `.roopik/canvas-{id}.json` files
   - Save/load state per canvas
   - Handle state migration

3. **Update commands**
   - `roopik.openCanvas` → Reuse default canvas
   - `roopik.newCanvas` → Prompt for name, always create new
   - Register both in package.json

### Phase 2: Independent AI Context
1. **Create AIContext class**
   - Per-canvas design memory
   - Per-canvas chat history
   - Context isolation (no cross-canvas leaking)

2. **Update messaging**
   - Each webview sends `canvasId` in messages
   - Extension routes to correct AIContext
   - Responses scoped to canvas

### Phase 3: Performance Controls
1. **Add configuration system**
   - Create `.roopik/config.json` schema
   - Load config at extension activation
   - Expose settings UI in VS Code settings

2. **Implement limits**
   - Max canvas count enforcement
   - Warning thresholds
   - Graceful degradation (disable GPU if too many canvases)

### Phase 4: Crash Isolation
1. **Error boundaries**
   - Webview error handlers
   - Extension-side try-catch per canvas
   - Recovery UI per canvas

2. **Resource cleanup**
   - Dispose canvas on close
   - Clear AI context from memory
   - Save state before disposal

### Phase 5: Canvas Merge (Future)
1. **Merge command**
   - Multi-select UI for canvas selection
   - Namespace collision handling
   - Layout algorithm for merged components

2. **Un-merge support**
   - Keep original canvases
   - Merged canvas is a new entity
   - Can delete merged canvas without affecting originals

---

## File Structure

```
.roopik/
├── config.json                 # Global config (max canvases, etc.)
├── canvas-default.json         # Default canvas state
├── canvas-login.json           # Login canvas state
├── canvas-onboarding.json      # Onboarding canvas state
└── ai-contexts/
    ├── login.json              # Login AI context + chat history
    ├── onboarding.json         # Onboarding AI context
    └── dashboard.json          # Dashboard AI context
```

---

## Design Patterns We're Following

### 1. **Factory Pattern** (Canvas Creation)
```typescript
CanvasPanel.createOrShow(extensionUri, 'login'); // Factory method
```

### 2. **Singleton per ID** (Not Global Singleton)
```typescript
// One "login" canvas, but can have "onboarding" canvas too
Map<string, CanvasPanel>
```

### 3. **Dependency Injection** (AIContext)
```typescript
constructor(panel, extensionUri, id, aiContext: AIContext) {
    // AIContext injected, not created inside
}
```

### 4. **Observer Pattern** (PostMessage)
```typescript
// Webview posts → Extension observes → Routes to correct canvas
panel.webview.onDidReceiveMessage(msg => this.handleMessage(msg));
```

### 5. **Strategy Pattern** (Configurable Limits)
```typescript
// Different strategies based on config
if (config.maxCanvases === 1) { /* Single canvas mode */ }
else { /* Multi-canvas mode */ }
```

---

## Security Considerations

### 1. Content Security Policy (CSP)
```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none';
               style-src ${webview.cspSource};
               script-src ${webview.cspSource};">
```

### 2. Canvas Isolation
- Each canvas webview runs in separate iframe
- No shared global state between canvases
- PostMessage is ONLY communication channel

### 3. AI Context Isolation
- Canvas "login" AI cannot access canvas "onboarding" context
- Prevents data leakage between projects
- Users can work on sensitive components in separate canvases

### 4. File System Security
- Canvas state files scoped by ID
- No cross-canvas file access
- Extension validates canvas ID before file operations

---

## Performance Impact Analysis

### Resource Usage Per Canvas

| Resource | Single Canvas | 5 Canvases | Notes |
|----------|--------------|------------|-------|
| Memory | ~50-100 MB | ~250-500 MB | Chromium iframe overhead |
| CPU (idle) | ~1-2% | ~5-10% | React reconciliation |
| CPU (rendering) | ~10-20% | ~50-100% | WebGL active rendering |
| GPU Memory | ~100 MB | ~500 MB | Canvas textures + components |

### Mitigation Strategies

1. **Lazy Loading**
   - Only render visible canvases
   - Suspend offscreen canvases (pause WebGL)

2. **Resource Pooling**
   - Share WebGL context where possible
   - Reuse texture atlases

3. **Progressive Enhancement**
   - Disable fancy effects if >3 canvases open
   - Fallback to 2D canvas instead of WebGL

4. **User Controls**
   - Config option: `maxCanvases`
   - Visual indicator of resource usage
   - "Close unused canvases" reminder

---

## Why This Architecture is Resilient

### ✅ Scalability
- Can support 1 canvas or 10 canvases (config-dependent)
- Linear resource growth (not exponential)
- Graceful degradation under load

### ✅ Maintainability
- Clear separation of concerns (each canvas = isolated module)
- Easy to debug (errors scoped to canvas ID)
- Simple to test (mock one canvas at a time)

### ✅ User Experience
- No accidental duplicates (ID-based singleton)
- Explicit control (commands for reuse vs new)
- Merge workflow for combining work

### ✅ AI Efficiency
- No wasted tokens on irrelevant context
- Faster responses (smaller context window)
- Better suggestions (focused on one project)

### ✅ Future-Proof
- Easy to add features per-canvas (themes, layouts)
- Merge/split workflows ready
- Multi-user collaboration possible (canvas = unit of sharing)

---

## Open Questions to Decide

1. **Default max canvases?**
   - Option A: 3 (safe, conservative)
   - Option B: 5 (balanced)
   - Option C: 10 (power users)
   - **Decision:** Start with 5, make configurable

2. **Canvas naming?**
   - Option A: Free text (user types "Login Components")
   - Option B: Slugified (auto-convert to "login-components")
   - Option C: GUID (system-generated unique ID)
   - **Decision:** Free text + slugify for ID

3. **Merge behavior?**
   - Option A: Delete original canvases after merge
   - Option B: Keep originals + create merged copy
   - **Decision:** Keep originals (safer, allows undo)

4. **Canvas visibility in sidebar?**
   - Option A: Show all canvases in VS Code sidebar tree view
   - Option B: Command palette only
   - **Decision:** Both (tree view + command palette)

---

## Next Steps (Week 3 Implementation)

1. Create `.roopik/` folder structure
2. Refactor `CanvasPanel` to ID-based map
3. Add `roopik.newCanvas` command
4. Implement canvas state persistence
5. Add configurable max canvas limit
6. Test with 3+ canvases open simultaneously
7. Document performance characteristics

**AI Context & Merge features** → Deferred to Week 4-5 (foundation must be solid first)

---

## Summary

**Week 3 Goal:** Build multi-canvas foundation that scales from 1 to 10+ canvases without architectural changes.

**Key Principles:**
- 🎯 ID-based singleton (not global)
- 🧠 Complete context isolation
- ⚡ Configurable performance limits
- 🔒 Crash isolation via sandboxing
- 🔮 Future-proof for merge workflows

**Why Now?**
Because changing this later = refactoring weeks of work. Getting it right now = smooth sailing ahead.

---

**Files We'll Modify:**
- `extensions/roopik/src/canvasPanel.ts` (ID-based map)
- `extensions/roopik/src/extension.ts` (new commands)
- `extensions/roopik/package.json` (register commands)
- Create: `.roopik/config.json` schema
- Create: `extensions/roopik/src/config.ts` (config loader)

**Let's build resilient architecture from day 1!** 🚀
