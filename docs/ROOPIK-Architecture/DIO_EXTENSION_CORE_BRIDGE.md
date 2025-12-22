# Dio Extension ↔ Core Communication Architecture

> **Keep Dio in Extension, connect to Core via Commands - Clean & Future-proof**

---

## 🎯 Decision: Extension-First Approach

### **Why Keep Dio in Extension?**

✅ **Easier to maintain** - No core code changes needed
✅ **Can merge Roo Code updates** - Extension stays compatible
✅ **Less risky** - Core is stable, extension is isolated
✅ **Faster iteration** - Extension builds faster
✅ **Fallback option** - Can still migrate to core later if needed

---

## 📡 Communication Pattern Already Exists!

**Great news!** Roopik Core already has a command-based bridge for extensions:

```typescript
// Core registers commands (componentCommands.ts)
registerAction2(class extends Action2 {
  constructor() {
    super({ id: 'roopik.core.createComponent', ... });
  }
  async run(accessor: ServicesAccessor, request: CreateComponentRequest) {
    const componentService = accessor.get(IComponentService);
    return componentService.createComponent(request);
  }
});

// Extension calls commands
const result = await vscode.commands.executeCommand('roopik.core.createComponent', {
  canvasId: 'test',
  name: 'LoginForm',
  code: '...'
});
```

**Existing Core Commands**:
| Command | Purpose |
|---------|---------|
| `roopik.core.createCanvas` | Create a new canvas |
| `roopik.core.createComponent` | Create a component in canvas |
| `roopik.core.rebuildComponent` | Rebuild component |
| `roopik.core.deleteComponent` | Delete component |
| `roopik.core.getBundledCode` | Get bundled code |
| `roopik.core.getComponentSource` | Read component source |
| `roopik.core.updateComponentSource` | Update component source |

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     EXTENSION (roopik-dio)                              │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ ClineProvider (Chat Controller)                                  │   │
│  │ - Task management                                                │   │
│  │ - Message handling                                               │   │
│  │ - AI API calls                                                   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│                              ↓                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ RoopikBridge (NEW!)                                              │   │
│  │ - Wrapper for vscode.commands.executeCommand                     │   │
│  │ - Type-safe methods for all core operations                      │   │
│  │ - Handles context building                                       │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│                              │ vscode.commands.executeCommand           │
│                              │ ('roopik.core.XXX', params)              │
└──────────────────────────────┼──────────────────────────────────────────┘
                               │
                               ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                        CORE (roopik)                                    │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ componentCommands.ts / canvasCommands.ts                         │   │
│  │ - registerAction2 handlers                                       │   │
│  │ - Routes to services                                             │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│                              ↓                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Services (ICanvasService, IComponentService)                     │   │
│  │ - Actual business logic                                          │   │
│  │ - File operations                                                │   │
│  │ - Build pipeline                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🔧 RoopikBridge - The Clean Wrapper

### **Create a Type-Safe Bridge in Extension**

```typescript
// extensions/roopik-dio/src/services/roopikBridge.ts

import * as vscode from 'vscode';

/**
 * Type-safe bridge for Extension ↔ Core communication
 * All core operations go through this bridge
 */
export class RoopikBridge {
  private static instance: RoopikBridge | null = null;

  static getInstance(): RoopikBridge {
    if (!RoopikBridge.instance) {
      RoopikBridge.instance = new RoopikBridge();
    }
    return RoopikBridge.instance;
  }

  // ========================================================================
  // Canvas Operations
  // ========================================================================

  /**
   * Create a new canvas
   */
  async createCanvas(name: string): Promise<CreateCanvasResult | undefined> {
    return vscode.commands.executeCommand<CreateCanvasResult>(
      'roopik.core.createCanvas',
      name
    );
  }

  /**
   * Get all canvases
   */
  async listCanvases(): Promise<Canvas[]> {
    return vscode.commands.executeCommand<Canvas[]>(
      'roopik.core.listCanvases'
    ) ?? [];
  }

  /**
   * Get canvas by ID
   */
  async getCanvas(canvasId: string): Promise<Canvas | undefined> {
    return vscode.commands.executeCommand<Canvas>(
      'roopik.core.getCanvas',
      canvasId
    );
  }

  /**
   * Update canvas metadata (e.g., chatTaskId)
   */
  async updateCanvasMetadata(
    canvasId: string,
    updates: Partial<CanvasMetadata>
  ): Promise<void> {
    return vscode.commands.executeCommand(
      'roopik.core.updateCanvasMetadata',
      canvasId,
      updates
    );
  }

  // ========================================================================
  // Component Operations
  // ========================================================================

  /**
   * Create a new component in canvas
   */
  async createComponent(request: CreateComponentRequest): Promise<Component | undefined> {
    return vscode.commands.executeCommand<Component>(
      'roopik.core.createComponent',
      request
    );
  }

  /**
   * Update component source code
   */
  async updateComponentSource(
    componentId: string,
    files: Record<string, string>
  ): Promise<void> {
    return vscode.commands.executeCommand(
      'roopik.core.updateComponentSource',
      componentId,
      files
    );
  }

  /**
   * Get component source code
   */
  async getComponentSource(componentId: string): Promise<Record<string, string> | undefined> {
    return vscode.commands.executeCommand<Record<string, string>>(
      'roopik.core.getComponentSource',
      componentId
    );
  }

  /**
   * List all components in canvas
   */
  async listComponents(canvasId: string): Promise<Component[]> {
    return vscode.commands.executeCommand<Component[]>(
      'roopik.core.listComponents',
      canvasId
    ) ?? [];
  }

  /**
   * Delete a component
   */
  async deleteComponent(componentId: string): Promise<void> {
    return vscode.commands.executeCommand(
      'roopik.core.deleteComponent',
      componentId
    );
  }

  /**
   * Rebuild a component
   */
  async rebuildComponent(componentId: string): Promise<void> {
    return vscode.commands.executeCommand(
      'roopik.core.rebuildComponent',
      componentId
    );
  }

  /**
   * Get bundled code for component
   */
  async getBundledCode(componentId: string): Promise<string | undefined> {
    return vscode.commands.executeCommand<string>(
      'roopik.core.getBundledCode',
      componentId
    );
  }

  // ========================================================================
  // Context Operations (for AI)
  // ========================================================================

  /**
   * Get full canvas context for AI
   */
  async getCanvasContext(canvasId: string): Promise<CanvasContext | undefined> {
    const canvas = await this.getCanvas(canvasId);
    if (!canvas) return undefined;

    const components = await this.listComponents(canvasId);

    return {
      canvas: {
        id: canvas.id,
        name: canvas.name,
        framework: canvas.framework || 'react',
        componentCount: components.length
      },
      components: components.map(c => ({
        id: c.id,
        name: c.name,
        path: c.path
      }))
    };
  }

  /**
   * Get selected component with full code
   */
  async getSelectedComponentWithCode(
    canvasId: string,
    componentId: string
  ): Promise<ComponentWithCode | undefined> {
    const components = await this.listComponents(canvasId);
    const component = components.find(c => c.id === componentId);
    if (!component) return undefined;

    const source = await this.getComponentSource(componentId);
    const mainFile = Object.entries(source || {}).find(([path]) =>
      path.endsWith('.tsx') || path.endsWith('.jsx')
    );

    return {
      id: component.id,
      name: component.name,
      path: component.path,
      code: mainFile ? mainFile[1] : ''
    };
  }
}

// ========================================================================
// Types
// ========================================================================

export interface Canvas {
  id: string;
  name: string;
  framework?: string;
  createdAt?: number;
  chatTaskId?: string;  // Link to Dio task
}

export interface CanvasMetadata {
  chatTaskId?: string;
  // ... other metadata
}

export interface CreateCanvasResult {
  id: string;
  name: string;
  path: string;
}

export interface Component {
  id: string;
  name: string;
  path: string;
  canvasId: string;
}

export interface CreateComponentRequest {
  canvasId: string;
  componentId?: string;  // AI can provide this!
  name: string;
  code: string;
  dependencies?: Dependency[];
}

export interface ComponentWithCode {
  id: string;
  name: string;
  path: string;
  code: string;
}

export interface CanvasContext {
  canvas: {
    id: string;
    name: string;
    framework: string;
    componentCount: number;
  };
  components: Array<{
    id: string;
    name: string;
    path: string;
  }>;
}

export interface Dependency {
  npm: string;
  global: string;
  url: string;
}
```

---

## 🛠️ Using Bridge in Dio's Tool Executor

### **MCP Tool Execution with Bridge**

```typescript
// extensions/roopik-dio/src/services/dioToolExecutor.ts

import { RoopikBridge, CreateComponentRequest } from './roopikBridge';

export class DioToolExecutor {
  private bridge = RoopikBridge.getInstance();

  async execute(toolCall: ToolCall, canvasId?: string): Promise<unknown> {
    switch (toolCall.name) {
      case 'create_component':
        return this.createComponent(toolCall.params, canvasId);
      case 'update_component':
        return this.updateComponent(toolCall.params, canvasId);
      case 'get_component_source':
        return this.getComponentSource(toolCall.params, canvasId);
      case 'list_canvas_components':
        return this.listComponents(canvasId);
      default:
        throw new Error(`Unknown tool: ${toolCall.name}`);
    }
  }

  private async createComponent(params: any, canvasId?: string) {
    if (!canvasId) throw new Error('No canvas context');

    const request: CreateComponentRequest = {
      canvasId,
      componentId: params.componentId,  // AI-provided ID!
      name: params.componentName,
      code: params.code,
      dependencies: params.dependencies
    };

    const result = await this.bridge.createComponent(request);

    return {
      success: !!result,
      componentId: result?.id,
      path: result?.path
    };
  }

  private async updateComponent(params: any, canvasId?: string) {
    if (!canvasId) throw new Error('No canvas context');

    const source = await this.bridge.getComponentSource(params.componentId);
    if (!source) throw new Error(`Component not found: ${params.componentId}`);

    // Find main file and update
    const mainFile = Object.keys(source).find(path =>
      path.endsWith('.tsx') || path.endsWith('.jsx')
    );

    if (mainFile) {
      await this.bridge.updateComponentSource(params.componentId, {
        [mainFile]: params.code
      });
    }

    return { success: true };
  }

  private async getComponentSource(params: any, canvasId?: string) {
    const source = await this.bridge.getComponentSource(params.componentId);
    const mainFile = Object.entries(source || {}).find(([path]) =>
      path.endsWith('.tsx') || path.endsWith('.jsx')
    );

    return { code: mainFile ? mainFile[1] : '' };
  }

  private async listComponents(canvasId?: string) {
    if (!canvasId) throw new Error('No canvas context');

    const components = await this.bridge.listComponents(canvasId);
    return {
      components: components.map(c => ({
        id: c.id,
        name: c.name,
        path: c.path
      }))
    };
  }
}
```

---

## 🔄 Core → Extension Communication (Events)

### **Option 1: VSCode Events (Recommended)**

Core can emit events that extension listens to:

```typescript
// Core emits event (canvasService.ts)
this._onDidCreateComponent.fire({ canvasId, componentId, component });

// But extension can't directly listen to core events...
// So we use a different approach:
```

### **Option 2: Polling (Simple but not ideal)**

```typescript
// Extension polls for changes
setInterval(async () => {
  const components = await bridge.listComponents(canvasId);
  // Compare with cached list
}, 1000);
```

### **Option 3: File Watcher (Better)**

```typescript
// Extension watches .roopik folder
const watcher = vscode.workspace.createFileSystemWatcher(
  new vscode.RelativePattern(workspaceRoot, '.roopik/**')
);

watcher.onDidChange(uri => {
  // File changed, refresh context
  if (uri.path.includes('components')) {
    refreshComponentList();
  }
});

watcher.onDidCreate(uri => {
  // New file, component created
  if (uri.path.includes('components')) {
    notifyComponentCreated(uri);
  }
});
```

### **Option 4: Core Commands (Best for Sync)**

Add commands that Core calls to notify Extension:

```typescript
// Core registers callback command
registerAction2(class extends Action2 {
  constructor() {
    super({ id: 'roopik.core.notifyComponentCreated', ... });
  }
  async run(accessor: ServicesAccessor, data: ComponentCreatedEvent) {
    // This command will be called by core service
    // Extension listens via executeCommand callback
  }
});

// Core service calls it
await vscode.commands.executeCommand('roopik.core.notifyComponentCreated', {
  canvasId: 'test',
  componentId: 'LoginForm'
});

// Extension registers handler
vscode.commands.registerCommand('roopik-dio.onComponentCreated', (data) => {
  // Handle component created event
});
```

---

## 📋 Commands to Add in Core

### **New Commands Needed for Dio**

```typescript
// Add to componentCommands.ts

// List canvases
registerAction2(class extends Action2 {
  constructor() {
    super({ id: 'roopik.core.listCanvases', ... });
  }
  async run(accessor: ServicesAccessor): Promise<Canvas[]> {
    const canvasService = accessor.get(ICanvasService);
    return canvasService.listCanvases();
  }
});

// Get canvas
registerAction2(class extends Action2 {
  constructor() {
    super({ id: 'roopik.core.getCanvas', ... });
  }
  async run(accessor: ServicesAccessor, canvasId: string): Promise<Canvas | undefined> {
    const canvasService = accessor.get(ICanvasService);
    return canvasService.getCanvas(canvasId);
  }
});

// Update canvas metadata
registerAction2(class extends Action2 {
  constructor() {
    super({ id: 'roopik.core.updateCanvasMetadata', ... });
  }
  async run(accessor: ServicesAccessor, canvasId: string, updates: Partial<CanvasMetadata>): Promise<void> {
    const canvasService = accessor.get(ICanvasService);
    return canvasService.updateCanvasMetadata(canvasId, updates);
  }
});

// List components in canvas
registerAction2(class extends Action2 {
  constructor() {
    super({ id: 'roopik.core.listComponents', ... });
  }
  async run(accessor: ServicesAccessor, canvasId: string): Promise<Component[]> {
    const componentService = accessor.get(IComponentService);
    return componentService.listComponents(canvasId);
  }
});

// Get active canvas (from editor state)
registerAction2(class extends Action2 {
  constructor() {
    super({ id: 'roopik.core.getActiveCanvas', ... });
  }
  async run(accessor: ServicesAccessor): Promise<{ canvasId: string; canvasName: string } | undefined> {
    // Get from editor service or state
    const editorService = accessor.get(IEditorService);
    const activeEditor = editorService.activeEditor;
    // ... extract canvas info
  }
});
```

---

## 🎯 Integration Flow

### **1. User Opens Canvas → Opens Dio Chat**

```typescript
// Extension: When user opens chat for canvas
async openCanvasDioChat(canvasId: string, canvasName: string) {
  const bridge = RoopikBridge.getInstance();

  // 1. Get canvas to check if task exists
  const canvas = await bridge.getCanvas(canvasId);

  if (canvas?.chatTaskId) {
    // 2a. Resume existing task
    await this.provider.showTaskWithId(canvas.chatTaskId);
  } else {
    // 2b. Create new task with canvas context
    const context = await bridge.getCanvasContext(canvasId);

    const task = await this.provider.createTask(undefined, undefined, {
      canvasContext: {
        canvasId,
        canvasName,
        componentCount: context?.components.length || 0
      }
    });

    // 3. Save task ID to canvas
    await bridge.updateCanvasMetadata(canvasId, {
      chatTaskId: task.taskId
    });
  }
}
```

### **2. AI Creates Component → Core Handles It**

```typescript
// Extension: When AI calls create_component tool
async handleToolCall(toolCall: ToolCall) {
  const executor = new DioToolExecutor();
  const result = await executor.execute(toolCall, this.currentCanvasId);

  // Result contains component info
  // AI receives confirmation with exact path
  return result;
}
```

### **3. User Selects Component → Pass to AI Context**

```typescript
// Extension: Build context for AI
async buildContextForAI(canvasId: string, selectedComponentId?: string) {
  const bridge = RoopikBridge.getInstance();

  // Get canvas context
  const context = await bridge.getCanvasContext(canvasId);

  // Get selected component with code
  let selectedComponent;
  if (selectedComponentId) {
    selectedComponent = await bridge.getSelectedComponentWithCode(
      canvasId,
      selectedComponentId
    );
  }

  return {
    ...context,
    selectedComponent
  };
}
```

---

## 📁 Storage: canvases.json with chatTaskId

```json
{
  "canvases": [
    {
      "id": "test",
      "name": "TEST",
      "framework": "react",
      "createdAt": 1734567890,
      "chatTaskId": "15c30957-cc85-4c1b-8532-4ef44d9528c2"
    }
  ]
}
```

---

## 📋 Implementation Checklist

### **Core Changes (Minimal)**

- [ ] Add `roopik.core.listCanvases` command
- [ ] Add `roopik.core.getCanvas` command
- [ ] Add `roopik.core.updateCanvasMetadata` command
- [ ] Add `roopik.core.listComponents` command
- [ ] Add `chatTaskId` field to canvas metadata type
- [ ] Add `componentId` parameter to `createComponent` (AI-provided ID)

### **Extension Changes**

- [ ] Create `RoopikBridge` class
- [ ] Create `DioToolExecutor` class
- [ ] Add canvas context to task creation
- [ ] Save `chatTaskId` to canvas after creating task
- [ ] Load existing task when opening canvas chat
- [ ] Build system prompt with canvas context

### **Integration**

- [ ] File watcher for component changes
- [ ] Pass selected component code to AI
- [ ] Handle tool call results
- [ ] Update UI after component operations

---

## ✅ Benefits of This Approach

1. **Minimal Core Changes** - Just add a few commands
2. **Clean Separation** - Bridge handles all communication
3. **Type-Safe** - TypeScript interfaces for all operations
4. **Future-Proof** - Can migrate to core later if needed
5. **Easy to Test** - Mock bridge for unit tests
6. **Roo Code Compatible** - Can still merge updates

---

## 🚀 Next Steps

1. **Create RoopikBridge** in extension
2. **Add missing commands** in core
3. **Implement DioToolExecutor** for MCP tools
4. **Add canvas context** to task creation
5. **Test integration** end-to-end

---

**Last Updated**: 2024-12-21
**Approach**: Extension-first with command bridge ✅
**Status**: Architecture finalized, ready for implementation
