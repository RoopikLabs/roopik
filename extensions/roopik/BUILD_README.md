# Build Commands

## VS Code Editor Build

**Build whole VS Code editor:**

```bash
# From roopik root directory
npm run compile
```

**For native modules (terminal, etc.) or after pulling upstream changes:**

```bash
# From roopik root directory
npm run postinstall
```

This rebuilds native modules like `node-pty` for Electron.

---

## Roopik Extension Build

**All commands run from `extensions/roopik/` directory**

### Quick Start

```bash
# Build everything (extension + webview)
npm run build

# Watch everything (extension + webview) - for development
npm run watch:all
```

### Individual Builds

```bash
# Extension only
npm run build:extension
npm run watch

# Webview only (from extensions/roopik/)
npm run build:webview
npm run watch:webview

# Or from webview/ directory directly
cd webview
npm run build    # Build webview
npm run dev      # Watch webview
```

## Output Directories

- Extension: `out/`
- Webview: `webview/build/`

---

## Folder Structure Overview

### Extension Source (`src/`)

*   **`extension.ts`**: Main entry point. Registers commands.
*   **`canvasPanel.ts`**: Controls the Canvas webview panel. Loads the React-based canvas UI.
*   **`config.ts`**: Configuration management.
*   **`logger.ts`**: Logging utilities.
*   **`services/`**: Business logic services.
    *   **`CanvasStateManager.ts`**: Manages canvas state persistence to `.roopik/canvases/`.
    *   **`CoreBridgeService.ts`**: Bridge to Core's sandbox build pipeline.
*   **`types/`**: TypeScript type definitions.

### Webview (`webview/`)

Contains the React application that runs inside the VS Code webview.

*   **`src/componentView/`**: Main canvas UI (ComponentView.tsx).
*   **`src/canvasView/`**: Canvas components and services.
    *   **`components/`**: UI components (InfiniteCanvas, SandboxCard, StatusPanel, DeviceToggle, Toolbar, etc.)
    *   **`services/`**: Grid management, positioning utilities.
    *   **`types/`**: Type definitions for canvas state, sandboxes, messages.
    *   **`data/`**: Sample component definitions.
*   **`src/hooks/`**: Custom React hooks (useFPS).
*   **`src/utils/`**: Utility functions (colors).
