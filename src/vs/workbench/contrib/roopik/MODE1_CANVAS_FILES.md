# Mode 1 (Canvas) Related Files in Core

> **Note**: Canvas UI rendering is 100% in `extensions/roopik/`. These core files provide **support infrastructure** for the canvas extension.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                   extensions/roopik/                         │
│                   (Canvas UI + Webview)                      │
│  • Infinite canvas rendering                                 │
│  • Sandbox cards (iframe components)                         │
│  • Drag/drop, pan/zoom                                       │
│  • React + Zustand                                           │
└─────────────────────────┬───────────────────────────────────┘
                          │ Commands (IPC)
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              src/vs/workbench/contrib/roopik/                │
│              (Core Support Infrastructure)                   │
│  • Entry point command (roopik.openCanvas)                   │
│  • Canvas list in Activity Bar                               │
│  • Import pipeline commands                                  │
│  • ESBuild transformation (main process)                     │
└─────────────────────────────────────────────────────────────┘
```

---

## Files Reference Table

| File | Purpose | Why it's in Core |
|------|---------|------------------|
| [roopik.contribution.ts](browser/roopik.contribution.ts) | Registers `roopik.openCanvas` command | Entry point that delegates to extension via `commandService.executeCommand('roopik.canvas.open')` |
| [roopikViewPane.ts](browser/roopikViewPane.ts) | Activity bar sidebar | Lists canvases from `.roopik/canvas/canvases.json` - reads file system, shows in tree view |
| [welcomeEditor.ts](browser/welcomeEditor.ts) | Welcome screen | Has "Import Canvas" button + canvas settings (grid size, show grid) |
| [commands/importCommands.ts](browser/commands/importCommands.ts) | Import commands | Lets user select target canvas for component imports |
| [commands/pipelineCommands.ts](browser/commands/pipelineCommands.ts) | Pipeline commands | `roopik.pipeline.transform` - extension calls this for ESBuild bundling |
| [electron-main/import/importService.ts](electron-main/import/importService.ts) | Import processing | Copies imported component files to canvas folders |
| [common/import/importTypes.ts](common/import/importTypes.ts) | Type definitions | TypeScript interfaces for import system |

---

## What These Files Do NOT Contain

- Canvas UI rendering
- Infinite canvas logic
- Drag/drop handling
- Pan/zoom viewport
- Sandbox card components
- Component editing UI
- Fullscreen overlay

**All UI is in `extensions/roopik/webview/`**

---

## Command Flow

```
User clicks "Canvas" button in Activity Bar
        │
        ▼
roopik.openCanvas (Core)
        │ Prompts for canvas name
        ▼
roopik.canvas.open (Extension)
        │ Creates WebviewPanel
        ▼
Canvas UI renders in webview
        │
        │ User adds component
        ▼
roopik.pipeline.transform (Core → Main Process)
        │ ESBuild bundles component
        ▼
Returns bundled code to extension
        │
        ▼
Extension renders component in iframe
```

---

## Why This Split?

| Concern | Location | Reason |
|---------|----------|--------|
| **Canvas UI** | Extension | WebviewPanel persists across tab switches, 60fps rendering |
| **Commands** | Core (browser/) | `registerAction2` is a browser process API |
| **ESBuild** | Core (electron-main/) | Node.js required, runs in main process |
| **File I/O** | Core (electron-main/) | Native file system access |
| **Activity Bar** | Core (browser/) | Native VSCode UI integration |

---

*Last updated: December 2024*
*See also: [CANVAS_ARCHITECTURE_MIGRATION.md](../../../docs/CANVAS_ARCHITECTURE_MIGRATION.md)*
