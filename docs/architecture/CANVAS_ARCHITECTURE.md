# Canvas Architecture Guide

> A comprehensive guide to understanding the canvas webview architecture and component hierarchy.

---

## 🏗️ Architecture Overview

The canvas webview is built with React and consists of multiple layers working together to provide an infinite canvas experience for component previews.

### Component Hierarchy

```
App.tsx (Main Controller)
├── FloatingToolbar (Top toolbar with sample components)
├── InfiniteCanvas (The infinite scrollable canvas)
│   └── SandboxPreview[] (Multiple sandbox instances)
│       └── iframe (Individual component preview)
├── StatusBar (Bottom status bar)
│   └── ColorPicker (Background color selector)
└── DeleteConfirmModal (Delete confirmation popup)
```

---

## 📁 File Roles and Responsibilities

### **App.tsx** - Main Application Controller (The Boss)

**Location**: `extensions/roopik/webview-ui/src/App.tsx`

**Role**: The root component and main orchestrator of the entire webview application.

**Responsibilities**:
- **State Management**: Manages ALL sandboxes, viewport transform, selection, focus states
- **Event Coordination**: Handles clicks, deletes, keyboard shortcuts
- **Business Logic**:
  - Grid reorganization (4-column layout)
  - Auto-save canvas state (debounced 500ms)
  - Zoom controls (zoom in/out/reset)
  - Focus mode (80% viewport)
  - Delete confirmation flow
- **Component Composition**: Renders and connects all UI components
- **Persistence**: Auto-saves to extension via VS Code API

**Key State**:
```typescript
- transform: { x, y, scale }     // Canvas viewport position/zoom
- sandboxes: Sandbox[]            // All sandbox instances
- selectedSandboxId: string       // Currently selected sandbox
- focusedSandboxId: string        // Currently focused (zoomed) sandbox
- pattern: BackgroundPattern      // Canvas background (grid/dots/plain)
- showDeleteModal: boolean        // Delete confirmation visibility
```

**Key Functions**:
- `fitAllSandboxes()` - Auto-zoom to show all sandboxes
- `focusSandbox()` - Focus on a single sandbox (80% viewport)
- `reorganizeToGrid()` - Reorganize sandboxes to 4-column grid
- `handleResetView()` - Smart reset (origin if empty, reorganize if has sandboxes)
- `confirmDelete()` - Delete sandbox and auto-reorganize remaining

**Instances per webview**: **1**

---

### **InfiniteCanvas.tsx** - Canvas Container (The Stage)

**Location**: `extensions/roopik/webview-ui/src/components/InfiniteCanvas.tsx`

**Role**: Container that handles canvas interactions and renders all sandboxes.

**Responsibilities**:
- **Pan/Zoom/Scroll**: Mouse drag to pan, wheel to zoom
- **Background Rendering**: Dot/grid patterns with proper offset
- **Sandbox Containment**: Renders all SandboxPreview instances
- **Drag Detection**: Distinguishes between canvas pan and sandbox drag
- **Transform Management**: Applies CSS transform to canvas-content layer

**Key Interactions**:
- Left/Middle mouse drag → Pan canvas
- Wheel scroll → Zoom in/out (intensity: 0.001)
- Drag sandbox label → Move sandbox
- Click sandbox → Select
- Double-click sandbox → Focus mode

**Props Interface**:
```typescript
{
  sandboxes: Sandbox[]
  selectedSandboxId: string | null
  focusedSandboxId: string | null
  transform: Transform
  pattern: BackgroundPattern
  onTransformChange: (transform) => void
  onSandboxClick: (id) => void
  onSandboxDoubleClick: (id) => void
  onSandboxUpdate: (id, updates) => void
  onSandboxDelete: (id) => void
}
```

**Instances per webview**: **1**

---

### **SandboxPreview.tsx** - Individual Sandbox (The Actor)

**Location**: `extensions/roopik/webview-ui/src/components/SandboxPreview.tsx`

**Role**: Represents a single component preview on the canvas.

**Responsibilities**:
- **Position Management**: Maintains x, y coordinates and z-index
- **Visual States**: Shows hover, selected, focused states with different colors
- **Action Buttons**: Expand (TODO) and Delete icons (visible on hover/select/focus)
- **Iframe Management**: Contains and communicates with component preview iframe
- **Drag Handle**: Label acts as drag handle for repositioning

**Visual States**:
```typescript
Hover:    Orange border (rgba(255, 165, 0, 0.5))
Selected: Blue-violet border (rgba(75, 85, 190, 0.6))
Focused:  Cyan-blue border (rgba(0, 122, 204, 0.6))
Default:  Subtle white border (rgba(255, 255, 255, 0.1))
```

**Components**:
- **Sandbox Label** (top-left): Drag handle with 6-dot icon + sandbox ID
- **Action Buttons** (top-right): Expand and Delete icons (borderless, opacity-based hover)
- **Content Area**: White rounded box containing iframe
- **Iframe**: Renders React component with Babel transpilation

**Props Interface**:
```typescript
{
  sandbox: Sandbox            // Position, size, z-index, content
  isSelected: boolean         // Selected state
  isFocused: boolean          // Focused state
  onMouseDown: (e) => void    // Drag initiation
  onClick: () => void         // Selection
  onDoubleClick: () => void   // Focus mode
  onDelete: () => void        // Delete handler
}
```

**Instances per webview**: **Multiple** (one per sandbox)

---

### **StatusBar.tsx** - Status Information Display

**Location**: `extensions/roopik/webview-ui/src/components/StatusBar.tsx`

**Role**: Displays canvas state information at the bottom of the viewport.

**Responsibilities**:
- **Zoom Display**: Shows current zoom level (e.g., "100%", "0.75x")
- **Position Display**: Shows canvas transform (X, Y coordinates)
- **FPS Counter**: Real-time performance monitoring
- **Sandbox Count**: Total number of sandboxes
- **Selection Indicator**: Shows selected/focused sandbox ID with color coding
- **Background Color Picker**: Button to change canvas background color
- **Pattern Toggle**: Button to switch background patterns
- **Zoom Controls**: +/− buttons and reset button

**Color Coding**:
- Focused: `#4fc3f7` (cyan-blue)
- Selected: `#7c87f7` (blue-violet)

**Instances per webview**: **1**

---

### **DeleteConfirmModal.tsx** - Deletion Confirmation

**Location**: `extensions/roopik/webview-ui/src/components/DeleteConfirmModal.tsx`

**Role**: Professional modal dialog for confirming sandbox deletion.

**Responsibilities**:
- **Visual Design**: Glassmorphic design with backdrop blur
- **User Confirmation**: Two-button interface (Cancel / Delete)
- **Animation**: Smooth fade-in and slide-up entrance
- **Click-outside**: Cancel deletion on overlay click
- **Visual Warning**: Red delete icon and red delete button

**Design Features**:
- Fixed position with flexbox centering (always centered in viewport)
- Backdrop blur: 8px
- Modal animations: fade-in (0.2s) + slide-up (0.3s)
- Red gradient delete button with hover effects

**Instances per webview**: **0-1** (conditional rendering)

---

### **FloatingToolbar.tsx** - Sample Component Loader

**Location**: `extensions/roopik/webview-ui/src/components/FloatingToolbar.tsx`

**Role**: Top toolbar for loading sample components onto the canvas.

**Responsibilities**:
- Display tab name ("Canvas")
- Provide buttons to load pre-defined sample components
- Send component load requests to extension

**Instances per webview**: **1**

---

### **ColorPicker.tsx** - Background Color Selector

**Location**: `extensions/roopik/webview-ui/src/components/ColorPicker.tsx`

**Role**: Professional color picker popup for changing canvas background color.

**Responsibilities**:
- **Color Button**: Display current background color as a swatch
- **Popup Menu**: Show vertical list of standard professional colors
- **Color Selection**: Apply selected color to canvas background
- **Click Outside**: Close picker when clicking outside
- **Visual Feedback**: Highlight selected color with checkmark

**Standard Colors**:
- Midnight Black: `#000000` (default)
- Charcoal: `#1a1a1a`
- Dark Slate: `#2d3748`
- Navy Blue: `#1e293b`
- Deep Purple: `#1e1b4b`
- Dark Teal: `#134e4a`
- Forest Green: `#14532d`
- Burgundy: `#4c0519`

**Design Features**:
- Glassmorphic popup with backdrop blur
- Smooth slide-up animation (0.2s)
- Each color shows swatch + name
- Selected color has cyan checkmark
- Hover effects on color options

**Instances per webview**: **1**

---

## 🔄 Data Flow

### Component Addition Flow
```
User clicks sample button
    → FloatingToolbar
    → App.tsx (vscode.postMessage)
    → Extension (canvasPanel.ts)
    → Sandbox server creates component
    → Extension sends 'componentReady' message
    → App.tsx receives message
    → Creates new Sandbox object with grid position
    → Adds to sandboxes state
    → Auto-zoom to fit all sandboxes
```

### Deletion Flow
```
User clicks delete icon
    → SandboxPreview (onDelete)
    → InfiniteCanvas (onSandboxDelete)
    → App.tsx (handleSandboxDelete)
    → Sets selectedSandboxId and showDeleteModal
    → DeleteConfirmModal appears
    → User clicks "Delete"
    → App.tsx (confirmDelete)
    → Filters out sandbox from state
    → Calls reorganizeToGrid with updated list
    → Remaining sandboxes reorganize to fill gap
```

### Focus Mode Flow
```
User double-clicks sandbox
    → SandboxPreview (onDoubleClick)
    → InfiniteCanvas (onSandboxDoubleClick)
    → App.tsx (focusSandbox)
    → Calculates 80% viewport dimensions
    → Centers sandbox in viewport
    → Sets transform to zoom and center
    → Sets focusedSandboxId
```

---

## 📐 Layout Constants

### Grid Layout
```typescript
SANDBOX_WIDTH = 500px
SANDBOX_HEIGHT = 500px
GRID_COLUMNS = 4
CONTAINER_MARGIN = 20px
CONTAINER_PADDING_LR = 120px  // Left/Right
CONTAINER_PADDING_TB = 40px   // Top/Bottom
GAP_X = 60px                  // Horizontal gap between sandboxes
GAP_Y = 60px                  // Vertical gap between sandboxes
START_X = 100px               // Grid starting X
START_Y = 100px               // Grid starting Y
```

### Focus Mode
```typescript
USABLE_HEIGHT = viewportHeight * 0.8  // 80% of viewport
USABLE_WIDTH = viewportWidth * 0.9    // 90% of viewport
MAX_SCALE = 1.2                       // Allow up to 120% zoom for small components
```

---

## 🎨 Color System

### Border Colors
| State | Color | RGBA |
|-------|-------|------|
| Hover | Orange | `rgba(255, 165, 0, 0.5)` |
| Selected | Blue-Violet | `rgba(75, 85, 190, 0.6)` |
| Focused | Cyan-Blue | `rgba(0, 122, 204, 0.6)` |
| Default | White | `rgba(255, 255, 255, 0.1)` |

### Background Patterns
- **Grid**: White lines with 5% opacity
- **Dots**: White dots with 15% opacity
- **Plain**: No pattern (solid background)

---

## 🔧 Key Technologies

- **React** - UI component library
- **TypeScript** - Type-safe JavaScript
- **Vite** - Build tool and dev server
- **CSS-in-JS** - Inline styles with dynamic states
- **VS Code Webview API** - Communication with extension
- **Babel Standalone** - Client-side JSX transpilation (in iframe)

---

## 🚀 Performance Optimizations

1. **Debounced Auto-Save**: 500ms debounce on state changes
2. **CSS Transitions**: Smooth transform changes (0.5s cubic-bezier)
3. **Z-Index Management**: Click-to-front without re-rendering all sandboxes
4. **Conditional Rendering**: Action buttons only render when visible
5. **Transform Origin**: Canvas transform origin at (0, 0) for efficient zooming

---

## 📝 Future Enhancements

- **Expand/Fullscreen Mode**: Button exists, functionality TODO
- **Drag Disable Setting**: Optional setting to lock sandboxes to grid
- **Variant Support**: Multiple component variants side-by-side
- **Collaboration**: Real-time multi-user canvas editing
- **Export/Import**: Save/load canvas layouts

---

## 🎯 Quick Reference

### To add a new sandbox programmatically:
```typescript
const newSandbox: Sandbox = {
  id: 'unique-id',
  x: 100,
  y: 100,
  width: 500,
  height: 500,
  zIndex: 0,
  sandboxMessage: { type: 'init', code: '...', cdnUrls: [...] }
};
_setSandboxes(prev => [...prev, newSandbox]);
```

### To focus on a specific sandbox:
```typescript
focusSandbox(sandboxId);  // Focus (80% viewport)
focusSandbox(sandboxId);  // Double-call to unfocus
```

### To reorganize all sandboxes:
```typescript
reorganizeToGrid();  // Uses current sandboxes state
// OR
reorganizeToGrid(updatedSandboxes);  // Uses provided list
```

---

*Last updated: 2025-01-18*
