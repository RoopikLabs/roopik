# Drag & Drop Architecture

This document explains the element drag-and-drop system in Roopik's inspect mode.

## Overview

The drag-and-drop system allows users to visually reorder elements in the browser preview. It consists of 5 phases:

| Phase | Status | Description |
|-------|--------|-------------|
| 1 | ✅ Complete | Grab cursor + Chat icon on selected element |
| 2 | ✅ Complete | Drag visual feedback (ghost element) |
| 3 | ✅ Complete | Drop zone detection + indicators |
| 4 | 🔲 Pending | CDP DOM.moveTo for live reordering |
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

## Phase 4: CDP DOM.moveTo (Pending)

### Planned Flow
```
Valid drop detected → Call CDP DOM.moveTo → DOM updates live → Re-select moved element
```

### CDP Commands to Use
```javascript
// Get node ID for element
DOM.querySelector({ nodeId: documentNodeId, selector: elementSelector })

// Move node to new position
DOM.moveTo({ nodeId: elementNodeId, targetNodeId: parentNodeId, insertBeforeNodeId?: siblingNodeId })
```

### Sync with Style Panel
After move, the system will:
1. Re-select the moved element (updates `__roopikInspectResult`)
2. Send `element-selected` event via `__roopikBridge`
3. Style panel receives event and re-fetches styles

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
