# MCP Unified Flow Pattern

> **Design Pattern**: Event-driven architecture for seamless UI and Agent integration

This document describes the pattern used to ensure that **UI actions** and **MCP Agent tool calls** share the same code flow, providing a consistent experience regardless of the entry point.

---

## The Problem

In Electron/VSCode architecture:
- **MCP Server** runs in the **Main Process** (Node.js)
- **UI Components** (editors, panels) run in the **Renderer Process** (Chromium)

When an agent calls an MCP tool (e.g., `roopik_startProject`), it executes in the main process. But opening a browser editor requires renderer process access. We can't directly call renderer code from main process.

**Challenge**: How do we make agent actions trigger the same UI behavior as user clicks?

---

## The Solution: Event-Driven Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        ENTRY POINTS                             │
├──────────────────┬──────────────────┬──────────────────────────┤
│  UI Buttons      │  MCP Agent       │  API / External          │
│  (Renderer)      │  (Main Process)  │  (Main Process)          │
└────────┬─────────┴────────┬─────────┴────────────┬─────────────┘
         │                  │                      │
         │                  │                      │
         ▼                  ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    CORE SERVICE                                 │
│              (Main Process - Single Source of Truth)            │
│                                                                 │
│   Example: DevServerService.startServer()                       │
│   - Performs the actual work                                    │
│   - Fires event when state changes                              │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              │ fires event
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    EVENT EMITTER                                │
│              (Main Process)                                     │
│                                                                 │
│   _onStatusChanged.fire({                                       │
│     state: 'running',                                           │
│     url: 'http://localhost:5173',                               │
│     projectRoot: '/path/to/project'                             │
│   })                                                            │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              │ via IPC Channel
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    IPC BRIDGE                                   │
│              (Renderer Process)                                 │
│                                                                 │
│   DevServerBridge.onStatusChanged                               │
│   - Listens to main process events via IChannel.listen()        │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 WORKBENCH CONTRIBUTION                          │
│              (Renderer Process)                                 │
│                                                                 │
│   RoopikProjectModeContribution                                 │
│   - Registered at WorkbenchPhase.AfterRestored                  │
│   - Listens to bridge events                                    │
│   - Performs UI actions (open editor, navigate, etc.)           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Components

### 1. Core Service (Main Process)

The service that does the actual work and fires events.

```typescript
// electron-main/projectMode/devServer/devServerService.ts

export class DevServerService {
    // Event emitter
    private readonly _onStatusChanged = new Emitter<DevServerStatusEvent>();
    readonly onStatusChanged: Event<DevServerStatusEvent> = this._onStatusChanged.event;

    async startServer(options: DevServerStartOptions): Promise<string> {
        // ... do the work ...

        // Fire event when state changes
        this._onStatusChanged.fire({
            state: 'running',
            url: serverUrl,
            projectRoot: options.projectRoot,
            framework: detectedFramework
        });

        return serverUrl;
    }
}
```

### 2. IPC Channel (Main Process)

Exposes the service and its events to the renderer process.

```typescript
// electron-main/projectMode/devServer/devServerChannel.ts

export class DevServerChannel implements IServerChannel {
    constructor(private readonly service: DevServerService) {}

    listen(_: unknown, event: string): Event<any> {
        switch (event) {
            case 'onStatusChanged':
                return this.service.onStatusChanged;
            // ... other events
        }
    }

    call(_: unknown, command: string, args?: any): Promise<any> {
        switch (command) {
            case 'startServer':
                return this.service.startServer(args);
            // ... other methods
        }
    }
}
```

### 3. IPC Bridge (Renderer Process)

Client-side proxy that communicates with main process via IPC.

```typescript
// browser/projectMode/devServerBridge.ts

export class DevServerBridge implements IDevServerService {
    readonly onStatusChanged: Event<DevServerStatusEvent>;

    constructor(private channel: IChannel) {
        // Listen to main process events via IPC
        this.onStatusChanged = this.channel.listen<DevServerStatusEvent>('onStatusChanged');
    }

    async startServer(options: DevServerStartOptions): Promise<string> {
        return this.channel.call('startServer', options);
    }
}
```

### 4. Workbench Contribution (Renderer Process)

Background service that listens to events and performs UI actions.

```typescript
// browser/contributions/projectModeContribution.ts

export class RoopikProjectModeContribution extends Disposable implements IWorkbenchContribution {
    static readonly ID = 'roopik.projectModeContribution';

    constructor(
        @IEditorService private readonly editorService: IEditorService,
        @IMainProcessService mainProcessService: IMainProcessService
    ) {
        super();

        // Get bridge to main process
        this.devServerService = new DevServerBridge(
            mainProcessService.getChannel(DEV_SERVER_CHANNEL)
        );

        // Listen to events and act
        this._register(this.devServerService.onStatusChanged(async (event) => {
            if (event.state === 'running' && event.url) {
                await this.openBrowserAndNavigate(event.url, event.projectRoot);
            }
        }));
    }

    private async openBrowserAndNavigate(url: string, projectRoot: string): Promise<void> {
        // Open browser editor and navigate to URL
        // ... UI logic here ...
    }
}
```

### 5. Register Contribution

```typescript
// browser/roopik.contribution.ts

registerWorkbenchContribution2(
    RoopikProjectModeContribution.ID,
    RoopikProjectModeContribution,
    WorkbenchPhase.AfterRestored
);
```

### 6. MCP Tool (Main Process)

The MCP tool just calls the core service - no UI logic needed.

```typescript
// electron-main/mcp/tools/projectTools.ts

server.tool(
    'roopik_startProject',
    'Start a dev server. Browser automatically opens when ready.',
    { projectPath: z.string() },
    async ({ projectPath }) => {
        // Just call the service - event will trigger UI automatically
        const url = await devServerService.startServer({
            projectRoot: projectPath
        });

        return {
            content: [{
                type: 'text',
                text: JSON.stringify({ success: true, url, projectPath })
            }]
        };
    }
);
```

---

## Benefits

| Benefit | Description |
|---------|-------------|
| **Unified Flow** | UI and Agent use identical code paths |
| **Decoupled** | Main process doesn't know about UI; just fires events |
| **Reliable** | Event-driven means no missed actions |
| **Testable** | Services can be tested independently |
| **Extensible** | Add new listeners without modifying core service |

---

## When to Use This Pattern

Use this pattern when:

1. **MCP tool needs to trigger UI behavior** (open editor, show notification, navigate)
2. **Multiple entry points** should produce the same result (UI button, agent, API)
3. **Cross-process communication** is required (main ↔ renderer)

---

## Checklist for New MCP Tools

When adding a new MCP tool that needs UI integration:

- [ ] **Core Service** (main process): Implement the logic and fire events
- [ ] **IPC Channel** (main process): Expose service methods and events
- [ ] **IPC Bridge** (renderer): Create client proxy with event listeners
- [ ] **Workbench Contribution** (renderer): Listen to events, perform UI actions
- [ ] **Register Contribution**: Add to `roopik.contribution.ts`
- [ ] **MCP Tool** (main process): Just call the core service

---

## Example: Future MCP Tools

### `roopik_openFile`

```
Agent calls roopik_openFile →
FileService.openFile() →
_onFileOpened.fire() →
FileOpenContribution listens →
Opens file in editor
```

### `roopik_showNotification`

```
Agent calls roopik_showNotification →
NotificationService.show() →
_onNotification.fire() →
NotificationContribution listens →
Shows notification in UI
```

### `roopik_createComponent`

```
Agent calls roopik_createComponent →
ComponentService.create() →
_onComponentCreated.fire() →
CanvasContribution listens →
Adds component card to canvas
```

---

## Files Reference

| File | Location | Purpose |
|------|----------|---------|
| `devServerService.ts` | `electron-main/projectMode/devServer/` | Core service with event emitter |
| `devServerChannel.ts` | `electron-main/projectMode/devServer/` | IPC channel exposing service |
| `devServerBridge.ts` | `browser/projectMode/` | Renderer-side IPC bridge |
| `projectModeContribution.ts` | `browser/contributions/` | UI action listener |
| `projectTools.ts` | `electron-main/mcp/tools/` | MCP tool definitions |

---

*Last updated: December 2024*
