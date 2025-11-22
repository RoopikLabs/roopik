# Roopik Extension Architecture

This document explains the high-level structure of the Roopik VS Code extension.

## 📂 Folder Structure Overview

The extension is divided into 3 main logical parts:

### 1. UI Controllers (The "Backend")
Located in `src/`, these files manage the VS Code webview panels. They act as the bridge between VS Code and the React UI.

*   **`canvasPanel.ts`** (Mode 1): Controls the **Canvas Tab**. It loads the React-based Component Editor.
*   **`projectPreviewPanel.ts`** (Mode 2): Controls the **Preview Tab**. It loads the full Browser Preview.
*   **`dashboardPanel.ts`**: Controls the **Dashboard/Welcome** screen.
*   **`extension.ts`**: The main entry point. Registers commands and panels.

### 2. The Engine (`src/projectRunner/`)
Responsible for running the user's React project. It has no UI logic; it simply serves the user's app.

*   **`viteServerManager.ts`**: The "Boss". Starts, stops, and manages the Vite server instance.
*   **`serverWorker.js`**: The "Worker". Runs the actual Vite process in a background thread to prevent freezing VS Code.
*   **`plugins/`**: Custom Vite plugins injected into the user's project (e.g., for "click-to-source" functionality).

### 3. Component Isolation (`src/componentIsolation/`)
Specific to **Mode 1 (Canvas)**. Handles the logic for rendering *single components* in isolation.

*   **`renderer/ComponentSandbox.ts`**: The "Wrapper". Generates an HTML sandbox to wrap a single component so it can run independently.
*   **`core/PreviewManager.ts`**: The "State Manager". Tracks which component is currently selected and being previewed.

### 4. The Frontend (`webview/`)
Contains the actual React application that runs inside the VS Code webviews.

*   **`src/componentView/`**: React code for the **Canvas UI** (Mode 1).
*   **`src/projectView/`**: React code for the **Browser Preview UI** (Mode 2).
*   **`src/components/`**: Shared UI components (e.g., `BottomActionBar`).

## 🔄 Data Flow

1.  **VS Code** (`extension.ts`) launches a panel (`canvasPanel.ts`).
2.  **Panel** loads the React App (`webview/`).
3.  **React App** communicates back to the Panel via `vscode.postMessage()`.
4.  **Panel** may use `devServer` to start Vite or `componentIsolation` to prepare a component for rendering.

## 📨 Communication Pattern: postMessage

**All cross-context communication uses `postMessage` for security and consistency.**

### Why postMessage?
*   **Security**: Browser enforces same-origin policy. Cross-origin iframe access (e.g., `iframe.contentDocument`) throws `SecurityError`.
*   **Standard**: Works across all contexts: VS Code ↔ Webview, Webview ↔ Iframe, Parent ↔ Child frames.
*   **Event-Driven**: Clean, decoupled architecture without direct references.

### How It Works
```javascript
// Sender (iframe/child):
window.parent.postMessage({ type: 'roopik-action', data: {...} }, '*');

// Receiver (parent/webview):
window.addEventListener('message', (event) => {
  if (event.data.type === 'roopik-action') {
    // Handle action
  }
});
```

### Key Communication Channels
1.  **VS Code ↔ Webview**: `vscode.postMessage()` / `window.addEventListener('message')`
2.  **Webview ↔ Preview Iframe**: `window.parent.postMessage()` / `window.addEventListener('message')`
3.  **Inject Script → Webview**: Forwards keyboard events (ESC), inspect data, navigation changes

### Best Practices
*   ✅ **Always use postMessage** for cross-context communication
*   ✅ **Never access** `iframe.contentDocument` or `iframe.contentWindow.document` (causes SecurityError)
*   ✅ **Use capture phase** (`addEventListener(event, handler, true)`) to intercept events before child components
*   ✅ **Type-safe message objects**: Define message types (e.g., `'roopik-keydown'`, `'roopik-inspect'`) for clarity
