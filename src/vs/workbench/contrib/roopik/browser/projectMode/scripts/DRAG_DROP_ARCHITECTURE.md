# Drag & Drop Architecture

This document explains the element drag-and-drop system in Roopik's inspect mode.

## Important: Project-Only Feature

**Drag mode is ONLY enabled for pages hosted by Roopik's dev server.**

External websites (google.com, youtube.com, etc.) can be inspected but NOT dragged because:
1. We can't save changes to external sites (no source access)
2. No `data-roopik-source` attributes for source mapping
3. Changes would be lost on refresh

### Detection Logic
```javascript
function isDragModeAvailable() {
    // Check if page has elements with our source tracking
    return document.querySelector('[data-roopik-source]') !== null;
}
```

### Visual Difference
| Mode | Cursor on Selected | Drag Enabled |
|------|-------------------|--------------|
| Our Project | `grab` | ✅ Yes |
| External Site | `default` | ❌ No |

---

## Overview

The drag-and-drop system allows users to visually reorder elements in the browser preview. It consists of 5 phases:

| Phase | Status | Description |
|-------|--------|-------------|
| 1 | ✅ Complete | Grab cursor + Chat icon on selected element |
| 2 | ✅ Complete | Drag visual feedback (ghost element) |
| 3 | ✅ Complete | Drop zone detection + indicators |
| 4 | ✅ Complete | CDP DOM.moveTo for live reordering |
| 5 | 🔲 Pending | AST source code update on drop |

---

## Phase 1: Selection & Grab Cursor

### Flow
```
User clicks element → Element selected (green overlay) → Grab cursor appears
```

### Visual States
| State | Cursor | Overlay Color |
|-------|--------|---------------|
| Hover (not selected) | `crosshair` | Blue (#007acc) |
| Selected | `grab` | Green (#22c55e) |
| Dragging | `grabbing` | Green (stays) |

### Key Code
```javascript
// Selected overlay has pointer-events: auto for cursor detection
selectedOverlay.style.cursor = 'grab';

// On mousedown, switch to grabbing
selectedOverlay.style.cursor = 'grabbing';
```

---

## Phase 2: Ghost Element (Drag Preview)

### Flow
```
Mousedown on selected overlay → Create ghost → Ghost follows cursor → Mouseup removes ghost
```

### Ghost Element Properties
- Semi-transparent clone of selected element (opacity: 0.7)
- Max size: 300px × 200px (for large elements)
- Centered on cursor
- Scale: 0.95x with shadow
- z-index: 2147483648 (above everything)

### Events Sent via `__roopikBridge`
```javascript
// On drag start
{ type: 'drag-started', selector: string, tagName: string }

// On drag end
{ type: 'drag-ended', dropX: number, dropY: number, hasDropZone: boolean, dropZone?: {...} }
```

---

## Phase 3: Drop Zone Detection

### What is a Drop Zone?
A drop zone is a valid position where the dragged element can be inserted. It consists of:
- **Parent container**: The element that will contain the dropped element
- **Index**: Position among siblings (0 = first child)
- **Position**: `'before'` | `'after'` | `'inside'`

### Valid vs Invalid Drop Areas

#### ✅ VALID Drop Areas
| Area | Reason |
|------|--------|
| Between siblings in a container | Normal reordering |
| Inside empty containers | First child insertion |
| Before first sibling | Insert at start |
| After last sibling | Insert at end |
| Different parent container | Move to new parent |

#### ❌ INVALID Drop Areas
| Area | Reason |
|------|--------|
| Selected element itself | Can't drop into self |
| Descendants of selected element | Would create circular reference |
| `<html>` element | Not a valid container |
| `<script>`, `<style>`, `<link>` elements | Not visual elements |
| Our UI overlays | Internal elements |

### Detection Logic

```javascript
function getDropTarget(x, y) {
    // 1. Get element at cursor (hide our overlays first)
    var elementAtPoint = document.elementFromPoint(x, y);

    // 2. Check if invalid
    if (isOurElement(elementAtPoint)) return null;
    if (elementAtPoint === selectedElement) return null;
    if (isDescendant(selectedElement, elementAtPoint)) return null;

    // 3. Find parent container
    var parent = elementAtPoint.parentElement;

    // 4. Get siblings and calculate insertion index
    var siblings = parent.children.filter(validSibling);
    var direction = getLayoutDirection(parent); // 'horizontal' or 'vertical'
    var index = findInsertIndex(siblings, x, y, direction);

    return { parent, siblings, index, position };
}
```

### Layout Direction Detection

The system detects whether a container uses horizontal or vertical layout:

```javascript
function getLayoutDirection(parent) {
    var style = getComputedStyle(parent);

    // Flexbox
    if (style.display === 'flex') {
        if (style.flexDirection === 'row') return 'horizontal';
        return 'vertical';
    }

    // Grid
    if (style.display === 'grid') {
        if (style.gridAutoFlow.includes('column')) return 'horizontal';
        if (style.gridTemplateColumns has multiple columns) return 'horizontal';
        return 'vertical';
    }

    // Default block layout
    return 'vertical';
}
```

### Visual Indicators

| Indicator | Color | Style | Purpose |
|-----------|-------|-------|---------|
| Drop target overlay | Blue (#3b82f6) | 2px dashed | Highlights parent container |
| Drop indicator line | Blue (#3b82f6) | 4px solid | Shows exact insertion point |
| Invalid drop overlay | Red (#ef4444) | 3px dotted | Shows invalid area |

### Z-Index Hierarchy
```
2147483648  Ghost element (follows cursor)
2147483647  Toast, Labels, Chat icon, Drop indicator
2147483646  Hover overlay, Invalid drop overlay
2147483645  Selected overlay
2147483644  Drop target overlay
```

---

## Phase 4: CDP DOM.moveTo (Complete)

### Flow
```
Valid drop detected → editor.ts receives drag-ended → Call CDP DOM.moveTo → DOM updates live → Re-select moved element
```

### Implementation

The CDP DOM.moveTo implementation is in `browser/projectMode/editor.ts`:

```typescript
// handleDragEnded() method
1. Get document root via DOM.getDocument
2. Query dragged element's nodeId via DOM.querySelector
3. Query target parent's nodeId via DOM.querySelector
4. Calculate insertBeforeNodeId from drop index
5. Call DOM.moveTo to move element
6. Call __roopikReselectElement to update overlays
7. Show toast feedback via __roopikShowToast
```

### CDP Commands Used
```javascript
// Get document root
DOM.getDocument({ depth: 0 })

// Get node ID for element
DOM.querySelector({ nodeId: rootNodeId, selector: elementSelector })

// Move node to new position
DOM.moveTo({ nodeId: elementNodeId, targetNodeId: parentNodeId, insertBeforeNodeId?: siblingNodeId })
```

### Exported Functions
The inject script exports these functions for VSCode to call:
- `window.__roopikShowToast(message)` - Show toast feedback
- `window.__roopikReselectElement()` - Update overlays after move

### Sync with Style Panel
After move, the system:
1. Re-selects the moved element (updates overlay bounds)
2. Element stays selected with green overlay
3. Style panel can be used to inspect the moved element

---

## Phase 5: AST Source Update (Pending)

### Planned Flow
```
DOM move successful → Parse source file → Find JSX element → Move in AST → Write file
```

### Challenges
- Matching DOM element to source location (via `data-roopik-source`)
- Handling different JSX structures
- Preserving formatting
- Handling fragments and conditional renders

---

## State Variables

```javascript
// Drag state
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragGhost = null;

// Drop zone state
let currentDropZone = null;  // { parent, siblings, index, position }
let dropIndicator = null;     // Blue line element
let dropTargetOverlay = null; // Blue dashed parent highlight
let invalidDropOverlay = null; // Red dotted invalid highlight
let lastDropValid = false;
```

---

## Event Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  User clicks element in browser                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Element selected (green overlay, grab cursor)               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ mousedown on selected overlay
┌─────────────────────────────────────────────────────────────┐
│  Drag started                                                │
│  - Create ghost element                                      │
│  - Send 'drag-started' via __roopikBridge                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ mousemove
┌─────────────────────────────────────────────────────────────┐
│  Drag in progress                                            │
│  - Update ghost position                                     │
│  - Detect drop zone at cursor                               │
│  - Show blue indicator (valid) or red overlay (invalid)     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ mouseup
┌─────────────────────────────────────────────────────────────┐
│  Drag ended                                                  │
│  - Remove ghost                                              │
│  - Hide indicators                                           │
│  - Send 'drag-ended' with dropZone info                     │
│  - Show toast feedback                                       │
│  - [Phase 4] Execute CDP DOM.moveTo                         │
│  - [Phase 5] Update source AST                              │
└─────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
browser/projectMode/
├── features/
│   └── inspectMode.ts          # Class wrapper, enable/disable
└── scripts/
    ├── inspectModeScript.ts    # Full inject script (~1100 lines)
    └── DRAG_DROP_ARCHITECTURE.md  # This documentation
```

---

## Testing Checklist

### Phase 1-3 (Current)
- [ ] Select element → grab cursor appears
- [ ] Drag → ghost follows cursor
- [ ] Drag over valid area → blue indicators appear
- [ ] Drag over selected element → red dotted overlay
- [ ] Drag over descendant of selected → red dotted overlay
- [ ] Drop on valid area → toast shows index
- [ ] Drop on invalid area → toast shows error
- [ ] ESC during drag → cancels (TODO)

### Phase 4 (Pending)
- [ ] Drop → DOM actually moves
- [ ] Moved element stays selected
- [ ] Style panel updates

### Phase 5 (Pending)
- [ ] Source file updated after move
- [ ] Formatting preserved
- [ ] Undo works

---

## Future Architecture: DOM → Source Sync

### The Challenge
When user drags elements:
1. DOM changes immediately (via CDP)
2. But source code hasn't changed
3. Page refresh would lose changes
4. Need to sync DOM changes back to source files

### Solution: Pending Changes Queue

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (DOM)                                               │
│  - User drags element                                        │
│  - CDP DOM.moveTo (live preview)                            │
│  - Change stored in pendingChanges[]                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Pending Changes Queue (In Memory)                          │
│  [{                                                         │
│    type: 'move',                                            │
│    elementSelector: 'div.card:nth-of-type(2)',             │
│    sourceLocation: { file: 'Card.tsx', line: 15 },         │
│    targetParent: { selector: '.container', line: 10 },     │
│    targetIndex: 0,                                          │
│    timestamp: 1702...                                       │
│  }, ...]                                                    │
│                                                             │
│  Features:                                                  │
│  - Undo/Redo within session                                │
│  - Merge consecutive moves of same element                 │
│  - Clear on page navigation                                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ User clicks "Save Changes"
┌─────────────────────────────────────────────────────────────┐
│  Review Panel (Future UI)                                    │
│  - List of pending changes                                  │
│  - Visual diff preview                                      │
│  - Accept/Reject individual changes                         │
│  - "Save All" button                                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  AST Transformer (Main Process)                             │
│  - Parse source file (babel for JSX, vue-compiler, etc.)   │
│  - Find JSX node via data-roopik-source location           │
│  - Apply move operation in AST                             │
│  - Generate new code (preserve formatting via Prettier)    │
│  - Write to file                                            │
│  - HMR updates browser automatically                       │
└─────────────────────────────────────────────────────────────┘
```

### Why This Approach?

| Approach | Pros | Cons |
|----------|------|------|
| **Immediate write** | Simple | Risky, no preview |
| **Git-based undo** | Familiar | Heavy, requires commits |
| **Pending queue** ✅ | Preview, undo, batch | More complex |

### Key Design Decisions

1. **Changes are virtual until saved**
   - DOM updates immediately (good UX)
   - Source unchanged until explicit save
   - Page refresh = changes lost (with warning)

2. **Review before commit**
   - User sees what will change
   - Can reject individual changes
   - Prevents accidental damage

3. **Batch operations**
   - Multiple drags = one save operation
   - Better for git history
   - Atomic changes

### State Variable
```javascript
// In inject script
let pendingChanges = [];

// Change format
{
  type: 'move',
  elementSelector: string,      // CSS selector of moved element
  sourceLocation: {             // From data-roopik-source
    file: string,
    line: number,
    column?: number
  },
  targetParent: {
    selector: string,
    sourceLocation?: {...}
  },
  targetIndex: number,          // Position among siblings
  timestamp: number
}
```
