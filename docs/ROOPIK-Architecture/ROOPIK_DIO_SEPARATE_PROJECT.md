# Roopik-Dio as Separate Core Project

> **Creating roopik-dio as an independent project within VSCode core, communicating with roopik via DI**

---

## 🎯 Your Vision: Two Separate Projects in Core

```
src/vs/workbench/contrib/
├── roopik/                    ← Canvas, Browser Preview, Component Services
└── roopikDio/                 ← AI Agent, Chat, Task Management (NEW!)
```

**Why This is BRILLIANT**:
- ✅ **Clean separation**: Canvas logic ≠ AI logic
- ✅ **Independent development**: Teams can work separately
- ✅ **Clear boundaries**: Each project owns its domain
- ✅ **Easy to understand**: No mixing of concerns
- ✅ **Still integrated**: Communication via VSCode DI system

---

## 📦 How VSCode Core Projects Communicate

### **VSCode's Contribution System**

Each `contrib/{project}` is a **self-contained feature** that:
1. Defines its own **services** (interfaces)
2. Implements those services
3. Registers services with VSCode's **Dependency Injection** system
4. Other projects import and inject those services

**Example: How `chat` and `inlineChat` communicate**:

```typescript
// contrib/chat/common/chatService.ts
export const IChatService = createDecorator<IChatService>('chatService');

export interface IChatService {
  startSession(location: ChatAgentLocation): Promise<void>
  sendMessage(text: string): Promise<void>
}

// contrib/chat/browser/chat.contribution.ts
registerSingleton(IChatService, ChatService, InstantiationType.Delayed);
```

```typescript
// contrib/inlineChat/browser/inlineChatController.ts
export class InlineChatController {
  constructor(
    @IChatService private chatService: IChatService  // ✨ Injected!
  ) {}

  async showInlineChat() {
    // Different project, but can call chat service!
    await this.chatService.startSession(ChatAgentLocation.Editor)
  }
}
```

**Key Points**:
- No direct imports between projects
- Communication through **service interfaces**
- VSCode's DI container manages instances
- Type-safe, testable, mockable

---

## 🏗️ Roopik-Dio Project Structure

### **Folder Structure**

```
src/vs/workbench/contrib/roopikDio/
├── common/
│   ├── roopikDio.ts                      # Service interfaces
│   ├── roopikDioTypes.ts                 # Task, Message, Context types
│   ├── roopikDioTools.ts                 # MCP tool definitions
│   └── roopikDioStorage.ts               # Storage interfaces
│
├── browser/
│   ├── roopikDio.contribution.ts         # Main registration file
│   ├── roopikDioService.ts               # Service implementation
│   ├── taskManager.ts                    # Task lifecycle
│   ├── contextBuilder.ts                 # Build canvas context
│   ├── chatView.ts                       # Chat UI (webview)
│   └── dioEditor.ts                      # Chat editor pane
│
├── node/
│   ├── dioExecutor.ts                    # AI API calls
│   ├── taskPersistence.ts                # Save/load tasks
│   └── storageManager.ts                 # File operations
│
└── electron-main/
    └── dioMainService.ts                 # Main process services (if needed)
```

---

## 🔌 Service Communication: Roopik ↔ Roopik-Dio

### **Step 1: Define Roopik-Dio Services** (roopikDio/common/roopikDio.ts)

```typescript
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

// Service identifier
export const IRoopikDioService = createDecorator<IRoopikDioService>('roopikDioService');

// Service interface
export interface IRoopikDioService {
  /**
   * Open chat for a specific canvas
   */
  openCanvasChat(options: {
    canvasId: string
    canvasName: string
    selectedComponent?: {
      id: string
      name: string
      code: string
    }
  }): Promise<void>

  /**
   * Get current task (chat session)
   */
  getCurrentTask(): DioTask | undefined

  /**
   * Send message to current task
   */
  sendMessage(text: string, images?: string[]): Promise<void>

  /**
   * Load task by ID
   */
  loadTask(taskId: string): Promise<DioTask>
}

// Types
export interface DioTask {
  taskId: string
  canvasId?: string
  messages: DioMessage[]
  apiHistory: APIMessage[]
  mode: string
  status: TaskStatus
}

export interface DioMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  toolCalls?: ToolCall[]
}

export type TaskStatus = 'active' | 'paused' | 'completed' | 'delegated'
```

---

### **Step 2: Implement Service** (roopikDio/browser/roopikDioService.ts)

```typescript
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IRoopikDioService, DioTask } from '../common/roopikDio.js';
import { IComponentService } from '../../roopik/common/roopik.js';  // ✨ Import roopik service!

export class RoopikDioService extends Disposable implements IRoopikDioService {
  private currentTask: DioTask | undefined;

  constructor(
    @IFileService private fileService: IFileService,
    @IStorageService private storageService: IStorageService,
    @IComponentService private componentService: IComponentService  // ✨ Inject roopik service!
  ) {
    super();
  }

  async openCanvasChat(options: {
    canvasId: string
    canvasName: string
    selectedComponent?: { id: string; name: string; code: string }
  }): Promise<void> {
    // 1. Get canvas info from roopik service
    const canvas = await this.componentService.getCanvas(options.canvasId);

    // 2. Check if task exists for this canvas
    if (canvas.chatTaskId) {
      await this.loadTask(canvas.chatTaskId);
    } else {
      // 3. Create new task
      const task = await this.createTask({
        canvasId: options.canvasId,
        canvasName: options.canvasName,
        selectedComponent: options.selectedComponent
      });

      // 4. Save taskId to canvas (call roopik service)
      await this.componentService.updateCanvas(options.canvasId, {
        chatTaskId: task.taskId
      });
    }

    // 5. Open chat editor
    // ... (implementation)
  }

  getCurrentTask(): DioTask | undefined {
    return this.currentTask;
  }

  async sendMessage(text: string, images?: string[]): Promise<void> {
    // Implementation
  }

  async loadTask(taskId: string): Promise<DioTask> {
    // Implementation
  }

  private async createTask(options: any): Promise<DioTask> {
    // Implementation
  }
}
```

---

### **Step 3: Register Service** (roopikDio/browser/roopikDio.contribution.ts)

```typescript
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IRoopikDioService } from '../common/roopikDio.js';
import { RoopikDioService } from './roopikDioService.js';

// Register service as singleton
registerSingleton(IRoopikDioService, RoopikDioService, InstantiationType.Delayed);

// Register workbench contributions
// ... (commands, editors, views, etc.)
```

---

### **Step 4: Use in Roopik Project** (roopik/browser/canvasEditor.ts)

```typescript
import { EditorPane } from '../../../../workbench/browser/parts/editor/editorPane.js';
import { IComponentService } from '../common/roopik.js';
import { IRoopikDioService } from '../../roopikDio/common/roopikDio.js';  // ✨ Import dio service!

export class CanvasEditor extends EditorPane {
  constructor(
    @IComponentService private componentService: IComponentService,
    @IRoopikDioService private dioService: IRoopikDioService  // ✨ Inject dio service!
  ) {
    super();
  }

  private async handleChatButtonClick(): Promise<void> {
    const selectedComponent = this.getSelectedComponent();

    // Call roopik-dio service
    await this.dioService.openCanvasChat({
      canvasId: this.canvasId,
      canvasName: this.canvasName,
      selectedComponent: selectedComponent ? {
        id: selectedComponent.id,
        name: selectedComponent.name,
        code: await this.componentService.readComponentCode(selectedComponent.path)
      } : undefined
    });
  }
}
```

---

## 🔄 Two-Way Communication Example

### **Scenario: User opens canvas → clicks chat → AI creates component**

```typescript
// 1. User clicks chat button in Canvas (roopik project)
CanvasEditor.handleChatButtonClick()
  ↓
// 2. Roopik calls roopik-dio service
dioService.openCanvasChat({ canvasId, selectedComponent })
  ↓
// 3. Roopik-dio opens chat, user sends: "Create a Button component"
dioService.sendMessage("Create a Button component")
  ↓
// 4. AI responds with create_component tool call
dioService.handleToolCall({
  name: "create_component",
  params: {
    canvasId: "test",
    componentId: "Button_Primary",
    code: "..."
  }
})
  ↓
// 5. Roopik-dio calls BACK to roopik service
componentService.createComponent({
  canvasId: "test",
  componentId: "Button_Primary",
  code: "..."
})
  ↓
// 6. Roopik creates component, emits event
componentService.emit('componentCreated', { canvasId, componentId })
  ↓
// 7. Both projects can listen to this event
// - Roopik: Update canvas UI
// - Roopik-dio: Confirm to AI
```

---

## 📋 Registration in workbench.common.main.ts

You need to register **both** projects:

```typescript
// src/vs/workbench/workbench.common.main.ts

// ... existing imports

// Roopik (already registered)
import 'vs/workbench/contrib/roopik/browser/roopik.contribution';

// Roopik-Dio (NEW!)
import 'vs/workbench/contrib/roopikDio/browser/roopikDio.contribution';
```

---

## 🎯 Complete Communication Flow

### **Canvas → Dio → Canvas (Component Creation)**

```
┌─────────────────────────────────────────────────────────────┐
│                  ROOPIK PROJECT                             │
│                                                             │
│  CanvasEditor                                               │
│  └── handleChatButtonClick()                                │
│      └── dioService.openCanvasChat({ canvasId, ... })      │
└─────────────────────────────────────────────────────────────┘
                         │
                         ↓ (DI injection)
┌─────────────────────────────────────────────────────────────┐
│                ROOPIK-DIO PROJECT                           │
│                                                             │
│  RoopikDioService                                           │
│  ├── openCanvasChat()                                       │
│  │   └── componentService.getCanvas(canvasId) ←────┐       │
│  │                                                  │       │
│  ├── sendMessage("Create Button")                  │       │
│  │   └── Call Anthropic API                        │       │
│  │       └── AI responds with create_component     │       │
│  │                                                  │       │
│  └── handleToolCall()                               │       │
│      └── componentService.createComponent() ────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                         │
                         ↓ (DI injection back)
┌─────────────────────────────────────────────────────────────┐
│                  ROOPIK PROJECT                             │
│                                                             │
│  ComponentService                                           │
│  └── createComponent()                                      │
│      └── Save to .roopik/canvases/{canvasId}/components/   │
│      └── Emit 'componentCreated' event                      │
│                                                             │
│  CanvasEditor (listening)                                   │
│  └── onComponentCreated()                                   │
│      └── Refresh canvas UI                                  │
└─────────────────────────────────────────────────────────────┘
```

**Key Points**:
- ✅ No direct imports between project code
- ✅ All communication via **service interfaces**
- ✅ VSCode DI manages dependencies
- ✅ Clean, testable, maintainable

---

## 📝 Implementation Checklist

### **Phase 1: Create Roopik-Dio Project Structure**

```bash
# Create folders
mkdir -p src/vs/workbench/contrib/roopikDio/common
mkdir -p src/vs/workbench/contrib/roopikDio/browser
mkdir -p src/vs/workbench/contrib/roopikDio/node
mkdir -p src/vs/workbench/contrib/roopikDio/electron-main
```

### **Phase 2: Define Services**

- [ ] Create `roopikDio/common/roopikDio.ts` (IRoopikDioService interface)
- [ ] Create `roopikDio/common/roopikDioTypes.ts` (Task, Message types)
- [ ] Create `roopikDio/common/roopikDioTools.ts` (MCP tool definitions)

### **Phase 3: Implement Services**

- [ ] Create `roopikDio/browser/roopikDioService.ts` (implementation)
- [ ] Create `roopikDio/browser/taskManager.ts` (task lifecycle)
- [ ] Create `roopikDio/browser/contextBuilder.ts` (canvas context)
- [ ] Create `roopikDio/node/taskPersistence.ts` (save/load tasks)

### **Phase 4: Register in Core**

- [ ] Create `roopikDio/browser/roopikDio.contribution.ts`
- [ ] Register singleton: `registerSingleton(IRoopikDioService, ...)`
- [ ] Import in `workbench.common.main.ts`

### **Phase 5: Enhance Roopik to Use Dio**

- [ ] Update `roopik/browser/canvasEditor.ts` to inject `IRoopikDioService`
- [ ] Add chat button click handler
- [ ] Pass selected component to dio service

### **Phase 6: Connect Dio Back to Roopik**

- [ ] In `roopikDioService.ts`, inject `IComponentService`
- [ ] When AI calls `create_component`, use `componentService.createComponent()`
- [ ] Listen to component events

---

## 🎨 Benefits of Separate Projects

### **1. Clean Separation of Concerns**
```
roopik/        → Design tools (canvas, browser, components)
roopikDio/     → AI agent (chat, tasks, context)
```

### **2. Independent Development**
- Team A works on canvas features
- Team B works on AI features
- No code conflicts

### **3. Clear Ownership**
```typescript
// Roopik owns:
- Canvas editor
- Component service
- Browser view
- File storage (.roopik/canvases/)

// Roopik-Dio owns:
- Chat UI
- Task management
- AI API calls
- Chat storage (.roopik/canvases/{canvasId}/dio/)
```

### **4. Easy Testing**
```typescript
// Test roopik in isolation
const mockDioService: IRoopikDioService = {
  openCanvasChat: jest.fn()
}

// Test roopikDio in isolation
const mockComponentService: IComponentService = {
  createComponent: jest.fn()
}
```

---

## 🚀 Migration Path from Extension

### **Current Extension Structure**
```
extensions/roopik-dio/
└── src/
    ├── core/task/Task.ts
    ├── core/webview/ClineProvider.ts
    ├── core/task-persistence/
    └── api/
```

### **New Core Structure**
```
src/vs/workbench/contrib/roopikDio/
├── common/
│   └── roopikDio.ts              ← Task types from extension
├── browser/
│   ├── roopikDioService.ts       ← ClineProvider logic
│   └── taskManager.ts            ← Task class
└── node/
    └── taskPersistence.ts        ← task-persistence logic
```

**Migration Steps**:
1. Copy core logic from extension to roopikDio project
2. Adapt to VSCode DI system
3. Replace extension IPC with service injection
4. Keep extension as thin wrapper (for now) or remove entirely

---

## ✅ Final Recommendation

**YES! Create roopik-dio as separate project in core!**

**Why**:
- ✅ Matches VSCode architecture patterns
- ✅ Clean separation (canvas ≠ AI)
- ✅ Full DI integration (no IPC overhead)
- ✅ Independent development
- ✅ Easy to test and maintain

**Project Structure**:
```
src/vs/workbench/contrib/
├── roopik/           ← Canvas, browser, components
└── roopikDio/        ← AI agent, chat, tasks
```

**Communication**: Via VSCode DI (service injection)

**Storage**: Both use `.roopik/` but different subfolders

**Next Step**: Start with Phase 1 - create folder structure! 🎉

---

**Last Updated**: 2024-12-21
**Decision**: Separate projects in core ✅
**Next**: Create `src/vs/workbench/contrib/roopikDio/` structure
