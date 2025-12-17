# Drag-Drop Element Reordering - Implementation Documentation

> **Last Updated**: December 2024
> **Status**: Phase 4 Complete (CDP DOM.moveTo), Phase 5 Pending (AST Source Update)

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

## File Structure

### Drag-Drop Feature Module

```
src/vs/workbench/contrib/roopik/browser/projectMode/
├── features/
│   └── dragDrop/
│       ├── types.ts              # PendingMove, SourceLocation, callbacks
│       ├── pendingChangesQueue.ts # LIFO queue with undo tracking
│       ├── cdpMoveService.ts     # CDP DOM operations
│       ├── dragDrop.ts           # Main feature class
│       └── index.ts              # Exports
│
├── components/
│   ├── browserControlBar.ts      # Added pending changes badge
│   └── pendingChangesPanel.ts    # Floating panel UI
│
└── editor.ts                     # Integration point
```

### Pending Changes Module (Standalone)

```
src/vs/workbench/contrib/roopik/
├── common/pendingChanges/
│   ├── types.ts                  # IPendingFile, IPendingChangesConfig
│   ├── index.ts                  # Exports
│   └── README.md                 # Documentation
│
└── electron-main/pendingChanges/
    ├── pendingChangesService.ts  # File system operations
    └── index.ts                  # Exports
```

---

## Implementation Details

### 1. Drag-Drop Types (`features/dragDrop/types.ts`)

```typescript
/**
 * Represents a pending move operation
 */
export interface PendingMove {
  id: string;                      // Unique identifier
  elementSelector: string;         // CSS selector of moved element
  elementTagName: string;          // Tag name for display
  sourceLocation: SourceLocation | null;  // data-roopik-source info
  fromParent: string;              // Original parent selector
  fromIndex: number;               // Original index in parent
  toParent: string;                // New parent selector
  toIndex: number;                 // New index in parent
  timestamp: number;               // When move occurred
  status: PendingMoveStatus;       // 'pending' | 'applied' | 'undone'
}

/**
 * Source location from data-roopik-source attribute
 */
export interface SourceLocation {
  file: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
}
```

### 2. Pending Changes Queue (`features/dragDrop/pendingChangesQueue.ts`)

Manages the queue of pending moves with LIFO undo behavior.

**Key Methods:**
- `add(move)` - Add new move to queue
- `markUndone(id)` - Mark move as undone
- `markApplied(id)` - Mark move as applied
- `getPendingMoves()` - Get all pending moves
- `getPendingCount()` - Get count of pending moves
- `clear()` - Clear all moves

**Behavior:**
- New moves are added with `status: 'pending'`
- Undo marks as `'undone'` (doesn't remove, for history)
- Apply marks as `'applied'`
- Only `'pending'` moves are returned by `getPendingMoves()`

### 3. CDP Move Service (`features/dragDrop/cdpMoveService.ts`)

Handles Chrome DevTools Protocol operations for DOM manipulation.

**Key Methods:**

```typescript
// Enable DOM domain (required before any DOM operations)
async enableDOM(browserViewId: number): Promise<void>

// Get document root with full tree
async getDocumentRoot(browserViewId: number): Promise<number | null>

// Get nodeId for CSS selector
async getNodeId(browserViewId, rootNodeId, selector): Promise<number | null>

// Get element's current position (for undo tracking)
async getElementPosition(browserViewId, selector): Promise<{
  parentSelector: string;
  index: number;
} | null>

// Find reference node for insertBefore
async findReferenceNode(browserViewId, parentSelector, elementSelector, targetIndex): Promise<ReferenceNodeResult>

// Move element using CDP DOM.moveTo
async moveElement(browserViewId, elementSelector, parentSelector, targetIndex): Promise<MoveResult>

// Undo move (move back to original position)
async undoMove(browserViewId, elementSelector, originalParent, originalIndex): Promise<MoveResult>
```

**CDP Commands Used:**
- `DOM.enable` - Enable DOM domain
- `DOM.getDocument` - Get document root (with depth: -1 for full tree)
- `DOM.querySelector` - Find node by selector
- `DOM.moveTo` - Move node to new parent/position

### 4. DragDrop Feature Class (`features/dragDrop/dragDrop.ts`)

Main feature class that orchestrates drag-drop operations.

**Constructor:**
```typescript
constructor(
  browserService: IProjectModeService,
  logger: ILogger
)
```

**Event Handlers:**
```typescript
// Called when drag starts (just logging)
handleDragStarted(message: DragStartedMessage): void

// Called when drag ends - main entry point
async handleDragEnded(browserViewId: number, message: DragEndedMessage): Promise<void>
```

**Pending Changes Management:**
```typescript
getPendingMoves(): PendingMove[]
getPendingCount(): number
hasPendingChanges(): boolean
async undoMove(browserViewId, moveId): Promise<boolean>
async undoLastMove(browserViewId): Promise<boolean>
clearPendingChanges(): void
```

**Callback:**
```typescript
setOnPendingMovesChanged(callback: OnPendingMovesChangedCallback | null): void
```

### 5. Browser Control Bar Badge (`components/browserControlBar.ts`)

Added pending changes button with badge to the control bar.

**Config Addition:**
```typescript
interface IBrowserControlBarConfig {
  // ... existing
  showPendingChanges?: boolean;
}
```

**Callback Addition:**
```typescript
interface IBrowserControlBarCallbacks {
  // ... existing
  onPendingChangesClick?: () => void;
}
```

**Methods:**
```typescript
// Update badge count
setPendingChangesCount(count: number): void
```

**Visual:**
- Button with icon
- Badge showing count (hidden when 0)
- Badge shows "99+" for counts > 99

### 6. Pending Changes Panel (`components/pendingChangesPanel.ts`)

Floating panel showing pending moves.

**UI Structure:**
```
┌─────────────────────────────────────────┐
│ Pending Changes                    [×]  │
├─────────────────────────────────────────┤
│ ↕ <div>                                 │
│   reordered: 2 → 0               [Undo] │
├─────────────────────────────────────────┤
│ ↕ <button>                              │
│   moved to .header               [Undo] │
├─────────────────────────────────────────┤
│ [Undo All]              [Apply All]     │
└─────────────────────────────────────────┘
```

**Callbacks:**
```typescript
interface IPendingChangesPanelCallbacks {
  onUndoMove: (moveId: string) => void;
  onUndoAll: () => void;
  onApplyAll: () => void;
  onClose: () => void;
}
```

**Methods:**
```typescript
show(moves: PendingMove[]): void
hide(): void
toggle(moves: PendingMove[]): void
updateList(moves: PendingMove[]): void
getIsVisible(): boolean
dispose(): void
```

### 7. Editor Integration (`editor.ts`)

**Properties Added:**
```typescript
private dragDrop!: DragDrop;
private pendingChangesPanel: PendingChangesPanel | undefined;
```

**Constructor Changes:**
```typescript
// Initialize DragDrop feature
this.dragDrop = new DragDrop(this.browserService, this.logger);

// Wire callback for UI updates
this.dragDrop.setOnPendingMovesChanged((moves) => {
  this.controlBar?.setPendingChangesCount(moves.length);
  this.pendingChangesPanel?.updateList(moves);
});
```

**Message Handler:**
```typescript
// In setupBrowserBridgeHandler()
case 'drag-started':
  this.dragDrop.handleDragStarted(message);
  break;
case 'drag-ended':
  if (this.browserViewId) {
    this.dragDrop.handleDragEnded(this.browserViewId, message);
  }
  break;
```

**Methods Added:**
```typescript
private togglePendingChangesPanel(): void
private async undoPendingMove(moveId: string): Promise<void>
private async undoAllPendingMoves(): Promise<void>
private async applyAllPendingMoves(): Promise<void>
```

---

## Pending Changes Module (Standalone)

A separate, reusable module for tracking file changes before applying to disk.

### Purpose

- Track "dirty" files (pending changes)
- Store changes in `.roopik/pending/` folder
- Provide URIs for VSCode diff view
- Auto-collapse multiple edits to same file
- Auto-remove if content matches original

### Configuration

```typescript
interface IPendingChangesConfig {
  pendingFolder: string;           // default: '.roopik/pending'
  folderStrategy: 'mirror' | 'flat'; // default: 'mirror'
  pendingExtension: string;        // default: ''
  cleanupOnApply: boolean;         // default: true
}
```

### Key Interface

```typescript
interface IPendingChangesService {
  initialize(workspaceRoot: string): Promise<void>;

  // Query
  getPendingFiles(): IPendingFile[];
  hasPendingChanges(originalPath: string): boolean;
  getPendingCount(): number;

  // Operations
  updateFile(originalPath, newContent, source, metadata?): Promise<IPendingFile | undefined>;
  discardFile(originalPath: string): Promise<void>;
  discardAll(): Promise<void>;
  applyFile(originalPath: string): Promise<IApplyResult>;
  applyAll(): Promise<IApplyResult[]>;

  // Diff view
  getDiffUris(originalPath: string): [string, string] | undefined;

  // Callbacks
  onPendingFilesChanged(callback): void;
}
```

### Usage Example

```typescript
import { PendingChangesService } from '../../electron-main/pendingChanges';

const service = new PendingChangesService();
await service.initialize('/path/to/workspace');

// Track a change
await service.updateFile(
  '/path/to/Button.tsx',
  newContent,
  'drag-drop',
  { description: 'Moved button to header' }
);

// Open diff view
const [originalUri, pendingUri] = service.getDiffUris('/path/to/Button.tsx');
vscode.commands.executeCommand('vscode.diff', originalUri, pendingUri);

// Apply changes
await service.applyFile('/path/to/Button.tsx');
```

---

## Message Types (PostMessage)

### From Inject Script to Extension

```typescript
// Drag started
{
  type: 'drag-started',
  selector: string,
  tagName: string
}

// Drag ended
{
  type: 'drag-ended',
  hasDropZone: boolean,
  dropZone?: {
    parentSelector: string,
    parentTagName: string,
    index: number,
    position: 'before' | 'after' | 'inside',
    siblingCount: number
  }
}
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
| - | Pending changes UI (badge + panel) | ✅ Complete |
| - | Undo individual/all moves | ✅ Complete |
| - | Pending Changes Module (standalone) | ✅ Complete |

### Pending (Phase 5)

| Feature | Status | Notes |
|---------|--------|-------|
| AST Transform Service | TODO | Babel/TypeScript to move JSX nodes |
| IPC Channel for PendingChanges | TODO | Browser ↔ Main process |
| Diff view integration | TODO | Add icon, wire vscode.diff |
| Apply to source file | TODO | Write pending → original |

---

## Known Issues & Limitations

1. **Source location may be stale**: If user edits source file while changes are pending, source locations become invalid.

2. **No conflict detection**: If same file is modified in editor and via drag-drop, no warning is shown.

3. **Panel z-index**: Panel may appear behind BrowserView in some cases (native view vs HTML).

4. **Same element multiple drags**: Currently tracks each move separately. Plan is to collapse to final position.

---

## Future Enhancements

1. **Collapse same-element moves**: Track final delta, not history
2. **Session recovery**: Persist pending changes across IDE restarts
3. **Conflict detection**: Warn if source file changed
4. **Multi-file diff**: Use VSCode's MultiDiffEditor
5. **AI agent integration**: Same flow for AI-generated changes

---

## Related Files

### Inject Script (Drag Visuals)
- `src/vs/workbench/contrib/roopik/browser/projectMode/scripts/inspectModeScript.ts`

### Common Types
- `src/vs/workbench/contrib/roopik/common/projectMode/types.ts`

### IPC Service
- `src/vs/workbench/contrib/roopik/common/projectMode/ipc.ts`

---

## Troubleshooting

### Drag not working
1. Check if inspect mode is enabled
2. Check browser console for errors
3. Verify `data-roopik-source` attributes exist

### CDP move fails
1. Check `DOM.enable` was called
2. Verify selectors are valid
3. Check nodeId is not 0 (means not found)

### Panel not showing
1. Click the badge button
2. Check `browserContainer` exists
3. Check z-index vs native BrowserView

### Undo not working
1. Check move status is 'pending'
2. Check browserViewId is valid
3. Check original position was tracked correctly
