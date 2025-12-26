# Dio Integration Strategy - Canvas + Chat

> **Smart integration with minimal changes to Roo Code architecture**

---

## 📍 Global Storage Location Found!

### **Exact Path (Development Mode)**
```
C:\Users\Humblebee\AppData\Roaming\code-oss-dev\User\globalStorage\roopik.roopik-dio\
├── tasks/
│   ├── 15c30957-cc85-4c1b-8532-4ef44d9528c2/
│   │   ├── api_conversation_history.json
│   │   ├── ui_messages.json
│   │   ├── task_metadata.json
│   │   └── checkpoints/
│   └── ...
├── settings/
└── cache/
```

### **Exact Path (Production - Installed Extension)**
```
C:\Users\Humblebee\AppData\Roaming\Code\User\globalStorage\rooveterinaryinc.roo-cline\
└── tasks/
    └── {taskId}/
        ├── api_conversation_history.json
        ├── ui_messages.json
        └── checkpoints/
```

**Key Insight**:
- Development uses: `code-oss-dev/...roopik.roopik-dio`
- Production uses: `Code/...rooveterinaryinc.roo-cline`

**Current Structure**:
```json
// task_metadata.json
{
  "files_in_context": [
    {
      "path": ".roopik/canvases/test/components/5a75f206b9b94309/meta.json",
      "record_state": "active",
      "record_source": "read_tool",
      "roo_read_date": 1766294844205,
      "roo_edit_date": null,
      "user_edit_date": null
    }
  ]
}
```

---

## 🎯 Your Concerns Addressed

### 1. **"We need to pass richer context (selected component code)"**

✅ **YES! We absolutely need to enhance context passing.**

**Current Flow**:
```
User opens canvas → opens chat
  ↓
No canvas context passed to Task
  ↓
AI doesn't know which component is selected
```

**Enhanced Flow**:
```
User opens canvas "test" with component "LoginForm" selected
  ↓
createTask() called with canvasContext:
{
  canvasId: "test",
  canvasName: "TEST",
  selectedComponent: {
    id: "LoginForm",
    name: "Login Form",
    code: "..." // Full component code
  }
}
  ↓
Context added to EVERY API call
  ↓
AI always knows what component user is looking at
```

---

### 2. **"Store taskId in canvases.json"**

✅ **BRILLIANT! This is the perfect approach!**

**Current canvases.json**:
```json
{
  "canvases": [
    {
      "id": "test",
      "name": "TEST",
      "framework": "react",
      "createdAt": 1234567890
    }
  ]
}
```

**Enhanced canvases.json**:
```json
{
  "canvases": [
    {
      "id": "test",
      "name": "TEST",
      "framework": "react",
      "createdAt": 1234567890,

      // ✨ NEW: Link to chat session
      "chatTaskId": "15c30957-cc85-4c1b-8532-4ef44d9528c2"
    }
  ]
}
```

**Benefits**:
- ✅ Canvas knows which task (chat session) it owns
- ✅ Can resume previous chat when reopening canvas
- ✅ No need to search through all tasks
- ✅ Clean bidirectional link: Canvas ↔ Task

**Implementation**:
```typescript
// When user opens canvas chat for first time:
1. Check if canvas.chatTaskId exists
2. If yes: Load that task (resume previous chat)
3. If no: Create new task, save taskId to canvas

// canvasService.ts
async openCanvasChat(canvasId: string) {
  const canvas = await getCanvas(canvasId)

  if (canvas.chatTaskId) {
    // Resume previous chat
    await provider.showTaskWithId(canvas.chatTaskId)
  } else {
    // Create new chat
    const task = await provider.createTask(undefined, undefined, {
      canvasContext: {
        canvasId: canvas.id,
        canvasName: canvas.name
      }
    })

    // Save taskId to canvas
    await updateCanvas(canvasId, { chatTaskId: task.taskId })
  }
}
```

---

### 3. **"Should we keep in extension or migrate to core?"**

⚠️ **CRITICAL DECISION POINT!**

Let me analyze both options:

### **Option A: Keep in Extension** (Current Roo Code approach)

**Pros**:
- ✅ Less work (extension already has all chat logic)
- ✅ Can use existing Roo Code features as-is
- ✅ Easier testing (run extension, see results)
- ✅ Independent updates (extension vs core)

**Cons**:
- ❌ Extension is separate process (IPC overhead)
- ❌ Canvas services in Core can't directly call chat
- ❌ Need to coordinate between Core and Extension
- ❌ Two codebases to maintain

**Architecture**:
```
┌─────────────────────────────────────────────────────────────┐
│                   Roopik Core (VSCode Fork)                 │
│                                                             │
│  ┌────────────────────────────────────────────────────┐    │
│  │ Canvas Services (src/vs/workbench/contrib/roopik/) │    │
│  │ - CanvasEditorPane                                 │    │
│  │ - ComponentService                                 │    │
│  │ - BrowserViewService                               │    │
│  └────────────────────────────────────────────────────┘    │
│                         │                                   │
│                         ↓                                   │
│                   IPC (postMessage)                         │
└─────────────────────────────────────────────────────────────┘
                          │
                          ↓
┌─────────────────────────────────────────────────────────────┐
│             Extension (extensions/roopik-dio/)              │
│                                                             │
│  ┌────────────────────────────────────────────────────┐    │
│  │ ClineProvider (Chat Controller)                    │    │
│  │ - Task management                                  │    │
│  │ - Message handling                                 │    │
│  │ - Context building                                 │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

### **Option B: Migrate to Core** (Recommended!)

**Pros**:
- ✅ **Direct integration**: Canvas services can directly call chat
- ✅ **Unified codebase**: All Roopik logic in one place
- ✅ **Better performance**: No IPC overhead
- ✅ **Cleaner architecture**: Core owns all features
- ✅ **Future-proof**: Easier to add more AI features

**Cons**:
- ⚠️ More work upfront (migration effort)
- ⚠️ Need to understand VSCode core DI system
- ⚠️ Longer compile times during dev

**Architecture**:
```
┌─────────────────────────────────────────────────────────────┐
│                   Roopik Core (VSCode Fork)                 │
│                                                             │
│  ┌────────────────────────────────────────────────────┐    │
│  │ src/vs/workbench/contrib/roopik/                   │    │
│  │                                                    │    │
│  │ ├── canvas/                                        │    │
│  │ │   ├── canvasEditor.ts                           │    │
│  │ │   └── componentService.ts                       │    │
│  │                                                    │    │
│  │ ├── browser/                                       │    │
│  │ │   └── browserViewService.ts                     │    │
│  │                                                    │    │
│  │ └── dio/                          ✨ NEW          │    │
│  │     ├── common/                                    │    │
│  │     │   ├── dioService.ts         (Interface)     │    │
│  │     │   ├── dioTypes.ts           (Task, Message) │    │
│  │     │   └── dioTools.ts           (MCP tools)     │    │
│  │     │                                              │    │
│  │     ├── browser/                                   │    │
│  │     │   ├── dioServiceImpl.ts     (Implementation)│    │
│  │     │   ├── taskManager.ts        (Task lifecycle)│    │
│  │     │   └── contextBuilder.ts     (Canvas context)│    │
│  │     │                                              │    │
│  │     └── node/                                      │    │
│  │         └── dioExecutor.ts        (AI API calls)  │    │
│  └────────────────────────────────────────────────────┘    │
│                                                             │
│  Services communicate via DI (no IPC needed!)              │
└─────────────────────────────────────────────────────────────┘
```

**Why This Is Better**:

1. **Direct Service Calls**:
```typescript
// In CanvasEditor.ts
constructor(
  @IDioService private dioService: IDioService,
  @IComponentService private componentService: IComponentService
) {}

async openChat() {
  const selectedComponent = await this.componentService.getSelectedComponent()

  // Direct call - no IPC!
  await this.dioService.openCanvasChat({
    canvasId: this.canvasId,
    selectedComponent: {
      id: selectedComponent.id,
      code: selectedComponent.code  // Pass full code
    }
  })
}
```

2. **Unified Storage**:
```typescript
// All storage in workspace
.roopik/
├── canvases/
│   ├── canvases.json           ← Canvas metadata (includes chatTaskId)
│   └── test/
│       ├── canvas.json
│       ├── components/
│       └── dio/                ✨ NEW
│           └── tasks/
│               └── {taskId}/
│                   ├── ui_messages.json
│                   ├── api_conversation_history.json
│                   └── task_metadata.json
```

3. **Shared Types**:
```typescript
// common/dioTypes.ts
export interface DioTask {
  taskId: string
  canvasId: string
  messages: DioMessage[]
  apiHistory: APIMessage[]
  mode: string
  status: TaskStatus
}

// Both canvas and dio services use same types!
```

---

## 🚀 **Recommended Approach: Migrate to Core**

### **Why Core is Better for Roopik**

Your concern is **100% valid**:

> "most of our code is in core only, only rendering layer is present in the extension but its backend logic everything is also present in core!"

**Exactly!** So let's move Dio to core too:

### **Migration Strategy**

**Phase 1: Port Core Logic** (Week 1)
```
extensions/roopik-dio/src/
├── core/
│   ├── task/Task.ts                    → roopik/dio/common/task.ts
│   ├── task-persistence/               → roopik/dio/node/persistence/
│   ├── webview/ClineProvider.ts        → roopik/dio/browser/dioService.ts
│   └── config/                         → roopik/dio/common/config/
```

**Phase 2: Create Service Interfaces** (Week 1)
```typescript
// src/vs/workbench/contrib/roopik/dio/common/dioService.ts

export const IDioService = createDecorator<IDioService>('roopikDioService');

export interface IDioService {
  // Task management
  createTask(context: DioContext): Promise<DioTask>
  loadTask(taskId: string): Promise<DioTask>
  getCurrentTask(): DioTask | undefined

  // Canvas integration
  openCanvasChat(options: {
    canvasId: string
    canvasName: string
    selectedComponent?: ComponentInfo
  }): Promise<void>

  // Context building
  getCanvasContext(canvasId: string): Promise<DioContext>
}
```

**Phase 3: Implement Services** (Week 2)
```typescript
// src/vs/workbench/contrib/roopik/dio/browser/dioServiceImpl.ts

export class DioService implements IDioService {
  constructor(
    @IComponentService private componentService: IComponentService,
    @IFileService private fileService: IFileService,
    @IStorageService private storageService: IStorageService
  ) {}

  async openCanvasChat(options) {
    // 1. Get canvas info
    const canvas = await this.componentService.getCanvas(options.canvasId)

    // 2. Check if chat task exists
    if (canvas.chatTaskId) {
      await this.loadTask(canvas.chatTaskId)
    } else {
      const task = await this.createTask({
        canvasId: options.canvasId,
        canvasName: options.canvasName,
        selectedComponent: options.selectedComponent
      })

      // 3. Save taskId to canvas
      await this.componentService.updateCanvas(options.canvasId, {
        chatTaskId: task.taskId
      })
    }
  }
}
```

**Phase 4: Register in Core** (Week 2)
```typescript
// src/vs/workbench/contrib/roopik/dio/browser/dio.contribution.ts

registerSingleton(IDioService, DioService, InstantiationType.Delayed);
```

**Phase 5: Integrate with Canvas** (Week 2-3)
```typescript
// src/vs/workbench/contrib/roopik/canvas/browser/canvasEditor.ts

export class CanvasEditor extends EditorPane {
  constructor(
    @IDioService private dioService: IDioService
  ) {
    super()
  }

  private async handleChatButtonClick() {
    const selectedComponent = this.getSelectedComponent()

    await this.dioService.openCanvasChat({
      canvasId: this.canvasId,
      canvasName: this.canvasName,
      selectedComponent: selectedComponent ? {
        id: selectedComponent.id,
        name: selectedComponent.name,
        code: await this.fileService.readFile(selectedComponent.path)
      } : undefined
    })
  }
}
```

---

## 📋 Context Enhancement Strategy

### **What to Pass to AI**

```typescript
interface DioContext {
  // Canvas info
  canvas: {
    id: string
    name: string
    framework: string
    componentCount: number
  }

  // Selected component (ALWAYS include if selected)
  selectedComponent?: {
    id: string
    name: string
    path: string
    code: string           // ✨ FULL component code
    dependencies: Dependency[]
  }

  // All components (metadata only, not full code)
  allComponents: Array<{
    id: string
    name: string
    path: string
  }>

  // Previous chat history (loaded from task)
  chatHistory: DioMessage[]
}
```

### **System Prompt Enhancement**

```typescript
function buildSystemPrompt(context: DioContext): string {
  return `
You are Dio, an AI agent for Roopik IDE - a design-to-code platform.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CURRENT CANVAS CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 Canvas: "${context.canvas.name}" (ID: ${context.canvas.id})
🧩 Total Components: ${context.canvas.componentCount}
⚛️  Framework: ${context.canvas.framework}

${context.selectedComponent ? `
🎯 CURRENTLY SELECTED COMPONENT: "${context.selectedComponent.name}"

📄 File: ${context.selectedComponent.path}

💻 Current Code:
\`\`\`tsx
${context.selectedComponent.code}
\`\`\`

When the user asks you to modify "this component" or "the component",
they mean THIS component: ${context.selectedComponent.name}
` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AVAILABLE MCP TOOLS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You have access to these tools:
- create_component: Create new component in this canvas
- update_component: Modify existing component
- get_component_source: Read component code
- list_canvas_components: See all components

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`
}
```

---

## 🎯 Final Recommendation

### **✅ DO THIS:**

1. **Migrate Dio to Core** (`src/vs/workbench/contrib/roopik/dio/`)
2. **Add `chatTaskId` to canvases.json** (bidirectional link)
3. **Pass full selected component code** to AI context
4. **Store tasks in workspace** (`.roopik/canvases/{canvasId}/dio/tasks/`)
5. **Use VSCode DI system** for service integration

### **❌ DON'T DO THIS:**

1. ❌ Keep chat in extension (creates IPC complexity)
2. ❌ Duplicate storage (mirror to canvas folder)
3. ❌ Pass minimal context (AI needs rich context)

---

## 📦 Storage Structure (Final)

```
.roopik/
├── canvases/
│   ├── canvases.json                    # Canvas registry
│   │   {
│   │     "canvases": [
│   │       {
│   │         "id": "test",
│   │         "name": "TEST",
│   │         "chatTaskId": "15c30957-..."  ✨ NEW
│   │       }
│   │     ]
│   │   }
│   │
│   └── test/
│       ├── canvas.json
│       ├── components/
│       │   └── ...
│       │
│       └── dio/                          ✨ NEW
│           └── tasks/
│               └── 15c30957-cc85.../
│                   ├── ui_messages.json
│                   ├── api_conversation_history.json
│                   └── task_metadata.json
```

---

**Last Updated**: 2024-12-21
**Decision**: Migrate to Core ✅
**Next Step**: Create `roopik/dio/` folder structure in core
