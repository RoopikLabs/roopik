# Drag-Drop Element Reordering - Implementation Documentation

> **Last Updated**: December 2024
> **Status**: Phase 4 Complete (CDP DOM.moveTo + Undo), Phase 5 Pending (AST Source Update)

---

## Overview

This document covers the implementation of drag-drop element reordering in Roopik's Project Mode (Browser Preview). The feature allows users to visually drag elements in the browser and have those changes reflected in the source code.

### Architecture Flow

```
User Drags Element
        ↓
Inject Script (inspectModeScript.ts)
  - Ghost element visual
  - Drop zone detection
  - Drop zone indicators
        ↓
PostMessage to Extension
  { type: 'drag-ended', dropZone: {...} }
        ↓
DragDrop Feature (dragDrop.ts)
  - Validates drop zone
  - Executes CDP DOM.moveTo
  - Tracks in pending queue
        ↓
CDP Move Service (cdpMoveService.ts)
  - DOM.enable
  - DOM.getDocument
  - DOM.querySelector
  - DOM.moveTo
        ↓
Live DOM Update (instant visual)
        ↓
Pending Changes Queue
  - Track for undo
  - Track for apply
        ↓
[Future] AST Transform
  - Parse source file
  - Move JSX node
  - Write to pending file
        ↓
[Future] User Review & Apply
  - VSCode diff editor
  - Apply to source
```

---

## Feature Flag

The drag-drop feature can be enabled/disabled via a flag in `inspectModeScript.ts`:

```typescript
/**
 * DRAG ELEMENT FEATURE FLAG
 * Set to false to completely disable drag-drop element reordering.
 */
var DRAG_ELEMENT_ENABLED = true;  // Set to false to disable
```

When disabled:
- Element selection (inspect mode) still works
- Drag events are completely suppressed
- No ghost element or drop zones appear
- Changes tab in Inspect panel will be empty

---

## File Structure

### Drag-Drop Feature Module

```
src/vs/workbench/contrib/roopik/browser/projectMode/
├── features/
│   └── dragDrop/
│       ├── types.ts              # PendingMove, SourceLocation, callbacks
│       ├── pendingChangesQueue.ts # LIFO queue with undo tracking
│       ├── cdpMoveService.ts     # CDP DOM operations + stable element lookup
│       ├── dragDrop.ts           # Main feature class
│       └── index.ts              # Exports
│
├── components/
│   ├── browserControlBar.ts      # Control bar (has pending changes support)
│   ├── pendingChangesPanel.ts    # Floating panel UI (legacy, not visible over WebContentsView)
│   └── styleInspectPanel.ts      # Inspect panel with "Changes" tab
│
├── features/
│   └── styleInspect.ts           # Style inspect feature (hosts Changes tab)
│
└── editor.ts                     # Integration point
```

### UI Integration

The pending changes are shown in the **"Changes" tab** within the StyleInspect panel (right sidebar), not as a floating panel. This is because floating panels cannot render on top of WebContentsView (separate Chromium process).

---

## Implementation Details

### 1. Stable Element Identification (Onlook-inspired)

**Problem**: CSS selectors like `:nth-of-type()` change when elements move, breaking undo.

**Solution**: Use `data-roopik-source` attribute as a stable identifier (inspired by [Onlook's data-oid approach](https://github.com/onlook-dev/onlook)).

```typescript
// In cdpMoveService.ts

/**
 * Find element by data-roopik-source attribute (stable identifier)
 *
 * Unlike CSS selectors that change when elements move (e.g., :nth-of-type),
 * data-roopik-source contains the source file location which stays constant.
 */
async findElementBySource(browserViewId: number, sourceLocation: SourceLocation): Promise<string | null> {
  // Build source attribute value: file:line:col:endLine:endCol
  const sourceValue = [
    sourceLocation.file,
    sourceLocation.line,
    sourceLocation.column ?? 0,
    sourceLocation.endLine ?? sourceLocation.line,
    sourceLocation.endColumn ?? 0
  ].join(':');

  // Find element with matching attribute, then build fresh selector
  const script = `
    var elements = document.querySelectorAll('[data-roopik-source]');
    for (var i = 0; i < elements.length; i++) {
      if (elements[i].getAttribute('data-roopik-source') === '${sourceValue}') {
        return window.__roopikBuildSelector(elements[i]);
      }
    }
    return null;
  `;
  return await this.browserService.executeScript(browserViewId, script);
}
```

**Key Insight**: The `data-roopik-source` attribute is injected at build-time and maps DOM elements back to source code locations. This attribute doesn't change when elements are moved in the DOM, making it ideal for tracking elements across operations.

### 2. Undo Implementation

**Single Undo** (per-move):
```typescript
// In dragDrop.ts
async undoMove(browserViewId: number, moveId: string): Promise<boolean> {
  const move = this.pendingQueue.getMove(moveId);

  // Use source-based lookup to find element (stable identifier)
  const result = await this.cdpService.undoMoveWithSource(browserViewId, move);

  if (result.success) {
    this.pendingQueue.markUndone(moveId);
  }
  return result.success;
}
```

**Discard All** (page reload):
```typescript
// In editor.ts
private async undoAllPendingMoves(): Promise<void> {
  // Clear queue and reload page - most reliable way to restore original DOM
  this.dragDrop.clearPendingChanges();
  await this.refresh();  // Reloads page from source
}
```

**Why reload instead of sequential undo?**
1. Element selectors change after moves, making tracking unreliable
2. Complex nested moves can get out of sync
3. Page reload guarantees a clean state from source
4. DOM changes are ephemeral (like Chrome DevTools) - not persisted

### 3. Parent Selector (Full Path)

To ensure undo moves elements to the correct parent, we build a full-path unique selector:

```typescript
// In cdpMoveService.ts - getElementPosition()
function buildSelector(element) {
  var parts = [];
  var current = element;
  while (current && current !== document.body) {
    var selector = current.tagName.toLowerCase();
    if (current.id) {
      parts.unshift('#' + CSS.escape(current.id));
      break;
    }
    if (current.className) {
      selector += '.' + classes.map(CSS.escape).join('.');
    }
    // Add :nth-of-type for uniqueness
    var siblings = Array.from(parent.children).filter(s => s.tagName === current.tagName);
    if (siblings.length > 1) {
      selector += ':nth-of-type(' + (siblings.indexOf(current) + 1) + ')';
    }
    parts.unshift(selector);
    current = current.parentElement;
  }
  return parts.join(' > ');
}
```

**Before**: `div.container` (not unique)
**After**: `#root > div.app > main.content > div.container` (unique path)

### 4. Exposed Window Functions

The inject script exposes helper functions for CDP operations:

```typescript
// In inspectModeScript.ts

// Build unique CSS selector for any element
window.__roopikBuildSelector = function(el) {
  return getElementSelector(el);
};

// Show toast notification
window.__roopikShowToast = function(message) {
  showToast(message);
};

// Update selection overlay after DOM move
window.__roopikReselectElement = function() {
  updateOverlay(selectedOverlay, selectedLabel, selectedElement, '#22c55e', true);
};
```

### 5. Changes Tab UI

Integrated into StyleInspect panel as a "Changes" tab:

```
┌─────────────────────────────────────────┐
│ [Styles] [Computed] [Changes]           │
├─────────────────────────────────────────┤
│                                         │
│ ↕ <a.btn>                               │
│   reordered: 0 → 1               [Undo] │
│                                         │
│ ↕ <div.card>                            │
│   moved to .container            [Undo] │
│                                         │
├─────────────────────────────────────────┤
│ [Discard All]           [Apply All]     │
└─────────────────────────────────────────┘
```

**Callbacks in styleInspect.ts:**
```typescript
setOnUndoMoveCallback(callback: (moveId: string) => void): void
setOnUndoAllCallback(callback: () => void): void
setOnApplyAllCallback(callback: () => void): void
```

---

## How DOM Changes Work

### Persistence Model

DOM changes are **ephemeral** (not persisted to disk):

```
User drags element
        ↓
CDP DOM.moveTo (instant visual change in browser memory)
        ↓
Tracked in pending changes queue (in-memory)
        ↓
NOT written to source file until "Apply All"
        ↓
Page reload = original DOM restored from source
```

This is exactly how Chrome DevTools works - you can modify elements but refreshing restores them.

### Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│ Inject Script (inspectModeScript.ts)                        │
│ - Handles drag events                                       │
│ - Creates ghost element & drop indicators                   │
│ - Detects drop zones                                        │
│ - Sends PostMessage on drag-ended                           │
└─────────────────────────────────────────────────────────────┘
                              │ PostMessage
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ DragDrop Feature (dragDrop.ts)                              │
│ - Receives drag-ended message                               │
│ - Gets current element position (for undo)                  │
│ - Calls CDP service to execute move                         │
│ - Adds to pending changes queue                             │
└─────────────────────────────────────────────────────────────┘
                              │ CDP Commands
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ CDP Move Service (cdpMoveService.ts)                        │
│ - DOM.enable, DOM.getDocument                               │
│ - DOM.querySelector (find nodes)                            │
│ - DOM.moveTo (execute move)                                 │
│ - findElementBySource (stable lookup for undo)              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ Chromium Browser (WebContentsView)                          │
│ - DOM updated in memory                                     │
│ - Visual change is instant                                  │
│ - NOT persisted to disk                                     │
└─────────────────────────────────────────────────────────────┘
```

---

## Current Status

### Completed (Phases 1-4)

| Phase | Feature | Status |
|-------|---------|--------|
| 1 | Element selection (inspect mode) | ✅ Complete |
| 2 | Ghost element during drag | ✅ Complete |
| 3 | Drop zone detection & indicators | ✅ Complete |
| 4 | CDP DOM.moveTo integration | ✅ Complete |
| - | Pending changes queue | ✅ Complete |
| - | Changes tab in Inspect panel | ✅ Complete |
| - | Undo with stable element IDs | ✅ Complete |
| - | Discard All (page reload) | ✅ Complete |
| - | Feature flag to disable | ✅ Complete |

### Pending (Phase 5)

| Feature | Status | Notes |
|---------|--------|-------|
| AST Transform Service | TODO | Babel/TypeScript to move JSX nodes |
| Apply to source file | TODO | Write changes to actual source |
| Diff view integration | TODO | Show before/after in editor |

---

## Known Issues & Limitations

1. **Source tracking required**: Drag-drop only works for elements that have `data-roopik-source` attributes (injected at build-time). Plain HTML without source tracking won't support undo.

2. **React/JSX focused**: Source updates (Phase 5) will use JSX AST parsing. Other frameworks may need different parsers.

3. **No conflict detection**: If source file is modified in editor while changes are pending, source locations become stale.

4. **CSS constraints**: Elements may not align perfectly after move due to CSS flexbox/grid constraints in the component.

---

## Troubleshooting

### Drag not working
1. Check `DRAG_ELEMENT_ENABLED` flag is `true`
2. Check if inspect mode is enabled
3. Verify `data-roopik-source` attributes exist on elements

### Undo moves element to wrong position
1. Check browser console for selector being used
2. Verify parent selector is unique (full path)
3. Try "Discard All" to reload page instead

### Undo fails with "Element not found"
1. Element may not have `data-roopik-source` attribute
2. Source location format may be incorrect
3. Fall back to "Discard All" which reloads page

### Changes tab empty
1. Check `DRAG_ELEMENT_ENABLED` is `true`
2. Verify drag was successful (check for toast)
3. Check pending changes queue has entries

---

## Related Files

### Core Implementation
- `features/dragDrop/dragDrop.ts` - Main feature class
- `features/dragDrop/cdpMoveService.ts` - CDP operations
- `features/dragDrop/pendingChangesQueue.ts` - Queue management
- `features/dragDrop/types.ts` - Type definitions

### UI Components
- `components/styleInspectPanel.ts` - Changes tab UI
- `features/styleInspect.ts` - Feature wrapper

### Inject Script
- `scripts/inspectModeScript.ts` - Browser-side drag handling

### Integration
- `editor.ts` - Wiring everything together

---

## What's Next (Pending Work)

### Phase 5: Apply Changes to Source Code

The current implementation only manipulates the DOM visually. To make changes permanent, we need to write them back to source files.

#### 5.1 AST Transform Service (TODO)

Create a service that can parse and modify JSX/TSX source code:

```typescript
// Proposed: electron-main/astTransform/jsxMoveService.ts

interface IJSXMoveService {
  // Parse source file and locate JSX element by source location
  findElement(filePath: string, location: SourceLocation): ASTNode | null;

  // Move element in AST to new parent/index
  moveElement(
    filePath: string,
    elementLocation: SourceLocation,
    newParentLocation: SourceLocation,
    newIndex: number
  ): Promise<string>;  // Returns modified source code

  // Format code with Prettier
  formatCode(code: string, filePath: string): Promise<string>;
}
```

**Libraries to use:**
- `@babel/parser` - Parse JSX/TSX
- `@babel/traverse` - Find nodes by location
- `@babel/generator` - Generate code from AST
- `prettier` - Format output

#### 5.2 IPC Channel for Source Updates (TODO)

Browser process cannot write files directly. Need IPC channel to main process:

```typescript
// Proposed channel
interface ISourceUpdateChannel {
  // Apply a pending move to source file
  applyMove(move: PendingMove): Promise<ApplyResult>;

  // Apply all pending moves
  applyAllMoves(moves: PendingMove[]): Promise<ApplyResult[]>;

  // Preview change (returns diff)
  previewMove(move: PendingMove): Promise<DiffResult>;
}
```

#### 5.3 Diff View Integration (TODO)

Show before/after diff in VSCode editor before applying:

```typescript
// In editor.ts
private async previewPendingMove(moveId: string): Promise<void> {
  const move = this.dragDrop.getMove(moveId);
  const diff = await this.sourceUpdateChannel.previewMove(move);

  // Open diff editor
  vscode.commands.executeCommand(
    'vscode.diff',
    originalUri,
    pendingUri,
    `${filename} (Pending Change)`
  );
}
```

#### 5.4 Apply Button Implementation (TODO)

Wire the "Apply All" button to actually write to source:

```typescript
// In editor.ts
private async applyAllPendingMoves(): Promise<void> {
  const moves = this.dragDrop.getPendingMoves();

  for (const move of moves) {
    if (!move.sourceLocation) {
      // Skip moves without source info
      continue;
    }

    const result = await this.sourceUpdateChannel.applyMove(move);
    if (result.success) {
      this.dragDrop.markApplied(move.id);
    }
  }

  // HMR will auto-refresh browser with new source
}
```

### Future Enhancements (Post-Phase 5)

| Feature | Description | Priority |
|---------|-------------|----------|
| Multi-framework support | Vue, Svelte, Angular parsers | Medium |
| Style drag-drop | Drag styles between elements | High |
| Undo/Redo history | Full session history with keyboard shortcuts | Medium |
| Conflict detection | Warn if source changed while editing | Low |
| Collaborative editing | Real-time sync between users | Future |
| AI agent integration | Same APIs for AI-driven changes | High |

---

## References

- [Onlook](https://github.com/onlook-dev/onlook) - Inspiration for stable element IDs (data-oid)
- [Chrome DevTools Protocol - DOM](https://chromedevtools.github.io/devtools-protocol/tot/DOM/) - CDP DOM commands
- [Babel Parser](https://babeljs.io/docs/babel-parser) - JSX/TSX parsing
- [VSCode Diff Editor](https://code.visualstudio.com/api/references/commands#vscode.diff) - Diff view API
