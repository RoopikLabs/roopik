# Dio: Active Canvas Detection & Component ID Strategy

> **How Dio determines active canvas and handles AI-generated component IDs**

---

## 🎯 How Active Canvas is Tracked (Already Implemented!)

### **The System Already Exists**

Core already tracks which canvas is focused:

```typescript
// CanvasService tracks focus
private focusedCanvasId: string | null = null;

// When panel gets focus
registerPanelFocused(canvasId: string): void {
  this.focusedCanvasId = canvasId;
  this._onCanvasFocusChanged.fire({
    previousCanvasId: previousId,
    currentCanvasId: canvasId
  });
}

// Get current focused canvas
getFocusedCanvasId(): string | null {
  return this.focusedCanvasId;
}
```

### **How It's Used**

```typescript
// In importCommands.ts - This is exactly what Dio will do!
let targetCanvasId = await canvasService.getFocusedCanvasIdAsync();
if (!targetCanvasId) {
  // No canvas open, show error or prompt user
  return;
}
```

### **Available IPC Methods**

| Method | Location | Purpose |
|--------|----------|---------|
| `getFocusedCanvasIdAsync()` | canvasChannel.ts | Get currently focused canvas ID |
| `registerPanelFocused(canvasId)` | canvasCommands.ts | Set canvas as focused |
| `registerPanelOpen(canvasId)` | canvasCommands.ts | Mark canvas panel as open |
| `registerPanelClosed(canvasId)` | canvasCommands.ts | Mark canvas panel as closed |

---

## 📡 Extension → Core: Get Active Canvas

### **Add Command to Core**

```typescript
// Add to componentCommands.ts or canvasCommands.ts

registerAction2(class extends Action2 {
  constructor() {
    super({
      id: 'roopik.core.getFocusedCanvas',
      title: localize2('roopik.core.getFocusedCanvas', 'Get Focused Canvas'),
      f1: false
    });
  }

  async run(accessor: ServicesAccessor): Promise<{ canvasId: string; canvasName: string } | null> {
    const canvasService = accessor.get(ICanvasService);
    const canvasId = await canvasService.getFocusedCanvasIdAsync();

    if (!canvasId) {
      return null;
    }

    const canvas = canvasService.getCanvas(canvasId);
    if (!canvas) {
      return null;
    }

    return {
      canvasId: canvas.id,
      canvasName: canvas.name
    };
  }
});
```

### **Extension Uses It**

```typescript
// RoopikBridge.ts

async getFocusedCanvas(): Promise<{ canvasId: string; canvasName: string } | null> {
  return vscode.commands.executeCommand<{ canvasId: string; canvasName: string } | null>(
    'roopik.core.getFocusedCanvas'
  );
}
```

---

## 🆔 AI-Generated Component IDs

### **Current Implementation**

```typescript
// componentService.ts - Line 48
function generateComponentId(): string {
  return crypto.randomBytes(8).toString('hex');  // e.g., "5a75f206b9b94309"
}

// Used in createComponent - Line 206
const componentId = generateComponentId();  // Always random
```

### **Problem**

AI creates component → Random ID generated → AI doesn't know where it saved

### **Solution: Accept Optional componentId**

```typescript
// types.ts - Update CreateComponentRequest
export interface CreateComponentRequest {
  name: string;
  canvasId?: string;

  // ✨ NEW: AI can provide component ID
  componentId?: string;

  source: ComponentSource;
  sourceData: SourceData;
  framework?: Framework;
  dependencies?: Record<string, string>;
}
```

```typescript
// componentService.ts - Update createComponent

async createComponent(request: CreateComponentRequest): Promise<Component> {
  this.ensureInitialized();

  // 1. Resolve canvas ID
  const canvasId = request.canvasId || await this.storageService.getActiveCanvasId();
  if (!canvasId) {
    throw new Error('ComponentService: No canvas specified and no active canvas');
  }

  // 2. Import files via ImportService
  const importResult = await this.importService.import(request.sourceData);

  // 3. ✨ Use AI-provided ID if present, else generate random
  const componentId = request.componentId || generateComponentId();

  // Validate AI-provided ID (must be safe for filesystem)
  if (request.componentId && !isValidComponentId(request.componentId)) {
    throw new Error(`Invalid componentId: ${request.componentId}. Must be PascalCase, alphanumeric with underscores.`);
  }

  // ... rest of implementation
}

// Helper function
function isValidComponentId(id: string): boolean {
  // PascalCase, alphanumeric, underscores allowed
  return /^[A-Z][a-zA-Z0-9_]*$/.test(id);
}
```

---

## 🔄 Complete Flow: Canvas → Dio → Component Creation

### **Step 1: User Opens Canvas & Starts Dio Chat**

```typescript
// Extension: DioProvider.ts

async openCanvasChat() {
  // 1. Get currently focused canvas from Core
  const focusedCanvas = await this.bridge.getFocusedCanvas();

  if (!focusedCanvas) {
    // No canvas open - show message to user
    vscode.window.showWarningMessage(
      'Please open a canvas first before starting a chat with Dio.'
    );
    return;
  }

  // 2. Check if task exists for this canvas
  const canvas = await this.bridge.getCanvas(focusedCanvas.canvasId);

  if (canvas?.chatTaskId) {
    // Resume existing chat
    await this.provider.showTaskWithId(canvas.chatTaskId);
  } else {
    // Create new chat for this canvas
    const task = await this.provider.createTask(undefined, undefined, {
      canvasContext: {
        canvasId: focusedCanvas.canvasId,
        canvasName: focusedCanvas.canvasName
      }
    });

    // Save task ID to canvas
    await this.bridge.updateCanvasMetadata(focusedCanvas.canvasId, {
      chatTaskId: task.taskId
    });
  }
}
```

### **Step 2: AI Creates Component**

```typescript
// Extension: DioToolExecutor.ts

async createComponent(params: any, canvasId: string) {
  // AI provides:
  // - componentId: "LoginForm" (PascalCase)
  // - componentName: "Login Form" (human-readable)
  // - code: "export default function LoginForm() { ... }"

  const result = await this.bridge.createComponent({
    canvasId,  // From task's canvas context
    componentId: params.componentId,  // AI-generated ID!
    name: params.componentName,
    source: 'ai-agent',
    sourceData: {
      type: 'ai-agent',
      code: params.code,
      agentId: 'dio',
      prompt: 'User requested...'
    }
  });

  // Return confirmation to AI
  return {
    success: true,
    componentId: result.id,
    path: result.storagePath,
    message: `Component "${result.name}" created at ${result.storagePath}`
  };
}
```

### **Step 3: AI Updates Component Later**

```typescript
// AI knows the exact componentId it created!
async updateComponent(params: any, canvasId: string) {
  await this.bridge.updateComponentSource(
    params.componentId,  // "LoginForm" - AI knows this!
    { 'LoginForm.tsx': params.code }
  );

  return { success: true };
}
```

---

## 📋 Commands to Add/Modify in Core

### **New Commands**

| Command | Purpose |
|---------|---------|
| `roopik.core.getFocusedCanvas` | Get focused canvas ID and name |
| `roopik.core.listCanvases` | Get all canvases |
| `roopik.core.getCanvas` | Get canvas by ID (including chatTaskId) |
| `roopik.core.updateCanvasMetadata` | Update canvas metadata (chatTaskId, etc.) |
| `roopik.core.listComponents` | Get components in canvas |

### **Modify CreateComponentRequest**

```typescript
// types.ts
export interface CreateComponentRequest {
  name: string;
  canvasId?: string;
  componentId?: string;  // ✨ NEW: Optional AI-provided ID
  source: ComponentSource;
  sourceData: SourceData;
  framework?: Framework;
  dependencies?: Record<string, string>;
}
```

### **Modify componentService.createComponent**

```typescript
// componentService.ts
const componentId = request.componentId || generateComponentId();
```

---

## 🎨 Canvas Metadata Enhancement

### **Current canvases.json**

```json
{
  "canvases": [
    {
      "id": "test",
      "name": "TEST",
      "framework": "react",
      "createdAt": 1734567890
    }
  ]
}
```

### **Enhanced canvases.json**

```json
{
  "canvases": [
    {
      "id": "test",
      "name": "TEST",
      "framework": "react",
      "createdAt": 1734567890,
      "chatTaskId": "15c30957-cc85-4c1b-8532-4ef44d9528c2"  // ✨ NEW
    }
  ]
}
```

---

## 🔍 How to Know Mode (Canvas vs Project)

### **Currently Focused Editor Type**

Core tracks what's open. Extension can determine mode by checking:

```typescript
// Option 1: Check if canvas is focused
const focusedCanvas = await bridge.getFocusedCanvas();
if (focusedCanvas) {
  // Mode 1: Canvas is active
}

// Option 2: Check active editor type (if implemented)
// const activeEditor = await bridge.getActiveEditorType();
// if (activeEditor === 'canvas') { ... }
// if (activeEditor === 'project-preview') { ... }
```

### **For Dio, We Only Care About Canvas**

Dio is specifically for canvas mode. If no canvas is focused:
- Show message: "Open a canvas to chat with Dio"
- Or: Allow creating new canvas from chat

---

## ✅ Summary

### **What Already Exists**

- ✅ `focusedCanvasId` tracking in CanvasService
- ✅ `registerPanelFocused()` to set active canvas
- ✅ `getFocusedCanvasIdAsync()` to get active canvas
- ✅ IPC channel for all canvas operations
- ✅ Component creation pipeline

### **What Needs to Be Added**

**Core Changes**:
1. Add `roopik.core.getFocusedCanvas` command (returns canvasId + name)
2. Add `componentId` field to `CreateComponentRequest`
3. Modify `createComponent()` to use provided ID if present
4. Add `roopik.core.listCanvases`, `roopik.core.getCanvas`, `roopik.core.updateCanvasMetadata`
5. Add `chatTaskId` field to canvas metadata type

**Extension Changes**:
1. Create `RoopikBridge` class with type-safe command wrappers
2. Create `DioToolExecutor` for MCP tools
3. Add canvas context handling in `ClineProvider`
4. Store/load `chatTaskId` for canvas-specific chat sessions

---

**Last Updated**: 2024-12-21
**Status**: Architecture complete ✅
**Key Insight**: Most infrastructure already exists - just need to add a few commands and the componentId parameter!
