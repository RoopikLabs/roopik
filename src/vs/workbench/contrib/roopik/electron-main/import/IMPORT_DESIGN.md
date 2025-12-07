# Import Module - Design Decisions

## Overview

The Import module handles bringing components into Roopik from various sources.
Each source type has its own **adapter** that knows how to fetch and normalize files.

## Adapter Pattern

```
SourceData { type: 'local-file' | 'ai-agent' | 'github' | 'manual' | 'figma' }
    ↓
ImportService.import(sourceData)
    ↓
[Routes to correct adapter based on type]
    ↓
ImportResult { files, entryFile, framework, dependencies, sourceInfo }
    ↓
[Caller decides: store files, build component, etc.]
```

**Key principle**: Adapters are independent. Each handles its own logic for:
- How to fetch/generate files
- What metadata to extract
- Error handling specific to that source

---

## Priority Order

| Priority | Adapter           | Status      | Use Case                              |
|----------|-------------------|-------------|---------------------------------------|
| 1        | LocalFileAdapter  | ✅ Complete | User imports from their project       |
| 2        | ManualAdapter     | ✅ Complete | Create new from template              |
| 3        | AIAgentAdapter    | ✅ Complete | Remote AI API responses               |
| 4        | GitHubAdapter     | 🟡 Stub     | Future - import from GitHub           |
| 5        | FigmaAdapter      | ❌ TODO     | Future - import from Figma designs    |

---

## LocalFileAdapter (Primary)

**The most important adapter** - handles:
- User clicks "Import" → File Explorer opens → selects file/folder
- Drag & drop files onto canvas (same flow, just different path source)

### Flow

```
User action (Import button OR drag-drop)
    ↓
UI gets file path (File Explorer dialog OR drag event)
    ↓
LocalFileAdapter.import({ type: 'local-file', filePath: '/path/to/file' })
    ↓
Reads file(s) from disk
    ↓
Detects framework, entry file, dependencies
    ↓
Returns ImportResult
```

### Drag & Drop

Drag & drop is **the same flow** as Import button:
1. User drags file onto Canvas (Extension UI)
2. Extension extracts file path from drag event
3. Extension calls Core with the path
4. Core uses `LocalFileAdapter.import({ type: 'local-file', filePath })`

No separate adapter needed - just a different source for the path.

---

## AIAgentAdapter

Handles **two distinct scenarios**:

### Case 1: Remote AI APIs (USE THIS ADAPTER)

When AI returns code via API (not file writes):

```
User: "Create a button"
    ↓
Claude API returns: { code: "export default function Button()..." }
    ↓
AIAgentAdapter.import({ type: 'ai-agent', code: '...' })
    ↓
ImportResult
    ↓
Caller stores and builds
```

**Examples**: Claude API, OpenAI API, MCP tools returning code strings

### Case 2: Coding Agents (DO NOT USE - Use FileWatcher)

When AI writes directly to files (like a human):

```
Agent (Claude Code, Cursor, our agent)
    ↓
Writes to: .roopik/canvases/{id}/components/{comp}/src/Button.tsx
    ↓
FileWatcher detects change
    ↓
Triggers rebuild
    ↓
Done! (No adapter needed)
```

**Why coding agents don't use AIAgentAdapter**:
- They write files directly (just like human editing)
- FileWatcher already handles file changes
- Works with ANY coding agent (Claude Code, Cursor, Gemini CLI, etc.)
- Our own Roopik Agent will also use this pattern

---

## GitHubAdapter (Stub)

**Current status**: Stub only - not implemented

**Why**: GitHub imports are complex:
- Users rarely import a single component file
- Usually it's entire repos or projects with many components
- Nested structures, dependencies, configs need handling

**Recommended future flow**:
1. User provides GitHub URL
2. Clone/download to workspace (like normal git clone)
3. User uses LocalFileAdapter to import specific components
4. Reuses existing adapter instead of duplicating logic

---

## FigmaAdapter (Future)

**Current status**: Not started

**Challenges**:
- Very different input (design tokens, layers, not code)
- Requires Figma API integration
- Code generation from design is complex
- May need AI to convert design to code

**Possible flow**:
1. User authenticates with Figma
2. Selects a frame/component in Figma
3. FigmaAdapter fetches design data
4. Converts to React/Vue/etc. code (possibly with AI help)
5. Returns ImportResult like other adapters

---

## Key Design Decisions

### 1. Adapters are Pure Import (No Storage)

Adapters only fetch and normalize files. They return `ImportResult`.
**Caller decides** what to do with the result:
- Store in workspace
- Build immediately
- Show preview first
- etc.

### 2. Each Adapter is Independent

Adapters don't depend on each other. Each handles its own:
- Fetching logic
- Error handling
- Metadata extraction

This allows future adapters (Figma, npm, Storybook, etc.) to be added
without affecting existing ones.

### 3. Drag & Drop = LocalFileAdapter

No separate drag-drop adapter. It's just a different **source** for the file path.
The processing is identical to Import button.

### 4. Coding Agents = FileWatcher

AI agents that write files (Claude Code, Cursor, our own agent) don't need
special adapter integration. They just write files like a human would.
FileWatcher handles the rest.

### 5. GitHub/Figma Import = Multi-Step

Complex imports (GitHub repos, Figma designs) should be multi-step:
1. First step: Fetch to workspace
2. Second step: User selects what to import
3. Third step: LocalFileAdapter imports the selection

This keeps adapters simple and reuses existing logic.

---

## Adding New Adapters

To add a new source (e.g., npm, Storybook):

1. Create `electron-main/import/adapters/myAdapter.ts`
2. Extend `BaseImportAdapter`
3. Implement `import(sourceData)` method
4. Add to `adapters/index.ts` exports
5. Register in `ImportService` constructor

```typescript
export class MyAdapter extends BaseImportAdapter {
    readonly sourceType: ComponentSource = 'my-source';

    async import(sourceData: SourceData): Promise<ImportResult> {
        // Your logic here
        return {
            files: { ... },
            entryFile: '...',
            framework: '...',
            dependencies: { ... },
            sourceInfo: { ... }
        };
    }
}
```
