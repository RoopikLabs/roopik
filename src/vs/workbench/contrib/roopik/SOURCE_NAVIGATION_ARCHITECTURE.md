# Source Navigation Architecture

Centralized service for opening source files from any Roopik feature.

## Overview

`ISourceNavigationService` provides a single, consistent way to navigate to source files across all Roopik features. This prevents code duplication and ensures uniform behavior for "click-to-source" functionality.

## File Structure

```
common/navigation/
├── sourceNavigationService.ts   ← Interface definition
└── index.ts                     ← Exports

browser/services/
├── sourceNavigationService.ts   ← Implementation
└── index.ts                     ← Exports
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  ISourceNavigationService (common/navigation/)                  │
│  - Interface only, no implementation                            │
│  - Defines: openSourceLocation(), openFile()                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ implements
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  SourceNavigationService (browser/services/)                    │
│  - Uses IEditorService internally (DI injected)                 │
│  - Uses INotificationService for errors                         │
│  - Single implementation for all callers                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ registered via
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  roopik.contribution.ts                                         │
│  registerSingleton(ISourceNavigationService,                    │
│                    SourceNavigationService)                     │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐   ┌─────────────────┐   ┌─────────────────┐
│ Style Inspect │   │ Context Menu    │   │ Future Features │
│ Panel         │   │ "Open Source"   │   │ (AI Agent, etc) │
│               │   │                 │   │                 │
│ Click file    │   │ Right-click     │   │ Programmatic    │
│ link in CSS   │   │ element in      │   │ source lookup   │
│ panel         │   │ browser preview │   │                 │
└───────────────┘   └─────────────────┘   └─────────────────┘
```

## Interface

```typescript
// common/navigation/sourceNavigationService.ts

export interface SourceLocation {
    file: string;           // Absolute file path
    line: number;           // 1-indexed line number
    column?: number;        // 0-indexed column
    endLine?: number;       // Optional end line for selection
    endColumn?: number;     // Optional end column for selection
}

export interface OpenSourceOptions {
    pinned?: boolean;       // Pin the editor tab
    preserveFocus?: boolean; // Don't steal focus from current view
    preview?: boolean;       // Open in preview mode
}

export interface ISourceNavigationService {
    readonly _serviceBrand: undefined;

    // Open file at specific location (line/column)
    openSourceLocation(location: SourceLocation, options?: OpenSourceOptions): Promise<void>;

    // Open file without specific location
    openFile(filePath: string, options?: OpenSourceOptions): Promise<void>;
}
```

## Current Consumers

### 1. Style Inspect Panel (CSS Source Navigation)

When user clicks a file link in the style panel to see where a CSS rule is defined:

```typescript
// browser/projectMode/features/styleInspect.ts
private async openFile(location: CSSSourceLocation): Promise<void> {
    await this.sourceNavigationService.openSourceLocation({
        file: location.file,
        line: location.line,
        column: location.column,
        endLine: location.endLine,
        endColumn: location.endColumn
    });
}
```

### 2. Context Menu "Open Source" (Component Source Navigation)

When user right-clicks an element in browser preview and selects "Open Source":

```
User Right-Click
      │
      ▼
┌─────────────────────────────────────────────────────────────────┐
│  Main Process (browserViewService.ts)                           │
│                                                                 │
│  1. Context menu shows "Open Source" option                     │
│  2. On click, execute JS to get data-roopik-source attribute    │
│  3. Parse attribute: file:line:col:endLine:endCol               │
│  4. Fire onOpenSourceRequest event via IPC                      │
└─────────────────────────────────────────────────────────────────┘
      │
      │ IPC Event
      ▼
┌─────────────────────────────────────────────────────────────────┐
│  Renderer Process (editor.ts)                                   │
│                                                                 │
│  1. Subscribe to onOpenSourceRequest                            │
│  2. Filter by browserViewId                                     │
│  3. Call sourceNavigationService.openSourceLocation()           │
│  4. Show error notification if source not found                 │
└─────────────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────────────┐
│  VS Code Editor Opens at Exact Line/Column                      │
└─────────────────────────────────────────────────────────────────┘
```

## Source Tracking Format

Elements are tagged at build time with `data-roopik-source` attribute:

```html
<div data-roopik-source="C:\project\src\Button.tsx:10:4:15:6">
```

**Format**: `file:startLine:startCol:endLine:endCol`

**Parsing Challenge**: Windows paths contain colons (`C:\`), so parsing must find the last 4 numeric segments:

```typescript
// browserViewService.ts
private parseSourceAttribute(sourceAttr: string): SourceLocation | null {
    const parts = sourceAttr.split(':');

    // Find where numbers start from the end
    let numericStartIndex = parts.length;
    for (let i = parts.length - 1; i >= 0; i--) {
        if (isNaN(parseInt(parts[i], 10))) {
            numericStartIndex = i + 1;
            break;
        }
    }

    const fileParts = parts.slice(0, numericStartIndex);
    const numericParts = parts.slice(numericStartIndex);

    return {
        file: fileParts.join(':'),  // Rejoin: "C:\project\src\Button.tsx"
        line: parseInt(numericParts[0], 10),
        column: parseInt(numericParts[1], 10),
        // ... endLine, endColumn
    };
}
```

## Adding New Consumers

To use source navigation from a new feature:

### 1. Inject the Service

```typescript
constructor(
    @ISourceNavigationService private readonly sourceNavigationService: ISourceNavigationService
) {}
```

### 2. Call the Service

```typescript
// Open at specific location
await this.sourceNavigationService.openSourceLocation({
    file: '/path/to/file.tsx',
    line: 42,
    column: 10
});

// Or just open a file
await this.sourceNavigationService.openFile('/path/to/file.tsx');
```

## IPC Events (for Main Process Features)

If your feature runs in the main process (like context menu), use the event pattern:

### 1. Define Event Type

```typescript
// common/projectMode/types.ts
export interface OpenSourceRequestEvent {
    browserViewId: number;
    sourceLocation: SourceLocation | null;
    error?: string;
}
```

### 2. Add to Interface

```typescript
// common/projectMode/ipc.ts
readonly onOpenSourceRequest: Event<OpenSourceRequestEvent>;
```

### 3. Fire Event in Main Process

```typescript
// electron-main/projectMode/browserViewService.ts
this._onOpenSourceRequest.fire({
    browserViewId,
    sourceLocation: parsed
});
```

### 4. Handle in Renderer

```typescript
// browser/projectMode/editor.ts
this._register(this.browserService.onOpenSourceRequest((event) => {
    if (event.sourceLocation) {
        this.sourceNavigationService.openSourceLocation(event.sourceLocation);
    }
}));
```

## Why Centralized?

| Without Service | With Service |
|-----------------|--------------|
| Each feature imports IEditorService | Single service handles all navigation |
| Duplicate error handling | Consistent error notifications |
| Different selection behavior | Uniform selection highlighting |
| Hard to add logging/analytics | Single point for telemetry |
| Features coupled to VSCode APIs | Features use abstract interface |

## Related Documentation

- **Source Tracking Injection**: See `.claude/skills/source-tracking/` for how `data-roopik-source` attributes are added at build time
- **Style Inspect**: CSS source resolution uses CDP for style source mapping
- **Communication Architecture**: See `COMMUNICATION_ARCHITECTURE.md` for IPC patterns
