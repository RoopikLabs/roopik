# Core ↔ Extension Host Communication Bridge

This document explains the architecture for communicating from VS Code Core (Main Process) to the Extension Host, including how to execute extension commands and receive responses.

---

## Table of Contents

1. [The Problem We Solved](#the-problem-we-solved)
2. [Architecture Overview](#architecture-overview)
3. [The Channel Name Bug](#the-channel-name-bug---critical-lesson-learned)
4. [Implementation Guide](#implementation-guide)
5. [Adding New Commands](#adding-new-commands)
6. [File Reference](#file-reference)

---

## The Problem We Solved

### Situation
The MCP Server runs in Electron's **Main Process** and needs to call debugging commands that are registered in the **Extension Host** (e.g., `roopik.debug.startAndWait`).

### Challenge
VS Code's architecture has three separate processes:
- **Main Process** (Electron Node.js) - Where MCP server runs
- **Renderer Process** (Browser/Workbench) - VS Code UI
- **Extension Host Process** (separate Node.js) - Where extensions run

**Main Process cannot directly call Extension Host commands.** The `ICommandService` that routes to Extension Host only exists in the Renderer.

### Solution: "Zig-Zag" Bridge Pattern

```
┌──────────────────┐     IPC (ipcMain/ipcRenderer)     ┌──────────────────┐
│   Main Process   │ ────────────────────────────────► │ Renderer Process │
│  (MCP Server,    │                                   │   (Workbench)    │
│   RendererBridge)│ ◄──────────────────────────────── │ (MainProcessBridge│
└──────────────────┘     IPC (response channel)        │  ICommandService)│
                                                       └────────┬─────────┘
                                                                │
                                                                │ ICommandService
                                                                │ (automatic RPC)
                                                                ▼
                                                       ┌──────────────────┐
                                                       │  Extension Host  │
                                                       │  (extensions,    │
                                                       │   vscode.debug)  │
                                                       └──────────────────┘
```

---

## The Channel Name Bug - Critical Lesson Learned

### The Issue

When we first implemented the IPC bridge, we used custom channel names:
- `roopik:execute-command`
- `roopik:command-response:${requestId}`

**This caused the error:**
```
Error: Unsupported event IPC channel 'roopik:execute-command'
```

### Root Cause

VS Code's **sandbox security** only allows IPC channels that start with `vscode:`.

See `src/vs/base/parts/sandbox/electron-browser/preload.ts`:

```typescript
function validateIPC(channel: string): true | never {
    if (!channel?.startsWith('vscode:')) {
        throw new Error(`Unsupported event IPC channel '${channel}'`);
    }
    return true;
}
```

### The Fix

Changed channel names to use `vscode:` prefix:
- **Before:** `roopik:execute-command`
- **After:** `vscode:roopik-execute-command`

```typescript
// ✅ CORRECT - Uses vscode: prefix
export const MAIN_TO_RENDERER_COMMAND_CHANNEL = 'vscode:roopik-execute-command';
export const RENDERER_TO_MAIN_RESPONSE_PREFIX = 'vscode:roopik-command-response:';

// ❌ WRONG - Custom prefix not allowed
export const MAIN_TO_RENDERER_COMMAND_CHANNEL = 'roopik:execute-command';
```

### Key Takeaway

**Any IPC channel used in VS Code's sandboxed environment MUST start with `vscode:`**

---

## Architecture Overview

### Components

#### 1. RendererBridge (Main Process)
**Location:** `electron-main/bridge/rendererBridge.ts`

Sends commands from Main Process to Renderer:
- Uses `IWindowProvider` to get the active VS Code window
- Uses `window.send()` (which calls `webContents.send()`)
- Sets up response listeners on `ipcMain`
- Handles timeouts

```typescript
// How Main Process sends to Renderer
window.send('vscode:roopik-execute-command', {
    requestId: 'req_12345',
    commandId: 'roopik.debug.startAndWait',
    args: [{ file: 'test.js', line: 5 }]
});
```

#### 2. RoopikMainProcessBridge (Renderer Process)
**Location:** `browser/bridge/mainProcessBridge.ts`

Receives commands in Renderer and routes to Extension Host:
- Listens on `ipcRenderer.on('vscode:roopik-execute-command', ...)`
- Uses `ICommandService.executeCommand()` to call Extension Host
- Sends response back via `ipcRenderer.send(responseChannel, result)`

```typescript
// How Renderer receives and forwards to Extension Host
ipcRenderer.on('vscode:roopik-execute-command', async (event, request) => {
    const result = await commandService.executeCommand(request.commandId, ...request.args);
    ipcRenderer.send(`vscode:roopik-command-response:${request.requestId}`, {
        success: true,
        result
    });
});
```

#### 3. DebugIPCHandler (Extension Host)
**Location:** `extensions/roopik/src/services/debug/debugIPCHandler.ts`

Registers the actual commands that can be called:
```typescript
vscode.commands.registerCommand('roopik.debug.startAndWait', async (args) => {
    return debugService.startAndWaitForBreakpoint(args);
});
```

### Data Flow

```
1. MCP Tool receives request
        │
        ▼
2. DebugToolService.startAndWait(args)
        │
        ▼
3. RendererBridge.executeCommand('roopik.debug.startAndWait', args)
        │
        ▼ ipcMain → window.send('vscode:roopik-execute-command', request)
        │
4. RoopikMainProcessBridge receives on ipcRenderer
        │
        ▼
5. ICommandService.executeCommand('roopik.debug.startAndWait', args)
        │
        ▼ (VS Code's internal RPC to Extension Host)
        │
6. DebugIPCHandler handles command, returns result
        │
        ▼ (VS Code's internal RPC back to Renderer)
        │
7. RoopikMainProcessBridge sends response
        │
        ▼ ipcRenderer.send('vscode:roopik-command-response:req_XXX', response)
        │
8. RendererBridge receives response on ipcMain
        │
        ▼
9. MCP Tool returns result to agent
```

---

## Implementation Guide

### Step 1: Define IPC Types (common/)

Create shared types for both processes:

```typescript
// common/bridge/ipc.ts

// IMPORTANT: Channels MUST start with 'vscode:'
export const MAIN_TO_RENDERER_COMMAND_CHANNEL = 'vscode:roopik-execute-command';
export const RENDERER_TO_MAIN_RESPONSE_PREFIX = 'vscode:roopik-command-response:';

export interface IMainToRendererCommandRequest {
    requestId: string;
    commandId: string;
    args?: any[];
    timeout?: number;
}

export interface IRendererToMainCommandResponse {
    requestId: string;
    success: boolean;
    result?: any;
    error?: string;
}
```

### Step 2: Create RendererBridge (Main Process)

```typescript
// electron-main/bridge/rendererBridge.ts

export class RendererBridge {
    constructor(private windowProvider: IWindowProvider) {}

    async executeCommand<T>(commandId: string, args?: any[]): Promise<T> {
        const window = this.windowProvider.getLastActiveWindow();
        const requestId = generateRequestId();

        return new Promise((resolve, reject) => {
            // Set up timeout
            const timeoutId = setTimeout(() => reject(new Error('Timeout')), 30000);

            // Listen for response
            ipcMain.once(`vscode:roopik-command-response:${requestId}`, (_, response) => {
                clearTimeout(timeoutId);
                response.success ? resolve(response.result) : reject(new Error(response.error));
            });

            // Send request
            window.send('vscode:roopik-execute-command', { requestId, commandId, args });
        });
    }
}
```

### Step 3: Create MainProcessBridge (Renderer)

```typescript
// browser/bridge/mainProcessBridge.ts

export class RoopikMainProcessBridge extends Disposable implements IWorkbenchContribution {
    static readonly ID = 'workbench.contrib.roopikMainProcessBridge';

    constructor(
        @ICommandService private readonly commandService: ICommandService
    ) {
        super();
        this.registerListeners();
    }

    private registerListeners(): void {
        ipcRenderer.on('vscode:roopik-execute-command', async (event, request) => {
            try {
                const result = await this.commandService.executeCommand(
                    request.commandId,
                    ...request.args || []
                );
                ipcRenderer.send(`vscode:roopik-command-response:${request.requestId}`, {
                    requestId: request.requestId,
                    success: true,
                    result
                });
            } catch (error) {
                ipcRenderer.send(`vscode:roopik-command-response:${request.requestId}`, {
                    requestId: request.requestId,
                    success: false,
                    error: error.message
                });
            }
        });
    }
}
```

### Step 4: Register the Contribution

```typescript
// browser/roopik.contribution.ts

import { RoopikMainProcessBridge } from './bridge/mainProcessBridge.js';

registerWorkbenchContribution2(
    RoopikMainProcessBridge.ID,
    RoopikMainProcessBridge,
    WorkbenchPhase.AfterRestored
);
```

### Step 5: Register Commands in Extension

```typescript
// extensions/roopik/src/services/debug/debugIPCHandler.ts

vscode.commands.registerCommand('roopik.debug.startAndWait', async (args) => {
    return agentDebugService.startAndWaitForBreakpoint(args);
});
```

---

## Adding New Commands

To add a new command that Main Process can call:

### 1. Register the command in Extension Host

```typescript
// In your extension
vscode.commands.registerCommand('roopik.myFeature.doSomething', async (args) => {
    // Your logic here
    return result;
});
```

### 2. Call it from Main Process

```typescript
// In electron-main service
const result = await rendererBridge.executeCommand('roopik.myFeature.doSomething', args);
```

That's it! The bridge handles the routing automatically.

---

## File Reference

| File | Location | Purpose |
|------|----------|---------|
| `ipc.ts` | `common/bridge/` | Shared IPC types and channel names |
| `rendererBridge.ts` | `electron-main/bridge/` | Main → Renderer sender |
| `mainProcessBridge.ts` | `browser/bridge/` | Renderer listener, routes to Extension Host |
| `debugToolService.ts` | `electron-main/tools/` | Wraps RendererBridge for debug tools |
| `debugIPCHandler.ts` | `extensions/roopik/src/services/debug/` | Extension Host command handlers |

---

## Debugging Tips

1. **Check channel names** - Must start with `vscode:`
2. **Check contribution loading** - Add `console.error` at module level
3. **Check ICommandService** - Extension commands must be registered before being called
4. **Check timeout** - Default is 30 seconds for debug operations

---

## Summary

The "zig-zag" bridge pattern enables Main Process to call Extension Host commands:

```
Main Process → RendererBridge → [IPC] → MainProcessBridge → ICommandService → Extension Host
```

**Critical:** All IPC channels must use `vscode:` prefix for VS Code's sandbox security.
