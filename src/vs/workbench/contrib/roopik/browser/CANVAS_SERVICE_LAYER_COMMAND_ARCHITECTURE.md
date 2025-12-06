# Canvas Service Architecture

## Why This Architecture?

VSCode is built on Electron, which enforces **process separation** for security:

- **Main Process** (Node.js): File system access, native APIs
- **Renderer Process** (Chromium): UI rendering, DOM manipulation
- **Extension Host**: Isolated process for extensions

These processes **cannot share memory** - they must communicate via IPC (Inter-Process Communication).

## The Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│  UI ENTRY POINTS (all call the same command)                           │
├─────────────────────────────────────────────────────────────────────────┤
│  • Activity Panel button    → commandService.executeCommand('roopik.openCanvas')
│  • Welcome Screen button    → commandService.executeCommand('roopik.openCanvas')
│  • Command Palette          → commandService.executeCommand('roopik.openCanvas')
│  • Keyboard shortcut        → commandService.executeCommand('roopik.openCanvas')
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  roopik.contribution.ts (registerAction2)                               │
│  Command: 'roopik.openCanvas'                                           │
├─────────────────────────────────────────────────────────────────────────┤
│  1. quickInputService.input() → prompts for canvas name                 │
│  2. canvasService.createCanvas(canvasName)  ← SINGLE SOURCE OF TRUTH    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  CanvasServiceClient (browser/) → IPC → CanvasService (electron-main/)  │
├─────────────────────────────────────────────────────────────────────────┤
│  • Creates/finds canvas in main process                                 │
│  • Persists to file system (.roopik/canvases/)                          │
│  • Fires onCanvasCreated event                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  RoopikCanvasContribution (event listener in browser/)                  │
├─────────────────────────────────────────────────────────────────────────┤
│  • Listens to canvasService.onCanvasCreated                             │
│  • Bridges to extension: commandService.executeCommand('roopik.canvas.open')
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Extension (extensions/roopik/)                                         │
│  Command: 'roopik.canvas.open'                                          │
├─────────────────────────────────────────────────────────────────────────┤
│  • Opens the webview panel with React canvas UI                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Key Components

| Component | Location | Role |
|-----------|----------|------|
| `roopik.openCanvas` | roopik.contribution.ts | Entry point command (shows name prompt) |
| `CanvasServiceClient` | canvasServiceClient.ts | Browser-side proxy to main process |
| `CanvasService` | electron-main/canvas/ | Main process service (file system) |
| `RoopikCanvasContribution` | roopik.contribution.ts | Event bridge to extension |
| `roopik.canvas.open` | extensions/roopik/ | Extension command (opens webview) |

## Why Not Simplify?

**Q: Can't we skip layers and call the extension directly?**

No, because:
1. **CanvasService needs file system access** → Must be in main process
2. **Extension renders webviews** → Must be in renderer process
3. **IPC is mandatory** → Electron security model requires it

**Q: Why use events instead of direct calls?**

Events enable:
- Activity panel auto-refresh on canvas changes
- Multiple listeners (UI, logging, analytics)
- Decoupled architecture (extension doesn't know about Core internals)

## Command Naming Convention

| Command | Purpose | Called By |
|---------|---------|-----------|
| `roopik.openCanvas` | Core command with UI (name prompt) | Users, UI buttons |
| `roopik.canvas.open` | Extension command (no UI) | Core only (via events) |
| `roopik.canvas.close` | Extension command | Core only (on delete) |
| `roopik.canvas.update` | Extension command | Core only (on rename) |

**Rule**: Only `roopik.contribution.ts` should call CanvasService. All other code uses commands or listens to events.
