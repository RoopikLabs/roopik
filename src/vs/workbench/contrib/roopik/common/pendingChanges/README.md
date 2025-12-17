# Pending Changes Module

A standalone module for tracking file changes before they're saved to disk.

## Overview

This module implements the **"Dirty Buffer"** pattern - the same approach used by:
- VSCode's editor (unsaved files)
- Git staging area
- Cursor/Copilot AI changes review

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Original Files                            │
│                    (on disk, untouched)                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              PendingChangesService                           │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ pendingFiles: Map<originalPath, IPendingFile>           ││
│  │                                                          ││
│  │ - Tracks FINAL state (not history)                      ││
│  │ - Auto-collapses multiple edits                         ││
│  │ - Removes if content matches original                   ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Pending Files                             │
│                    (.roopik/pending/...)                     │
└─────────────────────────────────────────────────────────────┘
```

## Usage

### Basic Usage

```typescript
import { PendingChangesService } from '../../electron-main/pendingChanges';

// Create service with optional config
const service = new PendingChangesService({
  pendingFolder: '.roopik/pending',
  folderStrategy: 'mirror'
});

// Initialize with workspace root
await service.initialize('/path/to/workspace');

// Update a file (creates pending copy)
await service.updateFile(
  '/path/to/workspace/src/Button.tsx',
  newContent,
  'drag-drop',
  { description: 'Moved button to header' }
);

// Check if file has pending changes
if (service.hasPendingChanges('/path/to/Button.tsx')) {
  // Get URIs for diff view
  const [originalUri, pendingUri] = service.getDiffUris('/path/to/Button.tsx');

  // Open VSCode diff editor
  vscode.commands.executeCommand('vscode.diff', originalUri, pendingUri);
}

// Apply changes (write to original file)
await service.applyFile('/path/to/Button.tsx');

// Or discard changes
await service.discardFile('/path/to/Button.tsx');
```

### Configuration

```typescript
interface IPendingChangesConfig {
  // Where to store pending files
  pendingFolder: string;  // default: '.roopik/pending'

  // How to organize pending files
  folderStrategy: 'mirror' | 'flat';  // default: 'mirror'

  // Extension to add to pending files
  pendingExtension: string;  // default: ''

  // Auto-delete pending files on apply
  cleanupOnApply: boolean;  // default: true
}
```

### Folder Strategies

**Mirror (default):**
```
src/components/Button.tsx
  → .roopik/pending/src/components/Button.tsx
```

**Flat:**
```
src/components/Button.tsx
  → .roopik/pending/src__components__Button.tsx
```

## Key Behaviors

### Auto-Collapse

Multiple edits to the same file are automatically collapsed:

```typescript
// Edit 1: Move button to position 2
await service.updateFile(path, content1, 'drag-drop');

// Edit 2: Move button to position 5
await service.updateFile(path, content2, 'drag-drop');

// Only ONE pending file exists, with final content
service.getPendingCount();  // 1
```

### Auto-Remove

If edits result in content matching the original, the pending file is removed:

```typescript
// Move button from A to B
await service.updateFile(path, movedContent, 'drag-drop');

// Move button back from B to A (same as original)
await service.updateFile(path, originalContent, 'drag-drop');

// No pending changes!
service.hasPendingChanges(path);  // false
```

## Integration Points

### Drag-Drop Feature

```typescript
// In dragDrop.ts
async handleDragEnded() {
  // 1. Update DOM via CDP (instant visual)

  // 2. Generate new file content via AST
  const newContent = await this.astService.moveElement(sourceFile, move);

  // 3. Track as pending change
  await this.pendingService.updateFile(sourceFile, newContent, 'drag-drop');
}
```

### AI Agent Changes

```typescript
// In agent code
async applyCodeChange(file: string, newContent: string) {
  // Track as pending (user reviews before applying)
  await pendingService.updateFile(file, newContent, 'ai-agent', {
    description: 'AI suggested: Add error handling'
  });
}
```

### UI Panel

```typescript
// Subscribe to changes
pendingService.onPendingFilesChanged((files) => {
  updatePendingChangesPanel(files);
});

// Get files for display
const files = pendingService.getPendingFiles();
files.forEach(file => {
  console.log(`${file.relativePath} - ${file.metadata?.description}`);
});
```

## File Structure

```
common/pendingChanges/
├── types.ts          # Interfaces and types
├── index.ts          # Exports
└── README.md         # This file

electron-main/pendingChanges/
├── pendingChangesService.ts  # Main implementation
└── index.ts                  # Exports
```

## Future Enhancements

- [ ] Session recovery (persist across IDE restarts)
- [ ] Conflict detection (file changed on disk while pending)
- [ ] Batch operations with transactions
- [ ] Integration with VSCode SCM (Source Control)
